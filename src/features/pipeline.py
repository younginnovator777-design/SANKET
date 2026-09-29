"""
SANKET Feature Engineering Pipeline and Registry
Converts canonical transaction records into a deterministic, scikit-learn ready feature table.
Exposes feature groups, feature dictionary registry, and streaming execution engine.
"""
from dataclasses import asdict, dataclass
from datetime import datetime, timezone
import os
import time
from typing import Any, Dict, Iterable, List, Optional, Sequence, Union

import polars as pl

from src.contract.models import CanonicalTransaction
from src.features.transaction import compute_transaction_features
from src.features.temporal import TemporalTracker
from src.features.network import NetworkTracker
from src.features.entity import EntityTracker
from src.features.graph import compute_graph_features

FEATURE_SCHEMA_VERSION = "sanket-features-v1"

# Feature group taxonomy mapping directly to future detector evidence categories
FEATURE_GROUPS = {
    "TRANSACTION": [
        "input_count",
        "output_count",
        "total_input_amount",
        "total_output_amount",
        "fee",
        "fee_ratio",
        "input_output_count_ratio",
        "input_output_amount_ratio",
        "amount_mean",
        "amount_std",
        "amount_cv",
        "output_concentration",
        "equal_output_ratio",
        "round_amount_ratio",
        "fan_in_ratio",
        "fan_out_ratio",
    ],
    "TEMPORAL": [
        "tx_count_5m",
        "tx_count_1h",
        "tx_count_24h",
        "volume_5m",
        "volume_1h",
        "volume_24h",
        "mean_interarrival",
        "median_interarrival",
        "burst_score",
        "velocity_ratio",
        "history_count",
        "baseline_stability",
    ],
    "NETWORK": [
        "unique_ips",
        "unique_addresses_per_ip",
        "ip_reuse_count",
        "unique_asns",
        "asn_concentration",
        "unique_countries",
        "country_count",
        "src_port_frequency",
        "dst_port_frequency",
        "endpoint_recurrence",
        "ip_reuse_count_24h",
        "unique_addresses_per_ip_24h",
        "endpoint_recurrence_24h",
    ],
    "ENTITY": [
        "entity_tx_count",
        "entity_volume",
        "entity_age_seconds",
        "unique_counterparties",
        "unique_ips",
        "historical_median_amount",
        "historical_MAD_amount",
        "baseline_deviation",
        "activity_change",
    ],
    "GRAPH": [
        "fan_in_degree",
        "fan_out_degree",
        "bipartite_density",
        "address_reuse_in_tx",
        "is_peeling_structure",
        "is_consolidation_structure",
        "is_dispersion_structure",
        "is_equal_split_structure",
    ],
    "DATA_QUALITY": [
        "field_completeness",
        "timestamp_valid",
        "network_metadata_completeness",
        "amount_data_completeness",
    ],
}

