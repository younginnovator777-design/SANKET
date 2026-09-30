"""
Pydantic API Request/Response Schemas and Boundary Adapters.
Keeps core engine dataclasses decoupled from FastAPI serialization requirements.
"""
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field

from src.pipeline.orchestrator import AnalysisResult
from src.scoring.alerts import Alert


class HealthResponse(BaseModel):
    """Health check response schema."""
    status: str = Field(..., description="Service health status", json_schema_extra={"example": "healthy"})
    service: str = Field(..., description="Service identifier", json_schema_extra={"example": "SANKET"})
    pipeline_version: Optional[str] = Field(None, description="Active SANKET pipeline version", json_schema_extra={"example": "sanket-pipeline-v1"})


class AlertSummaryResponse(BaseModel):
    """Ranked investigative alert summary schema."""
    alert_id: str = Field(..., description="Unique alert identifier")
    transaction_id: str = Field(..., description="Target transaction ID")
    rank: int = Field(..., description="1-indexed priority rank")
    risk_score: float = Field(..., description="Analytical risk score [0, 1]")
    confidence_score: float = Field(..., description="Epistemic confidence score [0, 1]")
    risk_level: str = Field(..., description="Categorical risk tier (CRITICAL, HIGH, MEDIUM, LOW)")
    priority_score: float = Field(..., description="Weighted triage priority score [0, 1]")
    triggered_detectors: List[str] = Field(default_factory=list, description="Detector IDs that triggered positive signals")
    independent_signal_count: int = Field(default=0, description="Count of independent signal dimensions triggered")
    evidence_categories: List[str] = Field(default_factory=list, description="Categories of evidence observed")
    component_scores: Dict[str, float] = Field(default_factory=dict, description="Component-level risk breakdown (M, T, N, G, S, Gs, C)")
    scoring_version: str = Field(default="sanket-scoring-v1", description="Scoring formula version")
    evidence_items: List[Dict[str, Any]] = Field(default_factory=list, description="Structured evidentiary items supporting the alert")


class AnalysisResponse(BaseModel):
    """End-to-End Analysis response payload returned to clients."""
    run_id: str = Field(..., description="Deterministic run identifier")
    pipeline_version: str = Field(..., description="Pipeline execution engine version")
    record_count: int = Field(..., description="Count of accepted and analyzed canonical records")
    rejected_record_count: int = Field(default=0, description="Count of quarantined or rejected input records")
    dataset_metadata: Dict[str, Any] = Field(default_factory=dict, description="Metadata regarding input dataset source and batch")
    feature_schema_version: Optional[str] = Field(None, description="Feature extractor schema version")
    detector_versions: Optional[Dict[str, str]] = Field(default_factory=dict, description="Detector and model versions")
    graph_summary: Dict[str, Any] = Field(default_factory=dict, description="Summary graph topology statistics (nodes, edges)")
    ranked_alerts: List[AlertSummaryResponse] = Field(default_factory=list, description="Priority-ranked investigative alerts")
    execution_timings: Dict[str, float] = Field(default_factory=dict, description="Execution durations per stage in seconds")
    execution_metrics: Dict[str, Any] = Field(default_factory=dict, description="Throughput and resource usage metrics")
    warnings: List[str] = Field(default_factory=list, description="Non-fatal warnings encountered during execution")
    errors: List[str] = Field(default_factory=list, description="Non-fatal error notices recorded during execution")


class AlertsListResponse(BaseModel):
    """List response for /api/v1/alerts endpoint."""
    total: int = Field(..., description="Total count of alerts matching filter criteria")
    alerts: List[AlertSummaryResponse] = Field(..., description="Deterministically ranked alerts")


class AlertDetailResponse(BaseModel):
    """Deep-dive investigation detail response for /api/v1/alerts/{alert_id}."""
    alert: AlertSummaryResponse = Field(..., description="Alert summary")
    investigation_object: Dict[str, Any] = Field(..., description="Full underlying investigation object")
    detector_scores: Dict[str, float] = Field(..., description="Individual detector score breakdown")
    component_scores: Dict[str, float] = Field(..., description="Component risk breakdown (M, T, N, G, S, Gs, C)")
    confidence_components: Dict[str, float] = Field(..., description="Epistemic confidence component breakdown (D, E, S, Gs, X)")
    evidence_items: List[Dict[str, Any]] = Field(..., description="Evidentiary items supporting the alert")
    graph_evidence: Optional[Dict[str, Any]] = Field(None, description="Graph evidence associated with the transaction")


class TransactionDetailResponse(BaseModel):
    """Transaction investigation record for /api/v1/transactions/{txid}."""
    transaction_id: str = Field(..., description="Transaction identifier")
    canonical_transaction: Optional[Dict[str, Any]] = Field(None, description="Canonical input transaction record")
    features: Optional[Dict[str, Any]] = Field(None, description="Calculated feature values")
    detector_results: Optional[Dict[str, Any]] = Field(None, description="Detection records and evidence")
    graph_evidence: Optional[Dict[str, Any]] = Field(None, description="Graph metrics and topological evidence")
    investigation: Optional[Dict[str, Any]] = Field(None, description="Consolidated investigation object")
    alert: Optional[Dict[str, Any]] = Field(None, description="Ranked alert details if alerted")


