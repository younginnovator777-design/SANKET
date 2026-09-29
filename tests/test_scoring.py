"""
SANKET Task 5B Test Suite: Cross-Detector Evidence Fusion and Risk Scoring.
Verifies exact 4-component risk formula, 5-factor confidence formulation,
epistemic isolation, evidence agreement, determinism, and schema integrity.
"""
import pytest
from src.scoring.risk import (
    SCORING_SCHEMA_VERSION,
    THRESHOLD_CRITICAL,
    THRESHOLD_HIGH,
    THRESHOLD_MEDIUM,
    WEIGHT_GRAPH,
    WEIGHT_MULTIVARIATE,
    WEIGHT_NETWORK,
    WEIGHT_TEMPORAL,
    calculate_risk_level,
    compute_confidence_score,
    compute_risk_score,
    InvestigationObject,
)
from src.scoring.fusion import (
    DETECTOR_CATEGORIES,
    EvidenceFusionPipeline,
    fuse_detection_evidence,
)
from src.scoring.alerts import (
    Alert,
    AlertFilterTier,
    WEIGHT_PRIORITY_CONFIDENCE,
    WEIGHT_PRIORITY_EVIDENCE_STRENGTH,
    WEIGHT_PRIORITY_INDEPENDENT_SIGNALS,
    WEIGHT_PRIORITY_RISK,
    compute_evidence_strength,
    compute_priority_score,
    filter_alerts,
    get_critical_alerts,
    get_high_plus_alerts,
    get_medium_plus_alerts,
    rank_investigations,
)
from src.detectors.pipeline import DetectionRecord


# ─────────────────────────────────────────────────────────────────────────────
# 1. RISK FORMULA EXACTNESS
# ─────────────────────────────────────────────────────────────────────────────

def test_risk_formula_exactness():
    """1. Risk formula must evaluate exactly as: Risk = 0.45*M + 0.25*G + 0.20*T + 0.10*N."""
    # Test individual component unit contributions
    assert compute_risk_score(1.0, 0.0, 0.0, 0.0) == pytest.approx(0.45, abs=1e-4)
    assert compute_risk_score(0.0, 1.0, 0.0, 0.0) == pytest.approx(0.25, abs=1e-4)
    assert compute_risk_score(0.0, 0.0, 1.0, 0.0) == pytest.approx(0.20, abs=1e-4)
    assert compute_risk_score(0.0, 0.0, 0.0, 1.0) == pytest.approx(0.10, abs=1e-4)

    # Test full sum = 1.0
    assert compute_risk_score(1.0, 1.0, 1.0, 1.0) == 1.0

    # Test arbitrary multi-component linear combination:
    # 0.45*0.80 + 0.25*0.60 + 0.20*0.40 + 0.10*0.20 = 0.36 + 0.15 + 0.08 + 0.02 = 0.6100
    expected = 0.45 * 0.80 + 0.25 * 0.60 + 0.20 * 0.40 + 0.10 * 0.20
    assert compute_risk_score(0.80, 0.60, 0.40, 0.20) == pytest.approx(expected, abs=1e-4)


# ─────────────────────────────────────────────────────────────────────────────
# 2. SCORE ALWAYS IN [0, 1]
# ─────────────────────────────────────────────────────────────────────────────

def test_risk_score_always_in_zero_one():
    """2. Risk score must always be strictly bounded in [0.0, 1.0] across all extreme values."""
    assert compute_risk_score(-10.0, -5.0, -1.0, -0.5) == 0.0
    assert compute_risk_score(10.0, 50.0, 100.0, 2.0) == 1.0
    assert compute_risk_score(float("nan"), float("-inf"), 0.5, 0.5) == pytest.approx(0.15, abs=1e-4)
    assert compute_risk_score(0.0, 0.0, 0.0, 0.0) == 0.0


# ─────────────────────────────────────────────────────────────────────────────
# 3. CONFIDENCE ALWAYS IN [0, 1]
# ─────────────────────────────────────────────────────────────────────────────

def test_confidence_always_in_zero_one():
    """3. Confidence formula: 0.25*D + 0.30*E + 0.20*S + 0.15*Gs + 0.10*X strictly bounded in [0, 1]."""
    # Max confidence = 1.0
    assert compute_confidence_score(1.0, 1.0, 1.0, 1.0, 1.0) == 1.0
    # Min confidence = 0.0
    assert compute_confidence_score(0.0, 0.0, 0.0, 0.0, 0.0) == 0.0
    # Out-of-bounds inputs clamp safely
    assert compute_confidence_score(-1.0, -2.0, -5.0, -10.0, -0.5) == 0.0
    assert compute_confidence_score(5.0, 10.0, 20.0, 15.0, 8.0) == 1.0

    # Specific linear combination:
    # 0.25*1.0 + 0.30*0.5 + 0.20*0.8 + 0.15*0.6 + 0.10*1.0 = 0.25 + 0.15 + 0.16 + 0.09 + 0.10 = 0.75
    expected = 0.25 * 1.0 + 0.30 * 0.5 + 0.20 * 0.8 + 0.15 * 0.6 + 0.10 * 1.0
    assert compute_confidence_score(1.0, 0.5, 0.8, 0.6, 1.0) == pytest.approx(expected, abs=1e-4)


# ─────────────────────────────────────────────────────────────────────────────
# 4. CONFIDENCE DOES NOT ALTER RISK
# ─────────────────────────────────────────────────────────────────────────────

