"""
SANKET Evaluation Harness
Offline evaluation utilities for measuring detector performance against ground-truth labels.
This module is strictly offline and must never be accessed during inference.
"""
from evaluation.loader import load_ground_truth_labels
from evaluation.metrics import (
    BinaryMetrics,
    calculate_binary_metrics,
    calculate_confusion_matrix,
    calculate_distribution_stats,
    calculate_pr_auc,
    calculate_roc_auc,
    format_metric,
)
from evaluation.detector_evaluation import (
    AlignmentReport,
    compute_score_distributions,
    evaluate_all_categories,
    evaluate_binary_detection,
    evaluate_heuristic_detectors,
    evaluate_threshold_sweep,
    validate_and_align_labels,
)
from evaluation.scenario_analysis import (
    ScenarioRecallSummary,
    build_scenario_matrix,
    compute_scenario_recalls,
    find_benign_high_scoring_patterns,
)
from evaluation.report import generate_markdown_report, get_feature_count_audit_table

__all__ = [
    "load_ground_truth_labels",
    "BinaryMetrics",
    "calculate_binary_metrics",
    "calculate_confusion_matrix",
    "calculate_distribution_stats",
    "calculate_pr_auc",
    "calculate_roc_auc",
    "format_metric",
    "AlignmentReport",
    "validate_and_align_labels",
    "evaluate_binary_detection",
    "evaluate_threshold_sweep",
    "evaluate_all_categories",
    "evaluate_heuristic_detectors",
    "compute_score_distributions",
    "ScenarioRecallSummary",
    "compute_scenario_recalls",
    "build_scenario_matrix",
    "find_benign_high_scoring_patterns",
    "generate_markdown_report",
    "get_feature_count_audit_table",
]
