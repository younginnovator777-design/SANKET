"""
SANKET Evaluation Harness: Detector Evaluation Core
Aligns ground-truth labels with DetectionRecord outputs by txid,
evaluates binary and category-level detection performance, runs threshold sweeps,
and computes score separation distributions.
"""
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional, Sequence, Set, Tuple

from src.detectors.pipeline import DetectionRecord
from evaluation.metrics import (
    BinaryMetrics,
    calculate_binary_metrics,
    calculate_distribution_stats,
    calculate_pr_auc,
    calculate_roc_auc,
)


@dataclass
class AlignmentReport:
    """Validation report for txid alignment between records and labels."""
    is_valid: bool
    total_records: int
    total_labels: int
    matched_count: int
    duplicate_record_txids: List[str] = field(default_factory=list)
    missing_label_txids: List[str] = field(default_factory=list)
    extra_label_txids: List[str] = field(default_factory=list)
    feature_leakage_detected: bool = False
    leakage_details: List[str] = field(default_factory=list)
    error_summary: str = ""


def validate_and_align_labels(
    records: Sequence[Any],
    labels: Dict[str, Dict[str, Any]],
) -> Tuple[AlignmentReport, List[Tuple[Any, Dict[str, Any]]]]:
    """
    Validate alignment between detection records and ground-truth labels by txid.
    Ensures:
      - No duplicate txids among evaluated records
      - Every evaluated record exists in ground truth labels
      - No label information leaked into detection record attributes
    Returns AlignmentReport and aligned list of (record, label_dict) pairs.
    """
    record_txids = []
    seen_txids: Set[str] = set()
    dup_txids: Set[str] = set()

    for r in records:
        txid = r.txid if hasattr(r, "txid") else r.get("txid")
        if txid in seen_txids:
            dup_txids.add(txid)
        else:
            seen_txids.add(txid)
        record_txids.append(txid)

    missing_labels = [tx for tx in seen_txids if tx not in labels]
    extra_labels = [tx for tx in labels if tx not in seen_txids]

    # Check for accidental label leakage in record fields
    forbidden_keys = {"scenario", "is_benign", "scenario_instance_id", "parent_txid"}
    leaked: List[str] = []
    if records:
        first_r = records[0]
        rec_keys = set(dir(first_r)) if hasattr(first_r, "__dict__") else set(first_r.keys())
        found_leaks = forbidden_keys.intersection(rec_keys)
        if found_leaks:
            leaked.extend(list(found_leaks))

    is_valid = (
        len(dup_txids) == 0
        and len(missing_labels) == 0
        and len(leaked) == 0
    )

    errors = []
    if dup_txids:
        errors.append(f"Found {len(dup_txids)} duplicate txids in detection records.")
    if missing_labels:
        errors.append(f"Found {len(missing_labels)} records without matching ground-truth labels.")
    if leaked:
        errors.append(f"Label leakage detected in DetectionRecord attributes: {leaked}")

    report = AlignmentReport(
        is_valid=is_valid,
        total_records=len(records),
        total_labels=len(labels),
        matched_count=len(seen_txids) - len(missing_labels),
        duplicate_record_txids=list(dup_txids),
        missing_label_txids=missing_labels,
        extra_label_txids=extra_labels,
        feature_leakage_detected=len(leaked) > 0,
        leakage_details=leaked,
        error_summary="; ".join(errors) if errors else "Alignment perfect and verified.",
    )

    aligned: List[Tuple[Any, Dict[str, Any]]] = []
    for r in records:
        txid = r.txid if hasattr(r, "txid") else r.get("txid")
        if txid in labels:
            aligned.append((r, labels[txid]))

    return report, aligned


def _get_record_score(record: Any, score_key: str) -> float:
    """Safely extract score from DetectionRecord dataclass or dictionary."""
    if hasattr(record, score_key):
        return float(getattr(record, score_key, 0.0) or 0.0)
    if isinstance(record, dict):
        return float(record.get(score_key, 0.0) or 0.0)
    return 0.0


def _get_record_flag(record: Any, flag_key: str) -> bool:
    """Safely extract boolean trigger flag from DetectionRecord dataclass or dictionary."""
    if hasattr(record, flag_key):
        return bool(getattr(record, flag_key, False))
    if isinstance(record, dict):
        return bool(record.get(flag_key, False))
    return False


def evaluate_binary_detection(
    aligned_pairs: Sequence[Tuple[Any, Dict[str, Any]]],
    score_key: str = "max_category_score",
    threshold: float = 0.50,
) -> Dict[str, Any]:
    """
    Evaluate binary anomaly detection:
      Positive = non-benign scenario
      Negative = benign scenario
    """
    if not aligned_pairs:
        return {
            "metrics": calculate_binary_metrics([], []),
            "roc_auc": None,
            "pr_auc": None,
            "threshold": threshold,
            "score_key": score_key,
        }

    y_true: List[int] = []
    y_score: List[float] = []
    y_pred: List[int] = []

    for r, lbl in aligned_pairs:
        is_benign = lbl.get("is_benign", True)
        # 1 = positive (anomalous), 0 = negative (benign)
        yt = 0 if is_benign else 1
        y_true.append(yt)

        if score_key == "max_category_score":
            sc = max(
                _get_record_score(r, "structural_score"),
                _get_record_score(r, "temporal_score"),
                _get_record_score(r, "network_score"),
                _get_record_score(r, "ml_anomaly_score"),
            )
        else:
            sc = _get_record_score(r, score_key)

        y_score.append(sc)
        y_pred.append(1 if sc >= threshold else 0)

    metrics = calculate_binary_metrics(y_true, y_pred)
    roc_auc = calculate_roc_auc(y_true, y_score)
    pr_auc = calculate_pr_auc(y_true, y_score)

    return {
        "metrics": metrics,
        "roc_auc": roc_auc,
        "pr_auc": pr_auc,
        "threshold": threshold,
        "score_key": score_key,
        "y_true": y_true,
        "y_score": y_score,
        "y_pred": y_pred,
    }


