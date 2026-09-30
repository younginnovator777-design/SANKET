'use client';

import React, { useState, useMemo, Suspense, useEffect } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import {
  ArrowLeftRight,
  Search,
  Filter,
  Download,
  ExternalLink,
  ChevronRight,
  Copy,
  Check,
  ShieldAlert,
  Radio,
  Globe,
  Network,
  Cpu,
  Clock,
  Boxes,
  ArrowRight,
  ArrowDown,
  Info,
  Hash,
} from 'lucide-react';
import { PageContainer } from '@/components/PageContainer';
import {
  DataTable,
  Column,
  RiskBadge,
  SearchInput,
  FilterButton,
  Button,
  Badge,
  Drawer,
  EmptyState,
  LoadingState,
  Tooltip,
} from '@/components/ui';
import { getAlerts, getTransaction, ApiAlert, ApiTransactionDetail } from '@/lib/api';
import type { TransactionRecord, RiskLevel } from '@/types';

// Build a lightweight TransactionRecord from alert data for the list view.
function alertToTx(a: ApiAlert): TransactionRecord {
  return {
    txid: a.transaction_id,
    timestamp: new Date().toISOString(), // placeholder until detail loaded
    block_height: 0,
    value_btc: 0,
    fee_btc: 0,
    inputs_count: 0,
    outputs_count: 0,
    risk_score: a.risk_score,
    risk_level: a.risk_level,
    confidence: a.confidence_score,
    triggered_detectors: a.triggered_detectors,
    status: a.risk_level === 'LOW' ? 'confirmed' : 'flagged',
  };
}

type RiskFilterOption = 'ALL' | 'CRITICAL' | 'HIGH+' | 'MEDIUM+' | 'LOW';

