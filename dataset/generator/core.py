"""
Core models, entity management, temporal clock, and network topologies for SANKET.
Ensures deterministic generation of Bitcoin transactions with strict schema conformance.
"""
from dataclasses import dataclass, field
from datetime import datetime, timezone, timedelta
import hashlib
import math
import random
from typing import List, Tuple, Dict, Optional

from dataset.generator.config import GeneratorConfig

# Real-world autonomous system, country, and public IPv4 prefix pairings
NETWORK_POOLS: List[Tuple[str, str, str]] = [
    ("US", "AS15169", "172.217."),   # Google LLC
    ("US", "AS13335", "104.28."),    # Cloudflare Inc.
    ("US", "AS16509", "54.210."),    # Amazon.com / AWS
    ("US", "AS8075", "13.82."),      # Microsoft Azure
    ("DE", "AS24940", "159.69."),    # Hetzner Online GmbH
    ("FR", "AS12876", "51.255."),    # OVH SAS
    ("JP", "AS2516", "210.140."),    # KDDI Corporation
    ("GB", "AS2856", "81.130."),     # British Telecom
    ("DE", "AS3320", "217.80."),     # Deutsche Telekom
    ("SG", "AS45102", "47.74."),     # Alibaba Cloud SG
    ("CA", "AS376", "142.166."),     # Bell Canada
    ("NL", "AS1103", "192.87."),     # SURFnet NL
    ("CH", "AS13030", "178.209."),   # Init7 Switzerland
    ("SE", "AS8473", "84.21."),      # Bahnhof Internet SE
    ("AU", "AS4637", "139.130."),    # Telstra Australia
    ("KR", "AS2500", "211.234."),    # SK Telecom Korea
]

BASE58_CHARS = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz"
BECH32_CHARS = "qpzry9x8gf2tvdw0s3jn54khce6mua7l"


@dataclass(slots=True)
class GeneratedTransaction:
    """Canonical Bitcoin transaction matching src/contract/models.py."""
    event_id: str
    txid: str
    timestamp: str  # ISO-8601 UTC formatted string e.g. "2026-09-01T12:00:00Z"
    src_ip: str
    dst_ip: str
    src_port: int
    dst_port: int
    input_addresses: List[str]
    output_addresses: List[str]
    input_amounts: List[float]
    output_amounts: List[float]
    fee: float
    script_type: str
    geo_country: str
    asn: str


@dataclass(slots=True)
class TransactionLabel:
    """Evaluation label stored separately from transaction telemetry."""
    txid: str
    scenario: str
    entity_id: str
    scenario_instance_id: str
    is_benign: bool
    parent_txid: str = ""


@dataclass
class Entity:
    """Internal entity representation with reusable addresses and network identity."""
    entity_id: str
    entity_type: str
    addresses: List[str] = field(default_factory=list)
    preferred_ip: str = ""
    preferred_asn: str = ""
    preferred_country: str = ""
    preferred_script_type: str = "p2wpkh"


def sats_to_btc(sats: int) -> float:
    """Convert integer satoshis to BTC float with 8 decimal places."""
    return round(sats / 100_000_000, 8)


def btc_to_sats(btc: float) -> int:
    """Convert BTC float to integer satoshis."""
    return int(round(btc * 100_000_000))


def generate_txid(seed: int, tx_counter: int) -> str:
    """Deterministic 64-character hex transaction ID matching Bitcoin conventions."""
    return hashlib.sha256(f"sanket_tx_{seed}_{tx_counter}".encode()).hexdigest()


def generate_event_id(seed: int, tx_counter: int) -> str:
    """Deterministic unique event identifier."""
    return f"evt_{seed}_{tx_counter:08d}"


def generate_deterministic_address(rng: random.Random, script_type: str) -> str:
    """Generate syntactically plausible Bitcoin addresses deterministically."""
    if script_type == "p2pkh":
        body = "".join(rng.choice(BASE58_CHARS) for _ in range(33))
        return f"1{body}"
    elif script_type == "p2sh":
        body = "".join(rng.choice(BASE58_CHARS) for _ in range(33))
        return f"3{body}"
    elif script_type == "p2wpkh":
        body = "".join(rng.choice(BECH32_CHARS) for _ in range(38))
        return f"bc1q{body}"
    elif script_type == "p2wsh":
        body = "".join(rng.choice(BECH32_CHARS) for _ in range(58))
        return f"bc1q{body}"
    else:  # unknown / taproot-like
        body = "".join(rng.choice(BECH32_CHARS) for _ in range(58))
        return f"bc1p{body}"


