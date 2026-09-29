"""
SANKET Detection Engine: Temporal Detectors
Detects velocity surges, rapid-hop transaction sequences, and robust behavioral baseline deviations.
"""
from typing import Any, Dict, List

from src.detectors.evidence import (
    DetectorResult,
    EvidenceItem,
    calculate_severity,
    clamp_01,
    linear_scale,
)


def detect_temporal_burst(row: Dict[str, Any], threshold: float = 0.50) -> DetectorResult:
    """
    Detect sudden spikes in transaction rate or transferred volume relative to 1-hour baselines.
    """
    burst_score = float(row.get("burst_score") or 1.0)
    velocity_ratio = float(row.get("velocity_ratio") or 1.0)
    tx_5m = float(row.get("tx_count_5m") or 1.0)
    tx_1h = float(row.get("tx_count_1h") or 1.0)
    vol_5m = float(row.get("volume_5m") or 0.0)
    vol_1h = float(row.get("volume_1h") or 0.0)

    # If only 1 transaction has been observed, burst is neutral
    if tx_1h <= 1.0:
        score = 0.0
    else:
        # burst_score > 1.5 indicates acceleration; > 3.0 indicates sharp burst
        b_score = linear_scale(burst_score, low=1.5, high=6.0)
        v_score = linear_scale(velocity_ratio, low=1.5, high=6.0)
        count_bonus = linear_scale(tx_5m, low=3.0, high=10.0)
        raw_score = 0.50 * b_score + 0.35 * v_score + 0.15 * count_bonus
        score = clamp_01(raw_score)

    triggered = score >= threshold

    evidence: List[EvidenceItem] = []
    if burst_score >= 2.0 and tx_1h > 1.0:
        evidence.append(
            EvidenceItem(
                feature="burst_score",
                value=burst_score,
                reason=f"Transaction arrival velocity ({burst_score:.2f}x) significantly exceeds 1h baseline",
            )
        )
    if velocity_ratio >= 2.0 and tx_1h > 1.0:
        evidence.append(
            EvidenceItem(
                feature="velocity_ratio",
                value=velocity_ratio,
                reason=f"Volume velocity ({velocity_ratio:.2f}x) indicates concentrated capital movement",
            )
        )
    if tx_5m >= 4.0:
        evidence.append(
            EvidenceItem(
                feature="tx_count_5m",
                value=tx_5m,
                reason=f"High 5-minute transaction density ({int(tx_5m)} txs in 300s)",
            )
        )

    feature_values = {
        "burst_score": burst_score,
        "velocity_ratio": velocity_ratio,
        "tx_count_5m": tx_5m,
        "tx_count_1h": tx_1h,
        "volume_5m": vol_5m,
        "volume_1h": vol_1h,
    }

    return DetectorResult(
        detector_name="temporal_burst",
        score=score,
        triggered=triggered,
        evidence=evidence,
        severity=calculate_severity(score, triggered),
        feature_values=feature_values,
    )


def detect_rapid_hop(row: Dict[str, Any], threshold: float = 0.50) -> DetectorResult:
    """
    Detect rapid sequential forwarding through intermediate addresses within short time windows.
    Characterized by low inter-arrival times (< 60s) with active history.
    """
    median_interarrival = float(row.get("median_interarrival") or 0.0)
    mean_interarrival = float(row.get("mean_interarrival") or 0.0)
    history_count = float(row.get("history_count") or 0.0)
    tx_5m = float(row.get("tx_count_5m") or 1.0)

    # Requires at least 1 prior historical transaction to measure an arrival interval
    if history_count < 1.0 or median_interarrival <= 0.0:
        score = 0.0
    else:
        # In rapid-hop chains, intervals are typically 5s to 45s. Beyond 120s score drops to 0.
        if median_interarrival <= 120.0:
            speed_score = linear_scale(120.0 - median_interarrival, low=0.0, high=110.0)
            density_bonus = linear_scale(tx_5m, low=2.0, high=6.0)
            raw_score = 0.70 * speed_score + 0.30 * density_bonus
            score = clamp_01(raw_score)
        else:
            score = 0.0

    triggered = score >= threshold

    evidence: List[EvidenceItem] = []
    if history_count >= 1.0 and 0.0 < median_interarrival <= 60.0:
        evidence.append(
            EvidenceItem(
                feature="median_interarrival",
                value=median_interarrival,
                reason=f"Rapid hop interval: median {median_interarrival:.1f}s between successive transactions",
            )
        )
    if tx_5m >= 2.0:
        evidence.append(
            EvidenceItem(
                feature="tx_count_5m",
                value=tx_5m,
                reason=f"Dense temporal clustering ({int(tx_5m)} hops observed in 5m window)",
            )
        )

    feature_values = {
        "median_interarrival": median_interarrival,
        "mean_interarrival": mean_interarrival,
        "history_count": history_count,
        "tx_count_5m": tx_5m,
    }

    return DetectorResult(
        detector_name="rapid_hop",
        score=score,
        triggered=triggered,
        evidence=evidence,
        severity=calculate_severity(score, triggered),
        feature_values=feature_values,
    )


def detect_baseline_deviation(row: Dict[str, Any], threshold: float = 0.50) -> DetectorResult:
    """
    Detect statistical anomalies in transaction value or activity rate compared to the entity's established baseline.
    Protected against cold-start false positives via baseline_stability.
    """
    deviation = float(row.get("baseline_deviation") or 0.0)
    activity_change = float(row.get("activity_change") or 1.0)
    stability = float(row.get("baseline_stability") or 0.0)
    hist_median = float(row.get("historical_median_amount") or 0.0)
    hist_mad = float(row.get("historical_MAD_amount") or 0.0)

    # Requires established baseline stability (>= 0.20) to score
    if stability < 0.20:
        score = 0.0
    else:
        # deviation is modified Z-score (|x - med| / (1.4826 * MAD))
        dev_score = linear_scale(deviation, low=2.0, high=8.0)
        act_score = linear_scale(activity_change, low=2.0, high=6.0)

        raw_score = (0.65 * dev_score + 0.35 * act_score) * stability
        score = clamp_01(raw_score)

    triggered = score >= threshold

    evidence: List[EvidenceItem] = []
    if stability >= 0.20 and deviation >= 2.5:
        evidence.append(
            EvidenceItem(
                feature="baseline_deviation",
                value=deviation,
                reason=f"Transaction value deviates {deviation:.2f} modified Z-scores from historical median ({hist_median:.4f} BTC)",
            )
        )
    if stability >= 0.20 and activity_change >= 2.5:
        evidence.append(
            EvidenceItem(
                feature="activity_change",
                value=activity_change,
                reason=f"Hourly activity rate surged {activity_change:.2f}x above established baseline",
            )
        )

    feature_values = {
        "baseline_deviation": deviation,
        "activity_change": activity_change,
        "baseline_stability": stability,
        "historical_median_amount": hist_median,
        "historical_MAD_amount": hist_mad,
    }

    return DetectorResult(
        detector_name="baseline_deviation",
        score=score,
        triggered=triggered,
        evidence=evidence,
        severity=calculate_severity(score, triggered),
        feature_values=feature_values,
    )
