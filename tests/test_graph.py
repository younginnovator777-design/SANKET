"""
Tests for SANKET Graph / Entity Link Analysis Foundation (Task 6).
Verifies typed nodes/edges, common-input heuristics, temporal associations,
epistemic safety, query functions, lightweight metrics, determinism, and scale safety.
"""
from datetime import datetime, timezone
import pytest

from src.contract.models import CanonicalTransaction
from src.graph.builder import GraphBuilder, build_graph_from_records
from src.graph.model import EdgeType, GraphEdge, GraphNode, GraphSnapshot, NodeType
from src.graph.query import (
    GraphQueryEngine,
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


def _make_tx(
    txid: str,
    timestamp: str = "2026-09-01T12:00:00Z",
    input_addrs=None,
    output_addrs=None,
    in_amounts=None,
    out_amounts=None,
    src_ip: str = "192.168.1.100",
    asn: str = "AS15169",
    geo_country: str = "US",
    fee: float = 0.0001,
) -> CanonicalTransaction:
    """Helper to construct CanonicalTransaction fixtures."""
    in_a = input_addrs if input_addrs is not None else ["addr_in_1"]
    out_a = output_addrs if output_addrs is not None else ["addr_out_1"]
    in_amt = in_amounts if in_amounts is not None else [1.0] * len(in_a)
    out_amt = out_amounts if out_amounts is not None else [0.9999] * len(out_a)

    return CanonicalTransaction(
        event_id=f"evt_{txid}",
        txid=txid,
        timestamp=datetime.fromisoformat(timestamp.replace("Z", "+00:00")),
        src_ip=src_ip,
        dst_ip="10.0.0.1",
        src_port=8333,
        dst_port=8333,
        input_addresses=in_a,
        output_addresses=out_a,
        input_amounts=in_amt,
        output_amounts=out_amt,
        fee=fee,
        asn=asn,
        geo_country=geo_country,
        source_batch_id="batch_001",
    )


# 1. Transaction nodes created
def test_transaction_nodes_created():
    rec = _make_tx(txid="tx_001", fee=0.0005)
    snapshot = build_graph_from_records([rec])

    tx_node = snapshot.get_node("tx_001")
    assert tx_node is not None
    assert tx_node.node_id == "tx_001"
    assert tx_node.node_type == NodeType.TRANSACTION
    assert tx_node.attributes["fee"] == 0.0005
    assert tx_node.attributes["input_count"] == 1
    assert tx_node.attributes["output_count"] == 1


# 2. Address nodes created
def test_address_nodes_created():
    rec = _make_tx(
        txid="tx_002",
        input_addrs=["addr_alpha", "addr_beta"],
        output_addrs=["addr_gamma"],
    )
    snapshot = build_graph_from_records([rec])

    for addr in ["addr_alpha", "addr_beta", "addr_gamma"]:
        node = snapshot.get_node(addr)
        assert node is not None
        assert node.node_id == addr
        assert node.node_type == NodeType.ADDRESS


# 3. IP nodes created
def test_ip_nodes_created():
    rec = _make_tx(txid="tx_003", src_ip="203.0.113.42")
    snapshot = build_graph_from_records([rec])

    ip_node = snapshot.get_node("203.0.113.42")
    assert ip_node is not None
    assert ip_node.node_id == "203.0.113.42"
    assert ip_node.node_type == NodeType.IP


# 4. Correct INPUT_TO edges
def test_correct_input_to_edges():
    rec = _make_tx(
        txid="tx_004",
        input_addrs=["in_addr_1"],
        in_amounts=[2.5],
    )
    snapshot = build_graph_from_records([rec])

    edge_id = "INPUT_TO:tx_004->in_addr_1"
    assert edge_id in snapshot.edges
    edge = snapshot.edges[edge_id]
    assert edge.source_id == "tx_004"
    assert edge.target_id == "in_addr_1"
    assert edge.edge_type == EdgeType.INPUT_TO
    assert edge.attributes["amount"] == 2.5


# 5. Correct OUTPUT_TO edges
def test_correct_output_to_edges():
    rec = _make_tx(
        txid="tx_005",
        output_addrs=["out_addr_1"],
        out_amounts=[1.85],
    )
    snapshot = build_graph_from_records([rec])

    edge_id = "OUTPUT_TO:tx_005->out_addr_1"
    assert edge_id in snapshot.edges
    edge = snapshot.edges[edge_id]
    assert edge.source_id == "tx_005"
    assert edge.target_id == "out_addr_1"
    assert edge.edge_type == EdgeType.OUTPUT_TO
    assert edge.attributes["amount"] == 1.85


# 6. OBSERVED_WITH edges & SAME_ASN edges
def test_observed_with_edges():
    rec = _make_tx(
        txid="tx_006",
        src_ip="198.51.100.1",
        asn="AS13335",
        geo_country="DE",
    )
    snapshot = build_graph_from_records([rec])

    # tx -> IP
    tx_ip_edge = snapshot.edges.get("OBSERVED_WITH:tx_006->198.51.100.1")
    assert tx_ip_edge is not None
    assert tx_ip_edge.edge_type == EdgeType.OBSERVED_WITH
    assert tx_ip_edge.metadata.get("is_observational_only") is True

    # IP -> ASN
    asn_edge = snapshot.edges.get("SAME_ASN:198.51.100.1->AS13335")
    assert asn_edge is not None
    assert asn_edge.edge_type == EdgeType.SAME_ASN

    # IP -> Country
    country_edge = snapshot.edges.get("OBSERVED_WITH:198.51.100.1->COUNTRY:DE")
    assert country_edge is not None
    assert country_edge.edge_type == EdgeType.OBSERVED_WITH


# 7. Common-input candidate relationship
def test_common_input_candidate_relationship():
    rec = _make_tx(
        txid="tx_007",
        input_addrs=["co_addr_A", "co_addr_B", "co_addr_C"],
    )
    snapshot = build_graph_from_records([rec])

    # Verify pairwise candidate relationship
    pair_edge_id = "CANDIDATE_SAME_ENTITY:co_addr_A->co_addr_B"
    assert pair_edge_id in snapshot.edges
    edge = snapshot.edges[pair_edge_id]
    assert edge.edge_type == EdgeType.CANDIDATE_SAME_ENTITY
    assert edge.metadata["support_count"] == 1
    assert "tx_007" in edge.metadata["supporting_txids"]
    assert edge.metadata["relationship_confidence"] >= 0.50

    # Verify candidate entity node created
    candidate_node = snapshot.get_node("candidate_entity:co_addr_A")
    assert candidate_node is not None
    assert candidate_node.node_type == NodeType.CANDIDATE_ENTITY
    assert len(candidate_node.attributes["member_addresses"]) == 3


# 8. Candidate relationship is NOT represented as established ownership
def test_candidate_relationship_not_established_ownership():
    rec = _make_tx(
        txid="tx_008",
        input_addrs=["addr_X", "addr_Y"],
    )
    snapshot = build_graph_from_records([rec])

    # Edge epistemic check
    edge = snapshot.edges["CANDIDATE_SAME_ENTITY:addr_X->addr_Y"]
    assert edge.metadata["is_established_ownership"] is False
    assert edge.metadata["is_heuristic_only"] is True

    # Candidate entity node epistemic check
    node = snapshot.get_node("candidate_entity:addr_X")
    assert node.attributes["is_established_ownership"] is False
    assert node.attributes["is_heuristic_only"] is True


# 9. Temporal association respects window
def test_temporal_association_respects_window():
    # tx1 and tx2 are 100s apart (<= 300s window) -> associated
    # tx3 is 500s later (> 300s window) -> NOT associated
    tx1 = _make_tx(txid="tx_temp_1", timestamp="2026-09-01T12:00:00Z", input_addrs=["addr_shared"])
    tx2 = _make_tx(txid="tx_temp_2", timestamp="2026-09-01T12:01:40Z", input_addrs=["addr_shared"])
    tx3 = _make_tx(txid="tx_temp_3", timestamp="2026-09-01T12:10:00Z", input_addrs=["addr_shared"])

    snapshot = build_graph_from_records([tx1, tx2, tx3], temporal_window_seconds=300.0)

    # tx1 -> tx2 should exist
    assert "TEMPORALLY_ASSOCIATED:tx_temp_1->tx_temp_2" in snapshot.edges
    edge12 = snapshot.edges["TEMPORALLY_ASSOCIATED:tx_temp_1->tx_temp_2"]
    assert edge12.attributes["time_delta_seconds"] == 100.0
    assert "addr_shared" in edge12.attributes["shared_addresses"]

    # tx1 -> tx3 should NOT exist (500s delta > 300s)
    assert "TEMPORALLY_ASSOCIATED:tx_temp_1->tx_temp_3" not in snapshot.edges
    assert "TEMPORALLY_ASSOCIATED:tx_temp_2->tx_temp_3" not in snapshot.edges


# 10. No future leakage
def test_no_future_leakage():
    # If txs arrive in reverse or chronological, edge direction is strictly past -> current
    tx_past = _make_tx(txid="tx_past", timestamp="2026-09-01T12:00:00Z", input_addrs=["addr_lead"])
    tx_future = _make_tx(txid="tx_future", timestamp="2026-09-01T12:02:00Z", input_addrs=["addr_lead"])

    # Build passing in arbitrary order
    snapshot = build_graph_from_records([tx_future, tx_past], temporal_window_seconds=300.0)

    # Must be past -> future, NEVER future -> past
    assert "TEMPORALLY_ASSOCIATED:tx_past->tx_future" in snapshot.edges
    assert "TEMPORALLY_ASSOCIATED:tx_future->tx_past" not in snapshot.edges

    # Snapshot built with only tx_past has zero knowledge of tx_future
    past_only_snapshot = build_graph_from_records([tx_past])
    assert past_only_snapshot.get_node("tx_future") is None
    # 3 incident edges: INPUT_TO, OUTPUT_TO, and OBSERVED_WITH
    assert len(past_only_snapshot.get_edges("tx_past")) == 3


# 11. Duplicate records handled deterministically
def test_duplicate_records_handled_deterministically():
    tx = _make_tx(txid="tx_dup_1", input_addrs=["in1"], output_addrs=["out1"])
    # Ingest same transaction three times
    snapshot = build_graph_from_records([tx, tx, tx])

    # 6 nodes: tx, in1, out1, IP, ASN, Country
    assert snapshot.node_count == 6
    # Ensure no duplicate edges
    input_edges = [e for e in snapshot.edges.values() if e.edge_type == EdgeType.INPUT_TO]
    assert len(input_edges) == 1



# 12. Missing network metadata safe
def test_missing_network_metadata_safe():
    tx_no_net = CanonicalTransaction(
        event_id="evt_no_net",
        txid="tx_no_net",
        timestamp=datetime(2026, 9, 1, 12, 0, 0, tzinfo=timezone.utc),
        src_ip="",  # Empty IP
        dst_ip="",
        src_port=0,
        dst_port=0,
        input_addresses=[],  # Empty inputs
        output_addresses=["out_only"],
        input_amounts=[],
        output_amounts=[1.0],
        fee=0.0,
        asn=None,  # Missing ASN
        geo_country=None,  # Missing country
        source_batch_id="batch_001",
    )

    snapshot = build_graph_from_records([tx_no_net])
    assert snapshot.get_node("tx_no_net") is not None
    assert snapshot.get_node("out_only") is not None
    # No IP, ASN, or Country nodes created
    assert len([n for n in snapshot.nodes.values() if n.node_type == NodeType.IP]) == 0
    assert len([n for n in snapshot.nodes.values() if n.node_type == NodeType.ASN]) == 0


# 13. 1-hop neighbors
def test_one_hop_neighbors():
    tx = _make_tx(
        txid="tx_hop_1",
        input_addrs=["in_A"],
        output_addrs=["out_B"],
        src_ip="1.2.3.4",
    )
    snapshot = build_graph_from_records([tx])

    neighbors = get_neighbors(snapshot, "tx_hop_1", hops=1)
    assert "in_A" in neighbors
    assert "out_B" in neighbors
    assert "1.2.3.4" in neighbors
    assert "tx_hop_1" not in neighbors


# 14. 2-hop subgraph
def test_two_hop_subgraph():
    # tx1 -> addr_mid -> tx2
    tx1 = _make_tx(txid="tx_sub_1", timestamp="2026-09-01T12:00:00Z", output_addrs=["addr_mid"])
    tx2 = _make_tx(txid="tx_sub_2", timestamp="2026-09-01T12:10:00Z", input_addrs=["addr_mid"], output_addrs=["addr_end"])

    snapshot = build_graph_from_records([tx1, tx2])

    subgraph = get_subgraph(snapshot, "tx_sub_1", hops=2)
    # 2 hops from tx1 reaches: addr_mid (1 hop), tx2 (2 hops)
    assert "tx_sub_1" in subgraph.nodes
    assert "addr_mid" in subgraph.nodes
    assert "tx_sub_2" in subgraph.nodes
    # 3 hops away (addr_end) should not be in 2-hop subgraph of tx_sub_1
    assert "addr_end" not in subgraph.nodes


# 15. Transaction/address/IP query functions
def test_query_functions():
    tx = _make_tx(
        txid="tx_query_1",
        input_addrs=["addr_q_in"],
        output_addrs=["addr_q_out"],
        src_ip="10.20.30.40",
    )
    snapshot = build_graph_from_records([tx])

    # get_transactions_for_address
    txs_in = get_transactions_for_address(snapshot, "addr_q_in")
    assert "tx_query_1" in txs_in
    assert "tx_query_1" in txs_in.inputs

    # get_addresses_for_transaction
    addrs = get_addresses_for_transaction(snapshot, "tx_query_1")
    assert "addr_q_in" in addrs.inputs
    assert "addr_q_out" in addrs.outputs
    assert "addr_q_in" in addrs  # list behavior

    # get_transactions_for_ip
    ip_txs = get_transactions_for_ip(snapshot, "10.20.30.40")
    assert "tx_query_1" in ip_txs

    # get_related_entities
    tx_co = _make_tx(
        txid="tx_query_co",
        input_addrs=["addr_co_1", "addr_co_2"],
    )
    snapshot_co = build_graph_from_records([tx_co])
    related = get_related_entities(snapshot_co, "addr_co_1")
    assert "addr_co_2" in related or "candidate_entity:addr_co_1" in related


# 16. Connected component metric
def test_connected_component_metric():
    # Component 1: tx1 connecting in1 and out1
    tx1 = _make_tx(txid="tx_c1", input_addrs=["c1_in"], output_addrs=["c1_out"], src_ip="1.1.1.1", asn=None, geo_country=None)
    # Component 2: tx2 connecting in2 and out2 (completely disjoint)
    tx2 = _make_tx(txid="tx_c2", input_addrs=["c2_in"], output_addrs=["c2_out"], src_ip="2.2.2.2", asn=None, geo_country=None)

    snapshot = build_graph_from_records([tx1, tx2], temporal_window_seconds=0.0)

    # Component 1 has: tx_c1, c1_in, c1_out, 1.1.1.1 = 4 nodes
    size_c1 = compute_connected_component_size(snapshot, "tx_c1")
    size_c2 = compute_connected_component_size(snapshot, "tx_c2")

    assert size_c1 == 4
    assert size_c2 == 4
    assert compute_connected_component_size(snapshot, "nonexistent") == 0


# 17. Degree metric
def test_degree_metrics():
    # tx with 2 inputs, 1 output, 1 IP
    tx = _make_tx(
        txid="tx_deg",
        input_addrs=["in1", "in2"],
        output_addrs=["out1"],
        in_amounts=[1.0, 2.0],
        out_amounts=[2.999],
        src_ip="5.5.5.5",
        asn=None,
        geo_country=None,
    )
    snapshot = build_graph_from_records([tx])

    # Degree of tx_deg: 2 INPUT_TO + 1 OUTPUT_TO + 1 OBSERVED_WITH = 4
    deg = compute_degree(snapshot, "tx_deg")
    assert deg == 4

    # Weighted degree: 1.0 + 2.0 + 2.999 + 1.0 (for IP edge weight) = 6.999
    w_deg = compute_weighted_degree(snapshot, "tx_deg")
    assert pytest.approx(w_deg, 0.001) == 6.999


# 18. Deterministic graph construction
def test_deterministic_graph_construction():
    tx1 = _make_tx(txid="tx_det_1", timestamp="2026-09-01T12:00:00Z", input_addrs=["a1", "a2"])
    tx2 = _make_tx(txid="tx_det_2", timestamp="2026-09-01T12:01:00Z", input_addrs=["a2", "a3"])

    # Build twice in different input list order
    snapshot1 = build_graph_from_records([tx1, tx2])
    snapshot2 = build_graph_from_records([tx2, tx1])

    dict1 = snapshot1.to_dict()
    dict2 = snapshot2.to_dict()

    assert dict1["node_count"] == dict2["node_count"]
    assert dict1["edge_count"] == dict2["edge_count"]
    assert [n["node_id"] for n in dict1["nodes"]] == [n["node_id"] for n in dict2["nodes"]]
    assert [e["edge_id"] for e in dict1["edges"]] == [e["edge_id"] for e in dict2["edges"]]


# 19. Empty dataset safe
def test_empty_dataset_safe():
    snapshot = build_graph_from_records([])
    assert snapshot.node_count == 0
    assert snapshot.edge_count == 0

    assert get_node(snapshot, "tx_any") is None
    assert get_neighbors(snapshot, "tx_any") == set()
    assert compute_degree(snapshot, "tx_any") == 0
    assert compute_connected_component_size(snapshot, "tx_any") == 0


# 20. Bounded memory / no uncontrolled edge explosion
def test_bounded_memory_no_uncontrolled_edge_explosion():
    # Transaction with 40 inputs (fan-in pattern)
    fan_in_addrs = [f"addr_fan_{i:03d}" for i in range(40)]
    tx = _make_tx(
        txid="tx_large_fan_in",
        input_addrs=fan_in_addrs,
    )
    # Builder should avoid quadratic (40*39/2 = 780) edge explosion
    snapshot = build_graph_from_records([tx], max_coinput_clique_size=20)

    # Edge count should be bounded, not exploding quadratically
    candidate_edges = [e for e in snapshot.edges.values() if e.edge_type == EdgeType.CANDIDATE_SAME_ENTITY]
    assert len(candidate_edges) < 200

    # Temporal chaining explosion test: 20 rapid transactions from same IP
    burst_txs = [
        _make_tx(
            txid=f"tx_burst_{i}",
            timestamp=f"2026-09-01T12:00:{i:02d}Z",
            src_ip="10.0.0.99",
            input_addrs=[f"addr_{i}"],
        )
        for i in range(20)
    ]
    burst_snapshot = build_graph_from_records(burst_txs, temporal_window_seconds=300.0, max_temporal_links_per_tx=3)
    temp_edges = [e for e in burst_snapshot.edges.values() if e.edge_type == EdgeType.TEMPORALLY_ASSOCIATED]
    # 20 txs * max 3 = at most 60 edges, far below 20*19/2 = 190
    assert len(temp_edges) <= 60


# 21. Graph evidence output
def test_produce_graph_evidence():
    tx1 = _make_tx(
        txid="tx_ev_1",
        timestamp="2026-09-01T12:00:00Z",
        input_addrs=["in_ev_1", "in_ev_2"],
        output_addrs=["out_ev_1"],
        src_ip="192.168.10.5",
    )
    tx2 = _make_tx(
        txid="tx_ev_2",
        timestamp="2026-09-01T12:01:00Z",
        input_addrs=["in_ev_2"],
        output_addrs=["out_ev_2"],
        src_ip="192.168.10.5",
    )
    snapshot = build_graph_from_records([tx1, tx2])

    evidence = produce_graph_evidence(snapshot, "tx_ev_1")

    assert evidence["transaction_id"] == "tx_ev_1"
    assert evidence["node_count"] > 0
    assert evidence["edge_count"] > 0
    assert "in_ev_1" in evidence["related_addresses"]
    assert "out_ev_1" in evidence["related_addresses"]
    assert "192.168.10.5" in evidence["related_ips"]
    assert evidence["common_input_support"] >= 1
    assert evidence["temporal_links"] >= 1

    metrics = evidence["graph_metrics"]
    assert "degree" in metrics
    assert "weighted_degree" in metrics
    assert "unique_counterparties" in metrics
    assert "connected_component_size" in metrics
    assert "local_density" in metrics
    assert metrics["degree"] > 0