def test_confidence_does_not_alter_risk():
    """4. Confidence represents epistemic certainty and MUST NOT alter or multiply into Risk."""
    pipeline = EvidenceFusionPipeline()

    det_scores = {
        "isolation_forest": 0.70,
        "fan_in": 0.80,
        "temporal_burst": 0.50,
        "network_cluster": 0.0,
    }

    # Case A: Poor data quality & cold-start stability
    feat_low_conf = {
        "field_completeness": 0.10,
        "timestamp_valid": 0.0,
        "network_metadata_completeness": 0.10,
        "amount_data_completeness": 0.0,
        "baseline_stability": 0.0,
    }
    inv_low = pipeline.fuse_transaction("tx_test", det_scores, feature_row=feat_low_conf)

    # Case B: Perfect data quality & mature stability
    feat_high_conf = {
        "field_completeness": 1.0,
        "timestamp_valid": 1.0,
        "network_metadata_completeness": 1.0,
        "amount_data_completeness": 1.0,
        "baseline_stability": 1.0,
        "is_peeling_structure": 1.0,
    }
    inv_high = pipeline.fuse_transaction("tx_test", det_scores, feature_row=feat_high_conf)

    # Risk MUST be identical between both assessments
    assert inv_low.risk_score == inv_high.risk_score
    assert inv_low.risk_level == inv_high.risk_level

    # Confidence must reflect the differing epistemic certainty
    assert inv_low.confidence_score < inv_high.confidence_score
    assert inv_high.confidence_score > 0.70
    assert inv_low.confidence_score < 0.45


# ─────────────────────────────────────────────────────────────────────────────
# 5. ONE WEAK ISOLATED DETECTOR DOES NOT CREATE EXCESSIVE RISK
# ─────────────────────────────────────────────────────────────────────────────

def test_one_weak_isolated_detector_does_not_create_excessive_risk():
    """5. An isolated weak signal in one detector must not produce an alert or high risk."""
    pipeline = EvidenceFusionPipeline()

    # Isolated sub-threshold signal (e.g. peeling_like = 0.25)
    det_scores = {
        "peeling_like": 0.25,
        "fan_in": 0.0,
        "isolation_forest": 0.0,
        "temporal_burst": 0.0,
        "network_cluster": 0.0,
    }
    inv = pipeline.fuse_transaction("tx_weak", det_scores)

    # Risk contribution is 0.25 * 0.25 = 0.0625, well below 0.40 LOW boundary
    assert inv.risk_score < 0.15
    assert inv.risk_level == "LOW"
    assert len(inv.triggered_detectors) == 0

    # Even an isolated single detector at 0.55 produces max 0.25 * 0.55 = 0.1375
    det_scores_single = {"fan_out": 0.55}
    inv_single = pipeline.fuse_transaction("tx_single", det_scores_single)
    assert inv_single.risk_score < 0.20
    assert inv_single.risk_level == "LOW"


# ─────────────────────────────────────────────────────────────────────────────
# 6. MULTIPLE INDEPENDENT DETECTOR CATEGORIES INCREASE EVIDENCE AGREEMENT
# ─────────────────────────────────────────────────────────────────────────────

def test_multiple_independent_categories_increase_evidence_agreement():
    """6. Multiple independent detector categories agreeing must increase evidence agreement and confidence."""
    pipeline = EvidenceFusionPipeline()

    # Step 1: 1 category (Structural only)
    scores_1_cat = {"fan_in": 0.85}
    inv_1 = pipeline.fuse_transaction("tx1", scores_1_cat)

    # Step 2: 2 categories (Structural + Temporal)
    scores_2_cat = {"fan_in": 0.85, "temporal_burst": 0.80}
    inv_2 = pipeline.fuse_transaction("tx2", scores_2_cat)

    # Step 3: 3 categories (Structural + Temporal + Network)
    scores_3_cat = {"fan_in": 0.85, "temporal_burst": 0.80, "network_cluster": 0.75}
    inv_3 = pipeline.fuse_transaction("tx3", scores_3_cat)

    # Step 4: 4 categories (All categories including Multivariate)
    scores_4_cat = {"fan_in": 0.85, "temporal_burst": 0.80, "network_cluster": 0.75, "isolation_forest": 0.90}
    inv_4 = pipeline.fuse_transaction("tx4", scores_4_cat)

    # Independent signal count tracks active categories
    assert inv_1.independent_signal_count == 1
    assert inv_2.independent_signal_count == 2
    assert inv_3.independent_signal_count == 3
    assert inv_4.independent_signal_count == 4

    # Cross-category agreement flag
    assert inv_1.cross_category_agreement is False
    assert inv_2.cross_category_agreement is True
    assert inv_3.cross_category_agreement is True
    assert inv_4.cross_category_agreement is True

    # Evidence agreement factor E strictly increases
    e1 = inv_1.confidence_components["E"]
    e2 = inv_2.confidence_components["E"]
    e3 = inv_3.confidence_components["E"]
    e4 = inv_4.confidence_components["E"]
    assert e1 < e2 < e3 < e4
    assert e4 == 1.0

    # Risk score also monotonically increases as independent risks align
    assert inv_1.risk_score < inv_2.risk_score < inv_3.risk_score < inv_4.risk_score
    assert inv_4.risk_level == "CRITICAL"


# ─────────────────────────────────────────────────────────────────────────────
# 7. DETERMINISTIC OUTPUT
# ─────────────────────────────────────────────────────────────────────────────

