// ============================================================
// SANKET — Graph UI Adapter
// Transforms canonical backend graph response shapes into
// the ForensicNode/ForensicEdge structures consumed by the
// existing graph page visualisation WITHOUT modifying backend
// contracts.
// ============================================================

import type { ApiGraphNode, ApiGraphResponse } from '@/lib/api';
import type { ForensicNode, ForensicEdge, ForensicNodeType, ForensicEdgeType } from '@/app/graph/page';
import type { RiskLevel } from '@/types';

// ── Presentation labels for backend canonical node types ─────────────────────
// These are ONLY used for display; the raw canonical values are preserved.
const NODE_TYPE_LABELS: Record<string, string> = {
  TRANSACTION: 'Transaction',
  ADDRESS: 'Address',
  IP: 'Network IP',
  ASN: 'ASN',
  COUNTRY: 'Country',
  CANDIDATE_ENTITY: 'Candidate Entity',
};

// ── Presentation labels for backend canonical edge types ─────────────────────
export const EDGE_TYPE_LABELS: Record<string, string> = {
  INPUT_TO: 'Input →',
  OUTPUT_TO: 'Output →',
  OBSERVED_WITH: 'Observed With',
  SAME_IP: 'Same IP',
  SAME_ASN: 'Same ASN',
  TEMPORALLY_ASSOCIATED: 'Temporal Assoc.',
  CANDIDATE_SAME_ENTITY: 'Candidate Same Entity',
};

// Component-score canonical key labels (for UI rendering)
export const COMPONENT_SCORE_LABELS: Record<string, string> = {
  M: 'Multivariate Anomaly (M)',
  T: 'Temporal (T)',
  N: 'Network (N)',
  G: 'Graph (G)',
  S: 'Structural (S)',
  Gs: 'Graph Support (Gs)',
  C: 'Confidence (C)',
};

// Confidence-component canonical key labels
export const CONFIDENCE_COMPONENT_LABELS: Record<string, string> = {
  D: 'Data Completeness (D)',
  E: 'Evidence Agreement (E)',
  S: 'Statistical Stability (S)',
  Gs: 'Graph Support (Gs)',
  X: 'Explanation Consistency (X)',
};

// ── Simple deterministic layout ───────────────────────────────────────────────
const CANVAS_W = 740;
const CANVAS_H = 460;

function layoutNodes(nodes: ApiGraphNode[]): Map<string, { x: number; y: number }> {
  const positions = new Map<string, { x: number; y: number }>();
  const n = nodes.length;
  if (n === 0) return positions;
  if (n === 1) {
    positions.set(nodes[0].node_id, { x: CANVAS_W / 2, y: CANVAS_H / 2 });
    return positions;
  }
  // Radial layout: TRANSACTION nodes at centre, rest around circumference
  const txNodes = nodes.filter(nd => nd.node_type === 'TRANSACTION');
  const otherNodes = nodes.filter(nd => nd.node_type !== 'TRANSACTION');

  // Place transactions in a small cluster near centre
  txNodes.forEach((nd, i) => {
    const angle = (2 * Math.PI * i) / Math.max(txNodes.length, 1);
    const r = txNodes.length > 1 ? 80 : 0;
    positions.set(nd.node_id, {
      x: CANVAS_W / 2 + r * Math.cos(angle),
      y: CANVAS_H / 2 + r * Math.sin(angle),
    });
  });

  // Place others in outer ring
  otherNodes.forEach((nd, i) => {
    const angle = (2 * Math.PI * i) / Math.max(otherNodes.length, 1) - Math.PI / 6;
    const r = Math.min(CANVAS_W, CANVAS_H) * 0.36;
    positions.set(nd.node_id, {
      x: CANVAS_W / 2 + r * Math.cos(angle),
      y: CANVAS_H / 2 + r * Math.sin(angle),
    });
  });

  return positions;
}

function riskLevelFromScore(score?: number): RiskLevel {
  if (score === undefined || score === null) return 'LOW';
  if (score >= 0.75) return 'CRITICAL';
  if (score >= 0.5) return 'HIGH';
  if (score >= 0.25) return 'MEDIUM';
  return 'LOW';
}

// ── Main adapter function ─────────────────────────────────────────────────────

export function adaptGraphResponse(
  response: ApiGraphResponse,
): { nodes: ForensicNode[]; edges: ForensicEdge[] } {
  const positions = layoutNodes(response.nodes);

  const nodes: ForensicNode[] = response.nodes.map((n) => {
    const pos = positions.get(n.node_id) ?? { x: CANVAS_W / 2, y: CANVAS_H / 2 };
    const attrs = n.attributes;

    // Risk: prefer explicit risk_score attribute from backend
    const riskScoreRaw = attrs.risk_score ?? attrs.score;
    const riskScore = typeof riskScoreRaw === 'number' ? riskScoreRaw : undefined;
    const riskLevel = riskLevelFromScore(riskScore);

    const nodeTypeLabel = NODE_TYPE_LABELS[n.node_type] ?? n.node_type;
    const label = typeof attrs.txid === 'string'
      ? `${String(attrs.txid).slice(0, 10)}...`
      : typeof attrs.address === 'string'
      ? `${String(attrs.address).slice(0, 10)}...`
      : n.node_id.slice(0, 14);

    const sublabelParts: string[] = [nodeTypeLabel];
    if (typeof attrs.timestamp === 'number') {
      sublabelParts.push(new Date(attrs.timestamp * 1000).toISOString().slice(0, 10));
    }

    // Build details from all attributes
    const details: Record<string, string> = {};
    for (const [k, v] of Object.entries(attrs)) {
      if (v !== null && v !== undefined) {
        details[k] = String(v);
      }
    }

    return {
      id: n.node_id,
      label,
      sublabel: sublabelParts.join(' · '),
      type: n.node_type as ForensicNodeType,
      risk: riskLevel,
      risk_score: riskScore,
      x: pos.x,
      y: pos.y,
      provenance:
        n.node_type === 'TRANSACTION' || n.node_type === 'ADDRESS'
          ? 'OBSERVED TRANSACTION DATA'
          : n.node_type === 'CANDIDATE_ENTITY'
          ? 'HEURISTIC CANDIDATE GROUPING'
          : 'NETWORK TELEMETRY OBSERVATION',
      metrics: {
        degree: 0,
        component_size: response.nodes.length,
        local_density: '—',
        unique_counterparties: 0,
      },
      details,
      evidence_snippets: [],
    };
  });

  const edges: ForensicEdge[] = response.edges.map((e) => ({
    id: e.edge_id,
    source: e.source_id,
    target: e.target_id,
    label: EDGE_TYPE_LABELS[e.edge_type] ?? e.edge_type,
    type: e.edge_type as ForensicEdgeType,
    is_heuristic: e.edge_type === 'CANDIDATE_SAME_ENTITY',
  }));

  return { nodes, edges };
}
