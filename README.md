# SANKET

### System for Anomaly & Network Knowledge Extraction from Transactions

---

## 1. Problem Statement

Law enforcement agencies, financial intelligence units (FIUs), and forensic investigators face increasing volumes of pseudonymous Bitcoin transactions obfuscated through complex laundering typologies such as rapid multi-hop layering, asymmetric peeling chains, fan-out disbursements, and synchronized network broadcasting. Conventional forensic methods rely heavily on manual ledger lookups or external third-party cloud explorers that breach operational air-gap security and risk leaking sensitive query intelligence. Furthermore, existing tools rarely correlate on-chain value flows with network-level telemetry (IP addresses, ASNs, geographic routing) or provide mathematically rigorous, explainable confidence intervals alongside risk alerts.

---

## 2. Solution Overview

**SANKET** is an air-gapped, offline intelligence platform and forensic analysis pipeline engineered for Bitcoin transaction networks. It ingests transaction and network telemetry datasets, canonicalizes diverse schemas, extracts multi-dimensional feature representations, and executes an 8-stage deterministic analysis pipeline. By fusing rule-based heuristic detectors with unsupervised machine learning (Isolation Forest) and multi-hop graph topology extraction, SANKET generates prioritized, explainable investigative leads. Every alert is accompanied by specific evidence items, cross-category agreement scores, and risk classifications—allowing analysts to investigate prioritized targets immediately through an interactive forensic relationship dashboard without internet connectivity.

---

## 3. Key Capabilities

- **Canonical CSV Ingestion**: Validates and normalizes transaction streams, input/output structures, fee rates, timestamps, and network attributes (IPs, ASNs, GeoIP countries) into memory buffers.
- **Multi-Dimensional Feature Engineering**: Computes transaction-level statistics, temporal velocity metrics, network concentration indices (Herfindahl-Hirschman Index), and topological graph properties.
- **Deterministic Anomaly Detection**: Employs specialized rule engines targeting classic laundering behaviors:
  - *Rapid Hop*: Dense temporal chaining within narrow observation windows.
  - *Peeling Chains*: Asymmetric transfer patterns separating small peels from primary tranches.
  - *Fan-Out & Fan-In*: High-ratio value dispersal and aggregation structuring.
  - *Mixing Heuristics*: Equal-value split outputs and script uniformity.
  - *Network Clustering*: Colocated network broadcasts, shared ASNs, and geographic correlation.
- **Unsupervised Machine Learning**: Integrates an *Isolation Forest* model trained to identify multi-variate statistical outliers without requiring prior labelled training data.
- **Graph & Candidate Entity Analysis**: Constructs bipartite transaction-address topological subgraphs, calculates component density and incident degree, and groups co-spending addresses into candidate entities.
- **Evidence Fusion**: Correlates independent signal categories (Structural, Temporal, Network, Multivariate) and checks cross-category agreement.
- **Risk & Confidence Scoring**: Calculates composite risk scores ($M, T, N, G$ components) combined with an evidence-backed confidence interval ($D, E, S, G_s, X$).
- **Ranked Investigative Alerts**: Produces deterministic, priority-ranked lead dossiers containing actionable evidentiary audit trails.
- **Strictly Offline & Air-Gapped**: Runs entirely locally in system memory with zero external telemetry, zero database services, and zero third-party API dependencies.

---

## 4. Pipeline Architecture

SANKET processes transaction datasets through an 8-stage deterministic pipeline (`sanket-pipeline-v1`):

```
┌─────────────────┐      ┌─────────────────┐      ┌─────────────────────────┐
│   01. INGEST    │ ───> │ 02. CANONICAL   │ ───> │ 03. FEATURE EXTRACTION  │
│  CSV Ingestion  │      │ Schema Validate │      │  32-Dim Feature Vectors │
└─────────────────┘      └─────────────────┘      └─────────────────────────┘
                                                               │
                                                               v
┌─────────────────┐      ┌─────────────────┐      ┌─────────────────────────┐
│   06. SCORING   │ <─── │ 05. CORRELATION │ <─── │      04. DETECTION      │
│ Risk/Confidence │      │ Sliding Windows │      │ Rule Engines + I-Forest │
└─────────────────┘      └─────────────────┘      └─────────────────────────┘
        │
        v
┌─────────────────┐      ┌─────────────────┐
│ 07. GRAPH BUILD │ ───> │ 08. LEAD DOSSIER│
│ 2-Hop Topology  │      │ Ranked Alerts   │
└─────────────────┘      └─────────────────┘
```

