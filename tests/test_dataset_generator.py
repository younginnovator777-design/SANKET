"""
Comprehensive test suite for SANKET synthetic dataset generation.
Verifies determinism, invariant compliance, scenario representations,
isolation of labels, and cross-format ingestion pipeline compatibility.
"""
import csv
from datetime import datetime, timezone
import json
import os
import pytest
from lxml import etree

from dataset.generator.config import GeneratorConfig
from dataset.generator.core import (
    GeneratedTransaction,
    TransactionLabel,
    sats_to_btc,
    btc_to_sats,
)
from dataset.generator.writer import (
    write_csv,
    write_json,
    write_xml,
    write_labels,
    format_btc,
)
from dataset.generate import generate_dataset, run_generation
from src.pipeline.ingestion_pipeline import run_ingestion_pipeline
from src.storage.duckdb_client import query_canonical_duckdb


def test_determinism_same_seed():
    """Generating with the exact same seed and config must yield identical outputs."""
    cfg1 = GeneratorConfig(num_rows=300, seed=123)
    cfg2 = GeneratorConfig(num_rows=300, seed=123)

    txs1, lbls1 = generate_dataset(cfg1)
    txs2, lbls2 = generate_dataset(cfg2)

    assert len(txs1) == 300
    assert len(txs2) == 300

    for t1, t2 in zip(txs1, txs2):
        assert t1.txid == t2.txid
        assert t1.event_id == t2.event_id
        assert t1.timestamp == t2.timestamp
        assert t1.src_ip == t2.src_ip
        assert t1.dst_ip == t2.dst_ip
        assert t1.src_port == t2.src_port
        assert t1.dst_port == t2.dst_port
        assert t1.input_addresses == t2.input_addresses
        assert t1.output_addresses == t2.output_addresses
        assert t1.input_amounts == t2.input_amounts
        assert t1.output_amounts == t2.output_amounts
        assert t1.fee == t2.fee
        assert t1.script_type == t2.script_type
        assert t1.geo_country == t2.geo_country
        assert t1.asn == t2.asn

    for l1, l2 in zip(lbls1, lbls2):
        assert l1.txid == t1_txid if (t1_txid := l2.txid) else True
        assert l1.scenario == l2.scenario
        assert l1.entity_id == l2.entity_id
        assert l1.is_benign == l2.is_benign
        assert l1.parent_txid == l2.parent_txid


def test_different_output_with_different_seed():
    """Generating with different seeds must produce different transaction sequences."""
    cfg1 = GeneratorConfig(num_rows=100, seed=42)
    cfg2 = GeneratorConfig(num_rows=100, seed=99)

    txs1, _ = generate_dataset(cfg1)
    txs2, _ = generate_dataset(cfg2)

    txids1 = [t.txid for t in txs1]
    txids2 = [t.txid for t in txs2]

    assert txids1 != txids2
    # Probability of collision between two independent random sha256 txid lists is 0
    assert set(txids1).isdisjoint(set(txids2))


@pytest.mark.parametrize("requested_rows", [50, 250, 1000])
def test_exact_requested_row_count(requested_rows):
    """The generator must strictly produce the exact requested row count."""
    cfg = GeneratorConfig(num_rows=requested_rows, seed=77)
    txs, lbls = generate_dataset(cfg)
    assert len(txs) == requested_rows
    assert len(lbls) == requested_rows


def test_unique_txids():
    """Every generated transaction ID must be strictly unique within the dataset."""
    cfg = GeneratorConfig(num_rows=1500, seed=42)
    txs, _ = generate_dataset(cfg)
    txids = [t.txid for t in txs]
    assert len(txids) == len(set(txids))
    assert all(len(txid) == 64 for txid in txids)  # standard sha256 length


def test_valid_timestamps_and_chronology():
    """Timestamps must be valid ISO-8601 UTC strings and advance chronologically."""
    cfg = GeneratorConfig(num_rows=500, seed=42)
    txs, _ = generate_dataset(cfg)

    parsed_dts = []
    for tx in txs:
        assert tx.timestamp.endswith("Z")
        dt = datetime.fromisoformat(tx.timestamp.replace("Z", "+00:00"))
        assert dt.tzinfo is not None
        parsed_dts.append(dt)

    # Invariant: Each transaction observation time should be greater than or equal to previous
    for i in range(1, len(parsed_dts)):
        assert parsed_dts[i] >= parsed_dts[i - 1], (
            f"Timestamp went backwards at index {i}: {parsed_dts[i-1]} -> {parsed_dts[i]}"
        )


def test_valid_network_ports():
    """Ports must be in the valid range 0-65535."""
    cfg = GeneratorConfig(num_rows=500, seed=42)
    txs, _ = generate_dataset(cfg)

    for tx in txs:
        assert 0 <= tx.src_port <= 65535
        assert 0 <= tx.dst_port <= 65535
        assert tx.src_port >= 1024  # Ephemeral client port
        assert tx.dst_port in {8333, 18333, 8332}  # Bitcoin peer listener port


