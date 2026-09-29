# SANKET — Detection Engine Evaluation & Validation Report (100K Dataset)
**Product Name:** SANKET — System for Network & Transaction Analysis  
**Task:** Task 4 — Detection Evaluation & Validation  
**Feature Schema:** `sanket-features-v1`  
**Evaluation Target:** Synthetic 100K Bitcoin Transaction Telemetry & Ground-Truth Labels  

---

## 1. Dataset Summary
- **Total Transactions Evaluated:** 100,000
- **Total Ground-Truth Labels:** 100,000
- **Alignment Status:** Verified (Exact 1-to-1 match by txid)
- **Label Leakage Check:** Passed (0 label columns in detection pipeline)

## 2. Ground-Truth Scenario Distribution
| Scenario Name | Class Type | Record Count | Percentage |
|---|---|---|---|
| `benign` | Negative (Benign Baseline) | 85,001 | 85.00% |
| `mixing_like` | Positive (Planted Anomaly) | 2,499 | 2.50% |
| `network_cluster` | Positive (Planted Anomaly) | 2,500 | 2.50% |
| `rapid_hop` | Positive (Planted Anomaly) | 2,500 | 2.50% |
| `fan_out` | Positive (Planted Anomaly) | 2,500 | 2.50% |
| `peeling_like` | Positive (Planted Anomaly) | 2,500 | 2.50% |
| `fan_in` | Positive (Planted Anomaly) | 2,500 | 2.50% |

## 3. Feature Count Audit
Detailed reconciliation of feature counts across schema groups, numerical types, and detector consumption:

| Feature Category | Registered Features | Numeric Features | Used by Rule Detectors |
|---|---|---|---|
| **TRANSACTION** | 16 | 16 | 7 |
| **TEMPORAL** | 12 | 12 | 7 |
| **NETWORK** | 13 | 13 | 9 |
| **ENTITY** | 9 | 9 | 3 |
| **GRAPH** | 8 | 8 | 5 |
| **DATA_QUALITY** | 4 | 4 | 0 |
| **TOTAL (Deduplicated)** | **61** | **61** | **30** |

> [!NOTE]
> **Audit Reconciliation:**
> - `FEATURE_REGISTRY` contains **61** unique registered features across 6 categories.
> - All **61** registered features are numerical floats and consumed by the unsupervised Isolation Forest.
> - Discrepancy explanation: Previous Task 3 draft text cited '54 registered / 47 numeric' as a preliminary estimate; the code implementation actually registered all 58 features without omission.
> - One feature (`unique_ips`) is cross-listed under both `NETWORK` and `ENTITY` in `FEATURE_GROUPS`, resulting in 59 group slots but exactly 58 unique feature names.

## 4. Overall Binary Anomaly Detection Metrics
Performance of overall detection (max category score) across decision thresholds:

| Threshold | Precision | Recall | F1-Score | True Positives | False Positives | True Negatives | False Negatives |
|---|---|---|---|---|---|---|---|
| `0.25` | 0.1500 | 1.0000 | 0.2609 | 14,999 | 85,001 | 0 | 0 |
| `0.50` | 0.2113 | 0.8159 | 0.3357 | 12,238 | 45,673 | 39,328 | 2,761 |
| `0.75` | 0.2653 | 0.4890 | 0.3439 | 7,334 | 20,314 | 64,687 | 7,665 |

- **Overall ROC-AUC:** `0.7007`
- **Overall PR-AUC (Average Precision):** `0.3310`

## 5. Category-Level Performance
Performance breakdown by detector category at the standard `0.50` threshold:

| Category Score | ROC-AUC | PR-AUC | Precision @0.50 | Recall @0.50 | F1 @0.50 | TP | FP |
|---|---|---|---|---|---|---|---|
| `structural_score` | 0.5798 | 0.3244 | 0.1977 | 0.6110 | 0.2988 | 9,164 | 37,181 |
| `temporal_score` | 0.2577 | 0.1424 | 0.1773 | 0.1613 | 0.1690 | 2,420 | 11,227 |
| `network_score` | 0.5896 | 0.2120 | 0.2868 | 0.2437 | 0.2635 | 3,656 | 9,091 |
| `ml_anomaly_score` | 0.8305 | 0.4427 | 0.4386 | 0.2891 | 0.3485 | 4,336 | 5,550 |

## 6. Isolation Forest Evaluation
Unsupervised Isolation Forest evaluated independently without labels during training or inference:
- **ROC-AUC:** `0.8305`
- **PR-AUC:** `0.4427`
- **Precision @0.50:** `0.4386`
- **Recall @0.50:** `0.2891`
- **F1 @0.50:** `0.3485`
- **True Positives:** 4,336 | **False Positives:** 5,550

## 7. Scenario Detection Matrix & Recall Breakdown
Cross-scenario trigger rates (Recall on intended anomalous scenarios, False Positive Rate on Benign):

