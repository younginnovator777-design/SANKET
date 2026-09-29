'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import {
  BarChart3,
  Cpu,
  Layers,
  Activity,
  Sliders,
  Sparkles,
  Download,
  Info,
  ShieldAlert,
  GitBranch,
  Network,
  Clock,
  Boxes,
  Database,
  CheckCircle2,
  AlertTriangle,
  FileCode,
  Check,
  ChevronRight,
} from 'lucide-react';
import { PageContainer } from '@/components/PageContainer';
import {
  MetricCard,
  Badge,
  Button,
  RiskBadge,
} from '@/components/ui';
import { mockRuns, mockAlerts, mockTransactions } from '@/data/mock';

export default function AnalyticsPage() {
  const activeRun = mockRuns[0];

  // Detector family inventories
  const detectorFamilies = [
    {
      family: 'STRUCTURAL DETECTORS',
      icon: GitBranch,
      description: 'Transaction-graph geometry, fan-in/fan-out dispersion, and peeling chain patterns.',
      detectors: [
        { name: 'Fan-Out Pattern', code: 'fan_out_pattern', triggers: 2, method: 'Graph Topology', desc: 'Identifies single-input to high-cardinality multi-output splitting.' },
        { name: 'Peel Chain Detection', code: 'peel_chain', triggers: 2, method: 'Lineage Decay', desc: 'Detects sequential change output peeling across consecutive hops.' },
        { name: 'Value Layering', code: 'value_layering', triggers: 2, method: 'Multi-hop Flow', desc: 'Identifies rapid value splitting matching structuring profiles.' },
        { name: 'Equal-Output Splitting', code: 'equal_output', triggers: 0, method: 'Statistical Heuristic', desc: 'Detects uniform amount output structuring.' },
        { name: 'Fan-In Concentration', code: 'fan_in_pattern', triggers: 0, method: 'Graph Aggregation', desc: 'Detects many-to-one address consolidation.' },
      ],
    },
    {
      family: 'TEMPORAL DETECTORS',
      icon: Clock,
      description: 'Transaction broadcast velocity, arrival intervals, and baseline temporal deviations.',
      detectors: [
        { name: 'Temporal Burst', code: 'temporal_burst', triggers: 2, method: 'Arrival Velocity', desc: 'Rapid succession of outputs exceeding cluster historical baseline.' },
        { name: 'Unusual Timing', code: 'unusual_timing', triggers: 1, method: 'Distribution Delta', desc: 'Timestamp divergence from address cluster normal hours.' },
        { name: 'Rapid Hop Cascade', code: 'rapid_hop', triggers: 1, method: 'Inter-Block Decay', desc: 'Multi-hop transfers occurring in adjacent block intervals.' },
        { name: 'Baseline Velocity Shift', code: 'baseline_deviation', triggers: 0, method: 'Moving Average', desc: 'Volume rate deviation vs 30-day baseline window.' },
      ],
    },
    {
      family: 'NETWORK TELEMETRY DETECTORS',
      icon: Network,
      description: 'Peer broadcast observations, autonomous system (ASN) routing, and network clustering.',
      detectors: [
        { name: 'Broadcast Node Divergence', code: 'broadcast_divergence', triggers: 1, method: 'Peer Telemetry', desc: 'First announcement captured via non-standard peer topology.' },
        { name: 'Autonomous System Clustering', code: 'asn_reuse', triggers: 1, method: 'BGP Routing', desc: 'Repeated transaction announcements through identical ASN transit.' },
        { name: 'IP Reuse Grouping', code: 'ip_reuse', triggers: 1, method: 'Telemetry Correlation', desc: 'Multiple distinct wallet broadcasts originating from same peer IP.' },
      ],
    },
    {
      family: 'UNSUPERVISED MACHINE LEARNING',
      icon: Cpu,
      description: 'Multivariate anomaly detection across 32 engineered feature dimensions.',
      detectors: [
        { name: 'Isolation Forest Anomaly', code: 'isolation_forest', triggers: 2, method: 'Tree Ensemble (Unsupervised)', desc: 'Multivariate outlier ranking without ground-truth labels.' },
      ],
    },
  ];

  // Feature groups
  const featureGroups = [
    { group: 'TRANSACTION ATTRIBUTES', count: 6, weight: '24%', desc: 'Amount (BTC), fee, fee rate, input count, output count, script type' },
    { group: 'TEMPORAL VELOCITY', count: 5, weight: '28%', desc: 'Inter-block interval, burst frequency, locktime delta, velocity variance' },
    { group: 'GRAPH TOPOLOGY', count: 7, weight: '26%', desc: 'In-degree, out-degree, peel hop depth, fan-out ratio, clustering coefficient' },
    { group: 'NETWORK OBSERVATIONS', count: 4, weight: '10%', desc: 'Broadcast peer count, ASN transit ID, propagation delay, peer entropy' },
    { group: 'CANDIDATE ENTITY', count: 5, weight: '8%', desc: 'Cluster size, co-spend probability, change address likelihood' },
    { group: 'DATA QUALITY AUDIT', count: 5, weight: '4%', desc: 'Schema conformance, byte completeness, timestamp monotonicity' },
  ];

  return (
    <PageContainer
      title="ANALYTICS"
      description="Detection signals, model behavior, and analytical coverage."
      tag="MODEL OBSERVABILITY"
      icon={<BarChart3 size={18} />}
      actions={
        <div className="flex items-center gap-2">
          <Button variant="secondary" size="sm">
            <Download size={13} />
            <span>Export Model Metrics</span>
          </Button>
        </div>
      }
    >
      <div className="space-y-6">
        {/* ── 1. Page Header Metadata Context ── */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 bg-[var(--surface-1)] border border-[var(--border-default)] rounded-[var(--radius-md)] text-xs font-mono">
          <div className="flex flex-wrap items-center gap-3">
            <div>
              <span className="text-[10px] uppercase text-[var(--text-tertiary)]">ACTIVE RUN:</span>{' '}
              <span className="font-semibold text-[var(--accent-primary-light)]">{activeRun.run_id}</span>
            </div>
            <span className="text-[var(--border-strong)]">|</span>
            <div>
              <span className="text-[10px] uppercase text-[var(--text-tertiary)]">DATASET:</span>{' '}
              <span className="text-[var(--text-primary)] font-medium">{activeRun.dataset_name}</span>
            </div>
            <span className="text-[var(--border-strong)]">|</span>
            <div>
              <span className="text-[10px] uppercase text-[var(--text-tertiary)]">STATUS:</span>{' '}
              <span className="text-[var(--text-secondary)]">COMPLETED ({activeRun.scoring_version})</span>
            </div>
          </div>

          <div className="flex items-center gap-2 text-[11px] text-[var(--text-secondary)]">
            <span className="w-1.5 h-1.5 rounded-full bg-[var(--risk-low)]" />
            <span className="uppercase tracking-wider">AIRGAPPED / OFFLINE</span>
          </div>
        </div>

        {/* ── 2. Prominent Model Overview Panel: Isolation Forest ── */}
        <div className="p-5 bg-[var(--surface-1)] border border-[var(--border-default)] rounded-[var(--radius-md)] space-y-4 font-mono text-xs">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-[var(--border-subtle)]">
            <div className="flex items-center gap-3">
              <div className="flex items-center justify-center w-8 h-8 rounded-[var(--radius-sm)] bg-[var(--surface-2)] border border-[var(--border-default)] text-[var(--accent-primary)]">
                <Cpu size={18} />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-bold text-sm text-[var(--text-primary)]">
                    ISOLATION FOREST MODEL OVERVIEW
                  </span>
                  <span className="text-[9px] uppercase px-1.5 py-0.2 rounded-xs bg-[var(--surface-3)] text-[var(--accent-primary-light)] border border-[var(--border-subtle)]">
                    Unsupervised Anomaly Detection
                  </span>
                </div>
                <p className="text-[11px] text-[var(--text-tertiary)] mt-0.5 font-sans">
                  Multivariate decision tree partition ensemble identifying structural outliers in high-dimensional feature space.
                </p>
              </div>
            </div>
            <Badge variant="accent">v2.1.0 RUNTIME</Badge>
          </div>

          {/* Model Attributes Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            <div className="p-3 bg-[var(--surface-2)] border border-[var(--border-subtle)] rounded-[var(--radius-sm)]">
              <span className="text-[10px] uppercase text-[var(--text-tertiary)] block">ESTIMATOR TREES</span>
              <span className="text-sm font-bold text-[var(--text-primary)] mt-1 block">200 trees</span>
              <span className="text-[9px] text-[var(--text-tertiary)]">Ensemble size</span>
            </div>
            <div className="p-3 bg-[var(--surface-2)] border border-[var(--border-subtle)] rounded-[var(--radius-sm)]">
              <span className="text-[10px] uppercase text-[var(--text-tertiary)] block">CONTAMINATION</span>
              <span className="text-sm font-bold text-[var(--accent-primary-light)] mt-1 block">0.01 (1.0%)</span>
              <span className="text-[9px] text-[var(--text-tertiary)]">Expected outlier fraction</span>
            </div>
            <div className="p-3 bg-[var(--surface-2)] border border-[var(--border-subtle)] rounded-[var(--radius-sm)]">
              <span className="text-[10px] uppercase text-[var(--text-tertiary)] block">FEATURE SPACE</span>
              <span className="text-sm font-bold text-[var(--text-primary)] mt-1 block">32 Dimensions</span>
              <span className="text-[9px] text-[var(--text-tertiary)]">Engineered vectors</span>
            </div>
            <div className="p-3 bg-[var(--surface-2)] border border-[var(--border-subtle)] rounded-[var(--radius-sm)]">
              <span className="text-[10px] uppercase text-[var(--text-tertiary)] block">RANDOM SEED</span>
              <span className="text-sm font-bold text-[var(--text-secondary)] mt-1 block">42 (Deterministic)</span>
              <span className="text-[9px] text-[var(--text-tertiary)]">Reproducible output</span>
            </div>
            <div className="p-3 bg-[var(--surface-2)] border border-[var(--border-subtle)] rounded-[var(--radius-sm)]">
              <span className="text-[10px] uppercase text-[var(--text-tertiary)] block">ANOMALY MEAN</span>
              <span className="text-sm font-bold text-[var(--text-primary)] mt-1 block">0.142</span>
              <span className="text-[9px] text-[var(--text-tertiary)]">Baseline score</span>
            </div>
            <div className="p-3 bg-[var(--surface-2)] border border-[var(--border-subtle)] rounded-[var(--radius-sm)]">
              <span className="text-[10px] uppercase text-[var(--text-tertiary)] block">CALIBRATION</span>
              <span className="text-sm font-bold text-[var(--risk-low)] mt-1 block">Calibrated</span>
              <span className="text-[9px] text-[var(--text-tertiary)]">Zero label reliance</span>
            </div>
          </div>

          <div className="p-3 bg-[var(--surface-2)] border border-[var(--border-subtle)] rounded-[var(--radius-sm)] text-[11px] text-[var(--text-secondary)] leading-relaxed font-sans flex items-start gap-2.5">
            <Info size={16} className="text-[var(--accent-primary-light)] shrink-0 mt-0.5" />
            <span>
              <strong>Methodological Note:</strong> SANKET employs unsupervised isolation mechanisms. The model isolates anomalies based on partition depth rather than supervised classification labels. It does not output predictive criminal certainty.
            </span>
          </div>
        </div>

        {/* ── 3. Detector Families Inventory ── */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xs font-mono font-bold uppercase tracking-wider text-[var(--text-primary)]">
                DETECTOR FAMILIES & ACTIVE SIGNALS
              </h2>
              <p className="text-[11px] text-[var(--text-tertiary)] mt-0.5">
                Multi-signal detection architecture across structural, temporal, network, and ML domains.
              </p>
            </div>
            <span className="text-xs font-mono text-[var(--text-tertiary)]">
              13 REGISTERED DETECTORS
            </span>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {detectorFamilies.map((family, idx) => {
              const FamilyIcon = family.icon;
              return (
                <div
                  key={idx}
                  className="p-4 bg-[var(--surface-1)] border border-[var(--border-default)] rounded-[var(--radius-md)] space-y-3 font-mono text-xs"
                >
                  <div className="flex items-start justify-between gap-3 pb-2.5 border-b border-[var(--border-subtle)]">
                    <div className="flex items-center gap-2">
                      <FamilyIcon size={16} className="text-[var(--accent-primary)] shrink-0" />
                      <div>
                        <div className="font-bold text-xs text-[var(--text-primary)]">
                          {family.family}
                        </div>
                        <p className="text-[10px] text-[var(--text-tertiary)] font-sans mt-0.5">
                          {family.description}
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-2">
                    {family.detectors.map((det, dIdx) => (
                      <div
                        key={dIdx}
                        className="p-2.5 bg-[var(--surface-2)] border border-[var(--border-subtle)] rounded-[var(--radius-sm)] flex items-start justify-between gap-3"
                      >
                        <div className="space-y-0.5">
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-[11px] text-[var(--text-primary)]">
                              {det.name}
                            </span>
                            <span className="text-[9px] px-1 py-0.2 rounded-xs bg-[var(--surface-3)] text-[var(--text-tertiary)]">
                              {det.method}
                            </span>
                          </div>
                          <p className="text-[10px] text-[var(--text-secondary)] font-sans">
                            {det.desc}
                          </p>
                        </div>
                        <div className="text-right shrink-0">
                          <span
                            className={`text-xs font-bold ${
                              det.triggers > 0 ? 'text-[var(--accent-primary-light)]' : 'text-[var(--text-muted)]'
                            }`}
                          >
                            {det.triggers} {det.triggers === 1 ? 'lead' : 'leads'}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* ── 4. Feature Taxonomy & Score Component Breakdown ── */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Feature Groups */}
          <div className="lg:col-span-6 bg-[var(--surface-1)] border border-[var(--border-default)] rounded-[var(--radius-md)] p-5 space-y-4 font-mono text-xs">
            <div className="flex items-center justify-between pb-3 border-b border-[var(--border-subtle)]">
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--text-primary)]">
                  ENGINEERED FEATURE TAXONOMY
                </h3>
                <p className="text-[11px] text-[var(--text-tertiary)] mt-0.5 font-sans">
                  32 dimensional feature space evaluated per transaction
                </p>
              </div>
              <Badge variant="default">32 FEATURES</Badge>
            </div>

            <div className="space-y-3">
              {featureGroups.map((feat, i) => (
                <div key={i} className="space-y-1">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="font-semibold text-[var(--text-primary)]">{feat.group} ({feat.count})</span>
                    <span className="text-[var(--accent-primary-light)] font-bold">{feat.weight} weight</span>
                  </div>
                  <div className="w-full h-1.5 bg-[var(--surface-3)] rounded-full overflow-hidden">
                    <div
                      className="h-full bg-[var(--accent-primary)] rounded-full"
                      style={{ width: feat.weight }}
                    />
                  </div>
                  <span className="text-[9px] text-[var(--text-tertiary)] block font-sans truncate">
                    {feat.desc}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Component Risk Breakdown & Data Quality */}
          <div className="lg:col-span-6 space-y-4 font-mono text-xs">
            {/* Component Risk Scoring */}
            <div className="bg-[var(--surface-1)] border border-[var(--border-default)] rounded-[var(--radius-md)] p-5 space-y-3">
              <div className="flex items-center justify-between pb-2 border-b border-[var(--border-subtle)]">
                <div>
                  <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--text-primary)]">
                    SCORING FUSION COMPONENTS
                  </h3>
                  <p className="text-[11px] text-[var(--text-tertiary)] mt-0.5 font-sans">
                    Observed component contribution in active priority leads
                  </p>
                </div>
                <span className="text-[10px] text-[var(--text-tertiary)]">SCORING v2.1.0</span>
              </div>

              <div className="space-y-2.5">
                <div>
                  <div className="flex items-center justify-between text-[11px] mb-1">
                    <span className="text-[var(--text-primary)]">MULTIVARIATE (ML / Isolation Forest)</span>
                    <span className="font-bold text-[var(--text-primary)]">0.82</span>
                  </div>
                  <div className="w-full h-1.5 bg-[var(--surface-3)] rounded-full overflow-hidden">
                    <div className="h-full bg-[var(--accent-primary)] rounded-full" style={{ width: '82%' }} />
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between text-[11px] mb-1">
                    <span className="text-[var(--text-primary)]">GRAPH / STRUCTURAL (Peel, Fan-out)</span>
                    <span className="font-bold text-[var(--text-primary)]">0.78</span>
                  </div>
                  <div className="w-full h-1.5 bg-[var(--surface-3)] rounded-full overflow-hidden">
                    <div className="h-full bg-[var(--accent-primary)] rounded-full" style={{ width: '78%' }} />
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between text-[11px] mb-1">
                    <span className="text-[var(--text-primary)]">TEMPORAL DYNAMICS (Velocity Burst)</span>
                    <span className="font-bold text-[var(--text-primary)]">0.71</span>
                  </div>
                  <div className="w-full h-1.5 bg-[var(--surface-3)] rounded-full overflow-hidden">
                    <div className="h-full bg-[var(--accent-primary)] rounded-full" style={{ width: '71%' }} />
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between text-[11px] mb-1">
                    <span className="text-[var(--text-primary)]">NETWORK TELEMETRY (Peer Propagation)</span>
                    <span className="font-bold text-[var(--text-primary)]">0.54</span>
                  </div>
                  <div className="w-full h-1.5 bg-[var(--surface-3)] rounded-full overflow-hidden">
                    <div className="h-full bg-[var(--accent-primary)] rounded-full" style={{ width: '54%' }} />
                  </div>
                </div>
              </div>
            </div>

            {/* Ingestion Data Quality Audit */}
            <div className="bg-[var(--surface-1)] border border-[var(--border-default)] rounded-[var(--radius-md)] p-5 space-y-3">
              <div className="flex items-center justify-between pb-2 border-b border-[var(--border-subtle)]">
                <div className="flex items-center gap-2">
                  <Database size={15} className="text-[var(--accent-primary)]" />
                  <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--text-primary)]">
                    INGESTION DATA QUALITY AUDIT
                  </h3>
                </div>
                <span className="text-[10px] text-[var(--risk-low)] font-bold">100% VALIDATED</span>
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <div className="p-2.5 bg-[var(--surface-2)] border border-[var(--border-subtle)] rounded-[var(--radius-xs)]">
                  <span className="text-[9px] uppercase text-[var(--text-tertiary)] block">DATA COMPLETENESS</span>
                  <span className="text-sm font-bold text-[var(--text-primary)] mt-0.5 block">99.98%</span>
                </div>
                <div className="p-2.5 bg-[var(--surface-2)] border border-[var(--border-subtle)] rounded-[var(--radius-xs)]">
                  <span className="text-[9px] uppercase text-[var(--text-tertiary)] block">SCHEMA CONFORMANCE</span>
                  <span className="text-sm font-bold text-[var(--text-primary)] mt-0.5 block">100.0%</span>
                </div>
                <div className="p-2.5 bg-[var(--surface-2)] border border-[var(--border-subtle)] rounded-[var(--radius-xs)]">
                  <span className="text-[9px] uppercase text-[var(--text-tertiary)] block">MISSING VALUES</span>
                  <span className="text-sm font-bold text-[var(--text-secondary)] mt-0.5 block">0.02% (Non-fatal)</span>
                </div>
                <div className="p-2.5 bg-[var(--surface-2)] border border-[var(--border-subtle)] rounded-[var(--radius-xs)]">
                  <span className="text-[9px] uppercase text-[var(--text-tertiary)] block">QUARANTINED ROWS</span>
                  <span className="text-sm font-bold text-[var(--risk-low)] mt-0.5 block">0 rows</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ── 5. Technical Notes: Detection Architecture ── */}
        <div className="p-5 bg-[var(--surface-1)] border border-[var(--border-default)] rounded-[var(--radius-md)] space-y-3 font-mono text-xs">
          <div className="flex items-center gap-2 pb-2.5 border-b border-[var(--border-subtle)]">
            <FileCode size={16} className="text-[var(--accent-primary)]" />
            <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--text-primary)]">
              DETECTION ARCHITECTURE SPECIFICATION
            </h3>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 pt-1">
            <div className="p-3 bg-[var(--surface-2)] border border-[var(--border-subtle)] rounded-[var(--radius-sm)] space-y-1">
              <span className="text-[10px] font-bold text-[var(--accent-primary-light)] uppercase block">1. FEATURE ENGINEERING</span>
              <p className="text-[10px] text-[var(--text-secondary)] font-sans leading-relaxed">
                Extracts transaction, temporal, network, entity, and graph signals into 32 dimensional vectors.
              </p>
            </div>

            <div className="p-3 bg-[var(--surface-2)] border border-[var(--border-subtle)] rounded-[var(--radius-sm)] space-y-1">
              <span className="text-[10px] font-bold text-[var(--accent-primary-light)] uppercase block">2. HEURISTIC DETECTORS</span>
              <p className="text-[10px] text-[var(--text-secondary)] font-sans leading-relaxed">
                Evaluates rule-based structural (peel, fan-out), temporal (burst), and network (IP) patterns.
              </p>
            </div>

            <div className="p-3 bg-[var(--surface-2)] border border-[var(--border-subtle)] rounded-[var(--radius-sm)] space-y-1">
              <span className="text-[10px] font-bold text-[var(--accent-primary-light)] uppercase block">3. ML DETECTOR</span>
              <p className="text-[10px] text-[var(--text-secondary)] font-sans leading-relaxed">
                Isolation Forest provides multivariate outlier scoring without requiring historical labels.
              </p>
            </div>

            <div className="p-3 bg-[var(--surface-2)] border border-[var(--border-subtle)] rounded-[var(--radius-sm)] space-y-1">
              <span className="text-[10px] font-bold text-[var(--accent-primary-light)] uppercase block">4. SIGNAL FUSION</span>
              <p className="text-[10px] text-[var(--text-secondary)] font-sans leading-relaxed">
                Combines independent signals and weights into an explainable composite risk score.
              </p>
            </div>

            <div className="p-3 bg-[var(--surface-2)] border border-[var(--border-subtle)] rounded-[var(--radius-sm)] space-y-1">
              <span className="text-[10px] font-bold text-[var(--accent-primary-light)] uppercase block">5. CONFIDENCE RATING</span>
              <p className="text-[10px] text-[var(--text-secondary)] font-sans leading-relaxed">
                Evaluates evidence agreement and data completeness separately from risk intensity.
              </p>
            </div>
          </div>
        </div>
      </div>
    </PageContainer>
  );
}