def test_deterministic_output():
    """7. Repeated evaluation of identical transaction telemetry must return identical results."""
    pipeline_a = EvidenceFusionPipeline()
    pipeline_b = EvidenceFusionPipeline()

    det_scores = {
        "isolation_forest": 0.65,
        "fan_in": 0.75,
        "rapid_hop": 0.80,
        "ip_reuse": 0.40,
    }
    feat_row = {
        "field_completeness": 0.95,
        "timestamp_valid": 1.0,
        "network_metadata_completeness": 0.83,
        "amount_data_completeness": 1.0,
        "baseline_stability": 0.80,
    }

    res_a = pipeline_a.fuse_transaction("tx_det", det_scores, feature_row=feat_row)
    res_b = pipeline_b.fuse_transaction("tx_det", det_scores, feature_row=feat_row)

    assert res_a.to_dict() == res_b.to_dict()


# ─────────────────────────────────────────────────────────────────────────────
# 8. MISSING DETECTOR OUTPUT HANDLED SAFELY
# ─────────────────────────────────────────────────────────────────────────────

def test_missing_detector_output_handled_safely():
    """8. Missing, None, or empty detector dictionaries must not crash and default safely."""
    pipeline = EvidenceFusionPipeline()

    # Completely empty detector outputs
    inv_empty = pipeline.fuse_transaction("tx_empty", {})
    assert inv_empty.risk_score == 0.0
    assert inv_empty.risk_level == "LOW"
    assert inv_empty.triggered_detectors == []
    assert inv_empty.independent_signal_count == 0
    assert 0.0 <= inv_empty.confidence_score <= 1.0

    # Dict with None values
    inv_none = pipeline.fuse_transaction("tx_none", {"fan_in": None, "temporal_burst": None})
    assert inv_none.risk_score == 0.0
    assert inv_none.risk_level == "LOW"


# ─────────────────────────────────────────────────────────────────────────────
# 9. MISSING EVIDENCE HANDLED SAFELY
# ─────────────────────────────────────────────────────────────────────────────

def test_missing_evidence_handled_safely():
    """9. Missing, None, or unstructured evidence dictionaries must fall back safely."""
    pipeline = EvidenceFusionPipeline()

    det_scores = {"fan_in": 0.80}

    # None evidence
    inv_no_ev = pipeline.fuse_transaction("tx_no_ev", det_scores, evidence_dict=None)
    assert inv_no_ev.evidence_items == []
    assert 0.0 <= inv_no_ev.confidence_score <= 1.0

    # Malformed evidence items (strings instead of dicts)
    malformed_ev = {"fan_in": ["some reason string", 12345]}
    inv_malformed = pipeline.fuse_transaction("tx_mal", det_scores, evidence_dict=malformed_ev)
    assert len(inv_malformed.evidence_items) == 2
    assert inv_malformed.evidence_items[0]["detector"] == "fan_in"


# ─────────────────────────────────────────────────────────────────────────────
# 10. RISK LEVELS MAP CORRECTLY
# ─────────────────────────────────────────────────────────────────────────────

def test_risk_levels_map_correctly():
    """10. Risk levels must strictly map to thresholds: LOW <0.40, MEDIUM 0.40-<0.60, HIGH 0.60-<0.80, CRITICAL >=0.80."""
    assert calculate_risk_level(0.00) == "LOW"
    assert calculate_risk_level(0.25) == "LOW"
    assert calculate_risk_level(0.3999) == "LOW"
    assert calculate_risk_level(0.40) == "MEDIUM"
    assert calculate_risk_level(0.50) == "MEDIUM"
    assert calculate_risk_level(0.5999) == "MEDIUM"
    assert calculate_risk_level(0.60) == "HIGH"
    assert calculate_risk_level(0.70) == "HIGH"
    assert calculate_risk_level(0.7999) == "HIGH"
    assert calculate_risk_level(0.80) == "CRITICAL"
    assert calculate_risk_level(0.95) == "CRITICAL"
    assert calculate_risk_level(1.00) == "CRITICAL"


# ─────────────────────────────────────────────────────────────────────────────
# 11. SCORING VERSION IS PRESENT
# ─────────────────────────────────────────────────────────────────────────────

def test_scoring_version_is_present():
    """11. Scoring schema version must be present in object and serialized dictionary."""
    inv = fuse_detection_evidence("tx_version", {"fan_in": 0.50})
    assert inv.scoring_version == SCORING_SCHEMA_VERSION
    assert inv.to_dict()["scoring_version"] == "sanket-scoring-v1"


# ─────────────────────────────────────────────────────────────────────────────
# 12. NO FUTURE-DATA DEPENDENCE
# ─────────────────────────────────────────────────────────────────────────────

def test_no_future_data_dependence():
    """12. Fusing earlier transactions must be invariant to subsequent transactions."""
    pipeline = EvidenceFusionPipeline()

    tx_early_scores = {"fan_in": 0.70, "temporal_burst": 0.60}
    tx_late_scores = {"isolation_forest": 0.95, "mixing_like": 0.90}

    # Evaluate early transaction alone
    inv_early_alone = pipeline.fuse_transaction("tx_early", tx_early_scores)

    # Evaluate early transaction, then late transaction
    inv_early_paired = pipeline.fuse_transaction("tx_early", tx_early_scores)
    _ = pipeline.fuse_transaction("tx_late", tx_late_scores)

    assert inv_early_alone.to_dict() == inv_early_paired.to_dict()


# ─────────────────────────────────────────────────────────────────────────────
# 13. INVESTIGATION OBJECT SCHEMA COMPLETENESS
# ─────────────────────────────────────────────────────────────────────────────

