"""
SANKET Scoring & Evidence Fusion Layer: Cross-Detector Fusion Engine.
Harmonizes multi-attribute detector results, computes normalized components
(M, G, T, N), tracks cross-category evidence agreement, and generates unified
InvestigationObject representations.
"""
from typing import Any, Dict, List, Optional, Sequence, Set, Tuple, Union

from src.detectors.evidence import DetectorResult, EvidenceItem, clamp_01
from src.detectors.pipeline import DetectionRecord, DetectionPipelineResult
from src.scoring.risk import (
    InvestigationObject,
    calculate_risk_level,
    compute_confidence_score,
    compute_risk_score,
    SCORING_SCHEMA_VERSION,
)

# Standard Detector Category Mappings
CATEGORY_MULTIVARIATE: str = "MULTIVARIATE"
CATEGORY_STRUCTURAL: str = "STRUCTURAL"
CATEGORY_TEMPORAL: str = "TEMPORAL"
CATEGORY_NETWORK: str = "NETWORK"

DETECTOR_CATEGORIES: Dict[str, str] = {
    # Multivariate
    "isolation_forest": CATEGORY_MULTIVARIATE,
    # Graph / Structural
    "fan_in": CATEGORY_STRUCTURAL,
    "fan_out": CATEGORY_STRUCTURAL,
    "equal_output": CATEGORY_STRUCTURAL,
    "peeling_like": CATEGORY_STRUCTURAL,
    "mixing_like": CATEGORY_STRUCTURAL,
    # Temporal
    "temporal_burst": CATEGORY_TEMPORAL,
    "rapid_hop": CATEGORY_TEMPORAL,
    "baseline_deviation": CATEGORY_TEMPORAL,
    # Network
    "network_cluster": CATEGORY_NETWORK,
    "ip_reuse": CATEGORY_NETWORK,
    "endpoint_recurrence": CATEGORY_NETWORK,
}

ALL_CATEGORIES: List[str] = [
    CATEGORY_MULTIVARIATE,
    CATEGORY_STRUCTURAL,
    CATEGORY_TEMPORAL,
    CATEGORY_NETWORK,
]


def _combine_component_scores(scores: Sequence[float]) -> float:
    """
    Combine constituent detector scores for a single category.
    Avoids naive averaging. Uses top score reinforced by secondary signals:
        Score = s_(1) + (1.0 - s_(1)) * 0.25 * s_(2)

    An isolated weak signal remains weak, while multiple corroborating
    detectors within the category reinforce the component.
    """
    if not scores:
        return 0.0
    sorted_scores = sorted([clamp_01(s) for s in scores], reverse=True)
    top = sorted_scores[0]
    if len(sorted_scores) > 1 and top > 0.0:
        secondary = sorted_scores[1]
        reinforced = top + (1.0 - top) * 0.25 * secondary
        return clamp_01(reinforced)
    return top


