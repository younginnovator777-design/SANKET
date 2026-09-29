// ============================================================
// SANKET — Mock Data Layer
// Replace with real API calls when backend integration is ready.
// ============================================================

import {
  Alert,
  AnalysisRun,
  InvestigationObject,
  GraphNode,
  GraphEdge,
  TransactionRecord,
  CandidateEntity,
} from '@/types';

/**
 * Sample investigative alerts for development and UI testing.
 * These are fictional examples — not real blockchain data.
 */
export const mockAlerts: Alert[] = [
  {
    alert_id: 'ALT-2024-00147',
    transaction_id: 'tx_8f3a2b1c9d4e5f6a7b8c9d0e1f2a3b4c',
    rank: 1,
    risk_score: 0.92,
    confidence_score: 0.87,
    risk_level: 'CRITICAL',
    priority_score: 0.94,
    triggered_detectors: ['temporal_burst', 'fan_out_pattern', 'value_layering'],
    independent_signal_count: 5,
    evidence_items: [
      { category: 'TEMPORAL SIGNAL', description: 'Rapid succession of outputs within 12-minute window', confidence: 0.91, source: 'temporal_analyzer' },
      { category: 'GRAPH SIGNAL', description: 'Fan-out pattern to 23 unique addresses', confidence: 0.88, source: 'graph_analyzer' },
      { category: 'HEURISTIC SIGNAL', description: 'Value splitting consistent with layering patterns', confidence: 0.85, source: 'behavioral_analyzer' },
      { category: 'NETWORK OBSERVATION', description: 'Broadcast node observed across multiple non-standard peers', confidence: 0.79, source: 'network_collector' },
    ],
    evidence_categories: ['TEMPORAL SIGNAL', 'GRAPH SIGNAL', 'HEURISTIC SIGNAL', 'NETWORK OBSERVATION'],
    component_scores: { structural: 0.88, temporal: 0.91, behavioral: 0.85, network: 0.72 },
    scoring_version: 'v2.1.0',
    created_at: '2024-03-15T14:23:00Z',
  },
  {
    alert_id: 'ALT-2024-00148',
    transaction_id: 'tx_1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d',
    rank: 2,
    risk_score: 0.78,
    confidence_score: 0.82,
    risk_level: 'HIGH',
    priority_score: 0.80,
    triggered_detectors: ['round_amount', 'peel_chain'],
    independent_signal_count: 3,
    evidence_items: [
      { category: 'ML SIGNAL', description: 'Isolation Forest feature space outlier in output amount distribution', confidence: 0.81, source: 'isolation_forest' },
      { category: 'GRAPH SIGNAL', description: 'Peel-chain pattern detected across 8 hops', confidence: 0.84, source: 'graph_analyzer' },
      { category: 'HEURISTIC SIGNAL', description: 'Round-number transaction amount matching structuring profile', confidence: 0.76, source: 'behavioral_analyzer' },
    ],
    evidence_categories: ['ML SIGNAL', 'GRAPH SIGNAL', 'HEURISTIC SIGNAL'],
    component_scores: { structural: 0.84, temporal: 0.45, behavioral: 0.76, network: 0.68 },
    scoring_version: 'v2.1.0',
    created_at: '2024-03-15T13:45:00Z',
  },
  {
    alert_id: 'ALT-2024-00149',
    transaction_id: 'tx_7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b',
    rank: 3,
    risk_score: 0.54,
    confidence_score: 0.71,
    risk_level: 'MEDIUM',
    priority_score: 0.58,
    triggered_detectors: ['unusual_timing'],
    independent_signal_count: 2,
    evidence_items: [
      { category: 'TEMPORAL SIGNAL', description: 'Transaction timing deviates from historical baseline for address cluster', confidence: 0.68, source: 'temporal_analyzer' },
      { category: 'STRUCTURAL SIGNAL', description: 'Moderate output count deviation vs cluster historical norm', confidence: 0.62, source: 'graph_analyzer' },
    ],
    evidence_categories: ['TEMPORAL SIGNAL', 'STRUCTURAL SIGNAL'],
    component_scores: { structural: 0.32, temporal: 0.68, behavioral: 0.41, network: 0.29 },
    scoring_version: 'v2.1.0',
    created_at: '2024-03-15T12:10:00Z',
  },
  {
    alert_id: 'ALT-2024-00150',
    transaction_id: 'tx_3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f',
    rank: 4,
    risk_score: 0.22,
    confidence_score: 0.65,
    risk_level: 'LOW',
    priority_score: 0.25,
    triggered_detectors: ['minor_anomaly'],
    evidence_items: [
      { category: 'HEURISTIC SIGNAL', description: 'Slightly elevated output count compared to baseline', confidence: 0.58, source: 'behavioral_analyzer' },
    ],
    evidence_categories: ['HEURISTIC SIGNAL'],
    independent_signal_count: 1,
    component_scores: { structural: 0.18, temporal: 0.12, behavioral: 0.28, network: 0.15 },
    scoring_version: 'v2.1.0',
    created_at: '2024-03-15T11:30:00Z',
  },
];

