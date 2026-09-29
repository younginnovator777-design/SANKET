"""
Script to execute the end-to-end analysis pipeline on a small sample of 1,000 records
from the synthetic dataset to validate performance, metrics, and alert generation.
"""
import csv
import json
import time

from src.pipeline.orchestrator import run_analysis, PipelineConfig


def main():
    print("Loading 1,000 records from data/generated/transactions.csv...")
    rows = []
    with open("data/generated/transactions.csv", mode="r", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for i, row in enumerate(reader):
            if i >= 1000:
                break
            rows.append(row)

    print(f"Loaded {len(rows)} raw transaction records.")

    print("Executing run_analysis()...")
    t0 = time.perf_counter()
    config = PipelineConfig(
        temporal_window_seconds=300.0,
        iforest_n_estimators=100,
        iforest_random_state=42,
    )
    result = run_analysis(rows, config=config)
    elapsed = time.perf_counter() - t0

    print("\n--- Pipeline Execution Summary ---")
    print(f"Run ID: {result.run_id}")
    print(f"Record Count: {result.record_count}")
    print(f"Total Elapsed Time: {elapsed:.3f} s")
    print(f"Throughput: {result.execution_metrics.get('records_per_second')} records/s")
    print(f"Peak Memory: {result.execution_metrics.get('peak_memory_mb')} MB")
    print(f"Graph Nodes: {result.graph_summary['node_count']}, Edges: {result.graph_summary['edge_count']}")
    print(f"Total Investigation Objects: {len(result.investigation_objects)}")
    print(f"Total Ranked Alerts: {len(result.ranked_alerts)}")

    # Tier breakdown
    tier_counts = {"CRITICAL": 0, "HIGH": 0, "MEDIUM": 0, "LOW": 0}
    for a in result.ranked_alerts:
        tier_counts[a.risk_level] = tier_counts.get(a.risk_level, 0) + 1

    print("\n--- Alert Tier Breakdown ---")
    for tier, count in tier_counts.items():
        print(f"  {tier}: {count}")

    print("\n--- Step Execution Timings ---")
    for step, duration in result.execution_timings.items():
        print(f"  {step}: {duration:.4f} s")

    print(f"\nWarnings: {len(result.warnings)}, Errors: {len(result.errors)}, Rejected: {len(result.rejected_records)}")

    # Top 3 Alerts
    print("\n--- Top 3 Ranked Alerts ---")
    for a in result.ranked_alerts[:3]:
        print(f"  Rank {a.rank} | TxID: {a.transaction_id} | Risk: {a.risk_score:.4f} | Conf: {a.confidence_score:.4f} | Priority: {a.priority_score:.4f} | Level: {a.risk_level}")
        print(f"    Triggered: {a.triggered_detectors}")


if __name__ == "__main__":
    main()