| Detector | `benign` | `fan_in` | `fan_out` | `peeling_like` | `mixing_like` | `rapid_hop` | `network_cluster` |
|---|---|---|---|---|---|---|---|
| **fan_in detector** | 0.0734 | 1.0000 | 0.0000 | 0.0000 | 0.0000 | 0.0000 | 0.0000 |
| **fan_out detector** | 0.1327 | 0.0000 | 1.0000 | 0.0000 | 0.0000 | 0.0000 | 0.0000 |
| **peeling detector** | 0.2313 | 0.0000 | 0.0000 | 1.0000 | 0.0000 | 0.0000 | 0.0000 |
| **mixing detector** | 0.0000 | 0.0000 | 0.0000 | 0.0000 | 0.6659 | 0.0000 | 0.0000 |
| **rapid_hop detector** | 0.0003 | 0.0000 | 0.0064 | 0.1928 | 0.0000 | 0.7492 | 0.0000 |
| **network_cluster detector** | 0.1070 | 0.0716 | 0.0668 | 0.4688 | 0.0384 | 0.4096 | 0.4072 |
| **Isolation Forest** | 0.0653 | 0.1352 | 0.2548 | 0.8392 | 0.1965 | 0.3060 | 0.0028 |

### Per-Scenario Recall & Anomaly Score Summary
| Scenario | Total Records | Triggered Records | Recall | Mean Anomaly Score | Median Anomaly Score |
|---|---|---|---|---|---|
| `benign` | 85,001 | 45,673 | 0.5373 | 0.5628 | 0.5339 |
| `fan_in` | 2,500 | 2,500 | 1.0000 | 0.8208 | 0.8350 |
| `fan_out` | 2,500 | 2,500 | 1.0000 | 0.7782 | 0.8000 |
| `mixing_like` | 2,499 | 1,702 | 0.6811 | 0.5936 | 0.5996 |
| `network_cluster` | 2,500 | 1,018 | 0.4072 | 0.5053 | 0.4437 |
| `peeling_like` | 2,500 | 2,500 | 1.0000 | 0.9939 | 1.0000 |
| `rapid_hop` | 2,500 | 2,018 | 0.8072 | 0.6518 | 0.6745 |

## 8. Benign High-Scoring Patterns (False Positive Confounder Analysis)
Top benign transactions with elevated scores, representing legitimate high-complexity activities (e.g., exchange batching):

### Top Benign Patterns in `structural_score`
| TXID | Scenario | Score | Detector | Top Evidence Reason |
|---|---|---|---|---|
| `a06415cf0c29f8dc...` | `benign` | `1.0000` | `peeling_like` | High output concentration (HHI=0.9986) reflects heavily skewed change vs peel split |
| `b788307373dbf6a1...` | `benign` | `1.0000` | `peeling_like` | High output concentration (HHI=0.9664) reflects heavily skewed change vs peel split |
| `cb915fbfda47f1a8...` | `benign` | `1.0000` | `peeling_like` | High output concentration (HHI=0.9528) reflects heavily skewed change vs peel split |
| `466f47b97d6c82db...` | `benign` | `1.0000` | `peeling_like` | High output concentration (HHI=0.9969) reflects heavily skewed change vs peel split |
| `34aa90c6078ace74...` | `benign` | `1.0000` | `peeling_like` | High output concentration (HHI=0.9637) reflects heavily skewed change vs peel split |

### Top Benign Patterns in `temporal_score`
| TXID | Scenario | Score | Detector | Top Evidence Reason |
|---|---|---|---|---|
| `363e3e338d1fc232...` | `benign` | `1.0000` | `temporal_burst, baseline_deviation` | Transaction arrival velocity (12.00x) significantly exceeds 1h baseline |
| `d03e0d4fa03dc5de...` | `benign` | `1.0000` | `baseline_deviation` | Transaction value deviates 8.96 modified Z-scores from historical median (0.3313 BTC) |
| `9e91f9c328f67290...` | `benign` | `1.0000` | `baseline_deviation` | Transaction value deviates 11.90 modified Z-scores from historical median (0.2988 BTC) |
| `ddf66b7beeb2e1d0...` | `benign` | `1.0000` | `baseline_deviation` | Transaction value deviates 10.13 modified Z-scores from historical median (0.2577 BTC) |
| `0be29bfa50ce8d46...` | `benign` | `1.0000` | `baseline_deviation` | Transaction value deviates 10.99 modified Z-scores from historical median (0.2408 BTC) |

### Top Benign Patterns in `network_score`
| TXID | Scenario | Score | Detector | Top Evidence Reason |
|---|---|---|---|---|
| `7842196b2246694c...` | `benign` | `0.8958` | `ip_reuse, network_cluster` | Source IP observed 9 prior times (contextual network correlation) |
| `d2eb0a2c80058cbd...` | `benign` | `0.8958` | `ip_reuse, network_cluster` | Source IP observed 13 prior times (contextual network correlation) |
| `1950036b8ba1ad2a...` | `benign` | `0.8958` | `ip_reuse, network_cluster` | Source IP observed 8 prior times (contextual network correlation) |
| `d9269c4c572cb6cc...` | `benign` | `0.8906` | `ip_reuse, network_cluster` | Source IP observed 9 prior times (contextual network correlation) |
| `92abd7cbca625fbd...` | `benign` | `0.8906` | `ip_reuse, network_cluster` | Source IP observed 8 prior times (contextual network correlation) |