def test_investigation_object_schema_completeness():
    """13. All required schema fields must be present and correctly typed in InvestigationObject."""
    rec = DetectionRecord(
        txid="tx_req_001",
        timestamp="2026-09-01T12:00:00Z",
        structural_score=0.80,
        temporal_score=0.60,
        network_score=0.0,
        ml_anomaly_score=0.75,
        fan_in_triggered=True,
        rapid_hop_triggered=True,
    )
    pipeline = EvidenceFusionPipeline()
    inv = pipeline.fuse_transaction(
        txid=rec.txid,
        detector_scores={"fan_in": 0.80, "rapid_hop": 0.60, "isolation_forest": 0.75},
        detection_record=rec,
    )
    d = inv.to_dict()

    required_fields = [
        "transaction_id",
        "risk_score",
        "confidence_score",
        "risk_level",
        "triggered_detectors",
        "detector_scores",
        "evidence_items",
        "evidence_categories",
        "independent_signal_count",
        "data_quality",
        "scoring_version",
    ]
    for rf in required_fields:
        assert rf in d, f"Missing required field in investigation object: {rf}"

    assert isinstance(d["transaction_id"], str)
    assert isinstance(d["risk_score"], float)
    assert isinstance(d["confidence_score"], float)
    assert isinstance(d["risk_level"], str)
    assert isinstance(d["triggered_detectors"], list)
    assert isinstance(d["detector_scores"], dict)
    assert isinstance(d["evidence_items"], list)
    assert isinstance(d["evidence_categories"], list)
    assert isinstance(d["independent_signal_count"], int)
    assert isinstance(d["data_quality"], dict)
    assert isinstance(d["scoring_version"], str)


# ─────────────────────────────────────────────────────────────────────────────
# PART C: TASK 5C — RANKED INVESTIGATIVE ALERTS TESTS
# ─────────────────────────────────────────────────────────────────────────────

def test_priority_formula_exactness():
    """14. Priority formula: 0.60*risk + 0.20*confidence + 0.10*signals + 0.10*evidence."""
    # Test isolated unit weights
    assert compute_priority_score(1.0, 0.0, 0, evidence_strength=0.0) == pytest.approx(0.60, abs=1e-4)
    assert compute_priority_score(0.0, 1.0, 0, evidence_strength=0.0) == pytest.approx(0.20, abs=1e-4)
    assert compute_priority_score(0.0, 0.0, 4, evidence_strength=0.0) == pytest.approx(0.10, abs=1e-4)
    assert compute_priority_score(0.0, 0.0, 0, evidence_strength=1.0) == pytest.approx(0.10, abs=1e-4)

    # Full sum = 1.0
    assert compute_priority_score(1.0, 1.0, 4, evidence_strength=1.0) == pytest.approx(1.00, abs=1e-4)

    # Exact multi-attribute combination:
    # 0.60*0.80 + 0.20*0.70 + 0.10*(2/4) + 0.10*0.50 = 0.48 + 0.14 + 0.05 + 0.05 = 0.7200
    expected = 0.60 * 0.80 + 0.20 * 0.70 + 0.10 * 0.50 + 0.10 * 0.50
    assert compute_priority_score(0.80, 0.70, 2, evidence_strength=0.50) == pytest.approx(expected, abs=1e-4)


def test_priority_bounded_zero_one():
    """15. Priority score must always be strictly clamped to [0.0, 1.0]."""
    assert compute_priority_score(-5.0, -10.0, -2, evidence_strength=-1.0) == 0.0
    assert compute_priority_score(10.0, 5.0, 100, evidence_strength=20.0) == 1.0
    assert compute_priority_score(0.0, 0.0, 0, evidence_strength=0.0) == 0.0


def test_highest_priority_receives_rank_1():
    """16. Alerts must be ordered strictly by priority_score descending, with rank 1 at the top."""
    pipeline = EvidenceFusionPipeline()

    inv_low = pipeline.fuse_transaction("tx_low", {"fan_in": 0.20})
    inv_mid = pipeline.fuse_transaction("tx_mid", {"fan_in": 0.70, "temporal_burst": 0.60})
    inv_high = pipeline.fuse_transaction("tx_high", {"isolation_forest": 0.95, "fan_in": 0.90, "rapid_hop": 0.85})

    alerts = rank_investigations([inv_low, inv_high, inv_mid])
    assert len(alerts) == 3

    assert alerts[0].transaction_id == "tx_high"
    assert alerts[0].rank == 1

    assert alerts[1].transaction_id == "tx_mid"
    assert alerts[1].rank == 2

    assert alerts[2].transaction_id == "tx_low"
    assert alerts[2].rank == 3

    assert alerts[0].priority_score >= alerts[1].priority_score >= alerts[2].priority_score


def test_deterministic_tie_breaking():
    """17. Exact priority ties must break deterministically: 1. risk desc, 2. confidence desc, 3. txid asc."""
    # Case 1: Same priority, different risk (impossible with strict linear formula unless components differ)
    # Construct exact tied investigation objects
    inv_a = InvestigationObject(
        transaction_id="tx_b_second",
        risk_score=0.75,
        confidence_score=0.60,
        risk_level="HIGH",
        independent_signal_count=2,
    )
    inv_b = InvestigationObject(
        transaction_id="tx_a_first",
        risk_score=0.75,
        confidence_score=0.60,
        risk_level="HIGH",
        independent_signal_count=2,
    )

    alerts = rank_investigations([inv_a, inv_b])
    assert len(alerts) == 2
    # Both have identical priority, risk, confidence. Tie-breaker 3: txid ascending -> "tx_a_first" < "tx_b_second"
    assert alerts[0].transaction_id == "tx_a_first"
    assert alerts[0].rank == 1
    assert alerts[1].transaction_id == "tx_b_second"
    assert alerts[1].rank == 2

    # Case 2: Same priority, differing risk
    # Construct two objects where priority matches but risk differs:
    # Say obj1 has risk 0.80, conf 0.20 -> 0.6*0.8 + 0.2*0.2 = 0.48 + 0.04 = 0.52
    # obj2 has risk 0.60, conf 0.80 -> 0.6*0.6 + 0.2*0.8 = 0.36 + 0.16 = 0.52
    inv_higher_risk = InvestigationObject(
        transaction_id="tx_hr",
        risk_score=0.80,
        confidence_score=0.20,
        risk_level="CRITICAL",
        independent_signal_count=0,
    )
    inv_lower_risk = InvestigationObject(
        transaction_id="tx_lr",
        risk_score=0.60,
        confidence_score=0.80,
        risk_level="HIGH",
        independent_signal_count=0,
    )
    alerts_risk_tie = rank_investigations([inv_lower_risk, inv_higher_risk])
    assert alerts_risk_tie[0].transaction_id == "tx_hr"
    assert alerts_risk_tie[0].rank == 1
    assert alerts_risk_tie[1].transaction_id == "tx_lr"
    assert alerts_risk_tie[1].rank == 2


