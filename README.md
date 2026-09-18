# BIT-SHIELD

Bitcoin transaction telemetry ingestion and analysis. This repo currently holds
the data foundation: ingestion, storage and the shared data format that the
detection, graph and dataset modules build on.

## What works now

- CSV, JSON and XML ingestion into one common transaction format
- Validation with quarantine routing for malformed records
- Parquet output for analytical queries, read via DuckDB
- SQLite run metadata (per-batch counts and status)
- CLI ingestion entrypoint
- FastAPI app with the route shapes stubbed out

## To be built next

Detection engine, graph construction, synthetic dataset, evaluation and UI.
Those live in `src/engine/`, `src/graph/`, `dataset/` and `evaluation/`.

## Setup

    python3 -m venv .venv
    source .venv/bin/activate
    pip install -e .
    pytest -q

## Run an ingestion

    python scripts/ingest.py data/sample/sample.csv --batch-id batch_demo_001

Output lands in `data/canonical/` (Parquet) and `data/quarantine/` (JSON).

## Run the API

    uvicorn api.main:app --reload

Most endpoints return placeholder data until the corresponding module is built.

## Layout

    src/contract/   shared data models
    src/ingest/     csv / json / xml parsers
    src/storage/    parquet, duckdb, sqlite
    src/pipeline/   ingestion orchestration
    src/engine/     detection (features, detectors, models, scoring, explain)
    src/graph/      graph construction
    dataset/        synthetic data generation
    evaluation/     evaluation scripts
    api/            FastAPI app

