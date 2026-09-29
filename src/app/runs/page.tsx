'use client';

import React, { useState, useMemo } from 'react';
import Link from 'next/link';
import {
  History,
  Download,
  Filter,
  Search,
  ExternalLink,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Database,
  Shield,
  Layers,
  Activity,
  X,
  ArrowRight,
  RefreshCw,
  Cpu,
  FileCode,
  Calendar,
  Sparkles,
  ChevronRight,
  SlidersHorizontal,
  ChevronDown
} from 'lucide-react';
import { PageContainer } from '@/components/PageContainer';
import {
  StatusBadge,
  SearchInput,
  Button,
  Badge,
} from '@/components/ui';
import { mockRuns } from '@/data/mock';
import { AnalysisRun } from '@/types';

// Helper to format duration between ISO timestamps
function calculateDuration(startStr: string, endStr?: string): string {
  if (!endStr) return 'In Progress';
  const start = new Date(startStr).getTime();
  const end = new Date(endStr).getTime();
  if (isNaN(start) || isNaN(end)) return '—';
  const diffMs = Math.max(0, end - start);
  const diffSecs = Math.floor(diffMs / 1000);
  const hours = Math.floor(diffSecs / 3600);
  const mins = Math.floor((diffSecs % 3600) / 60);
  const secs = diffSecs % 60;

  if (hours > 0) return `${hours}h ${mins}m`;
  if (mins > 0) return `${mins}m ${secs}s`;
  return `${secs}s`;
}

// 8 Pipeline Stages corresponding to /analyze pipeline architecture
const PIPELINE_STAGES = [
  { id: 'ingest', name: 'Ingest & Parse', desc: 'Raw ledger/mempool ingestion' },
  { id: 'canonicalize', name: 'Canonicalize', desc: 'Format standardisation & deduplication' },
  { id: 'features', name: 'Feature Extraction', desc: '32-dim multidimensional extraction' },
  { id: 'detectors', name: 'Detection Engine', desc: '14 structural, temporal & network detectors' },
  { id: 'correlation', name: 'Cross-Correlation', desc: 'Candidate entity association' },
  { id: 'scoring', name: 'Score Fusion', desc: 'Multivariate anomaly score evaluation' },
  { id: 'graph', name: 'Graph Construction', desc: 'Directed bipartite transaction graph' },
  { id: 'leads', name: 'Lead Generation', desc: 'Ranked prioritized investigative dossiers' },
];

