"""
SANKET Evaluation Harness: Core Metric Computations
Calculates binary classification metrics (precision, recall, F1, TP/FP/TN/FN),
ranked score metrics (ROC-AUC, PR-AUC), and statistical score distributions.
Handles edge cases (missing classes, empty datasets, division by zero) gracefully with 'N/A'.
"""
import math
from dataclasses import dataclass
from typing import Any, Dict, List, Optional, Sequence, Tuple, Union

try:
    from sklearn.metrics import roc_auc_score, average_precision_score
    _SKLEARN_AVAILABLE = True
except ImportError:
    _SKLEARN_AVAILABLE = False


@dataclass
class BinaryMetrics:
    """Standard binary classification metrics and confusion matrix counts."""
    tp: int
    fp: int
    tn: int
    fn: int
    precision: Optional[float]
    recall: Optional[float]
    f1: Optional[float]
    accuracy: Optional[float]
    fpr: Optional[float]
    total_samples: int

    def to_dict(self) -> Dict[str, Any]:
        return {
            "tp": self.tp,
            "fp": self.fp,
            "tn": self.tn,
            "fn": self.fn,
            "precision": self.precision,
            "recall": self.recall,
            "f1": self.f1,
            "accuracy": self.accuracy,
            "fpr": self.fpr,
            "total_samples": self.total_samples,
        }


def format_metric(val: Optional[float], decimals: int = 4) -> str:
    """Format float metric or return 'N/A' if None, NaN, or undefined."""
    if val is None or math.isnan(val):
        return "N/A"
    return f"{val:.{decimals}f}"


def calculate_confusion_matrix(
    y_true: Sequence[int],
    y_pred: Sequence[int],
) -> Tuple[int, int, int, int]:
    """
    Compute TP, FP, TN, FN given binary ground truth and predictions.
    Assumes 1 = positive (anomalous), 0 = negative (benign).
    """
    if len(y_true) != len(y_pred):
        raise ValueError(f"Length mismatch: y_true ({len(y_true)}) != y_pred ({len(y_pred)})")

    tp = 0
    fp = 0
    tn = 0
    fn = 0
    for yt, yp in zip(y_true, y_pred):
        yt_bin = 1 if yt else 0
        yp_bin = 1 if yp else 0
        if yt_bin == 1 and yp_bin == 1:
            tp += 1
        elif yt_bin == 0 and yp_bin == 1:
            fp += 1
        elif yt_bin == 0 and yp_bin == 0:
            tn += 1
        else:
            fn += 1
    return tp, fp, tn, fn


def calculate_binary_metrics(
    y_true: Sequence[int],
    y_pred: Sequence[int],
) -> BinaryMetrics:
    """
    Calculate full suite of binary classification metrics.
    Handles zero division gracefully by returning None for undefined metrics.
    """
    total = len(y_true)
    if total == 0:
        return BinaryMetrics(
            tp=0, fp=0, tn=0, fn=0,
            precision=None, recall=None, f1=None, accuracy=None, fpr=None,
            total_samples=0,
        )

    tp, fp, tn, fn = calculate_confusion_matrix(y_true, y_pred)

    precision = (tp / (tp + fp)) if (tp + fp) > 0 else None
    recall = (tp / (tp + fn)) if (tp + fn) > 0 else None
    if precision is not None and recall is not None and (precision + recall) > 0:
        f1 = 2.0 * (precision * recall) / (precision + recall)
    else:
        f1 = None

    accuracy = ((tp + tn) / total) if total > 0 else None
    fpr = (fp / (fp + tn)) if (fp + tn) > 0 else None

    return BinaryMetrics(
        tp=tp,
        fp=fp,
        tn=tn,
        fn=fn,
        precision=precision,
        recall=recall,
        f1=f1,
        accuracy=accuracy,
        fpr=fpr,
        total_samples=total,
    )


