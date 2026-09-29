"""
Configuration management for SANKET synthetic dataset generator.
Defines parameters for dataset size, randomness, scenario distributions,
network topologies, temporal dynamics, and output targets.
"""
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Dict, Any


@dataclass
class GeneratorConfig:
    num_rows: int = 100_000
    seed: int = 42
    start_time: datetime = field(
        default_factory=lambda: datetime(2026, 9, 1, 0, 0, 0, tzinfo=timezone.utc)
    )
    output_dir: str = "data/generated"
    output_format: str = "csv"  # "csv", "json", "xml", "all"
    filename_prefix: str = "transactions"
    labels_filename: str = "labels.csv"

    # Investigative scenario distribution (must sum to 1.0 with benign)
    # Default: 85% benign, 15% investigative scenarios (2.5% each across 6 scenarios)
    scenario_weights: Dict[str, float] = field(
        default_factory=lambda: {
            "benign": 0.85,
            "fan_in": 0.025,
            "fan_out": 0.025,
            "peeling_like": 0.025,
            "mixing_like": 0.025,
            "rapid_hop": 0.025,
            "network_cluster": 0.025,
        }
    )

    # Sub-population distribution within benign traffic
    benign_weights: Dict[str, float] = field(
        default_factory=lambda: {
            "ordinary_user": 0.45,
            "merchant_payment": 0.20,
            "merchant_consolidation": 0.08,  # Benign look-alike for fan-in
            "exchange_batch": 0.10,          # Benign look-alike for fan-out
            "mining_pool": 0.07,             # Benign look-alike for fan-out/distribution
            "service_recurring": 0.05,       # Benign automated recurring service
            "high_volume_processor": 0.05,   # Benign look-alike for network cluster
        }
    )

    # Bitcoin script type distribution
    script_type_weights: Dict[str, float] = field(
        default_factory=lambda: {
            "p2wpkh": 0.50,
            "p2pkh": 0.25,
            "p2sh": 0.15,
            "p2wsh": 0.08,
            "unknown": 0.02,
        }
    )

    # Entity pool sizing (reusable addresses across time)
    num_user_entities: int = 500
    num_merchant_entities: int = 50
    num_exchange_entities: int = 10
    num_miner_entities: int = 8
    num_service_entities: int = 20
    num_confounder_entities: int = 20
    num_anomaly_entities: int = 120

    # Temporal settings
    mean_inter_arrival_seconds: float = 8.0
    diurnal_cycle_enabled: bool = True
    burst_probability: float = 0.05

    def validate(self) -> None:
        if self.num_rows <= 0:
            raise ValueError(f"num_rows must be positive, got {self.num_rows}")
        if self.output_format not in {"csv", "json", "xml", "all"}:
            raise ValueError(
                f"output_format must be 'csv', 'json', 'xml', or 'all', got {self.output_format}"
            )
        scenario_sum = sum(self.scenario_weights.values())
        if abs(scenario_sum - 1.0) > 1e-4:
            raise ValueError(f"scenario_weights must sum to 1.0, got {scenario_sum}")
        benign_sum = sum(self.benign_weights.values())
        if abs(benign_sum - 1.0) > 1e-4:
            raise ValueError(f"benign_weights must sum to 1.0, got {benign_sum}")
        script_sum = sum(self.script_type_weights.values())
        if abs(script_sum - 1.0) > 1e-4:
            raise ValueError(f"script_type_weights must sum to 1.0, got {script_sum}")
