"""
SANKET Detection Engine: Comprehensive Test Suite
Tests detector semantics, score bounds, evidence structure, pipeline integration,
edge cases, and Isolation Forest determinism.
"""
import math
import os
import time
from datetime import datetime, timezone, timedelta
from typing import Any, Dict, List

import pytest

from src.features.pipeline import (
    FeaturePipeline,
    FEATURE_REGISTRY,
    FEATURE_SCHEMA_VERSION,
)
from src.detectors.evidence import (
    DetectorResult,
    EvidenceItem,
    clamp_01,
    linear_scale,
    calculate_severity,
)
from src.detectors.structural import (
    detect_fan_in,
    detect_fan_out,
    detect_equal_output,
    detect_peeling_like,
    detect_mixing_like,
)
from src.detectors.temporal import (
    detect_temporal_burst,
    detect_rapid_hop,
    detect_baseline_deviation,
)
from src.detectors.network import (
    detect_ip_reuse,
    detect_network_cluster,
    detect_endpoint_recurrence,
)
from src.detectors.anomaly import IsolationForestDetector, _get_numeric_feature_names
from src.detectors.pipeline import DetectorPipeline, DetectionPipelineResult


# ──────────────────────────────────────────────────────────────────────
# Helper: build a synthetic feature row with specified overrides
# ──────────────────────────────────────────────────────────────────────
def _make_feature_row(**overrides) -> Dict[str, Any]:
    """Build a baseline feature row with all features at neutral values, then apply overrides."""
    base = {
        "txid": "tx_test",
        "timestamp": "2026-09-01T12:00:00Z",
        "feature_schema_version": FEATURE_SCHEMA_VERSION,
        # Transaction
        "input_count": 1.0,
        "output_count": 2.0,
        "total_input_amount": 1.0,
        "total_output_amount": 0.99,
        "fee": 0.01,
        "fee_ratio": 0.01,
        "input_output_count_ratio": 0.5,
        "input_output_amount_ratio": 1.01,
        "amount_mean": 0.495,
        "amount_std": 0.01,
        "amount_cv": 0.02,
        "output_concentration": 0.5,
        "equal_output_ratio": 0.5,
        "round_amount_ratio": 0.0,
        "fan_in_ratio": 0.33,
        "fan_out_ratio": 0.67,
        # Temporal
        "tx_count_5m": 1.0,
        "tx_count_1h": 1.0,
        "tx_count_24h": 1.0,
        "volume_5m": 1.0,
        "volume_1h": 1.0,
        "volume_24h": 1.0,
        "mean_interarrival": 0.0,
        "median_interarrival": 0.0,
        "burst_score": 1.0,
        "velocity_ratio": 1.0,
        "history_count": 0.0,
        "baseline_stability": 0.0,
        # Network
        "unique_ips": 1.0,
        "unique_addresses_per_ip": 1.0,
        "ip_reuse_count": 0.0,
        "unique_asns": 1.0,
        "asn_concentration": 1.0,
        "unique_countries": 1.0,
        "country_count": 1.0,
        "src_port_frequency": 1.0,
        "dst_port_frequency": 1.0,
        "endpoint_recurrence": 1.0,
        # Entity
        "entity_tx_count": 1.0,
        "entity_volume": 1.0,
        "entity_age_seconds": 0.0,
        "unique_counterparties": 1.0,
        "historical_median_amount": 0.0,
        "historical_MAD_amount": 0.0,
        "baseline_deviation": 0.0,
        "activity_change": 1.0,
        # Graph
        "fan_in_degree": 1.0,
        "fan_out_degree": 2.0,
        "bipartite_density": 1.5,
        "address_reuse_in_tx": 0.0,
        "is_peeling_structure": 0.0,
        "is_consolidation_structure": 0.0,
        "is_dispersion_structure": 0.0,
        "is_equal_split_structure": 0.0,
        # Data Quality
        "field_completeness": 1.0,
        "timestamp_valid": 1.0,
        "network_metadata_completeness": 1.0,
        "amount_data_completeness": 1.0,
    }
    base.update(overrides)
    return base