1. **Ingest**: Streams raw CSV files into an airgapped memory buffer.
2. **Canonicalize**: Parses and verifies required transaction fields (`txid`, `timestamp`, `src_ip`, `dst_ip`, `input_addresses`, `output_addresses`, `amounts`, `fee`, `asn`, etc.).
3. **Feature Extraction**: Generates structural, temporal, network, and graph features per transaction.
4. **Detection**: Concurrently evaluates transactions against rule-based typology engines and the unsupervised Isolation Forest model.
5. **Correlation**: Links multi-source temporal bursts and network associations across sliding time windows.
6. **Risk Scoring**: Fuses component scores into a calibrated composite risk index ($[0.0, 1.0]$) and computes signal confidence.
7. **Graph Build**: Populates transaction-address adjacency matrices, 2-hop topological neighborhoods, and candidate entity clusters.
8. **Investigative Leads**: Sorts alerts by priority score, assembling human-readable evidence summaries and counterparty relationships.

---

## 5. Technology Stack

### Backend
- **Language**: Python 3.11+
- **API Framework**: FastAPI & Starlette
- **ASGI Server**: Uvicorn
- **Data Processing**: DuckDB, Polars, PyArrow, NumPy
- **Machine Learning**: Scikit-Learn (Isolation Forest)
- **Validation**: Pydantic v2
- **Testing**: Pytest (236 tests, 100% pass)

### Frontend
- **Framework**: Next.js 16 (App Router with Turbopack)
- **Library**: React 19
- **Language**: TypeScript
- **Styling**: Tailwind CSS v4 (vanilla design system with HSL tokens)
- **Icons**: Lucide React
- **Animations**: Framer Motion

### Containerization
- **Runtime**: Docker & Docker Compose (offline Linux deployment)

---

## 6. Dataset Generation & Evaluation

SANKET includes a self-contained synthetic dataset generator (`dataset/generator/`) capable of producing canonical datasets for development, testing, and benchmarking:

- **Scenario Generators**: Benign transactional baseline traffic combined with labeled anomalous topologies (peeling chains, fan-out disbursements, fan-in pooling, rapid multi-hop chains, mixing patterns, and network clusters).
- **Format Support**: Multi-format emission (`.csv`, `.json`, `.xml`).
- **Evaluation Suite**: Automated benchmark loader in `evaluation/` measuring detector precision, recall, execution timings, and anomaly separation without requiring external datasets.

---

## 7. API Specification

All backend endpoints are served under `/api/v1` (with system health check at `/health`):

| Method | Endpoint | Description |
|:-------|:---------|:------------|
| `GET` | `/health` | Service health status, system uptime, and pipeline version |
| `POST` | `/api/v1/analyze` | Upload CSV dataset, execute complete 8-stage pipeline, return ranked leads |
| `GET` | `/api/v1/alerts` | Retrieve ranked alerts (supports `min_risk_level` filter: `CRITICAL`, `HIGH+`, `MEDIUM+`) |
| `GET` | `/api/v1/alerts/{alert_id}` | Detailed investigation dossier with detector breakdowns and evidence items |
| `GET` | `/api/v1/transactions/{txid}` | Canonical attributes, extracted features, and individual detector outputs |
| `GET` | `/api/v1/graph/{txid}` | 2-hop relationship subgraph (nodes, directed edges, attributes, evidence) |
| `GET` | `/api/v1/run/latest` | Active run execution metrics, detector timings, and dataset metadata |

---

## 8. Frontend Navigation & Workspace

The Next.js user interface provides an offline investigative workstation:

- **`/overview`**: High-level command dashboard displaying dataset status, risk distribution metrics, and critical lead summaries.
- **`/analyze`**: Dataset ingestion console featuring drag-and-drop CSV upload, sample loading, real-time stage execution indicators, and immediate lead results.
- **`/alerts`**: Priority-ranked lead table with risk filtering (`CRITICAL`, `HIGH+`, `MEDIUM+`), search, and side-drawer deep inspection.
- **`/transactions`**: Granular transaction ledger inspector detailing inputs, outputs, fee rates, script types, and network telemetry.
- **`/graph`**: Interactive SVG forensic topology canvas displaying directed transactions, counterparties, candidate entities, IPs, and ASNs with 2-hop neighborhood exploration.
- **`/entities`**: Candidate entity groupings identified through common-input and temporal associations.
- **`/runs` & `/run-history`**: Pipeline execution metrics, sub-second stage timings, and dataset validation logs.
- **`/settings`**: Live health check diagnostics and air-gapped environment verification.

---

## 9. Docker Deployment

SANKET is containerized for zero-dependency offline Linux deployment:

### Prerequisites
- Docker Engine 24+ & Docker Compose v2+

### Run with Docker Compose
```bash
# Build both services and launch in detached mode
docker compose build
docker compose up -d

# Verify running containers
docker compose ps
```

