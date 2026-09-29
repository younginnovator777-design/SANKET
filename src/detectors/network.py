"""
SANKET Detection Engine: Network Detectors
Observational network correlation detectors for IP reuse, cluster concentration,
and endpoint recurrence. Network evidence is contextual — it MUST NOT be treated
as proof of wallet ownership or criminal activity.
"""
from typing import Any, Dict, List

from src.detectors.evidence import (
    DetectorResult,
    EvidenceItem,
    calculate_severity,
    clamp_01,
    linear_scale,
)


def detect_ip_reuse(row: Dict[str, Any], threshold: float = 0.50) -> DetectorResult:
    """
    Detect unusually repeated IP/address associations.
    High ip_reuse_count or multiple addresses sharing a single IP can indicate
    infrastructure reuse or relay concentration — NOT ownership proof.
    """
    ip_reuse = float(row.get("ip_reuse_count") or 0.0)
    unique_addrs_per_ip = float(row.get("unique_addresses_per_ip") or 0.0)
    unique_ips = float(row.get("unique_ips") or 0.0)

    # IP reuse grows as the same IP is observed more often across transactions
    reuse_score = linear_scale(ip_reuse, low=3.0, high=20.0)

    # Multiple distinct addresses from the same IP suggests shared infrastructure
    addr_diversity_score = linear_scale(unique_addrs_per_ip, low=2.0, high=8.0)

    raw_score = 0.60 * reuse_score + 0.40 * addr_diversity_score
    score = clamp_01(raw_score)
    triggered = score >= threshold

    evidence: List[EvidenceItem] = []
    if ip_reuse >= 5.0:
        evidence.append(
            EvidenceItem(
                feature="ip_reuse_count",
                value=ip_reuse,
                reason=f"Source IP observed {int(ip_reuse)} prior times (contextual network correlation)",
            )
        )
    if unique_addrs_per_ip >= 3.0:
        evidence.append(
            EvidenceItem(
                feature="unique_addresses_per_ip",
                value=unique_addrs_per_ip,
                reason=f"{int(unique_addrs_per_ip)} distinct addresses observed from same IP (infrastructure pattern)",
            )
        )

    feature_values = {
        "ip_reuse_count": ip_reuse,
        "unique_addresses_per_ip": unique_addrs_per_ip,
        "unique_ips": unique_ips,
    }

    return DetectorResult(
        detector_name="ip_reuse",
        score=score,
        triggered=triggered,
        evidence=evidence,
        severity=calculate_severity(score, triggered),
        feature_values=feature_values,
    )