def _make_canonical_record(**overrides) -> Dict[str, Any]:
    """Build a full canonical transaction record for pipeline tests."""
    base = {
        "event_id": "evt_001",
        "txid": "tx_001",
        "timestamp": "2026-09-01T12:00:00Z",
        "src_ip": "10.0.0.1",
        "dst_ip": "10.0.0.2",
        "src_port": 5000,
        "dst_port": 8333,
        "input_addresses": ["addr_in_1"],
        "output_addresses": ["addr_out_1", "addr_out_2"],
        "input_amounts": [1.0],
        "output_amounts": [0.6, 0.39],
        "fee": 0.01,
        "script_type": "p2wpkh",
        "geo_country": "US",
        "asn": "AS15169",
        "source_batch_id": "batch_001",
    }
    base.update(overrides)
    return base


# ══════════════════════════════════════════════════════════════════════
# 1. FAN-IN DETECTOR
# ══════════════════════════════════════════════════════════════════════

class TestFanInDetector:
    def test_triggers_on_high_input_count(self):
        """Fan-in detector must trigger for consolidation pattern (many inputs, few outputs)."""
        row = _make_feature_row(
            input_count=15.0,
            output_count=1.0,
            fan_in_ratio=15.0 / 16.0,  # ~0.9375
            is_consolidation_structure=1.0,
        )
        result = detect_fan_in(row)
        assert result.triggered is True
        assert result.score >= 0.50
        assert result.detector_name == "fan_in"
        assert any(e.feature == "input_count" for e in result.evidence)

    def test_does_not_trigger_on_normal_tx(self):
        """Normal 1-input 2-output transaction should not trigger fan-in."""
        row = _make_feature_row(
            input_count=1.0,
            output_count=2.0,
            fan_in_ratio=1.0 / 3.0,
            is_consolidation_structure=0.0,
        )
        result = detect_fan_in(row)
        assert result.triggered is False
        assert result.score < 0.50

    def test_score_in_bounds(self):
        """Fan-in score must always be in [0, 1]."""
        for ic in [0, 1, 5, 50, 200]:
            row = _make_feature_row(input_count=float(ic), fan_in_ratio=0.99)
            result = detect_fan_in(row)
            assert 0.0 <= result.score <= 1.0


# ══════════════════════════════════════════════════════════════════════
# 2. FAN-OUT DETECTOR
# ══════════════════════════════════════════════════════════════════════

class TestFanOutDetector:
    def test_triggers_on_high_output_count(self):
        """Fan-out detector must trigger for dispersion pattern (1 input, many outputs)."""
        row = _make_feature_row(
            input_count=1.0,
            output_count=20.0,
            fan_out_ratio=20.0 / 21.0,
            is_dispersion_structure=1.0,
            round_amount_ratio=0.8,
        )
        result = detect_fan_out(row)
        assert result.triggered is True
        assert result.score >= 0.50
        assert result.detector_name == "fan_out"
        assert any(e.feature == "output_count" for e in result.evidence)

    def test_does_not_trigger_on_normal_tx(self):
        """Normal 1-input 2-output transaction should not trigger fan-out."""
        row = _make_feature_row(
            input_count=1.0,
            output_count=2.0,
            fan_out_ratio=2.0 / 3.0,
            is_dispersion_structure=0.0,
        )
        result = detect_fan_out(row)
        assert result.triggered is False

    def test_score_in_bounds(self):
        for oc in [0, 1, 5, 50, 200]:
            row = _make_feature_row(output_count=float(oc), fan_out_ratio=0.99)
            result = detect_fan_out(row)
            assert 0.0 <= result.score <= 1.0


# ══════════════════════════════════════════════════════════════════════
# 3. EQUAL-OUTPUT DETECTOR
# ══════════════════════════════════════════════════════════════════════

class TestEqualOutputDetector:
    def test_triggers_on_equal_outputs(self):
        """Transactions with many equal-denomination outputs must trigger."""
        row = _make_feature_row(
            equal_output_ratio=0.90,
            output_count=8.0,
            is_equal_split_structure=1.0,
            amount_cv=0.05,
        )
        result = detect_equal_output(row)
        assert result.triggered is True
        assert result.score >= 0.50
        assert result.detector_name == "equal_output"

    def test_requires_minimum_outputs(self):
        """Equal-output detector must produce 0 score when output_count < 3."""
        row = _make_feature_row(
            equal_output_ratio=1.0,
            output_count=2.0,
            is_equal_split_structure=0.0,
        )
        result = detect_equal_output(row)
        assert result.score == 0.0
        assert result.triggered is False

    def test_score_in_bounds(self):
        for ratio in [0.0, 0.3, 0.5, 0.7, 1.0]:
            row = _make_feature_row(equal_output_ratio=ratio, output_count=5.0)
            result = detect_equal_output(row)
            assert 0.0 <= result.score <= 1.0


