"""
Evaluation utilities for SANKET.
Loads ground-truth labels for offline performance evaluation.
Do NOT import this module during inference.
"""
import csv
from typing import Dict, Any


def load_ground_truth_labels(
    labels_csv_path: str = "data/generated/labels.csv",
) -> Dict[str, Dict[str, Any]]:
    """
    Load ground-truth labels indexed by txid.
    Returns a dictionary mapping txid -> {scenario, entity_id, scenario_instance_id, is_benign, parent_txid}.
    """
    labels: Dict[str, Dict[str, Any]] = {}
    with open(labels_csv_path, mode="r", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            labels[row["txid"]] = {
                "scenario": row["scenario"],
                "entity_id": row["entity_id"],
                "scenario_instance_id": row.get("scenario_instance_id", ""),
                "is_benign": row.get("is_benign", "True").lower() in {"true", "1"},
                "parent_txid": row.get("parent_txid", ""),
            }
    return labels
