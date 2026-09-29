"""
SANKET Graph Builder: Ingests canonical transactions and constructs a
deterministic, queryable transaction/entity graph representation.
Strictly respects epistemological boundaries:
- Observational network relations != ownership proof.
- Common-input clustering != established entity ownership.
"""
from datetime import datetime, timezone
from itertools import combinations
from typing import Any, Dict, Iterable, List, Optional, Set, Tuple
import numbers

from src.contract.models import CanonicalTransaction
from src.graph.model import EdgeType, GraphEdge, GraphNode, GraphSnapshot, NodeType


class DisjointSetUnion:
    """Disjoint Set Union (Union-Find) with path compression and union by rank."""

    def __init__(self) -> None:
        self.parent: Dict[str, str] = {}
        self.rank: Dict[str, int] = {}

    def find(self, item: str) -> str:
        if item not in self.parent:
            self.parent[item] = item
            self.rank[item] = 0
            return item
        if self.parent[item] != item:
            self.parent[item] = self.find(self.parent[item])
        return self.parent[item]

    def union(self, item1: str, item2: str) -> str:
        root1 = self.find(item1)
        root2 = self.find(item2)
        if root1 == root2:
            return root1
        if self.rank[root1] < self.rank[root2]:
            self.parent[root1] = root2
            return root2
        elif self.rank[root1] > self.rank[root2]:
            self.parent[root2] = root1
            return root1
        else:
            self.parent[root2] = root1
            self.rank[root1] += 1
            return root1

    def get_clusters(self) -> Dict[str, List[str]]:
        """Return root -> sorted list of member items."""
        clusters: Dict[str, List[str]] = {}
        for item in self.parent:
            root = self.find(item)
            if root not in clusters:
                clusters[root] = []
            clusters[root].append(item)
        for root in clusters:
            clusters[root].sort()
        return clusters