def test_non_negative_amounts_and_fees():
    """Every amount and fee must be non-negative."""
    cfg = GeneratorConfig(num_rows=500, seed=42)
    txs, _ = generate_dataset(cfg)

    for tx in txs:
        assert tx.fee >= 0.0
        assert len(tx.input_amounts) > 0
        assert len(tx.output_amounts) > 0
        assert all(amt > 0.0 for amt in tx.input_amounts)
        assert all(amt > 0.0 for amt in tx.output_amounts)


def test_input_output_amount_consistency():
    """sum(input_amounts) must equal sum(output_amounts) + fee within satoshi precision."""
    cfg = GeneratorConfig(num_rows=1000, seed=42)
    txs, _ = generate_dataset(cfg)

    for tx in txs:
        total_in = round(sum(tx.input_amounts), 8)
        total_out = round(sum(tx.output_amounts), 8)
        fee = round(tx.fee, 8)

        # In Bitcoin: sum(inputs) >= sum(outputs) + fee
        assert total_in >= round(total_out + fee, 8) - 1e-8
        # Exact balance in satoshis
        in_sats = sum(btc_to_sats(a) for a in tx.input_amounts)
        out_sats = sum(btc_to_sats(a) for a in tx.output_amounts)
        fee_sats = btc_to_sats(tx.fee)
        assert in_sats == out_sats + fee_sats, (
            f"Satoshi balance mismatch: in={in_sats}, out={out_sats}, fee={fee_sats}"
        )


def test_required_canonical_fields_present():
    """Every record must contain all fields required by CanonicalTransaction."""
    cfg = GeneratorConfig(num_rows=300, seed=42)
    txs, _ = generate_dataset(cfg)

    allowed_scripts = {"p2wpkh", "p2pkh", "p2sh", "p2wsh", "unknown"}

    for tx in txs:
        assert bool(tx.event_id)
        assert bool(tx.txid)
        assert bool(tx.timestamp)
        assert bool(tx.src_ip)
        assert bool(tx.dst_ip)
        assert isinstance(tx.src_port, int)
        assert isinstance(tx.dst_port, int)
        assert len(tx.input_addresses) > 0
        assert len(tx.output_addresses) > 0
        assert len(tx.input_amounts) == len(tx.input_addresses)
        assert len(tx.output_amounts) == len(tx.output_addresses)
        assert tx.script_type in allowed_scripts
        assert bool(tx.geo_country)
        assert tx.asn.startswith("AS")


def test_labels_alignment_and_integrity():
    """Labels must exist for every TXID and remain completely separate from transaction data."""
    cfg = GeneratorConfig(num_rows=500, seed=42)
    txs, lbls = generate_dataset(cfg)

    assert len(txs) == len(lbls)
    txid_set = {t.txid for t in txs}

    for lbl in lbls:
        assert lbl.txid in txid_set
        assert lbl.scenario in {
            "benign",
            "fan_in",
            "fan_out",
            "peeling_like",
            "mixing_like",
            "rapid_hop",
            "network_cluster",
        }
        assert bool(lbl.entity_id)
        assert bool(lbl.scenario_instance_id)
        assert isinstance(lbl.is_benign, bool)


def test_labels_not_leaked_into_transaction_telemetry(tmp_path):
    """Transaction CSV, JSON, and XML must NOT contain label or scenario fields."""
    out_dir = str(tmp_path / "leak_test")
    cfg = GeneratorConfig(num_rows=100, seed=42, output_dir=out_dir, output_format="all")
    run_generation(cfg)

    # 1. Check CSV headers
    csv_file = os.path.join(out_dir, "transactions.csv")
    with open(csv_file, mode="r", encoding="utf-8") as f:
        reader = csv.reader(f)
        header = next(reader)
        forbidden = {"scenario", "is_benign", "entity_id", "scenario_instance_id", "parent_txid"}
        assert forbidden.isdisjoint(set(header))

    # 2. Check JSON keys
    json_file = os.path.join(out_dir, "transactions.json")
    with open(json_file, mode="r", encoding="utf-8") as f:
        data = json.load(f)
        for item in data:
            assert forbidden.isdisjoint(set(item.keys()))

    # 3. Check XML tags
    xml_file = os.path.join(out_dir, "transactions.xml")
    tree = etree.parse(xml_file)
    for elem in tree.iter("transaction"):
        tag_names = {child.tag for child in elem}
        assert forbidden.isdisjoint(tag_names)


def test_all_scenario_types_represented():
    """All 7 scenarios must be generated in a representative run."""
    cfg = GeneratorConfig(num_rows=2000, seed=42)
    _, lbls = generate_dataset(cfg)

    found_scenarios = {lbl.scenario for lbl in lbls}
    expected_scenarios = {
        "benign",
        "fan_in",
        "fan_out",
        "peeling_like",
        "mixing_like",
        "rapid_hop",
        "network_cluster",
    }
    assert found_scenarios == expected_scenarios