FEATURE_REGISTRY: Dict[str, Dict[str, str]] = {
    # Transaction Features
    "input_count": {
        "group": "TRANSACTION",
        "definition": "Number of input addresses in the transaction",
        "units": "count",
        "range": "[1, inf)",
    },
    "output_count": {
        "group": "TRANSACTION",
        "definition": "Number of output addresses in the transaction",
        "units": "count",
        "range": "[1, inf)",
    },
    "total_input_amount": {
        "group": "TRANSACTION",
        "definition": "Total BTC value supplied across all transaction inputs",
        "units": "BTC",
        "range": "[0.0, inf)",
    },
    "total_output_amount": {
        "group": "TRANSACTION",
        "definition": "Total BTC value distributed across all transaction outputs",
        "units": "BTC",
        "range": "[0.0, inf)",
    },
    "fee": {
        "group": "TRANSACTION",
        "definition": "Miner transaction fee in BTC",
        "units": "BTC",
        "range": "[0.0, inf)",
    },
    "fee_ratio": {
        "group": "TRANSACTION",
        "definition": "Ratio of transaction fee to total input amount",
        "units": "ratio",
        "range": "[0.0, 1.0]",
    },
    "input_output_count_ratio": {
        "group": "TRANSACTION",
        "definition": "Ratio of input address count to output address count",
        "units": "ratio",
        "range": "[0.0, inf)",
    },
    "input_output_amount_ratio": {
        "group": "TRANSACTION",
        "definition": "Ratio of total input BTC to total output BTC",
        "units": "ratio",
        "range": "[1.0, inf)",
    },
    "amount_mean": {
        "group": "TRANSACTION",
        "definition": "Arithmetic mean of output amounts",
        "units": "BTC",
        "range": "[0.0, inf)",
    },
    "amount_std": {
        "group": "TRANSACTION",
        "definition": "Standard deviation of output amounts",
        "units": "BTC",
        "range": "[0.0, inf)",
    },
    "amount_cv": {
        "group": "TRANSACTION",
        "definition": "Coefficient of variation of output amounts (std / mean)",
        "units": "ratio",
        "range": "[0.0, inf)",
    },
    "output_concentration": {
        "group": "TRANSACTION",
        "definition": "Herfindahl-Hirschman index (HHI) of output amounts distribution",
        "units": "index",
        "range": "(0.0, 1.0]",
    },
    "equal_output_ratio": {
        "group": "TRANSACTION",
        "definition": "Proportion of outputs sharing the most common denomination",
        "units": "ratio",
        "range": "(0.0, 1.0]",
    },
    "round_amount_ratio": {
        "group": "TRANSACTION",
        "definition": "Proportion of outputs with round values in satoshis",
        "units": "ratio",
        "range": "[0.0, 1.0]",
    },
    "fan_in_ratio": {
        "group": "TRANSACTION",
        "definition": "Proportion of total endpoints that are inputs (input / (input + output))",
        "units": "ratio",
        "range": "[0.0, 1.0]",
    },
    "fan_out_ratio": {
        "group": "TRANSACTION",
        "definition": "Proportion of total endpoints that are outputs (output / (input + output))",
        "units": "ratio",
        "range": "[0.0, 1.0]",
    },
    # Temporal Features
    "tx_count_5m": {
        "group": "TEMPORAL",
        "definition": "Cumulative transaction count for the entity in trailing 5-minute window",
        "units": "count",
        "range": "[1, inf)",
    },
    "tx_count_1h": {
        "group": "TEMPORAL",
        "definition": "Cumulative transaction count for the entity in trailing 1-hour window",
        "units": "count",
        "range": "[1, inf)",
    },
    "tx_count_24h": {
        "group": "TEMPORAL",
        "definition": "Cumulative transaction count for the entity in trailing 24-hour window",
        "units": "count",
        "range": "[1, inf)",
    },
    "volume_5m": {
        "group": "TEMPORAL",
        "definition": "Cumulative BTC volume for the entity in trailing 5-minute window",
        "units": "BTC",
        "range": "[0.0, inf)",
    },
    "volume_1h": {
        "group": "TEMPORAL",
        "definition": "Cumulative BTC volume for the entity in trailing 1-hour window",
        "units": "BTC",
        "range": "[0.0, inf)",
    },
    "volume_24h": {
        "group": "TEMPORAL",
        "definition": "Cumulative BTC volume for the entity in trailing 24-hour window",
        "units": "BTC",
        "range": "[0.0, inf)",
    },
    "mean_interarrival": {
        "group": "TEMPORAL",
        "definition": "Mean time delta in seconds between consecutive historical transactions",
        "units": "seconds",
        "range": "[0.0, inf)",
    },
    "median_interarrival": {
        "group": "TEMPORAL",
        "definition": "Median time delta in seconds between consecutive historical transactions",
        "units": "seconds",
        "range": "[0.0, inf)",
    },
    "burst_score": {
        "group": "TEMPORAL",
        "definition": "Normalized ratio of short-term rate (5m) to medium-term rate (1h)",
        "units": "ratio",
        "range": "[0.0, inf)",
    },
    "velocity_ratio": {
        "group": "TEMPORAL",
        "definition": "Normalized ratio of short-term volume rate to 1-hour volume rate",
        "units": "ratio",
        "range": "[0.0, inf)",
    },
    "history_count": {
        "group": "TEMPORAL",
        "definition": "Total number of prior transactions observed strictly before current time",
        "units": "count",
        "range": "[0, inf)",
    },
    "baseline_stability": {
        "group": "TEMPORAL",
        "definition": "Confidence indicator [0.0, 1.0] reflecting maturity of historical baseline",
        "units": "score",
        "range": "[0.0, 1.0]",
    },
    # Network Features
    "unique_ips": {
        "group": "NETWORK",
        "definition": "Cumulative number of distinct source IPs observed for the entity",
        "units": "count",
        "range": "[1, inf)",
    },
    "unique_addresses_per_ip": {
        "group": "NETWORK",
        "definition": "Distinct addresses observed from this IP in trailing 1-hour rolling window",
        "units": "count",
        "range": "[1, inf)",
    },
    "ip_reuse_count": {
        "group": "NETWORK",
        "definition": "Prior observations of the current source IP in trailing 1-hour rolling window",
        "units": "count",
        "range": "[0, inf)",
    },
    "unique_asns": {
        "group": "NETWORK",
        "definition": "Cumulative number of distinct ASNs associated with the entity",
        "units": "count",
        "range": "[1, inf)",
    },
    "asn_concentration": {
        "group": "NETWORK",
        "definition": "Herfindahl index of ASN distribution across entity observations",
        "units": "index",
        "range": "(0.0, 1.0]",
    },
    "unique_countries": {
        "group": "NETWORK",
        "definition": "Cumulative number of distinct countries associated with the entity",
        "units": "count",
        "range": "[1, inf)",
    },
    "country_count": {
        "group": "NETWORK",
        "definition": "Cumulative observations originating in the transaction's country code",
        "units": "count",
        "range": "[1, inf)",
    },
    "src_port_frequency": {
        "group": "NETWORK",
        "definition": "Cumulative observations of the transaction's source port",
        "units": "count",
        "range": "[1, inf)",
    },
    "dst_port_frequency": {
        "group": "NETWORK",
        "definition": "Cumulative observations of the transaction's destination port",
        "units": "count",
        "range": "[1, inf)",
    },
    "endpoint_recurrence": {
        "group": "NETWORK",
        "definition": "Observations of the specific (src_ip, dst_ip) endpoint pair in trailing 1-hour rolling window",
        "units": "count",
        "range": "[1, inf)",
    },
    "ip_reuse_count_24h": {
        "group": "NETWORK",
        "definition": "Prior observations of the current source IP in trailing 24-hour rolling window",
        "units": "count",
        "range": "[0, inf)",
    },
    "unique_addresses_per_ip_24h": {
        "group": "NETWORK",
        "definition": "Distinct addresses observed from this IP in trailing 24-hour rolling window",
        "units": "count",
        "range": "[1, inf)",
    },
    "endpoint_recurrence_24h": {
        "group": "NETWORK",
        "definition": "Observations of the specific (src_ip, dst_ip) endpoint pair in trailing 24-hour rolling window",
        "units": "count",
        "range": "[1, inf)",
    },
    # Entity Features
    "entity_tx_count": {
        "group": "ENTITY",
        "definition": "Cumulative transaction count observed for this entity",
        "units": "count",
        "range": "[1, inf)",
    },
    "entity_volume": {
        "group": "ENTITY",
        "definition": "Cumulative output BTC volume observed for this entity",
        "units": "BTC",
        "range": "[0.0, inf)",
    },
    "entity_age_seconds": {
        "group": "ENTITY",
        "definition": "Elapsed seconds from the entity's first appearance to current transaction",
        "units": "seconds",
        "range": "[0.0, inf)",
    },
    "unique_counterparties": {
        "group": "ENTITY",
        "definition": "Cumulative count of distinct counterparty destination addresses",
        "units": "count",
        "range": "[1, inf)",
    },
    "historical_median_amount": {
        "group": "ENTITY",
        "definition": "Median output amount across historical transactions for this entity",
        "units": "BTC",
        "range": "[0.0, inf)",
    },
    "historical_MAD_amount": {
        "group": "ENTITY",
        "definition": "Median Absolute Deviation (MAD) of historical output amounts",
        "units": "BTC",
        "range": "[0.0, inf)",
    },
    "baseline_deviation": {
        "group": "ENTITY",
        "definition": "Modified Z-score distance of current amount from historical median (|x - med| / (1.4826 * MAD))",
        "units": "score",
        "range": "[0.0, inf)",
    },
    "activity_change": {
        "group": "ENTITY",
        "definition": "Ratio of recent activity rate (1h) to long-term average activity rate",
        "units": "ratio",
        "range": "[0.0, inf)",
    },
    # Graph Features
    "fan_in_degree": {
        "group": "GRAPH",
        "definition": "In-degree of transaction node in address bipartite graph",
        "units": "count",
        "range": "[1, inf)",
    },
    "fan_out_degree": {
        "group": "GRAPH",
        "definition": "Out-degree of transaction node in address bipartite graph",
        "units": "count",
        "range": "[1, inf)",
    },
    "bipartite_density": {
        "group": "GRAPH",
        "definition": "Density of local bipartite edges relative to cross connections",
        "units": "ratio",
        "range": "[0.0, 2.0]",
    },
    "address_reuse_in_tx": {
        "group": "GRAPH",
        "definition": "Count of addresses present in both inputs and outputs (self-churn)",
        "units": "count",
        "range": "[0, inf)",
    },
    "is_peeling_structure": {
        "group": "GRAPH",
        "definition": "Binary indicator for peeling chain motif (1-2 in, 2 out with asymmetric split)",
        "units": "binary",
        "range": "{0.0, 1.0}",
    },
    "is_consolidation_structure": {
        "group": "GRAPH",
        "definition": "Binary indicator for consolidation motif (>=5 in, <=2 out)",
        "units": "binary",
        "range": "{0.0, 1.0}",
    },
    "is_dispersion_structure": {
        "group": "GRAPH",
        "definition": "Binary indicator for dispersion motif (<=2 in, >=5 out)",
        "units": "binary",
        "range": "{0.0, 1.0}",
    },
    "is_equal_split_structure": {
        "group": "GRAPH",
        "definition": "Binary indicator for equal split / CoinJoin mixing motif (>=3 out, equal amounts)",
        "units": "binary",
        "range": "{0.0, 1.0}",
    },
    # Data Quality Features
    "field_completeness": {
        "group": "DATA_QUALITY",
        "definition": "Proportion of canonical schema fields populated in record",
        "units": "ratio",
        "range": "[0.0, 1.0]",
    },
    "timestamp_valid": {
        "group": "DATA_QUALITY",
        "definition": "Binary indicator whether timestamp is a valid UTC timestamp",
        "units": "binary",
        "range": "{0.0, 1.0}",
    },
    "network_metadata_completeness": {
        "group": "DATA_QUALITY",
        "definition": "Proportion of network metadata fields populated in record",
        "units": "ratio",
        "range": "[0.0, 1.0]",
    },
    "amount_data_completeness": {
        "group": "DATA_QUALITY",
        "definition": "Binary indicator that inputs, outputs, and fees are non-empty and non-negative",
        "units": "binary",
        "range": "{0.0, 1.0}",
    },
}


