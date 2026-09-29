"""
SANKET Feature Engineering: Transaction Features
Computes single-transaction structural, amount, fee, and concentration metrics.
All operations are strictly division-by-zero safe and deterministic.
"""
from collections import Counter
import math
from typing import Any, Dict, List, Sequence


def compute_transaction_features(record: Dict[str, Any]) -> Dict[str, float]:
    """
    Extract structural and amount features from a single canonical transaction record.

    Parameters:
        record: Dictionary containing canonical transaction fields:
                input_addresses, output_addresses, input_amounts, output_amounts, fee.

    Returns:
        Dictionary of numeric transaction features.
    """
    in_addrs: Sequence[str] = record.get("input_addresses") or []
    out_addrs: Sequence[str] = record.get("output_addresses") or []
    in_amts: Sequence[float] = record.get("input_amounts") or []
    out_amts: Sequence[float] = record.get("output_amounts") or []
    fee: float = float(record.get("fee") or 0.0)

    input_count = len(in_addrs)
    output_count = len(out_addrs)

    total_in = round(float(sum(in_amts)), 8) if in_amts else 0.0
    total_out = round(float(sum(out_amts)), 8) if out_amts else 0.0

    # Fee ratio: proportion of input value consumed by miner fee
    fee_ratio = fee / total_in if total_in > 1e-12 else 0.0

    # Structural ratios
    input_output_count_ratio = (
        float(input_count) / float(output_count) if output_count > 0 else 0.0
    )
    input_output_amount_ratio = (
        total_in / total_out if total_out > 1e-12 else 0.0
    )

    # Output amount statistics
    m = len(out_amts)
    if m > 0:
        amount_mean = total_out / float(m)
        if m > 1:
            variance = sum((x - amount_mean) ** 2 for x in out_amts) / float(m)
            amount_std = math.sqrt(max(0.0, variance))
            amount_cv = amount_std / amount_mean if amount_mean > 1e-12 else 0.0
        else:
            amount_std = 0.0
            amount_cv = 0.0
    else:
        amount_mean = 0.0
        amount_std = 0.0
        amount_cv = 0.0

    # Output concentration: normalized Herfindahl-Hirschman Index (HHI)
    # HHI = sum((amount_i / total_out)^2). 1.0 for singleton output, 1/m for m equal outputs.
    if total_out > 1e-12 and m > 0:
        shares = [x / total_out for x in out_amts]
        output_concentration = sum(s * s for s in shares)
    else:
        output_concentration = 0.0

    # Equal output ratio: proportion of outputs sharing the most common denomination
    # (Characteristic of CoinJoin / mixing protocols)
    if m > 0:
        # Round amounts to satoshi precision for robust equality comparison
        rounded_amts = [round(x, 8) for x in out_amts]
        counts = Counter(rounded_amts)
        max_equal_count = max(counts.values()) if counts else 0
        equal_output_ratio = float(max_equal_count) / float(m)
    else:
        equal_output_ratio = 0.0

    # Round amount ratio: proportion of outputs with round values in satoshis
    # (e.g. divisible by 0.01 BTC, 0.05 BTC, or 0.1 BTC = round satoshi increments)
    if m > 0:
        round_count = 0
        for x in out_amts:
            sats = int(round(x * 100_000_000))
            # Round satoshi milestones: 1,000,000 sats (0.01 BTC), 5,000,000 sats, etc.
            if sats > 0 and (sats % 1_000_000 == 0 or sats % 500_000 == 0):
                round_count += 1
        round_amount_ratio = float(round_count) / float(m)
    else:
        round_amount_ratio = 0.0

    # Fan-in and Fan-out ratios
    total_endpoints = input_count + output_count
    if total_endpoints > 0:
        fan_in_ratio = float(input_count) / float(total_endpoints)
        fan_out_ratio = float(output_count) / float(total_endpoints)
    else:
        fan_in_ratio = 0.0
        fan_out_ratio = 0.0

    return {
        "input_count": float(input_count),
        "output_count": float(output_count),
        "total_input_amount": total_in,
        "total_output_amount": total_out,
        "fee": fee,
        "fee_ratio": fee_ratio,
        "input_output_count_ratio": input_output_count_ratio,
        "input_output_amount_ratio": input_output_amount_ratio,
        "amount_mean": amount_mean,
        "amount_std": amount_std,
        "amount_cv": amount_cv,
        "output_concentration": output_concentration,
        "equal_output_ratio": equal_output_ratio,
        "round_amount_ratio": round_amount_ratio,
        "fan_in_ratio": fan_in_ratio,
        "fan_out_ratio": fan_out_ratio,
    }
