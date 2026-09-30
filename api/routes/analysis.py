"""
Analysis API Route Handlers (Task 8A & 8B).
Exposes the SANKET Task 7 deterministic pipeline via HTTP CSV file uploads
and UI-driven read endpoints for alerts, transaction investigations,
forensic graph traversals, and execution summaries.
"""
import csv
import io
import logging
from typing import Optional

from fastapi import APIRouter, File, HTTPException, Query, UploadFile, status

from api.schemas import (
    AlertDetailResponse,
    AlertsListResponse,
    AnalysisResponse,
    GraphEdgeResponse,
    GraphNodeResponse,
    GraphQueryResponse,
    LatestRunSummaryResponse,
    TransactionDetailResponse,
    adapt_alert,
    adapt_analysis_result,
)
from api.state import analysis_state
from src.graph.builder import GraphBuilder
from src.graph.query import GraphQueryEngine
from src.pipeline.orchestrator import PipelineConfig, _canonicalize_item, run_analysis
from src.scoring.alerts import filter_alerts

logger = logging.getLogger("sanket.api.analysis")

router = APIRouter(prefix="/api/v1", tags=["Analysis"])


# ─────────────────────────────────────────────────────────────────────────────
# 1. POST /api/v1/analyze
# ─────────────────────────────────────────────────────────────────────────────
@router.post(
    "/analyze",
    response_model=AnalysisResponse,
    summary="Execute End-to-End SANKET Analysis on Uploaded CSV",
    description="Parses an uploaded canonical transaction CSV, executes the complete deterministic SANKET analysis pipeline, and stores active run state.",
)
async def analyze_csv(
    file: UploadFile = File(..., description="Canonical transaction CSV file"),
    min_risk_level: Optional[str] = Query(
        None,
        description="Optional alert filter tier ('CRITICAL', 'HIGH+', 'MEDIUM+')",
    ),
) -> AnalysisResponse:
    """
    Handle CSV upload, validate input constraints, run analysis pipeline,
    update in-memory analysis state, and return JSON-serializable analysis response.
    """
    # 1. Validate file presence and filename
    if not file or not file.filename:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Missing file or filename.",
        )

    filename_lower = file.filename.lower()
    if not filename_lower.endswith(".csv"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Unsupported file format. Only CSV (.csv) files are supported.",
        )

    # 2. Read file content
    try:
        content_bytes = await file.read()
    except Exception as exc:
        logger.error("Failed to read uploaded file: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Could not read uploaded file content.",
        )

    # 3. Check for empty file
    if not content_bytes or len(content_bytes.strip()) == 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Uploaded file is empty.",
        )

    # 4. Decode content as UTF-8
    try:
        content_str = content_bytes.decode("utf-8")
    except UnicodeDecodeError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Malformed input: File is not valid UTF-8 text.",
        )

    # 5. Parse CSV structure
    try:
        reader = csv.DictReader(io.StringIO(content_str))
        if not reader.fieldnames:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Malformed CSV: Missing header row.",
            )

        required_cols = {"txid", "timestamp"}
        missing_cols = required_cols - set(reader.fieldnames)
        if missing_cols:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Malformed CSV: Missing required transaction columns: {sorted(list(missing_cols))}",
            )

        rows = list(reader)
        if not rows:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Uploaded CSV contains header but no data records.",
            )
    except HTTPException:
        raise
    except Exception as exc:
        logger.warning("CSV parsing error: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Malformed CSV: Unable to parse CSV structure.",
        )

    # 6. Execute Task 7 Pipeline
    config = None
    if min_risk_level:
        config = PipelineConfig(alert_tier_filter=min_risk_level)

    try:
        result = run_analysis(rows, config=config)
    except HTTPException:
        raise
    except Exception as exc:
        logger.error("Analysis pipeline execution failed: %s", exc, exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Internal pipeline analysis failure occurred during execution.",
        )

    # 7. Canonicalize rows and build graph snapshot; update in-memory state
    canonical_records = []
    canonical_map: dict = {}
    for raw_row in rows:
        try:
            canon = _canonicalize_item(raw_row)
            canonical_records.append(canon)
            canonical_map[canon.txid] = canon.model_dump(mode="python")
        except Exception as exc:
            logger.warning("Skipping malformed row during graph canonicalization: %s", exc)

    try:
        graph = GraphBuilder(
            temporal_window_seconds=config.temporal_window_seconds if config else 300.0,
            max_temporal_links_per_tx=config.max_temporal_links_per_tx if config else 5,
            max_coinput_clique_size=config.max_coinput_clique_size if config else 20,
        ).build_from_records(canonical_records)
        analysis_state.set_latest_analysis(result, graph=graph, canonical_map=canonical_map)
    except Exception as exc:
        logger.warning("Failed to build graph snapshot; storing analysis without graph: %s", exc)
        analysis_state.set_latest_analysis(result, graph=None, canonical_map=canonical_map)

    # 8. Adapt and return serializable response
    return adapt_analysis_result(result)


