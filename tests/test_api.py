"""
Integration and Unit Tests for SANKET API Layer (Task 8A).
Verifies:
- GET /health endpoint
- POST /api/v1/analyze with valid small CSV
- Unsupported file type rejection
- Empty file handling
- Malformed CSV handling (missing header, missing required cols, no data rows, non-UTF8)
- Response schema validation
- Pipeline quarantine visibility
- Pipeline unexpected internal error handling (no stack traces exposed)
- Query param filter configuration
- Deterministic output across repeated calls
"""
import io
from unittest.mock import patch
import pytest
from fastapi.testclient import TestClient

from api.main import app
from api.schemas import AnalysisResponse, HealthResponse
from src.pipeline import PIPELINE_VERSION

client = TestClient(app)

SAMPLE_CSV_CONTENT = """event_id,txid,timestamp,src_ip,dst_ip,src_port,dst_port,input_addresses,output_addresses,input_amounts,output_amounts,fee,script_type,geo_country,asn
evt_1,tx_001,2026-09-01T12:00:00Z,192.168.1.1,10.0.0.1,5000,8333,addr_1,addr_2|addr_3,1.5,1.0|0.4999,0.0001,p2pkh,US,AS15169
evt_2,tx_002,2026-09-01T12:01:00Z,192.168.1.2,10.0.0.2,5001,8333,addr_2,addr_4,1.0,0.9999,0.0001,p2wpkh,US,AS15169
evt_3,tx_003,2026-09-01T12:02:00Z,192.168.1.3,10.0.0.3,5002,8333,addr_4,addr_5,0.9999,0.9998,0.0001,p2sh,US,AS15169
"""


def test_health_endpoint():
    """Verify GET /health returns service identity, status, and pipeline version."""
    resp = client.get("/health")
    assert resp.status_code == 200
    data = resp.json()

    # Validate against Pydantic schema
    health = HealthResponse(**data)
    assert health.status == "healthy"
    assert health.service == "SANKET"
    assert health.pipeline_version == PIPELINE_VERSION


def test_valid_small_csv_analysis():
    """Verify POST /api/v1/analyze executes pipeline and returns full AnalysisResponse."""
    files = {"file": ("transactions.csv", SAMPLE_CSV_CONTENT.encode("utf-8"), "text/csv")}
    resp = client.post("/api/v1/analyze", files=files)
    assert resp.status_code == 200

    data = resp.json()
    validated = AnalysisResponse(**data)

    # Core attributes
    assert validated.run_id.startswith("sanket_run_")
    assert validated.pipeline_version == PIPELINE_VERSION
    assert validated.record_count == 3
    assert validated.rejected_record_count == 0

    # Graph summary
    assert "node_count" in validated.graph_summary
    assert validated.graph_summary["node_count"] > 0
    assert "edge_count" in validated.graph_summary

    # Ranked alerts
    assert len(validated.ranked_alerts) == 3
    top_alert = validated.ranked_alerts[0]
    assert top_alert.rank == 1
    assert 0.0 <= top_alert.risk_score <= 1.0
    assert 0.0 <= top_alert.confidence_score <= 1.0
    assert 0.0 <= top_alert.priority_score <= 1.0
    assert top_alert.risk_level in {"CRITICAL", "HIGH", "MEDIUM", "LOW"}

    # Timings and metrics
    assert "total_time" in validated.execution_timings
    assert "ingestion_time" in validated.execution_timings
    assert "records_per_second" in validated.execution_metrics
    assert "peak_memory_mb" in validated.execution_metrics

    # Verify per_transaction_results is excluded for payload compactness
    assert "per_transaction_results" not in data


def test_unsupported_file_type():
    """Verify rejection of non-CSV extensions with HTTP 400."""
    # Text file
    resp_txt = client.post(
        "/api/v1/analyze",
        files={"file": ("transactions.txt", b"foo,bar", "text/plain")},
    )
    assert resp_txt.status_code == 400
    assert "Only CSV (.csv) files are supported" in resp_txt.json()["detail"]

    # JSON file
    resp_json = client.post(
        "/api/v1/analyze",
        files={"file": ("transactions.json", b"{}", "application/json")},
    )
    assert resp_json.status_code == 400
    assert "Only CSV (.csv) files are supported" in resp_json.json()["detail"]


def test_empty_upload():
    """Verify empty file upload returns HTTP 400."""
    resp = client.post(
        "/api/v1/analyze",
        files={"file": ("empty.csv", b"", "text/csv")},
    )
    assert resp.status_code == 400
    assert "Uploaded file is empty" in resp.json()["detail"]

    # Whitespace only
    resp_ws = client.post(
        "/api/v1/analyze",
        files={"file": ("whitespace.csv", b"   \n  \t  \n", "text/csv")},
    )
    assert resp_ws.status_code == 400
    assert "Uploaded file is empty" in resp_ws.json()["detail"]