- **Frontend Application**: `http://localhost:3000`
- **Backend Core API**: `http://localhost:8000`
- **API Documentation**: `http://localhost:8000/docs`

### Stop Deployment
```bash
docker compose down
```

---

## 10. Local Development Setup

### Backend Setup (Python 3.11+)

```bash
# 1. Create and activate a virtual environment
python -m venv .venv
# Windows:
.\.venv\Scripts\activate
# Linux/macOS:
source .venv/bin/activate

# 2. Install dependencies
pip install --upgrade pip
pip install -e . python-multipart

# 3. Start the FastAPI backend
uvicorn api.main:app --host 127.0.0.1 --port 8000 --reload
```

Backend will be available at `http://127.0.0.1:8000`.

### Frontend Setup (Node.js 20+)

```bash
# 1. Install Node dependencies
npm install

# 2. Run the development server
npm run dev
```

Frontend will be available at `http://localhost:3000`.

---

## 11. Testing & Verification

The SANKET test suite validates data ingestion, detector accuracy, feature computation, scoring mathematics, graph traversals, and API endpoints:

```bash
# Run complete Python backend test suite
pytest
```

**Current Backend Status**:
```text
============================= 236 passed in 35.29s =============================
```
- Total tests: **236 passed**
- Failures: **0**
- Test coverage: `test_api.py`, `test_dataset_generator.py`, `test_detector_fixes.py`, `test_detectors.py`, `test_evaluation.py`, `test_features.py`, `test_graph.py`, `test_orchestrator.py`, `test_pipeline.py`, `test_scoring.py`.

```bash
# Verify Frontend TypeScript & Linting
npx tsc --noEmit
npm run lint

# Verify Next.js Production Build
npm run build
```
- TypeScript check: **0 errors**
- Next.js build: **All 14 static routes compiled and prerendered successfully**

---

## 12. Project Structure

```text
Bit-Shield_2.0/
├── api/                        # FastAPI route handlers, schemas, and in-memory state
│   ├── routes/
│   │   └── analysis.py         # /analyze, /alerts, /transactions, /graph endpoints
│   ├── main.py                 # FastAPI application factory & CORS setup
│   ├── schemas.py              # Pydantic request/response contracts
│   └── state.py                # In-memory active analysis state manager
├── dataset/                    # Synthetic transaction generator & scenario modules
│   ├── generator/              # Core dataset generator engine & writers
│   └── scenarios/              # Peeling, fan-out, fan-in, rapid-hop, mixing scenarios
├── evaluation/                 # Detection benchmark evaluation & metric scripts
├── public/                     # Static assets & sample transaction CSV
├── src/                        # SANKET Core Forensic Engine
│   ├── app/                    # Next.js App Router pages (overview, analyze, alerts, etc.)
│   ├── components/             # Reusable UI component library, shells, and containers
│   ├── contract/               # Internal data models and schemas
│   ├── detectors/              # Anomaly detection engines (structural, temporal, network, ML)
│   ├── features/               # Feature extraction extractors (transaction, network, graph)
│   ├── graph/                  # Bipartite graph builder & query engine
│   ├── ingest/                 # CSV, JSON, and XML parsers
│   ├── lib/                    # Typed API client & frontend graph adapters
│   ├── pipeline/               # Deterministic 8-stage orchestrator
│   ├── scoring/                # Evidence fusion & risk/confidence scorers
│   └── types/                  # TypeScript interface definitions
├── tests/                      # Automated test suite (236 pytest unit/integration tests)
├── Dockerfile.backend          # Containerfile for FastAPI backend
├── Dockerfile.frontend         # Multi-stage Containerfile for Next.js frontend
├── docker-compose.yml          # Offline two-service Docker orchestration
├── .dockerignore               # Docker build ignore rules
├── package.json                # Frontend package configuration
├── pyproject.toml              # Python project configuration & dependencies
└── README.md                   # SANKET documentation
```

---

## 13. Limitations & Prototype Notes

- **Air-Gapped In-Memory Scope**: SANKET is intentionally designed to operate offline in memory on batch-uploaded datasets. It does not establish live P2P Bitcoin network daemon socket connections or make outbound queries to third-party blockchain explorers.
- **Direct UI Ingestion**: The web workspace ingestion interface is optimized for canonical CSV format datasets. Multi-format support (JSON, XML) is accessible via the dataset generator and backend ingestion pipeline modules.
- **Single Active Session State**: Active run analysis results are held in-process within backend state for rapid exploration and reset across application restarts.
- **Heuristic Grouping**: Candidate entity clustering relies on common-input spending heuristics and network colocation; it represents high-probability groupings rather than absolute cryptographic proof of identity.

---

## 14. License

This project is submitted for the Smart India Hackathon (SIH) under the [MIT License](LICENSE).
