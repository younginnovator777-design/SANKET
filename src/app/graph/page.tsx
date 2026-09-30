'use client';

import React, { useState, useMemo, Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import {
  GitBranch,
  Filter,
  Maximize2,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  SlidersHorizontal,
  Info,
  Layers,
  ChevronRight,
  Copy,
  Check,
  Download,
  ExternalLink,
  ShieldAlert,
  Boxes,
  ArrowLeftRight,
  Network,
  Globe,
  Radio,
  Eye,
  Search,
  Crosshair,
  Compass,
  Sparkles,
} from 'lucide-react';
import { PageContainer } from '@/components/PageContainer';
import {
  Button,
  Badge,
  RiskBadge,
  IconButton,
  SearchInput,
  FilterButton,
  LoadingState,
  EmptyState,
} from '@/components/ui';
import { mockRuns, mockAlerts, mockTransactions, mockCandidateEntities } from '@/data/mock';
import { RiskLevel } from '@/types';

// ============================================================
// Forensic Graph Data Structures
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
  | 'CANDIDATE_SAME_ENTITY';

export interface ForensicNode {
  id: string;
  label: string;
  sublabel: string;
  type: ForensicNodeType;
  risk: RiskLevel;
  risk_score?: number;
  x: number;
  y: number;
  provenance: 'OBSERVED TRANSACTION DATA' | 'HEURISTIC CANDIDATE GROUPING' | 'NETWORK TELEMETRY OBSERVATION';
  metrics: {
    degree: number;
    weighted_degree?: string;
    component_size: number;
    local_density: string;
    unique_counterparties: number;
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

const FORENSIC_GRAPH_NODES: ForensicNode[] = [
  {
    id: 'tx_8f3a2b1c',
    label: 'tx_8f3a2b1c...',
    sublabel: 'Block #831204 · 48.75 BTC',
    type: 'TRANSACTION',
    risk: 'CRITICAL',
    risk_score: 0.92,
    x: 360,
    y: 190,
    provenance: 'OBSERVED TRANSACTION DATA',
    metrics: {
      degree: 5,
      weighted_degree: '48.75 BTC',
      component_size: 10,
      local_density: '0.74',
      unique_counterparties: 4,
    },
    details: {
      'TXID Hash': '8f3a2b1c9d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a',
      'Transacted Value': '48.7500 BTC',
      'Mining Fee': '0.00042 BTC',
      'Block Height': '#831204',
      'Vectors': '4 inputs · 23 outputs',
      'Anomaly Detectors': 'Temporal Burst, Fan-Out, Value Layering',
    },
    evidence_snippets: [
      'Rapid output succession within 12-minute window (confidence 91%)',
      'Fan-out topology to 23 unique downstream addresses (confidence 88%)',
      'Value splitting matching layering heuristic profile (confidence 85%)',
    ],
  },
  {
    id: 'tx_1a2b3c4d',
    label: 'tx_1a2b3c4d...',
    sublabel: 'Block #831198 · 12.00 BTC',
    type: 'TRANSACTION',
    risk: 'HIGH',
    risk_score: 0.78,
    x: 640,
    y: 110,
    provenance: 'OBSERVED TRANSACTION DATA',
    metrics: {
      degree: 2,
      weighted_degree: '12.00 BTC',
      component_size: 10,
      local_density: '0.52',
      unique_counterparties: 2,
    },
    details: {
      'TXID Hash': '1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b',
      'Transacted Value': '12.0000 BTC',
      'Mining Fee': '0.00018 BTC',
      'Block Height': '#831198',
      'Vectors': '1 input · 2 outputs',
      'Anomaly Detectors': 'Peel-Chain, Round-Amount',
    },
    evidence_snippets: [
      'Sequential peel chain continuation over 8 consecutive hops',
      'Round transaction amount matching structuring profile',
    ],
  },
  {
    id: 'addr_1a2b3c',
    label: '1A1zP1...vfNa',
    sublabel: 'Input Vector #1 · 14.20 BTC',
    type: 'ADDRESS',
    risk: 'MEDIUM',
    risk_score: 0.54,
    x: 160,
    y: 130,
    provenance: 'OBSERVED TRANSACTION DATA',
    metrics: {
      degree: 2,
      weighted_degree: '14.20 BTC',
      component_size: 10,
      local_density: '0.65',
      unique_counterparties: 2,
    },
    details: {
      'Address Hash': '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa',
      'Total Received': '14.2000 BTC',
      'Co-spend Vector': 'Input #0 in Block 831204',
      'Candidate Cluster': 'ENT-CLUSTER-84-ALPHA',
    },
    evidence_snippets: [
      'Multi-input co-spending observed with 3 other input vectors',
    ],
  },
  {
    id: 'addr_3j98t1',
    label: '3J98t1...WNLy',
    sublabel: 'Input Vector #2 · 34.55 BTC',
    type: 'ADDRESS',
    risk: 'LOW',
    risk_score: 0.22,
    x: 160,
    y: 250,
    provenance: 'OBSERVED TRANSACTION DATA',
    metrics: {
      degree: 2,
      weighted_degree: '34.55 BTC',
      component_size: 10,
      local_density: '0.65',
      unique_counterparties: 2,
    },
    details: {
      'Address Hash': '3J98t1WpEZ73CNmQviecrnyiWrnqRhWNLy',
      'Total Received': '34.5500 BTC',
      'Co-spend Vector': 'Input #1 in Block 831204',
      'Candidate Cluster': 'ENT-CLUSTER-84-ALPHA',
    },
    evidence_snippets: [
      'Multi-input co-spending observed with 3 other input vectors',
    ],
  },
  {
    id: 'ent_cluster_84',
    label: 'CLUSTER-84-ALPHA',
    sublabel: 'Heuristic Cluster · 23 vectors',
    type: 'CANDIDATE_ENTITY',
    risk: 'CRITICAL',
    risk_score: 0.89,
    x: 80,
    y: 390,
    provenance: 'HEURISTIC CANDIDATE GROUPING',
    metrics: {
      degree: 3,
      weighted_degree: '148.50 BTC',
      component_size: 10,
      local_density: '0.82',
      unique_counterparties: 23,
    },
    details: {
      'Entity ID': 'ENT-CLUSTER-84-ALPHA',
      'Heuristic Rule': 'Common-Input-Ownership + Change-Address',
      'Member Addresses': '23 grouped address vectors',
      'Aggregated Volume': '148.50 BTC',
      'Associated Alerts': '7 priority leads',
      'Legal Status': 'HEURISTIC ONLY · OWNERSHIP NOT ESTABLISHED',
    },
    evidence_snippets: [
      'Co-spending observed across 14 input vectors in block 831204',
      'Consistent non-standard locktime timestamp patterning',
      'Identical fee-rate distribution across 6 sequential bursts',
    ],
  },
  {
    id: 'addr_bc1qxy',
    label: 'bc1qxy...0wlh',
    sublabel: 'Peel Target · 32.10 BTC',
    type: 'ADDRESS',
    risk: 'HIGH',
    risk_score: 0.81,
    x: 520,
    y: 110,
    provenance: 'OBSERVED TRANSACTION DATA',
    metrics: {
      degree: 2,
      weighted_degree: '32.10 BTC',
      component_size: 10,
      local_density: '0.60',
      unique_counterparties: 2,
    },
    details: {
      'Address Hash': 'bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh',
      'Total Received': '32.1000 BTC',
      'Role': 'Peel-Chain Intermediate Hop',
      'Next Hop': 'tx_1a2b3c4d (12.00 BTC)',
    },
    evidence_snippets: [
      'Forward transfer observed 3 blocks later in block 831198',
    ],
  },
  {
    id: 'addr_bc1qar',
    label: 'bc1qar...5mdq',
    sublabel: 'Change Output · 16.65 BTC',
    type: 'ADDRESS',
    risk: 'LOW',
    risk_score: 0.18,
    x: 520,
    y: 270,
    provenance: 'OBSERVED TRANSACTION DATA',
    metrics: {
      degree: 2,
      weighted_degree: '16.65 BTC',
      component_size: 10,
      local_density: '0.45',
      unique_counterparties: 2,
    },
    details: {
      'Address Hash': 'bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq',
      'Total Received': '16.6500 BTC',
      'Role': 'Candidate Change Address',
      'Candidate Cluster': 'ENT-CLUSTER-84-ALPHA',
    },
    evidence_snippets: [
      'Change address heuristic match: single key-type continuation',
    ],
  },
  {
    id: 'ip_198_51',
    label: '198.51.100.42',
    sublabel: 'Broadcast Peer Node',
    type: 'IP',
    risk: 'LOW',
    risk_score: 0.15,
    x: 360,
    y: 350,
    provenance: 'NETWORK TELEMETRY OBSERVATION',
    metrics: {
      degree: 3,
      component_size: 10,
      local_density: '0.40',
      unique_counterparties: 3,
    },
    details: {
      'IP Address': '198.51.100.42',
      'Autonomous System': 'AS13335 (Cloudflare Lineage)',
      'Telemetry Time': '2024-03-15 14:23:00 UTC',
      'Note': 'Observed peer propagation telemetry; does not imply sender identity.',
    },
    evidence_snippets: [
      'First broadcast announcement captured at canonical node ingestion',
    ],
  },
  {
    id: 'asn_13335',
    label: 'AS13335',
    sublabel: 'Cloudflare / Routing BGP',
    type: 'ASN',
    risk: 'LOW',
    risk_score: 0.10,
    x: 540,
    y: 380,
    provenance: 'NETWORK TELEMETRY OBSERVATION',
    metrics: {
      degree: 1,
      component_size: 10,
      local_density: '0.20',
      unique_counterparties: 1,
    },
    details: {
      'ASN Number': 'AS13335',
      'Organization': 'Cloudflare Inc. / Routing Lineage',
      'Peer Type': 'BGP Transit / Proxy',
    },
  },
  {
    id: 'country_us',
    label: 'United States (US)',
    sublabel: 'GeoIP Region',
    type: 'COUNTRY',
    risk: 'LOW',
    risk_score: 0.05,
    x: 230,
    y: 410,
    provenance: 'NETWORK TELEMETRY OBSERVATION',
    metrics: {
      degree: 1,
      component_size: 10,
      local_density: '0.20',
      unique_counterparties: 1,
    },
    details: {
      'Country Code': 'US',
      'Region': 'North America',
      'Source': 'Offline MaxMind GeoIP Database',
    },
  },
];

const FORENSIC_GRAPH_EDGES: ForensicEdge[] = [
  {
    id: 'e1',
    source: 'addr_1a2b3c',
    target: 'tx_8f3a2b1c',
    label: '14.20 BTC',
    type: 'INPUT_TO',
  },
  {
    id: 'e2',
    source: 'addr_3j98t1',
    target: 'tx_8f3a2b1c',
    label: '34.55 BTC',
    type: 'INPUT_TO',
  },
  {
    id: 'e3',
    source: 'tx_8f3a2b1c',
    target: 'addr_bc1qxy',
    label: '32.10 BTC',
    type: 'OUTPUT_TO',
  },
  {
    id: 'e4',
    source: 'tx_8f3a2b1c',
    target: 'addr_bc1qar',
    label: '16.65 BTC',
    type: 'OUTPUT_TO',
  },
  {
    id: 'e5',
    source: 'addr_bc1qxy',
    target: 'tx_1a2b3c4d',
    label: '12.00 BTC (Hop 1)',
    type: 'INPUT_TO',
  },
  {
    id: 'e6',
    source: 'ent_cluster_84',
    target: 'addr_1a2b3c',
    label: 'Heuristic Common-Input',
    type: 'CANDIDATE_SAME_ENTITY',
    is_heuristic: true,
  },
  {
    id: 'e7',
    source: 'ent_cluster_84',
    target: 'addr_3j98t1',
    label: 'Heuristic Common-Input',
    type: 'CANDIDATE_SAME_ENTITY',
    is_heuristic: true,
  },
  {
    id: 'e8',
    source: 'ent_cluster_84',
    target: 'addr_bc1qar',
    label: 'Heuristic Change-Addr',
    type: 'CANDIDATE_SAME_ENTITY',
    is_heuristic: true,
  },
  {
    id: 'e9',
    source: 'tx_8f3a2b1c',
    target: 'ip_198_51',
    label: 'Observed Broadcast',
    type: 'OBSERVED_WITH',
  },
  {
    id: 'e10',
    source: 'ip_198_51',
    target: 'asn_13335',
    label: 'BGP Route AS13335',
    type: 'SAME_ASN',
  },
  {
    id: 'e11',
    source: 'ip_198_51',
    target: 'country_us',
    label: 'GeoIP Location',
    type: 'OBSERVED_WITH',
  },
];

function GraphWorkspaceContent() {
  const searchParams = useSearchParams();
  const initialQuery = searchParams.get('txid') || searchParams.get('entity') || searchParams.get('node') || '';

  // Find initial matching node
  const initialNodeId = useMemo(() => {
    if (!initialQuery) return 'tx_8f3a2b1c';
    const match = FORENSIC_GRAPH_NODES.find(
      (n) =>
        n.id.toLowerCase().includes(initialQuery.toLowerCase()) ||
        n.label.toLowerCase().includes(initialQuery.toLowerCase()) ||
        (n.details && Object.values(n.details).some((v) => v.toLowerCase().includes(initialQuery.toLowerCase())))
    );
    return match ? match.id : 'tx_8f3a2b1c';
  }, [initialQuery]);

  const [selectedNodeId, setSelectedNodeId] = useState<string>(initialNodeId);
  const [zoomLevel, setZoomLevel] = useState<number>(100);
  const [panOffset, setPanOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [startPan, setStartPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [showLegend, setShowLegend] = useState(true);
  const [nodeTypeFilter, setNodeTypeFilter] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [copiedId, setCopiedId] = useState(false);
  const [focusNeighborhoodOnly, setFocusNeighborhoodOnly] = useState(false);

  const activeRun = mockRuns[0];

  // Selected node object
  const selectedNode = useMemo(() => {
    return FORENSIC_GRAPH_NODES.find((n) => n.id === selectedNodeId) || FORENSIC_GRAPH_NODES[0];
  }, [selectedNodeId]);

  // Connected edges to selected node
  const connectedEdges = useMemo(() => {
    return FORENSIC_GRAPH_EDGES.filter(
      (e) => e.source === selectedNodeId || e.target === selectedNodeId
    );
  }, [selectedNodeId]);

  // Connected node IDs
  const connectedNodeIds = useMemo(() => {
    const ids = new Set<string>();
    ids.add(selectedNodeId);
    connectedEdges.forEach((e) => {
      ids.add(e.source);
      ids.add(e.target);
    });
    return ids;
  }, [selectedNodeId, connectedEdges]);

  // Related neighbor nodes for detail drawer
  const relatedNeighborNodes = useMemo(() => {
    return FORENSIC_GRAPH_NODES.filter(
      (n) => n.id !== selectedNodeId && connectedNodeIds.has(n.id)
    );
  }, [selectedNodeId, connectedNodeIds]);

  // Filtered nodes
  const visibleNodes = useMemo(() => {
    return FORENSIC_GRAPH_NODES.filter((n) => {
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
  }, [nodeTypeFilter, focusNeighborhoodOnly, connectedNodeIds, searchQuery]);

  const visibleNodeIds = useMemo(() => {
    return new Set(visibleNodes.map((n) => n.id));
  }, [visibleNodes]);

  // Filtered edges
  const visibleEdges = useMemo(() => {
    return FORENSIC_GRAPH_EDGES.filter(
      (e) => visibleNodeIds.has(e.source) && visibleNodeIds.has(e.target)
    );
  }, [visibleNodeIds]);

  // Pan handlers for canvas
  const handleMouseDown = (e: React.MouseEvent) => {
    // Only start pan if clicking the canvas background
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

  return (
    <PageContainer
      title="GRAPH INVESTIGATION"
      description="Explore observed transaction, address, network, and candidate-entity relationships."
      tag="RELATIONSHIP GRAPH"
      icon={<GitBranch size={18} />}
      actions={
        <div className="flex items-center gap-2">
          <Button variant="secondary" size="sm" onClick={() => setFocusNeighborhoodOnly((f) => !f)}>
            <Crosshair size={13} className={focusNeighborhoodOnly ? 'text-[var(--accent-primary-light)]' : ''} />
            <span>{focusNeighborhoodOnly ? 'Show Full Graph' : 'Focus Neighborhood'}</span>
          </Button>
          <Button variant="secondary" size="sm">
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
              <span className="font-semibold text-[var(--accent-primary-light)]">{activeRun.run_id}</span>
            </div>
            <span className="text-[var(--border-strong)]">|</span>
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] uppercase text-[var(--text-tertiary)]">DATASET:</span>
              <span className="text-[var(--text-primary)] font-medium">{activeRun.dataset_name}</span>
            </div>
            <span className="text-[var(--border-strong)]">|</span>
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] uppercase text-[var(--text-tertiary)]">TOPOLOGY:</span>
              <span className="text-[var(--text-secondary)]">2-Hop Forensic Subgraph Snapshot</span>
            </div>
          </div>

          <div className="flex items-center gap-2 text-[11px] text-[var(--text-secondary)]">
            <span className="w-1.5 h-1.5 rounded-full bg-[var(--risk-low)]" />
            <span className="uppercase tracking-wider">AIRGAPPED / OFFLINE</span>
          </div>
        </div>

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
            <span className="font-bold text-[var(--accent-primary-light)]">2</span>
          </div>
          <div className="p-2.5 bg-[var(--surface-1)] border border-[var(--border-default)] rounded-[var(--radius-sm)] flex items-center justify-between">
            <span className="text-[10px] uppercase text-[var(--text-tertiary)]">ADDRESSES</span>
            <span className="font-bold text-[var(--text-secondary)]">4</span>
          </div>
          <div className="p-2.5 bg-[var(--surface-1)] border border-[var(--border-default)] rounded-[var(--radius-sm)] flex items-center justify-between">
            <span className="text-[10px] uppercase text-[var(--text-tertiary)]">NETWORK NODES</span>
            <span className="font-bold text-[var(--text-secondary)]">3</span>
          </div>
          <div className="p-2.5 bg-[var(--surface-1)] border border-[var(--border-default)] rounded-[var(--radius-sm)] flex items-center justify-between">
            <span className="text-[10px] uppercase text-[var(--text-tertiary)]">CANDIDATE ENTITIES</span>
            <span className="font-bold text-[var(--risk-critical)]">1 Cluster</span>
          </div>
        </div>

        {/* ── 3. Main Workspace Grid: Canvas + Investigation Dossier ── */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          {/* Main Graph Canvas Area */}
          <div className="lg:col-span-8 bg-[var(--surface-1)] border border-[var(--border-default)] rounded-[var(--radius-md)] flex flex-col justify-between relative overflow-hidden h-[620px]">
            {/* Top Canvas Controls Bar */}
            <div className="p-3 border-b border-[var(--border-subtle)] flex flex-wrap items-center justify-between gap-3 z-10 bg-[var(--bg-primary)]/90 backdrop-blur-xs">
              <div className="flex items-center gap-2">
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
                </select>
              </div>

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
                    {/* Arrow marker for standard directed transfers */}
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
                    {/* Arrow marker for highlighted edges */}
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
                    const sourceNode = FORENSIC_GRAPH_NODES.find((n) => n.id === edge.source);
                    const targetNode = FORENSIC_GRAPH_NODES.find((n) => n.id === edge.target);
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
                      <g key={edge.id} className="transition-opacity duration-150" opacity={isDimmed ? 0.25 : 1}>
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
                          x={(sourceNode.x + targetNode.x) / 2 - 32}
                          y={(sourceNode.y + targetNode.y) / 2 - 8}
                          width="64"
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
                          {edge.label.length > 14 ? edge.label.slice(0, 13) + '…' : edge.label}
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
                          // Diamond geometry for Transactions
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
                          // Hexagon geometry with gold outline for Candidate Entity
                          <polygon
                            points={`${node.x},${node.y - 20} ${node.x + 18},${node.y - 10} ${node.x + 18},${node.y + 10} ${node.x},${node.y + 20} ${node.x - 18},${node.y + 10} ${node.x - 18},${node.y - 10}`}
                            fill="#171510"
                            stroke={isSelected ? 'var(--accent-primary)' : 'var(--accent-primary-border)'}
                            strokeWidth={isSelected ? 2.5 : 1.8}
                            strokeDasharray="4 2"
                          />
                        ) : node.type === 'IP' ? (
                          // Square geometry for IP Addresses
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
                          // Rounded square for ASN
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
                          // Octagon for GeoIP Country
                          <circle
                            cx={node.x}
                            cy={node.y}
                            r={13}
                            fill="#121212"
                            stroke={isSelected ? 'var(--accent-primary)' : '#33312c'}
                            strokeWidth={isSelected ? 2.5 : 1.2}
                          />
                        ) : (
                          // Circle geometry for Addresses
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
                    <span className="w-2.5 h-2.5 rotate-45 border border-[var(--risk-critical)] bg-[var(--surface-2)]" />
                    Transaction (Diamond)
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 border border-dashed border-[var(--accent-primary)] bg-[var(--surface-2)]" />
                    Candidate Entity (Hexagon)
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-xs border border-[var(--border-strong)] bg-[var(--surface-2)]" />
                    Network IP (Square)
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="w-4 h-[1px] border-b border-dashed border-[var(--accent-primary)]" />
                    Heuristic Relation (Dashed)
                  </span>
                </div>
                <div className="text-[9px] uppercase tracking-wider text-[var(--text-muted)]">
                  Click any node to focus neighborhood
                </div>
              </div>
            )}
          </div>

          {/* ── 4. Right Side: Node Forensic Dossier Panel ── */}
          <div className="lg:col-span-4 bg-[var(--surface-1)] border border-[var(--border-default)] rounded-[var(--radius-md)] p-5 flex flex-col justify-between space-y-5 overflow-y-auto max-h-[620px] font-mono text-xs">
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
                <RiskBadge level={selectedNode.risk} size="sm" />
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
                <div className="text-[10px] uppercase text-[var(--text-tertiary)] font-bold">
                  TOPOLOGY GRAPH METRICS
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="p-2.5 bg-[var(--surface-2)] border border-[var(--border-subtle)] rounded-[var(--radius-xs)]">
                    <span className="text-[9px] uppercase text-[var(--text-tertiary)] block">Degree</span>
                    <span className="text-sm font-bold text-[var(--text-primary)] mt-0.5 block">
                      {selectedNode.metrics.degree} edges
                    </span>
                  </div>
                  <div className="p-2.5 bg-[var(--surface-2)] border border-[var(--border-subtle)] rounded-[var(--radius-xs)]">
                    <span className="text-[9px] uppercase text-[var(--text-tertiary)] block">Component Size</span>
                    <span className="text-sm font-bold text-[var(--text-primary)] mt-0.5 block">
                      {selectedNode.metrics.component_size} nodes
                    </span>
                  </div>
                  <div className="p-2.5 bg-[var(--surface-2)] border border-[var(--border-subtle)] rounded-[var(--radius-xs)]">
                    <span className="text-[9px] uppercase text-[var(--text-tertiary)] block">Local Density</span>
                    <span className="text-sm font-bold text-[var(--accent-primary-light)] mt-0.5 block">
                      {selectedNode.metrics.local_density}
                    </span>
                  </div>
                  <div className="p-2.5 bg-[var(--surface-2)] border border-[var(--border-subtle)] rounded-[var(--radius-xs)]">
                    <span className="text-[9px] uppercase text-[var(--text-tertiary)] block">Counterparties</span>
                    <span className="text-sm font-bold text-[var(--text-secondary)] mt-0.5 block">
                      {selectedNode.metrics.unique_counterparties}
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
                  {Object.entries(selectedNode.details).map(([k, v]) => (
                    <div key={k} className="flex items-start justify-between gap-2 text-[11px] py-0.5">
                      <span className="text-[var(--text-tertiary)] shrink-0">{k}:</span>
                      <span className="text-[var(--text-primary)] text-right font-medium break-all">{v}</span>
                    </div>
                  ))}
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
                <div className="space-y-1">
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
                        <RiskBadge level={neighbor.risk} size="sm" />
                        <ChevronRight size={12} className="text-[var(--text-tertiary)]" />
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Action Navigation CTAs */}
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
                  href={`/entities?search=${encodeURIComponent(selectedNode.id)}`}
                  className="w-full"
                >
                  <Button variant="secondary" size="sm" className="w-full justify-center text-[11px]">
                    <Boxes size={12} />
                    <span>Entities</span>
                  </Button>
                </Link>
              </div>
            </div>
          </div>
        </div>
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