# ─────────────────────────────────────────────────────────────────────────────
# 2. GET /api/v1/alerts
# ─────────────────────────────────────────────────────────────────────────────
@router.get(
    "/alerts",
    response_model=AlertsListResponse,
    summary="Get Ranked Investigative Alerts from Latest Analysis",
    description="Returns deterministically ranked alerts from the most recent completed analysis run, with optional tier filtering.",
)
def get_ranked_alerts(
    min_risk_level: Optional[str] = Query(
        None,
        description="Filter alerts by minimum risk tier ('CRITICAL', 'HIGH+', 'MEDIUM+')",
    ),
) -> AlertsListResponse:
    """Provide ranked alerts from the most recent completed analysis."""
    if not analysis_state.has_analysis():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No analysis has been run yet. Please upload and analyze a dataset first.",
        )

    latest = analysis_state.get_latest_result()
    assert latest is not None
    alerts = latest.ranked_alerts

    if min_risk_level:
        alerts = filter_alerts(alerts, min_level=min_risk_level)

    adapted_alerts = [adapt_alert(a) for a in alerts]
    return AlertsListResponse(
        total=len(adapted_alerts),
        alerts=adapted_alerts,
    )


# ─────────────────────────────────────────────────────────────────────────────
# 3. GET /api/v1/alerts/{alert_id}
# ─────────────────────────────────────────────────────────────────────────────
@router.get(
    "/alerts/{alert_id}",
    response_model=AlertDetailResponse,
    summary="Get Detailed Investigation Information for an Alert",
    description="Returns complete investigation evidence, detector scores, and component breakdowns for a specific alert ID.",
)
def get_alert_detail(alert_id: str) -> AlertDetailResponse:
    """Return complete investigation information for one alert."""
    if not analysis_state.has_analysis():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No analysis has been run yet. Please upload and analyze a dataset first.",
        )

    latest = analysis_state.get_latest_result()
    assert latest is not None

    # Locate alert by alert_id
    matched_alert = None
    for a in latest.ranked_alerts:
        if a.alert_id == alert_id:
            matched_alert = a
            break

    if matched_alert is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Alert with ID '{alert_id}' not found in latest analysis.",
        )

    inv = matched_alert.investigation_object
    tx_id = matched_alert.transaction_id

    # Fallback lookup in investigation_objects or per_transaction_results if needed
    if inv is None:
        for i_obj in latest.investigation_objects:
            if i_obj.transaction_id == tx_id:
                inv = i_obj
                break

    per_tx = latest.per_transaction_results.get(tx_id, {})

    inv_dict = inv.to_dict() if inv is not None else per_tx.get("investigation_object", {})
    detector_scores = inv.detector_scores if inv else {}
    component_scores = inv.component_scores if inv else matched_alert.component_scores
    confidence_components = inv.confidence_components if inv else {}
    evidence_items = inv.evidence_items if inv else matched_alert.evidence_items
    graph_evidence = inv.graph_evidence if inv else per_tx.get("graph_evidence")

    return AlertDetailResponse(
        alert=adapt_alert(matched_alert),
        investigation_object=inv_dict,
        detector_scores={k: round(float(v), 4) for k, v in detector_scores.items()},
        component_scores={k: round(float(v), 4) for k, v in component_scores.items()},
        confidence_components={k: round(float(v), 4) for k, v in confidence_components.items()},
        evidence_items=list(evidence_items),
        graph_evidence=graph_evidence,
    )


