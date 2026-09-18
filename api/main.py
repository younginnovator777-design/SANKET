from fastapi import FastAPI
from src.contract.models import Alert

app = FastAPI(title="BIT-SHIELD Core API", version="0.1.0")

@app.get("/health")
def health_check():
    return {"status": "ok", "service": "BIT-SHIELD Data Plane"}

@app.get("/runs/{run_id}")
def get_run_status(run_id: str):
    # Skeleton route for UI to track ingestion jobs
    return {"run_id": run_id, "status": "COMPLETED"}

@app.get("/alerts", response_model=list[Alert])
def get_alerts():
    # Skeleton route for the Investigator Console
    return []
