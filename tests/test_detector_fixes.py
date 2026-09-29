"""
SANKET Task 5A: Detector Validation Fixes Test Suite
Verifies chain-aware rapid-hop detection and multi-attribute network cluster detection.
Guarantees cold-start preservation, no future leakage, and score bounds [0.0, 1.0].
"""
import pytest
from src.features.pipeline import FeaturePipeline
from src.detectors.temporal import detect_rapid_hop
from src.detectors.network import detect_network_cluster


# ──────────────────────────────────────────────────────────────────────
# PART A: RAPID-HOP CHAIN-AWARE TESTS
# ──────────────────────────────────────────────────────────────────────

def test_fresh_address_rapid_hop_chain_triggers_when_related():
    """1. Fresh-address rapid-hop chain must trigger when transactions are directly linked."""
    pipeline = FeaturePipeline()
    tx_a = {
        "event_id": "evt_a",
        "txid": "tx_a",
        "timestamp": "2026-09-01T12:00:00Z",
        "src_ip": "192.168.1.50",
        "dst_ip": "10.0.0.1",
        "src_port": 50000,
        "dst_port": 8333,
        "input_addresses": ["root_addr"],
        "output_addresses": ["fresh_hop_1"],
        "input_amounts": [5.0],
        "output_amounts": [4.99],
        "fee": 0.01,
        "geo_country": "US",
        "asn": "AS15169",
    }
    tx_b = {
        "event_id": "evt_b",
        "txid": "tx_b",
        "timestamp": "2026-09-01T12:00:20Z",  # 20 seconds later
        "src_ip": "192.168.1.50",
        "dst_ip": "10.0.0.2",
        "src_port": 50001,
        "dst_port": 8333,
        "input_addresses": ["fresh_hop_1"],  # Spends parent output
        "output_addresses": ["fresh_hop_2"],
        "input_amounts": [4.99],
        "output_amounts": [4.98],
        "fee": 0.01,
        "geo_country": "US",
        "asn": "AS15169",
    }

    feature_rows = pipeline.extract_features([tx_a, tx_b])
    assert len(feature_rows) == 2

    # Second transaction in rapid chain must be recognized via lineage
    row_b = feature_rows[1]
    assert row_b["history_count"] >= 1.0
    assert 0.0 < row_b["median_interarrival"] <= 30.0

    res_b = detect_rapid_hop(row_b)
    assert res_b.triggered is True
    assert res_b.score >= 0.50
    assert res_b.detector_name == "rapid_hop"
    assert any(e.feature == "median_interarrival" for e in res_b.evidence)


def test_fresh_isolated_transaction_does_not_trigger():
    """2. Fresh isolated transaction must NOT trigger (cold-start protection preserved)."""
    pipeline = FeaturePipeline()
    tx_isolated = {
        "event_id": "evt_iso",
        "txid": "tx_iso",
        "timestamp": "2026-09-01T12:00:00Z",
        "src_ip": "192.168.1.100",
        "dst_ip": "10.0.0.1",
        "src_port": 51000,
        "dst_port": 8333,
        "input_addresses": ["completely_unrelated_fresh_addr"],
        "output_addresses": ["some_output"],
        "input_amounts": [1.0],
        "output_amounts": [0.99],
        "fee": 0.01,
        "geo_country": "US",
        "asn": "AS15169",
    }
    feature_rows = pipeline.extract_features([tx_isolated])
    row = feature_rows[0]
    assert row["history_count"] == 0.0

    res = detect_rapid_hop(row)
    assert res.triggered is False
    assert res.score == 0.0


def test_slow_related_chain_scores_lower():
    """3. Slow related chain (> 120s between hops) scores lower and does NOT trigger."""
    pipeline = FeaturePipeline()
    tx_a = {
        "event_id": "evt_slow_a",
        "txid": "tx_slow_a",
        "timestamp": "2026-09-01T12:00:00Z",
        "input_addresses": ["addr_slow_1"],
        "output_addresses": ["addr_slow_2"],
        "input_amounts": [2.0],
        "output_amounts": [1.99],
        "fee": 0.01,
    }
    tx_b = {
        "event_id": "evt_slow_b",
        "txid": "tx_slow_b",
        "timestamp": "2026-09-01T12:10:00Z",  # 600s (10 minutes) later
        "input_addresses": ["addr_slow_2"],
        "output_addresses": ["addr_slow_3"],
        "input_amounts": [1.99],
        "output_amounts": [1.98],
        "fee": 0.01,
    }
    feature_rows = pipeline.extract_features([tx_a, tx_b])
    res_b = detect_rapid_hop(feature_rows[1])
    assert res_b.triggered is False
    assert res_b.score < 0.50