# ══════════════════════════════════════════════════════════════════════
# 4. PEELING-LIKE DETECTOR
# ══════════════════════════════════════════════════════════════════════

class TestPeelingLikeDetector:
    def test_triggers_on_peeling_scenario(self):
        """Classic peeling chain: 1 input, 2 outputs, high concentration, peeling structure."""
        row = _make_feature_row(
            input_count=1.0,
            output_count=2.0,
            output_concentration=0.92,
            is_peeling_structure=1.0,
        )
        result = detect_peeling_like(row)
        assert result.triggered is True
        assert result.score >= 0.50
        assert result.detector_name == "peeling_like"
        assert any(e.feature == "output_concentration" for e in result.evidence)

    def test_does_not_trigger_on_multi_output(self):
        """Peeling detector must not trigger with > 2 outputs."""
        row = _make_feature_row(
            input_count=1.0,
            output_count=5.0,
            output_concentration=0.95,
            is_peeling_structure=0.0,
        )
        result = detect_peeling_like(row)
        assert result.score == 0.0
        assert result.triggered is False

    def test_works_with_two_inputs(self):
        """Peeling detector should also work with 2 inputs (2-in-2-out peeling)."""
        row = _make_feature_row(
            input_count=2.0,
            output_count=2.0,
            output_concentration=0.85,
            is_peeling_structure=1.0,
        )
        result = detect_peeling_like(row)
        assert result.score > 0.0


# ══════════════════════════════════════════════════════════════════════
# 5. MIXING-LIKE DETECTOR
# ══════════════════════════════════════════════════════════════════════

class TestMixingLikeDetector:
    def test_triggers_on_mixing_scenario(self):
        """CoinJoin-like structure: 5 inputs, 5 outputs, high equal ratio."""
        row = _make_feature_row(
            input_count=5.0,
            output_count=8.0,
            equal_output_ratio=0.85,
            is_equal_split_structure=1.0,
            bipartite_density=0.5,
        )
        result = detect_mixing_like(row)
        assert result.triggered is True
        assert result.score >= 0.50
        assert result.detector_name == "mixing_like"
        assert any(e.feature == "equal_output_ratio" for e in result.evidence)

    def test_requires_multi_party(self):
        """Mixing detector must not trigger with < 3 inputs or outputs."""
        row = _make_feature_row(
            input_count=1.0,
            output_count=10.0,
            equal_output_ratio=0.90,
        )
        result = detect_mixing_like(row)
        assert result.score == 0.0
        assert result.triggered is False

    def test_score_in_bounds(self):
        for ic, oc in [(3, 3), (5, 5), (10, 10), (20, 20)]:
            row = _make_feature_row(input_count=float(ic), output_count=float(oc), equal_output_ratio=0.8)
            result = detect_mixing_like(row)
            assert 0.0 <= result.score <= 1.0


# ══════════════════════════════════════════════════════════════════════
# 6. TEMPORAL BURST DETECTOR
# ══════════════════════════════════════════════════════════════════════

class TestBurstDetector:
    def test_triggers_on_burst(self):
        """Burst detector must trigger when burst_score is significantly above baseline."""
        row = _make_feature_row(
            burst_score=5.0,
            velocity_ratio=4.0,
            tx_count_5m=8.0,
            tx_count_1h=10.0,
        )
        result = detect_temporal_burst(row)
        assert result.triggered is True
        assert result.score >= 0.50
        assert result.detector_name == "temporal_burst"
        assert any(e.feature == "burst_score" for e in result.evidence)

    def test_neutral_on_cold_start(self):
        """First transaction (tx_count_1h = 1) should not trigger burst."""
        row = _make_feature_row(
            burst_score=1.0,
            velocity_ratio=1.0,
            tx_count_5m=1.0,
            tx_count_1h=1.0,
        )
        result = detect_temporal_burst(row)
        assert result.score == 0.0
        assert result.triggered is False

    def test_score_in_bounds(self):
        for bs in [0.0, 1.0, 3.0, 10.0, 100.0]:
            row = _make_feature_row(burst_score=bs, tx_count_1h=5.0)
            result = detect_temporal_burst(row)
            assert 0.0 <= result.score <= 1.0