def test_risk_is_not_modified_by_priority():
    """18. Priority calculation must never alter the underlying analytical risk_score."""
    pipeline = EvidenceFusionPipeline()
    inv = pipeline.fuse_transaction("tx_risk_test", {"fan_in": 0.85, "rapid_hop": 0.70})
    orig_risk = inv.risk_score

    alerts = rank_investigations([inv])
    assert alerts[0].risk_score == orig_risk
    assert alerts[0].risk_score == inv.risk_score


def test_confidence_is_not_modified_by_priority():
    """19. Priority calculation must never alter the underlying confidence_score."""
    pipeline = EvidenceFusionPipeline()
    inv = pipeline.fuse_transaction("tx_conf_test", {"fan_in": 0.85, "rapid_hop": 0.70})
    orig_conf = inv.confidence_score

    alerts = rank_investigations([inv])
    assert alerts[0].confidence_score == orig_conf
    assert alerts[0].confidence_score == inv.confidence_score


def test_independent_signal_factor_works_correctly():
    """20. Independent signal factor evaluates to count/4 and clamps safely."""
    # 0 -> 0.0, 1 -> 0.25, 2 -> 0.50, 3 -> 0.75, 4 -> 1.0
    p0 = compute_priority_score(0.0, 0.0, independent_signal_count=0, evidence_strength=0.0)
    p1 = compute_priority_score(0.0, 0.0, independent_signal_count=1, evidence_strength=0.0)
    p2 = compute_priority_score(0.0, 0.0, independent_signal_count=2, evidence_strength=0.0)
    p3 = compute_priority_score(0.0, 0.0, independent_signal_count=3, evidence_strength=0.0)
    p4 = compute_priority_score(0.0, 0.0, independent_signal_count=4, evidence_strength=0.0)

    assert p0 == 0.0
    assert p1 == pytest.approx(0.025, abs=1e-4)
    assert p2 == pytest.approx(0.050, abs=1e-4)
    assert p3 == pytest.approx(0.075, abs=1e-4)
    assert p4 == pytest.approx(0.100, abs=1e-4)


def test_evidence_strength_works_correctly():
    """21. Evidence strength must be 0.0 for empty/missing evidence and scale deterministically."""
    # Missing / empty
    assert compute_evidence_strength([]) == 0.0
    assert compute_evidence_strength(None) == 0.0

    # Low severity items
    low_item = [{"feature": "f1", "value": 1.0, "reason": "r", "severity": "LOW"}]
    # count_factor = 1/4 = 0.25, avg_sev = 0.30 -> 0.5*0.25 + 0.5*0.30 = 0.125 + 0.15 = 0.275
    s_low = compute_evidence_strength(low_item)
    assert 0.0 < s_low < 0.40

    # Multiple high severity items
    high_items = [
        {"feature": f"f{i}", "value": float(i), "reason": f"r{i}", "severity": "HIGH"}
        for i in range(4)
    ]
    # count_factor = 1.0, avg_sev = 1.0 -> 1.0
    assert compute_evidence_strength(high_items) == 1.0


def test_medium_plus_filtering():
    """22. Filter MEDIUM+ returns only MEDIUM, HIGH, and CRITICAL alerts (excludes LOW)."""
    inv_low = InvestigationObject("tx_l", 0.20, 0.5, "LOW")
    inv_med = InvestigationObject("tx_m", 0.50, 0.5, "MEDIUM")
    inv_high = InvestigationObject("tx_h", 0.70, 0.5, "HIGH")
    inv_crit = InvestigationObject("tx_c", 0.90, 0.5, "CRITICAL")

    alerts = rank_investigations([inv_low, inv_med, inv_high, inv_crit])
    med_plus = get_medium_plus_alerts(alerts)

    assert len(med_plus) == 3
    assert all(a.risk_level in ("MEDIUM", "HIGH", "CRITICAL") for a in med_plus)
    assert not any(a.risk_level == "LOW" for a in med_plus)


def test_high_plus_filtering():
    """23. Filter HIGH+ returns only HIGH and CRITICAL alerts (excludes LOW and MEDIUM)."""
    inv_low = InvestigationObject("tx_l", 0.20, 0.5, "LOW")
    inv_med = InvestigationObject("tx_m", 0.50, 0.5, "MEDIUM")
    inv_high = InvestigationObject("tx_h", 0.70, 0.5, "HIGH")
    inv_crit = InvestigationObject("tx_c", 0.90, 0.5, "CRITICAL")

    alerts = rank_investigations([inv_low, inv_med, inv_high, inv_crit])
    high_plus = get_high_plus_alerts(alerts)

    assert len(high_plus) == 2
    assert all(a.risk_level in ("HIGH", "CRITICAL") for a in high_plus)
    assert not any(a.risk_level in ("LOW", "MEDIUM") for a in high_plus)