def test_malformed_csv_missing_required_columns():
    """Verify CSV missing required transaction columns returns HTTP 400."""
    content = "user_name,score,country\nalice,100,US\nbob,90,CA\n"
    resp = client.post(
        "/api/v1/analyze",
        files={"file": ("wrong_columns.csv", content.encode("utf-8"), "text/csv")},
    )
    assert resp.status_code == 400
    detail = resp.json()["detail"]
    assert "Missing required transaction columns" in detail
    assert "txid" in detail
    assert "timestamp" in detail


def test_malformed_csv_no_data_rows():
    """Verify CSV with header only and zero records returns HTTP 400."""
    content = "event_id,txid,timestamp,src_ip,dst_ip,src_port,dst_port,fee\n"
    resp = client.post(
        "/api/v1/analyze",
        files={"file": ("header_only.csv", content.encode("utf-8"), "text/csv")},
    )
    assert resp.status_code == 400
    assert "contains header but no data records" in resp.json()["detail"]


def test_non_utf8_binary_upload():
    """Verify uploading invalid UTF-8 bytes returns HTTP 400."""
    invalid_bytes = b"\xff\xfe\x00\x00\xaa\xbb\xcc\xdd"
    resp = client.post(
        "/api/v1/analyze",
        files={"file": ("binary.csv", invalid_bytes, "text/csv")},
    )
    assert resp.status_code == 400
    assert "not valid UTF-8 text" in resp.json()["detail"]


