"""
SANKET Graph Query Engine & Lightweight Graph Metrics.
Provides deterministic graph inspection, subgraphs, neighbor queries,
domain-specific entity resolutions, and graph evidence generation.
"""
from collections import deque
from typing import Any, Dict, List, Optional, Set, Union

from src.graph.model import EdgeType, GraphEdge, GraphNode, GraphSnapshot, NodeType


class AddressTransactions(list):
    """
    List of transaction IDs associated with an address.
    Supports list operations, attribute access (.inputs, .outputs), and dict-like indexing.
    """
    def __init__(self, inputs: Iterable[str], outputs: Iterable[str]) -> None:
        self.inputs: List[str] = sorted(list(set(inputs)))
        self.outputs: List[str] = sorted(list(set(outputs)))
        combined: List[str] = sorted(list(set(self.inputs + self.outputs)))
        super().__init__(combined)

    def __getitem__(self, item: Any) -> Any:
        if item == "inputs":
            return self.inputs
        if item == "outputs":
            return self.outputs
        return super().__getitem__(item)


class TransactionAddresses(list):
    """
    List of address strings involved in a transaction.
    Supports list operations, attribute access (.inputs, .outputs), and dict-like indexing.
    """
    def __init__(self, inputs: Iterable[str], outputs: Iterable[str]) -> None:
        self.inputs: List[str] = list(inputs)
        self.outputs: List[str] = list(outputs)
        # Deterministic combined list preserving input/output separation
        seen: Set[str] = set()
        combined: List[str] = []
        for a in self.inputs + self.outputs:
            if a not in seen:
                seen.add(a)
                combined.append(a)
        super().__init__(combined)

    def __getitem__(self, item: Any) -> Any:
        if item == "inputs":
            return self.inputs
        if item == "outputs":
            return self.outputs
        return super().__getitem__(item)


class RelatedEntities(list):
    """
    Collection of candidate entities and related addresses for a node.
    Supports membership checks for both candidate entity IDs and address IDs.
    """
    def __init__(self, entities: Iterable[str], addresses: Iterable[str]) -> None:
        self.entities: List[str] = sorted(list(set(entities)))
        self.addresses: List[str] = sorted(list(set(addresses)))
        self.candidate_entities: List[str] = self.entities
        super().__init__(self.entities if self.entities else self.addresses)

    def __contains__(self, item: object) -> bool:
        if super().__contains__(item):
            return True
        return item in self.entities or item in self.addresses


