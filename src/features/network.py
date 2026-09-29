"""
SANKET Feature Engineering: Network Features
Observational network topology, endpoint recurrence, and telemetry diversity.
These features model network vantage point patterns without assuming address ownership.

Network reuse signals (ip_reuse_count, endpoint_recurrence, unique_addresses_per_ip)
use rolling temporal windows (1h and 24h) to prevent lifetime accumulation artifacts
that inflate false-positive rates over long observation periods.
"""
import bisect
from collections import deque
from datetime import datetime, timezone
from typing import Any, Deque, Dict, List, Optional, Set, Tuple


class NetworkTracker:
    """
    Maintains observational network state across a chronologically ordered transaction stream.
    Tracks IP reuse, address dispersion across IPs, ASN concentration, and endpoint recurrence.

    Rolling temporal windows (1h and 24h) are used for reuse/recurrence signals to prevent
    lifetime accumulation from inflating scores over long observation periods.
    Lifetime counters remain for ASN, country, and port features where accumulation is appropriate.
    """

    WINDOW_1H = 3600.0    # 1 hour in seconds
    WINDOW_24H = 86400.0  # 24 hours in seconds
    PRUNE_INTERVAL = 2000 # Prune expired state every 2000 transactions

    def __init__(self):
        # Entity-level network observations (lifetime — for ASN/country/IP set tracking)
        self._entity_ips: Dict[str, Set[str]] = {}
        self._entity_asns: Dict[str, Dict[str, int]] = {}
        self._entity_countries: Dict[str, Set[str]] = {}

        # Global network telemetry tracking (lifetime — for port/country features)
        self._ip_addresses: Dict[str, Set[str]] = {}
        self._ip_tx_count: Dict[str, int] = {}
        self._country_tx_count: Dict[str, int] = {}
        self._src_port_count: Dict[int, int] = {}
        self._dst_port_count: Dict[int, int] = {}
        self._endpoint_count: Dict[Tuple[str, str], int] = {}

        # Rolling temporal window deques for network reuse signals
        # IP reuse: per-IP deque of timestamps
        self._ip_deques_1h: Dict[str, Deque[float]] = {}
        self._ip_deques_24h: Dict[str, Deque[float]] = {}

        # Address-per-IP dispersion: per-IP deque of (timestamp, entity) and O(1) count mapping
        self._ip_addr_deques_1h: Dict[str, Deque[Tuple[float, str]]] = {}
        self._ip_addr_deques_24h: Dict[str, Deque[Tuple[float, str]]] = {}
        self._addr_counts_1h: Dict[str, Dict[str, int]] = {}
        self._addr_counts_24h: Dict[str, Dict[str, int]] = {}

        # Endpoint recurrence: per-endpoint-pair deque of timestamps
        self._endpoint_deques_1h: Dict[Tuple[str, str], Deque[float]] = {}
        self._endpoint_deques_24h: Dict[Tuple[str, str], Deque[float]] = {}

        # Housekeeping for bounded memory
        self._tx_counter: int = 0
        self._max_seen_timestamp: float = 0.0

    @staticmethod
    def parse_timestamp_to_epoch(ts_val: Any) -> float:
        """Parse ISO string, datetime, or numeric to Unix epoch seconds. Returns 0.0 for missing."""
        if ts_val is None:
            return 0.0
        if isinstance(ts_val, (int, float)):
            return float(ts_val)
        if isinstance(ts_val, datetime):
            if ts_val.tzinfo is None:
                ts_val = ts_val.replace(tzinfo=timezone.utc)
            return ts_val.timestamp()
        s = str(ts_val)
        if not s or s in ("None", "none", "null", "0"):
            return 0.0
        s = s.replace("Z", "+00:00")
        try:
            dt = datetime.fromisoformat(s)
            if dt.tzinfo is None:
                dt = dt.replace(tzinfo=timezone.utc)
            return dt.timestamp()
        except (ValueError, TypeError):
            return 0.0

    def _get_entity_key(self, record: Dict[str, Any]) -> str:
        in_addrs = record.get("input_addresses") or []
        if in_addrs and in_addrs[0]:
            return str(in_addrs[0])
        src_ip = record.get("src_ip")
        if src_ip:
            return f"ip_{src_ip}"
        return "unknown_entity"

    @staticmethod
    def _purge_ts_deque(d: Deque[float], cutoff: float) -> None:
        """Remove entries strictly before cutoff from a timestamp-only deque."""
        while d and d[0] < cutoff:
            d.popleft()

    @staticmethod
    def _purge_addr_deque(
        d: Deque[Tuple[float, str]],
        counts: Dict[str, int],
        cutoff: float,
    ) -> None:
        """Remove entries strictly before cutoff and update distinct address counts in O(1)."""
        while d and d[0][0] < cutoff:
            _, addr = d.popleft()
            cnt = counts.get(addr, 0) - 1
            if cnt <= 0:
                counts.pop(addr, None)
            else:
                counts[addr] = cnt

    def _prune_expired_state(self, current_time: float) -> None:
        """Evict stale per-IP and per-endpoint tracking structures older than 24 hours to bound memory."""
        cutoff_24h = current_time - self.WINDOW_24H

        stale_ips = [
            ip for ip, d in self._ip_deques_24h.items()
            if not d or d[-1] < cutoff_24h
        ]
        for ip in stale_ips:
            self._ip_deques_1h.pop(ip, None)
            self._ip_deques_24h.pop(ip, None)
            self._ip_addr_deques_1h.pop(ip, None)
            self._ip_addr_deques_24h.pop(ip, None)
            self._addr_counts_1h.pop(ip, None)
            self._addr_counts_24h.pop(ip, None)

        stale_endpoints = [
            ep for ep, d in self._endpoint_deques_24h.items()
            if not d or d[-1] < cutoff_24h
        ]
        for ep in stale_endpoints:
            self._endpoint_deques_1h.pop(ep, None)
            self._endpoint_deques_24h.pop(ep, None)

    def process_transaction(self, record: Dict[str, Any]) -> Dict[str, float]:
        """
        Compute observational network features for the transaction, then update network state.

        Network reuse signals (ip_reuse_count, unique_addresses_per_ip, endpoint_recurrence)
        use rolling 1-hour temporal windows. The corresponding _24h variants use 24-hour windows.
        ASN, country, and port features remain lifetime-accumulated where appropriate.

        Parameters:
            record: Canonical transaction record.

        Returns:
            Dictionary of network features.
        """
        entity = self._get_entity_key(record)
        t = self.parse_timestamp_to_epoch(record.get("timestamp"))

        # Track maximum observed timestamp for global temporal reference
        if t > self._max_seen_timestamp:
            self._max_seen_timestamp = t

        # Periodic bounded memory pruning
        self._tx_counter += 1
        if self._tx_counter % self.PRUNE_INTERVAL == 0:
            self._prune_expired_state(max(t, self._max_seen_timestamp))

        # Safely parse IP fields; distinguish genuine IPs from missing/null placeholders
        src_ip_raw = record.get("src_ip")
        src_ip_str = str(src_ip_raw).strip() if src_ip_raw is not None else ""
        is_valid_src_ip = bool(src_ip_str and src_ip_str not in ("unknown_ip", "None", "none", "null", "0"))
        src_ip = src_ip_str if is_valid_src_ip else "unknown_ip"

        dst_ip_raw = record.get("dst_ip")
        dst_ip_str = str(dst_ip_raw).strip() if dst_ip_raw is not None else ""
        is_valid_dst_ip = bool(dst_ip_str and dst_ip_str not in ("unknown_ip", "None", "none", "null", "0"))
        dst_ip = dst_ip_str if is_valid_dst_ip else "unknown_ip"

        is_valid_endpoint = is_valid_src_ip and is_valid_dst_ip
        endpoint_key = (src_ip, dst_ip)

        src_port = int(record.get("src_port") or 0)
        dst_port = int(record.get("dst_port") or 0)
        asn = str(record.get("asn") or "unknown_asn")
        country = str(record.get("geo_country") or "unknown_country")

        cutoff_1h = t - self.WINDOW_1H
        cutoff_24h = t - self.WINDOW_24H

        # --- Compute Rolling IP Reuse & Address Dispersion ---
        if is_valid_src_ip:
            # Initialize tracking structures if first seen
            if src_ip not in self._ip_deques_1h:
                self._ip_deques_1h[src_ip] = deque()
                self._ip_deques_24h[src_ip] = deque()
                self._ip_addr_deques_1h[src_ip] = deque()
                self._ip_addr_deques_24h[src_ip] = deque()
                self._addr_counts_1h[src_ip] = {}
                self._addr_counts_24h[src_ip] = {}

            # Purge expired observations from rolling windows
            self._purge_ts_deque(self._ip_deques_1h[src_ip], cutoff_1h)
            self._purge_ts_deque(self._ip_deques_24h[src_ip], cutoff_24h)
            self._purge_addr_deque(self._ip_addr_deques_1h[src_ip], self._addr_counts_1h[src_ip], cutoff_1h)
            self._purge_addr_deque(self._ip_addr_deques_24h[src_ip], self._addr_counts_24h[src_ip], cutoff_24h)

            d1 = self._ip_deques_1h[src_ip]
            d24 = self._ip_deques_24h[src_ip]

            # In-order vs out-of-order safe prior counting (strictly no future leakage)
            if d1 and t < d1[-1]:
                ip_reuse_count = float(sum(1 for ts in d1 if ts <= t))
            else:
                ip_reuse_count = float(len(d1))

            if d24 and t < d24[-1]:
                ip_reuse_count_24h = float(sum(1 for ts in d24 if ts <= t))
            else:
                ip_reuse_count_24h = float(len(d24))

            # Address dispersion in O(1) via active count dictionaries
            counts_1h = self._addr_counts_1h[src_ip]
            unique_addresses_per_ip = float(len(counts_1h) + (1 if entity not in counts_1h else 0))

            counts_24h = self._addr_counts_24h[src_ip]
            unique_addresses_per_ip_24h = float(len(counts_24h) + (1 if entity not in counts_24h else 0))

            # Update rolling deques (maintain sorted order if out-of-order input)
            if d1 and t < d1[-1]:
                d1.append(t)
                self._ip_deques_1h[src_ip] = deque(sorted(d1))
                d24.append(t)
                self._ip_deques_24h[src_ip] = deque(sorted(d24))
            else:
                d1.append(t)
                d24.append(t)

            self._ip_addr_deques_1h[src_ip].append((t, entity))
            self._ip_addr_deques_24h[src_ip].append((t, entity))
            counts_1h[entity] = counts_1h.get(entity, 0) + 1
            counts_24h[entity] = counts_24h.get(entity, 0) + 1
        else:
            # Missing or unknown IP does NOT fabricate reuse across unrelated transactions
            ip_reuse_count = 0.0
            ip_reuse_count_24h = 0.0
            unique_addresses_per_ip = 1.0
            unique_addresses_per_ip_24h = 1.0

        # --- Compute Rolling Endpoint Recurrence ---
        if is_valid_endpoint:
            if endpoint_key not in self._endpoint_deques_1h:
                self._endpoint_deques_1h[endpoint_key] = deque()
                self._endpoint_deques_24h[endpoint_key] = deque()

            self._purge_ts_deque(self._endpoint_deques_1h[endpoint_key], cutoff_1h)
            self._purge_ts_deque(self._endpoint_deques_24h[endpoint_key], cutoff_24h)

            ep1 = self._endpoint_deques_1h[endpoint_key]
            ep24 = self._endpoint_deques_24h[endpoint_key]

            if ep1 and t < ep1[-1]:
                prior_ep_1h = sum(1 for ts in ep1 if ts <= t)
            else:
                prior_ep_1h = len(ep1)

            if ep24 and t < ep24[-1]:
                prior_ep_24h = sum(1 for ts in ep24 if ts <= t)
            else:
                prior_ep_24h = len(ep24)

            endpoint_recurrence = float(prior_ep_1h + 1)
            endpoint_recurrence_24h = float(prior_ep_24h + 1)

            if ep1 and t < ep1[-1]:
                ep1.append(t)
                self._endpoint_deques_1h[endpoint_key] = deque(sorted(ep1))
                ep24.append(t)
                self._endpoint_deques_24h[endpoint_key] = deque(sorted(ep24))
            else:
                ep1.append(t)
                ep24.append(t)
        else:
            # Missing endpoint pair safe fallback
            endpoint_recurrence = 1.0
            endpoint_recurrence_24h = 1.0

        # --- Lifetime Features (Unchanged Canonical Architecture) ---
        # Distinct IPs used by this entity
        current_entity_ips = self._entity_ips.get(entity, set())
        unique_ips = float(len(current_entity_ips | {src_ip})) if is_valid_src_ip else float(len(current_entity_ips)) or 1.0

        # Unique ASNs observed for this entity
        asn_map = self._entity_asns.get(entity, {})
        unique_asns = float(len(set(asn_map.keys()) | {asn}))

        # ASN concentration (HHI) for the entity
        total_entity_tx = sum(asn_map.values()) + 1
        hhi = 0.0
        for a_key, a_count in asn_map.items():
            count = a_count + (1 if a_key == asn else 0)
            share = float(count) / float(total_entity_tx)
            hhi += share * share
        if asn not in asn_map:
            share = 1.0 / float(total_entity_tx)
            hhi += share * share
        asn_concentration = min(1.0, max(0.0, hhi))

        # Unique countries observed for this entity
        current_entity_countries = self._entity_countries.get(entity, set())
        unique_countries = float(len(current_entity_countries | {country}))

        # Cumulative country count across dataset
        country_count = float(self._country_tx_count.get(country, 0) + 1)

        # Port frequencies
        src_port_frequency = float(self._src_port_count.get(src_port, 0) + 1)
        dst_port_frequency = float(self._dst_port_count.get(dst_port, 0) + 1)

        # Update lifetime state
        if entity not in self._entity_ips:
            self._entity_ips[entity] = set()
            self._entity_asns[entity] = {}
            self._entity_countries[entity] = set()

        if is_valid_src_ip:
            self._entity_ips[entity].add(src_ip)
            if src_ip not in self._ip_addresses:
                self._ip_addresses[src_ip] = set()
            self._ip_addresses[src_ip].add(entity)
            self._ip_tx_count[src_ip] = self._ip_tx_count.get(src_ip, 0) + 1

        self._entity_asns[entity][asn] = self._entity_asns[entity].get(asn, 0) + 1
        self._entity_countries[entity].add(country)
        self._country_tx_count[country] = self._country_tx_count.get(country, 0) + 1
        self._src_port_count[src_port] = self._src_port_count.get(src_port, 0) + 1
        self._dst_port_count[dst_port] = self._dst_port_count.get(dst_port, 0) + 1

        if is_valid_endpoint:
            self._endpoint_count[endpoint_key] = self._endpoint_count.get(endpoint_key, 0) + 1

        return {
            "unique_ips": unique_ips,
            "unique_addresses_per_ip": unique_addresses_per_ip,
            "ip_reuse_count": ip_reuse_count,
            "unique_asns": unique_asns,
            "asn_concentration": round(asn_concentration, 4),
            "unique_countries": unique_countries,
            "country_count": country_count,
            "src_port_frequency": src_port_frequency,
            "dst_port_frequency": dst_port_frequency,
            "endpoint_recurrence": endpoint_recurrence,
            "ip_reuse_count_24h": ip_reuse_count_24h,
            "unique_addresses_per_ip_24h": unique_addresses_per_ip_24h,
            "endpoint_recurrence_24h": endpoint_recurrence_24h,
        }

