import json
from typing import List, Tuple
from datetime import datetime, timezone
from src.contract.models import CanonicalTransaction, QuarantineRecord, RunManifest

def parse_json_batch(file_path: str, batch_id: str) -> Tuple[List[CanonicalTransaction], List[QuarantineRecord], RunManifest]:
    records, quarantine = [], []
    manifest = RunManifest(run_id=batch_id, source=file_path, started_at=datetime.now(timezone.utc), status="RUNNING")
    
    with open(file_path, 'r') as f:
        data = json.load(f)
        
    for item in data:
        manifest.records_received += 1
        try:
            record = CanonicalTransaction(
                event_id=str(item['event_id']),
                txid=str(item['txid']),
                timestamp=datetime.fromisoformat(item['timestamp'].replace('Z', '+00:00')),
                src_ip=str(item['src_ip']),
                dst_ip=str(item['dst_ip']),
                src_port=int(item['src_port']),
                dst_port=int(item['dst_port']),
                input_addresses=item.get('input_addresses', []),
                output_addresses=item.get('output_addresses', []),
                input_amounts=[float(x) for x in item.get('input_amounts', [])],
                output_amounts=[float(x) for x in item.get('output_amounts', [])],
                fee=float(item['fee']),
                script_type=item.get('script_type'),
                geo_country=item.get('geo_country'),
                asn=item.get('asn'),
                source_batch_id=batch_id,
                ingest_time=datetime.now(timezone.utc)
            )
            records.append(record)
            manifest.records_accepted += 1
        except Exception as e:
            quarantine.append(QuarantineRecord(batch_id=batch_id, raw_data=json.dumps(item), error_reason=str(e), timestamp=datetime.now(timezone.utc)))
            manifest.records_quarantined += 1
            
    manifest.completed_at = datetime.now(timezone.utc)
    manifest.status = "COMPLETED"
    return records, quarantine, manifest
