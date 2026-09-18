"""
CLI entrypoint for BIT-SHIELD ingestion.

Usage:
    python scripts/ingest.py <file_path> [--batch-id BATCH_ID] [--source-type {csv,json,xml}]

Example:
    python scripts/ingest.py data/sample/sample.csv --batch-id batch_cli_001 --source-type csv
"""
import argparse
import sys
import uuid

from src.pipeline.ingestion_pipeline import run_ingestion_pipeline


def infer_source_type(file_path: str) -> str:
    if file_path.endswith(".csv"):
        return "csv"
    if file_path.endswith(".json"):
        return "json"
    if file_path.endswith(".xml"):
        return "xml"
    raise ValueError(f"Cannot infer source_type from file: {file_path}")


def main():
    parser = argparse.ArgumentParser(description="Run BIT-SHIELD ingestion pipeline on a single file.")
    parser.add_argument("file_path", help="Path to the raw telemetry file (csv/json/xml).")
    parser.add_argument("--batch-id", default=None, help="Batch identifier. Defaults to a generated UUID.")
    parser.add_argument(
        "--source-type",
        choices=["csv", "json", "xml"],
        default=None,
        help="Source format. Inferred from file extension if omitted.",
    )
    args = parser.parse_args()

    batch_id = args.batch_id or f"batch_{uuid.uuid4().hex[:8]}"
    source_type = args.source_type or infer_source_type(args.file_path)

    manifest = run_ingestion_pipeline(args.file_path, batch_id, source_type=source_type)

    print(f"run_id:              {manifest.run_id}")
    print(f"status:               {manifest.status}")
    print(f"records_received:     {manifest.records_received}")
    print(f"records_accepted:     {manifest.records_accepted}")
    print(f"records_quarantined:  {manifest.records_quarantined}")


if __name__ == "__main__":
    sys.exit(main())
