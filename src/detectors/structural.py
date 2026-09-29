"""
SANKET Detection Engine: Structural Detectors
Deterministic rule-based and feature-weighted detectors for graph and transaction topology.
Covers Fan-In consolidation, Fan-Out dispersion, Equal-Output splits, Peeling chains, and Mixing-like patterns.
"""
from typing import Any, Dict, List

from src.detectors.evidence import (
    DetectorResult,
    EvidenceItem,
    calculate_severity,
    clamp_01,
    linear_scale,
)


def detect_fan_in(row: Dict[str, Any], threshold: float = 0.50) -> DetectorResult:
    """
    Detect transactions with unusually high input count / consolidation structure.
    Consolidates fragmented funds into one or two recipient outputs.
    """
    in_cnt = float(row.get("input_count") or 0.0)
    out_cnt = float(row.get("output_count") or 0.0)
    fan_in_ratio = float(row.get("fan_in_ratio") or 0.0)
    is_consolidation = float(row.get("is_consolidation_structure") or 0.0)

    # Score increases as input count grows from 5 to 25+, and fan_in_ratio exceeds 0.70
    count_score = linear_scale(in_cnt, low=4.0, high=24.0)
    ratio_score = linear_scale(fan_in_ratio, low=0.60, high=0.90)

    # Combined structural score
    raw_score = 0.55 * count_score + 0.30 * ratio_score + 0.15 * is_consolidation
    score = clamp_01(raw_score)
    triggered = score >= threshold

    evidence: List[EvidenceItem] = []
    if in_cnt >= 5:
        evidence.append(
            EvidenceItem(
                feature="input_count",
                value=in_cnt,
                reason=f"High input count ({int(in_cnt)}) indicates multi-source aggregation",
            )
        )
    if fan_in_ratio >= 0.70:
        evidence.append(
            EvidenceItem(
                feature="fan_in_ratio",
                value=fan_in_ratio,
                reason=f"Asymmetric fan-in ratio ({fan_in_ratio:.2f}) indicates structural consolidation",
            )
        )
    if is_consolidation == 1.0:
        evidence.append(
            EvidenceItem(
                feature="is_consolidation_structure",
                value=1.0,
                reason="Satisfies canonical consolidation motif (>=5 inputs into <=2 outputs)",
            )
        )

    feature_values = {
        "input_count": in_cnt,
        "output_count": out_cnt,
        "fan_in_ratio": fan_in_ratio,
        "is_consolidation_structure": is_consolidation,
    }

    return DetectorResult(
        detector_name="fan_in",
        score=score,
        triggered=triggered,
        evidence=evidence,
        severity=calculate_severity(score, triggered),
        feature_values=feature_values,
    )


def detect_fan_out(row: Dict[str, Any], threshold: float = 0.50) -> DetectorResult:
    """
    Detect transactions with unusually high output count / dispersion structure.
    Splits value from one source across many downstream destinations.
    """
    out_cnt = float(row.get("output_count") or 0.0)
    in_cnt = float(row.get("input_count") or 0.0)
    fan_out_ratio = float(row.get("fan_out_ratio") or 0.0)
    is_dispersion = float(row.get("is_dispersion_structure") or 0.0)
    round_ratio = float(row.get("round_amount_ratio") or 0.0)

    # Score scales as output count grows from 5 to 25+
    count_score = linear_scale(out_cnt, low=4.0, high=24.0)
    ratio_score = linear_scale(fan_out_ratio, low=0.60, high=0.90)

    raw_score = 0.50 * count_score + 0.30 * ratio_score + 0.10 * is_dispersion + 0.10 * round_ratio
    score = clamp_01(raw_score)
    triggered = score >= threshold

    evidence: List[EvidenceItem] = []
    if out_cnt >= 6:
        evidence.append(
            EvidenceItem(
                feature="output_count",
                value=out_cnt,
                reason=f"High output count ({int(out_cnt)}) indicates multi-recipient dispersion",
            )
        )
    if fan_out_ratio >= 0.70:
        evidence.append(
            EvidenceItem(
                feature="fan_out_ratio",
                value=fan_out_ratio,
                reason=f"Asymmetric fan-out ratio ({fan_out_ratio:.2f}) indicates structural dispersion",
            )
        )
    if round_ratio >= 0.50:
        evidence.append(
            EvidenceItem(
                feature="round_amount_ratio",
                value=round_ratio,
                reason=f"High proportion of structured/round amounts ({round_ratio:.2f})",
            )
        )

    feature_values = {
        "output_count": out_cnt,
        "input_count": in_cnt,
        "fan_out_ratio": fan_out_ratio,
        "is_dispersion_structure": is_dispersion,
        "round_amount_ratio": round_ratio,
    }

    return DetectorResult(
        detector_name="fan_out",
        score=score,
        triggered=triggered,
        evidence=evidence,
        severity=calculate_severity(score, triggered),
        feature_values=feature_values,
    )


