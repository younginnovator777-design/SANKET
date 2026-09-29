"""
SANKET Feature Engineering: Entity Features
Tracks address/entity historical profiles, behavioral baselines, robust dispersion (MAD),
counterparty diversity, and activity velocity changes over time.
Does not assign semantic or investigative labels.
"""
from datetime import datetime, timezone
import statistics
from typing import Any, Dict, List, Optional, Set


class EntityTracker:
    """
    Maintains historical behavioral baselines per primary address / entity.
    Computes robust location and dispersion metrics (Median, MAD, Modified Z-score).
    """
    def __init__(self, max_history_window: int = 200):
        self.max_history_window = max_history_window

        self._first_seen: Dict[str, float] = {}
        self._tx_count: Dict[str, int] = {}
        self._total_volume: Dict[str, float] = {}
        self._amounts_history: Dict[str, List[float]] = {}
        self._counterparties: Dict[str, Set[str]] = {}
        self._entity_ips: Dict[str, Set[str]] = {}

    def _get_entity_key(self, record: Dict[str, Any]) -> str:
        in_addrs = record.get("input_addresses") or []
        if in_addrs and in_addrs[0]:
            return str(in_addrs[0])
        src_ip = record.get("src_ip")
        if src_ip:
            return f"ip_{src_ip}"
        return "unknown_entity"

    @staticmethod
    def _parse_time(ts_val: Any) -> float:
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

    def process_transaction(
        self,
        record: Dict[str, Any],
        tx_count_1h: float = 1.0,
    ) -> Dict[str, float]:
        """
        Compute entity behavioral features using prior history, then update entity baseline.

        Parameters:
            record: Canonical transaction record.
            tx_count_1h: Recent 1-hour transaction count (from temporal tracker).

        Returns:
            Dictionary of entity behavioral features.
        """
        entity = self._get_entity_key(record)
        t = self._parse_time(record.get("timestamp"))
        out_amts = record.get("output_amounts") or []
        current_amount = float(sum(out_amts)) if out_amts else 0.0
        out_addrs = record.get("output_addresses") or []
        src_ip = str(record.get("src_ip") or "unknown_ip")

        prior_count = self._tx_count.get(entity, 0)
        prior_vol = self._total_volume.get(entity, 0.0)

        # Entity age in seconds
        if entity in self._first_seen:
            entity_age_seconds = max(0.0, t - self._first_seen[entity])
        else:
            entity_age_seconds = 0.0

        # Unique counterparties (including current transaction)
        current_cp = self._counterparties.get(entity, set())
        unique_counterparties = float(len(current_cp | set(out_addrs)))

        # Unique IPs used by entity
        current_ips = self._entity_ips.get(entity, set())
        unique_ips = float(len(current_ips | {src_ip}))

        # Historical median and MAD (Median Absolute Deviation)
        prior_amounts = self._amounts_history.get(entity, [])
        if len(prior_amounts) >= 2:
            hist_median = float(statistics.median(prior_amounts))
            abs_devs = [abs(x - hist_median) for x in prior_amounts]
            hist_mad = float(statistics.median(abs_devs))
            # Modified Z-score: 1.4826 * MAD approximates standard deviation for normal dist
            scale = 1.4826 * hist_mad
            baseline_deviation = (
                abs(current_amount - hist_median) / scale if scale > 1e-6 else 0.0
            )
        elif len(prior_amounts) == 1:
            hist_median = float(prior_amounts[0])
            hist_mad = 0.0
            baseline_deviation = 0.0
        else:
            # Cold-start: first observation
            hist_median = current_amount
            hist_mad = 0.0
            baseline_deviation = 0.0

        # Activity change: ratio of current 1-hour rate to long-term average rate
        # Long-term hourly rate: (prior_count + 1) * 3600 / max(3600, entity_age_seconds)
        if entity_age_seconds >= 3600.0 and prior_count >= 2:
            long_term_hourly_rate = float(prior_count) * 3600.0 / entity_age_seconds
            activity_change = (
                tx_count_1h / long_term_hourly_rate if long_term_hourly_rate > 1e-4 else 1.0
            )
        else:
            activity_change = 1.0  # Cold-start neutral

        # Current transaction cumulative stats
        entity_tx_count = float(prior_count + 1)
        entity_volume = prior_vol + current_amount

        # --- Update State ---
        if entity not in self._first_seen:
            self._first_seen[entity] = t
            self._amounts_history[entity] = []
            self._counterparties[entity] = set()
            self._entity_ips[entity] = set()

        self._tx_count[entity] = prior_count + 1
        self._total_volume[entity] = entity_volume

        # Store recent amounts for rolling robust stats
        if len(self._amounts_history[entity]) >= self.max_history_window:
            self._amounts_history[entity].pop(0)
        self._amounts_history[entity].append(current_amount)

        self._counterparties[entity].update(out_addrs)
        self._entity_ips[entity].add(src_ip)

        return {
            "entity_tx_count": entity_tx_count,
            "entity_volume": round(entity_volume, 8),
            "entity_age_seconds": round(entity_age_seconds, 2),
            "unique_counterparties": unique_counterparties,
            "unique_ips": unique_ips,
            "historical_median_amount": round(hist_median, 8),
            "historical_MAD_amount": round(hist_mad, 8),
            "baseline_deviation": round(baseline_deviation, 4),
            "activity_change": round(activity_change, 4),
        }
