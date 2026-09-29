"""
Comprehensive test suite for SANKET feature engineering foundation.
Validates exact numerical calculations, zero-division safety, leak-free temporal rollups,
cold-start stability, network topology metrics, and schema completeness.
"""
from datetime import datetime, timezone
import math
import os
import pytest
import polars as pl

from src.features.transaction import compute_transaction_features
from src.features.temporal import TemporalTracker
from src.features.network import NetworkTracker
from src.features.entity import EntityTracker
from src.features.graph import compute_graph_features
from src.features.pipeline import (
    FeaturePipeline,
    FEATURE_REGISTRY,
    FEATURE_GROUPS,
    FEATURE_SCHEMA_VERSION,
    compute_data_quality_features,
)


def test_basic_transaction_features():
    """Verify exact numerical values for a standard multi-input multi-output transaction."""
    record = {
        "event_id": "evt_001",
        "txid": "tx_test_001",
        "timestamp": "2026-09-01T12:00:00Z",
        "src_ip": "1.2.3.4",
        "dst_ip": "5.6.7.8",
        "src_port": 5000,
        "dst_port": 8333,
        "input_addresses": ["addr_in_1", "addr_in_2"],
        "output_addresses": ["addr_out_1", "addr_out_2"],
        "input_amounts": [1.5, 2.5],
        "output_amounts": [2.0, 1.9],
        "fee": 0.1,
    }

    feats = compute_transaction_features(record)

    assert feats["input_count"] == 2.0
    assert feats["output_count"] == 2.0
    assert feats["total_input_amount"] == pytest.approx(4.0)
    assert feats["total_output_amount"] == pytest.approx(3.9)
    assert feats["fee"] == pytest.approx(0.1)
    assert feats["fee_ratio"] == pytest.approx(0.1 / 4.0)  # 0.025
    assert feats["input_output_count_ratio"] == pytest.approx(1.0)
    assert feats["input_output_amount_ratio"] == pytest.approx(4.0 / 3.9)
    assert feats["amount_mean"] == pytest.approx(1.95)
    # std of [2.0, 1.9]: mean=1.95, diffs=[-0.05, 0.05], sq_diffs=[0.0025, 0.0025], var=0.0025, std=0.05
    assert feats["amount_std"] == pytest.approx(0.05)
    assert feats["amount_cv"] == pytest.approx(0.05 / 1.95)
    assert feats["fan_in_ratio"] == pytest.approx(0.5)
    assert feats["fan_out_ratio"] == pytest.approx(0.5)


def test_zero_fee_safe():
    """Fee of 0.0 must be handled without error and produce fee_ratio = 0.0."""
    record = {
        "input_addresses": ["addr_1"],
        "output_addresses": ["addr_2"],
        "input_amounts": [1.0],
        "output_amounts": [1.0],
        "fee": 0.0,
    }
    feats = compute_transaction_features(record)
    assert feats["fee"] == 0.0
    assert feats["fee_ratio"] == 0.0


def test_zero_empty_safe_ratios():
    """Empty or zeroed transaction records must produce safe 0.0 ratios without ZeroDivisionError."""
    empty_record = {
        "input_addresses": [],
        "output_addresses": [],
        "input_amounts": [],
        "output_amounts": [],
        "fee": 0.0,
    }
    feats = compute_transaction_features(empty_record)
    assert feats["input_count"] == 0.0
    assert feats["output_count"] == 0.0
    assert feats["total_input_amount"] == 0.0
    assert feats["total_output_amount"] == 0.0
    assert feats["fee_ratio"] == 0.0
    assert feats["input_output_count_ratio"] == 0.0
    assert feats["input_output_amount_ratio"] == 0.0
    assert feats["amount_mean"] == 0.0
    assert feats["amount_std"] == 0.0
    assert feats["amount_cv"] == 0.0
    assert feats["output_concentration"] == 0.0
    assert feats["equal_output_ratio"] == 0.0
    assert feats["round_amount_ratio"] == 0.0
    assert feats["fan_in_ratio"] == 0.0
    assert feats["fan_out_ratio"] == 0.0


