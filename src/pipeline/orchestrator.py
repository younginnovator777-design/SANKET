"""
SANKET End-to-End Analysis Pipeline Orchestrator.
Coordinates canonical ingestion, feature extraction, multi-signal detection,
graph topology analysis, epistemic scoring fusion, and ranked investigative alerts.

Execution order:
A. Validate/canonicalize input
B. Extract features
C. Run detector pipeline
D. Build graph
E. Produce graph evidence
F. Fuse detector + graph evidence
G. Create InvestigationObjects
H. Rank Alerts
I. Produce final AnalysisResult
"""
from dataclasses import dataclass, field
from datetime import datetime, timezone
import hashlib
import os
import time
import tracemalloc
from typing import Any, Dict, Iterable, List, Optional, Sequence, Tuple, Union

from src.contract.models import CanonicalTransaction, QuarantineRecord
from src.detectors.pipeline import DetectionPipelineResult, DetectionRecord, DetectorPipeline
from src.features.pipeline import FEATURE_SCHEMA_VERSION, FeaturePipeline
from src.graph.builder import GraphBuilder
from src.graph.model import GraphSnapshot
from src.graph.query import GraphQueryEngine, produce_graph_evidence
from src.scoring.alerts import (
    Alert,
    compute_evidence_strength,
    compute_priority_score,
    filter_alerts,
    rank_investigations,
)

from src.scoring.fusion import EvidenceFusionPipeline
from src.scoring.risk import (
    InvestigationObject,
    SCORING_SCHEMA_VERSION,
    THRESHOLD_CRITICAL,
    THRESHOLD_HIGH,
    THRESHOLD_MEDIUM,
)

PIPELINE_VERSION: str = "sanket-pipeline-v1"
DETECTOR_SCHEMA_VERSION: str = "sanket-detectors-v1"


@dataclass
class PipelineConfig:
    """Configuration options for the end-to-end analysis pipeline."""
    temporal_window_seconds: float = 300.0
    graph_hop_count: int = 2
    max_coinput_clique_size: int = 20
    max_temporal_links_per_tx: int = 5
    iforest_n_estimators: int = 100
    iforest_random_state: int = 42
    detector_threshold: float = 0.50
    risk_threshold_critical: float = THRESHOLD_CRITICAL
    risk_threshold_high: float = THRESHOLD_HIGH
    risk_threshold_medium: float = THRESHOLD_MEDIUM
    alert_tier_filter: Optional[str] = None  # None (all), "MEDIUM+", "HIGH+", "CRITICAL"
    top_k_alerts: Optional[int] = None
    run_id: Optional[str] = None


@dataclass
class AnalysisResult:
    """
    Unified result object representing a complete end-to-end analysis run.
    Contains full audit trails, metadata, execution timings, and ranked alerts.
    """
    run_id: str
    pipeline_version: str
    record_count: int
    dataset_metadata: Dict[str, Any]
    feature_schema_version: str
    detector_versions: Dict[str, str]
    graph_summary: Dict[str, Any]
    investigation_objects: List[InvestigationObject]
    ranked_alerts: List[Alert]
    execution_timings: Dict[str, float]
    execution_metrics: Dict[str, Any]
    per_transaction_results: Dict[str, Dict[str, Any]]
    warnings: List[str] = field(default_factory=list)
    errors: List[str] = field(default_factory=list)
    rejected_records: List[Dict[str, Any]] = field(default_factory=list)

    def to_dict(self) -> Dict[str, Any]:
        """Serialize complete analysis result to a JSON-compatible dictionary."""
        return {
            "run_id": self.run_id,
            "pipeline_version": self.pipeline_version,
            "record_count": int(self.record_count),
            "dataset_metadata": dict(self.dataset_metadata),
            "feature_schema_version": self.feature_schema_version,
            "detector_versions": dict(self.detector_versions),
            "graph_summary": dict(self.graph_summary),
            "investigation_objects": [inv.to_dict() for inv in self.investigation_objects],
            "ranked_alerts": [a.to_dict() for a in self.ranked_alerts],
            "execution_timings": {k: round(float(v), 6) for k, v in self.execution_timings.items()},
            "execution_metrics": dict(self.execution_metrics),
            "per_transaction_results": {
                txid: dict(data) for txid, data in self.per_transaction_results.items()
            },
            "warnings": list(self.warnings),
            "errors": list(self.errors),
            "rejected_records": list(self.rejected_records),
        }


