import json
import os
from src.ingest.csv import parse_csv_batch
from src.storage.parquet import save_canonical_to_parquet
from src.storage.sqlite_client import save_run_manifest, init_metadata_db

def run_ingestion_pipeline(file_path: str, batch_id: str, source_type: str = "csv"):
    init_metadata_db()
    
    if source_type == "csv":
        records, quarantine, manifest = parse_csv_batch(file_path, batch_id)
    else:
        raise NotImplementedError(f"Pipeline orchestration for {source_type} pending.")

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
