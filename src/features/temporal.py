"""
SANKET Feature Engineering: Temporal Features
Tracks chronological observation history and rolling temporal baselines.
Guarantees strict forward-only temporal processing with zero future-data leakage.
"""
from collections import deque
from datetime import datetime, timezone
import statistics
from typing import Any, Deque, Dict, List, Optional, Tuple


class TemporalTracker:
    """
    Maintains rolling state per entity (primary input address or source IP)
    across a chronologically ordered sequence of transactions.
    """
    def __init__(self, baseline_threshold: int = 15):
        self.baseline_threshold = baseline_threshold
        # Per entity state:
        # deques store tuples of (timestamp_epoch_sec, volume)
        self._deques_5m: Dict[str, Deque[Tuple[float, float]]] = {}
        self._deques_1h: Dict[str, Deque[Tuple[float, float]]] = {}
        self._deques_24h: Dict[str, Deque[Tuple[float, float]]] = {}

        self._sum_5m: Dict[str, float] = {}
        self._sum_1h: Dict[str, float] = {}
        self._sum_24h: Dict[str, float] = {}

        self._last_timestamp: Dict[str, float] = {}
        self._interarrivals: Dict[str, List[float]] = {}
        self._history_count: Dict[str, int] = {}
        # Chain-aware UTXO lineage: out_addr -> (timestamp, txid, src_ip, hops)
        self._utxo_lineage: Dict[str, Tuple[float, str, str, int]] = {}

    def _get_entity_key(self, record: Dict[str, Any]) -> str:
        in_addrs = record.get("input_addresses") or []
        if in_addrs and in_addrs[0]:
            return str(in_addrs[0])
        src_ip = record.get("src_ip")
        if src_ip:
            return f"ip_{src_ip}"
        return "unknown_entity"

    @staticmethod
    def parse_timestamp_to_epoch(ts_val: Any) -> float:
        """Parse ISO string or datetime to Unix epoch timestamp in seconds."""
        if isinstance(ts_val, (int, float)):
            return float(ts_val)
        if isinstance(ts_val, datetime):
            if ts_val.tzinfo is None:
                ts_val = ts_val.replace(tzinfo=timezone.utc)
            return ts_val.timestamp()
        s = str(ts_val).replace("Z", "+00:00")
        dt = datetime.fromisoformat(s)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt.timestamp()

    def process_transaction(self, record: Dict[str, Any]) -> Dict[str, float]:
        """
        Compute temporal rolling features for a transaction strictly using prior history,
        then update state with the current transaction.

        Parameters:
            record: Canonical transaction record.

        Returns:
            Dictionary of temporal features for this transaction.
        """
        entity = self._get_entity_key(record)
        t = self.parse_timestamp_to_epoch(record.get("timestamp"))
        out_amts = record.get("output_amounts") or []
        current_volume = float(sum(out_amts)) if out_amts else 0.0

        # Check chain-aware UTXO lineage (parent -> child transaction linkage)
        in_addrs = record.get("input_addresses") or []
        out_addrs = record.get("output_addresses") or []
        src_ip = str(record.get("src_ip") or "")
        txid = str(record.get("txid") or "")

        chain_parent = None
        for a in in_addrs:
            if a and a in self._utxo_lineage:
                chain_parent = self._utxo_lineage[a]
                break

        chain_hops = 1
        chain_interval = 0.0
        if chain_parent is not None:
            p_t, p_txid, p_ip, p_hops = chain_parent
            chain_interval = max(0.0, t - p_t)
            chain_hops = p_hops + 1

        history_cnt = self._history_count.get(entity, 0)
        # If entity has 0 history (fresh address) but continues an active chain, inherit lineage history
        if history_cnt == 0 and chain_parent is not None and chain_interval <= 300.0:
            history_cnt = chain_parent[3]

        # Initialize tracking structures for new entity
        if entity not in self._deques_5m:
            self._deques_5m[entity] = deque()
            self._deques_1h[entity] = deque()
            self._deques_24h[entity] = deque()
            self._sum_5m[entity] = 0.0
            self._sum_1h[entity] = 0.0
            self._sum_24h[entity] = 0.0
            self._interarrivals[entity] = []

        d5 = self._deques_5m[entity]
        d1 = self._deques_1h[entity]
        d24 = self._deques_24h[entity]

        # Purge entries outside trailing windows [t - window, t]
        cutoff_5m = t - 300.0
        while d5 and d5[0][0] < cutoff_5m:
            self._sum_5m[entity] -= d5.popleft()[1]

        cutoff_1h = t - 3600.0
        while d1 and d1[0][0] < cutoff_1h:
            self._sum_1h[entity] -= d1.popleft()[1]

        cutoff_24h = t - 86400.0
        while d24 and d24[0][0] < cutoff_24h:
            self._sum_24h[entity] -= d24.popleft()[1]

        # Clamp floating point roundoff
        self._sum_5m[entity] = max(0.0, self._sum_5m[entity])
        self._sum_1h[entity] = max(0.0, self._sum_1h[entity])
        self._sum_24h[entity] = max(0.0, self._sum_24h[entity])

        # Current window counts and volumes include the current transaction
        tx_count_5m = float(len(d5) + 1)
        tx_count_1h = float(len(d1) + 1)
        tx_count_24h = float(len(d24) + 1)

        # In a rapid chain continuation within 5 minutes, reflect chain hop density
        if chain_parent is not None and chain_interval <= 300.0:
            tx_count_5m = max(tx_count_5m, float(chain_hops))

        volume_5m = self._sum_5m[entity] + current_volume
        volume_1h = self._sum_1h[entity] + current_volume
        volume_24h = self._sum_24h[entity] + current_volume

        # Update inter-arrival delta if entity was previously observed
        if entity in self._last_timestamp:
            delta = max(0.0, t - self._last_timestamp[entity])
            if len(self._interarrivals[entity]) >= 100:
                self._interarrivals[entity].pop(0)
            self._interarrivals[entity].append(delta)

        # Inter-arrival times
        prior_intervals = self._interarrivals[entity]
        if prior_intervals:
            mean_interarrival = float(statistics.mean(prior_intervals))
            median_interarrival = float(statistics.median(prior_intervals))
        elif chain_parent is not None and chain_interval > 0.0:
            # Chain-aware lineage interval from direct parent transaction
            mean_interarrival = float(chain_interval)
            median_interarrival = float(chain_interval)
        else:
            mean_interarrival = 0.0
            median_interarrival = 0.0

        # Burst score: short-term transaction rate vs 1-hour rate
        # Normalized: (tx_count_5m / 300s) / (tx_count_1h / 3600s) = (tx_count_5m * 12) / tx_count_1h
        if tx_count_1h > 1.0:
            burst_score = (tx_count_5m * 12.0) / tx_count_1h
        elif chain_parent is not None and chain_interval <= 300.0 and tx_count_5m >= 2.0:
            burst_score = tx_count_5m * 2.0
        else:
            burst_score = 1.0  # Cold-start / baseline neutral

        # Velocity ratio: short-term volume rate vs 1-hour volume rate
        if volume_1h > 1e-12:
            velocity_ratio = (volume_5m * 12.0) / volume_1h
        else:
            velocity_ratio = 1.0

        # Baseline stability: 0.0 on cold start, scaling to 1.0 as history accumulates
        baseline_stability = min(1.0, float(history_cnt) / float(self.baseline_threshold))

        # --- Update State for Future Transactions ---
        self._last_timestamp[entity] = t
        self._history_count[entity] = history_cnt + 1

        d5.append((t, current_volume))
        d1.append((t, current_volume))
        d24.append((t, current_volume))

        self._sum_5m[entity] += current_volume
        self._sum_1h[entity] += current_volume
        self._sum_24h[entity] += current_volume

        # --- Update UTXO lineage for output addresses ---
        for a in out_addrs:
            if a:
                self._utxo_lineage[str(a)] = (t, txid, src_ip, chain_hops)

        # Bounded memory cleanup (prune lineage entries older than 3600s if table grows large)
        if len(self._utxo_lineage) > 25000:
            cutoff = t - 3600.0
            self._utxo_lineage = {
                addr: data for addr, data in self._utxo_lineage.items() if data[0] >= cutoff
            }

        return {
            "tx_count_5m": tx_count_5m,
            "tx_count_1h": tx_count_1h,
            "tx_count_24h": tx_count_24h,
            "volume_5m": round(volume_5m, 8),
            "volume_1h": round(volume_1h, 8),
            "volume_24h": round(volume_24h, 8),
            "mean_interarrival": round(mean_interarrival, 2),
            "median_interarrival": round(median_interarrival, 2),
            "burst_score": round(burst_score, 4),
            "velocity_ratio": round(velocity_ratio, 4),
            "history_count": float(history_cnt),
            "baseline_stability": round(baseline_stability, 4),
        }