def test_critical_filtering():
    """24. Filter CRITICAL returns only CRITICAL alerts."""
    inv_low = InvestigationObject("tx_l", 0.20, 0.5, "LOW")
    inv_med = InvestigationObject("tx_m", 0.50, 0.5, "MEDIUM")
    inv_high = InvestigationObject("tx_h", 0.70, 0.5, "HIGH")
    inv_crit = InvestigationObject("tx_c", 0.90, 0.5, "CRITICAL")

    alerts = rank_investigations([inv_low, inv_med, inv_high, inv_crit])
    crit_only = get_critical_alerts(alerts)

    assert len(crit_only) == 1
    assert crit_only[0].risk_level == "CRITICAL"
    assert crit_only[0].transaction_id == "tx_c"


def test_empty_alert_list_handled_safely():
    """25. Empty lists must be handled gracefully across ranking and filtering."""
    assert rank_investigations([]) == []
    assert filter_alerts([]) == []
    assert get_medium_plus_alerts([]) == []
    assert get_high_plus_alerts([]) == []
    assert get_critical_alerts([]) == []


def test_duplicate_transaction_ids_handled_deterministically():
    """26. Duplicate transaction IDs must not fail and must receive distinct ranks deterministically."""
    inv1 = InvestigationObject("tx_dup", 0.70, 0.80, "HIGH", independent_signal_count=2)
    inv2 = InvestigationObject("tx_dup", 0.70, 0.80, "HIGH", independent_signal_count=2)

    alerts = rank_investigations([inv1, inv2])
    assert len(alerts) == 2
    assert alerts[0].rank == 1
    assert alerts[1].rank == 2
    # Alert IDs should be distinct
    assert alerts[0].alert_id != alerts[1].alert_id


def test_alert_ids_deterministic():
    """27. Alert IDs must be deterministic and follow standard formatting."""
    inv = InvestigationObject("tx_ident_001", 0.85, 0.90, "CRITICAL")
    alerts1 = rank_investigations([inv])
    alerts2 = rank_investigations([inv])

    assert alerts1[0].alert_id == alerts2[0].alert_id
    assert alerts1[0].alert_id.startswith("ALT_tx_ident_001")


def test_scoring_version_preserved():
    """28. Scoring schema version must be preserved across InvestigationObject to Alert."""
    inv = InvestigationObject("tx_v", 0.60, 0.50, "HIGH", scoring_version=SCORING_SCHEMA_VERSION)
    alerts = rank_investigations([inv])
    assert alerts[0].scoring_version == SCORING_SCHEMA_VERSION
    assert alerts[0].to_dict()["scoring_version"] == "sanket-scoring-v1"


def test_original_evidence_preserved():
    """29. Original evidence items and underlying InvestigationObjects must be preserved."""
    sample_evidence = [
        {"feature": "fan_in_degree", "value": 15.0, "reason": "High fan-in convergence", "detector": "fan_in"},
        {"feature": "ip_reuse_count", "value": 8.0, "reason": "Repeated IP observations", "detector": "ip_reuse"},
    ]
    inv = InvestigationObject(
        transaction_id="tx_ev_pres",
        risk_score=0.85,
        confidence_score=0.90,
        risk_level="CRITICAL",
        evidence_items=sample_evidence,
    )
    alerts = rank_investigations([inv])
    assert alerts[0].evidence_items == sample_evidence
    assert alerts[0].investigation_object is inv


def test_repeated_execution_produces_identical_ordering():
    """30. Repeated execution on shuffled inputs produces identical ordering and ranks."""
    pipeline = EvidenceFusionPipeline()

    investigations = [
        pipeline.fuse_transaction(f"tx_{i:03d}", {
            "isolation_forest": (i * 17 % 100) / 100.0,
            "fan_in": (i * 23 % 100) / 100.0,
            "temporal_burst": (i * 31 % 100) / 100.0,
        })
        for i in range(25)
    ]

    ranked_run1 = rank_investigations(investigations)
    # Reverse input order
    ranked_run2 = rank_investigations(list(reversed(investigations)))

    order1 = [(a.rank, a.transaction_id, a.priority_score) for a in ranked_run1]
    order2 = [(a.rank, a.transaction_id, a.priority_score) for a in ranked_run2]

    assert order1 == order2


# ── Task 6.1: Graph Evidence Integration Tests ───────────────────────────────

def _make_graph_tx(
    txid: str,
    timestamp: str = "2026-09-01T12:00:00Z",
    input_addrs=None,
    output_addrs=None,
    in_amounts=None,
    out_amounts=None,
    src_ip: str = "192.168.1.100",
    asn: str = "AS15169",
    geo_country: str = "US",
    fee: float = 0.0001,
):
    from datetime import datetime, timezone
    from src.contract.models import CanonicalTransaction
    in_a = input_addrs if input_addrs is not None else ["addr_in_1"]
    out_a = output_addrs if output_addrs is not None else ["addr_out_1"]
    in_amt = in_amounts if in_amounts is not None else [1.0] * len(in_a)
    out_amt = out_amounts if out_amounts is not None else [0.9999] * len(out_a)

    return CanonicalTransaction(
        event_id=f"evt_{txid}",
        txid=txid,
        timestamp=datetime.fromisoformat(timestamp.replace("Z", "+00:00")),
        src_ip=src_ip,
        dst_ip="10.0.0.1",
        src_port=8333,
        dst_port=8333,
        input_addresses=in_a,
        output_addresses=out_a,
        input_amounts=in_amt,
        output_amounts=out_amt,
        fee=fee,
        asn=asn,
        geo_country=geo_country,
        source_batch_id="batch_001",
    )