export default function RunsPage() {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'completed' | 'processing' | 'failed'>('ALL');
  const [selectedRun, setSelectedRun] = useState<AnalysisRun | null>(null);

  const filteredRuns = useMemo(() => {
    return mockRuns.filter((run) => {
      // Status filter
      if (statusFilter !== 'ALL' && run.status !== statusFilter) {
        return false;
      }
      // Search filter
      if (search.trim()) {
        const q = search.toLowerCase();
        return (
          run.run_id.toLowerCase().includes(q) ||
          run.dataset_name.toLowerCase().includes(q) ||
          run.scoring_version.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [search, statusFilter]);

  const totalTransactions = useMemo(() => {
    return mockRuns.reduce((acc, r) => acc + (r.transaction_count || 0), 0);
  }, []);

  const totalLeads = useMemo(() => {
    return mockRuns.reduce((acc, r) => acc + (r.alert_count || 0), 0);
  }, []);

  return (
    <PageContainer
      title="RUN HISTORY"
      description="Offline analysis runs and execution history."
      tag="AUDIT TRAIL"
      icon={<History size={18} />}
      actions={
        <div className="flex items-center gap-2">
          <Link href="/analyze">
            <Button variant="primary" size="sm" className="gap-1.5">
              <Sparkles size={13} />
              <span>Launch New Analysis</span>
            </Button>
          </Link>
          <Button variant="secondary" size="sm" className="gap-1.5" onClick={() => {}}>
            <Download size={13} />
            <span>Export Audit Log</span>
          </Button>
        </div>
      }
    >
      <div className="space-y-6">
        {/* Telemetry Summary Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="p-4 rounded-[var(--radius-md)] bg-[var(--surface-1)] border border-[var(--border-default)]">
            <div className="flex items-center justify-between text-xs font-mono text-[var(--text-tertiary)] uppercase tracking-wider mb-2">
              <span>Total Executions</span>
              <History size={14} className="text-[var(--accent-primary)]" />
            </div>
            <div className="text-2xl font-bold font-mono text-[var(--text-primary)]">
              {mockRuns.length}
            </div>
            <div className="text-[11px] font-mono text-[var(--text-secondary)] mt-1">
              Offline batches processed
            </div>
          </div>

          <div className="p-4 rounded-[var(--radius-md)] bg-[var(--surface-1)] border border-[var(--border-default)]">
            <div className="flex items-center justify-between text-xs font-mono text-[var(--text-tertiary)] uppercase tracking-wider mb-2">
              <span>Total Transactions</span>
              <Database size={14} className="text-[var(--accent-primary)]" />
            </div>
            <div className="text-2xl font-bold font-mono text-[var(--text-primary)]">
              {totalTransactions.toLocaleString()}
            </div>
            <div className="text-[11px] font-mono text-[var(--text-secondary)] mt-1">
              Ledger rows evaluated
            </div>
          </div>

          <div className="p-4 rounded-[var(--radius-md)] bg-[var(--surface-1)] border border-[var(--border-default)]">
            <div className="flex items-center justify-between text-xs font-mono text-[var(--text-tertiary)] uppercase tracking-wider mb-2">
              <span>Leads Generated</span>
              <AlertTriangle size={14} className="text-[#C8A96B]" />
            </div>
            <div className="text-2xl font-bold font-mono text-[#E4C992]">
              {totalLeads.toLocaleString()}
            </div>
            <div className="text-[11px] font-mono text-[var(--text-secondary)] mt-1">
              Investigative dossiers
            </div>
          </div>

          <div className="p-4 rounded-[var(--radius-md)] bg-[var(--surface-1)] border border-[var(--border-default)]">
            <div className="flex items-center justify-between text-xs font-mono text-[var(--text-tertiary)] uppercase tracking-wider mb-2">
              <span>Pipeline Engine</span>
              <Shield size={14} className="text-emerald-500" />
            </div>
            <div className="text-lg font-bold font-mono text-[var(--text-primary)] truncate">
              Airgapped Local
            </div>
            <div className="text-[11px] font-mono text-[var(--text-secondary)] mt-1">
              Zero telemetry egress
            </div>
          </div>
        </div>

        {/* Filter & Search Bar */}
        <div className="p-3 bg-[var(--surface-1)] border border-[var(--border-default)] rounded-[var(--radius-md)] flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex-1 w-full md:max-w-md">
            <SearchInput
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search run ID, dataset name, version..."
            />
          </div>

          {/* Status Filter Tabs */}
          <div className="flex items-center gap-1.5 w-full md:w-auto overflow-x-auto pb-1 md:pb-0">
            {(['ALL', 'completed', 'processing', 'failed'] as const).map((st) => (
              <button
                key={st}
                onClick={() => setStatusFilter(st)}
                className={`px-3 py-1.5 rounded text-xs font-mono transition-colors whitespace-nowrap ${
                  statusFilter === st
                    ? 'bg-[var(--accent-primary)] text-black font-semibold'
                    : 'bg-[var(--surface-2)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-3)]'
                }`}
              >
                {st === 'ALL' ? 'ALL STATUSES' : st.toUpperCase()}
              </button>
            ))}
          </div>

          <div className="text-xs font-mono text-[var(--text-tertiary)] shrink-0 hidden lg:block">
            {filteredRuns.length} OF {mockRuns.length} RUNS
          </div>
        </div>

        {/* Audit Log Table */}
        {filteredRuns.length === 0 ? (
          <div className="p-12 text-center rounded-[var(--radius-md)] bg-[var(--surface-1)] border border-[var(--border-default)]">
            <History className="w-12 h-12 text-[var(--text-tertiary)] mx-auto mb-3 opacity-40" />
            <h3 className="text-base font-bold font-mono text-[var(--text-primary)] mb-1">
              NO ANALYSIS RUNS
            </h3>
            <p className="text-xs font-mono text-[var(--text-secondary)] max-w-sm mx-auto mb-5">
              {search || statusFilter !== 'ALL'
                ? 'No analysis runs match the specified filter query.'
                : 'Run an offline analysis to create execution history.'}
            </p>
            {search || statusFilter !== 'ALL' ? (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  setSearch('');
                  setStatusFilter('ALL');
                }}
              >
                Clear Filters
              </Button>
            ) : (
              <Link href="/analyze">
                <Button variant="primary" size="sm" className="gap-1.5">
                  <Sparkles size={13} />
                  <span>GO TO ANALYZE</span>
                </Button>
              </Link>
            )}
          </div>
        ) : (
          <div className="rounded-[var(--radius-md)] bg-[var(--surface-1)] border border-[var(--border-default)] overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-[var(--border-default)] bg-[var(--surface-2)]/60 text-[10px] font-mono text-[var(--text-tertiary)] uppercase tracking-wider">
                    <th className="py-3 px-4">RUN ID</th>
                    <th className="py-3 px-4">DATASET</th>
                    <th className="py-3 px-4 text-right">ROWS</th>
                    <th className="py-3 px-4 text-right">LEADS</th>
                    <th className="py-3 px-4">STATUS</th>
                    <th className="py-3 px-4">STARTED</th>
                    <th className="py-3 px-4">DURATION</th>
                    <th className="py-3 px-4">VERSION</th>
                    <th className="py-3 px-4 text-right">ACTION</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border-default)] font-mono text-xs">
                  {filteredRuns.map((run) => {
                    const duration = calculateDuration(run.started_at, run.completed_at);
                    const isSelected = selectedRun?.run_id === run.run_id;

                    return (
                      <tr
                        key={run.run_id}
                        onClick={() => setSelectedRun(run)}
                        className={`cursor-pointer transition-colors ${
                          isSelected
                            ? 'bg-[var(--accent-primary)]/10 border-l-2 border-l-[var(--accent-primary)]'
                            : 'hover:bg-[var(--surface-2)]/50'
                        }`}
                      >
                        <td className="py-3 px-4 font-semibold text-[var(--accent-primary-light)]">
                          {run.run_id}
                        </td>
                        <td className="py-3 px-4 text-[var(--text-primary)] max-w-[200px] truncate" title={run.dataset_name}>
                          {run.dataset_name}
                        </td>
                        <td className="py-3 px-4 text-right text-[var(--text-secondary)]">
                          {run.transaction_count > 0 ? run.transaction_count.toLocaleString() : '—'}
                        </td>
                        <td className="py-3 px-4 text-right font-bold text-[#E4C992]">
                          {run.alert_count}
                        </td>
                        <td className="py-3 px-4">
                          <StatusBadge status={run.status} />
                        </td>
                        <td className="py-3 px-4 text-[11px] text-[var(--text-tertiary)] whitespace-nowrap">
                          {run.started_at.replace('T', ' ').replace('Z', '')}
                        </td>
                        <td className="py-3 px-4 text-[11px] text-[var(--text-secondary)] whitespace-nowrap">
                          {duration}
                        </td>
                        <td className="py-3 px-4 text-[11px] text-[var(--text-tertiary)]">
                          {run.scoring_version}
                        </td>
                        <td className="py-3 px-4 text-right">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedRun(run);
                            }}
                            className="h-7 px-2 text-xs font-mono gap-1 text-[var(--accent-primary-light)]"
                          >
                            <span>Inspect</span>
                            <ChevronRight size={12} />
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Run Audit Dossier Drawer (Slide-over) */}
      {selectedRun && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div
            className="w-full max-w-2xl bg-[var(--surface-1)] border-l border-[var(--border-default)] h-full overflow-y-auto flex flex-col shadow-2xl animate-in slide-in-from-right duration-300"
            role="dialog"
            aria-modal="true"
          >
            {/* Drawer Header */}
            <div className="p-5 border-b border-[var(--border-default)] bg-[var(--surface-2)]/80 flex items-center justify-between sticky top-0 z-10">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded bg-[var(--surface-3)] text-[var(--accent-primary)] border border-[var(--border-default)]">
                  <History size={18} />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-base font-bold font-mono text-[var(--text-primary)]">
                      {selectedRun.run_id}
                    </h2>
                    <StatusBadge status={selectedRun.status} />
                  </div>
                  <p className="text-xs font-mono text-[var(--text-tertiary)] mt-0.5">
                    Pipeline Execution Dossier
                  </p>
                </div>
              </div>
              <button
                onClick={() => setSelectedRun(null)}
                className="p-1.5 rounded hover:bg-[var(--surface-3)] text-[var(--text-tertiary)] hover:text-[var(--text-primary)] transition-colors"
                aria-label="Close drawer"
              >
                <X size={18} />
              </button>
            </div>

            {/* Drawer Body */}
            <div className="p-6 space-y-6 flex-1">
              {/* Essential Execution Metadata Grid */}
              <div className="grid grid-cols-2 gap-3 p-4 rounded-[var(--radius-md)] bg-[var(--surface-2)]/40 border border-[var(--border-default)]">
                <div>
                  <div className="text-[10px] font-mono text-[var(--text-tertiary)] uppercase tracking-wider">
                    Dataset
                  </div>
                  <div className="text-xs font-mono font-semibold text-[var(--text-primary)] mt-1 truncate" title={selectedRun.dataset_name}>
                    {selectedRun.dataset_name}
                  </div>
                </div>

                <div>
                  <div className="text-[10px] font-mono text-[var(--text-tertiary)] uppercase tracking-wider">
                    Engine Version
                  </div>
                  <div className="text-xs font-mono text-[var(--text-primary)] mt-1">
                    {selectedRun.scoring_version}
                  </div>
                </div>

                <div>
                  <div className="text-[10px] font-mono text-[var(--text-tertiary)] uppercase tracking-wider">
                    Start Timestamp
                  </div>
                  <div className="text-xs font-mono text-[var(--text-secondary)] mt-1">
                    {selectedRun.started_at.replace('T', ' ').replace('Z', ' UTC')}
                  </div>
                </div>

                <div>
                  <div className="text-[10px] font-mono text-[var(--text-tertiary)] uppercase tracking-wider">
                    Completion Timestamp
                  </div>
                  <div className="text-xs font-mono text-[var(--text-secondary)] mt-1">
                    {selectedRun.completed_at
                      ? selectedRun.completed_at.replace('T', ' ').replace('Z', ' UTC')
                      : 'Execution Ongoing'}
                  </div>
                </div>

                <div>
                  <div className="text-[10px] font-mono text-[var(--text-tertiary)] uppercase tracking-wider">
                    Rows Processed
                  </div>
                  <div className="text-sm font-mono font-bold text-[var(--text-primary)] mt-0.5">
                    {selectedRun.transaction_count > 0
                      ? selectedRun.transaction_count.toLocaleString()
                      : '0 (Aborted prior to ingestion)'}
                  </div>
                </div>

                <div>
                  <div className="text-[10px] font-mono text-[var(--text-tertiary)] uppercase tracking-wider">
                    Leads Identified
                  </div>
                  <div className="text-sm font-mono font-bold text-[#E4C992] mt-0.5">
                    {selectedRun.alert_count} Leads
                  </div>
                </div>
              </div>

              {/* Execution Pipeline Stages Breakdown */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-xs font-bold font-mono text-[var(--text-primary)] uppercase tracking-wider flex items-center gap-2">
                    <Layers size={14} className="text-[var(--accent-primary)]" />
                    <span>Pipeline Stage Execution History</span>
                  </h3>
                  <span className="text-[10px] font-mono text-[var(--text-tertiary)]">
                    {selectedRun.status === 'completed'
                      ? '8 / 8 Stages Passed'
                      : selectedRun.status === 'failed'
                      ? 'Stage 1 Error'
                      : 'Executing'}
                  </span>
                </div>

                <div className="space-y-2">
                  {PIPELINE_STAGES.map((stage, idx) => {
                    const isSuccess = selectedRun.status === 'completed';
                    const isFailed = selectedRun.status === 'failed' && idx === 0;
                    const isSkipped = selectedRun.status === 'failed' && idx > 0;

                    return (
                      <div
                        key={stage.id}
                        className={`p-2.5 rounded border text-xs font-mono flex items-center justify-between ${
                          isSuccess
                            ? 'bg-[var(--surface-2)]/40 border-[var(--border-default)] text-[var(--text-secondary)]'
                            : isFailed
                            ? 'bg-rose-950/20 border-rose-900/50 text-rose-300'
                            : 'bg-[var(--surface-1)] border-[var(--border-default)]/40 text-[var(--text-tertiary)] opacity-60'
                        }`}
                      >
                        <div className="flex items-center gap-2.5">
                          <span className="text-[10px] text-[var(--text-tertiary)] font-bold w-4">
                            0{idx + 1}
                          </span>
                          {isSuccess && <CheckCircle2 size={13} className="text-emerald-500 shrink-0" />}
                          {isFailed && <AlertTriangle size={13} className="text-rose-400 shrink-0" />}
                          {isSkipped && <div className="w-3.5 h-3.5 rounded-full border border-[var(--border-default)] shrink-0" />}
                          <div>
                            <span className="font-semibold text-[var(--text-primary)]">
                              {stage.name}
                            </span>
                            <span className="text-[11px] text-[var(--text-tertiary)] ml-2 hidden sm:inline">
                              — {stage.desc}
                            </span>
                          </div>
                        </div>

                        <span className="text-[10px] font-mono uppercase shrink-0">
                          {isSuccess && <span className="text-emerald-400">PASSED</span>}
                          {isFailed && <span className="text-rose-400">FAILED</span>}
                          {isSkipped && <span className="text-[var(--text-tertiary)]">SKIPPED</span>}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Technical System Audit Notice */}
              <div className="p-3.5 rounded-[var(--radius-md)] bg-[var(--surface-2)]/30 border border-[var(--border-default)] text-[11px] font-mono text-[var(--text-tertiary)] leading-relaxed">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-[var(--text-secondary)] mb-1">
                  <Shield size={13} className="text-[var(--accent-primary)]" />
                  <span>Deterministic Audit Record</span>
                </div>
                This offline execution ran deterministically under seed 42 with zero network egress.
                All intermediate feature vectors and anomaly scoring matrices are preserved locally.
              </div>
            </div>

            {/* Drawer Footer / Navigation Routing */}
            <div className="p-4 border-t border-[var(--border-default)] bg-[var(--surface-2)]/80 flex flex-wrap items-center justify-between gap-2 sticky bottom-0">
              <div className="text-[11px] font-mono text-[var(--text-tertiary)]">
                Navigation Targets
              </div>

              <div className="flex items-center gap-2">
                <Link href="/alerts">
                  <Button variant="secondary" size="sm" className="gap-1 text-xs font-mono">
                    <span>VIEW ALERTS</span>
                    <ArrowRight size={12} />
                  </Button>
                </Link>
                <Link href="/analytics">
                  <Button variant="secondary" size="sm" className="gap-1 text-xs font-mono">
                    <span>VIEW ANALYTICS</span>
                    <ArrowRight size={12} />
                  </Button>
                </Link>
                <Link href="/transactions">
                  <Button variant="primary" size="sm" className="gap-1 text-xs font-mono">
                    <span>TRANSACTIONS</span>
                    <ArrowRight size={12} />
                  </Button>
                </Link>
              </div>
            </div>
          </div>
        </div>
      )}
    </PageContainer>
  );
}
