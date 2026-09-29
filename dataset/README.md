# SANKET Synthetic Dataset Engineering Foundation

## Overview

The SANKET (System for Anomaly & Network Knowledge Extraction from Transactions) synthetic dataset generator simulates Bitcoin P2P network telemetry and transaction metadata for AI-powered monitoring and investigation.

> **CRITICAL DISCLAIMER**  
> **This dataset is synthetic and does not represent real seized, intercepted, or live Bitcoin traffic.**  
> All wallet addresses, transaction IDs, peer IPs, and scenario patterns are generated deterministically for research, benchmarking, and detection engineering under the SIH 26 problem statement (*"AI-Powered Monitoring & Analysis of Bitcoin Transaction Traffic"*).

---

## Canonical Data Contract

All generated transactions adhere strictly to the SANKET canonical transaction contract (`src/contract/models.py` / `schemas/canonical.sql`):

| Field | Type | Description |
| :--- | :--- | :--- |
| `event_id` | string | Unique deterministic event identifier (`evt_{seed}_{index}`) |
| `txid` | string | 64-character hex blockchain transaction ID |
| `timestamp` | string (ISO-8601 UTC) | Observation timestamp with `Z` suffix |
| `src_ip` | string | Source IPv4 address of observing peer/client |
| `dst_ip` | string | Destination Bitcoin peer IPv4 address |
| `src_port` | int | Client ephemeral source port (1024–65535) |
| `dst_port` | int | Bitcoin P2P daemon destination port (8333, 18333, 8332) |
| `input_addresses` | string[] | List of input addresses (pipe-separated in CSV/XML) |
| `output_addresses` | string[] | List of output addresses (pipe-separated in CSV/XML) |
| `input_amounts` | float[] | BTC input amounts (pipe-separated in CSV/XML, satoshi precision) |
| `output_amounts` | float[] | BTC output amounts (pipe-separated in CSV/XML, satoshi precision) |
| `fee` | float | Miner transaction fee in BTC (`>= 0.0`) |
| `script_type` | string | Bitcoin script vocabulary: `p2wpkh`, `p2pkh`, `p2sh`, `p2wsh`, `unknown` |
| `geo_country` | string | ISO-3166 2-letter country code matching ASN topology |
| `asn` | string | Autonomous system number (e.g. `AS15169`, `AS24940`) |

Mathematical invariant:
$$\sum \text{input\_amounts} = \sum \text{output\_amounts} + \text{fee}$$
Computed using integer satoshis to prevent floating-point rounding anomalies.

---

## Benign Populations (~85%)

Legitimate transaction volume comprises diverse real-world behaviors and critical confounders to prevent naive detectors from associating high volume or complex multi-output shapes with anomalies:

1. **Ordinary Users (`ordinary_user`)**: Everyday peer-to-peer transfers with 1–2 inputs and 1–2 outputs (payment + change). Small to medium amounts (0.0005 to 0.35 BTC).
2. **Merchant Payments (`merchant_payment`)**: Retail checkouts paying dedicated merchant deposit addresses with change returned to the consumer.
3. **Merchant Sweeps (`merchant_consolidation`)**: *Confounder for Fan-In*. Merchants periodically consolidate multiple small customer UTXOs into a single cold/hot settlement wallet.
4. **Exchange Batch Payouts (`exchange_batch`)**: *Confounder for Fan-Out*. Centralized exchanges batch-process multiple withdrawal requests into 8–25 outputs within a single transaction to conserve block space.
5. **Mining Pool Distributions (`mining_pool`)**: Mining pool reward distributions sending block subsidies and transaction fees to 6–18 constituent pool miners.
6. **Automated Services (`service_recurring`)**: Scheduled automated payments operating on fixed intervals from consistent service infrastructure.
7. **High-Volume Payment Processors (`high_volume_processor`)**: *Confounder for Network Cluster*. High transaction frequency from shared cloud infrastructure (AWS, Google, Hetzner, etc.).

---

## Investigative Scenarios (~15%)

Six distinct investigative scenario patterns are deterministically interleaved:

### 1. Fan-In (`fan_in`)
- **Structure**: Many disparate addresses (8 to 28 inputs) funneling funds into a single or small set of common destination addresses.
- **Characteristics**: Fragmented inputs from anomalous actors or unlinked addresses, short inter-arrival times, balance consolidation.

### 2. Fan-Out / Structuring-Like (`fan_out`)
- **Structure**: A source entity repeatedly disperses value across many outputs (10 to 30 outputs).
- **Characteristics**: Uniform or near-uniform amounts structured just below standard reporting thresholds (e.g., ~0.095 BTC or ~0.048 BTC chunks).

