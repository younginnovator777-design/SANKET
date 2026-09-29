"""
SANKET Detection Engine: Common Evidence Schema and Normalization Utilities.
Defines structured evidence objects, severity mappings, and bounded score normalization.
"""
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional


def clamp_01(val: float) -> float:
    """Ensure a numeric score is strictly bounded in [0.0, 1.0]."""
    if val is None or val != val:  # Check None or NaN
        return 0.0
    if val < 0.0:
        return 0.0
    if val > 1.0:
        return 1.0
    return float(val)


def linear_scale(val: float, low: float, high: float) -> float:
    """
    Linearly scale a value from [low, high] to [0.0, 1.0].
    Returns 0.0 below low, 1.0 above high.
    """
    if val is None or val != val:
        return 0.0
    if high <= low:
        return 1.0 if val >= high else 0.0
    scaled = (float(val) - float(low)) / (float(high) - float(low))
    return clamp_01(scaled)


def calculate_severity(score: float, triggered: bool) -> str:
    """
    Map anomalous signal strength to a standardized severity level.
    Severity reflects the intensity of the detected pattern, NOT a criminal accusation.
    """
    if not triggered or score < 0.30:
        return "LOW" if triggered else "NONE"
    if score >= 0.70:
        return "HIGH"
    if score >= 0.45:
        return "MEDIUM"
    return "LOW"


@dataclass
class EvidenceItem:
    """Individual feature observation contributing to a detector signal."""
    feature: str
    value: float
    reason: str

    def to_dict(self) -> Dict[str, Any]:
        return {
            "feature": self.feature,
            "value": round(float(self.value), 6),
            "reason": self.reason,
        }


@dataclass
class DetectorResult:
    """Standardized output produced by all SANKET detectors."""
    detector_name: str
    score: float  # Bounded in [0.0, 1.0]
    triggered: bool
    evidence: List[EvidenceItem] = field(default_factory=list)
    severity: str = "NONE"
    feature_values: Dict[str, float] = field(default_factory=dict)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "detector_name": self.detector_name,
            "score": round(clamp_01(self.score), 4),
            "triggered": bool(self.triggered),
            "severity": self.severity,
            "evidence": [item.to_dict() for item in self.evidence],
            "feature_values": {k: round(float(v), 6) for k, v in self.feature_values.items()},
        }
