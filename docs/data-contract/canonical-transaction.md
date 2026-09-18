# Canonical Transaction Format

All input formats (CSV, JSON, XML) are converted into this common transaction
structure before anything downstream touches the data. Engine, Graph, Dataset
and UI modules read this format rather than defining their own.

## Fields

| Field | Type | Rules |
| :--- | :--- | :--- |
| `event_id` | string | Required, unique per event |
| `txid` | string | Required, blockchain transaction ID |
| `timestamp` | datetime | Required, UTC |
| `src_ip` / `dst_ip` | string | Required |
| `src_port` / `dst_port` | int | Required, 0-65535 |
| `input_addresses` / `output_addresses` | string[] | Addresses involved |
| `input_amounts` / `output_amounts` | float[] | BTC amounts, >= 0.0 |
| `fee` | float | Required, >= 0.0 |
| `script_type` | string | Optional |
| `geo_country` | string | Optional |
| `asn` | string | Optional |
| `source_batch_id` | string | Required, set by the ingestion run |
| `ingest_time` | datetime | Set automatically at ingestion |

## Quarantine

A record that fails validation does not stop the batch. It is written to the
quarantine output for that run, with the raw row and the failure reason, so the
rest of the file still ingests.

## Graph types

The graph layer uses these node and edge types (see `src/contract/models.py`):

- Nodes: `TRANSACTION`, `ADDRESS`, `IP`, `ASN`, `COUNTRY`, `CANDIDATE_ENTITY`
- Edges: `sends_to`, `receives_from`, `shares_ip`, `belongs_to_asn`, `located_in`
