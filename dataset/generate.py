"""
CLI entrypoint and generator orchestrator for SANKET synthetic dataset.

Usage:
    python -m dataset.generate --rows 100000 --seed 42 --format csv
    python -m dataset.generate --rows 100000 --seed 42 --format json
    python -m dataset.generate --rows 100000 --seed 42 --format xml
    python -m dataset.generate --rows 100000 --seed 42 --format all
"""
import argparse
from datetime import datetime, timezone
import os
import random
import sys
import time
from typing import Dict, List, Tuple

from dataset.generator.config import GeneratorConfig
from dataset.generator.core import (
    GeneratedTransaction,
    TransactionLabel,
    EntityManager,
    SimulationClock,
)
from dataset.generator.writer import (
    write_csv,
    write_json,
    write_xml,
    write_labels,
)
from dataset.scenarios.benign import generate_benign_transaction
from dataset.scenarios.fan_in import generate_fan_in_scenario
from dataset.scenarios.fan_out import generate_fan_out_scenario
from dataset.scenarios.peeling import generate_peeling_scenario
from dataset.scenarios.mixing_like import generate_mixing_scenario
from dataset.scenarios.rapid_hop import generate_rapid_hop_scenario
from dataset.scenarios.network_cluster import generate_network_cluster_scenario


def generate_dataset(
    config: GeneratorConfig,
) -> Tuple[List[GeneratedTransaction], List[TransactionLabel]]:
    """
    Deterministically generate the requested number of transactions and labels.
    """
    config.validate()
    rng = random.Random(config.seed)
    clock = SimulationClock(
        config.start_time, rng, mean_inter_arrival=config.mean_inter_arrival_seconds
    )
    entity_mgr = EntityManager(config, rng)

    transactions: List[GeneratedTransaction] = []
    labels: List[TransactionLabel] = []

    scenario_names = list(config.scenario_weights.keys())
    scenario_targets: Dict[str, int] = {
        scn: int(config.num_rows * config.scenario_weights[scn])
        for scn in scenario_names
    }
    # Ensure targets sum to at least num_rows by assigning remainder to benign
    target_sum = sum(scenario_targets.values())
    if target_sum < config.num_rows:
        scenario_targets["benign"] += config.num_rows - target_sum

    scenario_counts: Dict[str, int] = {k: 0 for k in scenario_names}
    instance_counters: Dict[str, int] = {k: 0 for k in scenario_names}
    tx_counter = 0

    benign_subtypes = list(config.benign_weights.keys())
    benign_weights = list(config.benign_weights.values())

    while tx_counter < config.num_rows:
        remaining = config.num_rows - tx_counter

        # Calculate remaining deficits for each scenario
        deficits = [
            max(0, scenario_targets[scn] - scenario_counts[scn])
            for scn in scenario_names
        ]

        if sum(deficits) == 0:
            chosen_scenario = "benign"
        else:
            chosen_scenario = rng.choices(scenario_names, weights=deficits, k=1)[0]

        # If remaining capacity is too small for multi-tx scenario, fallback to benign
        if remaining < 2 and chosen_scenario != "benign":
            chosen_scenario = "benign"

        batch_txs: List[GeneratedTransaction] = []
        batch_lbls: List[TransactionLabel] = []
        instance_counters[chosen_scenario] += 1
        inst_id = instance_counters[chosen_scenario]

        # Calculate scenario-specific batch limit based on remaining quota
        scenario_budget = min(
            remaining,
            max(1, scenario_targets.get(chosen_scenario, remaining) - scenario_counts.get(chosen_scenario, 0))
        )

        if chosen_scenario == "benign":
            subtype = rng.choices(benign_subtypes, weights=benign_weights, k=1)[0]
            tx, lbl = generate_benign_transaction(
                rng, entity_mgr, clock, config.seed, tx_counter, subtype=subtype
            )
            batch_txs = [tx]
            batch_lbls = [lbl]

        elif chosen_scenario == "fan_in":
            batch_txs, batch_lbls = generate_fan_in_scenario(
                rng, entity_mgr, clock, config.seed, tx_counter, inst_id, max_txs=min(2, scenario_budget)
            )

        elif chosen_scenario == "fan_out":
            batch_txs, batch_lbls = generate_fan_out_scenario(
                rng, entity_mgr, clock, config.seed, tx_counter, inst_id, max_txs=min(2, scenario_budget)
            )

        elif chosen_scenario == "peeling_like":
            batch_txs, batch_lbls = generate_peeling_scenario(
                rng, entity_mgr, clock, config.seed, tx_counter, inst_id, max_txs=min(6, scenario_budget)
            )

        elif chosen_scenario == "mixing_like":
            batch_txs, batch_lbls = generate_mixing_scenario(
                rng, entity_mgr, clock, config.seed, tx_counter, inst_id, max_txs=min(1, scenario_budget)
            )

        elif chosen_scenario == "rapid_hop":
            batch_txs, batch_lbls = generate_rapid_hop_scenario(
                rng, entity_mgr, clock, config.seed, tx_counter, inst_id, max_txs=min(5, scenario_budget)
            )

        elif chosen_scenario == "network_cluster":
            batch_txs, batch_lbls = generate_network_cluster_scenario(
                rng, entity_mgr, clock, config.seed, tx_counter, inst_id, max_txs=min(6, scenario_budget)
            )

        # Slice to strictly respect remaining count
        if len(batch_txs) > remaining:
            batch_txs = batch_txs[:remaining]
            batch_lbls = batch_lbls[:remaining]

        transactions.extend(batch_txs)
        labels.extend(batch_lbls)
        scenario_counts[chosen_scenario] += len(batch_txs)
        tx_counter += len(batch_txs)

    return transactions, labels