def detect_network_cluster(row: Dict[str, Any], threshold: float = 0.50) -> DetectorResult:
    """
    Detect infrastructure clustering using multi-attribute network evidence.
    Requires ASN concentration combined with correlated network indicators
    (IP reuse, endpoint recurrence, port recurrence, or address-per-IP dispersion).
    ASN concentration alone is strictly insufficient to trigger.
    """
    asn_conc = float(row.get("asn_concentration") or 0.0)
    unique_asns = float(row.get("unique_asns") or 0.0)
    src_port_freq = float(row.get("src_port_frequency") or 0.0)
    dst_port_freq = float(row.get("dst_port_frequency") or 0.0)
    unique_ips = float(row.get("unique_ips") or 0.0)
    ip_reuse = float(row.get("ip_reuse_count") or 0.0)
    endpoint_rec = float(row.get("endpoint_recurrence") or 0.0)
    addrs_per_ip = float(row.get("unique_addresses_per_ip") or 0.0)

    # 1. ASN concentration component: capped at 0.30 so ASN alone CANNOT trigger (< 0.50)
    asn_factor = linear_scale(asn_conc, low=0.70, high=1.0)
    asn_component = 0.30 * asn_factor

    # 2. Multi-attribute secondary network signals:
    # IP reuse across multiple transactions
    ip_reuse_factor = linear_scale(ip_reuse, low=2.0, high=8.0)

    # Endpoint recurrence (same source IP, destination IP, and destination port)
    endpoint_factor = linear_scale(endpoint_rec, low=2.0, high=6.0)

    # Address dispersion across a single IP
    addr_dispersion_factor = linear_scale(addrs_per_ip, low=2.0, high=6.0)

    # Ephemeral source port recurrence (scripted port reuse, excluding standard daemon ports)
    port_factor = linear_scale(src_port_freq, low=3.0, high=15.0)

    secondary_signals = [ip_reuse_factor, endpoint_factor, addr_dispersion_factor, port_factor]
    max_secondary = max(secondary_signals)
    mean_secondary = sum(secondary_signals) / len(secondary_signals)

    # Multi-attribute synergy:
    # If secondary signals exist alongside high ASN concentration, score elevates above 0.50
    raw_score = asn_component + 0.45 * max_secondary + 0.25 * mean_secondary
    score = clamp_01(raw_score)
    triggered = score >= threshold

    evidence: List[EvidenceItem] = []
    if asn_conc >= 0.80:
        evidence.append(
            EvidenceItem(
                feature="asn_concentration",
                value=asn_conc,
                reason=f"ASN concentration HHI={asn_conc:.4f} indicates tightly co-located network activity",
            )
        )
    if ip_reuse >= 2.0:
        evidence.append(
            EvidenceItem(
                feature="ip_reuse_count",
                value=ip_reuse,
                reason=f"Multi-attribute network correlation: IP observed {int(ip_reuse)} times across unlinked transactions",
            )
        )
    if endpoint_rec >= 2.0:
        evidence.append(
            EvidenceItem(
                feature="endpoint_recurrence",
                value=endpoint_rec,
                reason=f"Repeated endpoint tuple recurrence ({int(endpoint_rec)} observations) across distinct wallets",
            )
        )
    if max(src_port_freq, dst_port_freq) >= 8.0:
        evidence.append(
            EvidenceItem(
                feature="dst_port_frequency" if dst_port_freq >= src_port_freq else "src_port_frequency",
                value=max(src_port_freq, dst_port_freq),
                reason=f"Repeated port usage ({int(max(src_port_freq, dst_port_freq))} observations) suggests scripted network behavior",
            )
        )

    feature_values = {
        "asn_concentration": asn_conc,
        "unique_asns": unique_asns,
        "src_port_frequency": src_port_freq,
        "dst_port_frequency": dst_port_freq,
        "unique_ips": unique_ips,
        "ip_reuse_count": ip_reuse,
        "endpoint_recurrence": endpoint_rec,
        "unique_addresses_per_ip": addrs_per_ip,
    }

    return DetectorResult(
        detector_name="network_cluster",
        score=score,
        triggered=triggered,
        evidence=evidence,
        severity=calculate_severity(score, triggered),
        feature_values=feature_values,
    )


def detect_endpoint_recurrence(row: Dict[str, Any], threshold: float = 0.50) -> DetectorResult:
    """
    Detect repeated source/destination endpoint patterns.
    High endpoint_recurrence indicates the same (src_ip, dst_ip) pair is used repeatedly,
    which may indicate a persistent relay path or scripted routing.
    """
    endpoint_rec = float(row.get("endpoint_recurrence") or 0.0)
    ip_reuse = float(row.get("ip_reuse_count") or 0.0)
    unique_ips = float(row.get("unique_ips") or 0.0)

    # Score scales with repeated endpoint observations
    rec_score = linear_scale(endpoint_rec, low=3.0, high=15.0)

    # Bonus if the same IP is also heavily reused
    reuse_bonus = linear_scale(ip_reuse, low=5.0, high=20.0)

    raw_score = 0.75 * rec_score + 0.25 * reuse_bonus
    score = clamp_01(raw_score)
    triggered = score >= threshold

    evidence: List[EvidenceItem] = []
    if endpoint_rec >= 4.0:
        evidence.append(
            EvidenceItem(
                feature="endpoint_recurrence",
                value=endpoint_rec,
                reason=f"Endpoint pair observed {int(endpoint_rec)} times (persistent relay pattern)",
            )
        )

    feature_values = {
        "endpoint_recurrence": endpoint_rec,
        "ip_reuse_count": ip_reuse,
        "unique_ips": unique_ips,
    }

    return DetectorResult(
        detector_name="endpoint_recurrence",
        score=score,
        triggered=triggered,
        evidence=evidence,
        severity=calculate_severity(score, triggered),
        feature_values=feature_values,
    )