class GraphNodeResponse(BaseModel):
    """Node in forensic transaction/entity graph."""
    node_id: str = Field(..., description="Unique node identifier")
    node_type: str = Field(..., description="Authoritative node type (TRANSACTION, ADDRESS, IP, ASN, COUNTRY, CANDIDATE_ENTITY)")
    attributes: Dict[str, Any] = Field(default_factory=dict, description="Node attributes")


class GraphEdgeResponse(BaseModel):
    """Edge in forensic transaction/entity graph."""
    edge_id: str = Field(..., description="Unique edge identifier")
    source_id: str = Field(..., description="Source node ID")
    target_id: str = Field(..., description="Target node ID")
    edge_type: str = Field(..., description="Authoritative edge type (INPUT_TO, OUTPUT_TO, OBSERVED_WITH, SAME_IP, SAME_ASN, TEMPORALLY_ASSOCIATED, CANDIDATE_SAME_ENTITY)")
    timestamp: Optional[float] = Field(None, description="Observation timestamp if applicable")
    attributes: Dict[str, Any] = Field(default_factory=dict, description="Edge attributes")
    metadata: Dict[str, Any] = Field(default_factory=dict, description="Edge evidence metadata")


class GraphQueryResponse(BaseModel):
    """Induced subgraph response for /api/v1/graph/{txid}."""
    transaction_id: str = Field(..., description="Queried center transaction ID")
    nodes: List[GraphNodeResponse] = Field(..., description="Nodes within requested hop boundary")
    edges: List[GraphEdgeResponse] = Field(..., description="Induced edges within requested hop boundary")
    graph_evidence: Dict[str, Any] = Field(..., description="Topological graph metrics and evidence items")


class LatestRunSummaryResponse(BaseModel):
    """Summary of most recent completed analysis run for /api/v1/run/latest."""
    run_id: str = Field(..., description="Run identifier")
    pipeline_version: str = Field(..., description="Active pipeline version")
    record_count: int = Field(..., description="Total records analyzed")
    alert_count: int = Field(..., description="Total alerts generated")
    risk_level_counts: Dict[str, int] = Field(..., description="Alert counts broken down by risk tier (CRITICAL, HIGH, MEDIUM, LOW)")
    graph_summary: Dict[str, Any] = Field(..., description="Graph snapshot topology summary")
    execution_timings: Dict[str, float] = Field(..., description="Stage durations in seconds")
    execution_metrics: Dict[str, Any] = Field(..., description="Throughput and resource usage metrics")
    warnings: List[str] = Field(default_factory=list, description="Warnings encountered during run")
    errors: List[str] = Field(default_factory=list, description="Errors encountered during run")
    dataset_metadata: Dict[str, Any] = Field(default_factory=dict, description="Dataset metadata")


def adapt_alert(a: Alert) -> AlertSummaryResponse:
    """Adapt a domain Alert dataclass into an AlertSummaryResponse Pydantic model."""
    return AlertSummaryResponse(
        alert_id=a.alert_id,
        transaction_id=a.transaction_id,
        rank=int(a.rank),
        risk_score=round(float(a.risk_score), 4),
        confidence_score=round(float(a.confidence_score), 4),
        risk_level=str(a.risk_level),
        priority_score=round(float(a.priority_score), 4),
        triggered_detectors=list(a.triggered_detectors),
        independent_signal_count=int(a.independent_signal_count),
        evidence_categories=list(a.evidence_categories),
        component_scores={k: round(float(v), 4) for k, v in a.component_scores.items()},
        scoring_version=str(a.scoring_version),
        evidence_items=list(a.evidence_items),
    )


def adapt_analysis_result(result: AnalysisResult) -> AnalysisResponse:
    """
    Adapt a domain AnalysisResult dataclass into a clean API response model.
    Excludes the large per_transaction_results dictionary to prevent payload bloat.
    """
    alerts_data: List[AlertSummaryResponse] = [adapt_alert(a) for a in result.ranked_alerts]

    return AnalysisResponse(
        run_id=result.run_id,
        pipeline_version=result.pipeline_version,
        record_count=int(result.record_count),
        rejected_record_count=len(result.rejected_records),
        dataset_metadata=dict(result.dataset_metadata),
        feature_schema_version=result.feature_schema_version,
        detector_versions=dict(result.detector_versions),
        graph_summary=dict(result.graph_summary),
        ranked_alerts=alerts_data,
        execution_timings={k: round(float(v), 6) for k, v in result.execution_timings.items()},
        execution_metrics=dict(result.execution_metrics),
        warnings=list(result.warnings),
        errors=list(result.errors),
    )
