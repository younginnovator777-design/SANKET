"""
SANKET Feature Engineering: Local Graph Topology Features
Extracts bipartite transaction sub-graph structural metrics, degree indicators,
and topological motif signatures without requiring heavy global graph construction.
"""
from typing import Any, Dict, Sequence


def compute_graph_features(
    record: Dict[str, Any],
    tx_features: Dict[str, float],
) -> Dict[str, float]:
    """
    Extract local bipartite graph topology features for a single transaction.

    Parameters:
        record: Canonical transaction record.
        tx_features: Precomputed transaction-level features (for equal_output_ratio, amounts).

    Returns:
        Dictionary of local graph features.
    """
    in_addrs: Sequence[str] = record.get("input_addresses") or []
    out_addrs: Sequence[str] = record.get("output_addresses") or []
    out_amts: Sequence[float] = record.get("output_amounts") or []

    fan_in_degree = float(len(in_addrs))
    fan_out_degree = float(len(out_addrs))

    # Bipartite density: ratio of actual edges to maximum potential bipartite cross-connections
    max_bipartite_edges = fan_in_degree * fan_out_degree
    if max_bipartite_edges > 0:
        bipartite_density = (fan_in_degree + fan_out_degree) / max_bipartite_edges
    else:
        bipartite_density = 0.0

    # Address reuse within transaction (self-churn / loopback address)
    in_set = set(in_addrs)
    out_set = set(out_addrs)
    address_reuse_in_tx = float(len(in_set & out_set))

    # Structural motif indicators
    # 1. Peeling-like structure: 1-2 inputs, exactly 2 outputs, with one output significantly smaller (< 35%)
    total_out = tx_features.get("total_output_amount", 0.0)
    is_peeling = 0.0
    if fan_in_degree in (1.0, 2.0) and fan_out_degree == 2.0 and total_out > 1e-8:
        min_out = min(out_amts) if out_amts else 0.0
        if (min_out / total_out) < 0.35:
            is_peeling = 1.0

    # 2. Consolidation structure (Fan-In motif): high input degree, small output degree
    is_consolidation = 1.0 if (fan_in_degree >= 5.0 and fan_out_degree <= 2.0) else 0.0

    # 3. Dispersion structure (Fan-Out motif): small input degree, high output degree
    is_dispersion = 1.0 if (fan_in_degree <= 2.0 and fan_out_degree >= 5.0) else 0.0

    # 4. Equal split structure (Mixing / CoinJoin motif): >= 3 outputs and high equal output ratio
    equal_ratio = tx_features.get("equal_output_ratio", 0.0)
    is_equal_split = 1.0 if (fan_out_degree >= 3.0 and equal_ratio >= 0.70) else 0.0

    return {
        "fan_in_degree": fan_in_degree,
        "fan_out_degree": fan_out_degree,
        "bipartite_density": round(bipartite_density, 4),
        "address_reuse_in_tx": address_reuse_in_tx,
        "is_peeling_structure": is_peeling,
        "is_consolidation_structure": is_consolidation,
        "is_dispersion_structure": is_dispersion,
        "is_equal_split_structure": is_equal_split,
    }