def test_equal_outputs_ratio():
    """Mixing/CoinJoin style transactions with equal outputs must reflect in equal_output_ratio."""
    record = {
        "input_addresses": ["in1", "in2"],
        "output_addresses": ["out1", "out2", "out3", "out4", "out5"],
        # 4 outputs of exactly 0.5 BTC, 1 change output of 0.1 BTC
        "output_amounts": [0.5, 0.5, 0.5, 0.5, 0.1],
        "input_amounts": [1.1, 1.1],
        "fee": 0.1,
    }
    feats = compute_transaction_features(record)
    # Mode is 0.5 with count 4 out of 5 -> 0.8
    assert feats["equal_output_ratio"] == pytest.approx(0.8)

    graph_feats = compute_graph_features(record, feats)
    assert graph_feats["is_equal_split_structure"] == 1.0


def test_concentrated_output_and_peeling():
    """Asymmetric output splits (peeling chains) must have high HHI concentration and peeling indicator."""
    record = {
        "input_addresses": ["in1"],
        "output_addresses": ["peel_dest", "continuing_change"],
        "output_amounts": [0.1, 9.9],  # 1% peel, 99% change
        "input_amounts": [10.01],
        "fee": 0.01,
    }
    feats = compute_transaction_features(record)
    # HHI = (0.1/10)^2 + (9.9/10)^2 = 0.01^2 + 0.99^2 = 0.0001 + 0.9801 = 0.9802
    assert feats["output_concentration"] == pytest.approx(0.9802)

    graph_feats = compute_graph_features(record, feats)
    assert graph_feats["is_peeling_structure"] == 1.0
    assert graph_feats["is_consolidation_structure"] == 0.0
    assert graph_feats["is_dispersion_structure"] == 0.0


def test_fan_in_structure():
    """High input-to-output count ratio must trigger consolidation indicators."""
    record = {
        "input_addresses": [f"addr_{i}" for i in range(12)],
        "output_addresses": ["dest_1"],
        "input_amounts": [0.1] * 12,
        "output_amounts": [1.19],
        "fee": 0.01,
    }
    feats = compute_transaction_features(record)
    assert feats["input_count"] == 12.0
    assert feats["output_count"] == 1.0
    assert feats["fan_in_ratio"] == pytest.approx(12.0 / 13.0)

    graph_feats = compute_graph_features(record, feats)
    assert graph_feats["is_consolidation_structure"] == 1.0
    assert graph_feats["is_dispersion_structure"] == 0.0


def test_fan_out_structure():
    """Low input-to-output count ratio must trigger dispersion indicators."""
    record = {
        "input_addresses": ["src_1"],
        "output_addresses": [f"dest_{i}" for i in range(10)],
        "input_amounts": [1.05],
        "output_amounts": [0.1] * 10,
        "fee": 0.05,
    }
    feats = compute_transaction_features(record)
    assert feats["input_count"] == 1.0
    assert feats["output_count"] == 10.0
    assert feats["fan_out_ratio"] == pytest.approx(10.0 / 11.0)

    graph_feats = compute_graph_features(record, feats)
    assert graph_feats["is_dispersion_structure"] == 1.0
    assert graph_feats["is_consolidation_structure"] == 0.0