def test_missing_relationship_information_does_not_crash():
    """4. Transactions with missing or partial fields must not crash the detector."""
    res_empty = detect_rapid_hop({})
    assert res_empty.score == 0.0
    assert res_empty.triggered is False

    res_none = detect_rapid_hop({
        "median_interarrival": None,
        "mean_interarrival": None,
        "history_count": None,
        "tx_count_5m": None,
    })
    assert res_none.score == 0.0
    assert res_none.triggered is False


def test_no_future_transaction_leakage_in_rapid_hop():
    """5. Future transactions must not alter earlier transactions' features or scores."""
    tx_early = {
        "event_id": "evt_e",
        "txid": "tx_e",
        "timestamp": "2026-09-01T12:00:00Z",
        "input_addresses": ["addr_1"],
        "output_addresses": ["addr_2"],
        "input_amounts": [1.0],
        "output_amounts": [0.99],
        "fee": 0.01,
    }
    tx_late = {
        "event_id": "evt_l",
        "txid": "tx_l",
        "timestamp": "2026-09-01T12:00:15Z",
        "input_addresses": ["addr_2"],
        "output_addresses": ["addr_3"],
        "input_amounts": [0.99],
        "output_amounts": [0.98],
        "fee": 0.01,
    }

    # Run isolated tx_early
    pipe_single = FeaturePipeline()
    feat_early_isolated = pipe_single.extract_features([tx_early])[0]

    # Run [tx_early, tx_late]
    pipe_both = FeaturePipeline()
    feat_early_paired = pipe_both.extract_features([tx_early, tx_late])[0]

    # Early transaction features must be completely invariant to presence of late transaction
    assert feat_early_isolated["history_count"] == feat_early_paired["history_count"]
    assert feat_early_isolated["median_interarrival"] == feat_early_paired["median_interarrival"]
    assert feat_early_isolated["tx_count_5m"] == feat_early_paired["tx_count_5m"]


def test_rapid_hop_score_remains_in_bounds():
    """6. Rapid hop score must remain strictly within [0.0, 1.0]."""
    test_cases = [
        {"median_interarrival": -10.0, "history_count": -5.0},
        {"median_interarrival": 0.0, "history_count": 0.0},
        {"median_interarrival": 5.0, "history_count": 100.0, "tx_count_5m": 50.0},
        {"median_interarrival": 1000.0, "history_count": 1000.0},
    ]
    for case in test_cases:
        res = detect_rapid_hop(case)
        assert 0.0 <= res.score <= 1.0


# ──────────────────────────────────────────────────────────────────────
# PART B: NETWORK CLUSTER MULTI-ATTRIBUTE TESTS
# ──────────────────────────────────────────────────────────────────────

def test_asn_concentration_alone_does_not_trigger_network_cluster():
    """7. ASN concentration alone must NOT trigger network_cluster (score < 0.50)."""
    row = {
        "asn_concentration": 1.0,
        "unique_asns": 1.0,
        "ip_reuse_count": 0.0,
        "endpoint_recurrence": 1.0,
        "src_port_frequency": 1.0,
        "dst_port_frequency": 1.0,
        "unique_addresses_per_ip": 1.0,
        "unique_ips": 1.0,
    }
    result = detect_network_cluster(row)
    assert result.triggered is False
    assert result.score < 0.50
    assert result.score <= 0.35


def test_asn_and_ip_reuse_can_trigger():
    """8. High ASN concentration combined with high IP reuse triggers network_cluster."""
    row = {
        "asn_concentration": 1.0,
        "unique_asns": 1.0,
        "ip_reuse_count": 8.0,
        "endpoint_recurrence": 1.0,
        "src_port_frequency": 1.0,
        "dst_port_frequency": 1.0,
        "unique_addresses_per_ip": 5.0,
        "unique_ips": 1.0,
    }
    result = detect_network_cluster(row)
    assert result.triggered is True
    assert result.score >= 0.50
    assert any(e.feature == "asn_concentration" for e in result.evidence)
    assert any(e.feature == "ip_reuse_count" for e in result.evidence)


def test_asn_and_endpoint_recurrence_can_trigger():
    """9. High ASN concentration combined with endpoint recurrence triggers network_cluster."""
    row = {
        "asn_concentration": 1.0,
        "unique_asns": 1.0,
        "ip_reuse_count": 0.0,
        "endpoint_recurrence": 6.0,
        "src_port_frequency": 1.0,
        "dst_port_frequency": 1.0,
        "unique_addresses_per_ip": 1.0,
        "unique_ips": 1.0,
    }
    result = detect_network_cluster(row)
    assert result.triggered is True
    assert result.score >= 0.50
    assert any(e.feature == "endpoint_recurrence" for e in result.evidence)