def evaluate_threshold_sweep(
    aligned_pairs: Sequence[Tuple[Any, Dict[str, Any]]],
    score_key: str,
    thresholds: Sequence[float] = (0.25, 0.50, 0.75),
) -> List[Dict[str, Any]]:
    """Evaluate performance across multiple score thresholds for sensitivity analysis."""
    results = []
    for th in thresholds:
        res = evaluate_binary_detection(aligned_pairs, score_key=score_key, threshold=th)
        results.append({
            "threshold": th,
            "score_key": score_key,
            "metrics": res["metrics"],
            "roc_auc": res["roc_auc"],
            "pr_auc": res["pr_auc"],
        })
    return results


def evaluate_all_categories(
    aligned_pairs: Sequence[Tuple[Any, Dict[str, Any]]],
    thresholds: Sequence[float] = (0.25, 0.50, 0.75),
) -> Dict[str, Any]:
    """
    Evaluate each of the four detection categories plus overall max score:
      - structural_score
      - temporal_score
      - network_score
      - ml_anomaly_score
      - overall (max of category scores)
    """
    categories = [
        "structural_score",
        "temporal_score",
        "network_score",
        "ml_anomaly_score",
        "max_category_score",
    ]

    out: Dict[str, Any] = {}
    for cat in categories:
        sweeps = evaluate_threshold_sweep(aligned_pairs, score_key=cat, thresholds=thresholds)
        # Default report at 0.50
        at_50 = next((s for s in sweeps if abs(s["threshold"] - 0.50) < 1e-6), sweeps[0] if sweeps else None)
        out[cat] = {
            "score_key": cat,
            "threshold_sweep": sweeps,
            "at_0_50": at_50,
            "roc_auc": at_50["roc_auc"] if at_50 else None,
            "pr_auc": at_50["pr_auc"] if at_50 else None,
        }
    return out


def evaluate_heuristic_detectors(
    aligned_pairs: Sequence[Tuple[Any, Dict[str, Any]]],
) -> Dict[str, BinaryMetrics]:
    """
    Evaluate individual heuristic detector boolean triggers:
    e.g. fan_in_triggered, peeling_like_triggered, etc.
    """
    detector_flags = [
        "fan_in_triggered",
        "fan_out_triggered",
        "equal_output_triggered",
        "peeling_like_triggered",
        "mixing_like_triggered",
        "temporal_burst_triggered",
        "rapid_hop_triggered",
        "baseline_deviation_triggered",
        "ip_reuse_triggered",
        "network_cluster_triggered",
        "endpoint_recurrence_triggered",
        "isolation_forest_triggered",
    ]

    results: Dict[str, BinaryMetrics] = {}
    for flag in detector_flags:
        y_true = [0 if lbl.get("is_benign", True) else 1 for _, lbl in aligned_pairs]
        y_pred = [1 if _get_record_flag(r, flag) else 0 for r, _ in aligned_pairs]
        results[flag] = calculate_binary_metrics(y_true, y_pred)

    return results


def compute_score_distributions(
    aligned_pairs: Sequence[Tuple[Any, Dict[str, Any]]],
) -> Dict[str, Dict[str, Any]]:
    """
    Compute score distributions (min, max, mean, median, p90, p95, p99)
    separately for benign transactions and all anomalous transactions.
    """
    categories = [
        "structural_score",
        "temporal_score",
        "network_score",
        "ml_anomaly_score",
    ]

    distributions: Dict[str, Dict[str, Any]] = {}

    for cat in categories:
        benign_scores = []
        anomalous_scores = []

        for r, lbl in aligned_pairs:
            sc = _get_record_score(r, cat)
            if lbl.get("is_benign", True):
                benign_scores.append(sc)
            else:
                anomalous_scores.append(sc)

        benign_stats = calculate_distribution_stats(benign_scores)
        anomalous_stats = calculate_distribution_stats(anomalous_scores)

        # Separation metric: difference in means and medians
        mean_sep = None
        if anomalous_stats["mean"] is not None and benign_stats["mean"] is not None:
            mean_sep = anomalous_stats["mean"] - benign_stats["mean"]

        median_sep = None
        if anomalous_stats["median"] is not None and benign_stats["median"] is not None:
            median_sep = anomalous_stats["median"] - benign_stats["median"]

        distributions[cat] = {
            "benign": benign_stats,
            "anomalous": anomalous_stats,
            "mean_separation": mean_sep,
            "median_separation": median_sep,
        }

    return distributions