class GraphBuilder:
    """
    Constructs a deterministic GraphSnapshot from canonical transaction records.
    """

    def __init__(
        self,
        temporal_window_seconds: float = 300.0,
        max_temporal_links_per_tx: int = 5,
        max_coinput_clique_size: int = 20,
    ) -> None:
        self.temporal_window_seconds = float(temporal_window_seconds)
        self.max_temporal_links_per_tx = int(max_temporal_links_per_tx)
        self.max_coinput_clique_size = int(max_coinput_clique_size)

    @staticmethod
    def _parse_timestamp(ts: Any) -> float:
        """Parse timestamp to UTC epoch float deterministically."""
        if ts is None:
            return 0.0
        if isinstance(ts, (int, float)):
            return float(ts)
        if isinstance(ts, datetime):
            if ts.tzinfo is None:
                ts = ts.replace(tzinfo=timezone.utc)
            return ts.timestamp()
        if isinstance(ts, str):
            clean = ts.strip().replace("Z", "+00:00")
            try:
                dt = datetime.fromisoformat(clean)
                if dt.tzinfo is None:
                    dt = dt.replace(tzinfo=timezone.utc)
                return dt.timestamp()
            except Exception:
                try:
                    return float(ts)
                except Exception:
                    return 0.0
        return 0.0

    @staticmethod
    def _coerce_record(record: Any) -> Dict[str, Any]:
        """Convert CanonicalTransaction model or dict into a standard dictionary."""
        if hasattr(record, "model_dump"):
            return record.model_dump(mode="python")
        if hasattr(record, "dict"):
            return record.dict()
        if isinstance(record, dict):
            return dict(record)
        raise TypeError(f"Unsupported record type: {type(record)}")

    @staticmethod
    def _clean_ip(ip: Any) -> Optional[str]:
        """Validate and sanitize IP address strings."""
        if not ip or not isinstance(ip, str):
            return None
        cleaned = ip.strip()
        if not cleaned or cleaned.lower() in {"unknown", "unknown_ip", "none", "null"}:
            return None
        return cleaned

    @staticmethod
    def _clean_metadata_str(val: Any) -> Optional[str]:
        """Validate and sanitize optional network strings (ASN, Country)."""
        if not val or not isinstance(val, (str, numbers.Integral)):
            return None
        cleaned = str(val).strip()
        if not cleaned or cleaned.lower() in {"unknown", "none", "null", "n/a", "na"}:
            return None
        return cleaned

    def build_from_records(self, records: Iterable[Any]) -> GraphSnapshot:
        """
        Build a deterministic GraphSnapshot from an iterable of canonical records.
        Records are processed in strictly chronological order.
        """
        snapshot = GraphSnapshot()

        # Coerce records
        raw_list = [self._coerce_record(r) for r in records]
        if not raw_list:
            return snapshot

        # Sort chronologically, break ties by txid
        def _sort_key(rec: Dict[str, Any]) -> Tuple[float, str]:
            ts = self._parse_timestamp(rec.get("timestamp"))
            txid = str(rec.get("txid", ""))
            return (ts, txid)

        sorted_records = sorted(raw_list, key=_sort_key)

        # State for candidate entity clustering across transactions
        dsu = DisjointSetUnion()
        pair_supporting_txids: Dict[Tuple[str, str], Set[str]] = {}

        # Trailing window history for temporal association:
        # list of (txid, timestamp_epoch, set_of_addrs, src_ip)
        recent_txs: List[Tuple[str, float, Set[str], Optional[str]]] = []

        seen_txids: Set[str] = set()

        for rec in sorted_records:
            txid = str(rec.get("txid", "")).strip()
            if not txid:
                continue

            # Idempotently handle duplicate records
            if txid in seen_txids:
                continue
            seen_txids.add(txid)

            ts_epoch = self._parse_timestamp(rec.get("timestamp"))
            fee = float(rec.get("fee", 0.0) or 0.0)

            # 1. Clean addresses
            raw_inputs = rec.get("input_addresses") or []
            inputs: List[str] = [
                str(a).strip() for a in raw_inputs
                if a and isinstance(a, str) and str(a).strip()
            ]

            raw_outputs = rec.get("output_addresses") or []
            outputs: List[str] = [
                str(a).strip() for a in raw_outputs
                if a and isinstance(a, str) and str(a).strip()
            ]

            raw_in_amounts = rec.get("input_amounts") or []
            raw_out_amounts = rec.get("output_amounts") or []

            # 2. Add TRANSACTION node
            snapshot.add_node(GraphNode(
                node_id=txid,
                node_type=NodeType.TRANSACTION,
                attributes={
                    "txid": txid,
                    "timestamp": ts_epoch,
                    "fee": fee,
                    "input_count": len(inputs),
                    "output_count": len(outputs),
                },
            ))

            # Initialize secondary index for this tx
            snapshot.addrs_by_tx[txid] = {"inputs": [], "outputs": []}

            # 3. Process INPUT_TO edges (Transaction -> input address)
            for idx, addr in enumerate(inputs):
                amount = float(raw_in_amounts[idx]) if idx < len(raw_in_amounts) else 0.0
                snapshot.add_node(GraphNode(
                    node_id=addr,
                    node_type=NodeType.ADDRESS,
                    attributes={"address": addr},
                ))
                edge_id = f"INPUT_TO:{txid}->{addr}"
                if edge_id in snapshot.edges:
                    # Aggregate amount if repeated input
                    snapshot.edges[edge_id].attributes["amount"] = round(
                        snapshot.edges[edge_id].attributes.get("amount", 0.0) + amount, 8
                    )
                else:
                    snapshot.add_edge(GraphEdge(
                        edge_id=edge_id,
                        source_id=txid,
                        target_id=addr,
                        edge_type=EdgeType.INPUT_TO,
                        timestamp=ts_epoch,
                        attributes={"amount": amount, "index": idx},
                        metadata={"direction": "INPUT"},
                    ))

                if addr not in snapshot.tx_by_address:
                    snapshot.tx_by_address[addr] = set()
                snapshot.tx_by_address[addr].add(txid)
                snapshot.addrs_by_tx[txid]["inputs"].append(addr)

            # 4. Process OUTPUT_TO edges (Transaction -> output address)
            for idx, addr in enumerate(outputs):
                amount = float(raw_out_amounts[idx]) if idx < len(raw_out_amounts) else 0.0
                snapshot.add_node(GraphNode(
                    node_id=addr,
                    node_type=NodeType.ADDRESS,
                    attributes={"address": addr},
                ))
                edge_id = f"OUTPUT_TO:{txid}->{addr}"
                if edge_id in snapshot.edges:
                    snapshot.edges[edge_id].attributes["amount"] = round(
                        snapshot.edges[edge_id].attributes.get("amount", 0.0) + amount, 8
                    )
                else:
                    snapshot.add_edge(GraphEdge(
                        edge_id=edge_id,
                        source_id=txid,
                        target_id=addr,
                        edge_type=EdgeType.OUTPUT_TO,
                        timestamp=ts_epoch,
                        attributes={"amount": amount, "index": idx},
                        metadata={"direction": "OUTPUT"},
                    ))

                if addr not in snapshot.tx_by_address:
                    snapshot.tx_by_address[addr] = set()
                snapshot.tx_by_address[addr].add(txid)
                snapshot.addrs_by_tx[txid]["outputs"].append(addr)

            # 5. Process Network Context (Transaction -> source IP, IP -> ASN, IP -> Country)
            src_ip = self._clean_ip(rec.get("src_ip"))
            if src_ip:
                snapshot.add_node(GraphNode(
                    node_id=src_ip,
                    node_type=NodeType.IP,
                    attributes={"ip": src_ip},
                ))
                edge_id = f"OBSERVED_WITH:{txid}->{src_ip}"
                snapshot.add_edge(GraphEdge(
                    edge_id=edge_id,
                    source_id=txid,
                    target_id=src_ip,
                    edge_type=EdgeType.OBSERVED_WITH,
                    timestamp=ts_epoch,
                    attributes={"src_port": rec.get("src_port")},
                    metadata={
                        "is_observational_only": True,
                        "is_proof_of_ownership": False,
                    },
                ))
                if src_ip not in snapshot.tx_by_ip:
                    snapshot.tx_by_ip[src_ip] = set()
                snapshot.tx_by_ip[src_ip].add(txid)

                # IP -> ASN
                asn_val = self._clean_metadata_str(rec.get("asn"))
                if asn_val:
                    asn_node_id = asn_val if asn_val.upper().startswith("AS") else f"ASN:{asn_val}"
                    snapshot.add_node(GraphNode(
                        node_id=asn_node_id,
                        node_type=NodeType.ASN,
                        attributes={"asn": asn_val},
                    ))
                    asn_edge_id = f"SAME_ASN:{src_ip}->{asn_node_id}"
                    snapshot.add_edge(GraphEdge(
                        edge_id=asn_edge_id,
                        source_id=src_ip,
                        target_id=asn_node_id,
                        edge_type=EdgeType.SAME_ASN,
                        timestamp=ts_epoch,
                        attributes={},
                        metadata={
                            "is_observational_only": True,
                            "is_proof_of_ownership": False,
                        },
                    ))

                # IP -> Country
                country_val = self._clean_metadata_str(rec.get("geo_country"))
                if country_val:
                    country_code = country_val.upper()
                    country_node_id = f"COUNTRY:{country_code}"
                    snapshot.add_node(GraphNode(
                        node_id=country_node_id,
                        node_type=NodeType.COUNTRY,
                        attributes={"country": country_code},
                    ))
                    country_edge_id = f"OBSERVED_WITH:{src_ip}->{country_node_id}"
                    snapshot.add_edge(GraphEdge(
                        edge_id=country_edge_id,
                        source_id=src_ip,
                        target_id=country_node_id,
                        edge_type=EdgeType.OBSERVED_WITH,
                        timestamp=ts_epoch,
                        attributes={},
                        metadata={
                            "is_observational_only": True,
                            "is_proof_of_ownership": False,
                        },
                    ))

            # 6. Candidate Entity Tracking (Conservative Common-Input Heuristic)
            unique_inputs = sorted(list(set(inputs)))
            if len(unique_inputs) >= 2:
                # Union all inputs in DSU
                first_addr = unique_inputs[0]
                for other_addr in unique_inputs[1:]:
                    dsu.union(first_addr, other_addr)

                # Pairwise candidate tracking (bounded to avoid edge explosion)
                if len(unique_inputs) <= self.max_coinput_clique_size:
                    candidate_pairs = list(combinations(unique_inputs, 2))
                else:
                    # Star topology linking with first address if input count is very large
                    candidate_pairs = [(unique_inputs[0], a) for a in unique_inputs[1:]]

                for a1, a2 in candidate_pairs:
                    pair_key = (min(a1, a2), max(a1, a2))
                    if pair_key not in pair_supporting_txids:
                        pair_supporting_txids[pair_key] = set()
                    pair_supporting_txids[pair_key].add(txid)

            # 7. Temporal Association (Trailing Bounded Window; No Future Leakage)
            tx_all_addrs = set(inputs) | set(outputs)
            cutoff = ts_epoch - self.temporal_window_seconds

            # Prune ancient transactions beyond the temporal window
            recent_txs = [item for item in recent_txs if item[1] >= cutoff]

            matched_past_txs: List[Tuple[str, float, List[str], List[str]]] = []
            for past_txid, past_ts, past_addrs, past_ip in reversed(recent_txs):
                if past_ts > ts_epoch:
                    # Guard against out-of-order records: strictly no future leakage
                    continue
                shared_addrs = sorted(list(tx_all_addrs & past_addrs))
                shared_ips = [src_ip] if (src_ip and past_ip and src_ip == past_ip) else []
                if shared_addrs or shared_ips:
                    dt = round(ts_epoch - past_ts, 4)
                    matched_past_txs.append((past_txid, dt, shared_addrs, shared_ips))
                    if len(matched_past_txs) >= self.max_temporal_links_per_tx:
                        break

            # Create TEMPORALLY_ASSOCIATED edges
            for past_txid, dt, shared_addrs, shared_ips in matched_past_txs:
                edge_id = f"TEMPORALLY_ASSOCIATED:{past_txid}->{txid}"
                snapshot.add_edge(GraphEdge(
                    edge_id=edge_id,
                    source_id=past_txid,
                    target_id=txid,
                    edge_type=EdgeType.TEMPORALLY_ASSOCIATED,
                    timestamp=ts_epoch,
                    attributes={
                        "time_delta_seconds": dt,
                        "shared_addresses": shared_addrs,
                        "shared_ips": shared_ips,
                    },
                    metadata={
                        "window_seconds": self.temporal_window_seconds,
                        "is_observational_only": True,
                    },
                ))

            # Append current transaction to recent history buffer
            recent_txs.append((txid, ts_epoch, tx_all_addrs, src_ip))

        # 8. Materialize Candidate Entity Clusters & Edges
        self._materialize_candidate_entities(snapshot, dsu, pair_supporting_txids)

        return snapshot

    def _materialize_candidate_entities(
        self,
        snapshot: GraphSnapshot,
        dsu: DisjointSetUnion,
        pair_supporting_txids: Dict[Tuple[str, str], Set[str]],
    ) -> None:
        """
        Materialize CANDIDATE_ENTITY nodes and CANDIDATE_SAME_ENTITY edges
        from common-input clusters.
        """
        clusters = dsu.get_clusters()

        for _, members in sorted(clusters.items(), key=lambda x: x[0]):
            if len(members) < 2:
                continue

            # Deterministic cluster identifier derived from lexicographically first address
            lead_addr = members[0]
            cluster_id = f"candidate_entity:{lead_addr}"

            # Create CANDIDATE_ENTITY node
            snapshot.add_node(GraphNode(
                node_id=cluster_id,
                node_type=NodeType.CANDIDATE_ENTITY,
                attributes={
                    "cluster_id": cluster_id,
                    "lead_address": lead_addr,
                    "member_addresses": list(members),
                    "member_count": len(members),
                    "is_heuristic_only": True,
                    "is_established_ownership": False,
                },
            ))

            for addr in members:
                if addr not in snapshot.entities_by_address:
                    snapshot.entities_by_address[addr] = set()
                snapshot.entities_by_address[addr].add(cluster_id)

                # Edge from candidate entity cluster to member address
                cluster_edge_id = f"CANDIDATE_SAME_ENTITY:{cluster_id}->{addr}"
                snapshot.add_edge(GraphEdge(
                    edge_id=cluster_edge_id,
                    source_id=cluster_id,
                    target_id=addr,
                    edge_type=EdgeType.CANDIDATE_SAME_ENTITY,
                    attributes={"heuristic": "common_input_clustering"},
                    metadata={
                        "is_heuristic_only": True,
                        "is_established_ownership": False,
                        "heuristic": "common_input_clustering",
                        "relationship_confidence": 0.60,
                    },
                ))

        # Materialize pairwise candidate relationships
        for (a1, a2), txids in sorted(pair_supporting_txids.items(), key=lambda x: (x[0][0], x[0][1])):
            sup_count = len(txids)
            conf = min(0.95, round(0.50 + 0.10 * sup_count, 3))
            pair_edge_id = f"CANDIDATE_SAME_ENTITY:{a1}->{a2}"
            snapshot.add_edge(GraphEdge(
                edge_id=pair_edge_id,
                source_id=a1,
                target_id=a2,
                edge_type=EdgeType.CANDIDATE_SAME_ENTITY,
                attributes={
                    "support_count": sup_count,
                    "counter_evidence_count": 0,
                    "relationship_confidence": conf,
                },
                metadata={
                    "is_heuristic_only": True,
                    "is_established_ownership": False,
                    "heuristic": "common_input_clustering",
                    "support_count": sup_count,
                    "supporting_txids": sorted(list(txids)),
                    "counter_evidence_count": 0,
                    "relationship_confidence": conf,
                },
            ))


def build_graph_from_records(
    records: Iterable[Any],
    temporal_window_seconds: float = 300.0,
    max_temporal_links_per_tx: int = 5,
    max_coinput_clique_size: int = 20,
) -> GraphSnapshot:
    """Convenience helper to build a GraphSnapshot from records."""
    builder = GraphBuilder(
        temporal_window_seconds=temporal_window_seconds,
        max_temporal_links_per_tx=max_temporal_links_per_tx,
        max_coinput_clique_size=max_coinput_clique_size,
    )
    return builder.build_from_records(records)
