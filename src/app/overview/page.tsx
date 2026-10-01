'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import Link from 'next/link';
import {
  ShieldAlert,
  ArrowUpRight,
  GitBranch,
  Layers,
  Clock,
  Activity,
  ChevronRight,
  ExternalLink,
  Cpu,
  CheckCircle2,
  FileText,
  Radio,
  ArrowRight,
} from 'lucide-react';
import { PageContainer } from '@/components/PageContainer';
import {
  MetricCard,
  RiskBadge,
  Badge,
  Button,
  Card,
  SectionHeader,
  Drawer,
  EmptyState,
} from '@/components/ui';
import { useRun } from '@/context/RunContext';
import { apiClient, ApiError, adaptApiAlertToAlert, ApiLatestRun } from '@/lib/api';
import { Alert, RiskLevel } from '@/types';

export default function OverviewPage() {
  const { runId, currentRun, lifecycle, isHydrated } = useRun();
  const [selectedAlert, setSelectedAlert] = useState<Alert | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<ApiLatestRun | null>(null);
  const [alerts, setAlerts] = useState<Alert[]>([]);

  const fetchRunData = useCallback(async (activeId: string) => {
    setLoading(true);
    setError(null);
    try {
      const [runSummary, alertsList] = await Promise.all([
        apiClient.getLatestRun(activeId).catch(() => null),
        apiClient.getAlerts({ run_id: activeId }),
      ]);
      setSummary(runSummary);
      setAlerts((alertsList?.alerts || []).map(adaptApiAlertToAlert));
    } catch (err: unknown) {
      const msg =
        err instanceof ApiError
          ? err.detail
          : err instanceof Error
          ? err.message
          : 'Failed to retrieve active run data from the API.';
      setError(msg);
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
        fetchRunData(runId);
      } else {
        setLoading(false);
        setSummary(null);
        setAlerts([]);
      }
    };
    init();
    return () => {
      isCancelled = true;
    };
  }, [runId, isHydrated, fetchRunData]);

  // Detector Activity breakdown from real triggered detectors across alerts
  const detectorHitCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const a of alerts) {
      for (const d of a.triggered_detectors || []) {
        counts[d] = (counts[d] || 0) + 1;
      }
    }
    return counts;
  }, [alerts]);

  const detectorFamilies = useMemo(() => [
    {
      family: 'STRUCTURAL',
      detectors: [
        { name: 'Fan-In High In-Degree', code: 'fan_in', hits: detectorHitCounts['fan_in'] || 0, source: 'structural' },
        { name: 'Fan-Out Splitting Pattern', code: 'fan_out', hits: detectorHitCounts['fan_out'] || 0, source: 'structural' },
        { name: 'Equal Output Splitting', code: 'equal_output', hits: detectorHitCounts['equal_output'] || 0, source: 'structural' },
        { name: 'Peeling Chain Flow', code: 'peeling_like', hits: detectorHitCounts['peeling_like'] || 0, source: 'structural' },
      ],
    },
    {
      family: 'TEMPORAL',
      detectors: [
        { name: 'Temporal Velocity Burst', code: 'temporal_burst', hits: detectorHitCounts['temporal_burst'] || 0, source: 'temporal' },
        { name: 'Rapid Multi-Hop Relaying', code: 'rapid_hop', hits: detectorHitCounts['rapid_hop'] || 0, source: 'temporal' },
        { name: 'Baseline Timing Deviation', code: 'baseline_deviation', hits: detectorHitCounts['baseline_deviation'] || 0, source: 'temporal' },
      ],
    },
    {
      family: 'NETWORK OBSERVATION',
      detectors: [
        { name: 'IP Address Reuse / Co-location', code: 'ip_reuse', hits: detectorHitCounts['ip_reuse'] || 0, source: 'network' },
        { name: 'Dense Network Cluster', code: 'network_cluster', hits: detectorHitCounts['network_cluster'] || 0, source: 'network' },
        { name: 'Endpoint Recurrence Pattern', code: 'endpoint_recurrence', hits: detectorHitCounts['endpoint_recurrence'] || 0, source: 'network' },
      ],
    },
    {
      family: 'BEHAVIORAL & ML',
      detectors: [
        { name: 'Isolation Forest Feature Outlier', code: 'isolation_forest', hits: detectorHitCounts['isolation_forest'] || 0, source: 'isolation_forest' },
      ],
    },
  ], [detectorHitCounts]);

  const topLeads = useMemo(() => alerts.slice(0, 5), [alerts]);
  const recentAlerts = useMemo(() => alerts.slice(0, 6), [alerts]);

  // 1. Truthful Loading State
  if (!isHydrated || (loading && !summary && alerts.length === 0 && runId)) {
    return (
      <PageContainer
        title="OVERVIEW"
        description="Offline transaction intelligence and investigative lead generation."
        tag="COMMAND CENTER"
      >
        <div className="flex flex-col items-center justify-center min-h-[360px] p-12 text-center border border-[var(--border-default)] rounded-[var(--radius-md)] bg-[var(--surface-1)]">
          <div className="w-8 h-8 border-2 border-[var(--accent-primary)] border-t-transparent rounded-full animate-spin mb-4" />
          <h3 className="text-xs font-mono font-semibold uppercase tracking-[0.1em] text-[var(--text-primary)]">
            Retrieving Current Run Data
          </h3>
          <p className="text-xs text-[var(--text-tertiary)] mt-1 font-mono">
            Loading investigative summary and ranked leads{runId ? ` for ${runId}` : ''}...
          </p>
        </div>
      </PageContainer>
    );
  }

  // 2. Truthful No Active Run State
  if (!runId || (!currentRun && !summary && alerts.length === 0)) {
    return (
      <PageContainer
        title="OVERVIEW"
        description="Offline transaction intelligence and investigative lead generation."
        tag="COMMAND CENTER"
      >
        <EmptyState
          title="NO ACTIVE ANALYSIS RUN"
          description="Upload and analyze a transaction dataset to begin offline anomaly detection, graph relationship extraction, and investigative lead scoring."
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
  if (error && !summary && alerts.length === 0) {
    return (
      <PageContainer
        title="OVERVIEW"
        description="Offline transaction intelligence and investigative lead generation."
        tag="COMMAND CENTER"
      >
        <EmptyState
          title="API CONNECTION ERROR"
          description={error}
          action={
            <div className="flex items-center gap-3">
              {runId && (
                <Button variant="secondary" size="md" onClick={() => fetchRunData(runId)}>
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

  // Derive metrics strictly from backend-authoritative data
  const activeRunId = summary?.run_id || currentRun?.run_id || runId || '';
  const datasetName =
    (summary?.dataset_metadata?.filename as string) ||
    (currentRun?.dataset_metadata?.filename as string) ||
    'Ingested CSV Dataset';
  const pipelineVersion =
    summary?.pipeline_version ||
    currentRun?.pipeline_version ||
    'sanket-pipeline-v1';

  const totalTransactions = summary?.record_count ?? currentRun?.record_count ?? 0;
  const rejectedCount = currentRun?.rejected_record_count ?? 0;
  const totalAlerts = summary?.alert_count ?? currentRun?.alert_count ?? alerts.length;
  const highCriticalAlerts =
    (summary?.risk_level_counts?.CRITICAL ?? 0) + (summary?.risk_level_counts?.HIGH ?? 0) ||
    alerts.filter((a) => a.risk_level === 'CRITICAL' || a.risk_level === 'HIGH').length;

  // Duration derivation strictly from execution timings or run timestamps
  const timings = summary?.execution_timings || currentRun?.execution_timings;
  let durationStr = '< 1s';
  if (timings && Object.keys(timings).length > 0) {
    const totalSec: number = Object.values(timings).reduce<number>(
      (sum: number, v: unknown) => sum + (typeof v === 'number' ? v : 0),
      0
    );
    durationStr = totalSec < 1 ? `${totalSec.toFixed(3)}s` : `${totalSec.toFixed(2)}s`;
  } else if (currentRun?.started_at && currentRun?.completed_at) {
    const diffSec = (new Date(currentRun.completed_at).getTime() - new Date(currentRun.started_at).getTime()) / 1000;
    if (diffSec > 0) durationStr = `${diffSec.toFixed(2)}s`;
  }

  // Risk Distribution calculation strictly from real backend alerts or summary counts
  const riskCounts: Record<RiskLevel, number> = {
    CRITICAL: summary?.risk_level_counts?.CRITICAL ?? alerts.filter((a) => a.risk_level === 'CRITICAL').length,
    HIGH: summary?.risk_level_counts?.HIGH ?? alerts.filter((a) => a.risk_level === 'HIGH').length,
    MEDIUM: summary?.risk_level_counts?.MEDIUM ?? alerts.filter((a) => a.risk_level === 'MEDIUM').length,
    LOW: summary?.risk_level_counts?.LOW ?? alerts.filter((a) => a.risk_level === 'LOW').length,
  };

  const totalEvaluated = alerts.length || totalAlerts;
  const riskPercentages = {
    CRITICAL: totalEvaluated > 0 ? (riskCounts.CRITICAL / totalEvaluated) * 100 : 0,
    HIGH: totalEvaluated > 0 ? (riskCounts.HIGH / totalEvaluated) * 100 : 0,
    MEDIUM: totalEvaluated > 0 ? (riskCounts.MEDIUM / totalEvaluated) * 100 : 0,
    LOW: totalEvaluated > 0 ? (riskCounts.LOW / totalEvaluated) * 100 : 0,
  };

  return (
    <PageContainer
      title="OVERVIEW"
      description="Offline transaction intelligence and investigative lead generation."
      tag="COMMAND CENTER"
      actions={
        <div className="flex items-center gap-2">
          <Link href="/analyze">
            <Button variant="secondary" size="sm">
              <span>Ingest Dataset</span>
            </Button>
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
        {/* ── 1. Page Header Metadata Strip ── */}
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 p-3 bg-[var(--surface-1)] border border-[var(--border-default)] rounded-[var(--radius-md)] text-xs font-mono">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] uppercase text-[var(--text-tertiary)]">LAST ANALYSIS:</span>
              <span className="font-semibold text-[var(--accent-primary-light)]">{activeRunId}</span>
            </div>
            <span className="text-[var(--border-strong)]">|</span>
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] uppercase text-[var(--text-tertiary)]">DATASET:</span>
              <span className="text-[var(--text-primary)] font-medium">{datasetName}</span>
            </div>
            <span className="text-[var(--border-strong)]">|</span>
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] uppercase text-[var(--text-tertiary)]">PIPELINE:</span>
              <span className="text-[var(--text-secondary)]">{pipelineVersion}</span>
            </div>
          </div>

          <div className="flex items-center gap-2 text-[11px] text-[var(--text-secondary)]">
            <span className="w-1.5 h-1.5 rounded-full bg-[var(--risk-low)]" />
            <span className="uppercase tracking-wider">AIRGAPPED LOCAL EXECUTION</span>
          </div>
        </div>

        {/* ── 2. KPI Metrics Strip ── */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3.5">
          <MetricCard
            label="TOTAL TRANSACTIONS"
            value={totalTransactions.toLocaleString()}
            sublabel="Full ingested range"
            accentIndicator
          />
          <MetricCard
            label="REJECTED RECORDS"
            value={rejectedCount.toLocaleString()}
            sublabel="Quarantined records"
          />
          <MetricCard
            label="ANOMALOUS ALERTS"
            value={totalAlerts.toLocaleString()}
            sublabel="Generated leads"
          />
          <MetricCard
            label="HIGH / CRITICAL LEADS"
            value={highCriticalAlerts.toLocaleString()}
            sublabel="Prioritized cases"
            change="Top Tier"
            changeType="positive"
          />
          <MetricCard
            label="ANALYSIS DURATION"
            value={durationStr}
            sublabel="Deterministic runtime"
          />
        </div>

        {/* ── 3. HERO SECTION: Top Investigative Leads ── */}
        <div className="bg-[var(--surface-1)] border border-[var(--border-default)] rounded-[var(--radius-md)] p-5 relative">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 mb-4 border-b border-[var(--border-subtle)]">
            <div>
              <div className="flex items-center gap-2">
                <span className="w-1.5 h-3 bg-[var(--accent-primary)] rounded-xs" />
                <h2 className="text-xs font-mono font-semibold uppercase tracking-[0.12em] text-[var(--text-primary)]">
                  Top Priority Investigative Leads
                </h2>
              </div>
              <p className="text-[11px] text-[var(--text-tertiary)] mt-1">
                Authoritative ranking based on independent signal corroboration and risk confidence scores.
              </p>
            </div>
            <Link href="/alerts">
              <Button variant="ghost" size="sm">
                <span>View All Case Files</span>
                <ChevronRight size={13} />
              </Button>
            </Link>
          </div>

          {/* Leads Grid / Cards */}
          {topLeads.length === 0 ? (
            <div className="p-8 text-center border border-[var(--border-subtle)] rounded-[var(--radius-sm)] bg-[var(--surface-2)] font-mono text-xs text-[var(--text-tertiary)]">
              No anomalous investigative leads were detected for this dataset run.
            </div>
          ) : (
            <div className="space-y-3.5">
              {topLeads.map((alert) => (
                <div
                  key={alert.alert_id}
                  onClick={() => setSelectedAlert(alert)}
                  className="group bg-[var(--surface-2)] border border-[var(--border-default)] hover:border-[var(--accent-primary-border)] hover:bg-[var(--surface-3)] transition-all rounded-[var(--radius-sm)] p-4 cursor-pointer"
                >
                  {/* Lead Headline */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pb-2.5 border-b border-[var(--border-subtle)]">
                    <div className="flex items-center gap-3">
                      <span className="text-xs font-mono font-bold text-[var(--accent-primary-light)]">
                        RANK #{alert.rank}
                      </span>
                      <span className="text-xs font-mono text-[var(--text-tertiary)]">|</span>
                      <span className="text-xs font-mono font-medium text-[var(--text-primary)] truncate max-w-[200px] sm:max-w-[380px]">
                        {alert.transaction_id}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <RiskBadge level={alert.risk_level} />
                      <span className="text-[10px] font-mono text-[var(--text-tertiary)]">
                        {alert.alert_id}
                      </span>
                    </div>
                  </div>

                  {/* Score Metadata Grid */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 py-2.5 font-mono text-xs border-b border-[var(--border-subtle)]">
                    <div>
                      <span className="text-[10px] uppercase text-[var(--text-tertiary)] block">Composite Risk</span>
                      <span className="text-sm font-bold text-[var(--text-primary)]">{alert.risk_score.toFixed(2)}</span>
                    </div>
                    <div>
                      <span className="text-[10px] uppercase text-[var(--text-tertiary)] block">Confidence</span>
                      <span className="text-sm font-bold text-[var(--text-primary)]">{(alert.confidence_score * 100).toFixed(0)}%</span>
                    </div>
                    <div>
                      <span className="text-[10px] uppercase text-[var(--text-tertiary)] block">Priority Score</span>
                      <span className="text-sm font-bold text-[var(--accent-primary-light)]">{alert.priority_score.toFixed(2)}</span>
                    </div>
                    <div>
                      <span className="text-[10px] uppercase text-[var(--text-tertiary)] block">Signals</span>
                      <span className="text-sm font-bold text-[var(--text-secondary)]">{alert.independent_signal_count} independent</span>
                    </div>
                  </div>

                  {/* "Why This Matters" Preview */}
                  <div className="pt-2.5 space-y-1.5">
                    <div className="text-[10px] font-mono uppercase tracking-wider text-[var(--text-tertiary)]">
                      WHY THIS MATTERS — CORROBORATING EVIDENCE PREVIEW
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                      {(alert.evidence_items || []).slice(0, 4).map((ev, i) => (
                        <div
                          key={i}
                          className="p-2 rounded-[var(--radius-sm)] bg-[var(--surface-1)] border border-[var(--border-subtle)] text-[11px]"
                        >
                          <div className="flex items-center justify-between text-[10px] font-mono uppercase text-[var(--text-tertiary)] mb-0.5">
                            <span className="text-[var(--accent-primary-light)] font-semibold">{ev.category}</span>
                            <span>{(ev.confidence * 100).toFixed(0)}% CONF.</span>
                          </div>
                          <p className="text-[var(--text-secondary)] leading-relaxed truncate">
                            {ev.description}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ── 4. Risk Distribution & Alert Activity ── */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left: Risk Distribution */}
          <div className="lg:col-span-6 bg-[var(--surface-1)] border border-[var(--border-default)] rounded-[var(--radius-md)] p-5">
            <div className="flex items-center justify-between pb-3 mb-4 border-b border-[var(--border-subtle)]">
              <div>
                <h2 className="text-xs font-mono font-semibold uppercase tracking-[0.1em] text-[var(--text-primary)]">
                  Risk Tier Distribution
                </h2>
                <p className="text-[11px] text-[var(--text-tertiary)] mt-0.5">
                  Breakdown across {totalEvaluated} investigative leads
                </p>
              </div>
              <Badge variant="default">4 TIERS</Badge>
            </div>

            <div className="space-y-4">
              {/* Critical */}
              <div>
                <div className="flex items-center justify-between text-xs font-mono mb-1.5">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-xs bg-[var(--risk-critical)]" />
                    <span className="text-[var(--text-primary)]">CRITICAL</span>
                  </div>
                  <div className="text-[var(--text-secondary)]">
                    <span className="text-[var(--risk-critical)] font-bold">{riskCounts.CRITICAL}</span> ({riskPercentages.CRITICAL.toFixed(1)}%)
                  </div>
                </div>
                <div className="w-full h-2 bg-[var(--surface-3)] rounded-full overflow-hidden">
                  <div
                    className="h-full bg-[var(--risk-critical)] rounded-full transition-all"
                    style={{ width: `${riskPercentages.CRITICAL}%` }}
                  />
                </div>
              </div>

              {/* High */}
              <div>
                <div className="flex items-center justify-between text-xs font-mono mb-1.5">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-xs bg-[var(--risk-high)]" />
                    <span className="text-[var(--text-primary)]">HIGH</span>
                  </div>
                  <div className="text-[var(--text-secondary)]">
                    <span className="text-[var(--risk-high)] font-bold">{riskCounts.HIGH}</span> ({riskPercentages.HIGH.toFixed(1)}%)
                  </div>
                </div>
                <div className="w-full h-2 bg-[var(--surface-3)] rounded-full overflow-hidden">
                  <div
                    className="h-full bg-[var(--risk-high)] rounded-full transition-all"
                    style={{ width: `${riskPercentages.HIGH}%` }}
                  />
                </div>
              </div>

              {/* Medium */}
              <div>
                <div className="flex items-center justify-between text-xs font-mono mb-1.5">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-xs bg-[var(--risk-medium)]" />
                    <span className="text-[var(--text-primary)]">MEDIUM</span>
                  </div>
                  <div className="text-[var(--text-secondary)]">
                    <span className="text-[var(--risk-medium)] font-bold">{riskCounts.MEDIUM}</span> ({riskPercentages.MEDIUM.toFixed(1)}%)
                  </div>
                </div>
                <div className="w-full h-2 bg-[var(--surface-3)] rounded-full overflow-hidden">
                  <div
                    className="h-full bg-[var(--risk-medium)] rounded-full transition-all"
                    style={{ width: `${riskPercentages.MEDIUM}%` }}
                  />
                </div>
              </div>

              {/* Low */}
              <div>
                <div className="flex items-center justify-between text-xs font-mono mb-1.5">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-xs bg-[var(--risk-low)]" />
                    <span className="text-[var(--text-primary)]">LOW</span>
                  </div>
                  <div className="text-[var(--text-secondary)]">
                    <span className="text-[var(--risk-low)] font-bold">{riskCounts.LOW}</span> ({riskPercentages.LOW.toFixed(1)}%)
                  </div>
                </div>
                <div className="w-full h-2 bg-[var(--surface-3)] rounded-full overflow-hidden">
                  <div
                    className="h-full bg-[var(--risk-low)] rounded-full transition-all"
                    style={{ width: `${riskPercentages.LOW}%` }}
                  />
                </div>
              </div>
            </div>

            <div className="mt-5 pt-3.5 border-t border-[var(--border-subtle)] flex items-center justify-between text-[11px] font-mono text-[var(--text-tertiary)]">
              <span>TOTAL EVALUATED LEADS: {totalEvaluated}</span>
              <span className="text-[var(--accent-primary-light)]">
                HIGH/CRITICAL: {totalEvaluated > 0 ? ((highCriticalAlerts / totalEvaluated) * 100).toFixed(0) : 0}%
              </span>
            </div>
          </div>

          {/* Right: Alert Activity Timeline */}
          <div className="lg:col-span-6 bg-[var(--surface-1)] border border-[var(--border-default)] rounded-[var(--radius-md)] p-5 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between pb-3 mb-4 border-b border-[var(--border-subtle)]">
                <div className="flex items-center gap-2">
                  <Activity size={14} className="text-[var(--accent-primary)]" />
                  <div>
                    <h2 className="text-xs font-mono font-semibold uppercase tracking-[0.1em] text-[var(--text-primary)]">
                      Recent Alert Concentration
                    </h2>
                    <p className="text-[11px] text-[var(--text-tertiary)] mt-0.5">
                      Prioritized leads detected across active run
                    </p>
                  </div>
                </div>
                <Badge variant="accent">RANKED</Badge>
              </div>

              {/* Activity List derived strictly from real alerts */}
              {recentAlerts.length === 0 ? (
                <div className="p-6 text-center border border-[var(--border-subtle)] rounded-[var(--radius-sm)] bg-[var(--surface-2)] font-mono text-xs text-[var(--text-tertiary)]">
                  No alerts available in current run.
                </div>
              ) : (
                <div className="space-y-2 font-mono text-xs">
                  {recentAlerts.map((alert) => (
                    <div
                      key={alert.alert_id}
                      onClick={() => setSelectedAlert(alert)}
                      className="flex items-center justify-between p-2.5 rounded-[var(--radius-sm)] bg-[var(--surface-2)] border border-[var(--border-subtle)] hover:border-[var(--accent-primary-border)] transition-colors cursor-pointer"
                    >
                      <div className="flex items-center gap-2.5">
                        <span className="text-[10px] text-[var(--accent-primary-light)] font-bold">
                          #{alert.rank}
                        </span>
                        <span className="text-[var(--text-primary)] font-medium">
                          {alert.alert_id}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] text-[var(--text-secondary)] truncate max-w-[120px] hidden sm:inline">
                          {alert.triggered_detectors[0]?.replace('_', ' ') || 'corroborated'}
                        </span>
                        <RiskBadge level={alert.risk_level} size="sm" />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="mt-4 pt-3 border-t border-[var(--border-subtle)] text-[11px] font-mono text-[var(--text-tertiary)] flex items-center justify-between">
              <span>TOTAL FLAGGED LEADS: {alerts.length}</span>
              <span className="text-[var(--risk-critical)]">
                HIGHEST RISK: {alerts[0]?.risk_level || 'NONE'}
              </span>
            </div>
          </div>
        </div>

        {/* ── 5. Detector Activity Inventory ── */}
        <div className="bg-[var(--surface-1)] border border-[var(--border-default)] rounded-[var(--radius-md)] p-5">
          <div className="flex items-center justify-between pb-3 mb-4 border-b border-[var(--border-subtle)]">
            <div className="flex items-center gap-2">
              <Cpu size={15} className="text-[var(--accent-primary)]" />
              <div>
                <h2 className="text-xs font-mono font-semibold uppercase tracking-[0.1em] text-[var(--text-primary)]">
                  Active Detector Family Inventory
                </h2>
                <p className="text-[11px] text-[var(--text-tertiary)] mt-0.5">
                  Multi-signal anomaly detectors generating corroborating evidence in active run
                </p>
              </div>
            </div>
            <span className="text-[10px] font-mono text-[var(--text-tertiary)] uppercase">
              {detectorFamilies.length} DETECTOR FAMILIES
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
            {detectorFamilies.map((family) => (
              <div
                key={family.family}
                className="p-3.5 rounded-[var(--radius-sm)] bg-[var(--surface-2)] border border-[var(--border-default)] flex flex-col justify-between"
              >
                <div>
                  <div className="text-[10px] font-mono font-bold uppercase tracking-wider text-[var(--accent-primary-light)] pb-2 mb-2 border-b border-[var(--border-subtle)]">
                    {family.family}
                  </div>
                  <div className="space-y-2">
                    {family.detectors.map((det) => (
                      <div key={det.code} className="text-xs font-mono">
                        <div className="flex items-center justify-between text-[var(--text-primary)] font-medium leading-tight">
                          <span>{det.name}</span>
                          {det.hits > 0 && (
                            <span className="text-[10px] font-bold text-[var(--accent-primary-light)]">
                              {det.hits}x
                            </span>
                          )}
                        </div>
                        <div className="text-[10px] text-[var(--text-tertiary)] mt-0.5">
                          Source: {det.source}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="mt-3 pt-2 border-t border-[var(--border-subtle)] text-[10px] font-mono text-[var(--risk-low)] uppercase flex items-center justify-between">
                  <span>{family.detectors.some((d) => d.hits > 0) ? 'TRIGGERED SIGNALS' : 'ACTIVE PIPELINE'}</span>
                  <span className="w-1.5 h-1.5 rounded-full bg-[var(--risk-low)]" />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* ── 6. Recent Analytical Activity (Audit Stream) ── */}
        <div className="bg-[var(--surface-1)] border border-[var(--border-default)] rounded-[var(--radius-md)] p-5">
          <SectionHeader
            title="Recent Analytical Activity"
            description="Audit events and state transitions logged during local execution."
          />

          <div className="divide-y divide-[var(--border-subtle)] mt-3 font-mono text-xs">
            <div className="py-2.5 flex flex-col sm:flex-row sm:items-center justify-between gap-1">
              <div className="flex items-center gap-2.5">
                <span className="w-1.5 h-1.5 rounded-full bg-[var(--risk-low)]" />
                <span className="text-[var(--text-primary)] font-semibold">ANALYSIS COMPLETED</span>
                <span className="text-[var(--text-secondary)]">
                  — {totalTransactions.toLocaleString()} transactions processed in {durationStr}
                </span>
              </div>
              <span className="text-[10px] text-[var(--text-tertiary)]">
                {currentRun?.completed_at ? new Date(currentRun.completed_at).toISOString().replace('T', ' ').slice(0, 19) + ' UTC' : 'ACTIVE RUN'}
              </span>
            </div>

            {alerts.length > 0 && (
              <div className="py-2.5 flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                <div className="flex items-center gap-2.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-[var(--risk-critical)]" />
                  <span className="text-[var(--text-primary)] font-semibold">LEAD IDENTIFIED</span>
                  <span className="text-[var(--text-secondary)]">
                    — {alerts[0].alert_id} ({alerts[0].independent_signal_count} independent signals, score {alerts[0].risk_score.toFixed(2)})
                  </span>
                </div>
                <span className="text-[10px] text-[var(--text-tertiary)]">
                  RANK #{alerts[0].rank}
                </span>
              </div>
            )}

            <div className="py-2.5 flex flex-col sm:flex-row sm:items-center justify-between gap-1">
              <div className="flex items-center gap-2.5">
                <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent-primary)]" />
                <span className="text-[var(--text-primary)] font-semibold">PIPELINE EXECUTION LOGGED</span>
                <span className="text-[var(--text-secondary)]">
                  — Version {pipelineVersion} completed deterministic scoring
                </span>
              </div>
              <span className="text-[10px] text-[var(--text-tertiary)]">DETERMINISTIC</span>
            </div>

            <div className="py-2.5 flex flex-col sm:flex-row sm:items-center justify-between gap-1">
              <div className="flex items-center gap-2.5">
                <span className="w-1.5 h-1.5 rounded-full bg-[var(--text-tertiary)]" />
                <span className="text-[var(--text-primary)] font-semibold">DATASET INGESTION VERIFIED</span>
                <span className="text-[var(--text-secondary)]">
                  — {datasetName} ({totalTransactions} accepted records, {rejectedCount} quarantined)
                </span>
              </div>
              <span className="text-[10px] text-[var(--text-tertiary)]">AIRGAPPED</span>
            </div>
          </div>
        </div>
      </div>

      {/* ── Case File Detail Drawer (Non-destructive inspection) ── */}
      <Drawer
        isOpen={selectedAlert !== null}
        onClose={() => setSelectedAlert(null)}
        title={`CASE FILE: ${selectedAlert?.alert_id}`}
      >
        {selectedAlert && (
          <div className="space-y-5 font-mono">
            <div className="p-3 bg-[var(--surface-2)] border border-[var(--border-default)] rounded-[var(--radius-sm)]">
              <div className="text-[10px] uppercase text-[var(--text-tertiary)] mb-1">
                TRANSACTION IDENTIFIER
              </div>
              <div className="text-xs font-semibold text-[var(--accent-primary-light)] break-all">
                {selectedAlert.transaction_id}
              </div>
            </div>

            {/* Scores summary */}
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="p-2.5 bg-[var(--surface-2)] border border-[var(--border-subtle)] rounded-[var(--radius-sm)]">
                <div className="text-[9px] uppercase text-[var(--text-tertiary)]">Risk</div>
                <div className="text-sm font-bold text-[var(--risk-critical)]">{selectedAlert.risk_score.toFixed(2)}</div>
              </div>
              <div className="p-2.5 bg-[var(--surface-2)] border border-[var(--border-subtle)] rounded-[var(--radius-sm)]">
                <div className="text-[9px] uppercase text-[var(--text-tertiary)]">Confidence</div>
                <div className="text-sm font-bold text-[var(--text-primary)]">{(selectedAlert.confidence_score * 100).toFixed(0)}%</div>
              </div>
              <div className="p-2.5 bg-[var(--surface-2)] border border-[var(--border-subtle)] rounded-[var(--radius-sm)]">
                <div className="text-[9px] uppercase text-[var(--text-tertiary)]">Priority</div>
                <div className="text-sm font-bold text-[var(--accent-primary-light)]">{selectedAlert.priority_score.toFixed(2)}</div>
              </div>
            </div>

            {/* Evidence items */}
            <div>
              <div className="text-[10px] uppercase tracking-wider text-[var(--text-tertiary)] mb-2">
                CORROBORATING EVIDENCE ({(selectedAlert.evidence_items || []).length})
              </div>
              <div className="space-y-2">
                {(selectedAlert.evidence_items || []).map((item, idx) => (
                  <div
                    key={idx}
                    className="p-3 bg-[var(--surface-2)] border border-[var(--border-subtle)] rounded-[var(--radius-sm)]"
                  >
                    <div className="flex items-center justify-between text-[10px] uppercase text-[var(--text-tertiary)] mb-1">
                      <span className="text-[var(--accent-primary-light)] font-semibold">{item.category}</span>
                      <span>{(item.confidence * 100).toFixed(0)}% Conf.</span>
                    </div>
                    <p className="text-xs text-[var(--text-primary)] font-sans">
                      {item.description}
                    </p>
                  </div>
                ))}
              </div>
            </div>

            <div className="pt-3 border-t border-[var(--border-subtle)] flex items-center justify-between">
              <Button variant="ghost" size="sm" onClick={() => setSelectedAlert(null)}>
                <span>Dismiss</span>
              </Button>
              <Link href={`/alerts?alert_id=${encodeURIComponent(selectedAlert.alert_id)}`}>
                <Button variant="accent" size="sm">
                  <span>Full Investigation Lead</span>
                  <ExternalLink size={13} />
                </Button>
              </Link>
            </div>
          </div>
        )}
      </Drawer>
    </PageContainer>
  );
}