### 3. Peeling Chain (`peeling_like`)
- **Structure**: A high-value starting balance repeatedly peels off small outputs while forwarding the bulk change output to a new address that acts as the input for the next hop:
  $$TX_1 \to TX_2 \to TX_3 \to \dots \to TX_k$$
- **Characteristics**: Parent links tracked via `parent_txid`. Change outputs strictly link to the subsequent transaction's input.

### 4. Mixing-Like (`mixing_like`)
- **Structure**: Multi-input, multi-output transactions (4 to 8 participants) with multiple equal-denomination outputs (e.g., exactly 0.10000000 BTC, 0.25000000 BTC, or 0.50000000 BTC) plus optional change outputs.
- **Characteristics**: Structural and temporal resemblance to CoinJoin / Wasabi / Whirlpool mixes.

### 5. Rapid Hop (`rapid_hop`)
- **Structure**: Rapid value forwarding through a sequence of intermediate addresses:
  $$\text{Addr}_A \xrightarrow{TX_1} \text{Addr}_B \xrightarrow{TX_2} \text{Addr}_C \xrightarrow{TX_3} \text{Addr}_D$$
- **Characteristics**: Extremely short inter-arrival times (5 to 45 seconds). Near-complete balance transferred at each hop minus small miner fees.

### 6. Network Cluster (`network_cluster`)
- **Structure**: Multiple transactions involving completely distinct and unlinked Bitcoin addresses observed from the identical network vantage point.
- **Characteristics**: Identical `src_ip`, `asn`, and `geo_country`, correlated ephemeral port ranges, and identical destination peer listener node. Observational correlation without assuming on-chain address reuse.

---

## Ground-Truth Labels (`labels.csv`)

Ground-truth metadata is strictly isolated from raw transaction files:
- **Location**: `data/generated/labels.csv`
- **Fields**:
  - `txid`: Matching the transaction record.
  - `scenario`: `benign`, `fan_in`, `fan_out`, `peeling_like`, `mixing_like`, `rapid_hop`, or `network_cluster`.
  - `entity_id`: Internal entity identifier (e.g. `E_USR_0042`, `E_ANO_0012`, `E_EXC_0003`).
  - `scenario_instance_id`: Unique identifier for the scenario instance / chain.
  - `is_benign`: Boolean flag (`True` or `False`).
  - `parent_txid`: Parent transaction ID for linked chains (peeling, rapid hop).

> **IMPORTANT**: The future ML pipeline and detection engine **must never** consume `labels.csv` during inference or feature extraction. Labels exist exclusively for offline evaluation, benchmark metrics, and false-positive analysis.

---

## Usage

### Generation Commands

```bash
# 1,000 records for fast development (CSV format)
python -m dataset.generate --rows 1000 --seed 42 --format csv

# 10,000 records for testing
python -m dataset.generate --rows 10000 --seed 42 --format csv

# 100,000 records primary benchmark target (CSV format)
python -m dataset.generate --rows 100000 --seed 42 --format csv

# Generate all 3 formats simultaneously (CSV, JSON, XML)
python -m dataset.generate --rows 100000 --seed 42 --format all
```

### CLI Options

- `--rows`: Number of records to generate (default: `100000`).
- `--seed`: Integer random seed for 100% deterministic reproduction across OS platforms (default: `42`).
- `--format`: Output format: `csv`, `json`, `xml`, or `all` (default: `csv`).
- `--output-dir`: Destination folder (default: `data/generated`).
- `--filename`: Base filename prefix (default: `transactions`).
- `--start-time`: Simulation start UTC timestamp in ISO-8601 (default: `2026-09-01T00:00:00Z`).

---

## Ingesting Generated Data

Generated data can be ingested directly using the existing Bit-Shield pipeline:

```bash
python scripts/ingest.py data/generated/transactions.csv --batch-id batch_sanket_100k
```

Or via Python:
```python
from src.pipeline.ingestion_pipeline import run_ingestion_pipeline

manifest = run_ingestion_pipeline(
    file_path="data/generated/transactions.csv",
    batch_id="batch_sanket_100k",
    source_type="csv"
)
```

Outputs are automatically converted to Parquet (`data/canonical/`), validated against `CanonicalTransaction`, queryable via DuckDB, and recorded in SQLite run manifests.

---

## Known Limitations

1. **Synthetic Network Metadata**: IP addresses, ASNs, and countries are deterministically generated from curated public pools rather than live Bitcoin network peer discovery. External MaxMind / GeoIP database integration will be layered in subsequent phases.
2. **Simplified Script Engine**: Script types are assigned categorically (`p2wpkh`, `p2pkh`, `p2sh`, etc.) rather than executing serialized Bitcoin Script opcodes or SegWit witness programs.
3. **Mempool Abstraction**: Transactions are generated in a continuous observation stream with diurnal and burst timing rather than discrete 10-minute block mining cycles.
