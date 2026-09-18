-- BIT-SHIELD canonical schema
-- Reference SQL schema for the persistent transaction and run-state tables.
-- Kept in sync with src/contract/models.py by hand; lists and dicts are stored
-- as JSON-encoded TEXT here.

CREATE TABLE IF NOT EXISTS canonical_transaction (
    event_id            TEXT PRIMARY KEY,
    txid                TEXT NOT NULL,
    timestamp            TIMESTAMP NOT NULL,
    src_ip               TEXT NOT NULL,
    dst_ip               TEXT NOT NULL,
    src_port             INTEGER NOT NULL CHECK (src_port BETWEEN 0 AND 65535),
    dst_port             INTEGER NOT NULL CHECK (dst_port BETWEEN 0 AND 65535),
    input_addresses      TEXT,   -- JSON-encoded list[str]
    output_addresses     TEXT,   -- JSON-encoded list[str]
    input_amounts        TEXT,   -- JSON-encoded list[float], BTC
    output_amounts        TEXT,   -- JSON-encoded list[float], BTC
    fee                  DOUBLE NOT NULL CHECK (fee >= 0.0),
    script_type           TEXT,
    geo_country           TEXT,
    asn                   TEXT,
    source_batch_id       TEXT NOT NULL,
    ingest_time            TIMESTAMP NOT NULL
);

CREATE TABLE IF NOT EXISTS quarantine_record (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    batch_id       TEXT NOT NULL,
    raw_data       TEXT NOT NULL,
    error_reason   TEXT NOT NULL,
    timestamp      TIMESTAMP NOT NULL
);

CREATE TABLE IF NOT EXISTS run_manifests (
    run_id                TEXT PRIMARY KEY,
    source                TEXT NOT NULL,
    started_at             TIMESTAMP NOT NULL,
    completed_at            TIMESTAMP,
    records_received       INTEGER NOT NULL DEFAULT 0 CHECK (records_received >= 0),
    records_accepted       INTEGER NOT NULL DEFAULT 0 CHECK (records_accepted >= 0),
    records_quarantined     INTEGER NOT NULL DEFAULT 0 CHECK (records_quarantined >= 0),
    status                 TEXT NOT NULL DEFAULT 'RUNNING'
);

CREATE TABLE IF NOT EXISTS address_edge (
    txid       TEXT NOT NULL,
    address    TEXT NOT NULL,
    direction  TEXT NOT NULL CHECK (direction IN ('INPUT', 'OUTPUT')),
    amount     DOUBLE NOT NULL CHECK (amount >= 0.0)
);

CREATE TABLE IF NOT EXISTS network_observation (
    event_id     TEXT PRIMARY KEY,
    txid         TEXT NOT NULL,
    src_ip       TEXT NOT NULL,
    dst_ip       TEXT NOT NULL,
    src_port     INTEGER NOT NULL CHECK (src_port BETWEEN 0 AND 65535),
    dst_port     INTEGER NOT NULL CHECK (dst_port BETWEEN 0 AND 65535),
    timestamp    TIMESTAMP NOT NULL,
    geo_country  TEXT,
    asn          TEXT
);

CREATE TABLE IF NOT EXISTS detector_evidence (
    txid          TEXT NOT NULL,
    detector_id   TEXT NOT NULL,
    score         DOUBLE NOT NULL CHECK (score BETWEEN 0.0 AND 1.0),
    reason_codes  TEXT,   -- JSON-encoded list[str]
    evidence_refs TEXT    -- JSON-encoded dict
);

CREATE TABLE IF NOT EXISTS alert (
    lead_id           TEXT PRIMARY KEY,
    txid              TEXT NOT NULL,
    risk_score        DOUBLE NOT NULL CHECK (risk_score BETWEEN 0.0 AND 1.0),
    confidence_score  DOUBLE NOT NULL CHECK (confidence_score BETWEEN 0.0 AND 1.0),
    priority          TEXT NOT NULL,
    model_version     TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS case_record (
    case_id   TEXT PRIMARY KEY,
    alert_id  TEXT NOT NULL,
    status    TEXT NOT NULL,
    notes     TEXT
);
