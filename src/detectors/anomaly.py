"""
SANKET Detection Engine: Isolation Forest Anomaly Detector
Unsupervised ML component using scikit-learn IsolationForest.
Trains ONLY on numeric features from sanket-features-v1.
Fully unsupervised — no ground-truth data is used. Does NOT assume any fixed contamination rate.
"""
import math
import time
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Sequence

import numpy as np

from src.detectors.evidence import (
    DetectorResult,
    EvidenceItem,
    calculate_severity,
    clamp_01,
)
from src.features.pipeline import FEATURE_GROUPS, FEATURE_REGISTRY, FEATURE_SCHEMA_VERSION

# Columns excluded from ML input: metadata, identifiers, and labels
_METADATA_COLUMNS = frozenset({
    "txid", "timestamp", "feature_schema_version", "event_id",
    "source_batch_id", "ingest_time",
})


def _get_numeric_feature_names() -> List[str]:
    """Return ordered list of numeric feature names from the FEATURE_REGISTRY."""
    names: List[str] = []
    for group_name in ["TRANSACTION", "TEMPORAL", "NETWORK", "ENTITY", "GRAPH", "DATA_QUALITY"]:
        for feat in FEATURE_GROUPS.get(group_name, []):
            if feat in FEATURE_REGISTRY and feat not in _METADATA_COLUMNS:
                names.append(feat)
    # Deduplicate while preserving order (unique_ips appears in both NETWORK and ENTITY)
    seen = set()
    deduped: List[str] = []
    for n in names:
        if n not in seen:
            seen.add(n)
            deduped.append(n)
    return deduped


@dataclass
class IsolationForestMetadata:
    """Reproducibility metadata for the trained Isolation Forest model."""
    model_version: str = "sanket-iforest-v1"
    feature_schema_version: str = FEATURE_SCHEMA_VERSION
    feature_names: List[str] = field(default_factory=list)
    random_seed: int = 42
    n_estimators: int = 100
    training_row_count: int = 0
    training_timestamp: str = ""
    score_calibration: str = "min-max linear scaling of sklearn decision_function to [0, 1]"
    contamination: str = "auto"

    def to_dict(self) -> Dict[str, Any]:
        return {
            "model_version": self.model_version,
            "feature_schema_version": self.feature_schema_version,
            "feature_names": list(self.feature_names),
            "random_seed": self.random_seed,
            "n_estimators": self.n_estimators,
            "training_row_count": self.training_row_count,
            "training_timestamp": self.training_timestamp,
            "score_calibration": self.score_calibration,
            "contamination": self.contamination,
        }