def test_temporal_rolling_window_correctness():
    """Validate rolling 5m, 1h, 24h count and volume windows on known timestamps."""
    tracker = TemporalTracker(baseline_threshold=5)

    # Entity 'addr_alpha' executes transactions at T=0, T=100s, T=200s, T=600s
    t0 = 1700000000.0

    # Tx 1 at T=0s, volume 1.0 BTC
    r1 = {
        "input_addresses": ["addr_alpha"],
        "output_amounts": [1.0],
        "timestamp": t0,
    }
    f1 = tracker.process_transaction(r1)
    assert f1["tx_count_5m"] == 1.0
    assert f1["tx_count_1h"] == 1.0
    assert f1["volume_5m"] == pytest.approx(1.0)
    assert f1["volume_1h"] == pytest.approx(1.0)
    assert f1["history_count"] == 0.0
    assert f1["baseline_stability"] == 0.0

    # Tx 2 at T=100s, volume 2.0 BTC (within 5m of T=0)
    r2 = {
        "input_addresses": ["addr_alpha"],
        "output_amounts": [2.0],
        "timestamp": t0 + 100.0,
    }
    f2 = tracker.process_transaction(r2)
    assert f2["tx_count_5m"] == 2.0
    assert f2["tx_count_1h"] == 2.0
    assert f2["volume_5m"] == pytest.approx(3.0)
    assert f2["history_count"] == 1.0
    assert f2["mean_interarrival"] == 100.0

    # Tx 3 at T=200s, volume 3.0 BTC (all 3 within 5m: span = 200s <= 300s)
    r3 = {
        "input_addresses": ["addr_alpha"],
        "output_amounts": [3.0],
        "timestamp": t0 + 200.0,
    }
    f3 = tracker.process_transaction(r3)
    assert f3["tx_count_5m"] == 3.0
    assert f3["volume_5m"] == pytest.approx(6.0)
    assert f3["history_count"] == 2.0
    assert f3["mean_interarrival"] == 100.0

    # Tx 4 at T=600s, volume 4.0 BTC (> 5m from T=0, 100, 200; cutoff = 600 - 300 = 300)
    r4 = {
        "input_addresses": ["addr_alpha"],
        "output_amounts": [4.0],
        "timestamp": t0 + 600.0,
    }
    f4 = tracker.process_transaction(r4)
    # Only r4 itself is in [300, 600]
    assert f4["tx_count_5m"] == 1.0
    assert f4["volume_5m"] == pytest.approx(4.0)
    # But all 4 are within 1-hour window (600s < 3600s)
    assert f4["tx_count_1h"] == 4.0
    assert f4["volume_1h"] == pytest.approx(10.0)
    assert f4["history_count"] == 3.0
    assert f4["baseline_stability"] == pytest.approx(3.0 / 5.0)


def test_no_future_data_leakage():
    """Future transactions must never alter the feature vector of an earlier transaction."""
    tx1 = {
        "txid": "tx_early",
        "timestamp": "2026-09-01T10:00:00Z",
        "src_ip": "10.0.0.1",
        "dst_ip": "10.0.0.2",
        "src_port": 5000,
        "dst_port": 8333,
        "input_addresses": ["entity_beta"],
        "output_addresses": ["dest_1"],
        "input_amounts": [5.0],
        "output_amounts": [4.9],
        "fee": 0.1,
    }
    tx2 = {
        "txid": "tx_late",
        "timestamp": "2026-09-01T10:05:00Z",
        "src_ip": "10.0.0.1",
        "dst_ip": "10.0.0.2",
        "src_port": 5001,
        "dst_port": 8333,
        "input_addresses": ["entity_beta"],
        "output_addresses": ["dest_2"],
        "input_amounts": [4.9],
        "output_amounts": [4.8],
        "fee": 0.1,
    }

    # Run pipeline on tx1 alone
    pipe_single = FeaturePipeline()
    res_single = pipe_single.extract_features([tx1])

    # Run pipeline on [tx1, tx2]
    pipe_pair = FeaturePipeline()
    res_pair = pipe_pair.extract_features([tx1, tx2])

    # The feature vector of tx1 must be 100% identical in both runs
    assert res_single[0] == res_pair[0]


def test_cold_start_handling():
    """Cold-start entity must yield explicit stability = 0.0 and neutral deviation."""
    record = {
        "txid": "tx_cold_01",
        "timestamp": "2026-09-01T00:00:00Z",
        "src_ip": "1.1.1.1",
        "dst_ip": "2.2.2.2",
        "src_port": 4000,
        "dst_port": 8333,
        "input_addresses": ["fresh_entity_xyz"],
        "output_addresses": ["dest_xyz"],
        "input_amounts": [10.0],
        "output_amounts": [9.9],
        "fee": 0.1,
    }
    pipe = FeaturePipeline()
    features = pipe.extract_features([record])[0]

    assert features["history_count"] == 0.0
    assert features["baseline_stability"] == 0.0
    assert features["entity_age_seconds"] == 0.0
    assert features["baseline_deviation"] == 0.0
    assert features["activity_change"] == 1.0