/**
 * Sample analysis runs for audit log and history.
 */
export const mockRuns: AnalysisRun[] = [
  {
    run_id: 'RUN-2024-001',
    dataset_name: 'btc_block_830000_832000.csv',
    status: 'completed',
    started_at: '2024-03-15T10:00:00Z',
    completed_at: '2024-03-15T14:23:00Z',
    transaction_count: 245892,
    alert_count: 147,
    scoring_version: 'v2.1.0',
  },
  {
    run_id: 'RUN-2024-002',
    dataset_name: 'btc_suspicious_cluster_47.csv',
    status: 'completed',
    started_at: '2024-03-14T09:00:00Z',
    completed_at: '2024-03-14T11:45:00Z',
    transaction_count: 12453,
    alert_count: 38,
    scoring_version: 'v2.1.0',
  },
  {
    run_id: 'RUN-2024-003',
    dataset_name: 'mempool_dump_2024_03_13.json',
    status: 'completed',
    started_at: '2024-03-13T16:20:00Z',
    completed_at: '2024-03-13T18:05:00Z',
    transaction_count: 89410,
    alert_count: 92,
    scoring_version: 'v2.0.4',
  },
  {
    run_id: 'RUN-2024-004',
    dataset_name: 'btc_historical_range_feb.csv',
    status: 'failed',
    started_at: '2024-03-12T08:15:00Z',
    completed_at: '2024-03-12T08:18:00Z',
    transaction_count: 0,
    alert_count: 0,
    scoring_version: 'v2.0.4',
  },
];

/**
 * Sample transaction records for Transaction Inspector.
 */
export const mockTransactions: TransactionRecord[] = [
  {
    txid: '8f3a2b1c9d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a',
    timestamp: '2024-03-15T14:23:00Z',
    block_height: 831204,
    value_btc: 48.75,
    fee_btc: 0.00042,
    inputs_count: 4,
    outputs_count: 23,
    risk_score: 0.92,
    risk_level: 'CRITICAL',
    confidence: 0.87,
    triggered_detectors: ['temporal_burst', 'fan_out_pattern', 'value_layering'],
    observed_ip: '198.51.100.42',
    observed_asn: 'AS13335',
    status: 'flagged',
  },
  {
    txid: '1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b',
    timestamp: '2024-03-15T13:45:00Z',
    block_height: 831198,
    value_btc: 12.00,
    fee_btc: 0.00018,
    inputs_count: 1,
    outputs_count: 2,
    risk_score: 0.78,
    risk_level: 'HIGH',
    confidence: 0.82,
    triggered_detectors: ['round_amount', 'peel_chain'],
    observed_ip: '203.0.113.88',
    observed_asn: 'AS15169',
    status: 'flagged',
  },
  {
    txid: '7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f',
    timestamp: '2024-03-15T12:10:00Z',
    block_height: 831182,
    value_btc: 5.412,
    fee_btc: 0.00009,
    inputs_count: 2,
    outputs_count: 2,
    risk_score: 0.54,
    risk_level: 'MEDIUM',
    confidence: 0.71,
    triggered_detectors: ['unusual_timing'],
    observed_ip: '192.0.2.14',
    observed_asn: 'AS8075',
    status: 'anomalous',
  },
  {
    txid: '3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b3c4d',
    timestamp: '2024-03-15T11:30:00Z',
    block_height: 831175,
    value_btc: 1.15,
    fee_btc: 0.00005,
    inputs_count: 1,
    outputs_count: 4,
    risk_score: 0.22,
    risk_level: 'LOW',
    confidence: 0.65,
    triggered_detectors: ['minor_anomaly'],
    observed_ip: '198.51.100.99',
    observed_asn: 'AS13335',
    status: 'confirmed',
  },
  {
    txid: '9f0e1d2c3b4a5f6e7d8c9b0a1f2e3d4c5b6a7f8e9d0c1b2a3f4e5d6c7b8a9f0e',
    timestamp: '2024-03-15T10:45:00Z',
    block_height: 831160,
    value_btc: 0.045,
    fee_btc: 0.00002,
    inputs_count: 1,
    outputs_count: 2,
    risk_score: 0.08,
    risk_level: 'LOW',
    confidence: 0.94,
    triggered_detectors: [],
    observed_ip: '203.0.113.12',
    observed_asn: 'AS16509',
    status: 'confirmed',
  },
];

/**
 * Sample candidate entities for Heuristic Groupings.
 */
