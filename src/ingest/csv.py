import csv
import json
from typing import List, Tuple
from datetime import datetime, timezone
from src.contract.models import CanonicalTransaction, QuarantineRecord, RunManifest

def parse_csv_batch(file_path: str, batch_id: str) -> Tuple[List[CanonicalTransaction], List[QuarantineRecord], RunManifest]:
    records = []
    quarantine = []
    manifest = RunManifest(
        run_id=batch_id, source=file_path, 
        started_at=datetime.now(timezone.utc), status="RUNNING"
    )
    
    with open(file_path, mode='r', encoding='utf-8') as f:
        reader = csv.DictReader(f)
        for row in reader:
            manifest.records_received += 1
            try:
                record = CanonicalTransaction(
                    event_id=row['event_id'],
                    txid=row['txid'],
                    timestamp=datetime.fromisoformat(row['timestamp'].replace('Z', '+00:00')),
                    src_ip=row['src_ip'],
                    dst_ip=row['dst_ip'],
                    src_port=int(row['src_port']),
                    dst_port=int(row['dst_port']),
                    input_addresses=row['input_addresses'].split('|') if row.get('input_addresses') else [],
                    output_addresses=row['output_addresses'].split('|') if row.get('output_addresses') else [],
                    input_amounts=[float(x) for x in row['input_amounts'].split('|')] if row.get('input_amounts') else [],
                    output_amounts=[float(x) for x in row['output_amounts'].split('|')] if row.get('output_amounts') else [],
                    fee=float(row['fee']),
                    script_type=row.get('script_type') or None,
                    geo_country=row.get('geo_country') or None,
                    asn=row.get('asn') or None,
                    source_batch_id=batch_id,
                    ingest_time=datetime.now(timezone.utc)
                )
                records.append(record)
                manifest.records_accepted += 1
            except Exception as e:
                q_rec = QuarantineRecord(
                    batch_id=batch_id, raw_data=json.dumps(row),
                    error_reason=str(e), timestamp=datetime.now(timezone.utc)
                )
                quarantine.append(q_rec)
                manifest.records_quarantined += 1
                
    manifest.completed_at = datetime.now(timezone.utc)
    manifest.status = "COMPLETED"
    return records, quarantine, manifest
