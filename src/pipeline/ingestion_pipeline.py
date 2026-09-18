import json
import os
from src.ingest.csv import parse_csv_batch
from src.ingest.json import parse_json_batch
from src.ingest.xml import parse_xml_batch
from src.storage.parquet import save_canonical_to_parquet
from src.storage.sqlite_client import save_run_manifest, init_metadata_db

_PARSERS = {
    "csv": parse_csv_batch,
    "json": parse_json_batch,
    "xml": parse_xml_batch,
}

def run_ingestion_pipeline(file_path: str, batch_id: str, source_type: str = "csv"):
    init_metadata_db()

    parser = _PARSERS.get(source_type)
    if parser is None:
        raise NotImplementedError(f"Pipeline orchestration for {source_type} pending.")

    records, quarantine, manifest = parser(file_path, batch_id)

    if records:
        os.makedirs("data/canonical", exist_ok=True)
        parquet_path = f"data/canonical/{batch_id}.parquet"
        save_canonical_to_parquet(records, parquet_path)

    if quarantine:
        os.makedirs("data/quarantine", exist_ok=True)
        quarantine_path = f"data/quarantine/{batch_id}_quarantine.json"
        with open(quarantine_path, 'w') as f:
            json.dump([q.model_dump(mode='json') for q in quarantine], f, indent=2)

    save_run_manifest(manifest)
    return manifest