def compute_data_quality_features(record: Dict[str, Any]) -> Dict[str, float]:
    """Calculate completeness and structural validity of canonical transaction telemetry."""
    canonical_keys = [
        "event_id",
        "txid",
        "timestamp",
        "src_ip",
        "dst_ip",
        "src_port",
        "dst_port",
        "input_addresses",
        "output_addresses",
        "input_amounts",
        "output_amounts",
        "fee",
        "script_type",
        "geo_country",
        "asn",
    ]
    non_empty = 0
    for k in canonical_keys:
        v = record.get(k)
        if v is not None and v != "" and v != []:
            non_empty += 1
    field_completeness = round(float(non_empty) / float(len(canonical_keys)), 4)

    # Timestamp validity
    ts_val = record.get("timestamp")
    timestamp_valid = 0.0
    if ts_val:
        try:
            if isinstance(ts_val, datetime):
                timestamp_valid = 1.0
            else:
                s = str(ts_val).replace("Z", "+00:00")
                dt = datetime.fromisoformat(s)
                if 2009 <= dt.year <= 2035:
                    timestamp_valid = 1.0
        except Exception:
            timestamp_valid = 0.0

    # Network metadata completeness
    net_keys = ["src_ip", "dst_ip", "src_port", "dst_port", "geo_country", "asn"]
    net_non_empty = sum(
        1 for k in net_keys if record.get(k) is not None and record.get(k) != ""
    )
    network_metadata_completeness = round(float(net_non_empty) / float(len(net_keys)), 4)

    # Amount data completeness
    in_amts = record.get("input_amounts") or []
    out_amts = record.get("output_amounts") or []
    fee = record.get("fee")
    amount_valid = (
        len(in_amts) > 0
        and len(out_amts) > 0
        and fee is not None
        and float(fee) >= 0.0
        and all(float(a) >= 0.0 for a in in_amts)
        and all(float(a) >= 0.0 for a in out_amts)
    )
    amount_data_completeness = 1.0 if amount_valid else 0.0

    return {
        "field_completeness": field_completeness,
        "timestamp_valid": timestamp_valid,
        "network_metadata_completeness": network_metadata_completeness,
        "amount_data_completeness": amount_data_completeness,
    }