class GraphQueryEngine:
    """
    Query interface and metrics calculator over a GraphSnapshot.
    """

    def __init__(self, graph: GraphSnapshot) -> None:
        self.graph = graph
        self._comp_size_cache: Dict[str, int] = {}

    def get_node(self, node_id: str) -> Optional[GraphNode]:
        """Retrieve node by ID or common semantic prefix."""
        return self.graph.get_node(node_id)

    def get_neighbors(self, node_id: str, hops: int = 1) -> Set[str]:
        """Retrieve set of neighbor node IDs within hops."""
        return self.graph.get_neighbors(node_id, hops=hops)

    def get_subgraph(self, node_id: str, hops: int = 2) -> GraphSnapshot:
        """Extract induced subgraph centered on node_id within hops."""
        return self.graph.get_subgraph(node_id, hops=hops)

    def get_edges(self, node_id: str) -> List[GraphEdge]:
        """Retrieve all incident edges connected to node_id."""
        return self.graph.get_edges(node_id)

    def get_transactions_for_address(self, address: str) -> AddressTransactions:
        """Return transactions where address was an input or output."""
        in_txs: List[str] = []
        out_txs: List[str] = []

        incident = self.graph.get_edges(address)
        for e in incident:
            if e.edge_type == EdgeType.INPUT_TO and e.target_id == address:
                in_txs.append(e.source_id)
            elif e.edge_type == EdgeType.OUTPUT_TO and e.target_id == address:
                out_txs.append(e.source_id)

        # Fallback to secondary index if available
        if not in_txs and not out_txs and address in self.graph.tx_by_address:
            all_txs = list(self.graph.tx_by_address[address])
            return AddressTransactions(all_txs, [])

        return AddressTransactions(in_txs, out_txs)

    def get_addresses_for_transaction(self, txid: str) -> TransactionAddresses:
        """Return input and output addresses for a transaction."""
        cached = self.graph.addrs_by_tx.get(txid)
        if cached:
            return TransactionAddresses(cached.get("inputs", []), cached.get("outputs", []))

        inputs: List[str] = []
        outputs: List[str] = []
        for e in self.graph.get_edges(txid):
            if e.source_id == txid:
                if e.edge_type == EdgeType.INPUT_TO:
                    inputs.append(e.target_id)
                elif e.edge_type == EdgeType.OUTPUT_TO:
                    outputs.append(e.target_id)

        return TransactionAddresses(inputs, outputs)

    def get_transactions_for_ip(self, ip: str) -> List[str]:
        """Return transactions observed with a given IP address."""
        if ip in self.graph.tx_by_ip:
            return sorted(list(self.graph.tx_by_ip[ip]))

        txs: Set[str] = set()
        for e in self.graph.get_edges(ip):
            if e.edge_type == EdgeType.OBSERVED_WITH and e.target_id == ip:
                txs.add(e.source_id)
        return sorted(list(txs))

    def get_related_entities(self, node_id: str) -> RelatedEntities:
        """
        Return candidate entity clusters and related addresses for a given node.
        Does NOT represent candidate links as established ownership.
        """
        node = self.graph.get_node(node_id)
        if node is None:
            return RelatedEntities([], [])

        entities: Set[str] = set()
        related_addrs: Set[str] = set()

        if node.node_type == NodeType.ADDRESS:
            # Check candidate entity index
            if node_id in self.graph.entities_by_address:
                entities.update(self.graph.entities_by_address[node_id])

            # Check direct candidate edges
            for e in self.graph.get_edges(node_id):
                if e.edge_type == EdgeType.CANDIDATE_SAME_ENTITY:
                    other = e.target_id if e.source_id == node_id else e.source_id
                    other_node = self.graph.get_node(other)
                    if other_node and other_node.node_type == NodeType.CANDIDATE_ENTITY:
                        entities.add(other)
                    else:
                        related_addrs.add(other)

            # If associated with candidate entities, include peer member addresses
            for ent_id in list(entities):
                ent_node = self.graph.get_node(ent_id)
                if ent_node:
                    members = ent_node.attributes.get("member_addresses", [])
                    related_addrs.update(m for m in members if m != node_id)

        elif node.node_type == NodeType.CANDIDATE_ENTITY:
            entities.add(node_id)
            members = node.attributes.get("member_addresses", [])
            related_addrs.update(members)

        elif node.node_type == NodeType.TRANSACTION:
            # Related entities for transaction inputs
            addrs = self.get_addresses_for_transaction(node_id)
            for in_addr in addrs.inputs:
                sub_rel = self.get_related_entities(in_addr)
                entities.update(sub_rel.entities)
                related_addrs.update(sub_rel.addresses)

        return RelatedEntities(sorted(list(entities)), sorted(list(related_addrs)))

    # --- Lightweight Deterministic Graph Metrics ---

    def degree(self, node_id: str) -> int:
        """Total number of unique incident edges connected to node_id."""
        node = self.graph.get_node(node_id)
        if node is None:
            return 0
        nid = node.node_id
        out_e = self.graph.adj_out.get(nid, set())
        in_e = self.graph.adj_in.get(nid, set())
        return len(out_e | in_e)

    def weighted_degree(self, node_id: str) -> float:
        """
        Sum of weights for incident edges.
        Uses BTC amount for transaction edges and 1.0 for relational edges.
        """
        node = self.graph.get_node(node_id)
        if node is None:
            return 0.0
        nid = node.node_id
        edges = self.graph.get_edges(nid)
        total_weight = 0.0
        for e in edges:
            if "amount" in e.attributes and e.attributes["amount"] is not None:
                total_weight += float(e.attributes["amount"])
            else:
                total_weight += float(e.attributes.get("weight", 1.0))
        return round(total_weight, 8)

    def unique_counterparties(self, node_id: str) -> int:
        """
        Number of unique counterparties for this node.
        - For TRANSACTION: distinct input and output addresses.
        - For ADDRESS: distinct peer addresses interacted with across all transactions.
        - For IP: distinct transactions or endpoints.
        """
        node = self.graph.get_node(node_id)
        if node is None:
            return 0
        nid = node.node_id

        if node.node_type == NodeType.TRANSACTION:
            addrs = self.get_addresses_for_transaction(nid)
            return len(set(addrs.inputs) | set(addrs.outputs))

        if node.node_type == NodeType.ADDRESS:
            counterparties: Set[str] = set()
            txs = self.get_transactions_for_address(nid)
            for tx in txs:
                t_addrs = self.get_addresses_for_transaction(tx)
                counterparties.update(a for a in (t_addrs.inputs + t_addrs.outputs) if a != nid)
            return len(counterparties)

        if node.node_type == NodeType.IP:
            return len(self.get_transactions_for_ip(nid))

        # Default: count neighbors of different node types
        neighbors = self.graph.get_neighbors(nid, hops=1)
        return len(neighbors)

    def connected_component_size(self, node_id: str) -> int:
        """
        Size (number of nodes) of the weakly connected component containing node_id.
        Computed deterministically via BFS over undirected adjacency.
        """
        node = self.graph.get_node(node_id)
        if node is None:
            return 0
        root_id = node.node_id

        if root_id in self._comp_size_cache:
            return self._comp_size_cache[root_id]

        visited: Set[str] = {root_id}
        queue: deque[str] = deque([root_id])

        while queue:
            curr = queue.popleft()
            for neighbor in self.graph.get_neighbors(curr, hops=1):
                if neighbor not in visited:
                    visited.add(neighbor)
                    queue.append(neighbor)

        comp_size = len(visited)
        for v in visited:
            self._comp_size_cache[v] = comp_size

        return comp_size

    def local_density(self, node_id: str, hops: int = 1) -> float:
        """
        Graph density of the induced neighborhood around node_id within hops.
        Formula: E / (N * (N - 1)) for directed graphs with N > 1.
        """
        node = self.graph.get_node(node_id)
        if node is None:
            return 0.0
        root_id = node.node_id

        neighborhood = {root_id} | self.graph.get_neighbors(root_id, hops=hops)
        n = len(neighborhood)
        if n <= 1:
            return 0.0

        # Count directed edges within induced neighborhood
        edge_count = 0
        for nid in neighborhood:
            for eid in self.graph.adj_out.get(nid, set()):
                e = self.graph.edges.get(eid)
                if e and e.target_id in neighborhood:
                    edge_count += 1

        max_possible_edges = n * (n - 1)
        density = edge_count / max_possible_edges
        return round(min(1.0, max(0.0, density)), 6)

    def compute_metrics(self, node_id: str) -> Dict[str, Any]:
        """Compute all lightweight graph metrics for a node."""
        return {
            "degree": self.degree(node_id),
            "weighted_degree": self.weighted_degree(node_id),
            "unique_counterparties": self.unique_counterparties(node_id),
            "connected_component_size": self.connected_component_size(node_id),
            "local_density": self.local_density(node_id),
        }

    def produce_graph_evidence(self, transaction_id: str) -> Dict[str, Any]:
        """
        Produce deterministic graph evidence dictionary for a transaction.
        Grounds all findings strictly in graph observations without unverified claims.
        """
        node = self.graph.get_node(transaction_id)
        if node is None:
            return {
                "transaction_id": transaction_id,
                "node_count": 0,
                "edge_count": 0,
                "related_addresses": [],
                "related_ips": [],
                "common_input_support": 0,
                "temporal_links": 0,
                "graph_metrics": {
                    "degree": 0,
                    "weighted_degree": 0.0,
                    "unique_counterparties": 0,
                    "connected_component_size": 0,
                    "local_density": 0.0,
                },
                "normalized_signals": {
                    "norm_degree": 0.0,
                    "norm_component_size": 0.0,
                    "norm_local_density": 0.0,
                    "norm_common_input": 0.0,
                    "norm_temporal_links": 0.0,
                    "norm_counterparties": 0.0,
                },
                "composite_graph_score": 0.0,
                "graph_support_score": 0.0,
                "evidence_items": [],
            }

        # 2-hop induced subgraph
        subgraph = self.graph.get_subgraph(transaction_id, hops=2)

        # Addresses
        addrs = self.get_addresses_for_transaction(transaction_id)
        related_addrs = sorted(list(set(addrs.inputs + addrs.outputs)))

        # Related IPs
        incident = self.graph.get_edges(transaction_id)
        related_ips = sorted(list(set(
            e.target_id for e in incident
            if e.edge_type == EdgeType.OBSERVED_WITH and e.source_id == transaction_id
        )))

        # Common input candidate support
        coinput_edge_ids: Set[str] = set()
        coinput_txids: Set[str] = set()
        common_input_support = 0
        if len(addrs.inputs) >= 2:
            for addr in addrs.inputs:
                for eid in self.graph.adj_out.get(addr, set()) | self.graph.adj_in.get(addr, set()):
                    e = self.graph.edges.get(eid)
                    if e and e.edge_type == EdgeType.CANDIDATE_SAME_ENTITY:
                        coinput_edge_ids.add(e.edge_id)
                        sup = e.metadata.get("support_count", 0)
                        if sup > common_input_support:
                            common_input_support = sup
                        for stx in e.metadata.get("supporting_txids", []):
                            coinput_txids.add(stx)
            if common_input_support == 0:
                common_input_support = 1
                coinput_txids.add(transaction_id)

        # Temporal links
        temporal_edges = [
            e for e in incident if e.edge_type == EdgeType.TEMPORALLY_ASSOCIATED
        ]
        temporal_links = len(temporal_edges)
        temporal_edge_ids = sorted([e.edge_id for e in temporal_edges])
        temporal_peer_txids = sorted(list(set(
            (e.source_id if e.target_id == transaction_id else e.target_id)
            for e in temporal_edges
        )))

        # Graph Metrics
        metrics = self.compute_metrics(transaction_id)
        deg = metrics["degree"]
        comp_size = metrics["connected_component_size"]
        density = metrics["local_density"]
        counterparties = metrics["unique_counterparties"]

        def _clamp(v: float) -> float:
            return max(0.0, min(1.0, float(v)))

        # Normalization Strategy:
        # 1. Degree: min=2 (baseline 1-in 1-out), saturated at max=20
        norm_deg = _clamp(max(0.0, deg - 2) / 18.0)
        # 2. Component size: min=3, saturated at max=30
        norm_comp = _clamp(max(0.0, comp_size - 3) / 27.0)
        # 3. Density: bounded max at 0.30 in bipartite tx-addr topology
        norm_density = _clamp(density / 0.30)
        # 4. Temporal links: saturated at 5 links
        norm_temp = _clamp(temporal_links / 5.0)
        # 5. Counterparties: min=2, saturated at 12
        norm_counterparties = _clamp(max(0.0, counterparties - 2) / 10.0)
        # 6. Common input: 0 if < 2 inputs; base 0.40 + 0.12 * support if >= 2
        norm_ci = _clamp(0.40 + 0.12 * common_input_support) if len(addrs.inputs) >= 2 else 0.0

        normalized_signals = {
            "norm_degree": round(norm_deg, 4),
            "norm_component_size": round(norm_comp, 4),
            "norm_local_density": round(norm_density, 4),
            "norm_common_input": round(norm_ci, 4),
            "norm_temporal_links": round(norm_temp, 4),
            "norm_counterparties": round(norm_counterparties, 4),
        }

        # Composite graph score (used to augment structural risk component G)
        risk_signals = sorted([norm_ci, norm_temp, norm_deg, norm_comp, norm_density], reverse=True)
        top_s = risk_signals[0]
        second_s = risk_signals[1] if len(risk_signals) > 1 else 0.0
        if top_s > 0.0:
            composite_graph_score = round(_clamp(top_s + (1.0 - top_s) * 0.25 * second_s), 4)
        else:
            composite_graph_score = 0.0

        # Graph support score (used for epistemic confidence factor Gs)
        topo_presence = _clamp(subgraph.node_count / 4.0)
        graph_support_score = round(
            _clamp(0.50 * topo_presence + 0.30 * composite_graph_score + 0.20 * min(1.0, deg / 4.0)),
            4
        )

        # Structured evidence items (preserving provenance without duplication)
        evidence_items: List[Dict[str, Any]] = []

        # Degree evidence
        evidence_items.append({
            "metric_name": "degree",
            "metric_value": deg,
            "normalized_score": round(norm_deg, 4),
            "normalization": "saturating_linear(min=2, max=20)",
            "reason": f"Transaction node incident degree: {deg}",
            "is_heuristic_only": False,
            "is_established_ownership": False,
            "supporting_nodes": sorted(list(self.get_neighbors(transaction_id, hops=1))),
            "supporting_edges": sorted([e.edge_id for e in incident]),
            "supporting_txids": [transaction_id],
        })

        # Connected component evidence
        evidence_items.append({
            "metric_name": "connected_component_size",
            "metric_value": comp_size,
            "normalized_score": round(norm_comp, 4),
            "normalization": "saturating_linear(min=3, max=30)",
            "reason": f"Transaction belongs to connected component of size {comp_size} nodes",
            "is_heuristic_only": False,
            "is_established_ownership": False,
            "supporting_nodes": [transaction_id],
            "supporting_edges": [],
            "supporting_txids": [transaction_id],
        })

        # Local density evidence
        evidence_items.append({
            "metric_name": "local_density",
            "metric_value": density,
            "normalized_score": round(norm_density, 4),
            "normalization": "saturating_linear(max=0.30)",
            "reason": f"Local neighborhood density is {density:.4f}",
            "is_heuristic_only": False,
            "is_established_ownership": False,
            "supporting_nodes": sorted(list(subgraph.nodes.keys())),
            "supporting_edges": sorted(list(subgraph.edges.keys())),
            "supporting_txids": [transaction_id],
        })

        # Common input candidate relationship (strictly heuristic)
        if len(addrs.inputs) >= 2:
            evidence_items.append({
                "metric_name": "common_input_clustering",
                "metric_value": common_input_support,
                "normalized_score": round(norm_ci, 4),
                "normalization": "bounded_heuristic(base=0.40, step=0.12, max=5)",
                "reason": f"candidate relationship supported by {common_input_support} observations",
                "is_heuristic_only": True,
                "is_established_ownership": False,
                "supporting_nodes": sorted(list(addrs.inputs)),
                "supporting_edges": sorted(list(coinput_edge_ids)),
                "supporting_txids": sorted(list(coinput_txids)),
            })

        # Temporal association evidence (strictly observational)
        if temporal_links > 0:
            evidence_items.append({
                "metric_name": "temporal_association",
                "metric_value": temporal_links,
                "normalized_score": round(norm_temp, 4),
                "normalization": "saturating_linear(max=5)",
                "reason": f"Transaction has {temporal_links} temporal associations within bounded window",
                "is_heuristic_only": True,
                "is_established_ownership": False,
                "supporting_nodes": temporal_peer_txids,
                "supporting_edges": temporal_edge_ids,
                "supporting_txids": temporal_peer_txids,
            })

        return {
            "transaction_id": transaction_id,
            "node_count": subgraph.node_count,
            "edge_count": subgraph.edge_count,
            "related_addresses": related_addrs,
            "related_ips": related_ips,
            "common_input_support": common_input_support,
            "temporal_links": temporal_links,
            "graph_metrics": metrics,
            "normalized_signals": normalized_signals,
            "composite_graph_score": composite_graph_score,
            "graph_support_score": graph_support_score,
            "evidence_items": evidence_items,
        }