# ══════════════════════════════════════════════════════════════════════
# 7. BASELINE DEVIATION DETECTOR
# ══════════════════════════════════════════════════════════════════════

class TestBaselineDeviationDetector:
    def test_triggers_on_deviation(self):
        """Baseline deviation detector must trigger when deviation is high with established baseline."""
        row = _make_feature_row(
            baseline_deviation=7.0,
            activity_change=5.0,
            baseline_stability=0.90,
            historical_median_amount=1.0,
            historical_MAD_amount=0.1,
        )
        result = detect_baseline_deviation(row)
        assert result.triggered is True
        assert result.score >= 0.50
        assert result.detector_name == "baseline_deviation"
        assert any(e.feature == "baseline_deviation" for e in result.evidence)

    def test_suppressed_on_cold_start(self):
        """Baseline deviation must produce 0 score when baseline_stability < 0.20."""
        row = _make_feature_row(
            baseline_deviation=10.0,
            activity_change=5.0,
            baseline_stability=0.10,
        )
        result = detect_baseline_deviation(row)
        assert result.score == 0.0
        assert result.triggered is False


# ══════════════════════════════════════════════════════════════════════
# 8. NETWORK DETECTORS
# ══════════════════════════════════════════════════════════════════════

class TestIPReuseDetector:
    def test_triggers_on_high_reuse(self):
        """IP reuse detector must trigger when ip_reuse_count is high."""
        row = _make_feature_row(
            ip_reuse_count=15.0,
            unique_addresses_per_ip=5.0,
        )
        result = detect_ip_reuse(row)
        assert result.triggered is True
        assert result.score >= 0.50
        assert result.detector_name == "ip_reuse"
        assert any(e.feature == "ip_reuse_count" for e in result.evidence)

    def test_does_not_trigger_on_first_observation(self):
        """First observation of an IP should not trigger ip_reuse."""
        row = _make_feature_row(
            ip_reuse_count=0.0,
            unique_addresses_per_ip=1.0,
        )
        result = detect_ip_reuse(row)
        assert result.triggered is False
        assert result.score < 0.50


class TestNetworkClusterDetector:
    def test_score_in_bounds(self):
        for conc in [0.0, 0.5, 0.8, 0.95, 1.0]:
            row = _make_feature_row(asn_concentration=conc)
            result = detect_network_cluster(row)
            assert 0.0 <= result.score <= 1.0


class TestEndpointRecurrenceDetector:
    def test_triggers_on_recurrence(self):
        """Endpoint recurrence detector triggers with high recurrence count."""
        row = _make_feature_row(
            endpoint_recurrence=12.0,
            ip_reuse_count=10.0,
        )
        result = detect_endpoint_recurrence(row)
        assert result.triggered is True
        assert result.score >= 0.50
        assert result.detector_name == "endpoint_recurrence"
        assert any(e.feature == "endpoint_recurrence" for e in result.evidence)


# ══════════════════════════════════════════════════════════════════════
# 9. ALL SCORES IN [0, 1]
# ══════════════════════════════════════════════════════════════════════

