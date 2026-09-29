"""
SANKET Scoring & Evidence Fusion Layer: Risk and Confidence Formulations.
Implements the exact 4-component risk formula and 5-factor confidence model
without conflating confidence into risk.
"""
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional

from src.detectors.evidence import clamp_01

# Canonical scoring schema version
SCORING_SCHEMA_VERSION: str = "sanket-scoring-v1"

# Planned Risk Component Weights:
# Risk = 0.45*M + 0.25*G + 0.20*T + 0.10*N
WEIGHT_MULTIVARIATE: float = 0.45  # M: Isolation Forest / unsupervised ML
WEIGHT_GRAPH: float = 0.25         # G: Structural / graph topology detectors
WEIGHT_TEMPORAL: float = 0.20      # T: Temporal bursts, rapid hop, baseline deviation
WEIGHT_NETWORK: float = 0.10       # N: Network cluster, rolling IP and endpoint reuse

# Planned Confidence Factor Weights:
# Confidence = 0.25*D + 0.30*E + 0.20*S + 0.15*Gs + 0.10*X
CONF_WEIGHT_DATA_COMPLETENESS: float = 0.25      # D: Input telemetry & schema completeness
CONF_WEIGHT_EVIDENCE_AGREEMENT: float = 0.30     # E: Cross-detector and cross-category consensus
CONF_WEIGHT_STATISTICAL_STABILITY: float = 0.20  # S: Historical sample size & baseline stability
CONF_WEIGHT_GRAPH_SUPPORT: float = 0.15          # Gs: Graph topological confirmation
CONF_WEIGHT_EXPLANATION_CONSISTENCY: float = 0.10 # X: Structural coherency of evidence items

# Standard deterministic risk level classification thresholds
# LOW: < 0.40, MEDIUM: 0.40–<0.60, HIGH: 0.60–<0.80, CRITICAL: >= 0.80
THRESHOLD_CRITICAL: float = 0.80
THRESHOLD_HIGH: float = 0.60
THRESHOLD_MEDIUM: float = 0.40


def calculate_risk_level(risk_score: float) -> str:
    """
    Map a continuous risk score in [0.0, 1.0] to a standardized alert tier.

    Thresholds:
        CRITICAL : [0.80, 1.00]
        HIGH     : [0.60, 0.80)
        MEDIUM   : [0.40, 0.60)
        LOW      : [0.00, 0.40)
    """
    score = clamp_01(risk_score)
    if score >= THRESHOLD_CRITICAL:
        return "CRITICAL"
    if score >= THRESHOLD_HIGH:
        return "HIGH"
    if score >= THRESHOLD_MEDIUM:
        return "MEDIUM"
    return "LOW"


def compute_risk_score(
    m_score: float,
    g_score: float,
    t_score: float,
    n_score: float,
) -> float:
    """
    Compute overall transaction risk using the exact planned 4-component formula:
        Risk = 0.45*M + 0.25*G + 0.20*T + 0.10*N

    Parameters:
        m_score: Multivariate anomaly component (primarily Isolation Forest), in [0, 1].
        g_score: Graph/structural component (structural heuristics & graph topology), in [0, 1].
        t_score: Temporal component (burst, rapid-hop, baseline deviation), in [0, 1].
        n_score: Network component (rolling cluster, IP reuse, endpoint recurrence), in [0, 1].

    Returns:
        Risk score strictly clamped to [0.0, 1.0].
    """
    m = clamp_01(m_score)
    g = clamp_01(g_score)
    t = clamp_01(t_score)
    n = clamp_01(n_score)

    raw_risk = (
        WEIGHT_MULTIVARIATE * m
        + WEIGHT_GRAPH * g
        + WEIGHT_TEMPORAL * t
        + WEIGHT_NETWORK * n
    )
    return round(clamp_01(raw_risk), 4)


def compute_confidence_score(
    d_completeness: float,
    e_agreement: float,
    s_stability: float,
    gs_support: float,
    x_consistency: float,
) -> float:
    """
    Compute assessment confidence using the planned 5-factor formulation:
        Confidence = 0.25*D + 0.30*E + 0.20*S + 0.15*Gs + 0.10*X

    Parameters:
        d_completeness: Data completeness factor (presence & validity of telemetry fields).
        e_agreement: Evidence agreement factor (cross-detector & cross-category synergy).
        s_stability: Statistical stability factor (baseline history & sample maturity).
        gs_support: Graph support factor (structural topology confirmation).
        x_consistency: Explanation consistency factor (evidence coherency and completeness).

    CRITICAL INVARIANT:
        Confidence represents epistemic certainty and MUST NOT alter or multiply into Risk.

    Returns:
        Confidence score strictly clamped to [0.0, 1.0].
    """
    d = clamp_01(d_completeness)
    e = clamp_01(e_agreement)
    s = clamp_01(s_stability)
    gs = clamp_01(gs_support)
    x = clamp_01(x_consistency)

    raw_conf = (
        CONF_WEIGHT_DATA_COMPLETENESS * d
        + CONF_WEIGHT_EVIDENCE_AGREEMENT * e
        + CONF_WEIGHT_STATISTICAL_STABILITY * s
        + CONF_WEIGHT_GRAPH_SUPPORT * gs
        + CONF_WEIGHT_EXPLANATION_CONSISTENCY * x
    )
    return round(clamp_01(raw_conf), 4)


@dataclass
class InvestigationObject:
    """
    Unified investigation object for investigative triage and downstream alerting.
    Consolidates risk scoring, confidence modeling, cross-category evidence items,
    and detector provenance into an auditable, deterministic data structure.
    """
    transaction_id: str
    risk_score: float
    confidence_score: float
    risk_level: str
    triggered_detectors: List[str] = field(default_factory=list)
    detector_scores: Dict[str, float] = field(default_factory=dict)
    evidence_items: List[Dict[str, Any]] = field(default_factory=list)
    evidence_categories: List[str] = field(default_factory=list)
    independent_signal_count: int = 0
    data_quality: Dict[str, float] = field(default_factory=dict)
    component_scores: Dict[str, float] = field(default_factory=dict)
    confidence_components: Dict[str, float] = field(default_factory=dict)
    cross_category_agreement: bool = False
    scoring_version: str = SCORING_SCHEMA_VERSION
    graph_evidence: Optional[Dict[str, Any]] = None

    def to_dict(self) -> Dict[str, Any]:
        """Serialize investigation object to a clean, JSON-serializable dictionary."""
        d: Dict[str, Any] = {
            "transaction_id": self.transaction_id,
            "risk_score": round(float(self.risk_score), 4),
            "confidence_score": round(float(self.confidence_score), 4),
            "risk_level": self.risk_level,
            "triggered_detectors": list(self.triggered_detectors),
            "detector_scores": {k: round(float(v), 4) for k, v in self.detector_scores.items()},
            "evidence_items": list(self.evidence_items),
            "evidence_categories": list(self.evidence_categories),
            "independent_signal_count": int(self.independent_signal_count),
            "data_quality": {k: round(float(v), 4) for k, v in self.data_quality.items()},
            "component_scores": {k: round(float(v), 4) for k, v in self.component_scores.items()},
            "confidence_components": {k: round(float(v), 4) for k, v in self.confidence_components.items()},
            "cross_category_agreement": bool(self.cross_category_agreement),
            "scoring_version": self.scoring_version,
        }
        if self.graph_evidence is not None:
            d["graph_evidence"] = dict(self.graph_evidence)
        return d

