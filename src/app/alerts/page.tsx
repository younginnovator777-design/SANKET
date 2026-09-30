'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  ShieldAlert,
  Search,
  Filter,
  ArrowUpDown,
  ExternalLink,
  ChevronRight,
  SlidersHorizontal,
  FileText,
  Download,
  Copy,
  Check,
  GitBranch,
  ArrowRight,
  Info,
  Layers,
  Activity,
  Cpu,
  Clock,
  ArrowLeftRight,
} from 'lucide-react';
import { PageContainer } from '@/components/PageContainer';
import {
  RiskBadge,
  Badge,
  Button,
  SearchInput,
  FilterButton,
  Drawer,
  EmptyState,
  DataTable,
  Column,
} from '@/components/ui';
import { getAlerts, ApiAlert } from '@/lib/api';
import type { Alert, RiskLevel } from '@/types';
import { LoadingState, EmptyState as UIEmptyState } from '@/components/ui';

type RiskFilterOption = 'ALL' | 'MEDIUM+' | 'HIGH+' | 'CRITICAL';

function toAlert(a: ApiAlert): Alert {
  return {
    alert_id: a.alert_id,
    transaction_id: a.transaction_id,
    rank: a.rank,
    risk_score: a.risk_score,
    confidence_score: a.confidence_score,
    risk_level: a.risk_level,
    priority_score: a.priority_score,
    triggered_detectors: a.triggered_detectors,
    independent_signal_count: a.independent_signal_count,
    evidence_items: a.evidence_items,
    evidence_categories: a.evidence_categories,
    component_scores: a.component_scores,
    scoring_version: a.scoring_version,
  };
}

