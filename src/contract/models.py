from datetime import datetime, timezone
from typing import List, Literal, Optional
from pydantic import BaseModel, Field, field_validator


class CanonicalTransaction(BaseModel):
    event_id: str = Field(..., description="Unique event identifier")
    txid: str = Field(..., description="Blockchain transaction ID")
    timestamp: datetime = Field(..., description="Transaction observation UTC timestamp")
    src_ip: str = Field(..., description="Source IP address")
    dst_ip: str = Field(..., description="Destination IP address")
    src_port: int = Field(..., ge=0, le=65535, description="Source port (0-65535)")
    dst_port: int = Field(..., ge=0, le=65535, description="Destination port (0-65535)")
    input_addresses: List[str] = Field(default_factory=list, description="List of input addresses")
    output_addresses: List[str] = Field(default_factory=list, description="List of output addresses")
    input_amounts: List[float] = Field(default_factory=list, description="List of input amounts in BTC")
    output_amounts: List[float] = Field(default_factory=list, description="List of output amounts in BTC")
    fee: float = Field(..., ge=0.0, description="Transaction fee in BTC")
    script_type: Optional[str] = None
    geo_country: Optional[str] = None
    asn: Optional[str] = None
    source_batch_id: str = Field(..., description="Batch identifier")
    ingest_time: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

    @field_validator('input_amounts', 'output_amounts')
    @classmethod
    def validate_amounts_non_negative(cls, v: List[float]) -> List[float]:
        if any(amount < 0 for amount in v):
            raise ValueError("Amounts must be non-negative")
        return v


class QuarantineRecord(BaseModel):
    batch_id: str
    raw_data: str
    error_reason: str
    timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class RunManifest(BaseModel):
    run_id: str
    source: str
    started_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    completed_at: Optional[datetime] = None
    records_received: int = Field(default=0, ge=0)
    records_accepted: int = Field(default=0, ge=0)
    records_quarantined: int = Field(default=0, ge=0)
    status: str = Field(default="RUNNING")


class AddressEdge(BaseModel):
    txid: str
    address: str
    direction: str  # 'INPUT' or 'OUTPUT'
    amount: float = Field(..., ge=0.0)


class NetworkObservation(BaseModel):
    event_id: str
    txid: str
    src_ip: str
    dst_ip: str
    src_port: int = Field(..., ge=0, le=65535)
    dst_port: int = Field(..., ge=0, le=65535)
    timestamp: datetime
    geo_country: Optional[str] = None
    asn: Optional[str] = None


class DetectorEvidence(BaseModel):
    txid: str
    detector_id: str
    score: float = Field(..., ge=0.0, le=1.0)
    reason_codes: List[str]
    evidence_refs: dict


class Alert(BaseModel):
    lead_id: str
    txid: str
    risk_score: float = Field(..., ge=0.0, le=1.0)
    confidence_score: float = Field(..., ge=0.0, le=1.0)
    priority: str
    model_version: str


class Case(BaseModel):
    case_id: str
    alert_id: str
    status: str
    notes: Optional[str] = None


class GraphNode(BaseModel):
    id: str = Field(..., description="Unique node identifier (address, ip, txid, entity id)")
    type: Literal["TRANSACTION", "ADDRESS", "IP", "ASN", "COUNTRY", "CANDIDATE_ENTITY"]
    label: Optional[str] = None
    risk_score: Optional[float] = Field(default=None, ge=0.0, le=1.0)


class GraphEdge(BaseModel):
    source: str = Field(..., description="Source node id")
    target: str = Field(..., description="Target node id")
    type: Literal["sends_to", "receives_from", "shares_ip", "belongs_to_asn", "located_in"]
    weight: Optional[float] = None
    txid: Optional[str] = Field(default=None, description="Originating transaction, if applicable")


class GraphResponse(BaseModel):
    center_id: str = Field(..., description="Node the graph is centered on")
    hops: int = Field(..., ge=1, description="Number of hops materialized in this response")
    nodes: List[GraphNode] = Field(default_factory=list)
    edges: List[GraphEdge] = Field(default_factory=list)
