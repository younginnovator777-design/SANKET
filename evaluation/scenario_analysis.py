"""
SANKET Evaluation Harness: Scenario-Specific Analysis
Computes per-scenario recall, constructs the scenario detection matrix,
and analyzes benign high-scoring patterns (benign confounders).
"""
import math
from dataclasses import dataclass
from typing import Any, Dict, List, Optional, Sequence, Tuple

from evaluation.metrics import calculate_distribution_stats, format_metric


@dataclass
class ScenarioRecallSummary:
    """Summary of detection performance on a specific scenario."""
    scenario: str
    total_records: int
    records_triggered: int
    recall: float
    mean_score: Optional[float]
    median_score: Optional[float]

    def to_dict(self) -> Dict[str, Any]:
        return {
            "scenario": self.scenario,
            "total_records": self.total_records,
            "records_triggered": self.records_triggered,
            "recall": self.recall,
            "mean_score": self.mean_score,
            "median_score": self.median_score,
        }


def compute_scenario_recalls(
    aligned_pairs: Sequence[Tuple[Any, Dict[str, Any]]],
    score_threshold: float = 0.50,
) -> Dict[str, ScenarioRecallSummary]:
    """
    Compute detection recall and score summary for each scenario in the dataset.
    A record is considered triggered if max_category_score >= score_threshold.
    """
    by_scenario: Dict[str, List[Tuple[Any, Dict[str, Any]]]] = {}
    for r, lbl in aligned_pairs:
        sc = lbl.get("scenario", "unknown")
        by_scenario.setdefault(sc, []).append((r, lbl))

    results: Dict[str, ScenarioRecallSummary] = {}
    for sc_name, pairs in sorted(by_scenario.items()):
        total = len(pairs)
        scores = []
        triggered = 0
        for r, _ in pairs:
            # Overall anomaly score: maximum of the 4 category scores
            s = max(
                getattr(r, "structural_score", 0.0),
                getattr(r, "temporal_score", 0.0),
                getattr(r, "network_score", 0.0),
                getattr(r, "ml_anomaly_score", 0.0),
            )
            scores.append(s)
            if s >= score_threshold:
                triggered += 1

        stats = calculate_distribution_stats(scores)
        rec = triggered / total if total > 0 else 0.0
        results[sc_name] = ScenarioRecallSummary(
            scenario=sc_name,
            total_records=total,
            records_triggered=triggered,
            recall=round(rec, 4),
            mean_score=round(stats["mean"], 4) if stats["mean"] is not None else None,
            median_score=round(stats["median"], 4) if stats["median"] is not None else None,
        )

    return results


def build_scenario_matrix(
    aligned_pairs: Sequence[Tuple[Any, Dict[str, Any]]],
) -> Dict[str, Any]:
    """
    Construct cross-scenario detection matrix:
    Rows: Heuristic detectors + Isolation Forest
    Columns: Scenarios (benign FPR + scenario recalls)
    """
    # Detectors to evaluate with their respective record flag
    detectors = [
        ("fan_in detector", "fan_in_triggered"),
        ("fan_out detector", "fan_out_triggered"),
        ("peeling detector", "peeling_like_triggered"),
        ("mixing detector", "mixing_like_triggered"),
        ("rapid_hop detector", "rapid_hop_triggered"),
        ("network_cluster detector", "network_cluster_triggered"),
        ("Isolation Forest", "isolation_forest_triggered"),
    ]

    # Target scenarios to evaluate in columns
    scenario_columns = [
        "benign",
        "fan_in",
        "fan_out",
        "peeling_like",
        "mixing_like",
        "rapid_hop",
        "network_cluster",
    ]

    # Group aligned pairs by scenario
    grouped: Dict[str, List[Any]] = {s: [] for s in scenario_columns}
    for r, lbl in aligned_pairs:
        sc = lbl.get("scenario")
        if sc in grouped:
            grouped[sc].append(r)

    matrix: Dict[str, Dict[str, float]] = {}

    for det_label, flag_key in detectors:
        row_rates: Dict[str, float] = {}
        for sc in scenario_columns:
            recs = grouped[sc]
            tot = len(recs)
            if tot == 0:
                row_rates[sc] = 0.0
                continue
            fired = sum(1 for r in recs if getattr(r, flag_key, False))
            rate = fired / tot
            row_rates[sc] = round(rate, 4)
        matrix[det_label] = row_rates

    return {
        "detectors": [d[0] for d in detectors],
        "scenarios": scenario_columns,
        "matrix": matrix,
    }


def find_benign_high_scoring_patterns(
    aligned_pairs: Sequence[Tuple[Any, Dict[str, Any]]],
    evidence_list: Optional[Sequence[Dict[str, List[Dict[str, Any]]]]] = None,
    top_k: int = 5,
) -> Dict[str, List[Dict[str, Any]]]:
    """
    Identify the top benign transactions receiving the highest scores in each category.
    These represent benign high-scoring patterns (e.g. exchange batching, mining payouts).
    Does NOT label transactions as illicit/criminal.
    """
    categories = [
        ("structural_score", ["fan_in", "fan_out", "equal_output", "peeling_like", "mixing_like"]),
        ("temporal_score", ["temporal_burst", "rapid_hop", "baseline_deviation"]),
        ("network_score", ["ip_reuse", "network_cluster", "endpoint_recurrence"]),
        ("ml_anomaly_score", ["isolation_forest"]),
    ]

    # Map txid to evidence dict if available
    txid_to_evidence: Dict[str, Dict[str, List[Dict[str, Any]]]] = {}
    if evidence_list:
        for idx, (r, _) in enumerate(aligned_pairs):
            if idx < len(evidence_list):
                txid_to_evidence[r.txid] = evidence_list[idx]

    benign_pairs = [(r, lbl) for r, lbl in aligned_pairs if lbl.get("is_benign", True)]

    results: Dict[str, List[Dict[str, Any]]] = {}

    for cat_score_key, associated_detectors in categories:
        # Sort benign records descending by category score
        sorted_benign = sorted(
            benign_pairs,
            key=lambda x: getattr(x[0], cat_score_key, 0.0),
            reverse=True,
        )

        top_entries = []
        for r, lbl in sorted_benign[:top_k]:
            sc = getattr(r, cat_score_key, 0.0)
            if sc <= 0.0:
                continue

            # Determine which detector likely drove this category score
            fired_detectors = []
            for d in associated_detectors:
                if getattr(r, f"{d}_triggered", False):
                    fired_detectors.append(d)
            det_name = ", ".join(fired_detectors) if fired_detectors else associated_detectors[0]

            # Fetch top evidence reason if available
            top_ev_summary = "N/A (Heuristic score elevated above threshold)"
            r_ev = txid_to_evidence.get(r.txid, {})
            for d in associated_detectors:
                det_data = r_ev.get(d, {})
                ev_items = (
                    det_data.get("evidence", [])
                    if isinstance(det_data, dict)
                    else (det_data if isinstance(det_data, list) else [])
                )
                if ev_items:
                    first_item = ev_items[0]
                    if isinstance(first_item, dict):
                        top_ev_summary = first_item.get("reason", "")
                    elif hasattr(first_item, "reason"):
                        top_ev_summary = getattr(first_item, "reason", "")
                    if top_ev_summary:
                        break

            top_entries.append({
                "txid": r.txid,
                "scenario": "benign",
                "score": round(sc, 4),
                "detector_name": det_name,
                "top_evidence": top_ev_summary,
            })

        results[cat_score_key] = top_entries

    return results