export default function AlertsPage() {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedRiskFilter, setSelectedRiskFilter] = useState<RiskFilterOption>('ALL');
  const [selectedDetector, setSelectedDetector] = useState<string>('ALL');
  const [selectedAlert, setSelectedAlert] = useState<Alert | null>(null);
  const [copiedTx, setCopiedTx] = useState(false);
  const [allAlerts, setAllAlerts] = useState<Alert[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);

  useEffect(() => {
    getAlerts()
      .then((res) => setAllAlerts(res.alerts.map(toAlert)))
      .catch((err) => setFetchError(String(err)))
      .finally(() => setLoading(false));
  }, []);

  const activeRun = { run_id: '—', dataset_name: '—', scoring_version: '—' };

  // Derive unique detectors from all alerts
  const allDetectors = Array.from(
    new Set(allAlerts.flatMap((a) => a.triggered_detectors))
  );

  // Filter alerts according to requirements while preserving authoritative backend rank order
  const filteredAlerts = allAlerts.filter((alert) => {
    if (selectedRiskFilter === 'CRITICAL' && alert.risk_level !== 'CRITICAL') return false;
    if (selectedRiskFilter === 'HIGH+' && alert.risk_level !== 'CRITICAL' && alert.risk_level !== 'HIGH') return false;
    if (selectedRiskFilter === 'MEDIUM+' && alert.risk_level === 'LOW') return false;
    if (selectedDetector !== 'ALL' && !alert.triggered_detectors.includes(selectedDetector)) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      return (
        alert.transaction_id.toLowerCase().includes(q) ||
        alert.alert_id.toLowerCase().includes(q) ||
        alert.triggered_detectors.some((d) => d.toLowerCase().includes(q))
      );
    }
    return true;
  });

  if (loading) return <div className="p-8"><LoadingState message="Loading alerts from backend…" /></div>;
  if (fetchError) return <div className="p-8 text-xs font-mono text-[var(--risk-critical)]">Backend error: {fetchError}</div>;

  // Summary row metrics computed from real data
  const totalLeads = allAlerts.length;
  const highCriticalCount = allAlerts.filter(
    (a) => a.risk_level === 'CRITICAL' || a.risk_level === 'HIGH'
  ).length;
  const mediumPlusCount = allAlerts.filter((a) => a.risk_level !== 'LOW').length;
  const avgConfidence =
    allAlerts.length > 0
      ? (allAlerts.reduce((acc, a) => acc + a.confidence_score, 0) / allAlerts.length) * 100
      : 0;

  const handleCopyTx = (txid: string) => {
    navigator.clipboard?.writeText(txid);
    setCopiedTx(true);
    setTimeout(() => setCopiedTx(false), 2000);
  };

  const clearFilters = () => {
    setSearchQuery('');
    setSelectedRiskFilter('ALL');
    setSelectedDetector('ALL');
  };

  // Main investigation table columns
  const columns: Column<Alert>[] = [
    {
      key: 'rank',
      header: 'RANK',
      mono: true,
      width: '60px',
      render: (alert) => (
        <span className="font-mono text-xs font-bold text-[var(--accent-primary-light)]">
          #{alert.rank}
        </span>
      ),
    },
    {
      key: 'risk_level',
      header: 'RISK',
      width: '120px',
      render: (alert) => (
        <div className="flex items-center gap-1.5">
          <RiskBadge level={alert.risk_level} size="sm" />
          <span className="font-mono text-[11px] font-semibold text-[var(--text-primary)]">
            {alert.risk_score.toFixed(2)}
          </span>
        </div>
      ),
    },
    {
      key: 'confidence_score',
      header: 'CONFIDENCE',
      mono: true,
      align: 'right',
      width: '90px',
      render: (alert) => (
        <span className="font-mono text-xs font-medium text-[var(--text-primary)]">
          {(alert.confidence_score * 100).toFixed(0)}%
        </span>
      ),
    },
    {
      key: 'priority_score',
      header: 'PRIORITY',
      mono: true,
      align: 'right',
      width: '80px',
      render: (alert) => (
        <span className="font-mono text-xs font-bold text-[var(--accent-primary-light)]">
          {alert.priority_score.toFixed(2)}
        </span>
      ),
    },
    {
      key: 'transaction_id',
      header: 'TRANSACTION ID (TXID)',
      mono: true,
      render: (alert) => (
        <div className="flex items-center gap-2">
          <span className="font-mono text-xs text-[var(--text-primary)] font-medium">
            {alert.transaction_id.slice(0, 14)}...{alert.transaction_id.slice(-8)}
          </span>
        </div>
      ),
    },
    {
      key: 'independent_signal_count',
      header: 'SIGNALS',
      mono: true,
      align: 'center',
      width: '80px',
      render: (alert) => (
        <span className="text-[11px] font-mono text-[var(--text-secondary)]">
          {alert.independent_signal_count} indep.
        </span>
      ),
    },
    {
      key: 'triggered_detectors',
      header: 'DETECTED PATTERNS',
      render: (alert) => (
        <div className="flex flex-wrap gap-1">
          {alert.triggered_detectors.map((d, i) => (
            <span
              key={i}
              className="text-[9px] font-mono uppercase px-1.5 py-0.5 rounded-xs bg-[var(--surface-2)] text-[var(--text-secondary)] border border-[var(--border-subtle)]"
            >
              {d.replace('_', ' ')}
            </span>
          ))}
        </div>
      ),
    },
    {
      key: 'created_at',
      header: 'TIMESTAMP',
      mono: true,
      render: (alert) => (
        <span className="text-[11px] font-mono text-[var(--text-tertiary)]">
          {alert.created_at ? alert.created_at.replace('T', ' ').replace(':00Z', ' UTC') : '—'}
        </span>
      ),
    },
  ];

  return (
    <PageContainer
      title="INVESTIGATIVE LEADS"
      description="Ranked anomaly signals with explainable supporting evidence."
      tag="LEAD CONSOLE"
      icon={<ShieldAlert size={18} />}
      actions={
        <div className="flex items-center gap-2">
          <Button variant="secondary" size="sm">
            <Download size={13} />
            <span>Export Lead Dossiers</span>
          </Button>
        </div>
      }
    >
      <div className="space-y-6">
        {/* ── 1. Page Header Metadata Context ── */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 bg-[var(--surface-1)] border border-[var(--border-default)] rounded-[var(--radius-md)] text-xs font-mono">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] uppercase text-[var(--text-tertiary)]">CURRENT RUN:</span>
              <span className="font-semibold text-[var(--accent-primary-light)]">{activeRun.run_id}</span>
            </div>
            <span className="text-[var(--border-strong)]">|</span>
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] uppercase text-[var(--text-tertiary)]">TARGET DATASET:</span>
              <span className="text-[var(--text-primary)] font-medium">{activeRun.dataset_name}</span>
            </div>
            <span className="text-[var(--border-strong)]">|</span>
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] uppercase text-[var(--text-tertiary)]">SCORING ENGINE:</span>
              <span className="text-[var(--text-secondary)]">{activeRun.scoring_version}</span>
            </div>
          </div>

          <div className="flex items-center gap-2 text-[11px] text-[var(--text-secondary)]">
            <span className="w-1.5 h-1.5 rounded-full bg-[var(--risk-low)]" />
            <span className="uppercase tracking-wider">OFFLINE MODE</span>
          </div>
        </div>

        {/* ── 2. Compact Summary Metrics Strip ── */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 font-mono text-xs">
          <div className="p-3 bg-[var(--surface-1)] border border-[var(--border-default)] rounded-[var(--radius-sm)] flex flex-col justify-between">
            <span className="text-[10px] uppercase text-[var(--text-tertiary)]">TOTAL LEADS</span>
            <div className="text-lg font-bold text-[var(--text-primary)] mt-1">{totalLeads}</div>
          </div>
          <div className="p-3 bg-[var(--surface-1)] border border-[var(--border-default)] rounded-[var(--radius-sm)] flex flex-col justify-between">
            <span className="text-[10px] uppercase text-[var(--text-tertiary)]">HIGH / CRITICAL</span>
            <div className="text-lg font-bold text-[var(--risk-critical)] mt-1">{highCriticalCount}</div>
          </div>
          <div className="p-3 bg-[var(--surface-1)] border border-[var(--border-default)] rounded-[var(--radius-sm)] flex flex-col justify-between">
            <span className="text-[10px] uppercase text-[var(--text-tertiary)]">MEDIUM+ LEADS</span>
            <div className="text-lg font-bold text-[var(--accent-primary-light)] mt-1">{mediumPlusCount}</div>
          </div>
          <div className="p-3 bg-[var(--surface-1)] border border-[var(--border-default)] rounded-[var(--radius-sm)] flex flex-col justify-between">
            <span className="text-[10px] uppercase text-[var(--text-tertiary)]">AVG CONFIDENCE</span>
            <div className="text-lg font-bold text-[var(--text-primary)] mt-1">{avgConfidence.toFixed(1)}%</div>
          </div>
          <div className="p-3 bg-[var(--surface-1)] border border-[var(--border-default)] rounded-[var(--radius-sm)] flex flex-col justify-between">
            <span className="text-[10px] uppercase text-[var(--text-tertiary)]">ACTIVE RUN ID</span>
            <div className="text-xs font-bold text-[var(--text-secondary)] mt-1.5 truncate">{activeRun.run_id}</div>
          </div>
        </div>

        {/* ── 3. Filter & Search Bar ── */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 p-3 bg-[var(--surface-1)] border border-[var(--border-default)] rounded-[var(--radius-md)]">
          <div className="flex-1 max-w-md">
            <SearchInput
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search TXID, Alert ID, detector code..."
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Risk Tier Filters */}
            <div className="flex items-center gap-1">
              <span className="text-[10px] font-mono uppercase text-[var(--text-tertiary)] mr-1">
                RISK:
              </span>
              {(['ALL', 'CRITICAL', 'HIGH+', 'MEDIUM+'] as const).map((opt) => (
                <FilterButton
                  key={opt}
                  label={opt}
                  active={selectedRiskFilter === opt}
                  onClick={() => setSelectedRiskFilter(opt)}
                />
              ))}
            </div>

            {/* Detector Filter Dropdown */}
            <div className="flex items-center gap-1.5 pl-2 border-l border-[var(--border-subtle)] font-mono text-xs">
              <span className="text-[10px] uppercase text-[var(--text-tertiary)]">DETECTOR:</span>
              <select
                value={selectedDetector}
                onChange={(e) => setSelectedDetector(e.target.value)}
                className="h-7 px-2 bg-[var(--surface-2)] text-[var(--text-primary)] border border-[var(--border-default)] rounded-[var(--radius-sm)] text-[11px] font-mono focus:border-[var(--accent-primary-border)] focus:outline-none"
              >
                <option value="ALL">All Detectors ({allDetectors.length})</option>
                {allDetectors.map((d) => (
                  <option key={d} value={d}>
                    {d.replace('_', ' ')}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* ── 4. Main Investigative Leads Table ── */}
        {filteredAlerts.length === 0 ? (
          <div className="bg-[var(--surface-1)] border border-[var(--border-default)] rounded-[var(--radius-md)] p-8">
            <EmptyState
              title="NO MATCHING LEADS"
              description="No investigative leads match the selected filter criteria. Try clearing filters or adjusting risk tier."
              action={
                <Button variant="accent" size="sm" onClick={clearFilters}>
                  <span>Clear All Filters</span>
                </Button>
              }
            />
          </div>
        ) : (
          <div className="space-y-2">
            <div className="flex items-center justify-between text-[11px] font-mono text-[var(--text-tertiary)] px-1">
              <span>SHOWING {filteredAlerts.length} OF {allAlerts.length} RANKED LEADS</span>
              <span>CLICK ANY ROW TO OPEN INVESTIGATION DOSSIER</span>
            </div>

            <DataTable
              columns={columns}
              data={filteredAlerts}
              keyExtractor={(item) => item.alert_id}
              onRowClick={(item) => setSelectedAlert(item)}
            />
          </div>
        )}
      </div>

      {/* ── 5. Large Right-Side Investigation Dossier Drawer ── */}
      <Drawer
        isOpen={selectedAlert !== null}
        onClose={() => setSelectedAlert(null)}
        title={`INVESTIGATIVE LEAD: ${selectedAlert?.alert_id}`}
        className="max-w-xl"
      >
        {selectedAlert && (
          <div className="space-y-6 font-mono text-xs">
            {/* Header Summary & Monospace TXID */}
            <div className="p-3.5 bg-[var(--surface-2)] border border-[var(--border-default)] rounded-[var(--radius-sm)] space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-[var(--accent-primary-light)]">
                    RANK #{selectedAlert.rank}
                  </span>
                  <span className="text-[var(--text-muted)]">|</span>
                  <span className="text-xs text-[var(--text-secondary)]">{selectedAlert.alert_id}</span>
                </div>
                <RiskBadge level={selectedAlert.risk_level} />
              </div>

              <div>
                <div className="text-[10px] uppercase text-[var(--text-tertiary)] mb-1">
                  TARGET TRANSACTION IDENTIFIER (TXID)
                </div>
                <div className="flex items-center justify-between gap-2 p-2 rounded-[var(--radius-sm)] bg-[var(--surface-3)] border border-[var(--border-subtle)]">
                  <span className="text-xs text-[var(--accent-primary-light)] break-all font-semibold select-all">
                    {selectedAlert.transaction_id}
                  </span>
                  <button
                    onClick={() => handleCopyTx(selectedAlert.transaction_id)}
                    className="p-1 text-[var(--text-tertiary)] hover:text-[var(--text-primary)] transition-colors shrink-0"
                    title="Copy TXID"
                  >
                    {copiedTx ? <Check size={14} className="text-[var(--risk-low)]" /> : <Copy size={14} />}
                  </button>
                </div>
              </div>

              <div className="flex items-center justify-between text-[11px] text-[var(--text-tertiary)] pt-1">
                <span>TIMESTAMP: {selectedAlert.created_at?.replace('T', ' ').replace(':00Z', ' UTC')}</span>
                <span>MODEL VER: {selectedAlert.scoring_version}</span>
              </div>
            </div>

            {/* Score Triad Grid */}
            <div className="grid grid-cols-3 gap-2.5 text-center">
              <div className="p-3 bg-[var(--surface-2)] border border-[var(--border-subtle)] rounded-[var(--radius-sm)]">
                <span className="text-[9px] uppercase text-[var(--text-tertiary)] block">Composite Risk</span>
                <span className="text-base font-bold text-[var(--risk-critical)] block mt-0.5">
                  {selectedAlert.risk_score.toFixed(2)}
                </span>
              </div>
              <div className="p-3 bg-[var(--surface-2)] border border-[var(--border-subtle)] rounded-[var(--radius-sm)]">
                <span className="text-[9px] uppercase text-[var(--text-tertiary)] block">Confidence</span>
                <span className="text-base font-bold text-[var(--text-primary)] block mt-0.5">
                  {(selectedAlert.confidence_score * 100).toFixed(0)}%
                </span>
              </div>
              <div className="p-3 bg-[var(--surface-2)] border border-[var(--border-subtle)] rounded-[var(--radius-sm)]">
                <span className="text-[9px] uppercase text-[var(--text-tertiary)] block">Priority Score</span>
                <span className="text-base font-bold text-[var(--accent-primary-light)] block mt-0.5">
                  {selectedAlert.priority_score.toFixed(2)}
                </span>
              </div>
            </div>

            {/* ── WHY WAS THIS FLAGGED? (Hero section) ── */}
            <div className="space-y-3">
              <div className="flex items-center justify-between border-b border-[var(--border-subtle)] pb-2">
                <div className="flex items-center gap-2">
                  <span className="w-1.5 h-3 bg-[var(--accent-primary)] rounded-xs" />
                  <span className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-primary)]">
                    WHY WAS THIS FLAGGED?
                  </span>
                </div>
                <span className="text-[10px] text-[var(--text-tertiary)]">
                  {selectedAlert.evidence_items.length} OBSERVED EVIDENCE ITEMS
                </span>
              </div>

              <div className="space-y-2.5">
                {selectedAlert.evidence_items.map((item, idx) => (
                  <div
                    key={idx}
                    className="p-3 bg-[var(--surface-2)] border border-[var(--border-default)] rounded-[var(--radius-sm)] space-y-1.5"
                  >
                    <div className="flex items-center justify-between text-[10px] uppercase">
                      <span className="text-[var(--accent-primary-light)] font-bold">{item.category}</span>
                      <span className="text-[var(--text-tertiary)]">SOURCE: {item.source}</span>
                    </div>
                    <p className="text-xs text-[var(--text-primary)] font-sans leading-relaxed">
                      {item.description}
                    </p>
                    <div className="flex items-center justify-between text-[10px] text-[var(--text-tertiary)] pt-1 border-t border-[var(--border-subtle)]">
                      <span>Statistical Confidence: {(item.confidence * 100).toFixed(0)}%</span>
                      <span className="text-[var(--risk-low)] uppercase">Deterministic</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* ── Component Risk Breakdown ── */}
            <div className="p-3.5 bg-[var(--surface-2)] border border-[var(--border-subtle)] rounded-[var(--radius-sm)] space-y-2.5">
              <div className="text-[10px] uppercase tracking-wider text-[var(--text-tertiary)] font-bold">
                COMPONENT RISK BREAKDOWN
              </div>
              <div className="space-y-2">
                {Object.entries(selectedAlert.component_scores).map(([category, score]) => (
                  <div key={category}>
                    <div className="flex items-center justify-between text-xs mb-1">
                      <span className="text-[var(--text-primary)] uppercase text-[11px]">{category}</span>
                      <span className="text-[var(--accent-primary-light)] font-semibold">{score.toFixed(2)}</span>
                    </div>
                    <div className="w-full h-1.5 bg-[var(--surface-3)] rounded-full overflow-hidden">
                      <div
                        className="h-full bg-[var(--accent-primary)] rounded-full"
                        style={{ width: `${score * 100}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* ── Signal Agreement & Confidence Breakdown ── */}
            <div className="p-3.5 bg-[var(--surface-2)] border border-[var(--border-subtle)] rounded-[var(--radius-sm)] space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-[10px] uppercase tracking-wider text-[var(--text-tertiary)] font-bold">
                  SIGNAL AGREEMENT & CONFIDENCE
                </span>
                <span className="text-[10px] text-[var(--text-secondary)]">
                  {selectedAlert.independent_signal_count} Independent Signals
                </span>
              </div>

              <div className="p-2.5 rounded-[var(--radius-sm)] bg-[var(--surface-3)] border border-[var(--border-subtle)] text-[11px] text-[var(--text-secondary)] flex items-start gap-2 font-sans">
                <Info size={14} className="text-[var(--accent-primary-light)] shrink-0 mt-0.5" />
                <p>
                  Confidence reflects evidence quality and agreement; it does not modify the risk score.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-2 text-[11px]">
                <div className="p-2 bg-[var(--surface-3)] rounded-[var(--radius-sm)]">
                  <span className="text-[9px] uppercase text-[var(--text-tertiary)] block">EVIDENCE CATEGORIES</span>
                  <span className="text-[var(--text-primary)] font-semibold">{selectedAlert.evidence_categories.length} Categories</span>
                </div>
                <div className="p-2 bg-[var(--surface-3)] rounded-[var(--radius-sm)]">
                  <span className="text-[9px] uppercase text-[var(--text-tertiary)] block">CROSS-AGREEMENT</span>
                  <span className="text-[var(--accent-primary-light)] font-semibold">Consensus Validated</span>
                </div>
              </div>
            </div>

            {/* ── Graph Preview & Actions ── */}
            <div className="p-3.5 bg-[var(--surface-2)] border border-[var(--border-subtle)] rounded-[var(--radius-sm)] space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-[10px] uppercase tracking-wider text-[var(--text-tertiary)] font-bold">
                  SUBGRAPH TOPOLOGY PREVIEW
                </span>
                <Link href="/graph">
                  <span className="text-[10px] text-[var(--accent-primary-light)] hover:underline flex items-center gap-1">
                    <span>VIEW IN GRAPH</span>
                    <ExternalLink size={10} />
                  </span>
                </Link>
              </div>

              {/* Subgraph preview box */}
              <div className="h-24 bg-[var(--bg-primary)] rounded-[var(--radius-sm)] border border-[var(--border-subtle)] flex items-center justify-center relative overflow-hidden bg-grid-subtle">
                <svg className="w-full h-full" viewBox="0 0 240 80" fill="none">
                  <line x1="40" y1="40" x2="120" y2="40" stroke="#c8a96b" strokeWidth="1.5" strokeDasharray="3 3" />
                  <line x1="120" y1="40" x2="200" y2="40" stroke="#282828" strokeWidth="1.5" />

                  {/* Address Circle */}
                  <circle cx="40" cy="40" r="10" fill="#141414" stroke="#383838" strokeWidth="1.5" />
                  <circle cx="40" cy="40" r="2.5" fill="#a3a09a" />

                  {/* Critical TX Diamond */}
                  <polygon points="120,28 132,40 120,52 108,40" fill="#181818" stroke="#cf4c4c" strokeWidth="1.5" />
                  <circle cx="120" cy="40" r="2" fill="#cf4c4c" />

                  {/* Output Address */}
                  <circle cx="200" cy="40" r="10" fill="#141414" stroke="#383838" strokeWidth="1.5" />
                  <circle cx="200" cy="40" r="2.5" fill="#a3a09a" />
                </svg>
                <div className="absolute top-1.5 left-2 text-[9px] font-mono text-[var(--accent-primary-light)]">
                  ASSOCIATED CLUSTER: CLUSTER-84-ALPHA
                </div>
              </div>
            </div>

            {/* ── Investigation Action Buttons ── */}
            <div className="pt-3 border-t border-[var(--border-subtle)] flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Link href="/transactions">
                  <Button variant="secondary" size="sm">
                    <ArrowLeftRight size={13} />
                    <span>View Transaction</span>
                  </Button>
                </Link>
                <Link href="/graph">
                  <Button variant="primary" size="sm">
                    <GitBranch size={13} />
                    <span>View in Graph</span>
                  </Button>
                </Link>
              </div>

              <Button variant="accent" size="sm" onClick={() => setSelectedAlert(null)}>
                <span>Close Dossier</span>
              </Button>
            </div>
          </div>
        )}
      </Drawer>
    </PageContainer>
  );
}
