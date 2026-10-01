'use client';

import React, { useState, useMemo, useEffect, useCallback, Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import {
  GitBranch,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Layers,
  ChevronRight,
  Copy,
  Check,
  Download,
  ShieldAlert,
  ArrowLeftRight,
  Crosshair,
  Sparkles,
  RefreshCw,
} from 'lucide-react';
import { PageContainer } from '@/components/PageContainer';
import {
  Button,
  RiskBadge,
  IconButton,
  SearchInput,
  LoadingState,
  EmptyState,
} from '@/components/ui';
import { useRun } from '@/context/RunContext';
import {
  apiClient,
  ApiError,
  ApiGraphNode,
  ApiGraphEdge,
  ApiGraphResponse,
} from '@/lib/api';
import { RiskLevel } from '@/types';

// ============================================================
// Forensic Graph UI Types
// ============================================================

export type ForensicNodeType =
  | 'TRANSACTION'
  | 'ADDRESS'
  | 'CANDIDATE_ENTITY'
  | 'IP'
  | 'ASN'
  | 'COUNTRY';

export type ForensicEdgeType =
  | 'INPUT_TO'
  | 'OUTPUT_TO'
  | 'OBSERVED_WITH'
  | 'SAME_ASN'
  | 'TEMPORALLY_ASSOCIATED'
  | 'CANDIDATE_SAME_ENTITY';

export interface ForensicNode {
  id: string;
  label: string;
  sublabel: string;
  type: ForensicNodeType;
  risk?: RiskLevel | null;
  risk_score?: number | null;
  x: number;
  y: number;
  provenance: string;
  metrics: {
    degree: number;
    weighted_degree?: string;
    component_size: number | string;
    local_density: string;
    unique_counterparties: number | string;
  };
  details: Record<string, string>;
  evidence_snippets?: string[];
}

export interface ForensicEdge {
  id: string;
  source: string;
  target: string;
  label: string;
  type: ForensicEdgeType;
  is_heuristic?: boolean;
}

// Deterministic layout algorithm for bounded SVG canvas [740 x 460]
function layoutGraphNodes(
  centerNodeId: string,
  apiNodes: ApiGraphNode[],
  apiEdges: ApiGraphEdge[],
  alertRiskMap: Map<string, { risk_level: RiskLevel; risk_score: number }>,
  evidenceItems: Array<Record<string, unknown>>
): { nodes: ForensicNode[]; edges: ForensicEdge[] } {
  const CANVAS_WIDTH = 740;
  const CANVAS_HEIGHT = 460;
  const CENTER_X = CANVAS_WIDTH / 2; // 370
  const CENTER_Y = CANVAS_HEIGHT / 2; // 230

  // 1. Build adjacency for BFS distance
  const adj = new Map<string, Set<string>>();
  apiNodes.forEach((n) => adj.set(n.node_id, new Set()));
  apiEdges.forEach((e) => {
    adj.get(e.source_id)?.add(e.target_id);
    adj.get(e.target_id)?.add(e.source_id);
  });

  // 2. BFS distance from center node
  const dist = new Map<string, number>();
  const queue: string[] = [];

  const effectiveCenter = apiNodes.some((n) => n.node_id === centerNodeId)
    ? centerNodeId
    : apiNodes[0]?.node_id || '';

  if (effectiveCenter) {
    dist.set(effectiveCenter, 0);
    queue.push(effectiveCenter);
  }

  while (queue.length > 0) {
    const curr = queue.shift()!;
    const d = dist.get(curr)!;
    const neighbors = adj.get(curr) || new Set();
    neighbors.forEach((nbr) => {
      if (!dist.has(nbr)) {
        dist.set(nbr, d + 1);
        queue.push(nbr);
      }
    });
  }

  // Group nodes by distance
  const level0: ApiGraphNode[] = [];
  const level1: ApiGraphNode[] = [];
  const level2: ApiGraphNode[] = [];
  const levelOther: ApiGraphNode[] = [];

  apiNodes.forEach((n) => {
    const d = dist.get(n.node_id) ?? 99;
    if (d === 0) level0.push(n);
    else if (d === 1) level1.push(n);
    else if (d === 2) level2.push(n);
    else levelOther.push(n);
  });

  // Coordinate map
  const coords = new Map<string, { x: number; y: number }>();

  // Center node
  if (level0.length > 0) {
    coords.set(level0[0].node_id, { x: CENTER_X, y: CENTER_Y });
  }

  // 1-hop ring
  const R1_X = 140;
  const R1_Y = 110;
  level1.forEach((n, i) => {
    const angle = (2 * Math.PI * i) / Math.max(level1.length, 1) - Math.PI / 2;
    const x = Math.round(CENTER_X + R1_X * Math.cos(angle));
    const y = Math.round(CENTER_Y + R1_Y * Math.sin(angle));
    coords.set(n.node_id, {
      x: Math.max(50, Math.min(CANVAS_WIDTH - 50, x)),
      y: Math.max(45, Math.min(CANVAS_HEIGHT - 45, y)),
    });
  });

  // 2-hop ring
  const R2_X = 260;
  const R2_Y = 180;
  level2.forEach((n, i) => {
    const angle =
      (2 * Math.PI * i) / Math.max(level2.length, 1) -
      Math.PI / 2 +
      Math.PI / Math.max(level2.length, 1);
    const x = Math.round(CENTER_X + R2_X * Math.cos(angle));
    const y = Math.round(CENTER_Y + R2_Y * Math.sin(angle));
    coords.set(n.node_id, {
      x: Math.max(50, Math.min(CANVAS_WIDTH - 50, x)),
      y: Math.max(45, Math.min(CANVAS_HEIGHT - 45, y)),
    });
  });

  // Other / disconnected nodes placed along margins
  levelOther.forEach((n, i) => {
    const step = (CANVAS_WIDTH - 120) / Math.max(levelOther.length, 1);
    const x = Math.round(60 + i * step);
    const y = i % 2 === 0 ? 45 : CANVAS_HEIGHT - 45;
    coords.set(n.node_id, { x, y });
  });

  // 3. Assemble UI Nodes
  const formattedNodes: ForensicNode[] = apiNodes.map((n) => {
    const nodeType = (n.node_type || 'ADDRESS').toUpperCase() as ForensicNodeType;
    const pos = coords.get(n.node_id) || { x: CENTER_X, y: CENTER_Y };
    const degree = (adj.get(n.node_id) || new Set()).size;

    // Provenance strictly matches canonical node type
    let provenance = 'OBSERVED ON-CHAIN DATA';
    if (nodeType === 'TRANSACTION') provenance = 'OBSERVED TRANSACTION DATA';
    else if (nodeType === 'CANDIDATE_ENTITY') provenance = 'HEURISTIC CANDIDATE GROUPING';
    else if (nodeType === 'IP' || nodeType === 'ASN' || nodeType === 'COUNTRY') {
      provenance = 'NETWORK TELEMETRY OBSERVATION';
    }

    // Risk level strictly from real alerts or canonical attributes
    const alertInfo = alertRiskMap.get(n.node_id);
    const riskLevel: RiskLevel | null =
      alertInfo?.risk_level ||
      ((n.attributes?.risk_level as RiskLevel) || null);
    const riskScore: number | null =
      alertInfo?.risk_score ??
      (typeof n.attributes?.risk_score === 'number' ? n.attributes.risk_score : null);

    // Label and Sublabel
    let label = n.node_id;
    let sublabel: string = String(nodeType);

    if (nodeType === 'TRANSACTION') {
      label = n.node_id.length > 14 ? `${n.node_id.slice(0, 8)}...${n.node_id.slice(-6)}` : n.node_id;
      const fee = n.attributes?.fee;
      sublabel = typeof fee === 'number' && fee > 0 ? `Fee: ${fee.toFixed(5)} BTC` : 'Transaction';
    } else if (nodeType === 'ADDRESS') {
      label = n.node_id.length > 14 ? `${n.node_id.slice(0, 8)}...${n.node_id.slice(-6)}` : n.node_id;
      sublabel = 'Address';
    } else if (nodeType === 'CANDIDATE_ENTITY') {
      label = n.attributes?.lead_address
        ? `Entity: ${String(n.attributes.lead_address).slice(0, 10)}...`
        : n.node_id;
      const count = n.attributes?.member_count;
      sublabel = typeof count === 'number' ? `${count} Addrs (Heuristic)` : 'Candidate Entity';
    } else if (nodeType === 'IP') {
      label = String(n.attributes?.ip || n.node_id);
      sublabel = 'Observed IP';
    } else if (nodeType === 'ASN') {
      label = String(n.attributes?.asn || n.node_id);
      sublabel = 'Autonomous System';
    } else if (nodeType === 'COUNTRY') {
      label = String(n.attributes?.country || n.node_id);
      sublabel = 'GeoIP Country';
    }

    // Key-value attributes from real backend attributes
    const details: Record<string, string> = {};
    if (nodeType === 'TRANSACTION') {
      details['Transaction ID'] = n.node_id;
      if (typeof n.attributes?.timestamp === 'number') {
        details['Timestamp (Epoch)'] = String(n.attributes.timestamp);
      }
      if (typeof n.attributes?.fee === 'number') {
        details['Mining Fee'] = `${n.attributes.fee.toFixed(6)} BTC`;
      }
      if (typeof n.attributes?.input_count === 'number') {
        details['Input Count'] = String(n.attributes.input_count);
      }
      if (typeof n.attributes?.output_count === 'number') {
        details['Output Count'] = String(n.attributes.output_count);
      }
    } else if (nodeType === 'CANDIDATE_ENTITY') {
      details['Cluster ID'] = String(n.attributes?.cluster_id || n.node_id);
      if (n.attributes?.lead_address) {
        details['Lead Address'] = String(n.attributes.lead_address);
      }
      if (n.attributes?.member_count) {
        details['Member Count'] = `${n.attributes.member_count} addresses`;
      }
      details['Clustering Method'] = 'Common-Input Heuristic (Unconfirmed)';
    } else {
      Object.entries(n.attributes || {}).forEach(([k, v]) => {
        if (v !== null && v !== undefined && typeof v !== 'object') {
          details[k.replace(/_/g, ' ').toUpperCase()] = String(v);
        }
      });
    }

    // Evidence items for center node or nodes with evidence
    const nodeEvidence: string[] = [];
    if (n.node_id === effectiveCenter && Array.isArray(evidenceItems)) {
      evidenceItems.forEach((ev) => {
        if (typeof ev?.reason === 'string') {
          nodeEvidence.push(ev.reason);
        } else if (typeof ev?.description === 'string') {
          nodeEvidence.push(ev.description);
        }
      });
    }

    return {
      id: n.node_id,
      label,
      sublabel,
      type: nodeType,
      risk: riskLevel,
      risk_score: riskScore,
      x: pos.x,
      y: pos.y,
      provenance,
      metrics: {
        degree,
        component_size: apiNodes.length,
        local_density: (degree / Math.max(apiNodes.length - 1, 1)).toFixed(2),
        unique_counterparties: degree,
      },
      details,
      evidence_snippets: nodeEvidence.length > 0 ? nodeEvidence : undefined,
    };
  });

  // 4. Assemble UI Edges
  const formattedEdges: ForensicEdge[] = apiEdges.map((e) => {
    const edgeType = (e.edge_type || 'OBSERVED_WITH').toUpperCase() as ForensicEdgeType;
    const isHeuristic =
      edgeType === 'CANDIDATE_SAME_ENTITY' ||
      edgeType === 'TEMPORALLY_ASSOCIATED' ||
      Boolean(e.metadata?.is_heuristic_only);

    let label = edgeType.replace(/_/g, ' ');
    if (edgeType === 'INPUT_TO') {
      const amt = e.attributes?.amount;
      label = typeof amt === 'number' && amt > 0 ? `${amt.toFixed(3)} BTC In` : 'Input To';
    } else if (edgeType === 'OUTPUT_TO') {
      const amt = e.attributes?.amount;
      label = typeof amt === 'number' && amt > 0 ? `${amt.toFixed(3)} BTC Out` : 'Output To';
    } else if (edgeType === 'OBSERVED_WITH') {
      label = 'Observed Broadcast';
    } else if (edgeType === 'SAME_ASN') {
      label = 'BGP Route';
    } else if (edgeType === 'TEMPORALLY_ASSOCIATED') {
      const dt = e.attributes?.time_delta_seconds;
      label = typeof dt === 'number' ? `Δ ${Math.round(dt)}s` : 'Temporal Link';
    } else if (edgeType === 'CANDIDATE_SAME_ENTITY') {
      label = 'Candidate Entity (Heuristic)';
    }

    return {
      id: e.edge_id,
      source: e.source_id,
      target: e.target_id,
      label,
      type: edgeType,
      is_heuristic: isHeuristic,
    };
  });

  return { nodes: formattedNodes, edges: formattedEdges };
}

function GraphWorkspaceContent() {
  const searchParams = useSearchParams();
  const initialQuery =
    searchParams.get('txid') ||
    searchParams.get('entity') ||
    searchParams.get('node') ||
    searchParams.get('search') ||
    '';

  const { runId, currentRun, isHydrated } = useRun();
  const [activeRunId, setActiveRunId] = useState<string | null>(runId);
  const [centerNodeId, setCenterNodeId] = useState<string>(initialQuery);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const [graphNodes, setGraphNodes] = useState<ForensicNode[]>([]);
  const [graphEdges, setGraphEdges] = useState<ForensicEdge[]>([]);
  const [graphEvidence, setGraphEvidence] = useState<Record<string, unknown> | null>(null);

  const [selectedNodeId, setSelectedNodeId] = useState<string>('');
  const [zoomLevel, setZoomLevel] = useState<number>(100);
  const [panOffset, setPanOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [startPan, setStartPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [showLegend, setShowLegend] = useState(true);
  const [nodeTypeFilter, setNodeTypeFilter] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [copiedId, setCopiedId] = useState(false);
  const [focusNeighborhoodOnly, setFocusNeighborhoodOnly] = useState(false);

  // Load graph data for active run & selected center node
  const fetchGraphData = useCallback(async (targetId?: string) => {
    setLoading(true);
    setError(null);

    let effectiveRunId = runId;

    // Discover active run if not hydrated
    if (!effectiveRunId) {
      try {
        const latest = await apiClient.getLatestRun();
        if (latest && latest.run_id) {
          effectiveRunId = latest.run_id;
        }
      } catch {
        // No active run
      }
    }

    if (!effectiveRunId) {
      setLoading(false);
      setActiveRunId(null);
      setGraphNodes([]);
      setGraphEdges([]);
      return;
    }

    setActiveRunId(effectiveRunId);

    try {
      // 1. Resolve center node to query
      let queryCenter = targetId || initialQuery;

      // 2. Fetch active run alerts to resolve risk levels and fallback center node
      const alertMap = new Map<string, { risk_level: RiskLevel; risk_score: number }>();
      try {
        const alertsRes = await apiClient.getAlerts({ run_id: effectiveRunId });
        (alertsRes?.alerts || []).forEach((a) => {
          if (a.transaction_id) {
            alertMap.set(a.transaction_id, {
              risk_level: a.risk_level,
              risk_score: a.risk_score,
            });
          }
        });
        if (!queryCenter && alertsRes?.alerts && alertsRes.alerts.length > 0) {
          queryCenter = alertsRes.alerts[0].transaction_id;
        }
      } catch {
        // Non-fatal if alerts fetch fails
      }

      if (!queryCenter) {
        setLoading(false);
        setGraphNodes([]);
        setGraphEdges([]);
        return;
      }

      setCenterNodeId(queryCenter);

      // 3. Fetch real graph from SANKET backend
      const graphRes: ApiGraphResponse = await apiClient.getGraph(
        queryCenter,
        { hops: 2, run_id: effectiveRunId }
      );

      const evItems = Array.isArray(graphRes.graph_evidence?.evidence_items)
        ? (graphRes.graph_evidence.evidence_items as Array<Record<string, unknown>>)
        : [];

      // 4. Layout nodes deterministically on SVG canvas
      const { nodes, edges } = layoutGraphNodes(
        queryCenter,
        graphRes.nodes || [],
        graphRes.edges || [],
        alertMap,
        evItems
      );

      setGraphNodes(nodes);
      setGraphEdges(edges);
      setGraphEvidence(graphRes.graph_evidence || null);

      // Set initial selected node
      const match = nodes.find((n) => n.id.toLowerCase() === queryCenter.toLowerCase());
      setSelectedNodeId(match ? match.id : nodes[0]?.id || '');
    } catch (err: unknown) {
      const msg =
        err instanceof ApiError
          ? err.detail
          : err instanceof Error
          ? err.message
          : 'Failed to retrieve forensic relationship graph from API.';
      setError(msg);
      setGraphNodes([]);
      setGraphEdges([]);
    } finally {
      setLoading(false);
    }
  }, [runId, initialQuery]);

  useEffect(() => {
    if (!isHydrated) return;
    let isCancelled = false;

    const init = async () => {
      await Promise.resolve();
      if (!isCancelled) {
        fetchGraphData();
      }
    };
    init();

    return () => {
      isCancelled = true;
    };
  }, [isHydrated, fetchGraphData]);

  // Selected node object
  const selectedNode = useMemo(() => {
    return graphNodes.find((n) => n.id === selectedNodeId) || graphNodes[0] || null;
  }, [graphNodes, selectedNodeId]);

  // Connected edges to selected node
  const connectedEdges = useMemo(() => {
    if (!selectedNodeId) return [];
    return graphEdges.filter(
      (e) => e.source === selectedNodeId || e.target === selectedNodeId
    );
  }, [graphEdges, selectedNodeId]);

  // Connected node IDs
  const connectedNodeIds = useMemo(() => {
    const ids = new Set<string>();
    if (selectedNodeId) {
      ids.add(selectedNodeId);
      connectedEdges.forEach((e) => {
        ids.add(e.source);
        ids.add(e.target);
      });
    }
    return ids;
  }, [selectedNodeId, connectedEdges]);

  // Related neighbor nodes for detail drawer
  const relatedNeighborNodes = useMemo(() => {
    return graphNodes.filter(
      (n) => n.id !== selectedNodeId && connectedNodeIds.has(n.id)
    );
  }, [graphNodes, selectedNodeId, connectedNodeIds]);

  // Filtered nodes
  const visibleNodes = useMemo(() => {
    return graphNodes.filter((n) => {
      // Type filter
      if (nodeTypeFilter !== 'ALL' && n.type !== nodeTypeFilter) return false;

      // Neighborhood focus
      if (focusNeighborhoodOnly && !connectedNodeIds.has(n.id)) return false;

      // Search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchId = n.id.toLowerCase().includes(q);
        const matchLabel = n.label.toLowerCase().includes(q);
        const matchSub = n.sublabel.toLowerCase().includes(q);
        if (!matchId && !matchLabel && !matchSub) return false;
      }

      return true;
    });
  }, [graphNodes, nodeTypeFilter, focusNeighborhoodOnly, connectedNodeIds, searchQuery]);

  const visibleNodeIds = useMemo(() => {
    return new Set(visibleNodes.map((n) => n.id));
  }, [visibleNodes]);

  // Filtered edges
  const visibleEdges = useMemo(() => {
    return graphEdges.filter(
      (e) => visibleNodeIds.has(e.source) && visibleNodeIds.has(e.target)
    );
  }, [graphEdges, visibleNodeIds]);

  // Node type counts for metrics strip
  const txCount = useMemo(() => visibleNodes.filter((n) => n.type === 'TRANSACTION').length, [visibleNodes]);
  const addressCount = useMemo(() => visibleNodes.filter((n) => n.type === 'ADDRESS').length, [visibleNodes]);
  const networkCount = useMemo(
    () => visibleNodes.filter((n) => n.type === 'IP' || n.type === 'ASN' || n.type === 'COUNTRY').length,
    [visibleNodes]
  );
  const entityCount = useMemo(
    () => visibleNodes.filter((n) => n.type === 'CANDIDATE_ENTITY').length,
    [visibleNodes]
  );

  // Pan handlers for canvas
  const handleMouseDown = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).tagName === 'svg' || (e.target as HTMLElement).id === 'graph-canvas-bg') {
      setIsPanning(true);
      setStartPan({ x: e.clientX - panOffset.x, y: e.clientY - panOffset.y });
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isPanning) return;
    setPanOffset({
      x: e.clientX - startPan.x,
      y: e.clientY - startPan.y,
    });
  };

  const handleMouseUp = () => {
    setIsPanning(false);
  };

  const handleCopyNodeId = (id: string) => {
    navigator.clipboard?.writeText(id);
    setCopiedId(true);
    setTimeout(() => setCopiedId(false), 2000);
  };

  const resetView = () => {
    setZoomLevel(100);
    setPanOffset({ x: 0, y: 0 });
    setFocusNeighborhoodOnly(false);
    setNodeTypeFilter('ALL');
    setSearchQuery('');
  };

  const handleExportSubgraph = () => {
    if (graphNodes.length === 0) return;
    const exportData = {
      center_id: centerNodeId,
      nodes: graphNodes.map((n) => ({ id: n.id, type: n.type, attributes: n.details })),
      edges: graphEdges.map((e) => ({ id: e.id, source: e.source, target: e.target, type: e.type })),
      exported_at: new Date().toISOString(),
    };
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `graph_${centerNodeId || 'export'}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim().length > 4) {
      fetchGraphData(searchQuery.trim());
    }
  };

  return (
    <PageContainer
      title="GRAPH INVESTIGATION"
      description="Explore observed transaction, address, network, and candidate-entity relationships."
      tag="RELATIONSHIP GRAPH"
      icon={<GitBranch size={18} />}
      actions={
        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setFocusNeighborhoodOnly((f) => !f)}
            disabled={graphNodes.length === 0}
          >
            <Crosshair
              size={13}
              className={focusNeighborhoodOnly ? 'text-[var(--accent-primary-light)]' : ''}
            />
            <span>{focusNeighborhoodOnly ? 'Show Full Graph' : 'Focus Neighborhood'}</span>
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={handleExportSubgraph}
            disabled={graphNodes.length === 0}
          >
            <Download size={13} />
            <span>Export Subgraph</span>
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        {/* ── 1. Page Header Metadata Context ── */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 bg-[var(--surface-1)] border border-[var(--border-default)] rounded-[var(--radius-md)] text-xs font-mono">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] uppercase text-[var(--text-tertiary)]">ACTIVE RUN:</span>
              <span className="font-semibold text-[var(--accent-primary-light)]">
                {activeRunId || 'NONE'}
              </span>
            </div>
            <span className="text-[var(--border-strong)]">|</span>
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] uppercase text-[var(--text-tertiary)]">DATASET:</span>
              <span className="text-[var(--text-primary)] font-medium">
                {(currentRun?.dataset_metadata?.filename as string) ||
                  (currentRun?.dataset_metadata?.source as string) ||
                  (activeRunId ? 'Active Ingested Dataset' : '—')}
              </span>
            </div>
            <span className="text-[var(--border-strong)]">|</span>
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] uppercase text-[var(--text-tertiary)]">TOPOLOGY:</span>
              <span className="text-[var(--text-secondary)]">
                2-Hop Subgraph ({centerNodeId.length > 20 ? `${centerNodeId.slice(0, 10)}...${centerNodeId.slice(-6)}` : centerNodeId || 'None'})
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2 text-[11px] text-[var(--text-secondary)]">
            <span className="w-1.5 h-1.5 rounded-full bg-[var(--risk-low)]" />
            <span className="uppercase tracking-wider">AIRGAPPED / OFFLINE</span>
          </div>
        </div>

        {/* ── Error Banner ── */}
        {error && (
          <div className="p-4 bg-[var(--risk-critical-subtle)] border border-[var(--risk-critical)] rounded-[var(--radius-md)] flex items-start justify-between gap-3">
            <div className="flex items-start gap-2.5">
              <ShieldAlert size={18} className="text-[var(--risk-critical)] shrink-0 mt-0.5" />
              <div>
                <div className="text-xs font-bold text-[var(--risk-critical)] uppercase tracking-wide">
                  Graph API Error
                </div>
                <div className="text-xs text-[var(--text-secondary)] mt-0.5">
                  {error}
                </div>
              </div>
            </div>
            <Button variant="secondary" size="sm" onClick={() => fetchGraphData(centerNodeId)}>
              <RefreshCw size={13} />
              <span>Retry</span>
            </Button>
          </div>
        )}

        {/* ── 2. Compact Graph Metrics Strip ── */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5 font-mono text-xs">
          <div className="p-2.5 bg-[var(--surface-1)] border border-[var(--border-default)] rounded-[var(--radius-sm)] flex items-center justify-between">
            <span className="text-[10px] uppercase text-[var(--text-tertiary)]">VISIBLE NODES</span>
            <span className="font-bold text-[var(--text-primary)]">{visibleNodes.length}</span>
          </div>
          <div className="p-2.5 bg-[var(--surface-1)] border border-[var(--border-default)] rounded-[var(--radius-sm)] flex items-center justify-between">
            <span className="text-[10px] uppercase text-[var(--text-tertiary)]">EDGES</span>
            <span className="font-bold text-[var(--text-primary)]">{visibleEdges.length}</span>
          </div>
          <div className="p-2.5 bg-[var(--surface-1)] border border-[var(--border-default)] rounded-[var(--radius-sm)] flex items-center justify-between">
            <span className="text-[10px] uppercase text-[var(--text-tertiary)]">TRANSACTIONS</span>
            <span className="font-bold text-[var(--accent-primary-light)]">{txCount}</span>
          </div>
          <div className="p-2.5 bg-[var(--surface-1)] border border-[var(--border-default)] rounded-[var(--radius-sm)] flex items-center justify-between">
            <span className="text-[10px] uppercase text-[var(--text-tertiary)]">ADDRESSES</span>
            <span className="font-bold text-[var(--text-secondary)]">{addressCount}</span>
          </div>
          <div className="p-2.5 bg-[var(--surface-1)] border border-[var(--border-default)] rounded-[var(--radius-sm)] flex items-center justify-between">
            <span className="text-[10px] uppercase text-[var(--text-tertiary)]">NETWORK NODES</span>
            <span className="font-bold text-[var(--text-secondary)]">{networkCount}</span>
          </div>
          <div className="p-2.5 bg-[var(--surface-1)] border border-[var(--border-default)] rounded-[var(--radius-sm)] flex items-center justify-between">
            <span className="text-[10px] uppercase text-[var(--text-tertiary)]">CANDIDATE ENTITIES</span>
            <span className="font-bold text-[var(--risk-critical)]">
              {entityCount} Cluster{entityCount !== 1 ? 's' : ''}
            </span>
          </div>
        </div>

        {/* ── 3. Main Workspace Grid: Canvas + Investigation Dossier ── */}
        {loading ? (
          <LoadingState message="Extracting induced subgraph topology from API..." />
        ) : graphNodes.length === 0 ? (
          <EmptyState
            icon={<GitBranch size={24} />}
            title="NO GRAPH DATA AVAILABLE"
            description={
              activeRunId
                ? `No graph nodes found for active analysis run '${activeRunId}'. Query a specific transaction ID or run a new analysis.`
                : 'No active analysis run found. Please upload and analyze a dataset to inspect graph relationships.'
            }
            action={
              <Link href="/analyze">
                <Button variant="primary" size="sm">
                  <span>GO TO ANALYZE</span>
                </Button>
              </Link>
            }
          />
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
            {/* Main Graph Canvas Area */}
            <div className="lg:col-span-8 bg-[var(--surface-1)] border border-[var(--border-default)] rounded-[var(--radius-md)] flex flex-col justify-between relative overflow-hidden h-[620px]">
              {/* Top Canvas Controls Bar */}
              <div className="p-3 border-b border-[var(--border-subtle)] flex flex-wrap items-center justify-between gap-3 z-10 bg-[var(--bg-primary)]/90 backdrop-blur-xs">
                <form onSubmit={handleSearchSubmit} className="flex items-center gap-2">
                  <SearchInput
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Locate node ID / address hash..."
                    className="w-52"
                  />

                  <select
                    value={nodeTypeFilter}
                    onChange={(e) => setNodeTypeFilter(e.target.value)}
                    className="h-8 px-2 text-[11px] font-mono bg-[var(--surface-2)] text-[var(--text-secondary)] border border-[var(--border-default)] rounded-[var(--radius-sm)] focus:outline-none focus:border-[var(--accent-primary-border)]"
                  >
                    <option value="ALL">All Node Types</option>
                    <option value="TRANSACTION">Transactions</option>
                    <option value="ADDRESS">Addresses</option>
                    <option value="CANDIDATE_ENTITY">Candidate Entities</option>
                    <option value="IP">Network IPs</option>
                    <option value="ASN">ASNs</option>
                    <option value="COUNTRY">Countries</option>
                  </select>
                </form>

                {/* Pan & Zoom Controls */}
                <div className="flex items-center gap-1.5 font-mono text-xs">
                  <span className="text-[11px] text-[var(--text-tertiary)] mr-1">
                    {zoomLevel}%
                  </span>
                  <IconButton
                    icon={<ZoomIn size={14} />}
                    label="Zoom in (+10%)"
                    size="sm"
                    onClick={() => setZoomLevel((z) => Math.min(z + 10, 160))}
                  />
                  <IconButton
                    icon={<ZoomOut size={14} />}
                    label="Zoom out (-10%)"
                    size="sm"
                    onClick={() => setZoomLevel((z) => Math.max(z - 10, 60))}
                  />
                  <IconButton
                    icon={<RotateCcw size={14} />}
                    label="Reset view & center"
                    size="sm"
                    onClick={resetView}
                  />
                  <IconButton
                    icon={<Layers size={14} />}
                    label="Toggle legend"
                    size="sm"
                    onClick={() => setShowLegend((l) => !l)}
                    className={showLegend ? 'text-[var(--accent-primary-light)]' : ''}
                  />
                </div>
              </div>

              {/* SVG Interactive Canvas */}
              <div
                id="graph-canvas-bg"
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                className="relative flex-1 w-full h-full bg-[#080808] bg-grid-subtle flex items-center justify-center overflow-hidden select-none cursor-grab active:cursor-grabbing"
              >
                {visibleNodes.length === 0 ? (
                  <div className="text-center p-8 font-mono">
                    <p className="text-xs text-[var(--text-tertiary)] mb-2">
                      No graph nodes match the filter criteria.
                    </p>
                    <Button variant="secondary" size="sm" onClick={resetView}>
                      <span>Reset Graph Filter</span>
                    </Button>
                  </div>
                ) : (
                  <svg
                    className="w-full h-full"
                    viewBox="0 0 740 460"
                    style={{
                      transform: `scale(${zoomLevel / 100}) translate(${panOffset.x}px, ${panOffset.y}px)`,
                      transformOrigin: 'center center',
                      transition: isPanning ? 'none' : 'transform 0.15s ease-out',
                    }}
                  >
                    <defs>
                      <marker
                        id="arrow-default"
                        viewBox="0 0 10 10"
                        refX="22"
                        refY="5"
                        markerWidth="5"
                        markerHeight="5"
                        orient="auto-start-reverse"
                      >
                        <path d="M 0 1.5 L 8 5 L 0 8.5 z" fill="#3a3835" />
                      </marker>
                      <marker
                        id="arrow-highlighted"
                        viewBox="0 0 10 10"
                        refX="22"
                        refY="5"
                        markerWidth="6"
                        markerHeight="6"
                        orient="auto-start-reverse"
                      >
                        <path d="M 0 1.5 L 8 5 L 0 8.5 z" fill="var(--accent-primary)" />
                      </marker>
                    </defs>

                    {/* ── Edges Layer ── */}
                    {visibleEdges.map((edge) => {
                      const sourceNode = graphNodes.find((n) => n.id === edge.source);
                      const targetNode = graphNodes.find((n) => n.id === edge.target);
                      if (!sourceNode || !targetNode) return null;

                      const isConnectedToSelected =
                        selectedNodeId === edge.source || selectedNodeId === edge.target;
                      const isDimmed = selectedNodeId && !isConnectedToSelected;

                      const strokeColor = isConnectedToSelected
                        ? 'var(--accent-primary)'
                        : edge.is_heuristic
                        ? '#6B5A38'
                        : '#282724';

                      const strokeWidth = isConnectedToSelected ? 2 : edge.is_heuristic ? 1.4 : 1.2;

                      return (
                        <g
                          key={edge.id}
                          className="transition-opacity duration-150"
                          opacity={isDimmed ? 0.25 : 1}
                        >
                          <line
                            x1={sourceNode.x}
                            y1={sourceNode.y}
                            x2={targetNode.x}
                            y2={targetNode.y}
                            stroke={strokeColor}
                            strokeWidth={strokeWidth}
                            strokeDasharray={edge.is_heuristic ? '4 3' : undefined}
                            markerEnd={
                              edge.type === 'INPUT_TO' || edge.type === 'OUTPUT_TO'
                                ? isConnectedToSelected
                                  ? 'url(#arrow-highlighted)'
                                  : 'url(#arrow-default)'
                                : undefined
                            }
                          />
                          {/* Edge Label Pill */}
                          <rect
                            x={(sourceNode.x + targetNode.x) / 2 - 36}
                            y={(sourceNode.y + targetNode.y) / 2 - 8}
                            width="72"
                            height="14"
                            rx="2"
                            fill="#0d0d0d"
                            stroke={isConnectedToSelected ? 'var(--accent-primary-border)' : '#1a1917'}
                            strokeWidth="0.8"
                          />
                          <text
                            x={(sourceNode.x + targetNode.x) / 2}
                            y={(sourceNode.y + targetNode.y) / 2 + 2}
                            fill={isConnectedToSelected ? 'var(--accent-primary-light)' : '#6f6c66'}
                            fontSize="8"
                            fontFamily="var(--font-mono)"
                            textAnchor="middle"
                            className="pointer-events-none select-none"
                          >
                            {edge.label.length > 15 ? edge.label.slice(0, 14) + '…' : edge.label}
                          </text>
                        </g>
                      );
                    })}

                    {/* ── Nodes Layer ── */}
                    {visibleNodes.map((node) => {
                      const isSelected = selectedNodeId === node.id;
                      const isNeighbor = connectedNodeIds.has(node.id);
                      const isDimmed = selectedNodeId && !isSelected && !isNeighbor;

                      return (
                        <g
                          key={node.id}
                          onClick={() => setSelectedNodeId(node.id)}
                          className="cursor-pointer transition-opacity duration-150"
                          opacity={isDimmed ? 0.3 : 1}
                        >
                          {/* Node Shape Geometry */}
                          {node.type === 'TRANSACTION' ? (
                            <polygon
                              points={`${node.x},${node.y - 19} ${node.x + 19},${node.y} ${node.x},${node.y + 19} ${node.x - 19},${node.y}`}
                              fill="#141414"
                              stroke={
                                isSelected
                                  ? 'var(--accent-primary)'
                                  : node.risk === 'CRITICAL'
                                  ? 'var(--risk-critical)'
                                  : node.risk === 'HIGH'
                                  ? 'var(--risk-high)'
                                  : '#383632'
                              }
                              strokeWidth={isSelected ? 2.5 : 1.5}
                            />
                          ) : node.type === 'CANDIDATE_ENTITY' ? (
                            <polygon
                              points={`${node.x},${node.y - 20} ${node.x + 18},${node.y - 10} ${node.x + 18},${node.y + 10} ${node.x},${node.y + 20} ${node.x - 18},${node.y + 10} ${node.x - 18},${node.y - 10}`}
                              fill="#171510"
                              stroke={isSelected ? 'var(--accent-primary)' : 'var(--accent-primary-border)'}
                              strokeWidth={isSelected ? 2.5 : 1.8}
                              strokeDasharray="4 2"
                            />
                          ) : node.type === 'IP' ? (
                            <rect
                              x={node.x - 15}
                              y={node.y - 15}
                              width={30}
                              height={30}
                              rx={3}
                              fill="#141414"
                              stroke={isSelected ? 'var(--accent-primary)' : '#3d3a36'}
                              strokeWidth={isSelected ? 2.5 : 1.5}
                            />
                          ) : node.type === 'ASN' ? (
                            <rect
                              x={node.x - 14}
                              y={node.y - 14}
                              width={28}
                              height={28}
                              rx={6}
                              fill="#121212"
                              stroke={isSelected ? 'var(--accent-primary)' : '#44403a'}
                              strokeWidth={isSelected ? 2.5 : 1.5}
                            />
                          ) : node.type === 'COUNTRY' ? (
                            <circle
                              cx={node.x}
                              cy={node.y}
                              r={13}
                              fill="#121212"
                              stroke={isSelected ? 'var(--accent-primary)' : '#33312c'}
                              strokeWidth={isSelected ? 2.5 : 1.2}
                            />
                          ) : (
                            <circle
                              cx={node.x}
                              cy={node.y}
                              r={16}
                              fill="#141414"
                              stroke={
                                isSelected
                                  ? 'var(--accent-primary)'
                                  : node.risk === 'CRITICAL'
                                  ? 'var(--risk-critical)'
                                  : node.risk === 'HIGH'
                                  ? 'var(--risk-high)'
                                  : '#383632'
                              }
                              strokeWidth={isSelected ? 2.5 : 1.5}
                            />
                          )}

                          {/* Center Indicator Pip */}
                          <circle
                            cx={node.x}
                            cy={node.y}
                            r={3.5}
                            fill={
                              isSelected
                                ? 'var(--accent-primary)'
                                : node.risk === 'CRITICAL'
                                ? 'var(--risk-critical)'
                                : node.risk === 'HIGH'
                                ? 'var(--risk-high)'
                                : node.type === 'CANDIDATE_ENTITY'
                                ? 'var(--accent-primary-light)'
                                : '#88857f'
                            }
                          />

                          {/* Node Label */}
                          <text
                            x={node.x}
                            y={node.y + 28}
                            fill={isSelected ? 'var(--accent-primary-light)' : '#c2beba'}
                            fontSize="9.5"
                            fontFamily="var(--font-mono)"
                            fontWeight={isSelected ? 'bold' : 'normal'}
                            textAnchor="middle"
                            className="select-none"
                          >
                            {node.label}
                          </text>

                          {/* Node Sublabel */}
                          <text
                            x={node.x}
                            y={node.y + 38}
                            fill="#6e6b66"
                            fontSize="7.5"
                            fontFamily="var(--font-mono)"
                            textAnchor="middle"
                            className="select-none"
                          >
                            {node.sublabel}
                          </text>
                        </g>
                      );
                    })}
                  </svg>
                )}
              </div>

              {/* Bottom Collapsible Legend */}
              {showLegend && (
                <div className="p-3 border-t border-[var(--border-subtle)] bg-[var(--bg-primary)]/90 backdrop-blur-xs flex flex-wrap items-center justify-between gap-3 text-[10px] font-mono text-[var(--text-tertiary)]">
                  <div className="flex flex-wrap items-center gap-4">
                    <span className="flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-full border border-[var(--border-strong)] bg-[var(--surface-2)]" />
                      Address (Circle)
                    </span>
                    <span className="flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rotate-45 border border-[var(--border-strong)] bg-[var(--surface-2)]" />
                      Transaction (Diamond)
                    </span>
                    <span className="flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 border border-dashed border-[var(--accent-primary)] bg-[var(--surface-2)]" />
                      Candidate Entity (Hexagon, Heuristic)
                    </span>
                    <span className="flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-xs border border-[var(--border-strong)] bg-[var(--surface-2)]" />
                      Network IP (Square)
                    </span>
                    <span className="flex items-center gap-1.5">
                      <span className="w-4 h-[1px] border-b border-dashed border-[var(--accent-primary)]" />
                      Heuristic Link (Dashed)
                    </span>
                  </div>
                  <div className="text-[9px] uppercase tracking-wider text-[var(--text-muted)]">
                    Click node to inspect neighborhood
                  </div>
                </div>
              )}
            </div>

            {/* ── 4. Right Side: Node Forensic Dossier Panel ── */}
            <div className="lg:col-span-4 bg-[var(--surface-1)] border border-[var(--border-default)] rounded-[var(--radius-md)] p-5 flex flex-col justify-between space-y-5 overflow-y-auto max-h-[620px] font-mono text-xs">
              {selectedNode ? (
                <div className="space-y-4">
                  {/* Header */}
                  <div className="flex items-center justify-between pb-3 border-b border-[var(--border-subtle)]">
                    <div>
                      <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-tertiary)] block">
                        NODE INVESTIGATION DOSSIER
                      </span>
                      <div className="text-xs font-bold text-[var(--text-primary)] mt-0.5">
                        {selectedNode.type} NODE
                      </div>
                    </div>
                    {selectedNode.risk ? (
                      <RiskBadge level={selectedNode.risk} size="sm" />
                    ) : (
                      <span className="text-[10px] text-[var(--text-tertiary)] font-mono">—</span>
                    )}
                  </div>

                  {/* Node ID & Provenance */}
                  <div className="p-3.5 bg-[var(--surface-2)] border border-[var(--border-default)] rounded-[var(--radius-sm)] space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="text-xs font-bold text-[var(--accent-primary-light)] break-all">
                        {selectedNode.id}
                      </div>
                      <button
                        onClick={() => handleCopyNodeId(selectedNode.id)}
                        className="p-1 text-[var(--text-tertiary)] hover:text-[var(--text-primary)] bg-[var(--surface-3)] rounded-[var(--radius-xs)] transition-colors shrink-0"
                        title="Copy Node ID"
                      >
                        {copiedId ? <Check size={13} className="text-[var(--risk-low)]" /> : <Copy size={13} />}
                      </button>
                    </div>

                    <div className="pt-2 border-t border-[var(--border-subtle)] flex items-center justify-between text-[10px] text-[var(--text-secondary)]">
                      <span className="text-[var(--text-tertiary)]">PROVENANCE:</span>
                      <span className="font-semibold text-[var(--text-primary)]">
                        {selectedNode.provenance}
                      </span>
                    </div>

                    {selectedNode.type === 'CANDIDATE_ENTITY' && (
                      <div className="p-2 bg-[var(--surface-1)] border border-[var(--accent-primary-border)] rounded-[var(--radius-xs)] text-[10px] text-[var(--accent-primary-light)] leading-relaxed">
                        <span className="font-bold">HEURISTIC ONLY · OWNERSHIP NOT ESTABLISHED:</span> Derived from on-chain multi-input spending clustering.
                      </div>
                    )}
                  </div>

                  {/* Exact Graph Engine Metrics */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between text-[10px] uppercase text-[var(--text-tertiary)] font-bold">
                      <span>TOPOLOGY GRAPH METRICS</span>
                      {Boolean(
                        selectedNode.id === centerNodeId &&
                          graphEvidence?.metrics &&
                          typeof (graphEvidence.metrics as Record<string, unknown>).composite_graph_score === 'number'
                      ) ? (
                        <span className="text-[9px] text-[var(--accent-primary-light)]">
                          Risk G: {Number((graphEvidence!.metrics as Record<string, unknown>).composite_graph_score).toFixed(2)}
                        </span>
                      ) : null}
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div className="p-2.5 bg-[var(--surface-2)] border border-[var(--border-subtle)] rounded-[var(--radius-xs)]">
                        <span className="text-[9px] uppercase text-[var(--text-tertiary)] block">Degree</span>
                        <span className="text-sm font-bold text-[var(--text-primary)] mt-0.5 block">
                          {selectedNode.id === centerNodeId &&
                          graphEvidence?.metrics &&
                          typeof (graphEvidence.metrics as Record<string, unknown>).degree === 'number'
                            ? `${(graphEvidence.metrics as Record<string, unknown>).degree} edges`
                            : `${selectedNode.metrics.degree} edges`}
                        </span>
                      </div>
                      <div className="p-2.5 bg-[var(--surface-2)] border border-[var(--border-subtle)] rounded-[var(--radius-xs)]">
                        <span className="text-[9px] uppercase text-[var(--text-tertiary)] block">Component Size</span>
                        <span className="text-sm font-bold text-[var(--text-primary)] mt-0.5 block">
                          {selectedNode.id === centerNodeId &&
                          graphEvidence?.metrics &&
                          typeof (graphEvidence.metrics as Record<string, unknown>).connected_component_size === 'number'
                            ? `${(graphEvidence.metrics as Record<string, unknown>).connected_component_size} nodes`
                            : `${selectedNode.metrics.component_size} nodes`}
                        </span>
                      </div>
                      <div className="p-2.5 bg-[var(--surface-2)] border border-[var(--border-subtle)] rounded-[var(--radius-xs)]">
                        <span className="text-[9px] uppercase text-[var(--text-tertiary)] block">Local Density</span>
                        <span className="text-sm font-bold text-[var(--accent-primary-light)] mt-0.5 block">
                          {selectedNode.id === centerNodeId &&
                          graphEvidence?.metrics &&
                          typeof (graphEvidence.metrics as Record<string, unknown>).local_density === 'number'
                            ? Number((graphEvidence.metrics as Record<string, unknown>).local_density).toFixed(2)
                            : selectedNode.metrics.local_density}
                        </span>
                      </div>
                      <div className="p-2.5 bg-[var(--surface-2)] border border-[var(--border-subtle)] rounded-[var(--radius-xs)]">
                        <span className="text-[9px] uppercase text-[var(--text-tertiary)] block">Counterparties</span>
                        <span className="text-sm font-bold text-[var(--text-secondary)] mt-0.5 block">
                          {selectedNode.id === centerNodeId &&
                          graphEvidence?.metrics &&
                          typeof (graphEvidence.metrics as Record<string, unknown>).unique_counterparties === 'number'
                            ? String((graphEvidence.metrics as Record<string, unknown>).unique_counterparties)
                            : selectedNode.metrics.unique_counterparties}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Node Attributes Key-Value Table */}
                  <div className="space-y-1.5">
                    <div className="text-[10px] uppercase text-[var(--text-tertiary)] font-bold">
                      OBSERVED ATTRIBUTES
                    </div>
                    <div className="space-y-1 bg-[var(--surface-2)] p-2.5 rounded-[var(--radius-sm)] border border-[var(--border-subtle)]">
                      {Object.keys(selectedNode.details).length === 0 ? (
                        <div className="text-[10px] text-[var(--text-tertiary)]">No extra attributes recorded.</div>
                      ) : (
                        Object.entries(selectedNode.details).map(([k, v]) => (
                          <div key={k} className="flex items-start justify-between gap-2 text-[11px] py-0.5">
                            <span className="text-[var(--text-tertiary)] shrink-0">{k}:</span>
                            <span className="text-[var(--text-primary)] text-right font-medium break-all">{v}</span>
                          </div>
                        ))
                      )}
                    </div>
                  </div>

                  {/* Supporting Evidence Items */}
                  {selectedNode.evidence_snippets && selectedNode.evidence_snippets.length > 0 && (
                    <div className="space-y-1.5">
                      <div className="text-[10px] uppercase text-[var(--text-tertiary)] font-bold flex items-center gap-1.5">
                        <Sparkles size={11} className="text-[var(--accent-primary)]" />
                        <span>GRAPH SUPPORT & EVIDENCE</span>
                      </div>
                      <div className="space-y-1.5">
                        {selectedNode.evidence_snippets.map((ev, i) => (
                          <div
                            key={i}
                            className="p-2 bg-[var(--surface-2)] border border-[var(--border-subtle)] rounded-[var(--radius-xs)] text-[10px] text-[var(--text-secondary)] leading-relaxed flex items-start gap-2"
                          >
                            <span className="w-1 h-1 rounded-full bg-[var(--accent-primary)] shrink-0 mt-1.5" />
                            <span>{ev}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Immediate Related Neighbor Nodes */}
                  <div className="space-y-1.5">
                    <div className="text-[10px] uppercase text-[var(--text-tertiary)] font-bold">
                      CONNECTED NEIGHBORS ({relatedNeighborNodes.length})
                    </div>
                    {relatedNeighborNodes.length === 0 ? (
                      <div className="p-2 bg-[var(--surface-2)] border border-[var(--border-subtle)] rounded-[var(--radius-xs)] text-[10px] text-[var(--text-tertiary)]">
                        No adjacent nodes connected.
                      </div>
                    ) : (
                      <div className="space-y-1 max-h-44 overflow-y-auto">
                        {relatedNeighborNodes.map((neighbor) => (
                          <button
                            key={neighbor.id}
                            onClick={() => setSelectedNodeId(neighbor.id)}
                            className="w-full p-2 bg-[var(--surface-2)] hover:bg-[var(--surface-3)] border border-[var(--border-subtle)] hover:border-[var(--border-strong)] rounded-[var(--radius-xs)] flex items-center justify-between text-left transition-colors cursor-pointer"
                          >
                            <div className="overflow-hidden pr-2">
                              <span className="text-[11px] font-bold text-[var(--text-primary)] truncate block">
                                {neighbor.label}
                              </span>
                              <span className="text-[9px] text-[var(--text-tertiary)] block">
                                {neighbor.type} · {neighbor.sublabel}
                              </span>
                            </div>
                            <div className="flex items-center gap-1 shrink-0">
                              {neighbor.risk ? (
                                <RiskBadge level={neighbor.risk} size="sm" />
                              ) : (
                                <span className="text-[9px] text-[var(--text-tertiary)] font-mono">—</span>
                              )}
                              <ChevronRight size={12} className="text-[var(--text-tertiary)]" />
                            </div>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="p-4 text-center text-xs text-[var(--text-tertiary)] font-mono">
                  Select a node on the canvas to inspect its dossier.
                </div>
              )}

              {/* Action Navigation CTAs */}
              {selectedNode && (
                <div className="pt-3 border-t border-[var(--border-subtle)] space-y-2">
                  <Button
                    variant="primary"
                    size="sm"
                    className="w-full justify-center"
                    onClick={() => setFocusNeighborhoodOnly((f) => !f)}
                  >
                    <Crosshair size={13} />
                    <span>{focusNeighborhoodOnly ? 'SHOW COMPLETE GRAPH' : 'EXPLORE LOCAL NEIGHBORHOOD'}</span>
                  </Button>

                  <div className="grid grid-cols-2 gap-2">
                    <Link
                      href={`/transactions?search=${encodeURIComponent(selectedNode.id)}`}
                      className="w-full"
                    >
                      <Button variant="secondary" size="sm" className="w-full justify-center text-[11px]">
                        <ArrowLeftRight size={12} />
                        <span>Transactions</span>
                      </Button>
                    </Link>
                    <Link
                      href={`/alerts?search=${encodeURIComponent(selectedNode.id)}`}
                      className="w-full"
                    >
                      <Button variant="secondary" size="sm" className="w-full justify-center text-[11px]">
                        <ShieldAlert size={12} />
                        <span>Alerts</span>
                      </Button>
                    </Link>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </PageContainer>
  );
}

export default function GraphPage() {
  return (
    <Suspense fallback={<LoadingState message="Constructing forensic relationship graph..." />}>
      <GraphWorkspaceContent />
    </Suspense>
  );
}
