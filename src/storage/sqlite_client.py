import sqlite3
from src.contract.models import RunManifest

def init_metadata_db(db_path: str = "data/canonical/metadata.sqlite"):
    conn = sqlite3.connect(db_path)
    try:
        conn.execute('''
            CREATE TABLE IF NOT EXISTS run_manifests (
                run_id TEXT PRIMARY KEY,
                source TEXT,
                started_at TEXT,
                completed_at TEXT,
                records_received INTEGER,
                records_accepted INTEGER,
                records_quarantined INTEGER,
                status TEXT
            )
        ''')
        conn.commit()
    finally:
        conn.close()

def save_run_manifest(manifest: RunManifest, db_path: str = "data/canonical/metadata.sqlite"):
    conn = sqlite3.connect(db_path)
    try:
        conn.execute('''
            INSERT OR REPLACE INTO run_manifests
            (run_id, source, started_at, completed_at, records_received, records_accepted, records_quarantined, status)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ''', (
            manifest.run_id, manifest.source, manifest.started_at.isoformat(),
            manifest.completed_at.isoformat() if manifest.completed_at else None,
            manifest.records_received, manifest.records_accepted, manifest.records_quarantined, manifest.status
        ))
        conn.commit()
    finally:
        conn.close()
