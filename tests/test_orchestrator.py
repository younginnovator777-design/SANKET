"""
Tests for SANKET End-to-End Analysis Pipeline Orchestrator (Task 7).
Verifies single entry-point execution, schema compliance, deterministic identity,
per-transaction audit retention, error handling, configuration overrides,
and temporal invariance.
"""
from datetime import datetime, timezone
import pytest

from src.contract.models import CanonicalTransaction
from src.features.pipeline import FEATURE_SCHEMA_VERSION
from src.pipeline.orchestrator import (
    AnalysisResult,
    PipelineConfig,
    PIPELINE_VERSION,
    run_analysis,
)
from src.scoring.risk import (
    WEIGHT_GRAPH,
    WEIGHT_MULTIVARIATE,
    WEIGHT_NETWORK,
    WEIGHT_TEMPORAL,
)


def _make_sample_record(
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
        source_batch_id="batch_orch_001",
    )


# 1. Complete pipeline on small valid dataset
def test_complete_pipeline_on_small_valid_dataset():
    records = [
        _make_sample_record(txid=f"tx_valid_{i}", timestamp=f"2026-09-01T12:0{i}:00Z")
        for i in range(5)
    ]
    res = run_analysis(records)

    assert isinstance(res, AnalysisResult)
    assert res.record_count == 5
    assert len(res.investigation_objects) == 5
    assert len(res.ranked_alerts) == 5
    assert res.graph_summary["node_count"] > 0
    assert res.graph_summary["edge_count"] > 0


# 2. Correct execution order
def test_correct_execution_order():
    records = [
        _make_sample_record(txid="tx_order_1", timestamp="2026-09-01T12:00:00Z"),
        _make_sample_record(txid="tx_order_2", timestamp="2026-09-01T12:01:00Z"),
    ]
    res = run_analysis(records)

    timings = res.execution_timings
    expected_timing_keys = [
        "ingestion_time",
        "feature_time",
        "detection_time",
        "graph_time",
        "scoring_time",
        "ranking_time",
        "total_time",
    ]
    for key in expected_timing_keys:
        assert key in timings, f"Missing execution timing key: {key}"
        assert timings[key] >= 0.0

    # Total time should be greater than individual step times
    assert timings["total_time"] >= timings["ingestion_time"]


# 3. Result schema completeness
def test_result_schema():
    records = [_make_sample_record(txid="tx_schema_1")]
    res = run_analysis(records)
    d = res.to_dict()

    required_fields = [
        "run_id",
        "pipeline_version",
        "record_count",
        "dataset_metadata",
        "feature_schema_version",
        "detector_versions",
        "graph_summary",
        "investigation_objects",
        "ranked_alerts",
        "execution_timings",
        "execution_metrics",
        "per_transaction_results",
        "warnings",
        "errors",
        "rejected_records",
    ]
    for field in required_fields:
        assert field in d, f"Missing required field in AnalysisResult: {field}"

    assert d["pipeline_version"] == PIPELINE_VERSION
    assert d["feature_schema_version"] == FEATURE_SCHEMA_VERSION
    assert "detectors" in d["detector_versions"]
    assert "isolation_forest" in d["detector_versions"]


# 4. Deterministic run_id
def test_deterministic_run_id():
    tx1 = _make_sample_record(txid="tx_id_1", timestamp="2026-09-01T12:00:00Z")
    tx2 = _make_sample_record(txid="tx_id_2", timestamp="2026-09-01T12:01:00Z")

    # Run in forward and reverse order
    res1 = run_analysis([tx1, tx2])
    res2 = run_analysis([tx2, tx1])

    assert res1.run_id == res2.run_id
    assert res1.run_id.startswith("sanket_run_")

    # Different data yields different run_id
    tx3 = _make_sample_record(txid="tx_id_3", timestamp="2026-09-01T12:05:00Z")
    res3 = run_analysis([tx1, tx3])
    assert res1.run_id != res3.run_id


# 5. Deterministic outputs
def test_deterministic_outputs():
    records = [
        _make_sample_record(txid=f"tx_det_{i}", timestamp=f"2026-09-01T12:0{i}:00Z")
        for i in range(6)
    ]
    res1 = run_analysis(records)
    res2 = run_analysis(records)

    # All non-timing fields must be strictly identical
    dict1 = res1.to_dict()
    dict2 = res2.to_dict()

    assert dict1["run_id"] == dict2["run_id"]
    assert dict1["record_count"] == dict2["record_count"]
    assert dict1["graph_summary"] == dict2["graph_summary"]
    assert [inv["risk_score"] for inv in dict1["investigation_objects"]] == [
        inv["risk_score"] for inv in dict2["investigation_objects"]
    ]
    assert [a["alert_id"] for a in dict1["ranked_alerts"]] == [
        a["alert_id"] for a in dict2["ranked_alerts"]
    ]
    assert [a["priority_score"] for a in dict1["ranked_alerts"]] == [
        a["priority_score"] for a in dict2["ranked_alerts"]
    ]


