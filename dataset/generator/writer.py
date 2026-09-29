"""
Writers for streaming generated transactions into CSV, JSON, and XML formats,
as well as persisting evaluation ground-truth labels separately.
"""
import csv
import json
import os
from typing import Iterable, Sequence

from dataset.generator.core import GeneratedTransaction, TransactionLabel


def format_btc(val: float) -> str:
    """Format float BTC values cleanly with satoshi precision without trailing zero noise."""
    s = f"{val:.8f}".rstrip("0")
    if s.endswith("."):
        return s + "0"
    return s


def write_csv(
    transactions: Iterable[GeneratedTransaction],
    filepath: str,
) -> int:
    """
    Write transactions to CSV matching the canonical ingestion schema.
    Lists are pipe-delimited ('|').
    """
    os.makedirs(os.path.dirname(os.path.abspath(filepath)), exist_ok=True)
    count = 0
    with open(filepath, mode="w", newline="", encoding="utf-8") as f:
        writer = csv.writer(f)
        writer.writerow([
            "event_id",
            "txid",
            "timestamp",
            "src_ip",
            "dst_ip",
            "src_port",
            "dst_port",
            "input_addresses",
            "output_addresses",
            "input_amounts",
            "output_amounts",
            "fee",
            "script_type",
            "geo_country",
            "asn",
        ])
        for tx in transactions:
            writer.writerow([
                tx.event_id,
                tx.txid,
                tx.timestamp,
                tx.src_ip,
                tx.dst_ip,
                tx.src_port,
                tx.dst_port,
                "|".join(tx.input_addresses),
                "|".join(tx.output_addresses),
                "|".join(format_btc(a) for a in tx.input_amounts),
                "|".join(format_btc(a) for a in tx.output_amounts),
                format_btc(tx.fee),
                tx.script_type,
                tx.geo_country,
                tx.asn,
            ])
            count += 1
    return count


def write_json(
    transactions: Iterable[GeneratedTransaction],
    filepath: str,
) -> int:
    """
    Write transactions to JSON matching the canonical JSON ingestion schema.
    Outputs a valid JSON array streamed with indentation.
    """
    os.makedirs(os.path.dirname(os.path.abspath(filepath)), exist_ok=True)
    count = 0
    with open(filepath, mode="w", encoding="utf-8") as f:
        f.write("[\n")
        first = True
        for tx in transactions:
            if not first:
                f.write(",\n")
            first = False

            item = {
                "event_id": tx.event_id,
                "txid": tx.txid,
                "timestamp": tx.timestamp,
                "src_ip": tx.src_ip,
                "dst_ip": tx.dst_ip,
                "src_port": tx.src_port,
                "dst_port": tx.dst_port,
                "input_addresses": tx.input_addresses,
                "output_addresses": tx.output_addresses,
                "input_amounts": [round(a, 8) for a in tx.input_amounts],
                "output_amounts": [round(a, 8) for a in tx.output_amounts],
                "fee": round(tx.fee, 8),
                "script_type": tx.script_type,
                "geo_country": tx.geo_country,
                "asn": tx.asn,
            }
            # Indent each transaction object 2 spaces
            serialized = json.dumps(item, indent=2)
            indented = "\n".join("  " + line for line in serialized.splitlines())
            f.write(indented)
            count += 1
        f.write("\n]\n")
    return count


def write_xml(
    transactions: Iterable[GeneratedTransaction],
    filepath: str,
) -> int:
    """
    Write transactions to XML matching the canonical XML ingestion schema.
    Uses <transactions> root and <transaction> children with pipe-delimited lists.
    """
    os.makedirs(os.path.dirname(os.path.abspath(filepath)), exist_ok=True)
    count = 0
    with open(filepath, mode="w", encoding="utf-8") as f:
        f.write("<transactions>\n")
        for tx in transactions:
            f.write("  <transaction>\n")
            f.write(f"    <event_id>{tx.event_id}</event_id>\n")
            f.write(f"    <txid>{tx.txid}</txid>\n")
            f.write(f"    <timestamp>{tx.timestamp}</timestamp>\n")
            f.write(f"    <src_ip>{tx.src_ip}</src_ip>\n")
            f.write(f"    <dst_ip>{tx.dst_ip}</dst_ip>\n")
            f.write(f"    <src_port>{tx.src_port}</src_port>\n")
            f.write(f"    <dst_port>{tx.dst_port}</dst_port>\n")
            f.write(f"    <input_addresses>{'|'.join(tx.input_addresses)}</input_addresses>\n")
            f.write(f"    <output_addresses>{'|'.join(tx.output_addresses)}</output_addresses>\n")
            f.write(
                f"    <input_amounts>{'|'.join(format_btc(a) for a in tx.input_amounts)}</input_amounts>\n"
            )
            f.write(
                f"    <output_amounts>{'|'.join(format_btc(a) for a in tx.output_amounts)}</output_amounts>\n"
            )
            f.write(f"    <fee>{format_btc(tx.fee)}</fee>\n")
            f.write(f"    <script_type>{tx.script_type}</script_type>\n")
            f.write(f"    <geo_country>{tx.geo_country}</geo_country>\n")
            f.write(f"    <asn>{tx.asn}</asn>\n")
            f.write("  </transaction>\n")
            count += 1
        f.write("</transactions>\n")
    return count


def write_labels(
    labels: Iterable[TransactionLabel],
    filepath: str,
) -> int:
    """
    Write ground-truth labels separately for evaluation.
    Contains txid, scenario, entity_id, scenario_instance_id, is_benign, and parent_txid.
    """
    os.makedirs(os.path.dirname(os.path.abspath(filepath)), exist_ok=True)
    count = 0
    with open(filepath, mode="w", newline="", encoding="utf-8") as f:
        writer = csv.writer(f)
        writer.writerow([
            "txid",
            "scenario",
            "entity_id",
            "scenario_instance_id",
            "is_benign",
            "parent_txid",
        ])
        for label in labels:
            writer.writerow([
                label.txid,
                label.scenario,
                label.entity_id,
                label.scenario_instance_id,
                label.is_benign,
                label.parent_txid,
            ])
            count += 1
    return count