def _canonicalize_item(raw_item: Any) -> CanonicalTransaction:
    """Validate and coerce a single raw record into CanonicalTransaction."""
    if isinstance(raw_item, CanonicalTransaction):
        return raw_item

    if isinstance(raw_item, dict):
        d = dict(raw_item)
        # Parse timestamp string if needed
        ts = d.get("timestamp")
        if isinstance(ts, str):
            clean_ts = ts.strip().replace("Z", "+00:00")
            d["timestamp"] = datetime.fromisoformat(clean_ts)
        elif isinstance(ts, (int, float)):
            d["timestamp"] = datetime.fromtimestamp(float(ts), tz=timezone.utc)

        # Clean integer ports
        if "src_port" in d and d["src_port"] is not None:
            d["src_port"] = int(d["src_port"])
        if "dst_port" in d and d["dst_port"] is not None:
            d["dst_port"] = int(d["dst_port"])

        # Split pipe-separated string fields if coming from raw CSV
        for addr_fld in ("input_addresses", "output_addresses"):
            if isinstance(d.get(addr_fld), str):
                val_str = d[addr_fld].strip()
                d[addr_fld] = val_str.split("|") if val_str else []

        for amt_fld in ("input_amounts", "output_amounts"):
            if isinstance(d.get(amt_fld), str):
                val_str = d[amt_fld].strip()
                d[amt_fld] = [float(x) for x in val_str.split("|")] if val_str else []

        if "fee" in d and d["fee"] is not None:
            d["fee"] = float(d["fee"])

        if "source_batch_id" not in d or not d["source_batch_id"]:
            d["source_batch_id"] = "batch_canonical"

        if "event_id" not in d or not d["event_id"]:
            d["event_id"] = f"evt_{d.get('txid', 'unknown')}"

        return CanonicalTransaction(**d)

    raise TypeError(f"Unsupported record type: {type(raw_item)}")



def _load_raw_records(records_source: Any) -> Tuple[List[Any], List[Dict[str, Any]], Dict[str, Any]]:
    """
    Ingest raw input records from an iterable, filepath, or collection.
    Returns (raw_items, rejected_records, metadata).
    """
    raw_items: List[Any] = []
    rejected: List[Dict[str, Any]] = []
    meta: Dict[str, Any] = {"source_type": "in_memory"}

    if isinstance(records_source, str) and os.path.exists(records_source):
        meta["source_type"] = "file"
        meta["file_path"] = records_source
        ext = os.path.splitext(records_source)[1].lower()
        batch_id = f"batch_{int(time.time())}"

        if ext == ".csv":
            from src.ingest.csv import parse_csv_batch
            recs, q_recs, manifest = parse_csv_batch(records_source, batch_id=batch_id)
            raw_items.extend(recs)
            for q in q_recs:
                rejected.append({"raw_data": q.raw_data, "error": q.error_reason})
            meta["manifest"] = manifest.model_dump(mode="python") if hasattr(manifest, "model_dump") else manifest.__dict__
        elif ext == ".json":
            from src.ingest.json import parse_json_batch
            recs, q_recs, manifest = parse_json_batch(records_source, batch_id=batch_id)
            raw_items.extend(recs)
            for q in q_recs:
                rejected.append({"raw_data": q.raw_data, "error": q.error_reason})
            meta["manifest"] = manifest.model_dump(mode="python") if hasattr(manifest, "model_dump") else manifest.__dict__
        elif ext == ".xml":
            from src.ingest.xml import parse_xml_batch
            recs, q_recs, manifest = parse_xml_batch(records_source, batch_id=batch_id)
            raw_items.extend(recs)
            for q in q_recs:
                rejected.append({"raw_data": q.raw_data, "error": q.error_reason})
            meta["manifest"] = manifest.model_dump(mode="python") if hasattr(manifest, "model_dump") else manifest.__dict__
        else:
            raise ValueError(f"Unsupported file format: {ext}")
    elif isinstance(records_source, Iterable):
        raw_items = list(records_source)
    else:
        raise TypeError(f"Invalid records source: {type(records_source)}")

    return raw_items, rejected, meta


