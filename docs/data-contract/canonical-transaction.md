# Canonical Transaction Contract

This is the permanent data contract for the BIT-SHIELD data plane. All ingestion parsers (CSV, JSON, XML) normalize incoming raw data into this exact schema. 

Downstream modules (Engine, Graph, Dataset, UI) MUST consume this contract and MUST NOT redefine it.

## Schema Definition
| Field | Type | Validation Rules |
| :--- | :--- | :--- |
| `event_id` | string | Required, unique event identifier |
| `txid` | string | Required, blockchain transaction ID |
| `timestamp` | datetime | Required, converted to UTC |
| `src_ip` / `dst_ip` | string | Required |
| `src_port` / `dst_port` | int | Required, 0 - 65535 |
| `input_addresses` / `output_addresses` | string[] | Array of addresses |
| `input_amounts` / `output_amounts` | float[] | Array of BTC amounts, MUST be >= 0.0 |
| `fee` | float | Required, MUST be >= 0.0 |
| `script_type` | string | Optional |
| `geo_country` | string | Optional, ISO-like |
| `asn` | string | Optional |

## Quarantine Behavior
Any record failing these validation constraints will NOT crash the batch. It will be routed to the `QuarantineRecord` table with the raw data and failure reason attached for investigator review.
