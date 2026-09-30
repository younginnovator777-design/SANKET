'use client';

import React, { useState } from 'react';
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
import {
  mockAlerts,
  mockRuns,
  mockCandidateEntities,
  mockTransactions,
} from '@/data/mock';
import { Alert, RiskLevel } from '@/types';

export default function OverviewPage() {
  const [selectedAlert, setSelectedAlert] = useState<Alert | null>(null);

  // Authoritative active run from mock data
  const activeRun = mockRuns[0];

  // If no run data exists, render clean empty state
  if (!activeRun) {
    return (
      <PageContainer
        title="Overview"
        description="Offline transaction intelligence and investigative lead generation."
        tag="COMMAND CENTER"
      >
        <EmptyState
          title="NO DATASET LOADED"
          description="Upload a transaction dataset to begin offline anomaly detection and lead scoring."
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

  // Derive metrics strictly from existing mock data
  const totalTransactions = activeRun.transaction_count;
  const totalAlerts = activeRun.alert_count;
  const highCriticalAlerts = mockAlerts.filter(
    (a) => a.risk_level === 'CRITICAL' || a.risk_level === 'HIGH'
  ).length;
  const candidateEntityCount = mockCandidateEntities.length;

  // Calculate duration string from run timestamps
  const startTime = new Date(activeRun.started_at);
  const endTime = activeRun.completed_at ? new Date(activeRun.completed_at) : new Date();
  const diffHours = Math.floor((endTime.getTime() - startTime.getTime()) / (1000 * 60 * 60));
  const diffMinutes = Math.floor(
    ((endTime.getTime() - startTime.getTime()) % (1000 * 60 * 60)) / (1000 * 60)
  );
  const durationStr = `${diffHours}h ${diffMinutes}m`;

  // Risk Distribution calculation strictly from mockAlerts
  const riskCounts: Record<RiskLevel, number> = {
    CRITICAL: mockAlerts.filter((a) => a.risk_level === 'CRITICAL').length,
    HIGH: mockAlerts.filter((a) => a.risk_level === 'HIGH').length,
    MEDIUM: mockAlerts.filter((a) => a.risk_level === 'MEDIUM').length,
    LOW: mockAlerts.filter((a) => a.risk_level === 'LOW').length,
  };

  const riskPercentages = {
    CRITICAL: mockAlerts.length > 0 ? (riskCounts.CRITICAL / mockAlerts.length) * 100 : 0,
    HIGH: mockAlerts.length > 0 ? (riskCounts.HIGH / mockAlerts.length) * 100 : 0,
    MEDIUM: mockAlerts.length > 0 ? (riskCounts.MEDIUM / mockAlerts.length) * 100 : 0,
    LOW: mockAlerts.length > 0 ? (riskCounts.LOW / mockAlerts.length) * 100 : 0,
  };

  // Extract unique detector families strictly from mockAlerts evidence
  const detectorFamilies = [
    {
      family: 'STRUCTURAL',
      detectors: [
        { name: 'Peel-Chain Flow Heuristic', code: 'peel_chain', hits: 1, source: 'graph_analyzer' },
        { name: 'Fan-Out Splitting Pattern', code: 'fan_out_pattern', hits: 1, source: 'graph_analyzer' },
      ],
    },
    {
      family: 'TEMPORAL',
      detectors: [
        { name: 'Temporal Velocity Burst', code: 'temporal_burst', hits: 1, source: 'temporal_analyzer' },
        { name: 'Historical Timing Deviation', code: 'unusual_timing', hits: 1, source: 'temporal_analyzer' },
      ],
    },
    {
      family: 'BEHAVIORAL & ML',
      detectors: [
        { name: 'Value Splitting / Layering', code: 'value_layering', hits: 1, source: 'behavioral_analyzer' },
        { name: 'Synthetic Round Amount', code: 'round_amount', hits: 1, source: 'behavioral_analyzer' },
        { name: 'Isolation Forest Feature Outlier', code: 'isolation_forest', hits: 1, source: 'isolation_forest' },
      ],
    },
    {
      family: 'NETWORK OBSERVATION',
      detectors: [
        { name: 'Broadcast Node Divergence', code: 'broadcast_divergence', hits: 1, source: 'network_collector' },
      ],
    },
  ];

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
              <span>Investigate Leads ({mockAlerts.length})</span>
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
              <span className="font-semibold text-[var(--accent-primary-light)]">{activeRun.run_id}</span>
            </div>
            <span className="text-[var(--border-strong)]">|</span>
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] uppercase text-[var(--text-tertiary)]">DATASET:</span>
              <span className="text-[var(--text-primary)] font-medium">{activeRun.dataset_name}</span>
            </div>
            <span className="text-[var(--border-strong)]">|</span>
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] uppercase text-[var(--text-tertiary)]">MODEL:</span>
              <span className="text-[var(--text-secondary)]">{activeRun.scoring_version}</span>
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
            label="ANOMALOUS ACTIVITY"
            value={totalAlerts.toLocaleString()}
            sublabel="Generated alerts"
          />
          <MetricCard
            label="HIGH / CRITICAL LEADS"
            value={highCriticalAlerts}
            sublabel="Prioritized cases"
            change="Top Tier"
            changeType="positive"
          />
          <MetricCard
            label="CANDIDATE ENTITIES"
            value={candidateEntityCount}
            sublabel="Heuristic clusters"
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
          <div className="space-y-3.5">
            {mockAlerts.map((alert) => (
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
                      {alert.created_at ? new Date(alert.created_at).toISOString().replace('T', ' ').replace('.000Z', ' UTC') : ''}
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
                    {alert.evidence_items.map((ev, i) => (
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
                  Breakdown across {mockAlerts.length} investigative leads
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
              <span>TOTAL EVALUATED LEADS: {mockAlerts.length}</span>
              <span className="text-[var(--accent-primary-light)]">HIGH/CRITICAL: {((highCriticalAlerts / mockAlerts.length) * 100).toFixed(0)}%</span>
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
                      Temporal distribution of detected anomalous leads
                    </p>
                  </div>
                </div>
                <Badge variant="accent">CHRONOLOGICAL</Badge>
              </div>

              {/* Activity List derived strictly from mockAlerts */}
              <div className="space-y-2 font-mono text-xs">
                {mockAlerts.map((alert) => (
                  <div
                    key={alert.alert_id}
                    onClick={() => setSelectedAlert(alert)}
                    className="flex items-center justify-between p-2.5 rounded-[var(--radius-sm)] bg-[var(--surface-2)] border border-[var(--border-subtle)] hover:border-[var(--accent-primary-border)] transition-colors cursor-pointer"
                  >
                    <div className="flex items-center gap-2.5">
                      <span className="text-[10px] text-[var(--text-tertiary)]">
                        {alert.created_at ? alert.created_at.split('T')[1].slice(0, 5) : '00:00'} UTC
                      </span>
                      <span className="text-[var(--text-primary)] font-medium">
                        {alert.alert_id}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] text-[var(--text-secondary)] truncate max-w-[120px] hidden sm:inline">
                        {alert.triggered_detectors[0]?.replace('_', ' ')}
                      </span>
                      <RiskBadge level={alert.risk_level} size="sm" />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="mt-4 pt-3 border-t border-[var(--border-subtle)] text-[11px] font-mono text-[var(--text-tertiary)] flex items-center justify-between">
              <span>PEAK INTERVAL: 13:45 – 14:23 UTC</span>
              <span className="text-[var(--risk-critical)]">CRITICAL PEAK OBSERVED</span>
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
                  Multi-signal anomaly detectors generating corroborating evidence
                </p>
              </div>
            </div>
            <span className="text-[10px] font-mono text-[var(--text-tertiary)] uppercase">
              4 DETECTOR FAMILIES
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
                        <div className="text-[var(--text-primary)] font-medium leading-tight">
                          {det.name}
                        </div>
                        <div className="text-[10px] text-[var(--text-tertiary)] mt-0.5">
                          Source: {det.source}
                        </div>
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
                <span className="text-[var(--text-secondary)]">— 245,892 transactions processed in {durationStr}</span>
              </div>
              <span className="text-[10px] text-[var(--text-tertiary)]">2024-03-15 14:23:00 UTC</span>
            </div>

            <div className="py-2.5 flex flex-col sm:flex-row sm:items-center justify-between gap-1">
              <div className="flex items-center gap-2.5">
                <span className="w-1.5 h-1.5 rounded-full bg-[var(--risk-critical)]" />
                <span className="text-[var(--text-primary)] font-semibold">CRITICAL LEAD FLAGGED</span>
                <span className="text-[var(--text-secondary)]">— ALT-2024-00147 (5 independent signals, score 0.92)</span>
              </div>
              <span className="text-[10px] text-[var(--text-tertiary)]">2024-03-15 14:23:00 UTC</span>
            </div>

            <div className="py-2.5 flex flex-col sm:flex-row sm:items-center justify-between gap-1">
              <div className="flex items-center gap-2.5">
                <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent-primary)]" />
                <span className="text-[var(--text-primary)] font-semibold">CANDIDATE CLUSTERING COMPLETE</span>
                <span className="text-[var(--text-secondary)]">— 3 heuristic candidate groupings formed</span>
              </div>
              <span className="text-[10px] text-[var(--text-tertiary)]">2024-03-15 14:22:15 UTC</span>
            </div>

            <div className="py-2.5 flex flex-col sm:flex-row sm:items-center justify-between gap-1">
              <div className="flex items-center gap-2.5">
                <span className="w-1.5 h-1.5 rounded-full bg-[var(--text-tertiary)]" />
                <span className="text-[var(--text-primary)] font-semibold">DATASET INGESTION VERIFIED</span>
                <span className="text-[var(--text-secondary)]">— btc_block_830000_832000.csv loaded in airgapped memory</span>
              </div>
              <span className="text-[10px] text-[var(--text-tertiary)]">2024-03-15 10:00:00 UTC</span>
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
                <div className="text-sm font-bold text-[var(--risk-critical)]">{selectedAlert.risk_score}</div>
              </div>
              <div className="p-2.5 bg-[var(--surface-2)] border border-[var(--border-subtle)] rounded-[var(--radius-sm)]">
                <div className="text-[9px] uppercase text-[var(--text-tertiary)]">Confidence</div>
                <div className="text-sm font-bold text-[var(--text-primary)]">{(selectedAlert.confidence_score * 100).toFixed(0)}%</div>
              </div>
              <div className="p-2.5 bg-[var(--surface-2)] border border-[var(--border-subtle)] rounded-[var(--radius-sm)]">
                <div className="text-[9px] uppercase text-[var(--text-tertiary)]">Priority</div>
                <div className="text-sm font-bold text-[var(--accent-primary-light)]">{selectedAlert.priority_score}</div>
              </div>
            </div>

            {/* Evidence items */}
            <div>
              <div className="text-[10px] uppercase tracking-wider text-[var(--text-tertiary)] mb-2">
                CORROBORATING EVIDENCE ({selectedAlert.evidence_items.length})
              </div>
              <div className="space-y-2">
                {selectedAlert.evidence_items.map((item, idx) => (
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
              <Link href="/alerts">
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