def run_analysis(
    records: Any,
    config: Optional[Union[PipelineConfig, Dict[str, Any]]] = None,
) -> AnalysisResult:
    """
    Execute the complete SANKET End-to-End Analysis Pipeline.

    Parameters:
        records: An iterable of CanonicalTransaction objects, dicts, or a file path string.
        config: Optional PipelineConfig object or dict of configuration parameters.

    Returns:
        AnalysisResult containing execution timings, graph metrics, investigation objects,
        and priority-ranked alerts.
    """
    tracemalloc.start()
    t_start_total = time.perf_counter()

    # Resolve configuration
    if config is None:
        cfg = PipelineConfig()
    elif isinstance(config, dict):
        cfg = PipelineConfig(**config)
    elif isinstance(config, PipelineConfig):
        cfg = config
    else:
        raise TypeError(f"Invalid config type: {type(config)}")

    timings: Dict[str, float] = {}
    warnings: List[str] = []
    errors: List[str] = []

    # ── Step A: Validate / Canonicalize Input ────────────────────────────────
    t_ingest_start = time.perf_counter()
    raw_items, rejected_records, dataset_metadata = _load_raw_records(records)

    canonical_records: List[CanonicalTransaction] = []
    for item in raw_items:
        try:
            canon = _canonicalize_item(item)
            canonical_records.append(canon)
        except Exception as exc:
            rejected_records.append({
                "raw_data": str(item)[:500],
                "error": str(exc),
            })
            warnings.append(f"Quarantined malformed record: {exc}")

    # Enforce strictly chronological sorting (stable sort by UTC timestamp, break ties by txid)
    def _record_sort_key(r: CanonicalTransaction) -> Tuple[float, str]:
        ts = r.timestamp.timestamp() if isinstance(r.timestamp, datetime) else 0.0
        return (ts, str(r.txid))

    canonical_records.sort(key=_record_sort_key)
    timings["ingestion_time"] = time.perf_counter() - t_ingest_start

    # Generate deterministic run_id from dataset content hash
    if cfg.run_id:
        run_id = str(cfg.run_id)
    else:
        hasher = hashlib.sha256()
        for r in canonical_records:
            ts_str = r.timestamp.isoformat() if isinstance(r.timestamp, datetime) else str(r.timestamp)
            hasher.update(f"{r.txid}:{ts_str}".encode("utf-8"))
        run_id = f"sanket_run_{hasher.hexdigest()[:16]}"

    record_count = len(canonical_records)

    # Short-circuit on empty dataset
    if record_count == 0:
        total_time = time.perf_counter() - t_start_total
        timings["feature_time"] = 0.0
        timings["detection_time"] = 0.0
        timings["graph_time"] = 0.0
        timings["scoring_time"] = 0.0
        timings["ranking_time"] = 0.0
        timings["total_time"] = total_time

        _, peak_mem = tracemalloc.get_traced_memory()
        tracemalloc.stop()

        return AnalysisResult(
            run_id=run_id,
            pipeline_version=PIPELINE_VERSION,
            record_count=0,
            dataset_metadata=dataset_metadata,
            feature_schema_version=FEATURE_SCHEMA_VERSION,
            detector_versions={"detectors": DETECTOR_SCHEMA_VERSION, "isolation_forest": "sanket-iforest-v1"},
            graph_summary={"node_count": 0, "edge_count": 0},
            investigation_objects=[],
            ranked_alerts=[],
            execution_timings=timings,
            execution_metrics={
                "records_per_second": 0.0,
                "peak_memory_mb": round(peak_mem / (1024 * 1024), 2),
                "accepted_records": 0,
                "rejected_records": len(rejected_records),
                "alerts_count": 0,
            },
            per_transaction_results={},
            warnings=warnings,
            errors=errors,
            rejected_records=rejected_records,
        )

    # ── Step B: Extract Features (Chronological Stream) ──────────────────────
    t_feat_start = time.perf_counter()
    feature_pipeline = FeaturePipeline()
    feature_rows = feature_pipeline.extract_features(canonical_records)
    timings["feature_time"] = time.perf_counter() - t_feat_start

    # ── Step C: Run Detector Pipeline ────────────────────────────────────────
    t_det_start = time.perf_counter()
    detector_pipeline = DetectorPipeline(
        iforest_n_estimators=cfg.iforest_n_estimators,
        iforest_random_state=cfg.iforest_random_state,
    )
    detection_result = detector_pipeline.run(feature_rows)
    timings["detection_time"] = time.perf_counter() - t_det_start

    # ── Step D: Build Graph Representation ───────────────────────────────────
    t_graph_start = time.perf_counter()
    graph_builder = GraphBuilder(
        temporal_window_seconds=cfg.temporal_window_seconds,
        max_temporal_links_per_tx=cfg.max_temporal_links_per_tx,
        max_coinput_clique_size=cfg.max_coinput_clique_size,
    )
    graph_snapshot = graph_builder.build_from_records(canonical_records)

    # ── Step E: Produce Graph Evidence ───────────────────────────────────────
    query_engine = GraphQueryEngine(graph_snapshot)
    graph_evidence_map: Dict[str, Dict[str, Any]] = {}
    for r in canonical_records:
        graph_evidence_map[r.txid] = query_engine.produce_graph_evidence(r.txid)
    timings["graph_time"] = time.perf_counter() - t_graph_start

    # ── Step F & G: Fuse Detector + Graph Evidence into InvestigationObjects ──
    t_scoring_start = time.perf_counter()
    fusion_pipeline = EvidenceFusionPipeline(scoring_version=SCORING_SCHEMA_VERSION)

    investigation_objects: List[InvestigationObject] = []
    feature_row_map: Dict[str, Dict[str, Any]] = {row["txid"]: row for row in feature_rows}

    for i, det_rec in enumerate(detection_result.records):
        txid = det_rec.txid
        ev_dict = detection_result.evidence[i] if i < len(detection_result.evidence) else None
        feat_row = feature_row_map.get(txid)
        g_ev = graph_evidence_map.get(txid)

        # Reconstruct continuous detector scores
        det_scores: Dict[str, float] = {
            "fan_in": 1.0 if det_rec.fan_in_triggered else 0.0,
            "fan_out": 1.0 if det_rec.fan_out_triggered else 0.0,
            "equal_output": 1.0 if det_rec.equal_output_triggered else 0.0,
            "peeling_like": 1.0 if det_rec.peeling_like_triggered else 0.0,
            "mixing_like": 1.0 if det_rec.mixing_like_triggered else 0.0,
            "temporal_burst": 1.0 if det_rec.temporal_burst_triggered else 0.0,
            "rapid_hop": 1.0 if det_rec.rapid_hop_triggered else 0.0,
            "baseline_deviation": 1.0 if det_rec.baseline_deviation_triggered else 0.0,
            "ip_reuse": 1.0 if det_rec.ip_reuse_triggered else 0.0,
            "network_cluster": 1.0 if det_rec.network_cluster_triggered else 0.0,
            "endpoint_recurrence": 1.0 if det_rec.endpoint_recurrence_triggered else 0.0,
            "isolation_forest": det_rec.ml_anomaly_score,
        }
        if ev_dict:
            for d_name, d_val in ev_dict.items():
                if isinstance(d_val, dict) and "score" in d_val:
                    det_scores[d_name] = float(d_val["score"])

        inv = fusion_pipeline.fuse_transaction(
            txid=txid,
            detector_scores=det_scores,
            evidence_dict=ev_dict,
            feature_row=feat_row,
            detection_record=det_rec,
            graph_evidence=g_ev,
        )
        investigation_objects.append(inv)
    timings["scoring_time"] = time.perf_counter() - t_scoring_start

    # ── Step H: Rank Alerts ───────────────────────────────────────────────────
    t_ranking_start = time.perf_counter()
    ranked_alerts = rank_investigations(investigation_objects)

    # Apply configuration filters if requested
    if cfg.alert_tier_filter:
        ranked_alerts = filter_alerts(ranked_alerts, min_level=cfg.alert_tier_filter)


    if cfg.top_k_alerts is not None and cfg.top_k_alerts > 0:
        ranked_alerts = ranked_alerts[:cfg.top_k_alerts]

    # Re-index ranks 1..N
    for new_rank, alert in enumerate(ranked_alerts, start=1):
        alert.rank = new_rank

    timings["ranking_time"] = time.perf_counter() - t_ranking_start

    # ── Step I: Produce Final AnalysisResult & Retain Audit Details ───────────
    total_time = time.perf_counter() - t_start_total
    timings["total_time"] = total_time

    # Assembly of per-transaction comprehensive audit trails
    alert_by_txid = {a.transaction_id: a for a in ranked_alerts}
    det_rec_by_txid = {r.txid: r for r in detection_result.records}
    ev_dict_by_txid = {
        detection_result.records[i].txid: detection_result.evidence[i]
        for i in range(len(detection_result.records))
        if i < len(detection_result.evidence)
    }

    per_tx_results: Dict[str, Dict[str, Any]] = {}
    for inv in investigation_objects:
        tx_id = inv.transaction_id
        alert_obj = alert_by_txid.get(tx_id)
        det_record = det_rec_by_txid.get(tx_id)

        per_tx_results[tx_id] = {
            "transaction_id": tx_id,
            "features": feature_row_map.get(tx_id),
            "detector_record": det_record.to_dict() if det_record else None,
            "detector_evidence": ev_dict_by_txid.get(tx_id),
            "graph_evidence": graph_evidence_map.get(tx_id),
            "investigation_object": inv.to_dict(),
            "alert": alert_obj.to_dict() if alert_obj else None,
        }

    _, peak_memory = tracemalloc.get_traced_memory()
    tracemalloc.stop()

    rec_per_sec = round(record_count / total_time, 2) if total_time > 0 else 0.0
    peak_mb = round(peak_memory / (1024 * 1024), 2)

    exec_metrics = {
        "records_per_second": rec_per_sec,
        "peak_memory_mb": peak_mb,
        "accepted_records": record_count,
        "rejected_records": len(rejected_records),
        "alerts_count": len(ranked_alerts),
    }

    graph_summary = {
        "node_count": graph_snapshot.node_count,
        "edge_count": graph_snapshot.edge_count,
    }

    detector_versions = {
        "detectors": DETECTOR_SCHEMA_VERSION,
        "isolation_forest": "sanket-iforest-v1",
    }

    return AnalysisResult(
        run_id=run_id,
        pipeline_version=PIPELINE_VERSION,
        record_count=record_count,
        dataset_metadata=dataset_metadata,
        feature_schema_version=FEATURE_SCHEMA_VERSION,
        detector_versions=detector_versions,
        graph_summary=graph_summary,
        investigation_objects=investigation_objects,
        ranked_alerts=ranked_alerts,
        execution_timings=timings,
        execution_metrics=exec_metrics,
        per_transaction_results=per_tx_results,
        warnings=warnings,
        errors=errors,
        rejected_records=rejected_records,
    )
