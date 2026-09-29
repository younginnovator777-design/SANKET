"""
SANKET Graph Data Model: Nodes, Edges, and Graph Snapshot Index.
Defines semantic node/edge types and compact indexed graph representations
without heavy external dependencies.
"""
from dataclasses import dataclass, field
from enum import Enum
from typing import Any, Dict, List, Optional, Set, Tuple


class NodeType(str, Enum):
    """Semantic graph node types in SANKET."""
    TRANSACTION = "TRANSACTION"
    ADDRESS = "ADDRESS"
    IP = "IP"
    ASN = "ASN"
    COUNTRY = "COUNTRY"
    CANDIDATE_ENTITY = "CANDIDATE_ENTITY"


class EdgeType(str, Enum):
    """Semantic graph edge types in SANKET."""
    INPUT_TO = "INPUT_TO"
    OUTPUT_TO = "OUTPUT_TO"
    OBSERVED_WITH = "OBSERVED_WITH"
    SAME_IP = "SAME_IP"
    SAME_ASN = "SAME_ASN"
    TEMPORALLY_ASSOCIATED = "TEMPORALLY_ASSOCIATED"
    CANDIDATE_SAME_ENTITY = "CANDIDATE_SAME_ENTITY"


@dataclass
class GraphNode:
    """
    Representation of a graph node (Transaction, Address, Network entity, or Candidate cluster).
    """
    node_id: str
    node_type: str
    attributes: Dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "node_id": self.node_id,
            "node_type": self.node_type,
            "attributes": dict(self.attributes),
        }


@dataclass
class GraphEdge:
    """
    Representation of a directed semantic relationship between graph nodes.
    Evidence metadata persists support counts and observation contexts without assuming proof.
    """
    edge_id: str
    source_id: str
    target_id: str
    edge_type: str
    timestamp: Optional[float] = None
    attributes: Dict[str, Any] = field(default_factory=dict)
    metadata: Dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "edge_id": self.edge_id,
            "source_id": self.source_id,
            "target_id": self.target_id,
            "edge_type": self.edge_type,
            "timestamp": self.timestamp,
            "attributes": dict(self.attributes),
            "metadata": dict(self.metadata),
        }