def test_normal_benign_single_asn_activity_remains_below_threshold():
    """10. Normal benign single-ASN activity remains safely below 0.50 trigger threshold."""
    benign_profile = {
        "asn_concentration": 1.0,
        "unique_asns": 1.0,
        "unique_ips": 1.0,
        "unique_addresses_per_ip": 1.0,
        "ip_reuse_count": 0.0,
        "endpoint_recurrence": 1.0,
        "src_port_frequency": 1.0,
        "dst_port_frequency": 1.0,
    }
    result = detect_network_cluster(benign_profile)
    assert result.triggered is False
    assert result.score < 0.50


def test_missing_network_fields_do_not_crash():
    """11. Missing network fields do not crash and produce 0.0 score."""
    res_empty = detect_network_cluster({})
    assert res_empty.score == 0.0
    assert res_empty.triggered is False

    res_none = detect_network_cluster({
        "asn_concentration": None,
        "ip_reuse_count": None,
        "endpoint_recurrence": None,
    })
    assert res_none.score == 0.0
    assert res_none.triggered is False


def test_network_cluster_score_remains_in_bounds():
    """12. Network cluster score must remain strictly within [0.0, 1.0]."""
    test_cases = [
        {"asn_concentration": -1.0, "ip_reuse_count": -5.0},
        {"asn_concentration": 0.0, "ip_reuse_count": 0.0},
        {"asn_concentration": 1.0, "ip_reuse_count": 50.0, "endpoint_recurrence": 30.0},
        {"asn_concentration": 5.0, "ip_reuse_count": 100.0},
    ]
    for case in test_cases:
        res = detect_network_cluster(case)
        assert 0.0 <= res.score <= 1.0


# ──────────────────────────────────────────────────────────────────────
# PART C: ROLLING NETWORK REUSE TESTS (Task 5A.1)
# ──────────────────────────────────────────────────────────────────────

from src.features.network import NetworkTracker


def _make_net_record(src_ip, dst_ip, addr, timestamp, src_port=10000, dst_port=8333, asn="AS15169", country="US"):
    """Helper to construct a minimal record for NetworkTracker testing."""
    return {
        "src_ip": src_ip,
        "dst_ip": dst_ip,
        "src_port": src_port,
        "dst_port": dst_port,
        "input_addresses": [addr],
        "timestamp": timestamp,
        "asn": asn,
        "geo_country": country,
    }


def test_repeated_ip_within_1h_increases_reuse():
    """13. Repeated IP within 1 hour increases rolling reuse count."""
    tracker = NetworkTracker()
    t0 = 1700000000.0

    r1 = _make_net_record("192.168.1.1", "10.0.0.1", "addr_A", t0)
    f1 = tracker.process_transaction(r1)
    assert f1["ip_reuse_count"] == 0.0  # First observation, no prior reuse

    # 10 seconds later — same IP, different address
    r2 = _make_net_record("192.168.1.1", "10.0.0.1", "addr_B", t0 + 10.0)
    f2 = tracker.process_transaction(r2)
    assert f2["ip_reuse_count"] == 1.0  # One prior observation in 1h window

    # 20 seconds later — same IP, another address
    r3 = _make_net_record("192.168.1.1", "10.0.0.1", "addr_C", t0 + 20.0)
    f3 = tracker.process_transaction(r3)
    assert f3["ip_reuse_count"] == 2.0  # Two prior observations in 1h window
    assert f3["ip_reuse_count_24h"] == 2.0  # Also 2 in 24h window


def test_repeated_ip_outside_rolling_window_does_not_count():
    """14. Repeated IP outside the 1h rolling window does not count as recent reuse."""
    tracker = NetworkTracker()
    t0 = 1700000000.0

    # Transaction at t0
    r1 = _make_net_record("192.168.1.1", "10.0.0.1", "addr_A", t0)
    f1 = tracker.process_transaction(r1)
    assert f1["ip_reuse_count"] == 0.0

    # Transaction 2 hours later — same IP, outside 1h window
    t2 = t0 + 7200.0  # 2 hours
    r2 = _make_net_record("192.168.1.1", "10.0.0.1", "addr_B", t2)
    f2 = tracker.process_transaction(r2)
    assert f2["ip_reuse_count"] == 0.0  # 1h window purged r1
    assert f2["unique_addresses_per_ip"] == 1.0  # Only addr_B in 1h window

    # But 24h window should still include r1
    assert f2["ip_reuse_count_24h"] == 1.0
    assert f2["unique_addresses_per_ip_24h"] == 2.0  # addr_A + addr_B

    # Transaction 28 hours later — outside both windows
    t3 = t0 + 100800.0  # 28 hours (>24h from both r1 at t0 and r2 at t0+7200)
    r3 = _make_net_record("192.168.1.1", "10.0.0.1", "addr_C", t3)
    f3 = tracker.process_transaction(r3)
    assert f3["ip_reuse_count"] == 0.0
    assert f3["ip_reuse_count_24h"] == 0.0  # Both r1 and r2 purged from 24h window


