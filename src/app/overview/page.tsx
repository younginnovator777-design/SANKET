'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  ShieldAlert,
  ArrowRight,
  Activity,
  ChevronRight,
  ExternalLink,
  Cpu,
  Radio,
} from 'lucide-react';
import { PageContainer } from '@/components/PageContainer';
import {
  MetricCard,
  RiskBadge,
  Badge,
  Button,
  SectionHeader,
  Drawer,
  EmptyState,
  LoadingState,
} from '@/components/ui';
import { getLatestRun, getAlerts, ApiAlert, ApiLatestRun } from '@/lib/api';
import type { Alert, RiskLevel } from '@/types';

// Map ApiAlert → Alert (frontend type)
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

const DETECTOR_FAMILIES = [
  {
    family: 'STRUCTURAL',
    detectors: [
      { name: 'Peel-Chain Flow Heuristic', code: 'peel_chain', source: 'graph_analyzer' },
      { name: 'Fan-Out Splitting Pattern', code: 'fan_out_pattern', source: 'graph_analyzer' },
    ],
  },
  {
    family: 'TEMPORAL',
    detectors: [
      { name: 'Temporal Velocity Burst', code: 'temporal_burst', source: 'temporal_analyzer' },
      { name: 'Historical Timing Deviation', code: 'unusual_timing', source: 'temporal_analyzer' },
    ],
  },
  {
    family: 'BEHAVIORAL & ML',
    detectors: [
      { name: 'Value Splitting / Layering', code: 'value_layering', source: 'behavioral_analyzer' },
      { name: 'Isolation Forest Feature Outlier', code: 'isolation_forest', source: 'isolation_forest' },
    ],
  },
  {
    family: 'NETWORK OBSERVATION',
    detectors: [
      { name: 'Broadcast Node Divergence', code: 'broadcast_divergence', source: 'network_collector' },
    ],
  },
];

