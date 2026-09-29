"""
SANKET Graph / Entity Link Analysis Foundation.
"""
from src.graph.builder import GraphBuilder, build_graph_from_records
from src.graph.model import (
    EdgeType,
    GraphEdge,
    GraphNode,
    GraphSnapshot,
    NodeType,
)
from src.graph.query import (
    AddressTransactions,
    GraphQueryEngine,
    RelatedEntities,
    TransactionAddresses,
    compute_connected_component_size,
    compute_degree,
    compute_graph_metrics,
    compute_local_density,
    compute_unique_counterparties,
    compute_weighted_degree,
    get_addresses_for_transaction,
    get_edges,
    get_neighbors,
    get_node,
    get_related_entities,
    get_subgraph,
    get_transactions_for_address,
    get_transactions_for_ip,
    produce_graph_evidence,
)

__all__ = [
    # Models
    "NodeType",
    "EdgeType",
    "GraphNode",
    "GraphEdge",
    "GraphSnapshot",
    # Builder
    "GraphBuilder",
    "build_graph_from_records",
    # Query Engine & Returns
    "GraphQueryEngine",
    "AddressTransactions",
    "TransactionAddresses",
    "RelatedEntities",
    # Query Functions
    "get_node",
    "get_neighbors",
    "get_subgraph",
    "get_edges",
    "get_transactions_for_address",
    "get_addresses_for_transaction",
    "get_transactions_for_ip",
    "get_related_entities",
    # Metrics
    "compute_degree",
    "compute_weighted_degree",
    "compute_unique_counterparties",
    "compute_connected_component_size",
    "compute_local_density",
    "compute_graph_metrics",
    # Evidence
    "produce_graph_evidence",
]
