"""
SANKET Scoring Layer: Ranked Investigative Alerts Engine.
Transforms InvestigationObject instances into a prioritized, deterministically
ranked list of investigative alerts with granular tier filtering.
"""
from dataclasses import dataclass, field
from enum import Enum
from typing import Any, Dict, List, Optional, Sequence, Union

from src.detectors.evidence import clamp_01
from src.scoring.risk import (
    InvestigationObject,
    SCORING_SCHEMA_VERSION,
    THRESHOLD_CRITICAL,
    THRESHOLD_HIGH,
    THRESHOLD_MEDIUM,
)

# Priority Score Weights:
# Priority = 0.60 * risk_score + 0.20 * confidence_score + 0.10 * independent_signal_factor + 0.10 * evidence_strength
WEIGHT_PRIORITY_RISK: float = 0.60
WEIGHT_PRIORITY_CONFIDENCE: float = 0.20
WEIGHT_PRIORITY_INDEPENDENT_SIGNALS: float = 0.10
WEIGHT_PRIORITY_EVIDENCE_STRENGTH: float = 0.10


def compute_evidence_strength(evidence_items: Optional[Sequence[Dict[str, Any]]]) -> float:
    """
    Compute a deterministic normalized strength score [0.0, 1.0] for evidence items.

    If evidence_items is empty or None, returns 0.0.
    Otherwise, evaluates quantity (saturated at 4 items) and quality/severity:
        count_factor = min(1.0, len(items) / 4.0)
        avg_severity = mean severity weight across items (HIGH: 1.0, MEDIUM: 0.6, LOW: 0.3, default: 0.5)
        strength = 0.50 * count_factor + 0.50 * avg_severity
    """
    if not evidence_items:
        return 0.0

    n_items = len(evidence_items)
    count_factor = min(1.0, float(n_items) / 4.0)

    severity_map = {
        "CRITICAL": 1.0,
        "HIGH": 1.0,
        "MEDIUM": 0.6,
        "LOW": 0.3,
        "NONE": 0.0,
    }

    sev_scores: List[float] = []
    for item in evidence_items:
        s_val = item.get("severity") or item.get("level")
        if isinstance(s_val, str) and s_val.upper() in severity_map:
            sev_scores.append(severity_map[s_val.upper()])
        else:
            sev_scores.append(0.50)

    avg_sev = sum(sev_scores) / max(1, len(sev_scores))
    strength = 0.50 * count_factor + 0.50 * avg_sev
    return round(clamp_01(strength), 4)


def compute_priority_score(
    risk_score: float,
    confidence_score: float,
    independent_signal_count: int,
    evidence_items: Optional[Sequence[Dict[str, Any]]] = None,
    evidence_strength: Optional[float] = None,
) -> float:
    """
    Calculate deterministic priority score for ordering investigative alerts:
        Priority = 0.60 * risk_score + 0.20 * confidence_score + 0.10 * signal_factor + 0.10 * evidence_strength

    Parameters:
        risk_score: Analytical risk in [0, 1].
        confidence_score: Epistemic confidence in [0, 1].
        independent_signal_count: Number of independent categories triggered [0, 4].
        evidence_items: List of evidence item dictionaries.
        evidence_strength: Optional pre-computed evidence strength override.

    Returns:
        Priority score strictly clamped to [0.0, 1.0].
    """
    r = clamp_01(risk_score)
    c = clamp_01(confidence_score)
    sig_factor = clamp_01(float(max(0, independent_signal_count)) / 4.0)

    if evidence_strength is not None:
        ev_strength = clamp_01(evidence_strength)
    else:
        ev_strength = compute_evidence_strength(evidence_items)

    raw_priority = (
        WEIGHT_PRIORITY_RISK * r
        + WEIGHT_PRIORITY_CONFIDENCE * c
        + WEIGHT_PRIORITY_INDEPENDENT_SIGNALS * sig_factor
        + WEIGHT_PRIORITY_EVIDENCE_STRENGTH * ev_strength
    )
    return round(clamp_01(raw_priority), 4)


@dataclass
class Alert:
    """
    Investigative Alert object.
    Represents an actionable alert ranked by priority for investigator triage.
    """
    alert_id: str
    transaction_id: str
    rank: int
    risk_score: float
    confidence_score: float
    risk_level: str
    priority_score: float
    triggered_detectors: List[str] = field(default_factory=list)
    independent_signal_count: int = 0
    evidence_items: List[Dict[str, Any]] = field(default_factory=list)
    evidence_categories: List[str] = field(default_factory=list)
    component_scores: Dict[str, float] = field(default_factory=dict)
    scoring_version: str = SCORING_SCHEMA_VERSION
    investigation_object: Optional[InvestigationObject] = None

    def to_dict(self) -> Dict[str, Any]:
        """Serialize alert to a JSON-compatible dictionary."""
        return {
            "alert_id": self.alert_id,
            "transaction_id": self.transaction_id,
            "rank": int(self.rank),
            "risk_score": round(float(self.risk_score), 4),
            "confidence_score": round(float(self.confidence_score), 4),
            "risk_level": self.risk_level,
            "priority_score": round(float(self.priority_score), 4),
            "triggered_detectors": list(self.triggered_detectors),
            "independent_signal_count": int(self.independent_signal_count),
            "evidence_items": list(self.evidence_items),
            "evidence_categories": list(self.evidence_categories),
            "component_scores": {k: round(float(v), 4) for k, v in self.component_scores.items()},
            "scoring_version": self.scoring_version,
        }


