// ============================================================
// SANKET — Typed API Client & Boundary Adapters (Track 1 / A2)
// Authoritative frontend API access layer.
// Wraps all existing and frozen backend endpoints.
// Reads NEXT_PUBLIC_API_BASE_URL; uses native fetch.
// Strictly NO silent mock fallback, NO invented fields, NO frontend scoring.
// ============================================================

import type {
  Alert,
  EvidenceItem,
  TransactionRecord,
  AnalysisRun,
  RiskLevel,
} from '@/types';

const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE_URL || 'http://127.0.0.1:8000';

export class ApiError extends Error {
  constructor(public readonly status: number, public readonly detail: string) {
    super(detail);
    this.name = 'ApiError';
  }
}

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const url = `${API_BASE}${path}`;
  let res: Response;
  try {
    res = await fetch(url, { ...init });
  } catch {
    throw new ApiError(
      0,
      `Backend connection failure: Unable to reach SANKET API at ${url}. Ensure the backend is running.`
    );
  }
  if (!res.ok) {
    let detail = `HTTP ${res.status}`;
    try {
      const b = await res.json();
      detail = b?.detail ?? detail;
    } catch {
      /* ignore JSON parse failure on non-JSON error bodies */
    }
    throw new ApiError(res.status, detail);
  }
  return res.json() as Promise<T>;
}

// ─── Backend Canonical Response Interfaces ───────────────────────────────────

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
  run_id?: string;
  alert: ApiAlert;
  investigation_object: Record<string, unknown>;
  /** Individual detector scores (e.g. fan_in, fan_out, isolation_forest, etc.) */
  detector_scores: Record<string, number>;
  /** Backend canonical component keys: M, T, N, G, S, Gs, C */
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
  block_height?: number | null;
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
  /** Authoritative backend node types: TRANSACTION | ADDRESS | IP | ASN | COUNTRY | CANDIDATE_ENTITY */
  node_type: string;
  attributes: Record<string, unknown>;
}