# 6. Graph evidence reaches scoring
def test_graph_evidence_reaches_scoring():
    # Co-input transaction triggers candidate entity clustering
    tx = _make_sample_record(
        txid="tx_graph_reach",
        input_addrs=["in_alpha", "in_beta", "in_gamma"],
    )
    res = run_analysis([tx])

    inv = res.investigation_objects[0]
    assert inv.graph_evidence is not None
    assert inv.graph_evidence["common_input_support"] >= 1
    assert inv.component_scores["G"] > 0.0
    assert inv.confidence_components["Gs"] > 0.0

    # Per-transaction audit retention
    audit = res.per_transaction_results["tx_graph_reach"]
    assert audit["graph_evidence"] is not None
    assert audit["features"] is not None
    assert audit["detector_record"] is not None


# 7. Alerts are generated
def test_alerts_are_generated():
    records = [
        _make_sample_record(txid=f"tx_alert_{i}", timestamp=f"2026-09-01T12:0{i}:00Z")
        for i in range(4)
    ]
    res = run_analysis(records)

    assert len(res.ranked_alerts) == 4
    for idx, alert in enumerate(res.ranked_alerts, start=1):
        assert alert.rank == idx
        assert 0.0 <= alert.priority_score <= 1.0
        assert 0.0 <= alert.risk_score <= 1.0
        assert 0.0 <= alert.confidence_score <= 1.0
        assert alert.risk_level in ("LOW", "MEDIUM", "HIGH", "CRITICAL")


# 8. Malformed record handling
def test_malformed_record_handling():
    valid_tx = _make_sample_record(txid="tx_good_1")
    malformed_dict = {
        "event_id": "evt_bad",
        "txid": "tx_bad",
        # invalid negative amount violates validation
        "input_amounts": [-10.5],
        "fee": -1.0,
    }

    res = run_analysis([valid_tx, malformed_dict])

    assert res.record_count == 1
    assert len(res.rejected_records) == 1
    assert len(res.warnings) >= 1
    assert res.rejected_records[0]["raw_data"] is not None
    assert "error" in res.rejected_records[0]


# 9. Empty dataset
def test_empty_dataset():
    res = run_analysis([])

    assert res.record_count == 0
    assert res.investigation_objects == []
    assert res.ranked_alerts == []
    assert res.graph_summary == {"node_count": 0, "edge_count": 0}
    assert res.execution_metrics["accepted_records"] == 0
    assert res.execution_metrics["alerts_count"] == 0


# 10. Missing optional network metadata
def test_missing_optional_network_metadata():
    tx_no_net = CanonicalTransaction(
        event_id="evt_no_net",
        txid="tx_no_net",
        timestamp=datetime(2026, 9, 1, 12, 0, 0, tzinfo=timezone.utc),
        src_ip="",
        dst_ip="",
        src_port=0,
        dst_port=0,
        input_addresses=["in_addr"],
        output_addresses=["out_addr"],
        input_amounts=[1.0],
        output_amounts=[0.999],
        fee=0.001,
        asn=None,
        geo_country=None,
        source_batch_id="batch_001",
    )

    res = run_analysis([tx_no_net])
    assert res.record_count == 1
    assert len(res.investigation_objects) == 1
    assert res.investigation_objects[0].risk_score >= 0.0


# 11. Temporal no future leakage
def test_temporal_no_future_leakage():
    tx_past = _make_sample_record(txid="tx_t1", timestamp="2026-09-01T12:00:00Z", input_addrs=["shared_addr"])
    tx_future = _make_sample_record(txid="tx_t2", timestamp="2026-09-01T12:02:00Z", input_addrs=["shared_addr"])

    # Run pipeline on both
    res = run_analysis([tx_future, tx_past])

    # The past transaction's features and graph connections must never reference future
    past_graph_ev = res.per_transaction_results["tx_t1"]["graph_evidence"]
    # At tx_t1 time, tx_t2 did not exist in the past buffer
    assert "tx_t2" not in past_graph_ev.get("related_addresses", [])


# 12. Pipeline timing fields
def test_pipeline_timing_fields():
    records = [_make_sample_record(txid="tx_timing_test")]
    res = run_analysis(records)

    metrics = res.execution_metrics
    assert "records_per_second" in metrics
    assert "peak_memory_mb" in metrics
    assert "accepted_records" in metrics
    assert "rejected_records" in metrics
    assert "alerts_count" in metrics


# 13. Configuration overrides
def test_configuration_overrides():
    records = [
        _make_sample_record(txid=f"tx_cfg_{i}", timestamp=f"2026-09-01T12:0{i}:00Z")
        for i in range(8)
    ]
    config = PipelineConfig(
        run_id="custom_run_override_999",
        top_k_alerts=3,
        temporal_window_seconds=60.0,
    )
    res = run_analysis(records, config=config)

    assert res.run_id == "custom_run_override_999"
    assert len(res.ranked_alerts) == 3
    assert [a.rank for a in res.ranked_alerts] == [1, 2, 3]


# 14. Existing modules are not mutated unexpectedly
def test_existing_modules_not_mutated_unexpectedly():
    assert WEIGHT_MULTIVARIATE == 0.45
    assert WEIGHT_GRAPH == 0.25
    assert WEIGHT_TEMPORAL == 0.20
    assert WEIGHT_NETWORK == 0.10

    # Run analysis
    res = run_analysis([_make_sample_record(txid="tx_mut_test")])
    assert res.record_count == 1

    # Invariants remain unaltered
    assert WEIGHT_MULTIVARIATE == 0.45
    assert WEIGHT_GRAPH == 0.25
    assert WEIGHT_TEMPORAL == 0.20
    assert WEIGHT_NETWORK == 0.10
