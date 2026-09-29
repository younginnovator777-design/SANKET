"""
SANKET Evaluation Harness: Test Suite
Validates label alignment, metric calculations, threshold sweeps, scenario matrices,
edge cases (empty data, missing classes), no-leakage guarantees, and feature audits.
"""
import copy
import math
import os
from typing import Any, Dict, List

import pytest

from src.detectors.pipeline import DetectionRecord
from evaluation.metrics import (
    calculate_binary_metrics,
    calculate_confusion_matrix,
    calculate_distribution_stats,
    calculate_pr_auc,
    calculate_roc_auc,
    format_metric,
)
from evaluation.detector_evaluation import (
    compute_score_distributions,
    evaluate_all_categories,
    evaluate_binary_detection,
    evaluate_threshold_sweep,
    validate_and_align_labels,
)
from evaluation.scenario_analysis import (
    build_scenario_matrix,
    compute_scenario_recalls,
    find_benign_high_scoring_patterns,
)
from evaluation.report import get_feature_count_audit_table


def _make_dummy_record(txid: str, **kwargs) -> DetectionRecord:
    rec = DetectionRecord(
        txid=txid,
        timestamp="2026-09-01T12:00:00Z",
        structural_score=kwargs.get("structural_score", 0.1),
        temporal_score=kwargs.get("temporal_score", 0.1),
        network_score=kwargs.get("network_score", 0.1),
        ml_anomaly_score=kwargs.get("ml_anomaly_score", 0.1),
        fan_in_triggered=kwargs.get("fan_in_triggered", False),
        fan_out_triggered=kwargs.get("fan_out_triggered", False),
        equal_output_triggered=kwargs.get("equal_output_triggered", False),
        peeling_like_triggered=kwargs.get("peeling_like_triggered", False),
        mixing_like_triggered=kwargs.get("mixing_like_triggered", False),
        temporal_burst_triggered=kwargs.get("temporal_burst_triggered", False),
        rapid_hop_triggered=kwargs.get("rapid_hop_triggered", False),
        baseline_deviation_triggered=kwargs.get("baseline_deviation_triggered", False),
        ip_reuse_triggered=kwargs.get("ip_reuse_triggered", False),
        network_cluster_triggered=kwargs.get("network_cluster_triggered", False),
        endpoint_recurrence_triggered=kwargs.get("endpoint_recurrence_triggered", False),
        isolation_forest_triggered=kwargs.get("isolation_forest_triggered", False),
    )
    return rec


# ──────────────────────────────────────────────────────────────────────
# 1. LABELS ALIGN TO TXIDS
# ──────────────────────────────────────────────────────────────────────
def test_labels_align_to_txids():
    """Ground truth labels must successfully align with detection records by txid."""
    records = [
        _make_dummy_record("tx_001", structural_score=0.8),
        _make_dummy_record("tx_002", structural_score=0.2),
    ]
    labels = {
        "tx_001": {"scenario": "fan_in", "is_benign": False},
        "tx_002": {"scenario": "benign", "is_benign": True},
    }
    report, aligned = validate_and_align_labels(records, labels)
    assert report.is_valid is True
    assert report.matched_count == 2
    assert len(aligned) == 2
    assert aligned[0][0].txid == "tx_001"
    assert aligned[0][1]["scenario"] == "fan_in"


# ──────────────────────────────────────────────────────────────────────
# 2. DUPLICATE LABELS / RECORD TXIDS ARE REJECTED
# ──────────────────────────────────────────────────────────────────────
def test_duplicate_records_rejected():
    """Duplicate txids in detection records must be flagged as alignment invalid."""
    records = [
        _make_dummy_record("tx_001"),
        _make_dummy_record("tx_001"),  # Duplicate
    ]
    labels = {
        "tx_001": {"scenario": "benign", "is_benign": True},
    }
    report, _ = validate_and_align_labels(records, labels)
    assert report.is_valid is False
    assert "tx_001" in report.duplicate_record_txids