class TestScoreBounds:
    """Every detector must produce scores strictly in [0.0, 1.0] for all input values."""

    ALL_DETECTORS = [
        detect_fan_in, detect_fan_out, detect_equal_output,
        detect_peeling_like, detect_mixing_like,
        detect_temporal_burst, detect_rapid_hop, detect_baseline_deviation,
        detect_ip_reuse, detect_network_cluster, detect_endpoint_recurrence,
    ]

    def test_all_scores_bounded_on_zero_row(self):
        """Zero-valued feature row must not produce out-of-bounds scores."""
        zero_row = {k: 0.0 for k in _make_feature_row()}
        zero_row["txid"] = "tx_zero"
        zero_row["timestamp"] = "2026-01-01T00:00:00Z"
        for det in self.ALL_DETECTORS:
            result = det(zero_row)
            assert 0.0 <= result.score <= 1.0, f"{det.__name__} out of bounds on zero row"

    def test_all_scores_bounded_on_extreme_row(self):
        """Extreme feature values must not produce out-of-bounds scores."""
        extreme_row = _make_feature_row(
            input_count=1000.0,
            output_count=1000.0,
            fan_in_ratio=0.99,
            fan_out_ratio=0.99,
            equal_output_ratio=1.0,
            output_concentration=1.0,
            is_consolidation_structure=1.0,
            is_dispersion_structure=1.0,
            is_peeling_structure=1.0,
            is_equal_split_structure=1.0,
            burst_score=100.0,
            velocity_ratio=100.0,
            tx_count_5m=100.0,
            tx_count_1h=100.0,
            baseline_deviation=50.0,
            activity_change=50.0,
            baseline_stability=1.0,
            ip_reuse_count=1000.0,
            unique_addresses_per_ip=100.0,
            endpoint_recurrence=500.0,
            asn_concentration=1.0,
            src_port_frequency=500.0,
            dst_port_frequency=500.0,
        )
        for det in self.ALL_DETECTORS:
            result = det(extreme_row)
            assert 0.0 <= result.score <= 1.0, f"{det.__name__} out of bounds on extreme row"


# ══════════════════════════════════════════════════════════════════════
# 10. MISSING / ZERO VALUES DO NOT CRASH
# ══════════════════════════════════════════════════════════════════════

class TestMissingValues:
    def test_empty_dict_does_not_crash(self):
        """Completely empty feature row must not crash any detector."""
        for det in TestScoreBounds.ALL_DETECTORS:
            result = det({})
            assert isinstance(result, DetectorResult)
            assert 0.0 <= result.score <= 1.0

    def test_none_values_do_not_crash(self):
        """None feature values must not crash any detector."""
        row = {k: None for k in _make_feature_row()}
        for det in TestScoreBounds.ALL_DETECTORS:
            result = det(row)
            assert isinstance(result, DetectorResult)
            assert 0.0 <= result.score <= 1.0

    def test_nan_in_linear_scale(self):
        """linear_scale must return 0.0 for NaN input."""
        assert linear_scale(float("nan"), 0.0, 1.0) == 0.0

    def test_clamp_handles_nan_none(self):
        assert clamp_01(float("nan")) == 0.0
        assert clamp_01(None) == 0.0
        assert clamp_01(-0.5) == 0.0
        assert clamp_01(1.5) == 1.0
        assert clamp_01(0.5) == 0.5


# ══════════════════════════════════════════════════════════════════════
# 11. EMPTY DATASET DOES NOT CRASH
# ══════════════════════════════════════════════════════════════════════

class TestEmptyDataset:
    def test_pipeline_on_empty_list(self):
        """Detector pipeline on empty list must return empty result without crashing."""
        pipeline = DetectorPipeline()
        result = pipeline.run([])
        assert isinstance(result, DetectionPipelineResult)
        assert len(result.records) == 0
        assert len(result.evidence) == 0

    def test_iforest_on_empty_list(self):
        """Isolation Forest fit on empty list must not crash."""
        iforest = IsolationForestDetector()
        iforest.fit([])
        results = iforest.predict([])
        assert len(results) == 0

    def test_iforest_predict_on_unfitted(self):
        """Predicting without fitting should return zero-score results."""
        iforest = IsolationForestDetector()
        row = _make_feature_row()
        results = iforest.predict([row])
        assert len(results) == 1
        assert results[0].score == 0.0
        assert results[0].triggered is False


# ══════════════════════════════════════════════════════════════════════
# 12. ISOLATION FOREST DETERMINISM
# ══════════════════════════════════════════════════════════════════════