class FeaturePipeline:
    """
    SANKET Feature Pipeline.
    Processes canonical Bitcoin transactions in chronological order and produces
    normalized, scikit-learn ready feature vectors.
    """
    def __init__(self):
        self.temporal_tracker = TemporalTracker()
        self.network_tracker = NetworkTracker()
        self.entity_tracker = EntityTracker()

    @staticmethod
    def _coerce_record(record: Any) -> Dict[str, Any]:
        """Convert CanonicalTransaction model or dict into a standard dictionary."""
        if hasattr(record, "model_dump"):
            return record.model_dump(mode="python")
        if isinstance(record, dict):
            return dict(record)
        raise TypeError(f"Unsupported record type: {type(record)}")

    def extract_features(
        self,
        records: Iterable[Any],
    ) -> List[Dict[str, Any]]:
        """
        Process an iterable of canonical transaction records in chronological order.
        Returns a list of feature dictionaries, one per transaction.
        """
        # Coerce to dicts
        raw_list = [self._coerce_record(r) for r in records]

        # Ensure chronological ordering (stable sort on timestamp)
        # Note: In SANKET feeds timestamps are already ordered, but sort guarantees invariance
        def _get_sort_time(rec: Dict[str, Any]) -> float:
            ts = rec.get("timestamp")
            return TemporalTracker.parse_timestamp_to_epoch(ts)

        sorted_records = sorted(raw_list, key=_get_sort_time)

        results: List[Dict[str, Any]] = []

        for record in sorted_records:
            txid = str(record.get("txid") or "")
            timestamp = str(record.get("timestamp") or "")

            # 1. Transaction structural features
            tx_feats = compute_transaction_features(record)

            # 2. Temporal rolling features
            temp_feats = self.temporal_tracker.process_transaction(record)

            # 3. Observational network features
            net_feats = self.network_tracker.process_transaction(record)

            # 4. Entity profile and dispersion features
            ent_feats = self.entity_tracker.process_transaction(
                record, tx_count_1h=temp_feats["tx_count_1h"]
            )

            # 5. Local graph topology features
            graph_feats = compute_graph_features(record, tx_feats)

            # 6. Data quality confidence features
            quality_feats = compute_data_quality_features(record)

            feature_row: Dict[str, Any] = {
                "txid": txid,
                "timestamp": timestamp,
                "feature_schema_version": FEATURE_SCHEMA_VERSION,
            }
            feature_row.update(tx_feats)
            feature_row.update(temp_feats)
            feature_row.update(net_feats)
            feature_row.update(ent_feats)
            feature_row.update(graph_feats)
            feature_row.update(quality_feats)

            results.append(feature_row)

        return results

    def extract_features_df(self, records: Iterable[Any]) -> pl.DataFrame:
        """Process canonical transactions and return a typed Polars DataFrame."""
        rows = self.extract_features(records)
        return pl.DataFrame(rows)


def extract_features_from_parquet(parquet_path: str) -> pl.DataFrame:
    """Convenience function: load canonical Parquet file and compute feature DataFrame."""
    df_raw = pl.read_parquet(parquet_path)
    records = df_raw.to_dicts()
    pipeline = FeaturePipeline()
    return pipeline.extract_features_df(records)