# ─────────────────────────────────────────────────────────────────────────────
# 4. GET /api/v1/transactions/{txid}
# ─────────────────────────────────────────────────────────────────────────────
@router.get(
    "/transactions/{txid}",
    response_model=TransactionDetailResponse,
    summary="Get Transaction-Level Investigation Record",
    description="Returns the full forensic investigation record, features, detector results, and graph evidence for a specific transaction ID.",
)
def get_transaction_detail(txid: str) -> TransactionDetailResponse:
    """Return the transaction-level investigation record from the most recent analysis."""
    if not analysis_state.has_analysis():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No analysis has been run yet. Please upload and analyze a dataset first.",
        )

    latest = analysis_state.get_latest_result()
    assert latest is not None

    per_tx = latest.per_transaction_results.get(txid)
    if not per_tx:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Transaction '{txid}' not found in latest analysis.",
        )

    canonical = analysis_state.get_canonical_record(txid)

    return TransactionDetailResponse(
        transaction_id=txid,
        canonical_transaction=canonical,
        features=per_tx.get("features"),
        detector_results={
            "record": per_tx.get("detector_record"),
            "evidence": per_tx.get("detector_evidence"),
        },
        graph_evidence=per_tx.get("graph_evidence"),
        investigation=per_tx.get("investigation_object"),
        alert=per_tx.get("alert"),
    )


# ─────────────────────────────────────────────────────────────────────────────
# 5. GET /api/v1/graph/{txid}
# ─────────────────────────────────────────────────────────────────────────────
@router.get(
    "/graph/{txid}",
    response_model=GraphQueryResponse,
    summary="Get Subgraph Centered on Transaction",
    description="Returns induced subgraph topology (nodes and edges) and graph evidence for a transaction within requested hop count.",
)
def get_transaction_graph(
    txid: str,
    hops: int = Query(2, ge=1, le=5, description="Number of hops to traverse outward from center node"),
    hop: Optional[int] = Query(None, ge=1, le=5, description="Alias for hops query parameter"),
) -> GraphQueryResponse:
    """Return induced graph data and graph evidence for a transaction."""
    if not analysis_state.has_analysis():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No analysis has been run yet. Please upload and analyze a dataset first.",
        )

    graph = analysis_state.get_latest_graph()
    if graph is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Graph representation is not available for the latest analysis.",
        )

    engine = GraphQueryEngine(graph)
    center_node = engine.get_node(txid)
    if center_node is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Transaction '{txid}' not found in graph.",
        )

    effective_hops = hop if hop is not None else hops
    subgraph = engine.get_subgraph(txid, hops=effective_hops)
    evidence = engine.produce_graph_evidence(txid)

    # Format nodes
    nodes = [
        GraphNodeResponse(
            node_id=n.node_id,
            node_type=n.node_type,
            attributes=dict(n.attributes),
        )
        for n in subgraph.nodes.values()
    ]
    nodes.sort(key=lambda x: x.node_id)

    # Format edges
    edges = [
        GraphEdgeResponse(
            edge_id=e.edge_id,
            source_id=e.source_id,
            target_id=e.target_id,
            edge_type=e.edge_type,
            timestamp=e.timestamp,
            attributes=dict(e.attributes),
            metadata=dict(e.metadata),
        )
        for e in subgraph.edges.values()
    ]
    edges.sort(key=lambda x: x.edge_id)

    return GraphQueryResponse(
        transaction_id=txid,
        nodes=nodes,
        edges=edges,
        graph_evidence=evidence,
    )


# ─────────────────────────────────────────────────────────────────────────────
# 6. GET /api/v1/run/latest
# ─────────────────────────────────────────────────────────────────────────────
@router.get(
    "/run/latest",
    response_model=LatestRunSummaryResponse,
    summary="Get Summary of Most Recent Analysis Run",
    description="Returns the execution summary, risk tier counts, and dataset metadata of the latest completed analysis.",
)
def get_latest_run_summary() -> LatestRunSummaryResponse:
    """Return the latest completed analysis summary for Overview and Run History views."""
    if not analysis_state.has_analysis():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No analysis has been run yet. Please upload and analyze a dataset first.",
        )

    latest = analysis_state.get_latest_result()
    assert latest is not None

    # Compute risk tier counts
    risk_counts = {"CRITICAL": 0, "HIGH": 0, "MEDIUM": 0, "LOW": 0}
    for a in latest.ranked_alerts:
        risk_counts[a.risk_level] = risk_counts.get(a.risk_level, 0) + 1

    return LatestRunSummaryResponse(
        run_id=latest.run_id,
        pipeline_version=latest.pipeline_version,
        record_count=int(latest.record_count),
        alert_count=len(latest.ranked_alerts),
        risk_level_counts=risk_counts,
        graph_summary=dict(latest.graph_summary),
        execution_timings={k: round(float(v), 6) for k, v in latest.execution_timings.items()},
        execution_metrics=dict(latest.execution_metrics),
        warnings=list(latest.warnings),
        errors=list(latest.errors),
        dataset_metadata=dict(latest.dataset_metadata),
    )