class TestIsolationForestDeterminism:
    @staticmethod
    def _make_training_set(n: int = 50) -> List[Dict[str, Any]]:
        """Create a synthetic feature dataset with deterministic variation."""
        import random
        rng = random.Random(12345)
        rows = []
        for i in range(n):
            row = _make_feature_row(
                txid=f"tx_iforest_{i}",
                input_count=rng.uniform(1.0, 10.0),
                output_count=rng.uniform(1.0, 10.0),
                total_input_amount=rng.uniform(0.01, 100.0),
                total_output_amount=rng.uniform(0.01, 100.0),
                fee=rng.uniform(0.0001, 0.1),
                fan_in_ratio=rng.uniform(0.0, 1.0),
                fan_out_ratio=rng.uniform(0.0, 1.0),
                burst_score=rng.uniform(0.5, 5.0),
                tx_count_5m=rng.uniform(1.0, 20.0),
                ip_reuse_count=rng.uniform(0.0, 50.0),
                endpoint_recurrence=rng.uniform(1.0, 30.0),
            )
            rows.append(row)
        return rows

    def test_deterministic_scores_same_seed(self):
        """Two IsolationForest instances with same seed must produce identical scores."""
        rows = self._make_training_set()

        det1 = IsolationForestDetector(random_state=42)
        det1.fit(rows)
        res1 = det1.predict(rows)

        det2 = IsolationForestDetector(random_state=42)
        det2.fit(rows)
        res2 = det2.predict(rows)

        for r1, r2 in zip(res1, res2):
            assert r1.score == pytest.approx(r2.score, abs=1e-10)

    def test_different_seed_different_scores(self):
        """Different random_state should generally produce different scores."""
        rows = self._make_training_set()

        det1 = IsolationForestDetector(random_state=42)
        det1.fit(rows)
        res1 = det1.predict(rows)

        det2 = IsolationForestDetector(random_state=999)
        det2.fit(rows)
        res2 = det2.predict(rows)

        # At least some scores should differ
        diffs = sum(1 for r1, r2 in zip(res1, res2) if abs(r1.score - r2.score) > 0.001)
        assert diffs > 0, "Different seeds should produce at least some different scores"

    def test_scores_in_range(self):
        """All Isolation Forest scores must be in [0, 1]."""
        rows = self._make_training_set()
        det = IsolationForestDetector(random_state=42)
        det.fit(rows)
        results = det.predict(rows)
        for r in results:
            assert 0.0 <= r.score <= 1.0, f"IF score {r.score} out of bounds"


# ══════════════════════════════════════════════════════════════════════
# 13. ISOLATION FOREST DOES NOT READ LABELS.CSV
# ══════════════════════════════════════════════════════════════════════

class TestIsolationForestNoLabels:
    def test_no_labels_csv_reference_in_anomaly_module(self):
        """The anomaly detector module must never reference labels.csv."""
        anomaly_path = os.path.join("src", "detectors", "anomaly.py")
        with open(anomaly_path, "r", encoding="utf-8") as f:
            content = f.read()
        assert "labels.csv" not in content, "anomaly.py must not reference labels.csv"
        # Ensure no import or open() call for label files
        for line in content.splitlines():
            stripped = line.strip()
            if stripped.startswith("#") or stripped.startswith('"""') or stripped.startswith("'"):
                continue
            assert "labels.csv" not in stripped, f"Code line references labels.csv: {stripped}"

    def test_no_labels_in_feature_names(self):
        """Feature names used by Isolation Forest must not contain 'label' related columns."""
        names = _get_numeric_feature_names()
        for name in names:
            assert "label" not in name.lower(), f"Feature name '{name}' looks like a label column"


# ══════════════════════════════════════════════════════════════════════
# 14. FEATURE SCHEMA IS RECORDED
# ══════════════════════════════════════════════════════════════════════

class TestFeatureSchemaRecorded:
    def test_metadata_contains_schema_version(self):
        """IsolationForest metadata must record the feature schema version."""
        rows = TestIsolationForestDeterminism._make_training_set(10)
        det = IsolationForestDetector(random_state=42)
        det.fit(rows)
        meta = det.metadata
        assert meta is not None
        assert meta.feature_schema_version == FEATURE_SCHEMA_VERSION

    def test_metadata_contains_feature_names(self):
        """IsolationForest metadata must list all feature names used."""
        rows = TestIsolationForestDeterminism._make_training_set(10)
        det = IsolationForestDetector(random_state=42)
        det.fit(rows)
        meta = det.metadata
        assert len(meta.feature_names) > 0
        # All feature names should be from the FEATURE_REGISTRY
        for name in meta.feature_names:
            assert name in FEATURE_REGISTRY, f"Feature {name} not in FEATURE_REGISTRY"

    def test_metadata_contains_training_info(self):
        """IsolationForest metadata must record training row count, seed, and timestamp."""
        rows = TestIsolationForestDeterminism._make_training_set(25)
        det = IsolationForestDetector(random_state=42)
        det.fit(rows)
        meta = det.metadata
        assert meta.training_row_count == 25
        assert meta.random_seed == 42
        assert len(meta.training_timestamp) > 0

    def test_metadata_to_dict(self):
        """Metadata must serialize to a dictionary with all required fields."""
        rows = TestIsolationForestDeterminism._make_training_set(5)
        det = IsolationForestDetector(random_state=42)
        det.fit(rows)
        d = det.metadata.to_dict()
        assert "model_version" in d
        assert "feature_schema_version" in d
        assert "feature_names" in d
        assert "random_seed" in d
        assert "training_row_count" in d
        assert "training_timestamp" in d
        assert "score_calibration" in d


