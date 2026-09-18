# BIT-SHIELD (Phase 0 Foundation)

**Architecture: Data Plane**
- Strict Canonical Contracts (`src/contract/models.py`)
- CSV and XML incremental (streaming) ingestion; JSON batch ingestion
- Durable Parquet Analytical Storage & DuckDB
- SQLite Run Metadata
- Active Quarantine Routing for Malformed Telemetry

**Setup & Testing**
```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -e .
pytest
```
