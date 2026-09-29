"""
SANKET Detection Engine: Performance & Scalability Benchmark
Measures processing time, throughput (rows/sec), and peak RSS memory
at 1,000, 10,000, and 100,000 rows.
"""
import os
import sys
import time
import random
from typing import List, Dict, Any
import psutil

# Ensure workspace root is in sys.path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from src.features.pipeline import FEATURE_SCHEMA_VERSION, FEATURE_REGISTRY
from src.detectors.pipeline import DetectorPipeline, DetectionPipelineResult


def get_current_rss_mb() -> float:
    """Return current process resident set size in megabytes."""
    process = psutil.Process(os.getpid())
    return process.memory_info().rss / (1024 * 1024)


def generate_synthetic_features(n_rows: int, seed: int = 42) -> List[Dict[str, Any]]:
    """Generate deterministic synthetic feature rows matching SANKET feature schema."""
    rng = random.Random(seed)
    rows: List[Dict[str, Any]] = []

    for i in range(n_rows):
        in_cnt = float(rng.randint(1, 10))
        out_cnt = float(rng.randint(1, 10))
        tot_in = round(rng.uniform(0.1, 50.0), 4)
        fee = round(rng.uniform(0.0001, 0.01), 4)
        tot_out = max(0.0001, tot_in - fee)

        row = {
            "txid": f"tx_bench_{i:07d}",
            "timestamp": f"2026-09-01T{12 + (i // 3600) % 12:02d}:{(i // 60) % 60:02d}:{i % 60:02d}Z",
            "feature_schema_version": FEATURE_SCHEMA_VERSION,
            # Transaction features
            "input_count": in_cnt,
            "output_count": out_cnt,
            "total_input_amount": tot_in,
            "total_output_amount": tot_out,
            "fee": fee,
            "fee_ratio": fee / max(tot_in, 1e-9),
            "input_output_count_ratio": in_cnt / max(out_cnt, 1e-9),
            "input_output_amount_ratio": tot_in / max(tot_out, 1e-9),
            "amount_mean": tot_out / max(out_cnt, 1.0),
            "amount_std": round(rng.uniform(0.0, 2.0), 4),
            "amount_cv": round(rng.uniform(0.0, 1.5), 4),
            "output_concentration": round(rng.uniform(0.1, 1.0), 4),
            "equal_output_ratio": round(rng.uniform(0.0, 1.0), 4),
            "round_amount_ratio": round(rng.choice([0.0, 0.5, 1.0]), 2),
            "fan_in_ratio": in_cnt / (in_cnt + out_cnt),
            "fan_out_ratio": out_cnt / (in_cnt + out_cnt),
            # Temporal features
            "tx_count_5m": float(rng.randint(1, 20)),
            "tx_count_1h": float(rng.randint(5, 100)),
            "tx_count_24h": float(rng.randint(20, 500)),
            "volume_5m": round(rng.uniform(1.0, 100.0), 2),
            "volume_1h": round(rng.uniform(10.0, 500.0), 2),
            "volume_24h": round(rng.uniform(50.0, 2000.0), 2),
            "mean_interarrival": round(rng.uniform(5.0, 300.0), 2),
            "median_interarrival": round(rng.uniform(4.0, 250.0), 2),
            "burst_score": round(rng.uniform(0.5, 10.0), 2),
            "velocity_ratio": round(rng.uniform(0.5, 5.0), 2),
            "history_count": float(rng.randint(0, 50)),
            "baseline_stability": round(rng.uniform(0.0, 1.0), 2),
            # Network features
            "unique_ips": float(rng.randint(1, 5)),
            "unique_addresses_per_ip": float(rng.randint(1, 10)),
            "ip_reuse_count": float(rng.randint(0, 8)),
            "unique_asns": float(rng.randint(1, 3)),
            "asn_concentration": round(rng.uniform(0.3, 1.0), 2),
            "unique_countries": float(rng.randint(1, 3)),
            "country_count": float(rng.randint(1, 3)),
            "src_port_frequency": round(rng.uniform(0.1, 1.0), 2),
            "dst_port_frequency": round(rng.uniform(0.1, 1.0), 2),
            "endpoint_recurrence": round(rng.uniform(0.0, 5.0), 2),
            # Entity features
            "entity_tx_count": float(rng.randint(1, 100)),
            "entity_volume": round(rng.uniform(1.0, 500.0), 2),
            "entity_age_seconds": float(rng.randint(0, 86400 * 30)),
            "unique_counterparties": float(rng.randint(1, 20)),
            "historical_median_amount": round(rng.uniform(0.1, 20.0), 2),
            "historical_MAD_amount": round(rng.uniform(0.01, 5.0), 2),
            "baseline_deviation": round(rng.uniform(0.0, 15.0), 2),
            "activity_change": round(rng.uniform(0.5, 10.0), 2),
            # Graph features
            "fan_in_degree": in_cnt,
            "fan_out_degree": out_cnt,
            "bipartite_density": round((in_cnt * out_cnt) / max(in_cnt + out_cnt, 1.0), 2),
            "address_reuse_in_tx": float(rng.choice([0, 0, 0, 1])),
            "is_peeling_structure": 1.0 if (in_cnt <= 2 and out_cnt == 2 and rng.random() < 0.15) else 0.0,
            "is_consolidation_structure": 1.0 if (in_cnt >= 5 and out_cnt <= 2) else 0.0,
            "is_dispersion_structure": 1.0 if (in_cnt <= 2 and out_cnt >= 5) else 0.0,
            "is_equal_split_structure": 1.0 if (out_cnt >= 3 and rng.random() < 0.2) else 0.0,
            # Data Quality features
            "field_completeness": 1.0,
            "timestamp_valid": 1.0,
            "network_metadata_completeness": 1.0,
            "amount_data_completeness": 1.0,
        }
        rows.append(row)
    return rows


