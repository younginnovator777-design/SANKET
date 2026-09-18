from src.ingest.csv import parse_csv_batch
from src.ingest.json import parse_json_batch
from src.ingest.xml import parse_xml_batch
from src.storage.parquet import save_canonical_to_parquet
from src.storage.duckdb_client import query_canonical_duckdb
from src.storage.sqlite_client import init_metadata_db, save_run_manifest
import sqlite3

def test_full_csv_ingestion_flow(tmp_path):
    parquet_file = str(tmp_path / "test.parquet")
    records, quarantine, manifest = parse_csv_batch("data/sample/sample.csv", batch_id="batch_001")
    assert len(records) == 2
    assert manifest.records_accepted == 2
    assert manifest.status == "COMPLETED"

    save_canonical_to_parquet(records, parquet_file)
    results = query_canonical_duckdb(parquet_file)
    assert len(results) == 2
    assert results[0][0] == "tx_001"

def test_csv_quarantine_flow():
    records, quarantine, manifest = parse_csv_batch("data/sample/bad_sample.csv", batch_id="batch_bad_001")
    assert manifest.records_received == 3
    assert len(records) == 1
    assert len(quarantine) == 2
    assert manifest.records_quarantined == 2
    assert "INVALID_PORT" in quarantine[0].raw_data

def test_json_and_xml_ingestion_with_quarantine():
    j_records, j_quarantine, j_manifest = parse_json_batch("data/sample/sample.json", batch_id="batch_002")
    assert len(j_records) == 1
    assert j_manifest.records_accepted == 1
    assert j_manifest.status == "COMPLETED"

    x_records, x_quarantine, x_manifest = parse_xml_batch("data/sample/sample.xml", batch_id="batch_003")
    assert len(x_records) == 1
    assert x_manifest.records_accepted == 1
    assert x_manifest.status == "COMPLETED"

def test_sqlite_metadata_manifest(tmp_path):
    db_file = str(tmp_path / "metadata.sqlite")
    init_metadata_db(db_file)
    
    _, _, manifest = parse_csv_batch("data/sample/sample.csv", batch_id="batch_meta_001")
    save_run_manifest(manifest, db_file)
    
    conn = sqlite3.connect(db_file)
    row = conn.execute("SELECT run_id, records_accepted, status FROM run_manifests WHERE run_id = ?", ("batch_meta_001",)).fetchone()
    assert row is not None
    assert row[0] == "batch_meta_001"
    assert row[1] == 2
    assert row[2] == "COMPLETED"

def test_strict_contract_quarantine():
    records, quarantine, manifest = parse_csv_batch("data/sample/strict_bad_sample.csv", batch_id="batch_strict_001")
    assert manifest.records_received == 3
    assert len(records) == 1
    assert len(quarantine) == 2
    assert manifest.records_quarantined == 2
    
    error_texts = [q.error_reason for q in quarantine]
    assert any("fee" in e or "greater than or equal to 0" in e for e in error_texts)
    assert any("src_port" in e or "less than or equal to 65535" in e for e in error_texts)

from src.pipeline.ingestion_pipeline import run_ingestion_pipeline
import os

def test_pipeline_orchestration_durable():
    manifest = run_ingestion_pipeline("data/sample/strict_bad_sample.csv", "batch_orch_999")
    assert manifest.records_received == 3
    assert manifest.records_accepted == 1
    assert manifest.records_quarantined == 2
    assert os.path.exists("data/canonical/batch_orch_999.parquet")
    assert os.path.exists("data/quarantine/batch_orch_999_quarantine.json")

def test_pipeline_orchestration_json():
    manifest = run_ingestion_pipeline("data/sample/sample.json", "batch_orch_json_001", source_type="json")
    assert manifest.records_received == 1
    assert manifest.records_accepted == 1
    assert manifest.status == "COMPLETED"
    assert os.path.exists("data/canonical/batch_orch_json_001.parquet")

def test_pipeline_orchestration_xml():
    manifest = run_ingestion_pipeline("data/sample/sample.xml", "batch_orch_xml_001", source_type="xml")
    assert manifest.records_received == 1
    assert manifest.records_accepted == 1
    assert manifest.status == "COMPLETED"
    assert os.path.exists("data/canonical/batch_orch_xml_001.parquet")

def test_pipeline_unsupported_source_type():
    import pytest
    with pytest.raises(NotImplementedError):
        run_ingestion_pipeline("data/sample/sample.csv", "batch_orch_bad_001", source_type="yaml")
