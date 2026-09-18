import json
from lxml import etree
from typing import List, Tuple
from datetime import datetime, timezone
from src.contract.models import CanonicalTransaction, QuarantineRecord, RunManifest

def parse_xml_batch(file_path: str, batch_id: str) -> Tuple[List[CanonicalTransaction], List[QuarantineRecord], RunManifest]:
    records, quarantine = [], []
    manifest = RunManifest(run_id=batch_id, source=file_path, started_at=datetime.now(timezone.utc), status="RUNNING")
    
    context = etree.iterparse(file_path, events=('end',), tag='transaction', resolve_entities=False, no_network=True)
    
    for _, elem in context:
        manifest.records_received += 1
        try:
            record = CanonicalTransaction(
                event_id=elem.findtext('event_id'),
                txid=elem.findtext('txid'),
                timestamp=datetime.fromisoformat(elem.findtext('timestamp').replace('Z', '+00:00')),
                src_ip=elem.findtext('src_ip'),
                dst_ip=elem.findtext('dst_ip'),
                src_port=int(elem.findtext('src_port')),
                dst_port=int(elem.findtext('dst_port')),
                input_addresses=elem.findtext('input_addresses').split('|') if elem.findtext('input_addresses') else [],
                output_addresses=elem.findtext('output_addresses').split('|') if elem.findtext('output_addresses') else [],
                input_amounts=[float(x) for x in elem.findtext('input_amounts').split('|')] if elem.findtext('input_amounts') else [],
                output_amounts=[float(x) for x in elem.findtext('output_amounts').split('|')] if elem.findtext('output_amounts') else [],
                fee=float(elem.findtext('fee')),
                script_type=elem.findtext('script_type'),
                geo_country=elem.findtext('geo_country'),
                asn=elem.findtext('asn'),
                source_batch_id=batch_id,
                ingest_time=datetime.now(timezone.utc)
            )
            records.append(record)
            manifest.records_accepted += 1
        except Exception as e:
            raw_data = etree.tostring(elem, encoding='unicode')
            quarantine.append(QuarantineRecord(batch_id=batch_id, raw_data=raw_data, error_reason=str(e), timestamp=datetime.now(timezone.utc)))
            manifest.records_quarantined += 1
        elem.clear()
        
    manifest.completed_at = datetime.now(timezone.utc)
    manifest.status = "COMPLETED"
    return records, quarantine, manifest