def test_ip_reuse_and_network_metrics():
    """Verify IP reuse count and unique addresses per IP as transactions accumulate."""
    tracker = NetworkTracker()

    # Tx 1 from IP 192.168.1.100 with Address A
    r1 = {
        "src_ip": "192.168.1.100",
        "dst_ip": "10.0.0.1",
        "src_port": 10000,
        "dst_port": 8333,
        "input_addresses": ["addr_A"],
    }
    f1 = tracker.process_transaction(r1)
    assert f1["ip_reuse_count"] == 0.0
    assert f1["unique_addresses_per_ip"] == 1.0
    assert f1["endpoint_recurrence"] == 1.0

    # Tx 2 from same IP with different Address B
    r2 = {
        "src_ip": "192.168.1.100",
        "dst_ip": "10.0.0.1",
        "src_port": 10001,
        "dst_port": 8333,
        "input_addresses": ["addr_B"],
    }
    f2 = tracker.process_transaction(r2)
    assert f2["ip_reuse_count"] == 1.0
    assert f2["unique_addresses_per_ip"] == 2.0
    assert f2["endpoint_recurrence"] == 2.0

    # Tx 3 from new IP 192.168.1.101 for Address A
    r3 = {
        "src_ip": "192.168.1.101",
        "dst_ip": "10.0.0.1",
        "src_port": 10002,
        "dst_port": 8333,
        "input_addresses": ["addr_A"],
    }
    f3 = tracker.process_transaction(r3)
    assert f3["ip_reuse_count"] == 0.0
    assert f3["unique_ips"] == 2.0


def test_asn_concentration():
    """ASN concentration must be 1.0 when on a single ASN and decrease when multi-homed."""
    tracker = NetworkTracker()

    r1 = {"input_addresses": ["entity_asn_test"], "asn": "AS15169"}
    f1 = tracker.process_transaction(r1)
    assert f1["unique_asns"] == 1.0
    assert f1["asn_concentration"] == 1.0

    r2 = {"input_addresses": ["entity_asn_test"], "asn": "AS24940"}
    f2 = tracker.process_transaction(r2)
    assert f2["unique_asns"] == 2.0
    # 2 txs across 2 ASNs -> HHI = (0.5)^2 + (0.5)^2 = 0.5
    assert f2["asn_concentration"] == pytest.approx(0.5)


def test_historical_median_and_mad():
    """Entity tracker must compute exact median, MAD, and robust baseline deviation."""
    tracker = EntityTracker()
    entity = "entity_robust_stats"

    # Historical amounts: 10, 11, 12, 13, 100 (sorted: [10, 11, 12, 13, 100], median=12.0)
    # Deviations from 12.0: [2, 1, 0, 1, 88], sorted deviations: [0, 1, 1, 2, 88], MAD = 1.0
    hist_amts = [10.0, 12.0, 11.0, 13.0, 100.0]
    t0 = 1700000000.0

    for i, amt in enumerate(hist_amts):
        tracker.process_transaction({
            "input_addresses": [entity],
            "output_amounts": [amt],
            "timestamp": t0 + i * 100,
        })

    # Now a 6th transaction arrives with amount = 15.0
    r_new = {
        "input_addresses": [entity],
        "output_amounts": [15.0],
        "timestamp": t0 + 600,
    }
    feats = tracker.process_transaction(r_new)

    assert feats["historical_median_amount"] == pytest.approx(12.0)
    assert feats["historical_MAD_amount"] == pytest.approx(1.0)
    # Expected deviation: |15.0 - 12.0| / (1.4826 * 1.0) = 3.0 / 1.4826 ≈ 2.02347
    expected_dev = 3.0 / (1.4826 * 1.0)
    assert feats["baseline_deviation"] == pytest.approx(expected_dev, abs=1e-3)


