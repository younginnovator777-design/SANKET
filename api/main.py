from fastapi import FastAPI
from src.contract.models import Alert, GraphResponse

app = FastAPI(title="BIT-SHIELD Core API", version="0.1.0")

@app.get("/health")
def health_check():
    return {"status": "ok", "service": "BIT-SHIELD Data Plane"}

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