# ──────────────────────────────────────────────────────────────────────
# 3. MISSING LABELS ARE DETECTED
# ──────────────────────────────────────────────────────────────────────
def test_missing_labels_detected():
    """Transactions without ground truth labels must be identified explicitly."""
    records = [
        _make_dummy_record("tx_001"),
        _make_dummy_record("tx_unlabeled"),
    ]
    labels = {
        "tx_001": {"scenario": "benign", "is_benign": True},
    }
    report, _ = validate_and_align_labels(records, labels)
    assert report.is_valid is False
    assert "tx_unlabeled" in report.missing_label_txids


# ──────────────────────────────────────────────────────────────────────
# 4. EVALUATION DOES NOT ALTER DETECTION RECORD
# ──────────────────────────────────────────────────────────────────────
def test_evaluation_does_not_alter_detection_record():
    """Evaluating metrics must not mutate DetectionRecord fields or dicts."""
    rec = _make_dummy_record("tx_001", structural_score=0.75, fan_in_triggered=True)
    orig_dict = rec.to_dict()
    labels = {"tx_001": {"scenario": "fan_in", "is_benign": False}}

    report, aligned = validate_and_align_labels([rec], labels)
    _ = evaluate_binary_detection(aligned)
    _ = evaluate_all_categories(aligned)

    assert rec.to_dict() == orig_dict


# ──────────────────────────────────────────────────────────────────────
# 5. LABELS NOT ACCESSIBLE FROM DETECTOR MODULES
# ──────────────────────────────────────────────────────────────────────
def test_labels_not_accessible_from_detector_modules():
    """Detector engine modules must never import or reference labels.csv."""
    import src.detectors.structural as s
    import src.detectors.temporal as t
    import src.detectors.network as n
    import src.detectors.anomaly as a
    import src.detectors.pipeline as p

    for mod in [s, t, n, a, p]:
        src_path = mod.__file__
        with open(src_path, "r", encoding="utf-8") as f:
            content = f.read()
        for line in content.splitlines():
            line_strip = line.strip()
            if line_strip.startswith("#"):
                continue
            assert "labels.csv" not in line, f"labels.csv reference found in {src_path}: {line}"
            assert "load_ground_truth_labels" not in line, f"loader referenced in {src_path}"


# ──────────────────────────────────────────────────────────────────────
# 6. BINARY PRECISION / RECALL / F1 CALCULATIONS
# ──────────────────────────────────────────────────────────────────────
def test_binary_metric_calculations():
    """Verify exact mathematical correctness of precision, recall, and F1."""
    # TP=2, FP=1, TN=2, FN=1
    y_true = [1, 1, 1, 0, 0, 0]
    y_pred = [1, 1, 0, 1, 0, 0]

    tp, fp, tn, fn = calculate_confusion_matrix(y_true, y_pred)
    assert tp == 2
    assert fp == 1
    assert tn == 2
    assert fn == 1

    m = calculate_binary_metrics(y_true, y_pred)
    assert m.precision == pytest.approx(2.0 / 3.0)
    assert m.recall == pytest.approx(2.0 / 3.0)
    assert m.f1 == pytest.approx(2.0 / 3.0)
    assert m.fpr == pytest.approx(1.0 / 3.0)
    assert m.accuracy == pytest.approx(4.0 / 6.0)