# ══════════════════════════════════════════════════════════════════════
# 15. EVIDENCE CONTAINS ACTUAL FEATURE NAMES AND VALUES
# ══════════════════════════════════════════════════════════════════════

class TestEvidenceContent:
    def test_evidence_has_feature_names(self):
        """Evidence items must contain actual feature names from the registry."""
        row = _make_feature_row(
            input_count=20.0,
            fan_in_ratio=0.90,
            is_consolidation_structure=1.0,
        )
        result = detect_fan_in(row)
        assert len(result.evidence) > 0
        for ev in result.evidence:
            assert isinstance(ev.feature, str)
            assert len(ev.feature) > 0
            # feature name should be a known feature
            assert ev.feature in FEATURE_REGISTRY or ev.feature in result.feature_values

    def test_evidence_has_numeric_values(self):
        """Evidence values must be numeric and match the feature_values dict."""
        row = _make_feature_row(
            input_count=20.0,
            fan_in_ratio=0.90,
            is_consolidation_structure=1.0,
        )
        result = detect_fan_in(row)
        for ev in result.evidence:
            assert isinstance(ev.value, (int, float))
            assert not math.isnan(ev.value)

    def test_evidence_has_reason_strings(self):
        """Every evidence item must have a non-empty reason string."""
        row = _make_feature_row(
            burst_score=5.0,
            velocity_ratio=4.0,
            tx_count_5m=8.0,
            tx_count_1h=10.0,
        )
        result = detect_temporal_burst(row)
        for ev in result.evidence:
            assert isinstance(ev.reason, str)
            assert len(ev.reason) > 0

    def test_to_dict_serialization(self):
        """DetectorResult.to_dict() must produce a well-formed dictionary."""
        row = _make_feature_row(
            ip_reuse_count=15.0,
            unique_addresses_per_ip=5.0,
        )
        result = detect_ip_reuse(row)
        d = result.to_dict()
        assert "detector_name" in d
        assert "score" in d
        assert "triggered" in d
        assert "severity" in d
        assert "evidence" in d
        assert "feature_values" in d
        assert isinstance(d["evidence"], list)
        assert isinstance(d["feature_values"], dict)

    def test_severity_values(self):
        """Severity must be one of NONE, LOW, MEDIUM, HIGH."""
        valid = {"NONE", "LOW", "MEDIUM", "HIGH"}
        assert calculate_severity(0.0, False) in valid
        assert calculate_severity(0.3, True) in valid
        assert calculate_severity(0.5, True) in valid
        assert calculate_severity(0.8, True) in valid
        assert calculate_severity(1.0, True) in valid


# ══════════════════════════════════════════════════════════════════════
# 16. PIPELINE PRODUCES ONE DETECTION RECORD PER TRANSACTION
# ══════════════════════════════════════════════════════════════════════

