'use client';

import React, { useState, useEffect, useCallback, useMemo, Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
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
  RefreshCw,
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
  LoadingState,
} from '@/components/ui';
import { useRun } from '@/context/RunContext';
import {
  apiClient,
  ApiError,
  adaptApiAlertToAlert,
  adaptApiAlertDetail,
} from '@/lib/api';
import { Alert, RiskLevel } from '@/types';

type RiskFilterOption = 'ALL' | 'MEDIUM+' | 'HIGH+' | 'CRITICAL';

const COMPONENT_LABELS: Record<string, string> = {
  M: 'M (Multivariate Anomaly)',
  T: 'T (Temporal Deviation)',
  N: 'N (Network Observation)',
  G: 'G (Graph Topology)',
  S: 'S (Structural Pattern)',
  Gs: 'Gs (Graph Support)',
  C: 'C (Confidence Factor)',
};

const CONFIDENCE_LABELS: Record<string, string> = {
  D: 'D (Data Completeness)',
  E: 'E (Evidence Agreement)',
  S: 'S (Statistical Stability)',
  Gs: 'Gs (Graph Support)',
  X: 'X (Explanation Consistency)',
};

function AlertsContent() {
  const searchParams = useSearchParams();
  const queryAlertId = searchParams.get('alert_id') || searchParams.get('lead_id') || '';
  const queryTxid = searchParams.get('txid') || '';
  const querySearch = searchParams.get('search') || '';

  const { runId, currentRun, isHydrated } = useRun();
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [searchQuery, setSearchQuery] = useState(querySearch || queryTxid || '');
  const [selectedRiskFilter, setSelectedRiskFilter] = useState<RiskFilterOption>('ALL');
  const [selectedDetector, setSelectedDetector] = useState<string>('ALL');
  const [selectedAlertId, setSelectedAlertId] = useState<string | null>(queryAlertId || null);
  const [dossier, setDossier] = useState<ReturnType<typeof adaptApiAlertDetail> | null>(null);
  const [dossierLoading, setDossierLoading] = useState<boolean>(false);
  const [dossierError, setDossierError] = useState<string | null>(null);
  const [copiedTx, setCopiedTx] = useState(false);

  const fetchAlerts = useCallback(async (activeRunId: string) => {
    setLoading(true);
    setError(null);
    try {
      const response = await apiClient.getAlerts({ run_id: activeRunId });
      setAlerts((response?.alerts || []).map(adaptApiAlertToAlert));
    } catch (err: unknown) {
      const msg =
        err instanceof ApiError
          ? err.detail
          : err instanceof Error
          ? err.message
          : 'Failed to retrieve investigative leads from the API.';
      setError(msg);
      setAlerts([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isHydrated) return;
    let isCancelled = false;
    const init = async () => {
      await Promise.resolve();
      if (isCancelled) return;
      if (runId) {
        fetchAlerts(runId);
      } else {
        setLoading(false);
        setAlerts([]);
      }
    };
    init();
    return () => {
      isCancelled = true;
    };
  }, [runId, isHydrated, fetchAlerts]);

  // Synchronize alert selection with query parameters on load or URL changes
  useEffect(() => {
    let isCancelled = false;
    const syncQuery = async () => {
      await Promise.resolve();
      if (isCancelled) return;
      if (queryAlertId) {
        setSelectedAlertId(queryAlertId);
        return;
      }
      if (queryTxid && alerts.length > 0) {
        const match = alerts.find(
          (a) => a.transaction_id.toLowerCase() === queryTxid.toLowerCase()
        );
        if (match) {
          setSelectedAlertId(match.alert_id);
        }
      }
    };
    syncQuery();
    return () => {
      isCancelled = true;
    };
  }, [queryAlertId, queryTxid, alerts]);

  // Support browser Back/Forward navigation between dossier states
  useEffect(() => {
    const onPopState = () => {
      const sp = new URLSearchParams(window.location.search);
      const aid = sp.get('alert_id') || sp.get('lead_id');
      const tid = sp.get('txid');
      if (aid) {
        setSelectedAlertId(aid);
      } else if (tid && alerts.length > 0) {
        const match = alerts.find(
          (a) => a.transaction_id.toLowerCase() === tid.toLowerCase()
        );
        if (match) {
          setSelectedAlertId(match.alert_id);
        } else {
          setSelectedAlertId(null);
        }
      } else {
        setSelectedAlertId(null);
      }
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, [alerts]);

  // Retrieve canonical investigation dossier for selected alert from backend
  const fetchDossier = useCallback(
    async (alertId: string, activeRunId?: string | null) => {
      // Immediately reset to guarantee no stale data from previous selection is displayed
      setDossier(null);
      setDossierError(null);
      setDossierLoading(true);
      try {
        const detail = await apiClient.getAlert(alertId, activeRunId || undefined);
        setDossier(adaptApiAlertDetail(detail));
      } catch (err: unknown) {
        const msg =
          err instanceof ApiError
            ? err.detail
            : err instanceof Error
            ? err.message
            : `Failed to retrieve investigation dossier for alert ${alertId}.`;
        setDossierError(msg);
      } finally {
        setDossierLoading(false);
      }
    },
    []
  );

  useEffect(() => {
    let isCancelled = false;
    const initDossier = async () => {
      await Promise.resolve();
      if (isCancelled) return;
      if (!selectedAlertId) {
        setDossier(null);
        setDossierError(null);
        setDossierLoading(false);
        return;
      }
      fetchDossier(selectedAlertId, runId);
    };
    initDossier();
    return () => {
      isCancelled = true;
    };
  }, [selectedAlertId, runId, fetchDossier]);

  const handleSelectAlert = (alertId: string) => {
    setSelectedAlertId(alertId);
    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href);
      url.searchParams.set('alert_id', alertId);
      url.searchParams.delete('txid');
      window.history.pushState(null, '', url.toString());
    }
  };

  const handleCloseDossier = () => {
    setSelectedAlertId(null);
    setDossier(null);
    setDossierError(null);
    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href);
      url.searchParams.delete('alert_id');
      url.searchParams.delete('lead_id');
      url.searchParams.delete('txid');
      window.history.pushState(null, '', url.toString());
    }
  };

  // Derive unique detectors from real backend alerts
  const allDetectors = useMemo(
    () => Array.from(new Set(alerts.flatMap((a) => a.triggered_detectors || []))),
    [alerts]
  );

  // Filter alerts according to criteria while strictly preserving authoritative backend rank order
  const filteredAlerts = useMemo(() => {
    return alerts.filter((alert) => {
      // Risk tier filter
      if (selectedRiskFilter === 'CRITICAL' && alert.risk_level !== 'CRITICAL') return false;
      if (selectedRiskFilter === 'HIGH+' && alert.risk_level !== 'CRITICAL' && alert.risk_level !== 'HIGH') return false;
      if (selectedRiskFilter === 'MEDIUM+' && alert.risk_level === 'LOW') return false;

      // Detector filter
      if (selectedDetector !== 'ALL' && !(alert.triggered_detectors || []).includes(selectedDetector)) return false;

      // Search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        return (
          alert.transaction_id.toLowerCase().includes(q) ||
          alert.alert_id.toLowerCase().includes(q) ||
          (alert.triggered_detectors || []).some((d) => d.toLowerCase().includes(q))
        );
      }
      return true;
    });
  }, [alerts, selectedRiskFilter, selectedDetector, searchQuery]);

  // Summary row metrics computed strictly from real backend alerts
  const totalLeads = alerts.length;
  const highCriticalCount = alerts.filter(
    (a) => a.risk_level === 'CRITICAL' || a.risk_level === 'HIGH'
  ).length;
  const mediumPlusCount = alerts.filter((a) => a.risk_level !== 'LOW').length;
  const avgConfidence =
    alerts.length > 0
      ? (alerts.reduce((acc, a) => acc + a.confidence_score, 0) / alerts.length) * 100
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

  // Main investigation table columns preserving real backend attributes
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
            {alert.transaction_id.length > 24
              ? `${alert.transaction_id.slice(0, 14)}...${alert.transaction_id.slice(-8)}`
              : alert.transaction_id}
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
          {(alert.triggered_detectors || []).map((d, i) => (
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
      key: 'alert_id',
      header: 'ALERT ID',
      mono: true,
      render: (alert) => (
        <span className="text-[11px] font-mono text-[var(--text-tertiary)]">
          {alert.alert_id}
        </span>
      ),
    },
  ];

  // 1. Truthful Loading State
  if (!isHydrated || (loading && alerts.length === 0 && runId)) {
    return (
      <PageContainer
        title="INVESTIGATIVE LEADS"
        description="Ranked anomaly signals with explainable supporting evidence."
        tag="LEAD CONSOLE"
        icon={<ShieldAlert size={18} />}
      >
        <div className="flex flex-col items-center justify-center min-h-[360px] p-12 text-center border border-[var(--border-default)] rounded-[var(--radius-md)] bg-[var(--surface-1)]">
          <div className="w-8 h-8 border-2 border-[var(--accent-primary)] border-t-transparent rounded-full animate-spin mb-4" />
          <h3 className="text-xs font-mono font-semibold uppercase tracking-[0.1em] text-[var(--text-primary)]">
            Retrieving Investigative Leads
          </h3>
          <p className="text-xs text-[var(--text-tertiary)] mt-1 font-mono">
            Fetching ranked alerts from active run {runId}...
          </p>
        </div>
      </PageContainer>
    );
  }

  // 2. Truthful No Active Run State
  if (!runId || (!currentRun && alerts.length === 0)) {
    return (
      <PageContainer
        title="INVESTIGATIVE LEADS"
        description="Ranked anomaly signals with explainable supporting evidence."
        tag="LEAD CONSOLE"
        icon={<ShieldAlert size={18} />}
      >
        <EmptyState
          title="NO ACTIVE ANALYSIS RUN"
          description="No active transaction dataset run was found. Upload and analyze a dataset to generate ranked investigative leads and anomaly scores."
          action={
            <Link href="/analyze">
              <Button variant="accent" size="md">
                <span>Ingest Dataset</span>
                <ArrowRight size={14} />
              </Button>
            </Link>
          }
        />
      </PageContainer>
    );
  }

  // 3. Truthful API Error State
  if (error && alerts.length === 0) {
    return (
      <PageContainer
        title="INVESTIGATIVE LEADS"
        description="Ranked anomaly signals with explainable supporting evidence."
        tag="LEAD CONSOLE"
        icon={<ShieldAlert size={18} />}
      >
        <EmptyState
          title="API CONNECTION ERROR"
          description={error}
          action={
            <div className="flex items-center gap-3">
              {runId && (
                <Button variant="secondary" size="md" onClick={() => fetchAlerts(runId)}>
                  <span>Retry Request</span>
                </Button>
              )}
              <Link href="/analyze">
                <Button variant="accent" size="md">
                  <span>Ingest New Dataset</span>
                  <ArrowRight size={14} />
                </Button>
              </Link>
            </div>
          }
        />
      </PageContainer>
    );
  }

  // 4. Truthful Empty Run State (0 alerts detected)
  if (alerts.length === 0) {
    return (
      <PageContainer
        title="INVESTIGATIVE LEADS"
        description="Ranked anomaly signals with explainable supporting evidence."
        tag="LEAD CONSOLE"
        icon={<ShieldAlert size={18} />}
      >
        <EmptyState
          title="NO ANOMALOUS LEADS DETECTED"
          description={`Analysis run ${runId} completed with 0 flagged anomalies above analytical thresholds.`}
          action={
            <div className="flex items-center gap-3">
              <Link href="/overview">
                <Button variant="secondary" size="md">
                  <span>View Overview</span>
                </Button>
              </Link>
              <Link href="/analyze">
                <Button variant="accent" size="md">
                  <span>Ingest Another Dataset</span>
                  <ArrowRight size={14} />
                </Button>
              </Link>
            </div>
          }
        />
      </PageContainer>
    );
  }

  const activeRunId = currentRun?.run_id || runId || '';
  const datasetName = (currentRun?.dataset_metadata?.filename as string) || 'Ingested CSV Dataset';
  const scoringVersion = alerts[0]?.scoring_version || currentRun?.pipeline_version || 'sanket-scoring-v1';

  return (
    <PageContainer
      title="INVESTIGATIVE LEADS"
      description="Ranked anomaly signals with explainable supporting evidence."
      tag="LEAD CONSOLE"
      icon={<ShieldAlert size={18} />}
      actions={
        <div className="flex items-center gap-2">
          <Link href="/analyze">
            <Button variant="secondary" size="sm">
              <span>Ingest Dataset</span>
            </Button>
          </Link>
        </div>
      }
    >
      <div className="space-y-6">
        {/* ── 1. Page Header Metadata Context ── */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 bg-[var(--surface-1)] border border-[var(--border-default)] rounded-[var(--radius-md)] text-xs font-mono">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] uppercase text-[var(--text-tertiary)]">CURRENT RUN:</span>
              <span className="font-semibold text-[var(--accent-primary-light)]">{activeRunId}</span>
            </div>
            <span className="text-[var(--border-strong)]">|</span>
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] uppercase text-[var(--text-tertiary)]">TARGET DATASET:</span>
              <span className="text-[var(--text-primary)] font-medium">{datasetName}</span>
            </div>
            <span className="text-[var(--border-strong)]">|</span>
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] uppercase text-[var(--text-tertiary)]">SCORING ENGINE:</span>
              <span className="text-[var(--text-secondary)]">{scoringVersion}</span>
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
            <div className="text-xs font-bold text-[var(--text-secondary)] mt-1.5 truncate">{activeRunId}</div>
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
              <span>SHOWING {filteredAlerts.length} OF {alerts.length} RANKED LEADS</span>
              <span>CLICK ANY ROW TO OPEN INVESTIGATION DOSSIER</span>
            </div>

            <DataTable
              columns={columns}
              data={filteredAlerts}
              keyExtractor={(item) => item.alert_id}
              onRowClick={(item) => handleSelectAlert(item.alert_id)}
            />
          </div>
        )}
      </div>

      {/* ── 5. Canonical Investigation Dossier Drawer ── */}
      <Drawer
        isOpen={selectedAlertId !== null}
        onClose={handleCloseDossier}
        title={selectedAlertId ? `ALERT DOSSIER: ${selectedAlertId}` : 'ALERT DOSSIER'}
        className="max-w-xl"
      >
        {/* Loading State */}
        {dossierLoading && (
          <div className="flex flex-col items-center justify-center py-20 space-y-3 font-mono text-xs">
            <div className="w-7 h-7 border-2 border-[var(--accent-primary)] border-t-transparent rounded-full animate-spin" />
            <span className="text-[var(--text-secondary)]">Retrieving canonical alert dossier from backend...</span>
            <span className="text-[10px] text-[var(--text-tertiary)]">
              GET /api/v1/alerts/{selectedAlertId}{runId ? `?run_id=${runId}` : ''}
            </span>
          </div>
        )}

        {/* Error State */}
        {!dossierLoading && dossierError && (
          <div className="p-4 bg-[var(--risk-critical-bg)] border border-[var(--risk-critical-border)] rounded-[var(--radius-sm)] space-y-3 font-mono text-xs">
            <div className="flex items-center gap-2 text-[var(--risk-critical)] font-bold">
              <ShieldAlert size={16} />
              <span>FAILED TO RETRIEVE ALERT DOSSIER</span>
            </div>
            <p className="text-[var(--text-secondary)]">{dossierError}</p>
            <div className="flex items-center gap-2 pt-2">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => selectedAlertId && fetchDossier(selectedAlertId, runId)}
              >
                <RefreshCw size={12} />
                <span>Retry Request</span>
              </Button>
              <Button variant="ghost" size="sm" onClick={handleCloseDossier}>
                <span>Close</span>
              </Button>
            </div>
          </div>
        )}

        {/* Canonical Dossier Content */}
        {!dossierLoading && !dossierError && dossier && (
          <div className="space-y-6 font-mono text-xs">
            {/* Header Summary & Identifiers */}
            <div className="p-3.5 bg-[var(--surface-2)] border border-[var(--border-default)] rounded-[var(--radius-sm)] space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-[var(--accent-primary-light)]">
                    RANK #{dossier.alert.rank}
                  </span>
                  <span className="text-[var(--text-muted)]">|</span>
                  <span className="text-xs text-[var(--text-secondary)]">{dossier.alert.alert_id}</span>
                </div>
                <RiskBadge level={dossier.alert.risk_level} />
              </div>

              <div>
                <div className="text-[10px] uppercase text-[var(--text-tertiary)] mb-1">
                  TARGET TRANSACTION IDENTIFIER (TXID)
                </div>
                <div className="flex items-center justify-between gap-2 p-2 rounded-[var(--radius-sm)] bg-[var(--surface-3)] border border-[var(--border-subtle)]">
                  <span className="text-xs text-[var(--accent-primary-light)] break-all font-semibold select-all">
                    {dossier.alert.transaction_id}
                  </span>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      onClick={() => handleCopyTx(dossier.alert.transaction_id)}
                      className="p-1 text-[var(--text-tertiary)] hover:text-[var(--text-primary)] transition-colors"
                      title="Copy TXID"
                    >
                      {copiedTx ? <Check size={14} className="text-[var(--risk-low)]" /> : <Copy size={14} />}
                    </button>
                    <Link
                      href={`/transactions?txid=${encodeURIComponent(dossier.alert.transaction_id)}`}
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-[var(--radius-xs)] bg-[var(--surface-2)] hover:bg-[var(--surface-1)] text-[10px] text-[var(--accent-primary-light)] border border-[var(--border-subtle)] transition-colors"
                      title="View Transaction"
                    >
                      <span>Tx</span>
                      <ArrowRight size={11} />
                    </Link>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 text-[10px] text-[var(--text-tertiary)] pt-1 border-t border-[var(--border-subtle)]">
                <div>
                  <span className="text-[var(--text-tertiary)]">RUN ID: </span>
                  <span className="text-[var(--text-secondary)] select-all">{dossier.runId || runId || 'ACTIVE'}</span>
                </div>
                <div className="text-right">
                  <span className="text-[var(--text-tertiary)]">SCORING VERSION: </span>
                  <span className="text-[var(--text-secondary)]">{dossier.alert.scoring_version || 'sanket-scoring-v1'}</span>
                </div>
              </div>
            </div>

            {/* Score Triad Grid */}
            <div className="grid grid-cols-3 gap-2.5 text-center">
              <div className="p-3 bg-[var(--surface-2)] border border-[var(--border-subtle)] rounded-[var(--radius-sm)]">
                <span className="text-[9px] uppercase text-[var(--text-tertiary)] block">Composite Risk</span>
                <span className="text-base font-bold text-[var(--risk-critical)] block mt-0.5">
                  {dossier.alert.risk_score.toFixed(4)}
                </span>
                <span className="text-[9px] text-[var(--text-tertiary)] block mt-0.5">Range [0, 1]</span>
              </div>
              <div className="p-3 bg-[var(--surface-2)] border border-[var(--border-subtle)] rounded-[var(--radius-sm)]">
                <span className="text-[9px] uppercase text-[var(--text-tertiary)] block">Confidence</span>
                <span className="text-base font-bold text-[var(--text-primary)] block mt-0.5">
                  {(dossier.alert.confidence_score * 100).toFixed(1)}%
                </span>
                <span className="text-[9px] text-[var(--text-tertiary)] block mt-0.5">Epistemic</span>
              </div>
              <div className="p-3 bg-[var(--surface-2)] border border-[var(--border-subtle)] rounded-[var(--radius-sm)]">
                <span className="text-[9px] uppercase text-[var(--text-tertiary)] block">Priority Score</span>
                <span className="text-base font-bold text-[var(--accent-primary-light)] block mt-0.5">
                  {dossier.alert.priority_score.toFixed(4)}
                </span>
                <span className="text-[9px] text-[var(--text-tertiary)] block mt-0.5">R × C Ranker</span>
              </div>
            </div>

            {/* Evidence Items (WHY WAS THIS FLAGGED?) */}
            <div className="space-y-3">
              <div className="flex items-center justify-between border-b border-[var(--border-subtle)] pb-2">
                <div className="flex items-center gap-2">
                  <span className="w-1.5 h-3 bg-[var(--accent-primary)] rounded-xs" />
                  <span className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-primary)]">
                    WHY WAS THIS FLAGGED?
                  </span>
                </div>
                <span className="text-[10px] text-[var(--text-tertiary)]">
                  {dossier.evidenceItems.length} EVIDENCE ITEM{dossier.evidenceItems.length !== 1 ? 'S' : ''}
                </span>
              </div>

              {dossier.evidenceItems.length === 0 ? (
                <div className="p-3 text-[11px] text-[var(--text-tertiary)] bg-[var(--surface-2)] border border-[var(--border-subtle)] rounded-[var(--radius-sm)]">
                  No evidence items reported by backend for this alert.
                </div>
              ) : (
                <div className="space-y-2.5">
                  {dossier.evidenceItems.map((item, idx) => (
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
                        <span>Confidence: {(item.confidence * 100).toFixed(0)}%</span>
                        <span className="text-[var(--accent-primary-light)] uppercase font-mono">Backend Evidence</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Individual Detector Scores */}
            <div className="p-3.5 bg-[var(--surface-2)] border border-[var(--border-subtle)] rounded-[var(--radius-sm)] space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-[10px] uppercase tracking-wider text-[var(--text-tertiary)] font-bold">
                  INDIVIDUAL DETECTOR SCORES
                </span>
                <span className="text-[10px] text-[var(--text-tertiary)]">
                  {Object.keys(dossier.detectorScores).length} DETECTORS
                </span>
              </div>

              {Object.keys(dossier.detectorScores).length === 0 ? (
                <div className="p-2 text-[11px] text-[var(--text-tertiary)] bg-[var(--surface-3)] rounded-[var(--radius-sm)]">
                  Individual detector scores unavailable.
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-2 text-xs">
                  {Object.entries(dossier.detectorScores).map(([detector, score]) => (
                    <div
                      key={detector}
                      className="p-2 bg-[var(--surface-3)] rounded-[var(--radius-sm)] border border-[var(--border-subtle)] space-y-1"
                    >
                      <div className="flex items-center justify-between text-[11px]">
                        <span
                          className="text-[var(--text-secondary)] font-mono truncate mr-2"
                          title={detector}
                        >
                          {detector.replace(/_/g, ' ')}
                        </span>
                        <span className="text-[var(--accent-primary-light)] font-bold shrink-0">
                          {Number(score).toFixed(4)}
                        </span>
                      </div>
                      <div className="w-full h-1 bg-[var(--surface-1)] rounded-full overflow-hidden">
                        <div
                          className="h-full bg-[var(--accent-primary)] rounded-full"
                          style={{ width: `${Math.min(100, Math.max(0, Number(score) * 100))}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Component Risk Breakdown (M, T, N, G, S, Gs, C) */}
            <div className="p-3.5 bg-[var(--surface-2)] border border-[var(--border-subtle)] rounded-[var(--radius-sm)] space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-[10px] uppercase tracking-wider text-[var(--text-tertiary)] font-bold">
                  COMPONENT RISK BREAKDOWN
                </span>
                <span className="text-[10px] text-[var(--text-tertiary)]">
                  {Object.keys(dossier.componentScores).length} COMPONENTS
                </span>
              </div>

              {Object.keys(dossier.componentScores).length === 0 ? (
                <div className="p-2 text-[11px] text-[var(--text-tertiary)] bg-[var(--surface-3)] rounded-[var(--radius-sm)]">
                  Component scores unavailable.
                </div>
              ) : (
                <div className="space-y-2">
                  {Object.entries(dossier.componentScores).map(([key, score]) => {
                    const label = COMPONENT_LABELS[key] || key;
                    return (
                      <div key={key}>
                        <div className="flex items-center justify-between text-xs mb-1">
                          <span className="text-[var(--text-primary)] uppercase text-[11px]">{label}</span>
                          <span className="text-[var(--accent-primary-light)] font-semibold">
                            {Number(score).toFixed(4)}
                          </span>
                        </div>
                        <div className="w-full h-1.5 bg-[var(--surface-3)] rounded-full overflow-hidden">
                          <div
                            className="h-full bg-[var(--accent-primary)] rounded-full"
                            style={{ width: `${Math.min(100, Math.max(0, Number(score) * 100))}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Epistemic Confidence Breakdown (D, E, S, Gs, X) */}
            <div className="p-3.5 bg-[var(--surface-2)] border border-[var(--border-subtle)] rounded-[var(--radius-sm)] space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-[10px] uppercase tracking-wider text-[var(--text-tertiary)] font-bold">
                  CONFIDENCE BREAKDOWN
                </span>
                <span className="text-[10px] text-[var(--text-secondary)]">
                  {dossier.alert.independent_signal_count} Independent Signals
                </span>
              </div>

              <div className="p-2.5 rounded-[var(--radius-sm)] bg-[var(--surface-3)] border border-[var(--border-subtle)] text-[11px] text-[var(--text-secondary)] flex items-start gap-2 font-sans">
                <Info size={14} className="text-[var(--accent-primary-light)] shrink-0 mt-0.5" />
                <p>
                  Epistemic confidence measures data completeness, evidence agreement, and structural stability. It is determined exclusively by backend scoring.
                </p>
              </div>

              {Object.keys(dossier.confidenceComponents).length === 0 ? (
                <div className="p-2 text-[11px] text-[var(--text-tertiary)] bg-[var(--surface-3)] rounded-[var(--radius-sm)]">
                  Confidence component breakdown unavailable.
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-2 text-[11px]">
                  {Object.entries(dossier.confidenceComponents).map(([key, score]) => {
                    const label = CONFIDENCE_LABELS[key] || key;
                    return (
                      <div key={key} className="p-2 bg-[var(--surface-3)] rounded-[var(--radius-sm)] border border-[var(--border-subtle)]">
                        <span className="text-[9px] uppercase text-[var(--text-tertiary)] block truncate" title={label}>
                          {label}
                        </span>
                        <span className="text-[var(--accent-primary-light)] font-semibold">
                          {(Number(score) * 100).toFixed(1)}%
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Graph Evidence & Topology */}
            <div className="p-3.5 bg-[var(--surface-2)] border border-[var(--border-subtle)] rounded-[var(--radius-sm)] space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-[10px] uppercase tracking-wider text-[var(--text-tertiary)] font-bold">
                  GRAPH EVIDENCE & TOPOLOGY
                </span>
                <span className="text-[10px] text-[var(--text-tertiary)]">
                  {dossier.graphEvidence && Object.keys(dossier.graphEvidence).length > 0 ? 'OBSERVED' : 'UNAVAILABLE'}
                </span>
              </div>

              {dossier.graphEvidence && Object.keys(dossier.graphEvidence).length > 0 ? (
                <div className="p-2.5 rounded-[var(--radius-sm)] bg-[var(--surface-3)] border border-[var(--border-subtle)] space-y-2 text-[11px]">
                  {Object.entries(dossier.graphEvidence).map(([k, v]) => (
                    <div key={k} className="flex items-center justify-between border-b border-[var(--border-subtle)] last:border-none pb-1 last:pb-0">
                      <span className="text-[var(--text-secondary)] uppercase">{k.replace(/_/g, ' ')}</span>
                      <span className="text-[var(--text-primary)] font-mono">
                        {typeof v === 'number'
                          ? Number(v).toFixed(4)
                          : typeof v === 'object'
                          ? JSON.stringify(v)
                          : String(v)}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="p-2.5 rounded-[var(--radius-sm)] bg-[var(--surface-3)] border border-[var(--border-subtle)] text-[11px] text-[var(--text-tertiary)]">
                  Graph evidence unavailable for this alert.
                </div>
              )}
            </div>

            {/* Dossier Footer Action */}
            <div className="pt-3 border-t border-[var(--border-subtle)] flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Link href={`/transactions?txid=${encodeURIComponent(dossier.alert.transaction_id)}`}>
                  <Button variant="primary" size="sm">
                    <ArrowLeftRight size={13} />
                    <span>View Transaction</span>
                  </Button>
                </Link>
                <Link href={`/graph?txid=${encodeURIComponent(dossier.alert.transaction_id)}`}>
                  <Button variant="secondary" size="sm">
                    <GitBranch size={13} />
                    <span>View in Graph</span>
                  </Button>
                </Link>
              </div>
              <Button variant="ghost" size="sm" onClick={handleCloseDossier}>
                <span>Close Dossier</span>
              </Button>
            </div>
          </div>
        )}
      </Drawer>
    </PageContainer>
  );
}

export default function AlertsPage() {
  return (
    <Suspense fallback={<LoadingState message="Loading investigative leads..." />}>
      <AlertsContent />
    </Suspense>
  );
}
