'use client';

import React, { useState, useMemo, useEffect, useCallback, Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import {
  ArrowLeftRight,
  Search,
  Download,
  ExternalLink,
  Copy,
  Check,
  ShieldAlert,
  Network,
  ArrowDown,
  Info,
  Boxes,
  RefreshCw,
} from 'lucide-react';
import { PageContainer } from '@/components/PageContainer';
import {
  DataTable,
  Column,
  RiskBadge,
  SearchInput,
  FilterButton,
  Button,
  Drawer,
  EmptyState,
  LoadingState,
} from '@/components/ui';
import { useRun } from '@/context/RunContext';
import {
  apiClient,
  ApiError,
  ApiTransactionDetail,
} from '@/lib/api';
import { RiskLevel } from '@/types';

type RiskFilterOption = 'ALL' | 'CRITICAL' | 'HIGH+' | 'MEDIUM+' | 'LOW';

export interface UiTransactionRecord {
  txid: string;
  timestamp: string;
  block_height: number | null;
  value_btc: number;
  fee_btc: number | null;
  inputs_count: number;
  outputs_count: number;
  risk_score: number | null;
  risk_level: RiskLevel | null;
  confidence: number | null;
  triggered_detectors: string[] | null;
  observed_ip?: string;
  observed_asn?: string;
  status: string | null;
}

function adaptTransactionDetail(detail: ApiTransactionDetail): UiTransactionRecord {
  const canonical = detail.canonical_transaction;
  const alert = detail.alert as Record<string, unknown> | null;
  const investigation = detail.investigation as Record<string, unknown> | null;

  // 1. Risk score: only if genuinely provided by alert or investigation
  const riskScore =
    typeof alert?.risk_score === 'number'
      ? alert.risk_score
      : typeof investigation?.risk_score === 'number'
      ? investigation.risk_score
      : null;

  // 2. Risk level: only if genuinely provided by alert or investigation
  const rawRiskLevel =
    (alert?.risk_level as RiskLevel) ||
    (investigation?.risk_level as RiskLevel) ||
    null;
  const riskLevel =
    rawRiskLevel === 'CRITICAL' ||
    rawRiskLevel === 'HIGH' ||
    rawRiskLevel === 'MEDIUM' ||
    rawRiskLevel === 'LOW'
      ? rawRiskLevel
      : null;

  // 3. Confidence: only if genuinely provided
  const confidence =
    typeof alert?.confidence_score === 'number'
      ? alert.confidence_score
      : typeof investigation?.confidence_score === 'number'
      ? investigation.confidence_score
      : null;

  // 4. Triggered detectors: only if genuinely provided in alert or investigation
  const triggeredDetectors: string[] | null = Array.isArray(alert?.triggered_detectors)
    ? (alert.triggered_detectors as string[])
    : Array.isArray(investigation?.triggered_detectors)
    ? (investigation.triggered_detectors as string[])
    : null;

  // 5. Canonical status: DO NOT FABRICATE status from risk score.
  // Only use canonical backend status if actually provided.
  const rawStatus =
    (typeof canonical?.status === 'string' && canonical.status.trim()) ||
    (typeof alert?.status === 'string' && alert.status.trim()) ||
    (typeof investigation?.status === 'string' && investigation.status.trim()) ||
    null;

  // 6. Output amounts & total transacted value
  const outputAmounts: number[] = Array.isArray(canonical?.output_amounts)
    ? (canonical.output_amounts as number[])
    : [];
  const totalValueBtc = outputAmounts.reduce((sum, v) => sum + (Number(v) || 0), 0);

  return {
    txid: detail.transaction_id,
    timestamp: canonical?.timestamp || '',
    block_height: typeof canonical?.block_height === 'number' ? canonical.block_height : null,
    value_btc: totalValueBtc,
    fee_btc: typeof canonical?.fee === 'number' ? canonical.fee : null,
    inputs_count: Array.isArray(canonical?.input_addresses) ? canonical.input_addresses.length : 0,
    outputs_count: Array.isArray(canonical?.output_addresses) ? canonical.output_addresses.length : 0,
    risk_score: riskScore,
    risk_level: riskLevel,
    confidence,
    triggered_detectors: triggeredDetectors,
    observed_ip: canonical?.src_ip || canonical?.dst_ip || undefined,
    observed_asn: canonical?.asn || undefined,
    status: rawStatus,
  };
}

function getDetectorEvidenceDescription(
  detector: string,
  detail: ApiTransactionDetail | null
): string {
  if (!detail) {
    return `Observed anomaly indicator triggered by ${detector.replace(/_/g, ' ')} detector.`;
  }

  // 1. Check alert or investigation evidence items
  const alert = detail.alert as Record<string, unknown> | null;
  const investigation = detail.investigation as Record<string, unknown> | null;
  const items = (alert?.evidence_items || investigation?.evidence_items) as
    | Array<Record<string, unknown>>
    | undefined;

  if (Array.isArray(items)) {
    const match = items.find(
      (item) =>
        String(item.category || '').toLowerCase().includes(detector.toLowerCase()) ||
        String(item.source || '').toLowerCase().includes(detector.toLowerCase()) ||
        String(item.description || '').toLowerCase().includes(detector.toLowerCase())
    );
    if (match && typeof match.description === 'string' && match.description.trim()) {
      return match.description;
    }
  }

  // 2. Check detector evidence dictionary
  const detResults = detail.detector_results;
  const evMap = detResults?.evidence as Record<string, unknown> | null;
  if (evMap && evMap[detector]) {
    const val = evMap[detector];
    if (typeof val === 'string') return val;
    if (typeof val === 'object' && val !== null) {
      return Object.entries(val)
        .map(([k, v]) => `${k.replace(/_/g, ' ')}: ${v}`)
        .join(', ');
    }
    return String(val);
  }

  return `Observed anomaly indicator triggered by ${detector.replace(/_/g, ' ')} detector.`;
}

function TransactionsContent() {
  const searchParams = useSearchParams();
  const queryTxid = searchParams.get('txid');
  const querySearch = searchParams.get('search');
  const initialQuery = querySearch || queryTxid || '';

  const { runId, currentRun, isHydrated } = useRun();
  const [activeRunId, setActiveRunId] = useState<string | null>(runId);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [transactions, setTransactions] = useState<UiTransactionRecord[]>([]);
  const [selectedTx, setSelectedTx] = useState<UiTransactionRecord | null>(null);
  const [selectedTxDetail, setSelectedTxDetail] = useState<ApiTransactionDetail | null>(null);
  const [searchQuery, setSearchQuery] = useState(initialQuery);
  const [selectedRiskFilter, setSelectedRiskFilter] = useState<RiskFilterOption>('ALL');
  const [selectedDetector, setSelectedDetector] = useState<string>('ALL');
  const [selectedAsn, setSelectedAsn] = useState<string>('ALL');
  const [selectedStatus, setSelectedStatus] = useState<string>('ALL');
  const [copiedTx, setCopiedTx] = useState(false);
  const [lookupLoading, setLookupLoading] = useState(false);

  // Fetch transactions and handle initial query
  const loadTransactions = useCallback(async () => {
    setLoading(true);
    setError(null);

    let effectiveRunId = runId;

    // If runId is not in RunContext, attempt discovering latest active run from backend
    if (!effectiveRunId) {
      try {
        const latest = await apiClient.getLatestRun();
        if (latest && latest.run_id) {
          effectiveRunId = latest.run_id;
        }
      } catch {
        // No active run found on backend
      }
    }

    if (!effectiveRunId) {
      setLoading(false);
      setActiveRunId(null);
      setTransactions([]);
      return;
    }

    setActiveRunId(effectiveRunId);

    try {
      // 1. Fetch ranked alerts for the active run to discover canonical transaction leads
      const alertsRes = await apiClient.getAlerts({ run_id: effectiveRunId });
      const alertsList = alertsRes?.alerts || [];

      // Collect unique transaction IDs from alerts, prioritizing initial query (e.g. from alert dossier link)
      const txidSet = new Set<string>();
      if (initialQuery && initialQuery.trim()) {
        txidSet.add(initialQuery.trim());
      }
      alertsList.forEach((a) => {
        if (a.transaction_id) txidSet.add(a.transaction_id);
      });

      const txidsToFetch = Array.from(txidSet).slice(0, 100);

      if (txidsToFetch.length === 0) {
        setTransactions([]);
        setLoading(false);
        return;
      }

      // 2. Fetch transaction details concurrently to keep payloads bounded
      const results = await Promise.allSettled(
        txidsToFetch.map((id) => apiClient.getTransaction(id, effectiveRunId))
      );

      const loaded: UiTransactionRecord[] = [];
      let matchedDetail: ApiTransactionDetail | null = null;

      results.forEach((res) => {
        if (res.status === 'fulfilled' && res.value) {
          const adapted = adaptTransactionDetail(res.value);
          loaded.push(adapted);
          if (
            initialQuery &&
            adapted.txid.toLowerCase() === initialQuery.trim().toLowerCase()
          ) {
            matchedDetail = res.value;
          }
        }
      });

      setTransactions(loaded);

      // 3. If an initial query matches, select that transaction immediately
      if (initialQuery && initialQuery.trim()) {
        const q = initialQuery.trim().toLowerCase();
        const match = loaded.find(
          (t) => t.txid.toLowerCase() === q || t.txid.toLowerCase().includes(q)
        );
        if (match) {
          setSelectedTx(match);
          if (matchedDetail) {
            setSelectedTxDetail(matchedDetail);
          } else {
            apiClient.getTransaction(match.txid, effectiveRunId)
              .then((d) => setSelectedTxDetail(d))
              .catch(() => {});
          }
        }
      }
    } catch (err: unknown) {
      const msg =
        err instanceof ApiError
          ? err.detail
          : err instanceof Error
          ? err.message
          : 'Failed to retrieve transaction forensic records from API.';
      setError(msg);
      setTransactions([]);
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
        loadTransactions();
      }
    };
    init();

    return () => {
      isCancelled = true;
    };
  }, [isHydrated, loadTransactions]);

  // Exact lookup handler for search query not in local list
  const handleExactLookup = useCallback(
    async (txidToFind: string) => {
      const currentRunId = activeRunId || runId;
      if (!txidToFind || !currentRunId) return;
      setLookupLoading(true);
      setError(null);
      try {
        const detail = await apiClient.getTransaction(txidToFind, currentRunId);
        const adapted = adaptTransactionDetail(detail);
        setTransactions((prev) => {
          const exists = prev.some((t) => t.txid === adapted.txid);
          return exists ? prev : [adapted, ...prev];
        });
        setSelectedTx(adapted);
        setSelectedTxDetail(detail);
      } catch (err: unknown) {
        const msg =
          err instanceof ApiError
            ? err.detail
            : `Transaction '${txidToFind}' not found in active analysis run '${currentRunId}'.`;
        setError(msg);
      } finally {
        setLookupLoading(false);
      }
    },
    [activeRunId, runId]
  );

  const handleSelectTx = useCallback(
    async (tx: UiTransactionRecord) => {
      setSelectedTx(tx);
      setSelectedTxDetail(null);
      if (typeof window !== 'undefined') {
        const url = new URL(window.location.href);
        url.searchParams.set('txid', tx.txid);
        window.history.pushState(null, '', url.toString());
      }
      try {
        const detail = await apiClient.getTransaction(tx.txid, activeRunId || runId || undefined);
        setSelectedTxDetail(detail);
      } catch (err) {
        console.warn('[Transactions] Could not fetch detailed record for', tx.txid, err);
      }
    },
    [activeRunId, runId]
  );

  // Support browser Back/Forward navigation to preserve selected transaction
  useEffect(() => {
    const onPopState = () => {
      const sp = new URLSearchParams(window.location.search);
      const tid = sp.get('txid') || sp.get('search');
      if (tid) {
        const match = transactions.find(
          (t) => t.txid.toLowerCase() === tid.toLowerCase()
        );
        if (match) {
          setSelectedTx(match);
          apiClient
            .getTransaction(match.txid, activeRunId || undefined)
            .then(setSelectedTxDetail)
            .catch(() => {});
        } else {
          handleExactLookup(tid);
        }
      } else {
        setSelectedTx(null);
        setSelectedTxDetail(null);
      }
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, [transactions, activeRunId, handleExactLookup]);

  // Synchronize selected transaction when URL query parameter updates or is removed
  useEffect(() => {
    let isCancelled = false;
    const syncWithUrl = async () => {
      await Promise.resolve();
      if (isCancelled) return;
      const target = queryTxid || querySearch;
      if (target && target.trim()) {
        const tid = target.trim().toLowerCase();
        if (selectedTx?.txid.toLowerCase() === tid && selectedTxDetail) {
          return;
        }
        const match = transactions.find((t) => t.txid.toLowerCase() === tid);
        if (match) {
          setSelectedTx(match);
          apiClient
            .getTransaction(match.txid, activeRunId || undefined)
            .then((d) => {
              if (!isCancelled) setSelectedTxDetail(d);
            })
            .catch(() => {});
        } else if (activeRunId && transactions.length > 0) {
          handleExactLookup(target.trim());
        }
      } else {
        setSelectedTx(null);
        setSelectedTxDetail(null);
      }
    };
    syncWithUrl();
    return () => {
      isCancelled = true;
    };
  }, [queryTxid, querySearch, transactions, activeRunId, handleExactLookup, selectedTx, selectedTxDetail]);

  // Derive unique detectors & ASNs from real transactions
  const allDetectors = useMemo(() => {
    const set = new Set<string>();
    transactions.forEach((tx) => {
      if (Array.isArray(tx.triggered_detectors)) {
        tx.triggered_detectors.forEach((d) => set.add(d));
      }
    });
    return Array.from(set);
  }, [transactions]);

  const allAsns = useMemo(() => {
    const set = new Set<string>();
    transactions.forEach((tx) => {
      if (tx.observed_asn) set.add(tx.observed_asn);
    });
    return Array.from(set);
  }, [transactions]);

  const allStatuses = useMemo(() => {
    const set = new Set<string>();
    transactions.forEach((tx) => {
      if (tx.status) set.add(tx.status);
    });
    return Array.from(set);
  }, [transactions]);

  // Filter transactions
  const filteredTransactions = useMemo(() => {
    return transactions.filter((tx) => {
      // Risk filter: missing risk data does not match specific tiers
      if (selectedRiskFilter === 'CRITICAL' && tx.risk_level !== 'CRITICAL') return false;
      if (selectedRiskFilter === 'HIGH+' && tx.risk_level !== 'CRITICAL' && tx.risk_level !== 'HIGH') return false;
      if (
        selectedRiskFilter === 'MEDIUM+' &&
        tx.risk_level !== 'CRITICAL' &&
        tx.risk_level !== 'HIGH' &&
        tx.risk_level !== 'MEDIUM'
      ) {
        return false;
      }
      if (selectedRiskFilter === 'LOW' && tx.risk_level !== 'LOW') return false;

      // Detector filter
      if (
        selectedDetector !== 'ALL' &&
        (!tx.triggered_detectors || !tx.triggered_detectors.includes(selectedDetector))
      ) {
        return false;
      }

      // ASN filter
      if (selectedAsn !== 'ALL' && tx.observed_asn !== selectedAsn) return false;

      // Status filter
      if (selectedStatus !== 'ALL' && tx.status !== selectedStatus) return false;

      // Search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchTxid = tx.txid.toLowerCase().includes(q);
        const matchIp = tx.observed_ip?.toLowerCase().includes(q) || false;
        const matchAsn = tx.observed_asn?.toLowerCase().includes(q) || false;
        const matchBlock =
          tx.block_height !== null && tx.block_height > 0
            ? tx.block_height.toString().includes(q)
            : false;
        const matchDetector =
          tx.triggered_detectors?.some((d) => d.toLowerCase().includes(q)) || false;
        if (!matchTxid && !matchIp && !matchAsn && !matchBlock && !matchDetector) return false;
      }

      return true;
    });
  }, [transactions, searchQuery, selectedRiskFilter, selectedDetector, selectedAsn, selectedStatus]);

  // Forensic summary metrics derived from real data
  const totalTxs = transactions.length;
  const flaggedCount = transactions.filter(
    (tx) =>
      tx.risk_level === 'CRITICAL' ||
      tx.risk_level === 'HIGH' ||
      (tx.status && (tx.status.toLowerCase() === 'flagged' || tx.status.toLowerCase() === 'anomalous'))
  ).length;
  const totalVolumeBtc = transactions.reduce((acc, tx) => acc + (tx.value_btc || 0), 0);
  const scoredTxs = transactions.filter((tx) => typeof tx.confidence === 'number');
  const avgConfidence =
    scoredTxs.length > 0
      ? (scoredTxs.reduce((acc, tx) => acc + (tx.confidence || 0), 0) / scoredTxs.length) * 100
      : null;

  const handleCopyTx = (txid: string) => {
    navigator.clipboard?.writeText(txid);
    setCopiedTx(true);
    setTimeout(() => setCopiedTx(false), 2000);
  };

  const clearFilters = () => {
    setSearchQuery('');
    setSelectedRiskFilter('ALL');
    setSelectedDetector('ALL');
    setSelectedAsn('ALL');
    setSelectedStatus('ALL');
  };

  const handleExportTransactions = () => {
    if (filteredTransactions.length === 0) return;
    const header = [
      'txid',
      'timestamp',
      'block_height',
      'value_btc',
      'fee_btc',
      'inputs_count',
      'outputs_count',
      'risk_score',
      'risk_level',
      'confidence',
      'status',
      'observed_ip',
      'observed_asn',
    ];
    const rows = filteredTransactions.map((t) => [
      t.txid,
      t.timestamp,
      t.block_height !== null ? t.block_height : '',
      t.value_btc,
      t.fee_btc !== null ? t.fee_btc : '',
      t.inputs_count,
      t.outputs_count,
      t.risk_score !== null ? t.risk_score : '',
      t.risk_level || '',
      t.confidence !== null ? t.confidence : '',
      t.status || '',
      t.observed_ip || '',
      t.observed_asn || '',
    ]);
    const csvContent =
      'data:text/csv;charset=utf-8,' +
      [header.join(','), ...rows.map((e) => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `transactions_${activeRunId || 'export'}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Main Transaction Table Columns
  const columns: Column<UiTransactionRecord>[] = [
    {
      key: 'txid',
      header: 'TRANSACTION ID (TXID)',
      mono: true,
      render: (tx) => (
        <div className="flex items-center gap-2">
          <span className="font-mono text-xs font-semibold text-[var(--accent-primary-light)]">
            {tx.txid.length > 22 ? `${tx.txid.slice(0, 14)}...${tx.txid.slice(-8)}` : tx.txid}
          </span>
          <span className="text-[10px] font-mono text-[var(--text-tertiary)]">
            {tx.block_height !== null && tx.block_height > 0 ? `#${tx.block_height}` : '—'}
          </span>
        </div>
      ),
    },
    {
      key: 'timestamp',
      header: 'TIMESTAMP (UTC)',
      mono: true,
      width: '160px',
      render: (tx) => (
        <span className="font-mono text-[11px] text-[var(--text-secondary)]">
          {tx.timestamp ? tx.timestamp.replace('T', ' ').replace(':00Z', ' UTC') : '—'}
        </span>
      ),
    },
    {
      key: 'risk_level',
      header: 'RISK',
      width: '120px',
      render: (tx) => (
        <div className="flex items-center gap-1.5">
          {tx.risk_level ? (
            <>
              <RiskBadge level={tx.risk_level} size="sm" />
              <span className="font-mono text-[11px] font-semibold text-[var(--text-primary)]">
                {typeof tx.risk_score === 'number' ? tx.risk_score.toFixed(2) : '—'}
              </span>
            </>
          ) : (
            <span className="font-mono text-[11px] text-[var(--text-tertiary)]">—</span>
          )}
        </div>
      ),
    },
    {
      key: 'confidence',
      header: 'CONF.',
      mono: true,
      align: 'right',
      width: '80px',
      render: (tx) => (
        <span className="font-mono text-xs font-medium text-[var(--text-primary)]">
          {typeof tx.confidence === 'number' ? `${(tx.confidence * 100).toFixed(0)}%` : '—'}
        </span>
      ),
    },
    {
      key: 'value_btc',
      header: 'FLOW (BTC / VECTORS)',
      mono: true,
      render: (tx) => (
        <div className="flex items-center gap-2">
          <span className="font-mono text-xs font-bold text-[var(--text-primary)]">
            {tx.value_btc.toFixed(4)} BTC
          </span>
          <span className="text-[10px] font-mono text-[var(--text-tertiary)]">
            ({tx.inputs_count} in → {tx.outputs_count} out)
          </span>
        </div>
      ),
    },
    {
      key: 'observed_ip',
      header: 'NETWORK OBSERVATION',
      mono: true,
      render: (tx) => (
        <div className="flex items-center gap-1.5">
          <span className="font-mono text-[11px] text-[var(--text-secondary)]">
            {tx.observed_ip || '—'}
          </span>
          {tx.observed_asn && (
            <span className="text-[10px] font-mono px-1 py-0.2 rounded-xs bg-[var(--surface-2)] text-[var(--accent-primary-light)] border border-[var(--border-subtle)]">
              {tx.observed_asn}
            </span>
          )}
        </div>
      ),
    },
    {
      key: 'triggered_detectors',
      header: 'TRIGGERED DETECTORS',
      render: (tx) => (
        <div className="flex flex-wrap gap-1">
          {tx.triggered_detectors === null || tx.triggered_detectors === undefined ? (
            <span className="text-[10px] font-mono text-[var(--text-muted)]">—</span>
          ) : tx.triggered_detectors.length === 0 ? (
            <span className="text-[10px] font-mono text-[var(--text-muted)]">No anomalies</span>
          ) : (
            tx.triggered_detectors.map((d, i) => (
              <span
                key={i}
                className="text-[9px] font-mono uppercase px-1.5 py-0.5 rounded-xs bg-[var(--surface-2)] text-[var(--text-secondary)] border border-[var(--border-subtle)]"
              >
                {d.replace(/_/g, ' ')}
              </span>
            ))
          )}
        </div>
      ),
    },
  ];

  return (
    <PageContainer
      title="TRANSACTIONS"
      description="Transaction-level structure, network observations, and anomaly evidence."
      tag="FORENSIC WORKSPACE"
      icon={<ArrowLeftRight size={18} />}
      actions={
        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={handleExportTransactions}
            disabled={filteredTransactions.length === 0}
          >
            <Download size={13} />
            <span>Export Transactions</span>
          </Button>
        </div>
      }
    >
      <div className="space-y-6">
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
              <span className="text-[10px] uppercase text-[var(--text-tertiary)]">TARGET DATASET:</span>
              <span className="text-[var(--text-primary)] font-medium">
                {(currentRun?.dataset_metadata?.filename as string) ||
                  (currentRun?.dataset_metadata?.source as string) ||
                  (activeRunId ? 'Active Ingested Dataset' : '—')}
              </span>
            </div>
            <span className="text-[var(--border-strong)]">|</span>
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] uppercase text-[var(--text-tertiary)]">ENGINE:</span>
              <span className="text-[var(--text-secondary)]">
                {currentRun?.pipeline_version || 'sanket-pipeline-v1'}
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
                  Transaction API Error
                </div>
                <div className="text-xs text-[var(--text-secondary)] mt-0.5">
                  {error}
                </div>
              </div>
            </div>
            <Button variant="secondary" size="sm" onClick={loadTransactions}>
              <RefreshCw size={13} />
              <span>Retry</span>
            </Button>
          </div>
        )}

        {/* ── 2. Summary Metrics Strip ── */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 font-mono text-xs">
          <div className="p-3 bg-[var(--surface-1)] border border-[var(--border-default)] rounded-[var(--radius-sm)] flex flex-col justify-between">
            <span className="text-[10px] uppercase text-[var(--text-tertiary)]">TOTAL TRANSACTIONS</span>
            <div className="text-lg font-bold text-[var(--text-primary)] mt-1">{totalTxs}</div>
          </div>
          <div className="p-3 bg-[var(--surface-1)] border border-[var(--border-default)] rounded-[var(--radius-sm)] flex flex-col justify-between">
            <span className="text-[10px] uppercase text-[var(--text-tertiary)]">FLAGGED / ANOMALOUS</span>
            <div className="text-lg font-bold text-[var(--risk-critical)] mt-1">{flaggedCount}</div>
          </div>
          <div className="p-3 bg-[var(--surface-1)] border border-[var(--border-default)] rounded-[var(--radius-sm)] flex flex-col justify-between">
            <span className="text-[10px] uppercase text-[var(--text-tertiary)]">TOTAL VOLUME</span>
            <div className="text-lg font-bold text-[var(--accent-primary-light)] mt-1">
              {totalVolumeBtc.toFixed(4)} BTC
            </div>
          </div>
          <div className="p-3 bg-[var(--surface-1)] border border-[var(--border-default)] rounded-[var(--radius-sm)] flex flex-col justify-between">
            <span className="text-[10px] uppercase text-[var(--text-tertiary)]">AVG CONFIDENCE</span>
            <div className="text-lg font-bold text-[var(--text-primary)] mt-1">
              {avgConfidence !== null ? `${avgConfidence.toFixed(1)}%` : '—'}
            </div>
          </div>
          <div className="p-3 bg-[var(--surface-1)] border border-[var(--border-default)] rounded-[var(--radius-sm)] flex flex-col justify-between">
            <span className="text-[10px] uppercase text-[var(--text-tertiary)]">NETWORK ASNS</span>
            <div className="text-lg font-bold text-[var(--text-secondary)] mt-1">{allAsns.length} Observed</div>
          </div>
        </div>

        {/* ── 3. Forensic Search & Filter Strip ── */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 p-3 bg-[var(--surface-1)] border border-[var(--border-default)] rounded-[var(--radius-md)]">
          <div className="flex-1 max-w-md">
            <SearchInput
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search transaction ID, address, IP, or ASN"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Risk Tier Filters */}
            <div className="flex items-center gap-1">
              <span className="text-[10px] font-mono uppercase text-[var(--text-tertiary)] mr-1">
                RISK:
              </span>
              {(['ALL', 'CRITICAL', 'HIGH+', 'MEDIUM+', 'LOW'] as const).map((opt) => (
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
                className="h-7 px-2 text-[11px] bg-[var(--surface-2)] text-[var(--text-secondary)] border border-[var(--border-default)] rounded-[var(--radius-sm)] focus:outline-none focus:border-[var(--accent-primary-border)]"
              >
                <option value="ALL">All Detectors</option>
                {allDetectors.map((d) => (
                  <option key={d} value={d}>
                    {d.replace(/_/g, ' ').toUpperCase()}
                  </option>
                ))}
              </select>
            </div>

            {/* ASN Filter Dropdown */}
            <div className="flex items-center gap-1.5 pl-2 border-l border-[var(--border-subtle)] font-mono text-xs">
              <span className="text-[10px] uppercase text-[var(--text-tertiary)]">ASN:</span>
              <select
                value={selectedAsn}
                onChange={(e) => setSelectedAsn(e.target.value)}
                className="h-7 px-2 text-[11px] bg-[var(--surface-2)] text-[var(--text-secondary)] border border-[var(--border-default)] rounded-[var(--radius-sm)] focus:outline-none focus:border-[var(--accent-primary-border)]"
              >
                <option value="ALL">All ASNs</option>
                {allAsns.map((asn) => (
                  <option key={asn} value={asn}>
                    {asn}
                  </option>
                ))}
              </select>
            </div>

            {/* Status Filter Dropdown if statuses exist */}
            {allStatuses.length > 0 && (
              <div className="flex items-center gap-1.5 pl-2 border-l border-[var(--border-subtle)] font-mono text-xs">
                <span className="text-[10px] uppercase text-[var(--text-tertiary)]">STATUS:</span>
                <select
                  value={selectedStatus}
                  onChange={(e) => setSelectedStatus(e.target.value)}
                  className="h-7 px-2 text-[11px] bg-[var(--surface-2)] text-[var(--text-secondary)] border border-[var(--border-default)] rounded-[var(--radius-sm)] focus:outline-none focus:border-[var(--accent-primary-border)]"
                >
                  <option value="ALL">All Statuses</option>
                  {allStatuses.map((s) => (
                    <option key={s} value={s}>
                      {s.toUpperCase()}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Active count */}
            <div className="text-[11px] font-mono text-[var(--text-tertiary)] pl-2 border-l border-[var(--border-subtle)]">
              {filteredTransactions.length} OF {transactions.length} TXS
            </div>
          </div>
        </div>

        {/* ── 4. Main Transaction Investigation Table or Loading/Empty States ── */}
        {loading ? (
          <LoadingState message="Loading real transaction forensic records from API..." />
        ) : transactions.length === 0 ? (
          <EmptyState
            icon={<ArrowLeftRight size={24} />}
            title="NO TRANSACTIONS IN CURRENT RUN"
            description={
              activeRunId
                ? `Active analysis run '${activeRunId}' has no transaction records available.`
                : 'No active analysis run found. Please upload and analyze a dataset to inspect transactions.'
            }
            action={
              <Link href="/analyze">
                <Button variant="primary" size="sm">
                  <span>GO TO ANALYZE</span>
                </Button>
              </Link>
            }
          />
        ) : filteredTransactions.length === 0 ? (
          <EmptyState
            icon={<Search size={22} />}
            title="NO MATCHING TRANSACTIONS IN CURRENT LIST"
            description={`No loaded transactions match "${searchQuery || 'current filters'}".`}
            action={
              <div className="flex items-center gap-2">
                {searchQuery.trim().length > 6 && (
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={() => handleExactLookup(searchQuery.trim())}
                    disabled={lookupLoading}
                  >
                    <Search size={13} />
                    <span>{lookupLoading ? 'LOOKING UP...' : 'EXACT TXID LOOKUP'}</span>
                  </Button>
                )}
                <Button variant="secondary" size="sm" onClick={clearFilters}>
                  <span>CLEAR FILTERS</span>
                </Button>
              </div>
            }
          />
        ) : (
          <div className="relative">
            <DataTable
              columns={columns}
              data={filteredTransactions}
              keyExtractor={(tx) => tx.txid}
              onRowClick={(tx) => handleSelectTx(tx)}
              emptyMessage="No transaction records available in current analysis run."
            />
          </div>
        )}
      </div>

      {/* ── 5. Forensic Transaction Investigation Drawer ── */}
      <Drawer
        isOpen={selectedTx !== null}
        onClose={() => {
          setSelectedTx(null);
          setSelectedTxDetail(null);
        }}
        title="TRANSACTION FORENSIC DOSSIER"
        className="max-w-2xl"
      >
        {selectedTx && (
          <div className="space-y-6 font-mono text-xs">
            {/* Header: TXID & Risk Tier */}
            <div className="p-4 bg-[var(--surface-2)] border border-[var(--border-default)] rounded-[var(--radius-md)] space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">
                  TRANSACTION IDENTIFIER
                </span>
                {selectedTx.risk_level ? (
                  <RiskBadge level={selectedTx.risk_level} size="sm" />
                ) : (
                  <span className="text-[10px] font-mono text-[var(--text-tertiary)]">—</span>
                )}
              </div>

              <div className="flex items-start justify-between gap-3 bg-[var(--surface-1)] p-3 rounded-[var(--radius-sm)] border border-[var(--border-subtle)]">
                <div className="text-xs font-bold text-[var(--accent-primary-light)] break-all leading-relaxed">
                  {selectedTx.txid}
                </div>
                <button
                  onClick={() => handleCopyTx(selectedTx.txid)}
                  className="p-1.5 text-[var(--text-tertiary)] hover:text-[var(--text-primary)] bg-[var(--surface-2)] hover:bg-[var(--surface-3)] rounded-[var(--radius-sm)] transition-colors shrink-0"
                  title="Copy full TXID"
                >
                  {copiedTx ? <Check size={14} className="text-[var(--risk-low)]" /> : <Copy size={14} />}
                </button>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2 pt-2 text-[11px] text-[var(--text-secondary)] border-t border-[var(--border-subtle)]">
                <div>
                  <span className="text-[var(--text-tertiary)]">BLOCK HEIGHT:</span>{' '}
                  <span className="text-[var(--text-primary)] font-semibold">
                    {selectedTx.block_height !== null && selectedTx.block_height > 0
                      ? `#${selectedTx.block_height}`
                      : '—'}
                  </span>
                </div>
                <div>
                  <span className="text-[var(--text-tertiary)]">TIMESTAMP:</span>{' '}
                  <span className="text-[var(--text-primary)]">
                    {selectedTx.timestamp ? selectedTx.timestamp.replace('T', ' ').replace(':00Z', ' UTC') : '—'}
                  </span>
                </div>
                <div>
                  <span className="text-[var(--text-tertiary)]">STATUS:</span>{' '}
                  <span className="uppercase text-[var(--accent-primary-light)] font-semibold">
                    {selectedTx.status ? selectedTx.status.toUpperCase() : '—'}
                  </span>
                </div>
              </div>
            </div>

            {/* Metrics Strip */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
              <div className="p-3 bg-[var(--surface-2)] border border-[var(--border-subtle)] rounded-[var(--radius-sm)]">
                <span className="text-[10px] uppercase text-[var(--text-tertiary)] block">AMOUNT</span>
                <span className="text-sm font-bold text-[var(--text-primary)] mt-1 block">
                  {selectedTx.value_btc.toFixed(4)} BTC
                </span>
              </div>
              <div className="p-3 bg-[var(--surface-2)] border border-[var(--border-subtle)] rounded-[var(--radius-sm)]">
                <span className="text-[10px] uppercase text-[var(--text-tertiary)] block">MINING FEE</span>
                <span className="text-xs font-semibold text-[var(--text-secondary)] mt-1.5 block">
                  {typeof selectedTx.fee_btc === 'number' && selectedTx.fee_btc > 0
                    ? `${selectedTx.fee_btc.toFixed(5)} BTC`
                    : '—'}
                </span>
              </div>
              <div className="p-3 bg-[var(--surface-2)] border border-[var(--border-subtle)] rounded-[var(--radius-sm)]">
                <span className="text-[10px] uppercase text-[var(--text-tertiary)] block">RISK SCORE</span>
                <span className="text-sm font-bold text-[var(--risk-critical)] mt-1 block">
                  {typeof selectedTx.risk_score === 'number' ? selectedTx.risk_score.toFixed(2) : '—'}
                </span>
              </div>
              <div className="p-3 bg-[var(--surface-2)] border border-[var(--border-subtle)] rounded-[var(--radius-sm)]">
                <span className="text-[10px] uppercase text-[var(--text-tertiary)] block">CONFIDENCE</span>
                <span className="text-sm font-bold text-[var(--accent-primary-light)] mt-1 block">
                  {typeof selectedTx.confidence === 'number'
                    ? `${(selectedTx.confidence * 100).toFixed(0)}%`
                    : '—'}
                </span>
              </div>
            </div>

            {/* ── 6. Transaction Flow Diagram (Transaction-Local View) ── */}
            <div className="p-4 bg-[var(--surface-2)] border border-[var(--border-default)] rounded-[var(--radius-md)] space-y-3">
              <div className="flex items-center justify-between">
                <div className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">
                  TRANSACTION STRUCTURAL FLOW
                </div>
                <span className="text-[10px] text-[var(--text-tertiary)]">
                  {selectedTx.inputs_count} Inputs · {selectedTx.outputs_count} Outputs
                </span>
              </div>

              {/* Flow box */}
              <div className="p-4 bg-[var(--surface-1)] border border-[var(--border-subtle)] rounded-[var(--radius-sm)] space-y-3">
                {/* Inputs Node */}
                <div className="flex items-center justify-between p-2.5 bg-[var(--surface-2)] border border-[var(--border-subtle)] rounded-[var(--radius-sm)]">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-[var(--text-secondary)]" />
                    <span className="text-xs font-semibold text-[var(--text-primary)]">
                      {selectedTx.inputs_count} Input Vector{selectedTx.inputs_count !== 1 ? 's' : ''}
                    </span>
                  </div>
                  <span className="text-[11px] text-[var(--text-tertiary)]">
                    Co-spending origin
                  </span>
                </div>

                {/* Arrow down */}
                <div className="flex justify-center text-[var(--accent-primary)]">
                  <ArrowDown size={16} />
                </div>

                {/* Center Transaction Node */}
                <div className="p-3 bg-[var(--accent-primary-subtle)] border border-[var(--accent-primary-border)] rounded-[var(--radius-sm)] text-center space-y-1">
                  <div className="text-[10px] uppercase tracking-wider text-[var(--accent-primary-light)] font-bold">
                    SELECTED TRANSACTION NODE
                  </div>
                  <div className="text-xs font-bold text-[var(--text-primary)]">
                    {selectedTx.txid.length > 24 ? `${selectedTx.txid.slice(0, 16)}...${selectedTx.txid.slice(-8)}` : selectedTx.txid}
                  </div>
                  <div className="text-[11px] text-[var(--accent-primary-light)]">
                    Transacted Value: {selectedTx.value_btc.toFixed(4)} BTC
                  </div>
                </div>

                {/* Arrow down */}
                <div className="flex justify-center text-[var(--accent-primary)]">
                  <ArrowDown size={16} />
                </div>

                {/* Outputs Node */}
                <div className="flex items-center justify-between p-2.5 bg-[var(--surface-2)] border border-[var(--border-subtle)] rounded-[var(--radius-sm)]">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-[var(--accent-primary-light)]" />
                    <span className="text-xs font-semibold text-[var(--text-primary)]">
                      {selectedTx.outputs_count} Output Vector{selectedTx.outputs_count !== 1 ? 's' : ''}
                    </span>
                  </div>
                  <span className="text-[11px] text-[var(--text-tertiary)]">
                    {selectedTx.outputs_count > 5 ? 'Fan-out distribution' : 'Direct transfer / Change output'}
                  </span>
                </div>
              </div>
            </div>

            {/* ── 7. Network Telemetry Observations ── */}
            <div className="p-4 bg-[var(--surface-2)] border border-[var(--border-default)] rounded-[var(--radius-md)] space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">
                  <Network size={13} className="text-[var(--accent-primary)]" />
                  <span>NETWORK TELEMETRY OBSERVATION</span>
                </div>
                <span className="text-[9px] uppercase px-1.5 py-0.5 rounded-xs bg-[var(--surface-3)] text-[var(--text-tertiary)]">
                  Observed Broadcast
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="p-3 bg-[var(--surface-1)] border border-[var(--border-subtle)] rounded-[var(--radius-sm)] space-y-1">
                  <span className="text-[10px] uppercase text-[var(--text-tertiary)] block">OBSERVED BROADCAST IP</span>
                  <span className="text-xs font-bold text-[var(--text-primary)] block">
                    {selectedTx.observed_ip || 'No broadcast IP logged'}
                  </span>
                  <span className="text-[10px] text-[var(--text-tertiary)] block">
                    Initial propagation peer observation
                  </span>
                </div>

                <div className="p-3 bg-[var(--surface-1)] border border-[var(--border-subtle)] rounded-[var(--radius-sm)] space-y-1">
                  <span className="text-[10px] uppercase text-[var(--text-tertiary)] block">AUTONOMOUS SYSTEM (ASN)</span>
                  <span className="text-xs font-bold text-[var(--accent-primary-light)] block">
                    {selectedTx.observed_asn || 'Unmapped ASN'}
                  </span>
                  <span className="text-[10px] text-[var(--text-tertiary)] block">
                    BGP Autonomous System Routing
                  </span>
                </div>
              </div>

              <div className="p-2.5 bg-[var(--surface-1)] border border-[var(--border-subtle)] rounded-[var(--radius-sm)] text-[10px] text-[var(--text-secondary)] leading-relaxed flex items-start gap-2">
                <Info size={14} className="text-[var(--accent-primary)] shrink-0 mt-0.5" />
                <span>
                  Network telemetry reflects peer broadcast observation at canonical ingestion time. It does not establish direct identity or geolocation of the initiating wallet.
                </span>
              </div>
            </div>

            {/* ── 8. Triggered Detectors & Evidence Preview ── */}
            <div className="p-4 bg-[var(--surface-2)] border border-[var(--border-default)] rounded-[var(--radius-md)] space-y-3">
              <div className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">
                TRIGGERED ANOMALY DETECTORS {selectedTx.triggered_detectors ? `(${selectedTx.triggered_detectors.length})` : ''}
              </div>

              {selectedTx.triggered_detectors === null || selectedTx.triggered_detectors === undefined ? (
                <div className="p-3 bg-[var(--surface-1)] border border-[var(--border-subtle)] rounded-[var(--radius-sm)] text-center text-xs text-[var(--text-tertiary)]">
                  Unavailable
                </div>
              ) : selectedTx.triggered_detectors.length === 0 ? (
                <div className="p-3 bg-[var(--surface-1)] border border-[var(--border-subtle)] rounded-[var(--radius-sm)] text-center text-xs text-[var(--text-tertiary)]">
                  No anomalies
                </div>
              ) : (
                <div className="space-y-2">
                  {selectedTx.triggered_detectors.map((detector, idx) => {
                    const evDesc = getDetectorEvidenceDescription(detector, selectedTxDetail);
                    return (
                      <div
                        key={idx}
                        className="p-3 bg-[var(--surface-1)] border border-[var(--border-subtle)] rounded-[var(--radius-sm)] space-y-1.5"
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold uppercase text-[var(--accent-primary-light)]">
                            {detector.replace(/_/g, ' ')}
                          </span>
                          <span className="text-[9px] uppercase px-1.5 py-0.5 rounded-xs bg-[var(--surface-3)] text-[var(--text-secondary)]">
                            Observed Signal
                          </span>
                        </div>
                        <p className="text-[11px] text-[var(--text-secondary)] leading-relaxed">
                          {evDesc}
                        </p>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* ── 9. Forensic Action CTAs ── */}
            <div className="pt-3 border-t border-[var(--border-subtle)] flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Link
                  href={
                    selectedTxDetail?.alert &&
                    typeof (selectedTxDetail.alert as Record<string, unknown>).alert_id === 'string'
                      ? `/alerts?alert_id=${encodeURIComponent(
                          String((selectedTxDetail.alert as Record<string, unknown>).alert_id)
                        )}`
                      : `/alerts?txid=${encodeURIComponent(selectedTx.txid)}`
                  }
                >
                  <Button variant="primary" size="sm">
                    <ShieldAlert size={13} />
                    <span>VIEW ALERT</span>
                  </Button>
                </Link>
                <Link href="/entities">
                  <Button variant="secondary" size="sm">
                    <Boxes size={13} />
                    <span>VIEW CANDIDATE ENTITY</span>
                  </Button>
                </Link>
                <Link href={`/graph?txid=${encodeURIComponent(selectedTx.txid)}`}>
                  <Button variant="secondary" size="sm">
                    <ExternalLink size={13} />
                    <span>VIEW IN GRAPH</span>
                  </Button>
                </Link>
              </div>

              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setSelectedTx(null);
                  setSelectedTxDetail(null);
                  if (typeof window !== 'undefined') {
                    const url = new URL(window.location.href);
                    url.searchParams.delete('txid');
                    window.history.pushState(null, '', url.toString());
                  }
                }}
              >
                <span>CLOSE DOSSIER</span>
              </Button>
            </div>
          </div>
        )}
      </Drawer>
    </PageContainer>
  );
}

export default function TransactionsPage() {
  return (
    <Suspense fallback={<LoadingState message="Loading transaction forensic records..." />}>
      <TransactionsContent />
    </Suspense>
  );
}