class IsolationForestDetector:
    """
    Unsupervised anomaly detector using Isolation Forest.

    Usage:
        detector = IsolationForestDetector(random_state=42)
        detector.fit(feature_matrix)       # 2D numpy array or list of dicts
        results = detector.predict(feature_matrix)
    """

    def __init__(
        self,
        n_estimators: int = 100,
        random_state: int = 42,
        contamination: str = "auto",
    ):
        self.n_estimators = n_estimators
        self.random_state = random_state
        self.contamination = contamination
        self.feature_names = _get_numeric_feature_names()
        self._model = None
        self._is_fitted = False
        self._metadata: Optional[IsolationForestMetadata] = None
        # Calibration parameters (from training set decision_function distribution)
        self._cal_min: float = 0.0
        self._cal_max: float = 1.0

    def _extract_matrix(self, rows: Sequence[Dict[str, Any]]) -> np.ndarray:
        """
        Extract numeric feature matrix from list of feature dictionaries.
        Handles NaN/Inf by replacing with 0.0.
        """
        n = len(rows)
        m = len(self.feature_names)
        mat = np.zeros((n, m), dtype=np.float64)
        for i, row in enumerate(rows):
            for j, feat in enumerate(self.feature_names):
                val = row.get(feat, 0.0)
                if val is None:
                    val = 0.0
                else:
                    val = float(val)
                if math.isnan(val) or math.isinf(val):
                    val = 0.0
                mat[i, j] = val
        return mat

    def fit(self, rows: Sequence[Dict[str, Any]]) -> "IsolationForestDetector":
        """
        Fit the Isolation Forest model on the given feature rows.
        Does NOT use any label information.
        """
        from sklearn.ensemble import IsolationForest

        if len(rows) == 0:
            self._is_fitted = False
            self._metadata = IsolationForestMetadata(
                feature_names=list(self.feature_names),
                random_seed=self.random_state,
                n_estimators=self.n_estimators,
                training_row_count=0,
                training_timestamp=datetime.now(timezone.utc).isoformat(),
            )
            return self

        mat = self._extract_matrix(rows)

        self._model = IsolationForest(
            n_estimators=self.n_estimators,
            random_state=self.random_state,
            contamination=self.contamination,
        )
        self._model.fit(mat)
        self._is_fitted = True

        # Calibrate score normalization from training set
        raw_scores = self._model.decision_function(mat)
        self._cal_min = float(np.min(raw_scores))
        self._cal_max = float(np.max(raw_scores))

        self._metadata = IsolationForestMetadata(
            feature_names=list(self.feature_names),
            random_seed=self.random_state,
            n_estimators=self.n_estimators,
            training_row_count=len(rows),
            training_timestamp=datetime.now(timezone.utc).isoformat(),
            contamination=str(self.contamination),
        )

        return self

    def _normalize_score(self, raw_decision: float) -> float:
        """
        Transform raw sklearn decision_function score into anomaly score in [0, 1].
        sklearn convention: lower (more negative) decision = more anomalous.
        We invert: higher normalized score = more anomalous.
        """
        spread = self._cal_max - self._cal_min
        if spread < 1e-12:
            # Constant scores — all equally anomalous at midpoint
            return 0.5

        # Linear scale within observed training range, then invert
        # raw_decision near cal_min -> most anomalous -> score near 1.0
        # raw_decision near cal_max -> least anomalous -> score near 0.0
        normalized = (self._cal_max - raw_decision) / spread
        return clamp_01(normalized)

    def predict(self, rows: Sequence[Dict[str, Any]]) -> List[DetectorResult]:
        """
        Score each row using the fitted Isolation Forest.
        Returns one DetectorResult per row.
        """
        if not self._is_fitted or self._model is None:
            # Return zero-score results for unfitted model
            results: List[DetectorResult] = []
            for _ in rows:
                results.append(DetectorResult(
                    detector_name="isolation_forest",
                    score=0.0,
                    triggered=False,
                    evidence=[],
                    severity="NONE",
                    feature_values={},
                ))
            return results

        mat = self._extract_matrix(rows)
        raw_decisions = self._model.decision_function(mat)

        results = []
        for i, row in enumerate(rows):
            raw_d = float(raw_decisions[i])
            norm_score = self._normalize_score(raw_d)
            triggered = norm_score >= 0.50

            evidence: List[EvidenceItem] = []
            if triggered:
                # Identify top contributing features by absolute z-distance from column medians
                # Simple heuristic: features with extreme values relative to training range
                evidence.append(
                    EvidenceItem(
                        feature="isolation_forest_raw_score",
                        value=raw_d,
                        reason=f"Isolation Forest raw decision={raw_d:.6f}, normalized anomaly={norm_score:.4f}",
                    )
                )

            feature_values = {
                "ml_anomaly_score": norm_score,
                "isolation_forest_raw_decision": raw_d,
            }

            results.append(DetectorResult(
                detector_name="isolation_forest",
                score=norm_score,
                triggered=triggered,
                evidence=evidence,
                severity=calculate_severity(norm_score, triggered),
                feature_values=feature_values,
            ))

        return results

    @property
    def metadata(self) -> Optional[IsolationForestMetadata]:
        return self._metadata