@dataclass
class GraphSnapshot:
    """
    Compact, indexed in-memory graph representation.
    Provides fast bidirectional traversal and attribute lookup without third-party graph databases.
    """
    nodes: Dict[str, GraphNode] = field(default_factory=dict)
    edges: Dict[str, GraphEdge] = field(default_factory=dict)

    # Adjacency indexes for O(1) edge traversal
    # node_id -> set of edge_ids
    adj_out: Dict[str, Set[str]] = field(default_factory=dict)
    adj_in: Dict[str, Set[str]] = field(default_factory=dict)

    # Domain-specific secondary indexes for instant query resolution
    tx_by_address: Dict[str, Set[str]] = field(default_factory=dict)
    addrs_by_tx: Dict[str, Dict[str, List[str]]] = field(default_factory=dict)  # txid -> {"inputs": [...], "outputs": [...]}
    tx_by_ip: Dict[str, Set[str]] = field(default_factory=dict)
    entities_by_address: Dict[str, Set[str]] = field(default_factory=dict)

    @property
    def node_count(self) -> int:
        return len(self.nodes)

    @property
    def edge_count(self) -> int:
        return len(self.edges)

    def add_node(self, node: GraphNode) -> None:
        """Add or update a node in the snapshot."""
        if node.node_id not in self.nodes:
            self.nodes[node.node_id] = node
            self.adj_out[node.node_id] = set()
            self.adj_in[node.node_id] = set()
        else:
            # Update attributes without overwriting unchanged keys
            self.nodes[node.node_id].attributes.update(node.attributes)

    def add_edge(self, edge: GraphEdge) -> None:
        """Register a directed edge and update adjacency sets."""
        self.edges[edge.edge_id] = edge

        # Ensure source and target adjacency sets exist
        if edge.source_id not in self.adj_out:
            self.adj_out[edge.source_id] = set()
        if edge.source_id not in self.adj_in:
            self.adj_in[edge.source_id] = set()

        if edge.target_id not in self.adj_out:
            self.adj_out[edge.target_id] = set()
        if edge.target_id not in self.adj_in:
            self.adj_in[edge.target_id] = set()

        self.adj_out[edge.source_id].add(edge.edge_id)
        self.adj_in[edge.target_id].add(edge.edge_id)

    def get_node(self, node_id: str) -> Optional[GraphNode]:
        """Look up a node by exact ID or common semantic prefixes."""
        if node_id in self.nodes:
            return self.nodes[node_id]
        if f"ASN:{node_id}" in self.nodes:
            return self.nodes[f"ASN:{node_id}"]
        if f"COUNTRY:{node_id}" in self.nodes:
            return self.nodes[f"COUNTRY:{node_id}"]
        return None

    def get_edges(self, node_id: str) -> List[GraphEdge]:
        """Return all incident edges (outgoing and incoming), sorted deterministically."""
        out_e = self.adj_out.get(node_id, set())
        in_e = self.adj_in.get(node_id, set())
        all_e_ids = sorted(list(out_e | in_e))
        return [self.edges[eid] for eid in all_e_ids if eid in self.edges]

    def get_neighbors(self, node_id: str, hops: int = 1) -> Set[str]:
        """
        Return all adjacent node IDs within the specified number of hops.
        Excludes the root node_id itself.
        """
        if node_id not in self.nodes and self.get_node(node_id) is None:
            return set()
        
        actual_node = self.get_node(node_id)
        root_id = actual_node.node_id if actual_node else node_id

        if hops < 1:
            return set()

        visited: Set[str] = {root_id}
        current_frontier: Set[str] = {root_id}

        for _ in range(hops):
            next_frontier: Set[str] = set()
            for curr in current_frontier:
                out_edges = self.adj_out.get(curr, set())
                in_edges = self.adj_in.get(curr, set())
                for e_id in out_edges:
                    e = self.edges.get(e_id)
                    if e and e.target_id not in visited:
                        next_frontier.add(e.target_id)
                for e_id in in_edges:
                    e = self.edges.get(e_id)
                    if e and e.source_id not in visited:
                        next_frontier.add(e.source_id)
            visited.update(next_frontier)
            current_frontier = next_frontier
            if not current_frontier:
                break

        visited.discard(root_id)
        return visited

    def get_subgraph(self, node_id: str, hops: int = 2) -> "GraphSnapshot":
        """
        Extract the induced subgraph containing node_id and all nodes within 'hops',
        along with all edges interconnecting those nodes.
        """
        actual_node = self.get_node(node_id)
        root_id = actual_node.node_id if actual_node else node_id

        subgraph = GraphSnapshot()
        if root_id not in self.nodes:
            return subgraph

        # Collect all nodes within hops
        subgraph_node_ids = {root_id} | self.get_neighbors(root_id, hops=hops)
        for nid in subgraph_node_ids:
            if nid in self.nodes:
                subgraph.add_node(self.nodes[nid])

        # Collect induced edges where both source and target are in subgraph_node_ids
        for nid in subgraph_node_ids:
            for eid in self.adj_out.get(nid, set()):
                edge = self.edges.get(eid)
                if edge and edge.target_id in subgraph_node_ids:
                    subgraph.add_edge(edge)

        return subgraph

    def to_dict(self) -> Dict[str, Any]:
        return {
            "node_count": self.node_count,
            "edge_count": self.edge_count,
            "nodes": [n.to_dict() for n in sorted(self.nodes.values(), key=lambda x: x.node_id)],
            "edges": [e.to_dict() for e in sorted(self.edges.values(), key=lambda x: x.edge_id)],
        }