# ──────────────────────────────────────────────────────────────────────
# 7. THRESHOLD EVALUATION
# ──────────────────────────────────────────────────────────────────────
def test_threshold_evaluation_sweep():
    """Threshold sweep must evaluate correct binary decisions at each cutoff."""
    records = [
        _make_dummy_record("tx_1", structural_score=0.30),
        _make_dummy_record("tx_2", structural_score=0.60),
        _make_dummy_record("tx_3", structural_score=0.80),
    ]
    labels = {
        "tx_1": {"scenario": "benign", "is_benign": True},
        "tx_2": {"scenario": "fan_in", "is_benign": False},
        "tx_3": {"scenario": "peeling_like", "is_benign": False},
    }
    _, aligned = validate_and_align_labels(records, labels)

    sweep = evaluate_threshold_sweep(aligned, score_key="structural_score", thresholds=[0.25, 0.50, 0.75])
    assert len(sweep) == 3

    # At 0.25: all 3 predicted positive (tx_1 is FP, tx_2 and tx_3 are TP)
    at_25 = sweep[0]
    assert at_25["metrics"].tp == 2
    assert at_25["metrics"].fp == 1

    # At 0.50: tx_2 and tx_3 predicted positive, tx_1 negative (2 TP, 0 FP, 1 TN, 0 FN)
    at_50 = sweep[1]
    assert at_50["metrics"].tp == 2
    assert at_50["metrics"].fp == 0
    assert at_50["metrics"].precision == 1.0
    assert at_50["metrics"].recall == 1.0

    # At 0.75: only tx_3 predicted positive (1 TP, 1 FN)
    at_75 = sweep[2]
    assert at_75["metrics"].tp == 1
    assert at_75["metrics"].fn == 1


# ──────────────────────────────────────────────────────────────────────
# 8. SCENARIO-LEVEL RECALL
# ──────────────────────────────────────────────────────────────────────
def test_scenario_level_recall():
    """Scenario recall must measure detection sensitivity per scenario."""
    records = [
        _make_dummy_record("tx_1", structural_score=0.8),
        _make_dummy_record("tx_2", structural_score=0.2),
        _make_dummy_record("tx_3", temporal_score=0.9),
    ]
    labels = {
        "tx_1": {"scenario": "fan_in", "is_benign": False},
        "tx_2": {"scenario": "fan_in", "is_benign": False},
        "tx_3": {"scenario": "rapid_hop", "is_benign": False},
    }
    _, aligned = validate_and_align_labels(records, labels)

    recalls = compute_scenario_recalls(aligned, score_threshold=0.50)
    assert recalls["fan_in"].total_records == 2
    assert recalls["fan_in"].records_triggered == 1
    assert recalls["fan_in"].recall == pytest.approx(0.50)

    assert recalls["rapid_hop"].total_records == 1
    assert recalls["rapid_hop"].records_triggered == 1
    assert recalls["rapid_hop"].recall == pytest.approx(1.0)


# ──────────────────────────────────────────────────────────────────────
# 9. BENIGN FALSE-POSITIVE RATE
# ──────────────────────────────────────────────────────────────────────
def test_benign_false_positive_rate():
    """FPR on benign records must correctly count benign triggers divided by benign total."""
    records = [
        _make_dummy_record("b1", structural_score=0.1),
        _make_dummy_record("b2", structural_score=0.2),
        _make_dummy_record("b3", structural_score=0.6),  # False positive
        _make_dummy_record("b4", structural_score=0.1),
    ]
    labels = {
        f"b{i}": {"scenario": "benign", "is_benign": True} for i in range(1, 5)
    }
    _, aligned = validate_and_align_labels(records, labels)

    res = evaluate_binary_detection(aligned, score_key="structural_score", threshold=0.50)
    m = res["metrics"]
    assert m.tn == 3
    assert m.fp == 1
    assert m.fpr == pytest.approx(1.0 / 4.0)


# ──────────────────────────────────────────────────────────────────────
# 10. EMPTY EVALUATION DATASET
# ──────────────────────────────────────────────────────────────────────
def test_empty_evaluation_dataset():
    """Empty datasets must produce None/0 metrics rather than raising uncaught exceptions."""
    report, aligned = validate_and_align_labels([], {})
    assert report.is_valid is True
    assert report.matched_count == 0

    res = evaluate_binary_detection(aligned)
    m = res["metrics"]
    assert m.tp == 0
    assert m.precision is None
    assert m.recall is None
    assert res["roc_auc"] is None
    assert format_metric(m.f1) == "N/A"


