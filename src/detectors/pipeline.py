"""
SANKET Detection Engine: Detector Pipeline
Accepts canonical transaction data + feature DataFrame and runs all detectors,
producing one detection record per transaction plus underlying evidence objects.

Does NOT implement risk scoring, alert ranking, or API endpoints.
"""
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional, Sequence, Tuple

from src.detectors.evidence import DetectorResult, clamp_01
from src.detectors.structural import (
    detect_fan_in,
    detect_fan_out,
    detect_equal_output,
    detect_peeling_like,
    detect_mixing_like,
)
from src.detectors.temporal import (
    detect_temporal_burst,
    detect_rapid_hop,
    detect_baseline_deviation,
)
from src.detectors.network import (
    detect_ip_reuse,
    detect_network_cluster,
    detect_endpoint_recurrence,
)
from src.detectors.anomaly import IsolationForestDetector


@dataclass
class DetectionRecord:
    """
    One detection record per transaction.
    Contains aggregate category scores and per-detector trigger flags.
    """
    txid: str
    timestamp: str

    # Aggregate category scores (max of constituent detector scores)
    structural_score: float = 0.0
    temporal_score: float = 0.0
    network_score: float = 0.0
    ml_anomaly_score: float = 0.0

    # Per-detector trigger flags
    fan_in_triggered: bool = False
    fan_out_triggered: bool = False
    equal_output_triggered: bool = False
    peeling_like_triggered: bool = False
    mixing_like_triggered: bool = False
    temporal_burst_triggered: bool = False
    rapid_hop_triggered: bool = False
    baseline_deviation_triggered: bool = False
    ip_reuse_triggered: bool = False
    network_cluster_triggered: bool = False
    endpoint_recurrence_triggered: bool = False
    isolation_forest_triggered: bool = False

    def to_dict(self) -> Dict[str, Any]:
        return {
            "txid": self.txid,
            "timestamp": self.timestamp,
            "structural_score": round(self.structural_score, 4),
            "temporal_score": round(self.temporal_score, 4),
            "network_score": round(self.network_score, 4),
            "ml_anomaly_score": round(self.ml_anomaly_score, 4),
            "fan_in_triggered": self.fan_in_triggered,
            "fan_out_triggered": self.fan_out_triggered,
            "equal_output_triggered": self.equal_output_triggered,
            "peeling_like_triggered": self.peeling_like_triggered,
            "mixing_like_triggered": self.mixing_like_triggered,
            "temporal_burst_triggered": self.temporal_burst_triggered,
            "rapid_hop_triggered": self.rapid_hop_triggered,
            "baseline_deviation_triggered": self.baseline_deviation_triggered,
            "ip_reuse_triggered": self.ip_reuse_triggered,
            "network_cluster_triggered": self.network_cluster_triggered,
            "endpoint_recurrence_triggered": self.endpoint_recurrence_triggered,
            "isolation_forest_triggered": self.isolation_forest_triggered,
        }


@dataclass
class DetectionPipelineResult:
    """Full output of the detection pipeline."""
    records: List[DetectionRecord] = field(default_factory=list)
    evidence: List[Dict[str, List[Dict[str, Any]]]] = field(default_factory=list)
    isolation_forest_metadata: Optional[Dict[str, Any]] = None

    def to_dicts(self) -> List[Dict[str, Any]]:
        return [r.to_dict() for r in self.records]


class DetectorPipeline:
    """
    SANKET Detection Pipeline.

    Accepts feature rows (list of dicts from FeaturePipeline.extract_features)
    and applies all structural, temporal, network, and ML detectors.

    Returns one DetectionRecord per transaction plus separate evidence objects.
    """

    def __init__(
        self,
        iforest_n_estimators: int = 100,
        iforest_random_state: int = 42,
    ):
        self.iforest = IsolationForestDetector(
            n_estimators=iforest_n_estimators,
            random_state=iforest_random_state,
        )

    def run(self, feature_rows: Sequence[Dict[str, Any]]) -> DetectionPipelineResult:
        """
        Execute all detectors on the feature rows.

        Parameters:
            feature_rows: List of feature dictionaries from FeaturePipeline.extract_features().

        Returns:
            DetectionPipelineResult with records and evidence.
        """
        if not feature_rows:
            return DetectionPipelineResult()

        rows = list(feature_rows)
        n = len(rows)

        # ── 1. Run deterministic detectors per row ───────────────────────
        all_structural: List[List[DetectorResult]] = []
        all_temporal: List[List[DetectorResult]] = []
        all_network: List[List[DetectorResult]] = []

        for row in rows:
            # Structural detectors
            struct_results = [
                detect_fan_in(row),
                detect_fan_out(row),
                detect_equal_output(row),
                detect_peeling_like(row),
                detect_mixing_like(row),
            ]
            all_structural.append(struct_results)

            # Temporal detectors
            temp_results = [
                detect_temporal_burst(row),
                detect_rapid_hop(row),
                detect_baseline_deviation(row),
            ]
            all_temporal.append(temp_results)

            # Network detectors
            net_results = [
                detect_ip_reuse(row),
                detect_network_cluster(row),
                detect_endpoint_recurrence(row),
            ]
            all_network.append(net_results)

        # ── 2. Run Isolation Forest (batch) ──────────────────────────────
        self.iforest.fit(rows)
        iforest_results = self.iforest.predict(rows)

        # ── 3. Assemble DetectionRecords ─────────────────────────────────
        records: List[DetectionRecord] = []
        evidence_per_tx: List[Dict[str, List[Dict[str, Any]]]] = []

        for i, row in enumerate(rows):
            txid = str(row.get("txid") or "")
            timestamp = str(row.get("timestamp") or "")

            struct = all_structural[i]
            temp = all_temporal[i]
            net = all_network[i]
            ml = iforest_results[i]

            # Category scores: maximum of constituent detectors
            structural_score = clamp_01(max(r.score for r in struct)) if struct else 0.0
            temporal_score = clamp_01(max(r.score for r in temp)) if temp else 0.0
            network_score = clamp_01(max(r.score for r in net)) if net else 0.0
            ml_anomaly_score = clamp_01(ml.score)

            rec = DetectionRecord(
                txid=txid,
                timestamp=timestamp,
                structural_score=structural_score,
                temporal_score=temporal_score,
                network_score=network_score,
                ml_anomaly_score=ml_anomaly_score,
                fan_in_triggered=struct[0].triggered,
                fan_out_triggered=struct[1].triggered,
                equal_output_triggered=struct[2].triggered,
                peeling_like_triggered=struct[3].triggered,
                mixing_like_triggered=struct[4].triggered,
                temporal_burst_triggered=temp[0].triggered,
                rapid_hop_triggered=temp[1].triggered,
                baseline_deviation_triggered=temp[2].triggered,
                ip_reuse_triggered=net[0].triggered,
                network_cluster_triggered=net[1].triggered,
                endpoint_recurrence_triggered=net[2].triggered,
                isolation_forest_triggered=ml.triggered,
            )
            records.append(rec)

            # Collect per-detector evidence for this transaction
            tx_evidence: Dict[str, List[Dict[str, Any]]] = {}
            for det_result in struct + temp + net + [ml]:
                tx_evidence[det_result.detector_name] = det_result.to_dict()
            evidence_per_tx.append(tx_evidence)

        return DetectionPipelineResult(
            records=records,
            evidence=evidence_per_tx,
            isolation_forest_metadata=self.iforest.metadata.to_dict() if self.iforest.metadata else None,
        )