def run_benchmark_scale(scale_name: str, n_rows: int) -> Dict[str, Any]:
    """Run benchmark for a given dataset size."""
    print(f"\n[{scale_name}] Generating {n_rows:,} synthetic feature rows...")
    t0_gen = time.perf_counter()
    rows = generate_synthetic_features(n_rows, seed=42)
    t_gen = time.perf_counter() - t0_gen
    print(f"[{scale_name}] Data generation: {t_gen:.2f}s")

    rss_before = get_current_rss_mb()
    pipeline = DetectorPipeline(iforest_random_state=42)

    print(f"[{scale_name}] Executing DetectorPipeline (11 heuristic detectors + Isolation Forest)...")
    t0_det = time.perf_counter()
    result: DetectionPipelineResult = pipeline.run(rows)
    t_det = time.perf_counter() - t0_det

    rss_after = get_current_rss_mb()
    rss_delta = max(0.0, rss_after - rss_before)
    throughput = n_rows / max(t_det, 1e-9)

    print(f"[{scale_name}] Done! Elapsed: {t_det:.3f}s | Throughput: {throughput:,.1f} rows/s | Peak RSS: {rss_after:.1f} MB (Delta: +{rss_delta:.1f} MB)")
    print(f"[{scale_name}] Results verified: {len(result.records):,} records produced")

    anomalies_count = sum(
        1 for r in result.records
        if (
            r.fan_in_triggered or r.fan_out_triggered or r.equal_output_triggered
            or r.peeling_like_triggered or r.mixing_like_triggered
            or r.temporal_burst_triggered or r.rapid_hop_triggered
            or r.baseline_deviation_triggered or r.ip_reuse_triggered
            or r.network_cluster_triggered or r.endpoint_recurrence_triggered
            or r.isolation_forest_triggered
        )
    )

    return {
        "scale": scale_name,
        "rows": n_rows,
        "duration_sec": round(t_det, 3),
        "throughput_rows_sec": round(throughput, 1),
        "rss_before_mb": round(rss_before, 1),
        "rss_after_mb": round(rss_after, 1),
        "rss_delta_mb": round(rss_delta, 1),
        "records_count": len(result.records),
        "total_anomalies_flagged": anomalies_count,
    }


def main():
    print("=" * 70)
    print("SANKET — Detection Engine Performance & Scalability Benchmark")
    print("=" * 70)

    scales = [
        ("1K", 1_000),
        ("10K", 10_000),
        ("100K", 100_000),
    ]

    results = []
    for name, n in scales:
        res = run_benchmark_scale(name, n)
        results.append(res)

    print("\n" + "=" * 70)
    print("SUMMARY BENCHMARK REPORT")
    print("=" * 70)
    header = f"{'Scale':<8} | {'Rows':<9} | {'Time (s)':<10} | {'Throughput (r/s)':<18} | {'Peak RSS (MB)':<14} | {'Memory Delta (MB)':<18}"
    print(header)
    print("-" * len(header))
    for r in results:
        line = (
            f"{r['scale']:<8} | "
            f"{r['rows']:<9,d} | "
            f"{r['duration_sec']:<10.3f} | "
            f"{r['throughput_rows_sec']:<18,.1f} | "
            f"{r['rss_after_mb']:<14.1f} | "
            f"{r['rss_delta_mb']:<14.1f}"
        )
        print(line)
    print("=" * 70)


if __name__ == "__main__":
    main()