### Top Benign Patterns in `ml_anomaly_score`
| TXID | Scenario | Score | Detector | Top Evidence Reason |
|---|---|---|---|---|
| `201e8b64b7edcba7...` | `benign` | `0.8601` | `isolation_forest` | Isolation Forest raw decision=-0.120603, normalized anomaly=0.8601 |
| `10980e336852b05c...` | `benign` | `0.8503` | `isolation_forest` | Isolation Forest raw decision=-0.117408, normalized anomaly=0.8503 |
| `7992f65ee5fd1e6e...` | `benign` | `0.8447` | `isolation_forest` | Isolation Forest raw decision=-0.115563, normalized anomaly=0.8447 |
| `5d38a3e815f843e1...` | `benign` | `0.8414` | `isolation_forest` | Isolation Forest raw decision=-0.114486, normalized anomaly=0.8414 |
| `a7df49854f30d8e0...` | `benign` | `0.8373` | `isolation_forest` | Isolation Forest raw decision=-0.113167, normalized anomaly=0.8373 |

## 9. Detection Score Distributions (Separation Analysis)
Statistical percentiles comparing benign baseline against all anomalous scenarios:

### `structural_score` Distribution
| Subpopulation | Min | Median (p50) | Mean | p90 | p95 | p99 | Max |
|---|---|---|---|---|---|---|---|
| **Benign** | 0.0000 | 0.4500 | 0.4225 | 0.8000 | 0.9000 | 1.0000 | 1.0000 |
| **Anomalous** | 0.0000 | 0.6425 | 0.5281 | 1.0000 | 1.0000 | 1.0000 | 1.0000 |
**Separation:** Mean difference = `0.1056`, Median difference = `0.1925`

### `temporal_score` Distribution
| Subpopulation | Min | Median (p50) | Mean | p90 | p95 | p99 | Max |
|---|---|---|---|---|---|---|---|
| **Benign** | 0.0000 | 0.2333 | 0.2684 | 0.6278 | 0.8500 | 0.8752 | 1.0000 |
| **Anomalous** | 0.0000 | 0.0000 | 0.1324 | 0.6527 | 0.7545 | 0.8728 | 1.0000 |
**Separation:** Mean difference = `-0.1359`, Median difference = `-0.2333`

### `network_score` Distribution
| Subpopulation | Min | Median (p50) | Mean | p90 | p95 | p99 | Max |
|---|---|---|---|---|---|---|---|
| **Benign** | 0.3000 | 0.3000 | 0.3584 | 0.5667 | 0.7104 | 0.8698 | 0.8958 |
| **Anomalous** | 0.3000 | 0.3000 | 0.4193 | 0.7208 | 0.8542 | 0.9062 | 0.9375 |
**Separation:** Mean difference = `0.0610`, Median difference = `0.0000`

### `ml_anomaly_score` Distribution
| Subpopulation | Min | Median (p50) | Mean | p90 | p95 | p99 | Max |
|---|---|---|---|---|---|---|---|
| **Benign** | 0.0000 | 0.1515 | 0.2081 | 0.4519 | 0.5262 | 0.6459 | 0.8601 |
| **Anomalous** | 0.0959 | 0.4134 | 0.4288 | 0.6721 | 0.7530 | 0.8936 | 1.0000 |
**Separation:** Mean difference = `0.2208`, Median difference = `0.2619`

## 10. Runtime & Scalability
- **Feature Extraction Runtime:** 64.76 s
- **Detection Pipeline Runtime:** 46.52 s
- **Evaluation Harness Runtime:** 12.57 s
- **Total End-to-End Runtime:** 134.90 s
- **Overall Throughput:** 741.3 rows/second

## 11. Operational Limitations
1. **Cold-Start Latency:** Temporal and entity baseline features require warm-up observations; early transactions exhibit lower detection recall.
2. **Confounder Overlap:** Highly active commercial entities (exchanges, payment processors) naturally produce multi-input/multi-output topologies that score high in structural heuristics.
3. **Unsupervised Disparity:** The Isolation Forest detects generic multi-dimensional statistical outliers and does not uniquely isolate single-hop rapid relays without temporal feature weight amplification.

## 12. Recommendations for Task 5 (Risk Scoring & Alert Ranking)
1. **Multi-Signal Ensembling:** Combine heuristic detector scores with the Isolation Forest anomaly score using dynamic category weighting.
2. **Benign Entity Damping:** Implement an entity reputation / commercial entity dampener to suppress structural alerts for verified high-volume wallets.
3. **Investigation Alert Prioritization:** Rank alerts using cross-category co-occurrence (e.g., simultaneous structural + temporal + network triggers).
4. **Explainability Packaging:** Expose evidence items and feature contribution rankings directly inside alert payloads.

---
*Report generated automatically by SANKET Evaluation Harness.*