export default function OverviewPage() {
  const [run, setRun] = useState<ApiLatestRun | null>(null);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedAlert, setSelectedAlert] = useState<Alert | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const [runData, alertsData] = await Promise.all([
          getLatestRun(),
          getAlerts(),
        ]);
        setRun(runData);
        setAlerts(alertsData.alerts.map(toAlert));
      } catch (err) {
        setError(String(err));
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  if (loading) {
    return (
      <PageContainer title="OVERVIEW" description="Offline transaction intelligence." tag="COMMAND CENTER">
        <LoadingState message="Loading latest analysis run…" />
      </PageContainer>
    );
  }

  if (error || !run) {
    return (
      <PageContainer title="OVERVIEW" description="Offline transaction intelligence and investigative lead generation." tag="COMMAND CENTER">
        <EmptyState
          title="NO DATASET LOADED"
          description={error ? `Backend error: ${error}` : "Upload a transaction dataset to begin offline anomaly detection and lead scoring."}
          action={
            <Link href="/analyze">
              <Button variant="accent" size="md">
                <span>Upload Dataset</span>
                <ArrowRight size={14} />
              </Button>
            </Link>
          }
        />
      </PageContainer>
    );
  }

  const totalTransactions = run.record_count;
  const totalAlerts = run.alert_count;
  const riskCounts = run.risk_level_counts;
  const highCriticalAlerts = (riskCounts.CRITICAL || 0) + (riskCounts.HIGH || 0);

  const riskPercentages = {
    CRITICAL: totalAlerts > 0 ? ((riskCounts.CRITICAL || 0) / totalAlerts) * 100 : 0,
    HIGH: totalAlerts > 0 ? ((riskCounts.HIGH || 0) / totalAlerts) * 100 : 0,
    MEDIUM: totalAlerts > 0 ? ((riskCounts.MEDIUM || 0) / totalAlerts) * 100 : 0,
    LOW: totalAlerts > 0 ? ((riskCounts.LOW || 0) / totalAlerts) * 100 : 0,
  };

  // Execution timing
  const totalTimingSec = Object.values(run.execution_timings).reduce((a, b) => a + b, 0);
  const durationStr = totalTimingSec > 0 ? `${totalTimingSec.toFixed(1)}s` : '—';

  const graphNodes = (run.graph_summary?.node_count as number) ?? 0;

  return (
    <PageContainer
      title="OVERVIEW"
      description="Offline transaction intelligence and investigative lead generation."
      tag="COMMAND CENTER"
      actions={
        <div className="flex items-center gap-2">
          <Link href="/analyze">
            <Button variant="secondary" size="sm"><span>Ingest Dataset</span></Button>
          </Link>
          <Link href="/alerts">
            <Button variant="accent" size="sm">
              <span>Investigate Leads ({totalAlerts})</span>
            </Button>
          </Link>
        </div>
      }
    >
      <div className="space-y-6">
        {/* ── 1. Header Strip ── */}
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 p-3 bg-[var(--surface-1)] border border-[var(--border-default)] rounded-[var(--radius-md)] text-xs font-mono">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] uppercase text-[var(--text-tertiary)]">LAST ANALYSIS:</span>
              <span className="font-semibold text-[var(--accent-primary-light)]">{run.run_id}</span>
            </div>
            <span className="text-[var(--border-strong)]">|</span>
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] uppercase text-[var(--text-tertiary)]">DATASET:</span>
              <span className="text-[var(--text-primary)] font-medium">
                {(run.dataset_metadata?.name as string) ?? run.run_id}
              </span>
            </div>
            <span className="text-[var(--border-strong)]">|</span>
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] uppercase text-[var(--text-tertiary)]">MODEL:</span>
              <span className="text-[var(--text-secondary)]">{run.pipeline_version}</span>
            </div>
          </div>
          <div className="flex items-center gap-2 text-[11px] text-[var(--text-secondary)]">
            <span className="w-1.5 h-1.5 rounded-full bg-[var(--risk-low)]" />
            <span className="uppercase tracking-wider">AIRGAPPED LOCAL EXECUTION</span>
          </div>
        </div>

        {/* ── 2. KPI Metrics ── */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3.5">
          <MetricCard label="TOTAL TRANSACTIONS" value={totalTransactions.toLocaleString()} sublabel="Full ingested range" accentIndicator />
          <MetricCard label="ANOMALOUS ACTIVITY" value={totalAlerts.toLocaleString()} sublabel="Generated alerts" />
          <MetricCard label="HIGH / CRITICAL LEADS" value={highCriticalAlerts} sublabel="Prioritized cases" change="Top Tier" changeType="positive" />
          <MetricCard label="GRAPH NODES" value={graphNodes} sublabel="Linked entities" />
          <MetricCard label="ANALYSIS DURATION" value={durationStr} sublabel="Deterministic runtime" />
        </div>

        {/* ── 3. Top Investigative Leads ── */}
        <div className="bg-[var(--surface-1)] border border-[var(--border-default)] rounded-[var(--radius-md)] p-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 mb-4 border-b border-[var(--border-subtle)]">
            <div>
              <div className="flex items-center gap-2">
                <span className="w-1.5 h-3 bg-[var(--accent-primary)] rounded-xs" />
                <h2 className="text-xs font-mono font-semibold uppercase tracking-[0.12em] text-[var(--text-primary)]">Top Priority Investigative Leads</h2>
              </div>
              <p className="text-[11px] text-[var(--text-tertiary)] mt-1">Authoritative ranking based on independent signal corroboration and risk confidence scores.</p>
            </div>
            <Link href="/alerts">
              <Button variant="ghost" size="sm"><span>View All Case Files</span><ChevronRight size={13} /></Button>
            </Link>
          </div>

          {alerts.length === 0 ? (
            <EmptyState title="NO ALERTS" description="Run an analysis to generate investigative leads." />
          ) : (
            <div className="space-y-3.5">
              {alerts.slice(0, 5).map((alert) => (
                <div key={alert.alert_id} onClick={() => setSelectedAlert(alert)} className="group bg-[var(--surface-2)] border border-[var(--border-default)] hover:border-[var(--accent-primary-border)] hover:bg-[var(--surface-3)] transition-all rounded-[var(--radius-sm)] p-4 cursor-pointer">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pb-2.5 border-b border-[var(--border-subtle)]">
                    <div className="flex items-center gap-3">
                      <span className="text-xs font-mono font-bold text-[var(--accent-primary-light)]">RANK #{alert.rank}</span>
                      <span className="text-xs font-mono text-[var(--text-tertiary)]">|</span>
                      <span className="text-xs font-mono font-medium text-[var(--text-primary)] truncate max-w-[200px] sm:max-w-[380px]">{alert.transaction_id}</span>
                    </div>
                    <RiskBadge level={alert.risk_level} />
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 py-2.5 font-mono text-xs border-b border-[var(--border-subtle)]">
                    <div><span className="text-[10px] uppercase text-[var(--text-tertiary)] block">Composite Risk</span><span className="text-sm font-bold text-[var(--text-primary)]">{alert.risk_score.toFixed(2)}</span></div>
                    <div><span className="text-[10px] uppercase text-[var(--text-tertiary)] block">Confidence</span><span className="text-sm font-bold text-[var(--text-primary)]">{(alert.confidence_score * 100).toFixed(0)}%</span></div>
                    <div><span className="text-[10px] uppercase text-[var(--text-tertiary)] block">Priority Score</span><span className="text-sm font-bold text-[var(--accent-primary-light)]">{alert.priority_score.toFixed(2)}</span></div>
                    <div><span className="text-[10px] uppercase text-[var(--text-tertiary)] block">Signals</span><span className="text-sm font-bold text-[var(--text-secondary)]">{alert.independent_signal_count} independent</span></div>
                  </div>
                  {alert.evidence_items.length > 0 && (
                    <div className="pt-2.5 space-y-1.5">
                      <div className="text-[10px] font-mono uppercase tracking-wider text-[var(--text-tertiary)]">WHY THIS MATTERS</div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                        {alert.evidence_items.slice(0, 2).map((ev, i) => (
                          <div key={i} className="p-2 rounded-[var(--radius-sm)] bg-[var(--surface-1)] border border-[var(--border-subtle)] text-[11px]">
                            <div className="flex items-center justify-between text-[10px] font-mono uppercase text-[var(--text-tertiary)] mb-0.5">
                              <span className="text-[var(--accent-primary-light)] font-semibold">{ev.category}</span>
                              <span>{(ev.confidence * 100).toFixed(0)}% CONF.</span>
                            </div>
                            <p className="text-[var(--text-secondary)] leading-relaxed truncate">{ev.description}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ── 4. Risk Distribution & Alert Activity ── */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-6 bg-[var(--surface-1)] border border-[var(--border-default)] rounded-[var(--radius-md)] p-5">
            <div className="flex items-center justify-between pb-3 mb-4 border-b border-[var(--border-subtle)]">
              <div>
                <h2 className="text-xs font-mono font-semibold uppercase tracking-[0.1em] text-[var(--text-primary)]">Risk Tier Distribution</h2>
                <p className="text-[11px] text-[var(--text-tertiary)] mt-0.5">Breakdown across {totalAlerts} investigative leads</p>
              </div>
              <Badge variant="default">4 TIERS</Badge>
            </div>
            <div className="space-y-4">
              {(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'] as RiskLevel[]).map((level) => {
                const colorMap: Record<RiskLevel, string> = { CRITICAL: 'var(--risk-critical)', HIGH: 'var(--risk-high)', MEDIUM: 'var(--risk-medium)', LOW: 'var(--risk-low)' };
                const count = riskCounts[level] || 0;
                const pct = riskPercentages[level];
                return (
                  <div key={level}>
                    <div className="flex items-center justify-between text-xs font-mono mb-1.5">
                      <div className="flex items-center gap-2"><span className="w-2 h-2 rounded-xs" style={{ background: `var(--risk-${level.toLowerCase()})` }} /><span className="text-[var(--text-primary)]">{level}</span></div>
                      <div className="text-[var(--text-secondary)]"><span style={{ color: colorMap[level] }} className="font-bold">{count}</span> ({pct.toFixed(1)}%)</div>
                    </div>
                    <div className="w-full h-2 bg-[var(--surface-3)] rounded-full overflow-hidden">
                      <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: colorMap[level] }} />
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="mt-5 pt-3.5 border-t border-[var(--border-subtle)] flex items-center justify-between text-[11px] font-mono text-[var(--text-tertiary)]">
              <span>TOTAL EVALUATED LEADS: {totalAlerts}</span>
              <span className="text-[var(--accent-primary-light)]">HIGH/CRITICAL: {totalAlerts > 0 ? ((highCriticalAlerts / totalAlerts) * 100).toFixed(0) : 0}%</span>
            </div>
          </div>

          <div className="lg:col-span-6 bg-[var(--surface-1)] border border-[var(--border-default)] rounded-[var(--radius-md)] p-5 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between pb-3 mb-4 border-b border-[var(--border-subtle)]">
                <div className="flex items-center gap-2">
                  <Activity size={14} className="text-[var(--accent-primary)]" />
                  <div>
                    <h2 className="text-xs font-mono font-semibold uppercase tracking-[0.1em] text-[var(--text-primary)]">Recent Alert Concentration</h2>
                    <p className="text-[11px] text-[var(--text-tertiary)] mt-0.5">Temporal distribution of detected anomalous leads</p>
                  </div>
                </div>
                <Badge variant="accent">CHRONOLOGICAL</Badge>
              </div>
              <div className="space-y-2 font-mono text-xs">
                {alerts.slice(0, 6).map((alert) => (
                  <div key={alert.alert_id} onClick={() => setSelectedAlert(alert)} className="flex items-center justify-between p-2.5 rounded-[var(--radius-sm)] bg-[var(--surface-2)] border border-[var(--border-subtle)] hover:border-[var(--accent-primary-border)] transition-colors cursor-pointer">
                    <div className="flex items-center gap-2.5">
                      <span className="text-[var(--text-primary)] font-medium">{alert.alert_id}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] text-[var(--text-secondary)] truncate max-w-[120px] hidden sm:inline">{alert.triggered_detectors[0]?.replace(/_/g, ' ')}</span>
                      <RiskBadge level={alert.risk_level} size="sm" />
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="mt-4 pt-3 border-t border-[var(--border-subtle)] text-[11px] font-mono text-[var(--text-tertiary)] flex items-center justify-between">
              <span>RUN: {run.run_id}</span>
              {(riskCounts.CRITICAL || 0) > 0 && <span className="text-[var(--risk-critical)]">CRITICAL ALERTS: {riskCounts.CRITICAL}</span>}
            </div>
          </div>
        </div>

        {/* ── 5. Detector Activity ── */}
        <div className="bg-[var(--surface-1)] border border-[var(--border-default)] rounded-[var(--radius-md)] p-5">
          <div className="flex items-center justify-between pb-3 mb-4 border-b border-[var(--border-subtle)]">
            <div className="flex items-center gap-2">
              <Cpu size={15} className="text-[var(--accent-primary)]" />
              <div>
                <h2 className="text-xs font-mono font-semibold uppercase tracking-[0.1em] text-[var(--text-primary)]">Active Detector Family Inventory</h2>
                <p className="text-[11px] text-[var(--text-tertiary)] mt-0.5">Multi-signal anomaly detectors generating corroborating evidence</p>
              </div>
            </div>
            <span className="text-[10px] font-mono text-[var(--text-tertiary)] uppercase">4 DETECTOR FAMILIES</span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
            {DETECTOR_FAMILIES.map((family) => (
              <div key={family.family} className="p-3.5 rounded-[var(--radius-sm)] bg-[var(--surface-2)] border border-[var(--border-default)] flex flex-col justify-between">
                <div>
                  <div className="text-[10px] font-mono font-bold uppercase tracking-wider text-[var(--accent-primary-light)] pb-2 mb-2 border-b border-[var(--border-subtle)]">{family.family}</div>
                  <div className="space-y-2">
                    {family.detectors.map((det) => (
                      <div key={det.code} className="text-xs font-mono">
                        <div className="text-[var(--text-primary)] font-medium leading-tight">{det.name}</div>
                        <div className="text-[10px] text-[var(--text-tertiary)] mt-0.5">Source: {det.source}</div>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="mt-3 pt-2 border-t border-[var(--border-subtle)] text-[10px] font-mono text-[var(--risk-low)] uppercase flex items-center justify-between">
                  <span>ACTIVE</span>
                  <span className="w-1.5 h-1.5 rounded-full bg-[var(--risk-low)]" />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* ── 6. Audit Stream ── */}
        <div className="bg-[var(--surface-1)] border border-[var(--border-default)] rounded-[var(--radius-md)] p-5">
          <SectionHeader title="Recent Analytical Activity" description="Audit events and state transitions logged during local execution." />
          <div className="divide-y divide-[var(--border-subtle)] mt-3 font-mono text-xs">
            <div className="py-2.5 flex flex-col sm:flex-row sm:items-center justify-between gap-1">
              <div className="flex items-center gap-2.5"><span className="w-1.5 h-1.5 rounded-full bg-[var(--risk-low)]" /><span className="text-[var(--text-primary)] font-semibold">ANALYSIS COMPLETED</span><span className="text-[var(--text-secondary)]">— {totalTransactions.toLocaleString()} transactions processed in {durationStr}</span></div>
              <span className="text-[10px] text-[var(--text-tertiary)]">Run ID: {run.run_id}</span>
            </div>
            {(riskCounts.CRITICAL || 0) > 0 && (
              <div className="py-2.5 flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                <div className="flex items-center gap-2.5"><span className="w-1.5 h-1.5 rounded-full bg-[var(--risk-critical)]" /><span className="text-[var(--text-primary)] font-semibold">CRITICAL LEADS FLAGGED</span><span className="text-[var(--text-secondary)]">— {riskCounts.CRITICAL} alerts at CRITICAL tier</span></div>
              </div>
            )}
            {graphNodes > 0 && (
              <div className="py-2.5 flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                <div className="flex items-center gap-2.5"><span className="w-1.5 h-1.5 rounded-full bg-[var(--accent-primary)]" /><span className="text-[var(--text-primary)] font-semibold">GRAPH TOPOLOGY BUILT</span><span className="text-[var(--text-secondary)]">— {graphNodes} nodes constructed</span></div>
              </div>
            )}
            {run.warnings.length > 0 && (
              <div className="py-2.5 flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                <div className="flex items-center gap-2.5"><span className="w-1.5 h-1.5 rounded-full bg-[var(--risk-medium)]" /><span className="text-[var(--text-primary)] font-semibold">WARNINGS LOGGED</span><span className="text-[var(--text-secondary)]">— {run.warnings[0]}</span></div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Alert Detail Drawer */}
      <Drawer isOpen={selectedAlert !== null} onClose={() => setSelectedAlert(null)} title={`CASE FILE: ${selectedAlert?.alert_id}`}>
        {selectedAlert && (
          <div className="space-y-5 font-mono">
            <div className="p-3 bg-[var(--surface-2)] border border-[var(--border-default)] rounded-[var(--radius-sm)]">
              <div className="text-[10px] uppercase text-[var(--text-tertiary)] mb-1">TRANSACTION IDENTIFIER</div>
              <div className="text-xs font-semibold text-[var(--accent-primary-light)] break-all">{selectedAlert.transaction_id}</div>
            </div>
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="p-2.5 bg-[var(--surface-2)] border border-[var(--border-subtle)] rounded-[var(--radius-sm)]"><div className="text-[9px] uppercase text-[var(--text-tertiary)]">Risk</div><div className="text-sm font-bold text-[var(--risk-critical)]">{selectedAlert.risk_score.toFixed(2)}</div></div>
              <div className="p-2.5 bg-[var(--surface-2)] border border-[var(--border-subtle)] rounded-[var(--radius-sm)]"><div className="text-[9px] uppercase text-[var(--text-tertiary)]">Confidence</div><div className="text-sm font-bold text-[var(--text-primary)]">{(selectedAlert.confidence_score * 100).toFixed(0)}%</div></div>
              <div className="p-2.5 bg-[var(--surface-2)] border border-[var(--border-subtle)] rounded-[var(--radius-sm)]"><div className="text-[9px] uppercase text-[var(--text-tertiary)]">Priority</div><div className="text-sm font-bold text-[var(--accent-primary-light)]">{selectedAlert.priority_score.toFixed(2)}</div></div>
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-wider text-[var(--text-tertiary)] mb-2">CORROBORATING EVIDENCE ({selectedAlert.evidence_items.length})</div>
              <div className="space-y-2">
                {selectedAlert.evidence_items.map((item, idx) => (
                  <div key={idx} className="p-3 bg-[var(--surface-2)] border border-[var(--border-subtle)] rounded-[var(--radius-sm)]">
                    <div className="flex items-center justify-between text-[10px] uppercase text-[var(--text-tertiary)] mb-1"><span className="text-[var(--accent-primary-light)] font-semibold">{item.category}</span><span>{(item.confidence * 100).toFixed(0)}% Conf.</span></div>
                    <p className="text-xs text-[var(--text-primary)] font-sans">{item.description}</p>
                  </div>
                ))}
              </div>
            </div>
            <div className="pt-3 border-t border-[var(--border-subtle)] flex items-center justify-between">
              <Button variant="ghost" size="sm" onClick={() => setSelectedAlert(null)}><span>Dismiss</span></Button>
              <Link href="/alerts"><Button variant="accent" size="sm"><span>Full Investigation Lead</span><ExternalLink size={13} /></Button></Link>
            </div>
          </div>
        )}
      </Drawer>
    </PageContainer>
  );
}