def calculate_roc_auc(
    y_true: Sequence[int],
    y_score: Sequence[float],
) -> Optional[float]:
    """
    Calculate ROC-AUC score.
    Returns None if dataset has only one class or fewer than 2 samples.
    """
    if len(y_true) < 2 or len(y_true) != len(y_score):
        return None

    pos_count = sum(1 for y in y_true if y == 1)
    neg_count = len(y_true) - pos_count
    if pos_count == 0 or neg_count == 0:
        return None

    if _SKLEARN_AVAILABLE:
        try:
            return float(roc_auc_score(y_true, y_score))
        except Exception:
            pass

    # Pure Python Mann-Whitney U statistic fallback
    combined = sorted(zip(y_score, y_true), key=lambda x: x[0])
    # Compute rank sum with average ranks for ties
    n = len(combined)
    ranks = [0.0] * n
    i = 0
    while i < n:
        j = i
        while j < n and combined[j][0] == combined[i][0]:
            j += 1
        avg_rank = (i + 1 + j) / 2.0
        for k in range(i, j):
            ranks[k] = avg_rank
        i = j

    rank_sum_pos = sum(ranks[k] for k in range(n) if combined[k][1] == 1)
    u_stat = rank_sum_pos - (pos_count * (pos_count + 1)) / 2.0
    auc = u_stat / (pos_count * neg_count)
    return float(auc)


def calculate_pr_auc(
    y_true: Sequence[int],
    y_score: Sequence[float],
) -> Optional[float]:
    """
    Calculate Precision-Recall AUC (Average Precision).
    Returns None if dataset has no positive samples or fewer than 2 samples.
    """
    if len(y_true) < 2 or len(y_true) != len(y_score):
        return None

    pos_count = sum(1 for y in y_true if y == 1)
    if pos_count == 0:
        return None

    if _SKLEARN_AVAILABLE:
        try:
            return float(average_precision_score(y_true, y_score))
        except Exception:
            pass

    # Fallback trapezoidal rule calculation
    thresholds = sorted(set(y_score), reverse=True)
    precisions = []
    recalls = []
    for th in thresholds:
        yp = [1 if s >= th else 0 for s in y_score]
        tp, fp, _, fn = calculate_confusion_matrix(y_true, yp)
        p = tp / (tp + fp) if (tp + fp) > 0 else 1.0
        r = tp / (tp + fn) if (tp + fn) > 0 else 0.0
        precisions.append(p)
        recalls.append(r)

    # Sort by recall
    pairs = sorted(zip(recalls, precisions), key=lambda x: x[0])
    area = 0.0
    for k in range(1, len(pairs)):
        dr = pairs[k][0] - pairs[k - 1][0]
        avg_p = (pairs[k][1] + pairs[k - 1][1]) / 2.0
        area += dr * avg_p
    return float(min(1.0, max(0.0, area)))


def calculate_distribution_stats(
    values: Sequence[float],
) -> Dict[str, Optional[float]]:
    """
    Compute comprehensive statistical summary:
    minimum, maximum, mean, median, p90, p95, p99.
    """
    if not values:
        return {
            "count": 0,
            "min": None,
            "max": None,
            "mean": None,
            "median": None,
            "p90": None,
            "p95": None,
            "p99": None,
        }

    s_vals = sorted(float(v) for v in values if v is not None and not math.isnan(v))
    n = len(s_vals)
    if n == 0:
        return {
            "count": 0,
            "min": None,
            "max": None,
            "mean": None,
            "median": None,
            "p90": None,
            "p95": None,
            "p99": None,
        }

    def _percentile(p: float) -> float:
        """Linear interpolation percentile (0 to 100)."""
        idx = (p / 100.0) * (n - 1)
        lower = int(math.floor(idx))
        upper = int(math.ceil(idx))
        if lower == upper:
            return s_vals[lower]
        weight = idx - lower
        return s_vals[lower] * (1.0 - weight) + s_vals[upper] * weight

    return {
        "count": n,
        "min": s_vals[0],
        "max": s_vals[-1],
        "mean": sum(s_vals) / n,
        "median": _percentile(50.0),
        "p90": _percentile(90.0),
        "p95": _percentile(95.0),
        "p99": _percentile(99.0),
    }
