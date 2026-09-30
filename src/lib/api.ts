// ============================================================
// SANKET — Typed API Client
// Wraps all backend endpoints (Tasks 8A/8B).
// Reads NEXT_PUBLIC_API_BASE_URL; uses native fetch.
// ============================================================

const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:8000';

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const url = `${API_BASE}${path}`;
  const res = await fetch(url, { ...init });
  if (!res.ok) {
    let detail = `HTTP ${res.status}`;
    try { const b = await res.json(); detail = b?.detail ?? detail; } catch { /* ignore */ }
    throw new ApiError(res.status, detail);
  }
  return res.json() as Promise<T>;
}

export class ApiError extends Error {
  constructor(public readonly status: number, public readonly detail: string) {
    super(detail);
    this.name = 'ApiError';
  }
}

// ─── Backend canonical response types ────────────────────────────────────────

export interface HealthResponse {
  status: string;
  service: string;
  pipeline_version: string | null;
}

export interface ApiEvidenceItem {
  category: string;
  description: string;
  confidence: number;
  source: string;
}

export interface ApiAlert {
  alert_id: string;
  transaction_id: string;
  rank: number;
  risk_score: number;
  confidence_score: number;
  risk_level: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
  priority_score: number;
  triggered_detectors: string[];
  independent_signal_count: number;
  evidence_categories: string[];
  /** Backend canonical component keys: M, T, N, G, S, Gs, C */
  component_scores: Record<string, number>;
  scoring_version: string;
  evidence_items: ApiEvidenceItem[];
}

export interface ApiAnalysisResponse {
  run_id: string;
  pipeline_version: string;
  record_count: number;
  rejected_record_count: number;
  dataset_metadata: Record<string, unknown>;
  feature_schema_version: string | null;
  detector_versions: Record<string, string>;
  graph_summary: Record<string, unknown>;
  ranked_alerts: ApiAlert[];
  execution_timings: Record<string, number>;
  execution_metrics: Record<string, unknown>;
  warnings: string[];
  errors: string[];
}

export interface ApiAlertsListResponse {
  total: number;
  alerts: ApiAlert[];
}

export interface ApiAlertDetail {
  alert: ApiAlert;
  investigation_object: Record<string, unknown>;
  /** Individual detector scores (e.g. fan_in, fan_out, isolation_forest, …) */
  detector_scores: Record<string, number>;
  /** Backend canonical component keys: M, T, N, G */
  component_scores: Record<string, number>;
  /** Backend canonical confidence keys: D, E, S, Gs, X */
  confidence_components: Record<string, number>;
  evidence_items: ApiEvidenceItem[];
  graph_evidence: Record<string, unknown> | null;
}

export interface ApiCanonicalTransaction {
  txid: string;
  timestamp: string | null;
  src_ip?: string | null;
  dst_ip?: string | null;
  src_port?: number | null;
  dst_port?: number | null;
  input_addresses?: string[];
  output_addresses?: string[];
  input_amounts?: number[];
  output_amounts?: number[];
  fee?: number | null;
  script_type?: string | null;
  geo_country?: string | null;
  asn?: string | null;
  [key: string]: unknown;
}

export interface ApiTransactionDetail {
  transaction_id: string;
  canonical_transaction: ApiCanonicalTransaction | null;
  features: Record<string, unknown> | null;
  detector_results: {
    record: Record<string, unknown> | null;
    evidence: Record<string, unknown> | null;
  } | null;
  graph_evidence: Record<string, unknown> | null;
  investigation: Record<string, unknown> | null;
  alert: Record<string, unknown> | null;
}

export interface ApiGraphNode {
  node_id: string;
  /** TRANSACTION | ADDRESS | IP | ASN | COUNTRY | CANDIDATE_ENTITY */
  node_type: string;
  attributes: Record<string, unknown>;
}

export interface ApiGraphEdge {
  edge_id: string;
  source_id: string;
  target_id: string;
  /** INPUT_TO | OUTPUT_TO | OBSERVED_WITH | SAME_IP | SAME_ASN | TEMPORALLY_ASSOCIATED | CANDIDATE_SAME_ENTITY */
  edge_type: string;
  timestamp: number | null;
  attributes: Record<string, unknown>;
  metadata: Record<string, unknown>;
}

export interface ApiGraphResponse {
  transaction_id: string;
  nodes: ApiGraphNode[];
  edges: ApiGraphEdge[];
  graph_evidence: Record<string, unknown>;
}

export interface ApiLatestRun {
  run_id: string;
  pipeline_version: string;
  record_count: number;
  alert_count: number;
  risk_level_counts: { CRITICAL: number; HIGH: number; MEDIUM: number; LOW: number };
  graph_summary: Record<string, unknown>;
  execution_timings: Record<string, number>;
  execution_metrics: Record<string, unknown>;
  warnings: string[];
  errors: string[];
  dataset_metadata: Record<string, unknown>;
}

// ─── Public API functions ─────────────────────────────────────────────────────

export async function getHealth(): Promise<HealthResponse> {
  return apiFetch<HealthResponse>('/health');
}

export async function analyzeFile(file: File): Promise<ApiAnalysisResponse> {
  const form = new FormData();
  form.append('file', file);
  return apiFetch<ApiAnalysisResponse>('/api/v1/analyze', { method: 'POST', body: form });
}

export async function getAlerts(minRiskLevel?: string): Promise<ApiAlertsListResponse> {
  const qs = minRiskLevel ? `?min_risk_level=${encodeURIComponent(minRiskLevel)}` : '';
  return apiFetch<ApiAlertsListResponse>(`/api/v1/alerts${qs}`);
}

export async function getAlert(alertId: string): Promise<ApiAlertDetail> {
  return apiFetch<ApiAlertDetail>(`/api/v1/alerts/${encodeURIComponent(alertId)}`);
}

export async function getTransaction(txid: string): Promise<ApiTransactionDetail> {
  return apiFetch<ApiTransactionDetail>(`/api/v1/transactions/${encodeURIComponent(txid)}`);
}

export async function getGraph(txid: string, hops = 2): Promise<ApiGraphResponse> {
  return apiFetch<ApiGraphResponse>(`/api/v1/graph/${encodeURIComponent(txid)}?hops=${hops}`);
}

export async function getLatestRun(): Promise<ApiLatestRun> {
  return apiFetch<ApiLatestRun>('/api/v1/run/latest');
}