class SimulationClock:
    """
    Simulates a chronologically meaningful observation timeline.
    Models diurnal cycles, bursts, quiet periods, and rapid successive transactions.
    """
    def __init__(self, start_time: datetime, rng: random.Random, mean_inter_arrival: float = 8.0):
        self.current_time = start_time
        self.rng = rng
        self.mean_inter_arrival = mean_inter_arrival
        self.in_burst = False
        self.burst_remaining = 0

    def tick(self, explicit_delta_seconds: Optional[float] = None) -> datetime:
        """Advance simulated time and return the new timestamp."""
        if explicit_delta_seconds is not None:
            self.current_time += timedelta(seconds=max(0.01, explicit_delta_seconds))
            return self.current_time

        # Check burst transition
        if self.in_burst:
            self.burst_remaining -= 1
            if self.burst_remaining <= 0:
                self.in_burst = False
            delta = self.rng.uniform(0.1, 1.5)
        else:
            # 5% chance to start a burst
            if self.rng.random() < 0.05:
                self.in_burst = True
                self.burst_remaining = self.rng.randint(4, 15)
                delta = self.rng.uniform(0.1, 1.0)
            # 3% chance of a quiet period
            elif self.rng.random() < 0.03:
                delta = self.rng.uniform(30.0, 180.0)
            else:
                # Exponential inter-arrival with diurnal cycle
                # Diurnal factor: higher volume (shorter inter-arrival) during 13-22 UTC
                hour = self.current_time.hour + self.current_time.minute / 60.0
                diurnal_scale = 1.0 + 0.4 * math.sin((hour - 8.0) * math.pi / 12.0)
                diurnal_scale = max(0.4, min(1.8, diurnal_scale))
                adjusted_mean = self.mean_inter_arrival / diurnal_scale
                delta = self.rng.expovariate(1.0 / adjusted_mean)
                delta = max(0.2, min(delta, 300.0))

        self.current_time += timedelta(seconds=delta)
        return self.current_time

    def format_timestamp(self) -> str:
        """Format current time as ISO-8601 UTC with Z suffix."""
        return self.current_time.strftime("%Y-%m-%dT%H:%M:%SZ")


class EntityManager:
    """
    Maintains persistent entity populations (users, merchants, exchanges, miners,
    recurring services, confounders, and anomalous actors) with reusable addresses
    and network profiles.
    """
    def __init__(self, config: GeneratorConfig, rng: random.Random):
        self.config = config
        self.rng = rng

        self.users: List[Entity] = []
        self.merchants: List[Entity] = []
        self.exchanges: List[Entity] = []
        self.miners: List[Entity] = []
        self.services: List[Entity] = []
        self.confounders: List[Entity] = []
        self.anomalous_actors: List[Entity] = []

        # Peer destination nodes pool (Bitcoin full nodes listening on standard ports)
        self.peer_destination_nodes: List[Tuple[str, int]] = []
        self._init_peer_destinations()
        self._init_all_entities()

    def _random_script_type(self) -> str:
        types = list(self.config.script_type_weights.keys())
        weights = list(self.config.script_type_weights.values())
        return self.rng.choices(types, weights=weights, k=1)[0]

    def _init_peer_destinations(self) -> None:
        """Create 80 deterministic Bitcoin peer listener endpoints."""
        for i in range(80):
            country, asn, ip_prefix = self.rng.choice(NETWORK_POOLS)
            last_octets = f"{self.rng.randint(10, 240)}.{self.rng.randint(2, 250)}"
            node_ip = f"{ip_prefix}{last_octets}"
            # 94% mainnet 8333, 4% testnet 18333, 2% custom 8332
            port_choice = self.rng.choices([8333, 18333, 8332], weights=[0.94, 0.04, 0.02])[0]
            self.peer_destination_nodes.append((node_ip, port_choice))

    def _build_entity(self, entity_id: str, entity_type: str, addr_count: int) -> Entity:
        country, asn, ip_prefix = self.rng.choice(NETWORK_POOLS)
        last_octets = f"{self.rng.randint(10, 240)}.{self.rng.randint(2, 250)}"
        ip = f"{ip_prefix}{last_octets}"
        script_type = self._random_script_type()

        entity = Entity(
            entity_id=entity_id,
            entity_type=entity_type,
            preferred_ip=ip,
            preferred_asn=asn,
            preferred_country=country,
            preferred_script_type=script_type,
        )
        for _ in range(addr_count):
            entity.addresses.append(generate_deterministic_address(self.rng, script_type))
        return entity

    def _init_all_entities(self) -> None:
        # Users
        for i in range(self.config.num_user_entities):
            self.users.append(
                self._build_entity(f"E_USR_{i+1:04d}", "USER", self.rng.randint(2, 8))
            )
        # Merchants
        for i in range(self.config.num_merchant_entities):
            self.merchants.append(
                self._build_entity(f"E_MER_{i+1:03d}", "MERCHANT", self.rng.randint(10, 30))
            )
        # Exchanges
        for i in range(self.config.num_exchange_entities):
            self.exchanges.append(
                self._build_entity(f"E_EXC_{i+1:03d}", "EXCHANGE", self.rng.randint(40, 100))
            )
        # Miners
        for i in range(self.config.num_miner_entities):
            self.miners.append(
                self._build_entity(f"E_MIN_{i+1:03d}", "MINER", self.rng.randint(15, 35))
            )
        # Services
        for i in range(self.config.num_service_entities):
            self.services.append(
                self._build_entity(f"E_SRV_{i+1:03d}", "SERVICE", self.rng.randint(5, 15))
            )
        # Confounders (high volume legitimate entities)
        for i in range(self.config.num_confounder_entities):
            self.confounders.append(
                self._build_entity(f"E_CNF_{i+1:03d}", "CONFOUNDER", self.rng.randint(20, 60))
            )
        # Anomalous actors
        for i in range(self.config.num_anomaly_entities):
            self.anomalous_actors.append(
                self._build_entity(f"E_ANO_{i+1:04d}", "ANOMALOUS_ACTOR", self.rng.randint(8, 25))
            )

    def get_destination_peer(self) -> Tuple[str, int]:
        return self.rng.choice(self.peer_destination_nodes)

    def get_ephemeral_port(self) -> int:
        return self.rng.randint(1024, 65535)

    def get_fresh_address(self, script_type: Optional[str] = None) -> str:
        st = script_type or self._random_script_type()
        return generate_deterministic_address(self.rng, st)