def test_deterministic_output():
    """Running the FeaturePipeline twice over identical records must produce identical results."""
    records = [
        {
            "txid": f"tx_det_{i}",
            "timestamp": f"2026-09-01T12:{i:02d}:00Z",
            "src_ip": "1.2.3.4",
            "dst_ip": "5.6.7.8",
            "src_port": 5000 + i,
            "dst_port": 8333,
            "input_addresses": ["addr_det_1"],
            "output_addresses": [f"addr_out_{i}"],
            "input_amounts": [1.0],
            "output_amounts": [0.99],
            "fee": 0.01,
            "script_type": "p2wpkh",
            "geo_country": "US",
            "asn": "AS15169",
        }
        for i in range(15)
    ]

    p1 = FeaturePipeline()
    p2 = FeaturePipeline()

    res1 = p1.extract_features(records)
    res2 = p2.extract_features(records)

    assert res1 == res2


def test_feature_schema_completeness():
    """Every generated feature record must contain all fields from FEATURE_REGISTRY without NaN/Inf."""
    record = {
        "event_id": "evt_chk_1",
        "txid": "tx_chk_1",
        "timestamp": "2026-09-01T12:00:00Z",
        "src_ip": "192.168.1.1",
        "dst_ip": "10.0.0.1",
        "src_port": 8000,
        "dst_port": 8333,
        "input_addresses": ["addr_1"],
        "output_addresses": ["addr_2"],
        "input_amounts": [2.0],
        "output_amounts": [1.99],
        "fee": 0.01,
        "script_type": "p2wpkh",
        "geo_country": "DE",
        "asn": "AS24940",
    }
    pipe = FeaturePipeline()
    res = pipe.extract_features([record])[0]

    assert res["txid"] == "tx_chk_1"
    assert res["timestamp"] == "2026-09-01T12:00:00Z"
    assert res["feature_schema_version"] == FEATURE_SCHEMA_VERSION

    for feat_name in FEATURE_REGISTRY.keys():
        assert feat_name in res, f"Missing feature in output: {feat_name}"
        val = res[feat_name]
        assert isinstance(val, (int, float)), f"Feature {feat_name} is not numeric: {type(val)}"
        assert not math.isnan(val), f"Feature {feat_name} is NaN"
        assert not math.isinf(val), f"Feature {feat_name} is Infinite"


def test_labels_csv_is_never_accessed():
    """The feature engine must never import or read labels.csv."""
    import sys

    # Assert no module in src.features imports or references labels.csv
    features_dir = os.path.join("src", "features")
    for fname in os.listdir(features_dir):
        if fname.endswith(".py"):
            with open(os.path.join(features_dir, fname), "r", encoding="utf-8") as f:
                content = f.read()
                assert "labels.csv" not in content, f"Forbidden reference to labels.csv in {fname}"


def test_data_quality_features():
    """Data quality features must properly score completeness and validity."""
    complete_rec = {
        "event_id": "evt_1",
        "txid": "tx_1",
        "timestamp": "2026-09-01T12:00:00Z",
        "src_ip": "1.1.1.1",
        "dst_ip": "2.2.2.2",
        "src_port": 5000,
        "dst_port": 8333,
        "input_addresses": ["addr1"],
        "output_addresses": ["addr2"],
        "input_amounts": [1.0],
        "output_amounts": [0.99],
        "fee": 0.01,
        "script_type": "p2pkh",
        "geo_country": "US",
        "asn": "AS15169",
    }
    q = compute_data_quality_features(complete_rec)
    assert q["field_completeness"] == 1.0
    assert q["timestamp_valid"] == 1.0
    assert q["network_metadata_completeness"] == 1.0
    assert q["amount_data_completeness"] == 1.0

    # Incomplete record
    incomplete_rec = {
        "txid": "tx_2",
        "timestamp": "invalid_date",
        "input_amounts": [-5.0],
    }
    q_bad = compute_data_quality_features(incomplete_rec)
    assert q_bad["field_completeness"] < 0.5
    assert q_bad["timestamp_valid"] == 0.0
    assert q_bad["network_metadata_completeness"] == 0.0
    assert q_bad["amount_data_completeness"] == 0.0