def test_graph_evidence_increases_g_when_genuine_support_exists():
    """Task 6.1.1: Graph evidence increases G component when genuine graph support exists."""
    from src.graph.builder import build_graph_from_records
    from src.graph.query import produce_graph_evidence

    tx = _make_graph_tx(
        txid="tx_g_inc",
        input_addrs=["in_a", "in_b", "in_c"],
        output_addrs=["out_a", "out_b"],
    )
    snapshot = build_graph_from_records([tx])
    graph_ev = produce_graph_evidence(snapshot, "tx_g_inc")

    pipeline = EvidenceFusionPipeline()
    det_scores = {"isolation_forest": 0.50, "temporal_burst": 0.40, "fan_in": 0.30}

    # Baseline without graph evidence
    inv_base = pipeline.fuse_transaction("tx_g_inc", det_scores)
    # Augmented with graph evidence
    inv_graph = pipeline.fuse_transaction("tx_g_inc", det_scores, graph_evidence=graph_ev)

    assert inv_graph.component_scores["G"] > inv_base.component_scores["G"]
    assert inv_graph.risk_score > inv_base.risk_score
    assert inv_graph.graph_evidence is not None


def test_graph_evidence_is_bounded_01():
    """Task 6.1.2: Graph evidence and components remain strictly bounded in [0, 1]."""
    from src.graph.builder import build_graph_from_records
    from src.graph.query import produce_graph_evidence

    # Extreme fan-in transaction with 35 inputs
    inputs = [f"addr_huge_{i}" for i in range(35)]
    tx = _make_graph_tx(txid="tx_extreme", input_addrs=inputs)
    snapshot = build_graph_from_records([tx])
    graph_ev = produce_graph_evidence(snapshot, "tx_extreme")

    pipeline = EvidenceFusionPipeline()
    # High base scores
    det_scores = {"fan_in": 1.0, "isolation_forest": 1.0, "temporal_burst": 1.0, "network_cluster": 1.0}
    inv = pipeline.fuse_transaction("tx_extreme", det_scores, graph_evidence=graph_ev)

    assert 0.0 <= inv.component_scores["G"] <= 1.0
    assert 0.0 <= inv.confidence_components["Gs"] <= 1.0
    assert 0.0 <= inv.risk_score <= 1.0
    assert 0.0 <= inv.confidence_score <= 1.0


def test_graph_support_contributes_to_gs():
    """Task 6.1.3: Graph support score contributes directly to confidence factor Gs."""
    pipeline = EvidenceFusionPipeline()
    det_scores = {"isolation_forest": 0.50}

    # Graph evidence with high graph support score (0.85)
    graph_ev_high = {"graph_support_score": 0.85, "composite_graph_score": 0.80}
    inv_high = pipeline.fuse_transaction("tx_gs_high", det_scores, graph_evidence=graph_ev_high)

    # Graph evidence with low graph support score (0.20)
    graph_ev_low = {"graph_support_score": 0.20, "composite_graph_score": 0.10}
    inv_low = pipeline.fuse_transaction("tx_gs_low", det_scores, graph_evidence=graph_ev_low)

    assert inv_high.confidence_components["Gs"] == 0.85
    assert inv_low.confidence_components["Gs"] == 0.20
    assert inv_high.confidence_score > inv_low.confidence_score


def test_no_graph_evidence_uses_existing_fallback():
    """Task 6.1.4: When graph evidence is unavailable, Gs uses existing deterministic fallback."""
    pipeline = EvidenceFusionPipeline()
    det_scores = {"isolation_forest": 0.50}

    # Case A: No feature_row, no detector score -> fallback 0.50
    inv_no_feat = pipeline.fuse_transaction("tx_fall_1", det_scores, graph_evidence=None)
    assert inv_no_feat.confidence_components["Gs"] == 0.50

    # Case B: With feature_row containing structural flag
    feat_row = {"is_peeling_structure": 0.75}
    inv_with_feat = pipeline.fuse_transaction("tx_fall_2", det_scores, feature_row=feat_row, graph_evidence=None)
    assert inv_with_feat.confidence_components["Gs"] == 0.75


def test_candidate_entity_evidence_remains_heuristic():
    """Task 6.1.5: Candidate entity relationships must remain explicitly heuristic."""
    from src.graph.builder import build_graph_from_records
    from src.graph.query import produce_graph_evidence

    tx = _make_graph_tx(txid="tx_heur", input_addrs=["in_1", "in_2", "in_3"])
    snapshot = build_graph_from_records([tx])
    graph_ev = produce_graph_evidence(snapshot, "tx_heur")

    pipeline = EvidenceFusionPipeline()
    inv = pipeline.fuse_transaction("tx_heur", {"fan_in": 0.40}, graph_evidence=graph_ev)

    ci_items = [
        it for it in inv.evidence_items
        if it.get("feature") == "common_input_clustering" or it.get("metric_name") == "common_input_clustering"
    ]
    assert len(ci_items) == 1
    item = ci_items[0]

    # Explicit epistemic assertions
    assert item["is_heuristic_only"] is True
    assert item["is_established_ownership"] is False
    assert "these addresses belong to the same entity" not in item["reason"]
    assert "candidate relationship supported by" in item["reason"]