def rank_investigations(
    investigations: Sequence[InvestigationObject],
) -> List[Alert]:
    """
    Convert a sequence of InvestigationObjects into a deterministically ranked list of Alerts.

    Ranking Criteria:
        1. priority_score descending
        2. risk_score descending (exact tie-breaker 1)
        3. confidence_score descending (exact tie-breaker 2)
        4. transaction_id ascending (exact tie-breaker 3)

    Ranks are assigned 1-indexed starting at 1.
    """
    if not investigations:
        return []

    scored_items: List[Tuple[float, float, float, str, int, InvestigationObject]] = []
    for idx, inv in enumerate(investigations):
        ev_strength = compute_evidence_strength(inv.evidence_items)
        p_score = compute_priority_score(
            risk_score=inv.risk_score,
            confidence_score=inv.confidence_score,
            independent_signal_count=inv.independent_signal_count,
            evidence_items=inv.evidence_items,
            evidence_strength=ev_strength,
        )
        scored_items.append((
            p_score,
            inv.risk_score,
            inv.confidence_score,
            inv.transaction_id,
            idx,
            inv,
        ))

    # Deterministic sort
    # (-priority_score, -risk_score, -confidence_score, transaction_id, idx)
    scored_items.sort(key=lambda x: (-x[0], -x[1], -x[2], x[3], x[4]))

    alerts: List[Alert] = []
    for rank, (p_score, r_score, c_score, txid, idx, inv) in enumerate(scored_items, start=1):
        alert_id = f"ALT_{txid[:16]}_{rank:04d}" if txid else f"ALT_UNKNOWN_{rank:04d}"
        alert = Alert(
            alert_id=alert_id,
            transaction_id=inv.transaction_id,
            rank=rank,
            risk_score=inv.risk_score,
            confidence_score=inv.confidence_score,
            risk_level=inv.risk_level,
            priority_score=p_score,
            triggered_detectors=list(inv.triggered_detectors),
            independent_signal_count=inv.independent_signal_count,
            evidence_items=list(inv.evidence_items),
            evidence_categories=list(inv.evidence_categories),
            component_scores=dict(inv.component_scores),
            scoring_version=inv.scoring_version,
            investigation_object=inv,
        )
        alerts.append(alert)

    return alerts


class AlertFilterTier(str, Enum):
    ALL = "ALL"
    MEDIUM_PLUS = "MEDIUM"
    HIGH_PLUS = "HIGH"
    CRITICAL_ONLY = "CRITICAL"


def filter_alerts(
    alerts: Sequence[Alert],
    min_level: Optional[Union[str, AlertFilterTier]] = None,
) -> List[Alert]:
    """
    Filter alerts by minimum risk tier without discarding underlying InvestigationObjects.

    Supported filter levels:
        - "ALL" (or None): Returns all alerts.
        - "MEDIUM" / "MEDIUM+": Returns MEDIUM, HIGH, and CRITICAL alerts (risk_score >= 0.40).
        - "HIGH" / "HIGH+": Returns HIGH and CRITICAL alerts (risk_score >= 0.60).
        - "CRITICAL": Returns CRITICAL alerts only (risk_score >= 0.80).
    """
    if not alerts:
        return []
    if min_level is None:
        return list(alerts)

    tier_str = str(min_level.value if isinstance(min_level, AlertFilterTier) else min_level).upper().rstrip("+")

    if tier_str in ("ALL", "ANY", ""):
        return list(alerts)
    if tier_str == "CRITICAL":
        return [a for a in alerts if a.risk_level == "CRITICAL"]
    if tier_str == "HIGH":
        return [a for a in alerts if a.risk_level in ("HIGH", "CRITICAL")]
    if tier_str == "MEDIUM":
        return [a for a in alerts if a.risk_level in ("MEDIUM", "HIGH", "CRITICAL")]
    if tier_str == "LOW":
        return list(alerts)

    raise ValueError(f"Unknown alert filter tier: {min_level}. Valid tiers: ALL, MEDIUM, HIGH, CRITICAL.")


def get_medium_plus_alerts(alerts: Sequence[Alert]) -> List[Alert]:
    """Convenience helper to retrieve MEDIUM, HIGH, and CRITICAL alerts."""
    return filter_alerts(alerts, min_level="MEDIUM")


def get_high_plus_alerts(alerts: Sequence[Alert]) -> List[Alert]:
    """Convenience helper to retrieve HIGH and CRITICAL alerts."""
    return filter_alerts(alerts, min_level="HIGH")


def get_critical_alerts(alerts: Sequence[Alert]) -> List[Alert]:
    """Convenience helper to retrieve CRITICAL alerts only."""
    return filter_alerts(alerts, min_level="CRITICAL")