export const mockCandidateEntities: CandidateEntity[] = [
  {
    entity_id: 'ENT-CLUSTER-84-ALPHA',
    label: 'Candidate Entity Cluster 84',
    heuristic_method: 'Common-Input-Ownership + Change-Address-Heuristic',
    address_count: 23,
    total_volume_btc: 148.5,
    associated_alerts_count: 7,
    risk_assessment: 'CRITICAL',
    first_seen: '2024-03-15T10:12:00Z',
    last_seen: '2024-03-15T14:23:00Z',
    confidence: 0.89,
    sample_addresses: [
      'bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh',
      '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa',
      '3J98t1WpEZ73CNmQviecrnyiWrnqRhWNLy',
      'bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq',
    ],
    supporting_evidence: [
      'Co-spending observed across 14 input vectors in block 831204',
      'Consistent non-standard locktime timestamp patterning',
      'Identical fee-rate distribution across 6 sequential bursts',
    ],
  },
  {
    entity_id: 'ENT-CLUSTER-47-BETA',
    label: 'Candidate Entity Cluster 47',
    heuristic_method: 'Peel-Chain Continuation Heuristic',
    address_count: 12,
    total_volume_btc: 54.2,
    associated_alerts_count: 3,
    risk_assessment: 'HIGH',
    first_seen: '2024-03-14T09:00:00Z',
    last_seen: '2024-03-15T13:45:00Z',
    confidence: 0.81,
    sample_addresses: [
      'bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4',
      '34xp4vRoCGJym3xR7yCVPFHoCNxv4Twseo',
      '1BvBMSEYstWetqTFn5Au4m4GFg7xJaNVN2',
    ],
    supporting_evidence: [
      'Sequential change address peel chain spanning 8 consecutive hops',
      'Fixed-amount output splitting matching structural peeling profile',
    ],
  },
  {
    entity_id: 'ENT-CLUSTER-12-GAMMA',
    label: 'Candidate Entity Cluster 12',
    heuristic_method: 'Temporal Co-occurrence Clustering',
    address_count: 6,
    total_volume_btc: 18.9,
    associated_alerts_count: 1,
    risk_assessment: 'MEDIUM',
    first_seen: '2024-03-15T11:00:00Z',
    last_seen: '2024-03-15T12:30:00Z',
    confidence: 0.72,
    sample_addresses: [
      'bc1q9d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d',
      '1FeexV6bAHb8ybZjqQMjJrcCrHGW9sb6uF',
    ],
    supporting_evidence: [
      'Burst activity synchronized within a 5-minute window',
      'Identical output script template type',
    ],
  },
];

/**
 * Sample graph nodes.
 */
export const mockGraphNodes: GraphNode[] = [
  { node_id: 'addr_1a2b3c', node_type: 'address', attributes: { label: '1A2b3C...xYz', balance_btc: 14.2, risk: 'MEDIUM' } },
  { node_id: 'tx_8f3a2b', node_type: 'transaction', attributes: { label: 'tx_8f3a2b1c...', value_btc: 48.75, risk_level: 'CRITICAL', score: 0.92 } },
  { node_id: 'ent_cluster_84', node_type: 'entity', attributes: { label: 'CLUSTER-84-ALPHA', addresses: 23, risk_level: 'CRITICAL' } },
  { node_id: 'ip_198_51_100', node_type: 'address', attributes: { label: '198.51.100.42', asn: 'AS13335', risk: 'LOW' } },
  { node_id: 'addr_bc1qxy', node_type: 'address', attributes: { label: 'bc1qxy2k...0wlh', balance_btc: 34.5, risk: 'HIGH' } },
];

/**
 * Sample graph edges.
 */
export const mockGraphEdges: GraphEdge[] = [
  { source_id: 'addr_1a2b3c', target_id: 'tx_8f3a2b', edge_type: 'input', timestamp: '2024-03-15T14:23:00Z', attributes: { value_btc: 14.2 } },
  { source_id: 'tx_8f3a2b', target_id: 'addr_bc1qxy', edge_type: 'output', timestamp: '2024-03-15T14:23:00Z', attributes: { value_btc: 34.5 } },
  { source_id: 'ent_cluster_84', target_id: 'addr_1a2b3c', edge_type: 'association', timestamp: '2024-03-15T14:23:00Z', attributes: { method: 'common-input' } },
  { source_id: 'tx_8f3a2b', target_id: 'ip_198_51_100', edge_type: 'association', timestamp: '2024-03-15T14:23:00Z', attributes: { relation: 'broadcast' } },
];

/**
 * Sample deep investigation object.
 */
export const mockInvestigation: InvestigationObject = {
  transaction_id: 'tx_8f3a2b1c9d4e5f6a7b8c9d0e1f2a3b4c',
  risk_score: 0.92,
  confidence_score: 0.87,
  risk_level: 'CRITICAL',
  triggered_detectors: ['temporal_burst', 'fan_out_pattern', 'value_layering'],
  detector_scores: { temporal_burst: 0.91, fan_out_pattern: 0.88, value_layering: 0.85 },
  evidence_items: mockAlerts[0].evidence_items,
  evidence_categories: ['TEMPORAL SIGNAL', 'GRAPH SIGNAL', 'HEURISTIC SIGNAL', 'NETWORK OBSERVATION'],
  independent_signal_count: 5,
  data_quality: 0.94,
  component_scores: { structural: 0.88, temporal: 0.91, behavioral: 0.85, network: 0.72 },
  confidence_components: { data_coverage: 0.92, signal_agreement: 0.85, model_confidence: 0.88 },
  cross_category_agreement: 0.84,
  scoring_version: 'v2.1.0',
  graph_evidence: { cluster: 'CLUSTER-84-ALPHA', hops: 3 },
};