class TestDetectorPipeline:
    @staticmethod
    def _make_feature_set(n: int = 10) -> List[Dict[str, Any]]:
        """Generate n feature rows from the FeaturePipeline using synthetic canonical records."""
        records = []
        base_time = datetime(2026, 9, 1, 12, 0, 0, tzinfo=timezone.utc)
        for i in range(n):
            records.append(_make_canonical_record(
                event_id=f"evt_{i:04d}",
                txid=f"tx_{i:04d}",
                timestamp=(base_time + timedelta(seconds=i * 60)).isoformat(),
                src_port=5000 + i,
                input_addresses=[f"addr_in_{i % 3}"],
                output_addresses=[f"addr_out_{i}", f"addr_change_{i}"],
                input_amounts=[1.0 + i * 0.1],
                output_amounts=[0.6 + i * 0.05, 0.39 + i * 0.05],
                fee=0.01,
            ))
        pipe = FeaturePipeline()
        return pipe.extract_features(records)

    def test_one_record_per_transaction(self):
        """Pipeline must produce exactly one detection record per input transaction."""
        features = self._make_feature_set(15)
        pipeline = DetectorPipeline()
        result = pipeline.run(features)
        assert len(result.records) == 15
        assert len(result.evidence) == 15

    def test_records_contain_required_fields(self):
        """Each detection record must contain all required category scores and trigger flags."""
        features = self._make_feature_set(5)
        pipeline = DetectorPipeline()
        result = pipeline.run(features)
        for rec in result.records:
            d = rec.to_dict()
            assert "txid" in d
            assert "timestamp" in d
            assert "structural_score" in d
            assert "temporal_score" in d
            assert "network_score" in d
            assert "ml_anomaly_score" in d
            assert "fan_in_triggered" in d
            assert "fan_out_triggered" in d
            assert "equal_output_triggered" in d
            assert "peeling_like_triggered" in d
            assert "mixing_like_triggered" in d
            assert "temporal_burst_triggered" in d
            assert "rapid_hop_triggered" in d
            assert "baseline_deviation_triggered" in d
            assert "ip_reuse_triggered" in d
            assert "network_cluster_triggered" in d
            assert "endpoint_recurrence_triggered" in d
            assert "isolation_forest_triggered" in d

    def test_all_category_scores_bounded(self):
        """All category scores must be in [0, 1]."""
        features = self._make_feature_set(20)
        pipeline = DetectorPipeline()
        result = pipeline.run(features)
        for rec in result.records:
            assert 0.0 <= rec.structural_score <= 1.0
            assert 0.0 <= rec.temporal_score <= 1.0
            assert 0.0 <= rec.network_score <= 1.0
            assert 0.0 <= rec.ml_anomaly_score <= 1.0

    def test_evidence_per_transaction(self):
        """Evidence list must have one entry per transaction with detector-level evidence."""
        features = self._make_feature_set(5)
        pipeline = DetectorPipeline()
        result = pipeline.run(features)
        for tx_evidence in result.evidence:
            assert isinstance(tx_evidence, dict)
            # Must contain evidence from all detector categories
            assert "fan_in" in tx_evidence
            assert "fan_out" in tx_evidence
            assert "temporal_burst" in tx_evidence
            assert "ip_reuse" in tx_evidence
            assert "isolation_forest" in tx_evidence

    def test_isolation_forest_metadata_present(self):
        """Pipeline result must include IsolationForest metadata."""
        features = self._make_feature_set(10)
        pipeline = DetectorPipeline()
        result = pipeline.run(features)
        assert result.isolation_forest_metadata is not None
        assert "model_version" in result.isolation_forest_metadata
        assert "feature_names" in result.isolation_forest_metadata

    def test_single_row_dataset(self):
        """Pipeline on a single transaction must not crash."""
        features = self._make_feature_set(1)
        pipeline = DetectorPipeline()
        result = pipeline.run(features)
        assert len(result.records) == 1


# ══════════════════════════════════════════════════════════════════════
# ADDITIONAL: Rapid-hop detector
# ══════════════════════════════════════════════════════════════════════

class TestRapidHopDetector:
    def test_triggers_on_rapid_intervals(self):
        """Rapid hop must trigger with low median interarrival and active history."""
        row = _make_feature_row(
            median_interarrival=15.0,
            mean_interarrival=20.0,
            history_count=5.0,
            tx_count_5m=5.0,
        )
        result = detect_rapid_hop(row)
        assert result.triggered is True
        assert result.score >= 0.50
        assert result.detector_name == "rapid_hop"

    def test_does_not_trigger_without_history(self):
        """Rapid hop must not trigger with no prior history."""
        row = _make_feature_row(
            median_interarrival=10.0,
            history_count=0.0,
        )
        result = detect_rapid_hop(row)
        assert result.score == 0.0
        assert result.triggered is False

    def test_score_drops_for_slow_intervals(self):
        """Rapid hop score should be low for intervals > 120s."""
        row = _make_feature_row(
            median_interarrival=200.0,
            history_count=5.0,
            tx_count_5m=1.0,
        )
        result = detect_rapid_hop(row)
        assert result.score == 0.0