def test_graph_evidence_does_not_modify_m_t_n():
    """Task 6.1.6: Graph evidence strictly augments G; M, T, and N remain unchanged."""
    from src.graph.builder import build_graph_from_records
    from src.graph.query import produce_graph_evidence

    tx = _make_graph_tx(txid="tx_mtn", input_addrs=["in1", "in2"])
    snapshot = build_graph_from_records([tx])
    graph_ev = produce_graph_evidence(snapshot, "tx_mtn")

    pipeline = EvidenceFusionPipeline()
    det_scores = {
        "isolation_forest": 0.72,
        "temporal_burst": 0.55,
        "network_cluster": 0.43,
        "fan_in": 0.35,
    }

    inv_base = pipeline.fuse_transaction("tx_mtn", det_scores)
    inv_graph = pipeline.fuse_transaction("tx_mtn", det_scores, graph_evidence=graph_ev)

    # M, T, N must be identically preserved
    assert inv_graph.component_scores["M"] == inv_base.component_scores["M"]
    assert inv_graph.component_scores["T"] == inv_base.component_scores["T"]
    assert inv_graph.component_scores["N"] == inv_base.component_scores["N"]

    # Only G is augmented
    assert inv_graph.component_scores["G"] >= inv_base.component_scores["G"]


def test_risk_formula_remains_exact_with_graph_evidence():
    """Task 6.1.7: Risk formula remains exactly 0.45*M + 0.25*G + 0.20*T + 0.10*N."""
    pipeline = EvidenceFusionPipeline()
    det_scores = {"isolation_forest": 0.60, "temporal_burst": 0.50, "network_cluster": 0.40}
    graph_ev = {"composite_graph_score": 0.70, "graph_support_score": 0.75}

    inv = pipeline.fuse_transaction("tx_formula", det_scores, graph_evidence=graph_ev)

    m = inv.component_scores["M"]
    g = inv.component_scores["G"]
    t = inv.component_scores["T"]
    n = inv.component_scores["N"]

    expected_risk = round(0.45 * m + 0.25 * g + 0.20 * t + 0.10 * n, 4)
    assert inv.risk_score == expected_risk


def test_confidence_formula_remains_exactly_unchanged():
    """Task 6.1.8: Confidence formula remains exactly 0.25*D + 0.30*E + 0.20*S + 0.15*Gs + 0.10*X."""
    pipeline = EvidenceFusionPipeline()
    det_scores = {"isolation_forest": 0.80, "temporal_burst": 0.70}
    graph_ev = {"graph_support_score": 0.85, "composite_graph_score": 0.60}

    inv = pipeline.fuse_transaction("tx_conf", det_scores, graph_evidence=graph_ev)

    d = inv.confidence_components["D"]
    e = inv.confidence_components["E"]
    s = inv.confidence_components["S"]
    gs = inv.confidence_components["Gs"]
    x = inv.confidence_components["X"]

    expected_conf = round(0.25 * d + 0.30 * e + 0.20 * s + 0.15 * gs + 0.10 * x, 4)
    assert inv.confidence_score == expected_conf


def test_confidence_does_not_modify_risk():
    """Task 6.1.9: Confidence variation must never leak into or alter the risk score."""
    pipeline = EvidenceFusionPipeline()
    det_scores = {"isolation_forest": 0.60, "fan_in": 0.50}
    graph_ev = {"composite_graph_score": 0.70, "graph_support_score": 0.90}

    # High data completeness
    inv_high_conf = pipeline.fuse_transaction(
        "tx_epistemic",
        det_scores,
        feature_row={"field_completeness": 1.0, "timestamp_valid": 1.0, "baseline_stability": 1.0},
        graph_evidence=graph_ev,
    )

    # Poor data completeness
    inv_low_conf = pipeline.fuse_transaction(
        "tx_epistemic",
        det_scores,
        feature_row={"field_completeness": 0.2, "timestamp_valid": 0.2, "baseline_stability": 0.1},
        graph_evidence=graph_ev,
    )

    # Confidence differs drastically
    assert inv_high_conf.confidence_score > inv_low_conf.confidence_score
    # Risk is identical
    assert inv_high_conf.risk_score == inv_low_conf.risk_score


def test_deterministic_repeated_execution_with_graph():
    """Task 6.1.10: Repeated execution with graph evidence produces identical outputs."""
    from src.graph.builder import build_graph_from_records

    tx = _make_graph_tx(txid="tx_det_g", input_addrs=["a1", "a2"], output_addrs=["o1"])
    snapshot = build_graph_from_records([tx])

    pipeline = EvidenceFusionPipeline()
    det_scores = {"isolation_forest": 0.45, "fan_in": 0.30}

    inv1 = pipeline.fuse_transaction("tx_det_g", det_scores, graph=snapshot)
    inv2 = pipeline.fuse_transaction("tx_det_g", det_scores, graph=snapshot)

    assert inv1.to_dict() == inv2.to_dict()


def test_missing_graph_data_is_safe():
    """Task 6.1.11: Empty, None, or missing graph evidence safely falls back without crashing."""
    pipeline = EvidenceFusionPipeline()
    det_scores = {"fan_in": 0.50}

    # None graph_evidence
    inv1 = pipeline.fuse_transaction("tx_safe_1", det_scores, graph_evidence=None)
    assert inv1.risk_score > 0.0

    # Empty graph_evidence dict
    inv2 = pipeline.fuse_transaction("tx_safe_2", det_scores, graph_evidence={})
    assert inv2.risk_score > 0.0

    # Graph snapshot where txid does not exist
    from src.graph.model import GraphSnapshot
    inv3 = pipeline.fuse_transaction("tx_nonexistent", det_scores, graph=GraphSnapshot())
    assert inv3.risk_score > 0.0