class EvidenceFusionPipeline:
    """
    Orchestrates cross-detector evidence aggregation, component extraction,
    epistemic confidence modeling, and investigation object generation.
    """

    def __init__(self, scoring_version: str = SCORING_SCHEMA_VERSION):
        self.scoring_version = scoring_version

    def fuse_transaction(
        self,
        txid: str,
        detector_scores: Dict[str, float],
        triggered_detectors: Optional[List[str]] = None,
        evidence_dict: Optional[Dict[str, Any]] = None,
        feature_row: Optional[Dict[str, Any]] = None,
        detection_record: Optional[Union[DetectionRecord, Dict[str, Any]]] = None,
        graph_evidence: Optional[Dict[str, Any]] = None,
        graph: Optional[Any] = None,
    ) -> InvestigationObject:
        """
        Fuse detector outputs and observational evidence for a single transaction.

        Parameters:
            txid: Canonical transaction ID.
            detector_scores: Mapping of detector name to normalized float score [0, 1].
            triggered_detectors: Optional list of triggered detector names.
            evidence_dict: Optional mapping of detector name to list of EvidenceItem / dicts.
            feature_row: Optional feature dictionary from FeaturePipeline (for quality & graph signals).
            detection_record: Optional DetectionRecord instance with category scores.
            graph_evidence: Optional pre-computed graph evidence dictionary from GraphQueryEngine.
            graph: Optional GraphSnapshot instance to derive graph evidence on demand.

        Returns:
            Unified InvestigationObject.
        """
        # Resolve graph evidence on demand if graph snapshot is provided
        if graph_evidence is None and graph is not None:
            from src.graph.query import produce_graph_evidence
            graph_evidence = produce_graph_evidence(graph, txid)

        clean_scores: Dict[str, float] = {
            k: clamp_01(float(v or 0.0)) for k, v in detector_scores.items()
        }

        # ── 1. Determine Triggered Detectors & Category Grouping ─────────
        if triggered_detectors is not None:
            active_triggers = list(triggered_detectors)
        else:
            # Standard heuristic threshold is 0.50
            active_triggers = [
                d_name for d_name, sc in clean_scores.items() if sc >= 0.50
            ]

        # Group individual scores by category
        cat_scores_grouped: Dict[str, List[float]] = {cat: [] for cat in ALL_CATEGORIES}
        for det_name, sc in clean_scores.items():
            cat = DETECTOR_CATEGORIES.get(det_name)
            if cat in cat_scores_grouped:
                cat_scores_grouped[cat].append(sc)

        # ── 2. Derive Four Core Components (M, G, T, N) ───────────────────
        # M: Multivariate component (primarily Isolation Forest)
        if CATEGORY_MULTIVARIATE in cat_scores_grouped and cat_scores_grouped[CATEGORY_MULTIVARIATE]:
            m_comp = _combine_component_scores(cat_scores_grouped[CATEGORY_MULTIVARIATE])
        elif detection_record is not None:
            m_comp = clamp_01(getattr(detection_record, "ml_anomaly_score", 0.0))
        else:
            m_comp = clean_scores.get("isolation_forest", 0.0)

        # G: Graph / structural component
        # Base structural detector score (fan_in, fan_out, equal_output, peeling_like, mixing_like)
        if cat_scores_grouped[CATEGORY_STRUCTURAL]:
            g_det = _combine_component_scores(cat_scores_grouped[CATEGORY_STRUCTURAL])
        elif detection_record is not None:
            g_det = clamp_01(getattr(detection_record, "structural_score", 0.0))
        else:
            g_det = 0.0

        # Augment G with genuine graph evidence if present
        if graph_evidence:
            g_graph = clamp_01(float(graph_evidence.get("composite_graph_score", 0.0)))
            if g_graph > 0.0:
                if g_det > 0.0:
                    # Reinforce existing structural detector signals with graph topology
                    g_comp = clamp_01(g_det + (1.0 - g_det) * 0.30 * g_graph)
                else:
                    # Genuine graph evidence contributes structural risk component
                    g_comp = clamp_01(g_graph * 0.60)
            else:
                g_comp = g_det
        else:
            g_comp = g_det


        # T: Temporal component
        if cat_scores_grouped[CATEGORY_TEMPORAL]:
            t_comp = _combine_component_scores(cat_scores_grouped[CATEGORY_TEMPORAL])
        elif detection_record is not None:
            t_comp = clamp_01(getattr(detection_record, "temporal_score", 0.0))
        else:
            t_comp = 0.0

        # N: Network component
        if cat_scores_grouped[CATEGORY_NETWORK]:
            n_comp = _combine_component_scores(cat_scores_grouped[CATEGORY_NETWORK])
        elif detection_record is not None:
            n_comp = clamp_01(getattr(detection_record, "network_score", 0.0))
        else:
            n_comp = 0.0

        component_scores = {
            "M": round(m_comp, 4),
            "G": round(g_comp, 4),
            "T": round(t_comp, 4),
            "N": round(n_comp, 4),
        }

        # ── 3. Exact Risk Calculation ────────────────────────────────────
        # Risk = 0.45*M + 0.25*G + 0.20*T + 0.10*N
        risk_score = compute_risk_score(
            m_score=m_comp,
            g_score=g_comp,
            t_score=t_comp,
            n_score=n_comp,
        )
        risk_level = calculate_risk_level(risk_score)

        # ── 4. Evidence Items Extraction & Flattening ─────────────────────
        flattened_evidence: List[Dict[str, Any]] = []
        if evidence_dict:
            for det_name, ev_items in evidence_dict.items():
                if isinstance(ev_items, dict) and "evidence" in ev_items:
                    # Serialized DetectorResult dict
                    inner_items = ev_items.get("evidence") or []
                    for item in inner_items:
                        flattened_evidence.append(self._format_evidence_item(item, det_name))
                elif isinstance(ev_items, list):
                    for item in ev_items:
                        flattened_evidence.append(self._format_evidence_item(item, det_name))

        # Incorporate structured graph evidence items (without duplication)
        seen_graph_metrics: Set[str] = set()
        if graph_evidence and "evidence_items" in graph_evidence:
            for g_item in graph_evidence["evidence_items"]:
                feat_name = str(g_item.get("metric_name", "graph_topology"))
                if feat_name in seen_graph_metrics:
                    continue
                seen_graph_metrics.add(feat_name)
                flattened_evidence.append({
                    "detector": "graph_topology",
                    "category": CATEGORY_STRUCTURAL,
                    "feature": feat_name,
                    "value": g_item.get("metric_value", 0.0),
                    "normalized_score": g_item.get("normalized_score", 0.0),
                    "normalization": g_item.get("normalization", "none"),
                    "reason": g_item.get("reason", ""),
                    "is_heuristic_only": bool(g_item.get("is_heuristic_only", False)),
                    "is_established_ownership": bool(g_item.get("is_established_ownership", False)),
                    "supporting_nodes": list(g_item.get("supporting_nodes", [])),
                    "supporting_edges": list(g_item.get("supporting_edges", [])),
                    "supporting_txids": list(g_item.get("supporting_txids", [])),
                })


        # ── 5. Evidence Agreement Analysis (E) ───────────────────────────
        # Determine independent triggered categories
        categories_triggered_set: Set[str] = set()
        for det_name in active_triggers:
            cat = DETECTOR_CATEGORIES.get(det_name)
            if cat:
                categories_triggered_set.add(cat)

        # Also consider categories with elevated component score >= 0.50
        for cat_name, c_score in [("MULTIVARIATE", m_comp), ("STRUCTURAL", g_comp), ("TEMPORAL", t_comp), ("NETWORK", n_comp)]:
            if c_score >= 0.50:
                categories_triggered_set.add(cat_name)

        categories_triggered = sorted(list(categories_triggered_set))
        independent_signal_count = len(categories_triggered)
        cross_category_agreement = independent_signal_count >= 2

        # Evidence agreement factor E in [0, 1]
        # Scales with both category diversity and number of corroborating detectors
        if independent_signal_count == 0 and len(active_triggers) == 0:
            e_agreement = 0.0
        else:
            cat_ratio = float(independent_signal_count) / 4.0
            det_ratio = min(1.0, float(len(active_triggers)) / 3.0)
            e_agreement = clamp_01(0.70 * cat_ratio + 0.30 * det_ratio)

        # ── 6. Epistemic Confidence Factors (D, E, S, Gs, X) ─────────────
        # D: Data Completeness (fallback: 0.85 if features missing, 1.0 if full)
        data_quality_dict: Dict[str, float] = {}
        if feature_row:
            fc = float(feature_row.get("field_completeness") if feature_row.get("field_completeness") is not None else 1.0)
            tv = float(feature_row.get("timestamp_valid") if feature_row.get("timestamp_valid") is not None else 1.0)
            nm = float(feature_row.get("network_metadata_completeness") if feature_row.get("network_metadata_completeness") is not None else 1.0)
            ac = float(feature_row.get("amount_data_completeness") if feature_row.get("amount_data_completeness") is not None else 1.0)
            data_quality_dict = {
                "field_completeness": round(fc, 4),
                "timestamp_valid": round(tv, 4),
                "network_metadata_completeness": round(nm, 4),
                "amount_data_completeness": round(ac, 4),
            }
            d_completeness = 0.40 * fc + 0.20 * tv + 0.20 * nm + 0.20 * ac
        else:
            d_completeness = 0.85
            data_quality_dict = {"field_completeness": 0.85}

        # S: Statistical Stability (fallback: 0.50 on cold-start / missing history)
        if feature_row and "baseline_stability" in feature_row:
            s_stability = clamp_01(float(feature_row.get("baseline_stability") or 0.0))
        elif feature_row and "history_count" in feature_row:
            h_cnt = float(feature_row.get("history_count") or 0.0)
            s_stability = clamp_01(h_cnt / 5.0)
        else:
            s_stability = 0.50

        # Gs: Graph Support (reflects actual graph support when available, fallback otherwise)
        if graph_evidence and "graph_support_score" in graph_evidence:
            gs_support = clamp_01(float(graph_evidence["graph_support_score"]))
        elif feature_row:
            graph_keys = [
                "is_peeling_structure",
                "is_consolidation_structure",
                "is_dispersion_structure",
                "is_equal_split_structure",
                "bipartite_density",
            ]
            graph_vals = [float(feature_row.get(k) or 0.0) for k in graph_keys if k in feature_row]
            if graph_vals:
                gs_support = clamp_01(max(graph_vals))
            else:
                gs_support = clamp_01(g_comp)
        else:
            gs_support = clamp_01(g_comp) if g_comp > 0.0 else 0.50

        # X: Explanation Consistency
        # Verifies evidence items have coherent reasons and valid feature attribution
        if not active_triggers:
            x_consistency = 1.0  # Null baseline is consistently non-anomalous
        else:
            valid_reasons = sum(
                1 for it in flattened_evidence
                if str(it.get("reason", "")).strip() and (it.get("feature") or it.get("metric_name"))
            )
            total_items = max(1, len(flattened_evidence))
            x_consistency = clamp_01(float(valid_reasons) / float(total_items))

        confidence_components = {
            "D": round(d_completeness, 4),
            "E": round(e_agreement, 4),
            "S": round(s_stability, 4),
            "Gs": round(gs_support, 4),
            "X": round(x_consistency, 4),
        }

        # Confidence = 0.25*D + 0.30*E + 0.20*S + 0.15*Gs + 0.10*X
        confidence_score = compute_confidence_score(
            d_completeness=d_completeness,
            e_agreement=e_agreement,
            s_stability=s_stability,
            gs_support=gs_support,
            x_consistency=x_consistency,
        )

        return InvestigationObject(
            transaction_id=str(txid),
            risk_score=risk_score,
            confidence_score=confidence_score,
            risk_level=risk_level,
            triggered_detectors=sorted(active_triggers),
            detector_scores=clean_scores,
            evidence_items=flattened_evidence,
            evidence_categories=categories_triggered,
            independent_signal_count=independent_signal_count,
            data_quality=data_quality_dict,
            component_scores=component_scores,
            confidence_components=confidence_components,
            cross_category_agreement=cross_category_agreement,
            scoring_version=self.scoring_version,
            graph_evidence=graph_evidence,
        )

    @staticmethod
    def _format_evidence_item(item: Any, detector_name: str) -> Dict[str, Any]:
        """Normalize an evidence item into a consistent dictionary."""
        if hasattr(item, "to_dict"):
            d = item.to_dict()
        elif isinstance(item, dict):
            d = dict(item)
        else:
            d = {"feature": "unknown", "value": 0.0, "reason": str(item)}

        d["detector"] = detector_name
        d["category"] = DETECTOR_CATEGORIES.get(detector_name, "UNKNOWN")
        return d

    def fuse_pipeline_result(
        self,
        pipeline_result: DetectionPipelineResult,
        feature_rows: Optional[Sequence[Dict[str, Any]]] = None,
        graphs: Optional[Sequence[Optional[Any]]] = None,
        graph_evidence_list: Optional[Sequence[Optional[Dict[str, Any]]]] = None,
    ) -> List[InvestigationObject]:
        """
        Batch fusion across all transactions in a DetectionPipelineResult.

        Parameters:
            pipeline_result: DetectionPipelineResult containing records and evidence.
            feature_rows: Optional list of corresponding feature dictionaries.
            graphs: Optional list of GraphSnapshot instances corresponding to records.
            graph_evidence_list: Optional list of pre-computed graph evidence dictionaries.

        Returns:
            List of InvestigationObject instances aligned 1-to-1 with input records.
        """
        records = pipeline_result.records
        evidence_list = pipeline_result.evidence
        n = len(records)
        investigations: List[InvestigationObject] = []

        for i, rec in enumerate(records):
            ev_dict = evidence_list[i] if i < len(evidence_list) else None
            feat_row = feature_rows[i] if (feature_rows and i < len(feature_rows)) else None
            g_ev = graph_evidence_list[i] if (graph_evidence_list and i < len(graph_evidence_list)) else None
            g_snap = graphs[i] if (graphs and i < len(graphs)) else None

            # Reconstruct detector scores and triggers from DetectionRecord
            det_scores: Dict[str, float] = {
                "fan_in": 1.0 if rec.fan_in_triggered else 0.0,
                "fan_out": 1.0 if rec.fan_out_triggered else 0.0,
                "equal_output": 1.0 if rec.equal_output_triggered else 0.0,
                "peeling_like": 1.0 if rec.peeling_like_triggered else 0.0,
                "mixing_like": 1.0 if rec.mixing_like_triggered else 0.0,
                "temporal_burst": 1.0 if rec.temporal_burst_triggered else 0.0,
                "rapid_hop": 1.0 if rec.rapid_hop_triggered else 0.0,
                "baseline_deviation": 1.0 if rec.baseline_deviation_triggered else 0.0,
                "ip_reuse": 1.0 if rec.ip_reuse_triggered else 0.0,
                "network_cluster": 1.0 if rec.network_cluster_triggered else 0.0,
                "endpoint_recurrence": 1.0 if rec.endpoint_recurrence_triggered else 0.0,
                "isolation_forest": rec.ml_anomaly_score,
            }

            # If detailed evidence dictionary contains actual continuous detector scores, extract them
            if ev_dict:
                for d_name, d_val in ev_dict.items():
                    if isinstance(d_val, dict) and "score" in d_val:
                        det_scores[d_name] = float(d_val["score"])

            triggers: List[str] = []
            if rec.fan_in_triggered: triggers.append("fan_in")
            if rec.fan_out_triggered: triggers.append("fan_out")
            if rec.equal_output_triggered: triggers.append("equal_output")
            if rec.peeling_like_triggered: triggers.append("peeling_like")
            if rec.mixing_like_triggered: triggers.append("mixing_like")
            if rec.temporal_burst_triggered: triggers.append("temporal_burst")
            if rec.rapid_hop_triggered: triggers.append("rapid_hop")
            if rec.baseline_deviation_triggered: triggers.append("baseline_deviation")
            if rec.ip_reuse_triggered: triggers.append("ip_reuse")
            if rec.network_cluster_triggered: triggers.append("network_cluster")
            if rec.endpoint_recurrence_triggered: triggers.append("endpoint_recurrence")
            if rec.isolation_forest_triggered: triggers.append("isolation_forest")

            inv = self.fuse_transaction(
                txid=rec.txid,
                detector_scores=det_scores,
                triggered_detectors=triggers,
                evidence_dict=ev_dict,
                feature_row=feat_row,
                detection_record=rec,
                graph_evidence=g_ev,
                graph=g_snap,
            )
            investigations.append(inv)

        return investigations


def fuse_detection_evidence(
    txid: str,
    detector_scores: Dict[str, float],
    triggered_detectors: Optional[List[str]] = None,
    evidence_dict: Optional[Dict[str, Any]] = None,
    feature_row: Optional[Dict[str, Any]] = None,
    detection_record: Optional[Union[DetectionRecord, Dict[str, Any]]] = None,
    graph_evidence: Optional[Dict[str, Any]] = None,
    graph: Optional[Any] = None,
) -> InvestigationObject:
    """
    Convenience functional entry point for fusing evidence of a single transaction.
    """
    pipeline = EvidenceFusionPipeline()
    return pipeline.fuse_transaction(
        txid=txid,
        detector_scores=detector_scores,
        triggered_detectors=triggered_detectors,
        evidence_dict=evidence_dict,
        feature_row=feature_row,
        detection_record=detection_record,
        graph_evidence=graph_evidence,
        graph=graph,
    )