function TransactionsContent() {
  const searchParams = useSearchParams();
  const initialQuery = searchParams.get('search') || searchParams.get('txid') || '';

  const [searchQuery, setSearchQuery] = useState(initialQuery);
  const [selectedRiskFilter, setSelectedRiskFilter] = useState<RiskFilterOption>('ALL');
  const [selectedDetector, setSelectedDetector] = useState<string>('ALL');
  const [selectedAsn, setSelectedAsn] = useState<string>('ALL');
  const [selectedStatus, setSelectedStatus] = useState<string>('ALL');
  const [selectedTx, setSelectedTx] = useState<TransactionRecord | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [copiedTx, setCopiedTx] = useState(false);

  // All transaction rows from alerts
  const [allTransactions, setAllTransactions] = useState<TransactionRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);

  useEffect(() => {
    getAlerts()
      .then((res) => {
        const txs = res.alerts.map(alertToTx);
        setAllTransactions(txs);
        // Auto-select if URL param matches
        if (initialQuery) {
          const match = txs.find((t) => t.txid.toLowerCase().includes(initialQuery.toLowerCase()));
          if (match) setSelectedTx(match);
        }
      })
      .catch((err) => setFetchError(String(err)))
      .finally(() => setLoading(false));
  }, [initialQuery]);

  const handleSelectTx = async (tx: TransactionRecord) => {
    setSelectedTx(tx);
    setDetailLoading(true);
    try {
      const detail: ApiTransactionDetail = await getTransaction(tx.txid);
      const ct = detail.canonical_transaction;
      if (ct) {
        setSelectedTx(prev => prev ? {
          ...prev,
          timestamp: ct.timestamp ?? prev.timestamp,
          value_btc: (ct.output_amounts ?? []).reduce((a, b) => a + b, 0),
          fee_btc: ct.fee ?? prev.fee_btc,
          inputs_count: (ct.input_addresses ?? []).length,
          outputs_count: (ct.output_addresses ?? []).length,
          observed_ip: ct.src_ip ?? undefined,
          observed_asn: ct.asn ?? undefined,
        } : null);
      }
    } catch { /* keep stub data */ }
    finally { setDetailLoading(false); }
  };

  const activeRun = { run_id: '—', dataset_name: '—', scoring_version: '—' };

  // Derive unique detectors & ASNs from real transactions
  const allDetectors = useMemo(() => {
    const set = new Set<string>();
    allTransactions.forEach((tx) => { tx.triggered_detectors.forEach((d) => set.add(d)); });
    return Array.from(set);
  }, [allTransactions]);

  const allAsns = useMemo(() => {
    const set = new Set<string>();
    allTransactions.forEach((tx) => { if (tx.observed_asn) set.add(tx.observed_asn); });
    return Array.from(set);
  }, [allTransactions]);

  // Filter transactions
  const filteredTransactions = useMemo(() => {
    return allTransactions.filter((tx) => {
      if (selectedRiskFilter === 'CRITICAL' && tx.risk_level !== 'CRITICAL') return false;
      if (selectedRiskFilter === 'HIGH+' && tx.risk_level !== 'CRITICAL' && tx.risk_level !== 'HIGH') return false;
      if (selectedRiskFilter === 'MEDIUM+' && tx.risk_level === 'LOW') return false;
      if (selectedRiskFilter === 'LOW' && tx.risk_level !== 'LOW') return false;
      if (selectedDetector !== 'ALL' && !tx.triggered_detectors.includes(selectedDetector)) return false;
      if (selectedAsn !== 'ALL' && tx.observed_asn !== selectedAsn) return false;
      if (selectedStatus !== 'ALL' && tx.status !== selectedStatus) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        return tx.txid.toLowerCase().includes(q) ||
          (tx.observed_ip?.toLowerCase().includes(q) || false) ||
          (tx.observed_asn?.toLowerCase().includes(q) || false) ||
          tx.triggered_detectors.some((d) => d.toLowerCase().includes(q));
      }
      return true;
    });
  }, [allTransactions, searchQuery, selectedRiskFilter, selectedDetector, selectedAsn, selectedStatus]);

  // Forensic summary metrics
  const totalTxs = allTransactions.length;
  const flaggedCount = allTransactions.filter((tx) => tx.status === 'flagged' || tx.status === 'anomalous').length;
  const totalVolumeBtc = allTransactions.reduce((acc, tx) => acc + tx.value_btc, 0);
  const avgConfidence = totalTxs > 0
    ? (allTransactions.reduce((acc, tx) => acc + tx.confidence, 0) / totalTxs) * 100
    : 0;

  if (loading) return <div className="p-8"><LoadingState message="Loading transactions from backend…" /></div>;
  if (fetchError) return <div className="p-8 text-xs font-mono text-[var(--risk-critical)]">Backend error: {fetchError}</div>;

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

  // Main Transaction Table Columns
  const columns: Column<TransactionRecord>[] = [
    {
      key: 'txid',
      header: 'TRANSACTION ID (TXID)',
      mono: true,
      render: (tx) => (
        <div className="flex items-center gap-2">
          <span className="font-mono text-xs font-semibold text-[var(--accent-primary-light)]">
            {tx.txid.slice(0, 14)}...{tx.txid.slice(-8)}
          </span>
          <span className="text-[10px] font-mono text-[var(--text-tertiary)]">
            #{tx.block_height}
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
          {tx.timestamp.replace('T', ' ').replace(':00Z', ' UTC')}
        </span>
      ),
    },
    {
      key: 'risk_level',
      header: 'RISK',
      width: '120px',
      render: (tx) => (
        <div className="flex items-center gap-1.5">
          <RiskBadge level={tx.risk_level} size="sm" />
          <span className="font-mono text-[11px] font-semibold text-[var(--text-primary)]">
            {tx.risk_score.toFixed(2)}
          </span>
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
          {(tx.confidence * 100).toFixed(0)}%
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
          {tx.triggered_detectors.length === 0 ? (
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
          <Button variant="secondary" size="sm">
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
              <span className="font-semibold text-[var(--accent-primary-light)]">{activeRun.run_id}</span>
            </div>
            <span className="text-[var(--border-strong)]">|</span>
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] uppercase text-[var(--text-tertiary)]">TARGET DATASET:</span>
              <span className="text-[var(--text-primary)] font-medium">{activeRun.dataset_name}</span>
            </div>
            <span className="text-[var(--border-strong)]">|</span>
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] uppercase text-[var(--text-tertiary)]">ENGINE:</span>
              <span className="text-[var(--text-secondary)]">{activeRun.scoring_version}</span>
            </div>
          </div>

          <div className="flex items-center gap-2 text-[11px] text-[var(--text-secondary)]">
            <span className="w-1.5 h-1.5 rounded-full bg-[var(--risk-low)]" />
            <span className="uppercase tracking-wider">AIRGAPPED / OFFLINE</span>
          </div>
        </div>

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
            <div className="text-lg font-bold text-[var(--accent-primary-light)] mt-1">{totalVolumeBtc.toFixed(2)} BTC</div>
          </div>
          <div className="p-3 bg-[var(--surface-1)] border border-[var(--border-default)] rounded-[var(--radius-sm)] flex flex-col justify-between">
            <span className="text-[10px] uppercase text-[var(--text-tertiary)]">AVG CONFIDENCE</span>
            <div className="text-lg font-bold text-[var(--text-primary)] mt-1">{avgConfidence.toFixed(1)}%</div>
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

            {/* Active count */}
            <div className="text-[11px] font-mono text-[var(--text-tertiary)] pl-2 border-l border-[var(--border-subtle)]">
              {filteredTransactions.length} OF {allTransactions.length} TXS
            </div>
          </div>
        </div>

        {/* ── 4. Main Transaction Investigation Table ── */}
        {filteredTransactions.length === 0 ? (
          <EmptyState
            icon={<Search size={22} />}
            title="NO MATCHING TRANSACTIONS"
            description="No transactions match the selected filter criteria or search query."
            action={
              <Button variant="secondary" size="sm" onClick={clearFilters}>
                <span>CLEAR FILTERS</span>
              </Button>
            }
          />
        ) : (
          <div className="relative">
            <DataTable
              columns={columns}
              data={filteredTransactions}
              keyExtractor={(tx) => tx.txid}
              onRowClick={(tx) => setSelectedTx(tx)}
              emptyMessage="No transaction records available in current analysis run."
            />
          </div>
        )}
      </div>

      {/* ── 5. Forensic Transaction Investigation Drawer ── */}
      <Drawer
        isOpen={selectedTx !== null}
        onClose={() => setSelectedTx(null)}
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
                <RiskBadge level={selectedTx.risk_level} size="sm" />
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
                  <span className="text-[var(--text-primary)] font-semibold">#{selectedTx.block_height}</span>
                </div>
                <div>
                  <span className="text-[var(--text-tertiary)]">TIMESTAMP:</span>{' '}
                  <span className="text-[var(--text-primary)]">
                    {selectedTx.timestamp.replace('T', ' ').replace(':00Z', ' UTC')}
                  </span>
                </div>
                <div>
                  <span className="text-[var(--text-tertiary)]">STATUS:</span>{' '}
                  <span className="uppercase text-[var(--accent-primary-light)] font-semibold">
                    {selectedTx.status}
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
                  {selectedTx.fee_btc.toFixed(5)} BTC
                </span>
              </div>
              <div className="p-3 bg-[var(--surface-2)] border border-[var(--border-subtle)] rounded-[var(--radius-sm)]">
                <span className="text-[10px] uppercase text-[var(--text-tertiary)] block">RISK SCORE</span>
                <span className="text-sm font-bold text-[var(--risk-critical)] mt-1 block">
                  {selectedTx.risk_score.toFixed(2)}
                </span>
              </div>
              <div className="p-3 bg-[var(--surface-2)] border border-[var(--border-subtle)] rounded-[var(--radius-sm)]">
                <span className="text-[10px] uppercase text-[var(--text-tertiary)] block">CONFIDENCE</span>
                <span className="text-sm font-bold text-[var(--accent-primary-light)] mt-1 block">
                  {(selectedTx.confidence * 100).toFixed(0)}%
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
                      {selectedTx.inputs_count} Input Vector{selectedTx.inputs_count > 1 ? 's' : ''}
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
                    {selectedTx.txid.slice(0, 16)}...{selectedTx.txid.slice(-8)}
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
                      {selectedTx.outputs_count} Output Vector{selectedTx.outputs_count > 1 ? 's' : ''}
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
                TRIGGERED ANOMALY DETECTORS ({selectedTx.triggered_detectors.length})
              </div>

              {selectedTx.triggered_detectors.length === 0 ? (
                <div className="p-3 bg-[var(--surface-1)] border border-[var(--border-subtle)] rounded-[var(--radius-sm)] text-center text-xs text-[var(--text-tertiary)]">
                  No heuristic anomaly detectors were triggered for this transaction.
                </div>
              ) : (
                <div className="space-y-2">
                  {selectedTx.triggered_detectors.map((detector, idx) => (
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
                        {detector === 'temporal_burst' && 'Observed rapid succession of outputs within a 12-minute window exceeding cluster baseline.'}
                        {detector === 'fan_out_pattern' && 'Observed fan-out splitting across 23 unique output addresses.'}
                        {detector === 'value_layering' && 'Observed multi-hop value splitting matching structural layering profiles.'}
                        {detector === 'peel_chain' && 'Observed sequential peel-chain pattern across consecutive hops.'}
                        {detector === 'round_amount' && 'Observed structured round-number transaction value.'}
                        {detector === 'unusual_timing' && 'Observed transaction timestamp deviation from historical address baseline.'}
                        {detector === 'minor_anomaly' && 'Observed slight output count deviation compared to cluster baseline.'}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* ── 9. Forensic Action CTAs ── */}
            <div className="pt-3 border-t border-[var(--border-subtle)] flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Link href="/alerts">
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
                <Link href="/graph">
                  <Button variant="secondary" size="sm">
                    <ExternalLink size={13} />
                    <span>VIEW IN GRAPH</span>
                  </Button>
                </Link>
              </div>

              <Button variant="ghost" size="sm" onClick={() => setSelectedTx(null)}>
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