def detect_equal_output(row: Dict[str, Any], threshold: float = 0.50) -> DetectorResult:
    """
    Detect transactions with structured equal-denomination outputs.
    Signature of anonymization mixing protocols or scripted batch payouts.
    """
    equal_ratio = float(row.get("equal_output_ratio") or 0.0)
    out_cnt = float(row.get("output_count") or 0.0)
    is_equal_split = float(row.get("is_equal_split_structure") or 0.0)
    amount_cv = float(row.get("amount_cv") or 0.0)

    # Requires at least 3 outputs to be meaningful
    if out_cnt < 3.0:
        score = 0.0
    else:
        ratio_score = linear_scale(equal_ratio, low=0.50, high=0.90)
        count_score = linear_scale(out_cnt, low=3.0, high=10.0)
        cv_bonus = 1.0 - min(1.0, amount_cv) if amount_cv < 0.50 else 0.0
        score = clamp_01(0.55 * ratio_score + 0.25 * is_equal_split + 0.10 * count_score + 0.10 * cv_bonus)

    triggered = score >= threshold

    evidence: List[EvidenceItem] = []
    if equal_ratio >= 0.60 and out_cnt >= 3.0:
        evidence.append(
            EvidenceItem(
                feature="equal_output_ratio",
                value=equal_ratio,
                reason=f"{equal_ratio:.1%} of outputs share identical denomination",
            )
        )
    if is_equal_split == 1.0:
        evidence.append(
            EvidenceItem(
                feature="is_equal_split_structure",
                value=1.0,
                reason="Satisfies equal split bipartite structure motif",
            )
        )

    feature_values = {
        "equal_output_ratio": equal_ratio,
        "output_count": out_cnt,
        "is_equal_split_structure": is_equal_split,
        "amount_cv": amount_cv,
    }

    return DetectorResult(
        detector_name="equal_output",
        score=score,
        triggered=triggered,
        evidence=evidence,
        severity=calculate_severity(score, triggered),
        feature_values=feature_values,
    )


def detect_peeling_like(row: Dict[str, Any], threshold: float = 0.50) -> DetectorResult:
    """
    Detect transactions matching peeling chain structural motifs.
    Asymmetric 2-output split: small peeled value + large continuing change output.
    """
    in_cnt = float(row.get("input_count") or 0.0)
    out_cnt = float(row.get("output_count") or 0.0)
    conc = float(row.get("output_concentration") or 0.0)
    is_peel = float(row.get("is_peeling_structure") or 0.0)

    # Peeling strictly requires 1 or 2 inputs and exactly 2 outputs
    if in_cnt in (1.0, 2.0) and out_cnt == 2.0:
        conc_score = linear_scale(conc, low=0.60, high=0.95)
        raw_score = 0.60 * conc_score + 0.40 * is_peel
        score = clamp_01(raw_score)
    else:
        score = 0.0

    triggered = score >= threshold

    evidence: List[EvidenceItem] = []
    if conc >= 0.65 and out_cnt == 2.0:
        evidence.append(
            EvidenceItem(
                feature="output_concentration",
                value=conc,
                reason=f"High output concentration (HHI={conc:.4f}) reflects heavily skewed change vs peel split",
            )
        )
    if is_peel == 1.0:
        evidence.append(
            EvidenceItem(
                feature="is_peeling_structure",
                value=1.0,
                reason="Satisfies peeling chain topology (1-2 inputs, 2 outputs with small peel < 35%)",
            )
        )

    feature_values = {
        "output_concentration": conc,
        "is_peeling_structure": is_peel,
        "input_count": in_cnt,
        "output_count": out_cnt,
    }

    return DetectorResult(
        detector_name="peeling_like",
        score=score,
        triggered=triggered,
        evidence=evidence,
        severity=calculate_severity(score, triggered),
        feature_values=feature_values,
    )


def detect_mixing_like(row: Dict[str, Any], threshold: float = 0.50) -> DetectorResult:
    """
    Detect multi-party mixing-like transactions (CoinJoin / Wasabi / Whirlpool signature).
    Multi-input, multi-output with high proportion of equal denominations and balanced bipartite density.
    """
    in_cnt = float(row.get("input_count") or 0.0)
    out_cnt = float(row.get("output_count") or 0.0)
    equal_ratio = float(row.get("equal_output_ratio") or 0.0)
    is_equal_split = float(row.get("is_equal_split_structure") or 0.0)
    bipartite_density = float(row.get("bipartite_density") or 0.0)

    # Mixing requires at least 3 inputs and at least 3 outputs
    if in_cnt >= 3.0 and out_cnt >= 3.0:
        in_score = linear_scale(in_cnt, low=3.0, high=8.0)
        out_score = linear_scale(out_cnt, low=3.0, high=10.0)
        equal_score = linear_scale(equal_ratio, low=0.45, high=0.85)

        raw_score = 0.30 * in_score + 0.30 * out_score + 0.30 * equal_score + 0.10 * is_equal_split
        score = clamp_01(raw_score)
    else:
        score = 0.0

    triggered = score >= threshold

    evidence: List[EvidenceItem] = []
    if in_cnt >= 3.0 and out_cnt >= 3.0:
        evidence.append(
            EvidenceItem(
                feature="input_count",
                value=in_cnt,
                reason=f"Multi-party participation ({int(in_cnt)} inputs, {int(out_cnt)} outputs)",
            )
        )
    if equal_ratio >= 0.50 and out_cnt >= 3.0:
        evidence.append(
            EvidenceItem(
                feature="equal_output_ratio",
                value=equal_ratio,
                reason=f"Equal denomination outputs ({equal_ratio:.1%}) characteristic of CoinJoin mixing",
            )
        )

    feature_values = {
        "input_count": in_cnt,
        "output_count": out_cnt,
        "equal_output_ratio": equal_ratio,
        "is_equal_split_structure": is_equal_split,
        "bipartite_density": bipartite_density,
    }

    return DetectorResult(
        detector_name="mixing_like",
        score=score,
        triggered=triggered,
        evidence=evidence,
        severity=calculate_severity(score, triggered),
        feature_values=feature_values,
    )
