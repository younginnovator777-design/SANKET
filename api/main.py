from fastapi import FastAPI
from api.routes.analysis import router as analysis_router
from api.schemas import HealthResponse
from src.contract.models import Alert, GraphResponse
from src.pipeline import PIPELINE_VERSION

app = FastAPI(title="SANKET Core API", version="0.1.0")

app.include_router(analysis_router)


@app.get("/health", response_model=HealthResponse)
def health_check():
    return {
        "status": "healthy",
        "service": "SANKET",
        "pipeline_version": PIPELINE_VERSION,
    }

@app.get("/runs/{run_id}")
def get_run_status(run_id: str):
    return {"run_id": run_id, "status": "COMPLETED"}

@app.get("/alerts", response_model=list[Alert])
def get_alerts():
    return []

@app.get("/alerts/{lead_id}", response_model=Alert | None)
def get_alert_detail(lead_id: str):
    return None

@app.get("/transactions/{txid}")
def get_transaction_detail(txid: str):
    return {"txid": txid, "status": "not_implemented"}

@app.get("/graph/{node_id}", response_model=GraphResponse)
def get_graph(node_id: str, hops: int = 2):
    return GraphResponse(center_id=node_id, hops=hops, nodes=[], edges=[])

@app.get("/cases/{case_id}/evidence")
def get_case_evidence(case_id: str):
    return {"case_id": case_id, "evidence": []}