def test_peeling_chain_semantics():
    """Peeling chain transactions must link parent_txid and change addresses."""
    cfg = GeneratorConfig(num_rows=2000, seed=42)
    txs, lbls = generate_dataset(cfg)

    peel_txs = [t for t, l in zip(txs, lbls) if l.scenario == "peeling_like"]
    peel_lbls = [l for l in lbls if l.scenario == "peeling_like"]

    assert len(peel_txs) > 0
    # Group by instance
    instances = {}
    for t, l in zip(peel_txs, peel_lbls):
        instances.setdefault(l.scenario_instance_id, []).append((t, l))

    # Check at least one complete multi-tx peeling chain
    multi_step_chains = [chain for chain in instances.values() if len(chain) > 1]
    assert len(multi_step_chains) > 0

    for chain in multi_step_chains:
        # First transaction in chain has no parent_txid
        assert chain[0][1].parent_txid == ""
        # Subsequent transactions link to prior txid
        for i in range(1, len(chain)):
            curr_tx, curr_lbl = chain[i]
            prev_tx, _ = chain[i - 1]
            assert curr_lbl.parent_txid == prev_tx.txid
            # Change output of previous tx is input of current tx
            prev_change_addr = prev_tx.output_addresses[1]
            assert curr_tx.input_addresses[0] == prev_change_addr


def test_rapid_hop_semantics():
    """Rapid hop transactions must occur with short inter-arrival times and parent links."""
    cfg = GeneratorConfig(num_rows=2000, seed=42)
    txs, lbls = generate_dataset(cfg)

    instances = {}
    for t, l in zip(txs, lbls):
        if l.scenario == "rapid_hop":
            instances.setdefault(l.scenario_instance_id, []).append((t, l))

    multi_hops = [chain for chain in instances.values() if len(chain) > 1]
    assert len(multi_hops) > 0

    for chain in multi_hops:
        for i in range(1, len(chain)):
            curr_tx, curr_lbl = chain[i]
            prev_tx, _ = chain[i - 1]
            assert curr_lbl.parent_txid == prev_tx.txid
            t_curr = datetime.fromisoformat(curr_tx.timestamp.replace("Z", "+00:00"))
            t_prev = datetime.fromisoformat(prev_tx.timestamp.replace("Z", "+00:00"))
            delta = (t_curr - t_prev).total_seconds()
            assert 0.0 < delta <= 60.0  # Rapid inter-arrival window


def test_csv_ingestion_pipeline_compatibility(tmp_path):
    """Generated CSV must be cleanly accepted by the existing ingestion pipeline."""
    out_dir = str(tmp_path / "csv_ingest")
    cfg = GeneratorConfig(num_rows=500, seed=42, output_dir=out_dir, output_format="csv")
    files = run_generation(cfg)

    manifest = run_ingestion_pipeline(files["csv"], "batch_test_csv", source_type="csv")
    assert manifest.status == "COMPLETED"
    assert manifest.records_received == 500
    assert manifest.records_accepted == 500
    assert manifest.records_quarantined == 0

    parquet_file = f"data/canonical/{manifest.run_id}.parquet"
    duck_results = query_canonical_duckdb(parquet_file)
    assert len(duck_results) == 500


def test_json_ingestion_pipeline_compatibility(tmp_path):
    """Generated JSON must be cleanly accepted by the existing ingestion pipeline."""
    out_dir = str(tmp_path / "json_ingest")
    cfg = GeneratorConfig(num_rows=300, seed=42, output_dir=out_dir, output_format="json")
    files = run_generation(cfg)

    manifest = run_ingestion_pipeline(files["json"], "batch_test_json", source_type="json")
    assert manifest.status == "COMPLETED"
    assert manifest.records_received == 300
    assert manifest.records_accepted == 300
    assert manifest.records_quarantined == 0


def test_xml_ingestion_pipeline_compatibility(tmp_path):
    """Generated XML must be cleanly accepted by the existing ingestion pipeline."""
    out_dir = str(tmp_path / "xml_ingest")
    cfg = GeneratorConfig(num_rows=300, seed=42, output_dir=out_dir, output_format="xml")
    files = run_generation(cfg)

    manifest = run_ingestion_pipeline(files["xml"], "batch_test_xml", source_type="xml")
    assert manifest.status == "COMPLETED"
    assert manifest.records_received == 300
    assert manifest.records_accepted == 300
    assert manifest.records_quarantined == 0


def test_config_validation():
    """Config validation must raise ValueError for invalid arguments."""
    with pytest.raises(ValueError, match="num_rows must be positive"):
        GeneratorConfig(num_rows=0).validate()

    with pytest.raises(ValueError, match="output_format"):
        GeneratorConfig(output_format="parquet").validate()

    with pytest.raises(ValueError, match="scenario_weights must sum to 1.0"):
        GeneratorConfig(scenario_weights={"benign": 0.5}).validate()
