"""
SANKET Detection Engine.
Deterministic structural, temporal, and network detectors plus unsupervised Isolation Forest
anomaly detection. All outputs are investigative leads / anomalous patterns.
"""
from src.detectors.evidence import (
    DetectorResult,
    EvidenceItem,
    calculate_severity,
    clamp_01,
    linear_scale,
)
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
from src.detectors.anomaly import IsolationForestDetector, IsolationForestMetadata
from src.detectors.pipeline import DetectorPipeline, DetectionRecord, DetectionPipelineResult

__all__ = [
    # Evidence
    "DetectorResult",
    "EvidenceItem",
    "calculate_severity",
    "clamp_01",
    "linear_scale",
    # Structural
    "detect_fan_in",
    "detect_fan_out",
    "detect_equal_output",
    "detect_peeling_like",
    "detect_mixing_like",
    # Temporal
    "detect_temporal_burst",
    "detect_rapid_hop",
    "detect_baseline_deviation",
    # Network
    "detect_ip_reuse",
    "detect_network_cluster",
    "detect_endpoint_recurrence",
    # Anomaly / ML
    "IsolationForestDetector",
    "IsolationForestMetadata",
    # Pipeline
    "DetectorPipeline",
    "DetectionRecord",
    "DetectionPipelineResult",
]