def test_pipeline_quarantine_handling():
    """Verify individual malformed records are quarantined without crashing the batch."""
    # 1 valid record and 1 record with invalid port
    content = """event_id,txid,timestamp,src_ip,dst_ip,src_port,dst_port,fee
evt_ok,tx_ok,2026-09-01T12:00:00Z,192.168.1.1,10.0.0.1,5000,8333,0.0001
evt_bad,tx_bad,2026-09-01T12:01:00Z,192.168.1.2,10.0.0.2,INVALID_PORT,8333,0.0001
"""
    resp = client.post(
        "/api/v1/analyze",
        files={"file": ("partial_bad.csv", content.encode("utf-8"), "text/csv")},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["record_count"] == 1
    assert data["rejected_record_count"] == 1
    assert len(data["warnings"]) >= 1
    assert any("Quarantined" in w for w in data["warnings"])


def test_pipeline_unexpected_error_handling():
    """Verify unexpected internal pipeline exceptions return HTTP 500 without stack traces."""
    with patch("api.routes.analysis.run_analysis", side_effect=RuntimeError("Internal DB failure")):
        resp = client.post(
            "/api/v1/analyze",
            files={"file": ("test.csv", SAMPLE_CSV_CONTENT.encode("utf-8"), "text/csv")},
        )
        assert resp.status_code == 500
        detail = resp.json()["detail"]
        assert "Internal pipeline analysis failure occurred" in detail
        # Stack trace should NOT be leaked
        assert "Traceback" not in detail
        assert "RuntimeError" not in detail


def test_filter_by_min_risk_level():
    """Verify min_risk_level query parameter filters returned alerts."""
    resp = client.post(
        "/api/v1/analyze?min_risk_level=CRITICAL",
        files={"file": ("test.csv", SAMPLE_CSV_CONTENT.encode("utf-8"), "text/csv")},
    )
    assert resp.status_code == 200
    data = resp.json()
    for alert in data["ranked_alerts"]:
        assert alert["risk_level"] == "CRITICAL"


def test_deterministic_output_across_calls():
    """Verify running the same CSV repeatedly yields identical run_id, alert ranking, and scores."""
    files1 = {"file": ("dataset.csv", SAMPLE_CSV_CONTENT.encode("utf-8"), "text/csv")}
    files2 = {"file": ("dataset.csv", SAMPLE_CSV_CONTENT.encode("utf-8"), "text/csv")}

    resp1 = client.post("/api/v1/analyze", files=files1)
    resp2 = client.post("/api/v1/analyze", files=files2)

    assert resp1.status_code == 200
    assert resp2.status_code == 200

    d1 = resp1.json()
    d2 = resp2.json()

    assert d1["run_id"] == d2["run_id"]
    assert d1["record_count"] == d2["record_count"]
    assert d1["graph_summary"] == d2["graph_summary"]

    # Verify ranked alerts match exactly
    assert len(d1["ranked_alerts"]) == len(d2["ranked_alerts"])
    for a1, a2 in zip(d1["ranked_alerts"], d2["ranked_alerts"]):
        assert a1["alert_id"] == a2["alert_id"]
        assert a1["transaction_id"] == a2["transaction_id"]
        assert a1["rank"] == a2["rank"]
        assert a1["risk_score"] == a2["risk_score"]
        assert a1["confidence_score"] == a2["confidence_score"]
        assert a1["priority_score"] == a2["priority_score"]


# =============================================================================
# Task 8B Tests: UI-Driven Read Endpoints
# =============================================================================

from api.state import analysis_state


def test_404_when_no_analysis_exists():
    """Verify all read endpoints return HTTP 404 when no analysis has been executed."""
    analysis_state.clear()

    endpoints = [
        "/api/v1/alerts",
        "/api/v1/alerts/ALT_nonexistent_0001",
        "/api/v1/transactions/tx_nonexistent",
        "/api/v1/graph/tx_nonexistent",
        "/api/v1/run/latest",
    ]
    for ep in endpoints:
        resp = client.get(ep)
        assert resp.status_code == 404
        assert "No analysis has been run yet" in resp.json()["detail"]


def test_get_alerts_after_analysis():
    """Verify GET /api/v1/alerts returns deterministically ranked alerts after an analysis."""
    # Ensure fresh analysis
    files = {"file": ("dataset.csv", SAMPLE_CSV_CONTENT.encode("utf-8"), "text/csv")}
    post_resp = client.post("/api/v1/analyze", files=files)
    assert post_resp.status_code == 200

    resp = client.get("/api/v1/alerts")
    assert resp.status_code == 200
    data = resp.json()

    assert data["total"] == 3
    assert len(data["alerts"]) == 3

    # Check rank order is strictly sequential (1, 2, 3)
    ranks = [a["rank"] for a in data["alerts"]]
    assert ranks == [1, 2, 3]

    # Verify priority score is non-increasing
    priorities = [a["priority_score"] for a in data["alerts"]]
    assert priorities == sorted(priorities, reverse=True)

    # Test filtering by min_risk_level
    resp_filter = client.get("/api/v1/alerts?min_risk_level=CRITICAL")
    assert resp_filter.status_code == 200
    filter_data = resp_filter.json()
    for a in filter_data["alerts"]:
        assert a["risk_level"] == "CRITICAL"


def test_get_alert_by_id():
    """Verify GET /api/v1/alerts/{alert_id} returns complete investigation details."""
    # Fetch alerts list first
    list_resp = client.get("/api/v1/alerts")
    assert list_resp.status_code == 200
    alerts = list_resp.json()["alerts"]
    assert len(alerts) > 0
    target_alert_id = alerts[0]["alert_id"]

    resp = client.get(f"/api/v1/alerts/{target_alert_id}")
    assert resp.status_code == 200
    detail = resp.json()

    assert detail["alert"]["alert_id"] == target_alert_id
    assert "investigation_object" in detail
    assert "detector_scores" in detail
    assert "component_scores" in detail
    assert "confidence_components" in detail
    assert "evidence_items" in detail
    assert "graph_evidence" in detail

    # Verify component scores contain authoritative M, T, N, G components
    comp_scores = detail["component_scores"]
    for key in ("M", "T", "N", "G"):
        assert key in comp_scores

    # Verify 404 on invalid alert ID
    resp_404 = client.get("/api/v1/alerts/ALT_definitely_not_found_9999")
    assert resp_404.status_code == 404
    assert "not found" in resp_404.json()["detail"].lower()


def test_get_transaction_by_txid():
    """Verify GET /api/v1/transactions/{txid} returns per-transaction investigation records."""
    target_txid = "tx_001"
    resp = client.get(f"/api/v1/transactions/{target_txid}")
    assert resp.status_code == 200
    tx_detail = resp.json()

    assert tx_detail["transaction_id"] == target_txid
    assert tx_detail["canonical_transaction"] is not None
    assert tx_detail["canonical_transaction"]["txid"] == target_txid
    assert "features" in tx_detail
    assert "detector_results" in tx_detail
    assert "graph_evidence" in tx_detail
    assert "investigation" in tx_detail
    assert "alert" in tx_detail

    # Test non-existent txid
    resp_404 = client.get("/api/v1/transactions/tx_phantom_999")
    assert resp_404.status_code == 404
    assert "not found" in resp_404.json()["detail"].lower()


def test_get_graph_by_txid_and_schemas():
    """Verify GET /api/v1/graph/{txid} returns authoritative node/edge schemas within hops."""
    target_txid = "tx_001"

    # Default hops=2
    resp_2 = client.get(f"/api/v1/graph/{target_txid}")
    assert resp_2.status_code == 200
    graph_data_2 = resp_2.json()

    assert graph_data_2["transaction_id"] == target_txid
    assert len(graph_data_2["nodes"]) > 0
    assert len(graph_data_2["edges"]) > 0
    assert "graph_evidence" in graph_data_2

    # Verify authoritative backend node types ONLY
    VALID_NODE_TYPES = {"TRANSACTION", "ADDRESS", "IP", "ASN", "COUNTRY", "CANDIDATE_ENTITY"}
    node_types_observed = {n["node_type"] for n in graph_data_2["nodes"]}
    assert node_types_observed.issubset(VALID_NODE_TYPES)
    # Ensure no generic lowercase types
    assert not any(t in node_types_observed for t in {"address", "transaction", "entity", "cluster"})

    # Verify authoritative backend edge types ONLY
    VALID_EDGE_TYPES = {
        "INPUT_TO",
        "OUTPUT_TO",
        "OBSERVED_WITH",
        "SAME_IP",
        "SAME_ASN",
        "TEMPORALLY_ASSOCIATED",
        "CANDIDATE_SAME_ENTITY",
    }
    edge_types_observed = {e["edge_type"] for e in graph_data_2["edges"]}
    assert edge_types_observed.issubset(VALID_EDGE_TYPES)
    # Ensure no generic lowercase types
    assert not any(t in edge_types_observed for t in {"input", "output", "transfer", "association"})

    # Test ?hops=1 and alias ?hop=1
    resp_1 = client.get(f"/api/v1/graph/{target_txid}?hops=1")
    assert resp_1.status_code == 200
    resp_alias = client.get(f"/api/v1/graph/{target_txid}?hop=1")
    assert resp_alias.status_code == 200
    assert len(resp_1.json()["nodes"]) == len(resp_alias.json()["nodes"])

    # 1-hop subgraph must be subset or equal to 2-hop subgraph
    assert len(resp_1.json()["nodes"]) <= len(graph_data_2["nodes"])

    # Test non-existent txid
    resp_404 = client.get("/api/v1/graph/tx_nonexistent_999")
    assert resp_404.status_code == 404


def test_get_latest_run_summary():
    """Verify GET /api/v1/run/latest returns complete analysis run summary."""
    resp = client.get("/api/v1/run/latest")
    assert resp.status_code == 200
    summary = resp.json()

    assert summary["run_id"].startswith("sanket_run_")
    assert summary["pipeline_version"] == PIPELINE_VERSION
    assert summary["record_count"] == 3
    assert summary["alert_count"] == 3

    # Check risk level counts
    assert "risk_level_counts" in summary
    for tier in ("CRITICAL", "HIGH", "MEDIUM", "LOW"):
        assert tier in summary["risk_level_counts"]

    # Graph summary
    assert "node_count" in summary["graph_summary"]
    assert "edge_count" in summary["graph_summary"]

    # Timings and metrics
    assert "total_time" in summary["execution_timings"]
    assert "records_per_second" in summary["execution_metrics"]


def test_latest_result_state_replacement():
    """Verify that executing a new analysis cleanly replaces latest-result in memory."""
    # First dataset with 2 records
    csv_2 = """event_id,txid,timestamp,src_ip,dst_ip,src_port,dst_port,fee
evt_a,tx_alpha,2026-09-01T12:00:00Z,192.168.1.1,10.0.0.1,5000,8333,0.0001
evt_b,tx_beta,2026-09-01T12:01:00Z,192.168.1.2,10.0.0.2,5001,8333,0.0001
"""
    post1 = client.post("/api/v1/analyze", files={"file": ("first.csv", csv_2.encode("utf-8"), "text/csv")})
    assert post1.status_code == 200
    run_id_1 = post1.json()["run_id"]

    run1 = client.get("/api/v1/run/latest").json()
    assert run1["run_id"] == run_id_1
    assert run1["record_count"] == 2

    # Second dataset with 3 records (SAMPLE_CSV_CONTENT)
    post2 = client.post("/api/v1/analyze", files={"file": ("second.csv", SAMPLE_CSV_CONTENT.encode("utf-8"), "text/csv")})
    assert post2.status_code == 200
    run_id_2 = post2.json()["run_id"]

    assert run_id_1 != run_id_2

    run2 = client.get("/api/v1/run/latest").json()
    assert run2["run_id"] == run_id_2
    assert run2["record_count"] == 3