# ──────────────────────────────────────────────────────────────────────
# 11. MISSING CLASS HANDLING (ALL NEGATIVE OR ALL POSITIVE)
# ──────────────────────────────────────────────────────────────────────
def test_missing_class_handling():
    """Single-class datasets must handle ROC-AUC/PR-AUC gracefully."""
    records = [
        _make_dummy_record("tx_1", structural_score=0.7),
        _make_dummy_record("tx_2", structural_score=0.8),
    ]
    # All positive (no negatives)
    labels = {
        "tx_1": {"scenario": "fan_in", "is_benign": False},
        "tx_2": {"scenario": "fan_in", "is_benign": False},
    }
    _, aligned = validate_and_align_labels(records, labels)

    res = evaluate_binary_detection(aligned, score_key="structural_score")
    assert res["roc_auc"] is None  # Undefined without negative class
    assert format_metric(res["roc_auc"]) == "N/A"
    assert res["metrics"].recall == 1.0


# ──────────────────────────────────────────────────────────────────────
# 12. DETERMINISTIC EVALUATION RESULTS
# ──────────────────────────────────────────────────────────────────────
def test_deterministic_evaluation_results():
    """Identical inputs must yield identical evaluation outputs."""
    records = [
        _make_dummy_record(f"tx_{i}", structural_score=i * 0.1) for i in range(10)
    ]
    labels = {
        f"tx_{i}": {"scenario": "benign" if i < 5 else "fan_in", "is_benign": i < 5}
        for i in range(10)
    }
    _, aligned1 = validate_and_align_labels(records, labels)
    _, aligned2 = validate_and_align_labels(records, labels)

    res1 = evaluate_binary_detection(aligned1, score_key="structural_score")
    res2 = evaluate_binary_detection(aligned2, score_key="structural_score")

    assert res1["roc_auc"] == res2["roc_auc"]
    assert res1["metrics"].to_dict() == res2["metrics"].to_dict()


# ──────────────────────────────────────────────────────────────────────
# 13. FEATURE-COUNT AUDIT
# ──────────────────────────────────────────────────────────────────────
def test_feature_count_audit():
    """Feature count audit table must accurately inspect FEATURE_REGISTRY."""
    rows, tot_reg, tot_num, tot_rule = get_feature_count_audit_table()
    assert tot_reg == 61
    assert tot_num == 61
    assert tot_rule == 30
    assert len(rows) == 6
    cat_names = {r["category"] for r in rows}
    assert cat_names == {"TRANSACTION", "TEMPORAL", "NETWORK", "ENTITY", "GRAPH", "DATA_QUALITY"}


# ──────────────────────────────────────────────────────────────────────
# 14. SCORE DISTRIBUTION CALCULATION
# ──────────────────────────────────────────────────────────────────────
def test_score_distribution_calculation():
    """Score distribution stats must calculate correct min, median, mean, and percentiles."""
    records = [
        _make_dummy_record("b1", structural_score=0.1),
        _make_dummy_record("b2", structural_score=0.2),
        _make_dummy_record("a1", structural_score=0.8),
        _make_dummy_record("a2", structural_score=0.9),
    ]
    labels = {
        "b1": {"scenario": "benign", "is_benign": True},
        "b2": {"scenario": "benign", "is_benign": True},
        "a1": {"scenario": "fan_in", "is_benign": False},
        "a2": {"scenario": "fan_in", "is_benign": False},
    }
    _, aligned = validate_and_align_labels(records, labels)

    dists = compute_score_distributions(aligned)
    b_stat = dists["structural_score"]["benign"]
    a_stat = dists["structural_score"]["anomalous"]

    assert b_stat["min"] == 0.1
    assert b_stat["max"] == 0.2
    assert b_stat["mean"] == pytest.approx(0.15)
    assert a_stat["min"] == 0.8
    assert a_stat["max"] == 0.9
    assert a_stat["mean"] == pytest.approx(0.85)

    assert dists["structural_score"]["mean_separation"] == pytest.approx(0.70)