# --- Functional API matching prompt specifications ---

def get_node(graph: GraphSnapshot, node_id: str) -> Optional[GraphNode]:
    return GraphQueryEngine(graph).get_node(node_id)


def get_neighbors(graph: GraphSnapshot, node_id: str, hops: int = 1) -> Set[str]:
    return GraphQueryEngine(graph).get_neighbors(node_id, hops=hops)


def get_subgraph(graph: GraphSnapshot, node_id: str, hops: int = 2) -> GraphSnapshot:
    return GraphQueryEngine(graph).get_subgraph(node_id, hops=hops)


def get_edges(graph: GraphSnapshot, node_id: str) -> List[GraphEdge]:
    return GraphQueryEngine(graph).get_edges(node_id)


def get_transactions_for_address(graph: GraphSnapshot, address: str) -> AddressTransactions:
    return GraphQueryEngine(graph).get_transactions_for_address(address)


def get_addresses_for_transaction(graph: GraphSnapshot, txid: str) -> TransactionAddresses:
    return GraphQueryEngine(graph).get_addresses_for_transaction(txid)


def get_transactions_for_ip(graph: GraphSnapshot, ip: str) -> List[str]:
    return GraphQueryEngine(graph).get_transactions_for_ip(ip)


def get_related_entities(graph: GraphSnapshot, node_id: str) -> RelatedEntities:
    return GraphQueryEngine(graph).get_related_entities(node_id)


def compute_degree(graph: GraphSnapshot, node_id: str) -> int:
    return GraphQueryEngine(graph).degree(node_id)


def compute_weighted_degree(graph: GraphSnapshot, node_id: str) -> float:
    return GraphQueryEngine(graph).weighted_degree(node_id)


def compute_unique_counterparties(graph: GraphSnapshot, node_id: str) -> int:
    return GraphQueryEngine(graph).unique_counterparties(node_id)


def compute_connected_component_size(graph: GraphSnapshot, node_id: str) -> int:
    return GraphQueryEngine(graph).connected_component_size(node_id)


def compute_local_density(graph: GraphSnapshot, node_id: str, hops: int = 1) -> float:
    return GraphQueryEngine(graph).local_density(node_id, hops=hops)


def compute_graph_metrics(graph: GraphSnapshot, node_id: str) -> Dict[str, Any]:
    return GraphQueryEngine(graph).compute_metrics(node_id)


def produce_graph_evidence(graph: GraphSnapshot, transaction_id: str) -> Dict[str, Any]:
    return GraphQueryEngine(graph).produce_graph_evidence(transaction_id)