def test_endpoint_recurrence_obeys_temporal_window():
    """15. Endpoint recurrence uses rolling 1h window, not lifetime count."""
    tracker = NetworkTracker()
    t0 = 1700000000.0

    # Three transactions to same endpoint within seconds
    for i in range(3):
        r = _make_net_record("192.168.1.1", "10.0.0.1", f"addr_{i}", t0 + i * 5.0)
        f = tracker.process_transaction(r)
    # After 3 txs, endpoint_recurrence should be 3 (within 1h window)
    assert f["endpoint_recurrence"] == 3.0

    # Transaction 2 hours later — same endpoint, outside 1h window
    r_late = _make_net_record("192.168.1.1", "10.0.0.1", "addr_late", t0 + 7200.0)
    f_late = tracker.process_transaction(r_late)
    assert f_late["endpoint_recurrence"] == 1.0  # Window purged, only current tx
    assert f_late["endpoint_recurrence_24h"] == 4.0  # All 4 txs within 24h


def test_asn_concentration_alone_still_cannot_trigger_with_rolling():
    """16. ASN concentration alone cannot trigger (same as Task 5A, now with rolling features)."""
    # This re-verifies the multi-attribute gate with rolling features
    row = {
        "asn_concentration": 1.0,
        "unique_asns": 1.0,
        "ip_reuse_count": 0.0,  # Rolling 1h reuse = 0 for fresh/benign
        "endpoint_recurrence": 1.0,
        "src_port_frequency": 1.0,
        "dst_port_frequency": 1.0,
        "unique_addresses_per_ip": 1.0,
        "unique_ips": 1.0,
    }
    result = detect_network_cluster(row)
    assert result.triggered is False
    assert result.score < 0.50


def test_persistent_benign_ip_over_30_days_not_suspicious():
    """17. Normal persistent IP activity over 30 days does not automatically flag solely from lifetime count."""
    tracker = NetworkTracker()
    t0 = 1700000000.0

    # Simulate 30 days of benign activity: one transaction every 5 hours from the same IP
    # This is 144 transactions over 30 days (30 * 24 / 5 = 144)
    num_txs = 144
    interval = 5 * 3600.0  # 5 hours between transactions

    last_features = None
    for i in range(num_txs):
        r = _make_net_record(
            "192.168.1.1", "10.0.0.1", f"benign_addr_{i}",
            t0 + i * interval, src_port=10000 + i
        )
        last_features = tracker.process_transaction(r)

    # Rolling 1h reuse should be 0 (transactions are 5h apart — none within 1h)
    assert last_features["ip_reuse_count"] == 0.0
    # Rolling 1h unique addresses should be 1 (only the current address)
    assert last_features["unique_addresses_per_ip"] == 1.0
    # The detector should NOT trigger
    result = detect_network_cluster(last_features)
    assert result.triggered is False
    assert result.score < 0.50


def test_no_future_leakage_in_rolling_network():
    """18. Future transactions must not alter earlier transactions' rolling network features."""
    t0 = 1700000000.0

    tx_early = _make_net_record("192.168.1.1", "10.0.0.1", "addr_X", t0)
    tx_late = _make_net_record("192.168.1.1", "10.0.0.1", "addr_Y", t0 + 30.0)

    # Run tx_early alone
    tracker_single = NetworkTracker()
    feat_early_alone = tracker_single.process_transaction(tx_early)

    # Run [tx_early, tx_late]
    tracker_both = NetworkTracker()
    feat_early_with_late = tracker_both.process_transaction(tx_early)
    _ = tracker_both.process_transaction(tx_late)

    # Early transaction features must be identical regardless of later transactions
    assert feat_early_alone["ip_reuse_count"] == feat_early_with_late["ip_reuse_count"]
    assert feat_early_alone["unique_addresses_per_ip"] == feat_early_with_late["unique_addresses_per_ip"]
    assert feat_early_alone["endpoint_recurrence"] == feat_early_with_late["endpoint_recurrence"]