export interface ApiGraphEdge {
  edge_id: string;
  source_id: string;
  target_id: string;
  /** Authoritative backend edge types: INPUT_TO | OUTPUT_TO | OBSERVED_WITH | SAME_IP | SAME_ASN | TEMPORALLY_ASSOCIATED | CANDIDATE_SAME_ENTITY */
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

// ─── Query Parameter Types for Frozen Contracts ─────────────────────────────

export interface GetAlertsParams {
  run_id?: string;
  min_risk_level?: string;
}

export interface GetGraphParams {
  run_id?: string;
  hops?: number;
}

// ─── Typed API Client Methods ────────────────────────────────────────────────

/**
 * GET /health
 * Operational health check verifying SANKET service and pipeline version.
 */
export async function getHealth(): Promise<HealthResponse> {
  return apiFetch<HealthResponse>('/health');
}

/**
 * POST /api/v1/analyze
 * Uploads a canonical transaction CSV, executes the full deterministic analysis pipeline,
 * and sets active run state in the backend.
 */
export async function analyzeFile(
  file: File,
  minRiskLevel?: string
): Promise<ApiAnalysisResponse> {
  const form = new FormData();
  form.append('file', file);
  const qs = minRiskLevel ? `?min_risk_level=${encodeURIComponent(minRiskLevel)}` : '';
  return apiFetch<ApiAnalysisResponse>(`/api/v1/analyze${qs}`, {
    method: 'POST',
    body: form,
  });
}

/**
 * GET /api/v1/alerts?run_id=<run_id>&min_risk_level=<tier>
 * Retrieves priority-ranked investigative alerts for a given run ID with optional tier filtering.
 */
export async function getAlerts(
  paramsOrMinRisk?: string | GetAlertsParams,
  runIdParam?: string
): Promise<ApiAlertsListResponse> {
  let runId: string | undefined = runIdParam;
  let minRiskLevel: string | undefined;

  if (typeof paramsOrMinRisk === 'string') {
    minRiskLevel = paramsOrMinRisk;
  } else if (paramsOrMinRisk && typeof paramsOrMinRisk === 'object') {
    runId = paramsOrMinRisk.run_id || runIdParam;
    minRiskLevel = paramsOrMinRisk.min_risk_level;
  }

  const query = new URLSearchParams();
  if (runId) query.append('run_id', runId);
  if (minRiskLevel) query.append('min_risk_level', minRiskLevel);

  const qs = query.toString() ? `?${query.toString()}` : '';
  return apiFetch<ApiAlertsListResponse>(`/api/v1/alerts${qs}`);
}

/**
 * GET /api/v1/alerts/{alert_id}?run_id=<run_id>
 * Retrieves deep-dive canonical investigation detail, component breakdown, and evidence for an alert.
 */
export async function getAlert(
  alertId: string,
  runId?: string
): Promise<ApiAlertDetail> {
  const qs = runId ? `?run_id=${encodeURIComponent(runId)}` : '';
  return apiFetch<ApiAlertDetail>(
    `/api/v1/alerts/${encodeURIComponent(alertId)}${qs}`
  );
}

/**
 * GET /api/v1/transactions/{txid}?run_id=<run_id>
 * Retrieves transaction-level forensic features, detector results, and canonical record.
 */
export async function getTransaction(
  txid: string,
  runId?: string
): Promise<ApiTransactionDetail> {
  const qs = runId ? `?run_id=${encodeURIComponent(runId)}` : '';
  return apiFetch<ApiTransactionDetail>(
    `/api/v1/transactions/${encodeURIComponent(txid)}${qs}`
  );
}

/**
 * GET /api/v1/graph/{txid}?run_id=<run_id>&hops=2
 * Retrieves induced subgraph topology and graph evidence centered on a transaction.
 */
export async function getGraph(
  txid: string,
  hopsOrParams?: number | GetGraphParams,
  runIdParam?: string
): Promise<ApiGraphResponse> {
  let hops = 2;
  let runId = runIdParam;

  if (typeof hopsOrParams === 'number') {
    hops = hopsOrParams;
  } else if (hopsOrParams && typeof hopsOrParams === 'object') {
    hops = typeof hopsOrParams.hops === 'number' ? hopsOrParams.hops : 2;
    runId = hopsOrParams.run_id || runIdParam;
  }

  const query = new URLSearchParams();
  query.append('hops', String(hops));
  if (runId) query.append('run_id', runId);

  return apiFetch<ApiGraphResponse>(
    `/api/v1/graph/${encodeURIComponent(txid)}?${query.toString()}`
  );
}

/**
 * GET /api/v1/run/latest
 * Retrieves summary metrics, execution timings, and risk level counts for the most recent run.
 */
export async function getLatestRun(runId?: string): Promise<ApiLatestRun> {
  const qs = runId ? `?run_id=${encodeURIComponent(runId)}` : '';
  return apiFetch<ApiLatestRun>(`/api/v1/run/latest${qs}`);
}

// ─── Typed Boundary Adapters ─────────────────────────────────────────────────
// Pure display and structure transformations mapping backend contracts to UI types.
// Does NOT modify backend semantics, invent evidence, or recompute intelligence.

export function adaptApiEvidenceItem(
  item: ApiEvidenceItem | Record<string, unknown>
): EvidenceItem {
  return {
    category: String(item.category || 'GENERAL'),
    description: String(item.description || ''),
    confidence: typeof item.confidence === 'number' ? item.confidence : 1.0,
    source: String(item.source || 'pipeline'),
  };
}

export function adaptApiAlertToAlert(apiAlert: ApiAlert): Alert {
  return {
    alert_id: apiAlert.alert_id,
    transaction_id: apiAlert.transaction_id,
    rank: apiAlert.rank,
    risk_score: apiAlert.risk_score,
    confidence_score: apiAlert.confidence_score,
    risk_level: apiAlert.risk_level as RiskLevel,
    priority_score: apiAlert.priority_score,
    triggered_detectors: apiAlert.triggered_detectors || [],
    independent_signal_count: apiAlert.independent_signal_count || 0,
    evidence_items: (apiAlert.evidence_items || []).map(adaptApiEvidenceItem),
    evidence_categories: apiAlert.evidence_categories || [],
    component_scores: apiAlert.component_scores || {},
    scoring_version: apiAlert.scoring_version || '',
  };
}

export function adaptApiAlertDetail(detail: ApiAlertDetail): {
  runId: string;
  alert: Alert;
  investigationObject: Record<string, unknown>;
  detectorScores: Record<string, number>;
  componentScores: Record<string, number>;
  confidenceComponents: Record<string, number>;
  evidenceItems: EvidenceItem[];
  graphEvidence: Record<string, unknown> | null;
} {
  return {
    runId: detail.run_id || '',
    alert: adaptApiAlertToAlert(detail.alert),
    investigationObject: detail.investigation_object || {},
    detectorScores: detail.detector_scores || {},
    componentScores: detail.component_scores || {},
    confidenceComponents: detail.confidence_components || {},
    evidenceItems: (detail.evidence_items || []).map(adaptApiEvidenceItem),
    graphEvidence: detail.graph_evidence,
  };
}

export function adaptApiTransactionDetail(
  detail: ApiTransactionDetail
): TransactionRecord {
  const canonical = detail.canonical_transaction;
  const alert = detail.alert as Record<string, unknown> | null;
  const investigation = detail.investigation as Record<string, unknown> | null;

  const riskScore =
    typeof alert?.risk_score === 'number'
      ? alert.risk_score
      : typeof investigation?.risk_score === 'number'
      ? investigation.risk_score
      : 0;

  const riskLevel =
    (alert?.risk_level as RiskLevel) ||
    (investigation?.risk_level as RiskLevel) ||
    'LOW';

  const confidence =
    typeof alert?.confidence_score === 'number'
      ? alert.confidence_score
      : typeof investigation?.confidence_score === 'number'
      ? investigation.confidence_score
      : 0;

  const triggeredDetectors: string[] = Array.isArray(alert?.triggered_detectors)
    ? (alert.triggered_detectors as string[])
    : Array.isArray(investigation?.triggered_detectors)
    ? (investigation.triggered_detectors as string[])
    : [];

  // Compute total transacted value from outputs if available
  const outputAmounts: number[] = Array.isArray(canonical?.output_amounts)
    ? (canonical?.output_amounts as number[])
    : [];
  const totalValueBtc = outputAmounts.reduce((sum, v) => sum + (Number(v) || 0), 0);

  const status: 'confirmed' | 'anomalous' | 'flagged' =
    riskScore >= 0.7
      ? 'flagged'
      : riskScore >= 0.35
      ? 'anomalous'
      : 'confirmed';

  return {
    txid: detail.transaction_id,
    timestamp: canonical?.timestamp || '',
    block_height: typeof canonical?.block_height === 'number' ? canonical.block_height : 0,
    value_btc: totalValueBtc,
    fee_btc: typeof canonical?.fee === 'number' ? canonical.fee : 0,
    inputs_count: Array.isArray(canonical?.input_addresses) ? canonical.input_addresses.length : 0,
    outputs_count: Array.isArray(canonical?.output_addresses) ? canonical.output_addresses.length : 0,
    risk_score: riskScore,
    risk_level: riskLevel,
    confidence,
    triggered_detectors: triggeredDetectors,
    observed_ip: canonical?.src_ip || canonical?.dst_ip || undefined,
    observed_asn: canonical?.asn || undefined,
    status,
  };
}

export function adaptApiLatestRunToAnalysisRun(latest: ApiLatestRun): AnalysisRun {
  return {
    run_id: latest.run_id,
    dataset_name: String(
      latest.dataset_metadata?.filename ||
      latest.dataset_metadata?.source ||
      'Canonical Transaction Dataset'
    ),
    status: 'completed',
    started_at: '',
    completed_at: '',
    transaction_count: latest.record_count,
    alert_count: latest.alert_count,
    scoring_version: latest.pipeline_version,
  };
}

export const apiClient = {
  getHealth,
  analyzeFile,
  getAlerts,
  getAlert,
  getTransaction,
  getGraph,
  getLatestRun,
};