def run_generation(config: GeneratorConfig) -> Dict[str, str]:
    """
    Generate dataset and write outputs to specified paths.
    Returns a mapping of artifact description to output filepath.
    """
    start_time = time.perf_counter()
    transactions, labels = generate_dataset(config)
    gen_duration = time.perf_counter() - start_time

    output_files: Dict[str, str] = {}
    out_dir = config.output_dir
    os.makedirs(out_dir, exist_ok=True)

    # Always write labels.csv
    labels_path = os.path.join(out_dir, config.labels_filename)
    write_labels(labels, labels_path)
    output_files["labels"] = labels_path

    # Write requested formats
    base_prefix = config.filename_prefix
    if config.output_format in {"csv", "all"}:
        csv_path = os.path.join(out_dir, f"{base_prefix}.csv")
        write_csv(transactions, csv_path)
        output_files["csv"] = csv_path

    if config.output_format in {"json", "all"}:
        json_path = os.path.join(out_dir, f"{base_prefix}.json")
        write_json(transactions, json_path)
        output_files["json"] = json_path

    if config.output_format in {"xml", "all"}:
        xml_path = os.path.join(out_dir, f"{base_prefix}.xml")
        write_xml(transactions, xml_path)
        output_files["xml"] = xml_path

    total_duration = time.perf_counter() - start_time

    # Calculate distribution breakdown
    scenario_counts: Dict[str, int] = {}
    for lbl in labels:
        scenario_counts[lbl.scenario] = scenario_counts.get(lbl.scenario, 0) + 1

    print("==================================================")
    print(" SANKET Synthetic Dataset Generation Complete")
    print("==================================================")
    print(f"Total Rows Generated:     {len(transactions):,}")
    print(f"Random Seed:              {config.seed}")
    print(f"Generation Time:          {gen_duration:.2f}s")
    print(f"Total Write Time:         {total_duration - gen_duration:.2f}s")
    print(f"Overall Elapsed Time:     {total_duration:.2f}s")
    print(f"Generation Rate:          {len(transactions) / gen_duration:,.0f} rows/s")
    print("--------------------------------------------------")
    print("Scenario Distribution:")
    for scn, count in sorted(scenario_counts.items()):
        pct = (count / len(transactions)) * 100.0
        print(f"  - {scn:<18}: {count:>7,} ({pct:5.2f}%)")
    print("--------------------------------------------------")
    print("Generated Artifacts:")
    for k, p in output_files.items():
        size_mb = os.path.getsize(p) / (1024 * 1024)
        print(f"  - {k:<8}: {p} ({size_mb:.2f} MB)")
    print("==================================================")

    return output_files


def main() -> int:
    parser = argparse.ArgumentParser(
        description="SANKET Deterministic Bitcoin Synthetic Telemetry Generator",
        formatter_class=argparse.ArgumentDefaultsHelpFormatter,
    )
    parser.add_argument(
        "--rows",
        type=int,
        default=100_000,
        help="Number of transaction records to generate (e.g. 1000, 10000, 100000)",
    )
    parser.add_argument(
        "--seed",
        type=int,
        default=42,
        help="Deterministic random seed",
    )
    parser.add_argument(
        "--format",
        choices=["csv", "json", "xml", "all"],
        default="csv",
        help="Telemetry output serialization format",
    )
    parser.add_argument(
        "--output-dir",
        default="data/generated",
        help="Directory to save generated transaction files and labels.csv",
    )
    parser.add_argument(
        "--filename",
        default="transactions",
        help="Prefix filename for generated transactions without extension",
    )
    parser.add_argument(
        "--start-time",
        default="2026-09-01T00:00:00Z",
        help="Simulation UTC start timestamp in ISO-8601 format",
    )
    args = parser.parse_args()

    start_dt = datetime.fromisoformat(args.start_time.replace("Z", "+00:00"))

    config = GeneratorConfig(
        num_rows=args.rows,
        seed=args.seed,
        output_format=args.format,
        output_dir=args.output_dir,
        filename_prefix=args.filename,
        start_time=start_dt,
    )

    run_generation(config)
    return 0


if __name__ == "__main__":
    sys.exit(main())