def test_missing_network_data_remains_safe_rolling():
    """19. Missing network data in rolling tracker does not crash."""
    tracker = NetworkTracker()
    # Record with no timestamp, no IPs, no addresses
    r = {}
    f = tracker.process_transaction(r)
    assert f["ip_reuse_count"] == 0.0
    assert f["unique_addresses_per_ip"] == 1.0
    assert f["endpoint_recurrence"] == 1.0
    assert f["ip_reuse_count_24h"] == 0.0
    assert f["unique_addresses_per_ip_24h"] == 1.0
    assert f["endpoint_recurrence_24h"] == 1.0


def test_network_cluster_scores_remain_bounded_with_rolling():
    """20. All network cluster scores remain strictly in [0.0, 1.0] with rolling features."""
    tracker = NetworkTracker()
    t0 = 1700000000.0

    # Generate a burst of 20 transactions in 2 seconds — extreme case
    all_features = []
    for i in range(20):
        r = _make_net_record(
            "192.168.1.1", "10.0.0.1", f"burst_addr_{i}",
            t0 + i * 0.1, src_port=50000 + i
        )
        feats = tracker.process_transaction(r)
        all_features.append(feats)

    for feats in all_features:
        result = detect_network_cluster(feats)
        assert 0.0 <= result.score <= 1.0


def test_repeated_ip_within_24h_counts():
    """21. Repeated IP within trailing 24 hours counts in 24h window even when outside 1h window."""
    tracker = NetworkTracker()
    t0 = 1700000000.0

    # r1 at t0
    r1 = _make_net_record("10.50.0.1", "172.16.0.1", "addr_1", t0)
    f1 = tracker.process_transaction(r1)
    assert f1["ip_reuse_count"] == 0.0
    assert f1["ip_reuse_count_24h"] == 0.0

    # r2 3 hours later (outside 1h, inside 24h)
    r2 = _make_net_record("10.50.0.1", "172.16.0.1", "addr_2", t0 + 10800.0)
    f2 = tracker.process_transaction(r2)
    assert f2["ip_reuse_count"] == 0.0       # Purged from 1h window
    assert f2["ip_reuse_count_24h"] == 1.0   # Retained in 24h window

    # r3 12 hours later (still inside 24h)
    r3 = _make_net_record("10.50.0.1", "172.16.0.1", "addr_3", t0 + 43200.0)
    f3 = tracker.process_transaction(r3)
    assert f3["ip_reuse_count"] == 0.0       # Purged from 1h window
    assert f3["ip_reuse_count_24h"] == 2.0   # Both r1 and r2 retained in 24h window


def test_multiple_missing_ips_do_not_fabricate_reuse():
    """22. Multiple transactions with missing/None IPs must NOT count as reusing an 'unknown' IP."""
    tracker = NetworkTracker()
    t0 = 1700000000.0

    for i in range(5):
        r = {
            "src_ip": None,
            "dst_ip": None,
            "input_addresses": [f"addr_no_ip_{i}"],
            "timestamp": t0 + i * 10.0,
        }
        f = tracker.process_transaction(r)
        assert f["ip_reuse_count"] == 0.0
        assert f["ip_reuse_count_24h"] == 0.0
        assert f["endpoint_recurrence"] == 1.0


def test_rolling_history_bounded_and_pruned():
    """23. Inactive IPs older than 24h are evicted from internal state, bounding memory."""
    tracker = NetworkTracker()
    t0 = 1700000000.0

    # Add 100 ephemeral IPs that only appear once
    for i in range(100):
        r = _make_net_record(f"192.168.100.{i}", "10.0.0.1", f"addr_{i}", t0 + i * 10.0)
        tracker.process_transaction(r)

    # 100 IPs currently in 24h tracking
    assert len(tracker._ip_deques_24h) == 100

    # Advance time by 30 hours (> 24 hours after the last of the 100 IPs)
    t_future = t0 + 108000.0
    tracker._prune_expired_state(t_future)

    # All 100 stale IPs must be evicted from active tracking structures
    assert len(tracker._ip_deques_24h) == 0
    assert len(tracker._ip_deques_1h) == 0
    assert len(tracker._addr_counts_24h) == 0


def test_chronological_processing_is_deterministic():
    """24. Running the same stream of transactions through separate trackers yields identical features."""
    records = [
        _make_net_record("10.0.0.5", "10.0.0.1", "addr_A", 1700000000.0 + i * 30.0)
        for i in range(10)
    ]

    tracker_a = NetworkTracker()
    tracker_b = NetworkTracker()

    feats_a = [tracker_a.process_transaction(r) for r in records]
    feats_b = [tracker_b.process_transaction(r) for r in records]

    for fa, fb in zip(feats_a, feats_b):
        assert fa == fb


