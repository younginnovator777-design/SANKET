'use client';

import React, { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import {
  Upload,
  FileCode,
  CheckCircle2,
  Cpu,
  Database,
  ArrowRight,
  SlidersHorizontal,
  Play,
  RotateCcw,
  AlertTriangle,
  FileText,
  Check,
  Layers,
  ChevronRight,
  Info,
  ShieldCheck,
  ExternalLink,
} from 'lucide-react';
import { PageContainer } from '@/components/PageContainer';
import {
  Button,
  Card,
  Badge,
  SectionHeader,
  StatusBadge,
  EmptyState,
} from '@/components/ui';
import { mockRuns, mockAlerts, mockCandidateEntities } from '@/data/mock';

type PipelineStatus = 'empty' | 'preview' | 'running' | 'completed' | 'error';

interface StageConfig {
  id: string;
  name: string;
  desc: string;
  duration: string;
  rows: string;
  output: string;
}

const STAGES: StageConfig[] = [
  {
    id: 'INGEST',
    name: '01 INGEST',
    desc: 'Reading raw transaction stream into airgapped memory buffer.',
    duration: '1.2s',
    rows: '245,892 TXs',
    output: 'Memory Buffer',
  },
  {
    id: 'CANONICALIZE',
    name: '02 CANONICALIZE',
    desc: 'Normalizing inputs, outputs, fee rates, and timestamps into canonical schema.',
    duration: '2.4s',
    rows: '245,892 TXs',
    output: 'Canonical Table',
  },
  {
    id: 'EXTRACT_FEATURES',
    name: '03 FEATURE EXTRACTION',
    desc: 'Computing transaction, temporal, network, entity and graph features.',
    duration: '4.8s',
    rows: '32 Feature Dims',
    output: 'Feature Vectors',
  },
  {
    id: 'DETECT',
    name: '04 DETECTION',
    desc: 'Executing multi-family detector engines and unsupervised Isolation Forest.',
    duration: '3.1s',
    rows: '6 Detectors',
    output: 'Signal Matrix',
  },
  {
    id: 'CORRELATE',
    name: '05 CORRELATION',
    desc: 'Correlating multi-source temporal and network signals across sliding windows.',
    duration: '2.0s',
    rows: '18 Bursts',
    output: 'Signal Clusters',
  },
  {
    id: 'SCORE',
    name: '06 RISK SCORING',
    desc: 'Calculating composite multi-detector risk indices and confidence intervals.',
    duration: '1.5s',
    rows: '245,892 Scored',
    output: 'Ranked Priority',
  },
  {
    id: 'BUILD_GRAPH',
    name: '07 GRAPH BUILD',
    desc: 'Constructing transaction adjacency matrix and candidate entity clusters.',
    duration: '2.2s',
    rows: '7 Nodes / 7 Edges',
    output: 'Topology Index',
  },
  {
    id: 'GENERATE_LEADS',
    name: '08 INVESTIGATIVE LEADS',
    desc: 'Generating prioritized, ranked lead case files for investigative review.',
    duration: '0.8s',
    rows: '147 Alerts',
    output: 'Lead Dossiers',
  },
];

const CANONICAL_SCHEMA_FIELDS = [
  'timestamp',
  'src_ip',
  'dst_ip',
  'src_port',
  'dst_port',
  'txid',
  'input_addresses[]',
  'output_addresses[]',
  'input_amounts[]',
  'output_amounts[]',
  'geo_country',
  'asn',
];

export default function AnalyzePage() {
  const [format, setFormat] = useState<'CSV' | 'JSON' | 'XML'>('CSV');
  const [pipelineStatus, setPipelineStatus] = useState<PipelineStatus>('preview');
  const [currentRunningIndex, setCurrentRunningIndex] = useState<number>(7); // 0 to 7
  const [selectedStageIndex, setSelectedStageIndex] = useState<number>(2);

  // Active run data for summary numbers
  const activeRun = mockRuns[0];

  // Pipeline simulation timer
  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (pipelineStatus === 'running') {
      if (currentRunningIndex < STAGES.length - 1) {
        timer = setTimeout(() => {
          setCurrentRunningIndex((prev) => prev + 1);
        }, 650);
      } else {
        timer = setTimeout(() => {
          setPipelineStatus('completed');
        }, 650);
      }
    }
    return () => clearTimeout(timer);
  }, [pipelineStatus, currentRunningIndex]);

  const handleStartAnalysis = () => {
    setCurrentRunningIndex(0);
    setPipelineStatus('running');
  };

  const handleReset = () => {
    setPipelineStatus('empty');
    setCurrentRunningIndex(0);
  };

  const handleLoadSample = () => {
    setPipelineStatus('preview');
  };

  return (
    <PageContainer
      title="ANALYZE"
      description="Run offline transaction and network intelligence analysis."
      tag="OFFLINE PIPELINE"
      icon={<Upload size={18} />}
      actions={
        <div className="flex items-center gap-2">
          {pipelineStatus === 'empty' && (
            <Button variant="accent" size="sm" onClick={handleLoadSample}>
              <span>Load Sample Dataset</span>
            </Button>
          )}

          {pipelineStatus === 'preview' && (
            <Button variant="accent" size="sm" onClick={handleStartAnalysis}>
              <Play size={13} />
              <span>Start Offline Pipeline</span>
            </Button>
          )}

          {pipelineStatus === 'completed' && (
            <>
              <Button variant="secondary" size="sm" onClick={handleReset}>
                <RotateCcw size={13} />
                <span>Reset Ingestion</span>
              </Button>
              <Link href="/alerts">
                <Button variant="accent" size="sm">
                  <span>View Investigative Leads ({mockAlerts.length})</span>
                  <ArrowRight size={13} />
                </Button>
              </Link>
            </>
          )}

          {pipelineStatus === 'error' && (
            <Button variant="accent" size="sm" onClick={handleStartAnalysis}>
              <RotateCcw size={13} />
              <span>Retry Pipeline</span>
            </Button>
          )}
        </div>
      }
    >
      <div className="space-y-6">
        {/* ── 1. Page Header Context Strip ── */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 bg-[var(--surface-1)] border border-[var(--border-default)] rounded-[var(--radius-md)] text-xs font-mono">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] uppercase text-[var(--text-tertiary)]">CURRENT RUN:</span>
              <span className="font-semibold text-[var(--accent-primary-light)]">{activeRun.run_id}</span>
            </div>
            <span className="text-[var(--border-strong)]">|</span>
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] uppercase text-[var(--text-tertiary)]">DATASET STATUS:</span>
              <span className="text-[var(--text-primary)] font-medium">
                {pipelineStatus === 'empty' ? 'NO DATASET' : 'LOADED & VALIDATED'}
              </span>
            </div>
            <span className="text-[var(--border-strong)]">|</span>
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] uppercase text-[var(--text-tertiary)]">TARGET SCHEMA:</span>
              <span className="text-[var(--text-secondary)]">Bitcoin Core v26 Canonical</span>
            </div>
          </div>

          <div className="flex items-center gap-2 text-[11px] text-[var(--text-secondary)]">
            <span className="w-1.5 h-1.5 rounded-full bg-[var(--risk-low)]" />
            <span className="uppercase tracking-wider">OFFLINE MODE</span>
          </div>
        </div>

        {/* ── 2. STATE: EMPTY (NO DATASET LOADED) ── */}
        {pipelineStatus === 'empty' && (
          <div className="bg-[var(--surface-1)] border border-[var(--border-default)] rounded-[var(--radius-md)] p-8">
            <EmptyState
              title="NO DATASET LOADED"
              description="Upload a CSV, JSON, or XML transaction dataset to begin offline analysis."
              icon={<FileCode size={22} className="text-[var(--accent-primary)]" />}
              action={
                <div className="flex flex-col sm:flex-row items-center gap-3">
                  <Button variant="accent" size="md" onClick={handleLoadSample}>
                    <Upload size={14} />
                    <span>Select Dataset File</span>
                  </Button>
                  <Button variant="secondary" size="md" onClick={handleLoadSample}>
                    <span>Load Synthetic 100K Sample</span>
                  </Button>
                </div>
              }
            />

            {/* Ingestion Info Strip */}
            <div className="mt-8 pt-6 border-t border-[var(--border-subtle)] grid grid-cols-1 md:grid-cols-3 gap-4 text-xs font-mono text-[var(--text-secondary)]">
              <div className="p-3 bg-[var(--surface-2)] border border-[var(--border-subtle)] rounded-[var(--radius-sm)]">
                <span className="text-[10px] uppercase text-[var(--text-tertiary)] block mb-1">SUPPORTED FORMATS</span>
                <span className="text-[var(--text-primary)] font-medium">CSV · JSON · XML</span>
              </div>
              <div className="p-3 bg-[var(--surface-2)] border border-[var(--border-subtle)] rounded-[var(--radius-sm)]">
                <span className="text-[10px] uppercase text-[var(--text-tertiary)] block mb-1">EXECUTION GUARANTEE</span>
                <span className="text-[var(--risk-low)] font-medium">100% Airgapped Local Memory</span>
              </div>
              <div className="p-3 bg-[var(--surface-2)] border border-[var(--border-subtle)] rounded-[var(--radius-sm)]">
                <span className="text-[10px] uppercase text-[var(--text-tertiary)] block mb-1">SCHEMA AUTO-DETECTION</span>
                <span className="text-[var(--accent-primary-light)] font-medium">Automatic Field Normalizer</span>
              </div>
            </div>
          </div>
        )}

        {/* ── 3. STATE: ERROR STATE ── */}
        {pipelineStatus === 'error' && (
          <div className="bg-[var(--surface-1)] border border-[var(--risk-critical-border)] rounded-[var(--radius-md)] p-6 space-y-4">
            <div className="flex items-start gap-3">
              <div className="w-9 h-9 rounded-[var(--radius-sm)] bg-[var(--risk-critical-bg)] border border-[var(--risk-critical-border)] flex items-center justify-center text-[var(--risk-critical)] shrink-0">
                <AlertTriangle size={18} />
              </div>
              <div>
                <h3 className="text-xs font-mono font-bold uppercase tracking-[0.1em] text-[var(--risk-critical)]">
                  ANALYSIS INTERRUPTED
                </h3>
                <p className="text-xs text-[var(--text-secondary)] mt-1">
                  The dataset could not be processed completely. Pipeline stopped at stage: <span className="font-mono text-[var(--text-primary)] font-semibold">03 FEATURE EXTRACTION</span>.
                </p>
              </div>
            </div>

            <div className="p-3.5 bg-[var(--surface-2)] border border-[var(--border-subtle)] rounded-[var(--radius-sm)] font-mono text-xs text-[var(--text-secondary)]">
              <div className="text-[10px] uppercase text-[var(--text-tertiary)] mb-1">DIAGNOSTIC STATUS</div>
              <p>In-memory buffer overflow during high-fanout vector construction. Retry with increased memory limits in Settings or reduce batch size.</p>
            </div>

            <div className="flex items-center gap-3 pt-2">
              <Button variant="accent" size="sm" onClick={handleStartAnalysis}>
                <RotateCcw size={13} />
                <span>Retry Pipeline Execution</span>
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setPipelineStatus('preview')}>
                <span>Return to Dataset Preview</span>
              </Button>
            </div>
          </div>
        )}

        {/* ── 4. STATE: PREVIEW & VALIDATION (OR RUNNING/COMPLETED) ── */}
        {pipelineStatus !== 'empty' && pipelineStatus !== 'error' && (
          <>
            {/* Upload Area & Dataset Preview Row */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              {/* Ingest Console / Dropzone */}
              <div className="lg:col-span-7 bg-[var(--surface-1)] border border-[var(--border-default)] rounded-[var(--radius-md)] p-5">
                <div className="flex items-center justify-between pb-3 mb-4 border-b border-[var(--border-subtle)]">
                  <div>
                    <h2 className="text-xs font-mono font-semibold uppercase tracking-[0.1em] text-[var(--text-primary)]">
                      Dataset Ingestion Console
                    </h2>
                    <p className="text-[11px] text-[var(--text-tertiary)] mt-0.5">
                      Airgapped local file reader. No data leaves this workstation.
                    </p>
                  </div>
                  <div className="flex items-center gap-1">
                    {(['CSV', 'JSON', 'XML'] as const).map((fmt) => (
                      <button
                        key={fmt}
                        onClick={() => setFormat(fmt)}
                        className={`
                          px-2 py-0.5 text-[10px] font-mono uppercase tracking-wider rounded-[var(--radius-sm)] border
                          transition-colors cursor-pointer
                          ${format === fmt
                            ? 'bg-[var(--accent-primary-subtle)] text-[var(--accent-primary-light)] border-[var(--accent-primary-border)]'
                            : 'bg-[var(--surface-2)] text-[var(--text-tertiary)] border-[var(--border-subtle)] hover:text-[var(--text-secondary)]'
                          }
                        `}
                      >
                        {fmt}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Dropzone Container */}
                <div className="border border-dashed border-[var(--border-strong)] rounded-[var(--radius-md)] p-6 text-center bg-[var(--surface-2)] hover:border-[var(--accent-primary-border)] transition-colors flex flex-col items-center justify-center gap-2.5">
                  <div className="w-9 h-9 rounded-[var(--radius-sm)] bg-[var(--surface-3)] border border-[var(--border-default)] flex items-center justify-center text-[var(--accent-primary-light)]">
                    <FileCode size={16} />
                  </div>
                  <div>
                    <p className="text-xs font-mono font-semibold text-[var(--text-primary)]">
                      Drop a transaction/network dataset here
                    </p>
                    <p className="text-[11px] font-mono text-[var(--text-tertiary)] mt-0.5">
                      Supported formats: CSV, JSON, XML
                    </p>
                  </div>
                  <div className="flex items-center gap-2 mt-1">
                    <Button variant="primary" size="sm">
                      <span>Browse Local Files</span>
                    </Button>
                    <Button variant="ghost" size="sm" onClick={handleReset}>
                      <span>Clear</span>
                    </Button>
                  </div>
                </div>

                {/* Canonical Schema Detected Fields */}
                <div className="mt-4 pt-3.5 border-t border-[var(--border-subtle)]">
                  <div className="text-[10px] font-mono uppercase tracking-wider text-[var(--text-tertiary)] mb-2">
                    CANONICAL SCHEMA FIELDS DETECTED ({CANONICAL_SCHEMA_FIELDS.length})
                  </div>
                  <div className="flex flex-wrap gap-1.5 font-mono text-[10px]">
                    {CANONICAL_SCHEMA_FIELDS.map((field) => (
                      <span
                        key={field}
                        className="px-2 py-0.5 rounded-[var(--radius-sm)] bg-[var(--surface-3)] text-[var(--text-secondary)] border border-[var(--border-subtle)]"
                      >
                        {field}
                      </span>
                    ))}
                  </div>
                </div>
              </div>

              {/* Dataset Metadata & Validation Panel */}
              <div className="lg:col-span-5 bg-[var(--surface-1)] border border-[var(--border-default)] rounded-[var(--radius-md)] p-5 flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between pb-3 mb-4 border-b border-[var(--border-subtle)]">
                    <div>
                      <h2 className="text-xs font-mono font-semibold uppercase tracking-[0.1em] text-[var(--text-primary)]">
                        Loaded Dataset Preview
                      </h2>
                      <p className="text-[11px] text-[var(--text-tertiary)] mt-0.5">
                        Extracted header metrics
                      </p>
                    </div>
                    <Badge variant="accent">VALIDATED</Badge>
                  </div>

                  <div className="space-y-2.5 font-mono text-xs">
                    <div className="flex items-center justify-between p-2 rounded-[var(--radius-sm)] bg-[var(--surface-2)] border border-[var(--border-subtle)]">
                      <span className="text-[10px] text-[var(--text-tertiary)] uppercase">File Name</span>
                      <span className="text-[var(--text-primary)] font-medium">btc_block_830000_832000.csv</span>
                    </div>
                    <div className="flex items-center justify-between p-2 rounded-[var(--radius-sm)] bg-[var(--surface-2)] border border-[var(--border-subtle)]">
                      <span className="text-[10px] text-[var(--text-tertiary)] uppercase">File Type / Size</span>
                      <span className="text-[var(--text-secondary)]">CSV / 142.4 MB</span>
                    </div>
                    <div className="flex items-center justify-between p-2 rounded-[var(--radius-sm)] bg-[var(--surface-2)] border border-[var(--border-subtle)]">
                      <span className="text-[10px] text-[var(--text-tertiary)] uppercase">Row Count</span>
                      <span className="text-[var(--text-primary)] font-semibold">245,892 transactions</span>
                    </div>
                    <div className="flex items-center justify-between p-2 rounded-[var(--radius-sm)] bg-[var(--surface-2)] border border-[var(--border-subtle)]">
                      <span className="text-[10px] text-[var(--text-tertiary)] uppercase">Detected Schema</span>
                      <span className="text-[var(--accent-primary-light)]">BTC Core Canonical v26</span>
                    </div>
                  </div>

                  {/* Schema Validation Section */}
                  <div className="mt-4 pt-3.5 border-t border-[var(--border-subtle)]">
                    <div className="text-[10px] font-mono uppercase tracking-wider text-[var(--text-tertiary)] mb-2">
                      SCHEMA VALIDATION VERIFICATION
                    </div>
                    <div className="space-y-1.5 font-mono text-xs">
                      <div className="flex items-center gap-2 text-[var(--text-secondary)]">
                        <Check size={13} className="text-[var(--risk-low)] shrink-0" />
                        <span>Required canonical fields detected</span>
                      </div>
                      <div className="flex items-center gap-2 text-[var(--text-secondary)]">
                        <Check size={13} className="text-[var(--risk-low)] shrink-0" />
                        <span>Transaction graph structure valid</span>
                      </div>
                      <div className="flex items-center gap-2 text-[var(--text-secondary)]">
                        <Check size={13} className="text-[var(--risk-low)] shrink-0" />
                        <span>Network metadata detected (IP/ASN)</span>
                      </div>
                      <div className="flex items-center gap-2 text-[var(--text-secondary)]">
                        <Check size={13} className="text-[var(--risk-low)] shrink-0" />
                        <span>Data types normalized & airgap sanitized</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Bottom Action if still in preview */}
                {pipelineStatus === 'preview' && (
                  <div className="pt-4 mt-4 border-t border-[var(--border-subtle)]">
                    <Button
                      variant="accent"
                      className="w-full justify-center"
                      onClick={handleStartAnalysis}
                    >
                      <Play size={14} />
                      <span>Start Offline Analysis Pipeline</span>
                    </Button>
                  </div>
                )}
              </div>
            </div>

            {/* ── 5. PIPELINE EXECUTION STAGES (Horizontal Multi-Stage) ── */}
            <div className="bg-[var(--surface-1)] border border-[var(--border-default)] rounded-[var(--radius-md)] p-5 space-y-5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-[var(--border-subtle)]">
                <div className="flex items-center gap-2">
                  <Cpu size={15} className="text-[var(--accent-primary)]" />
                  <div>
                    <h2 className="text-xs font-mono font-semibold uppercase tracking-[0.1em] text-[var(--text-primary)]">
                      Offline Analysis Pipeline Execution
                    </h2>
                    <p className="text-[11px] text-[var(--text-tertiary)] mt-0.5">
                      Deterministic multi-stage anomaly detection and lead generation engine
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {pipelineStatus === 'running' ? (
                    <StatusBadge status="processing" />
                  ) : pipelineStatus === 'completed' ? (
                    <StatusBadge status="completed" />
                  ) : (
                    <StatusBadge status="queued" />
                  )}
                </div>
              </div>

              {/* Active Stage Banner (when running) */}
              {pipelineStatus === 'running' && (
                <div className="p-3.5 bg-[var(--surface-2)] border border-[var(--accent-primary-border)] rounded-[var(--radius-sm)] flex items-start justify-between gap-4 animate-pulse">
                  <div>
                    <div className="text-[10px] font-mono uppercase text-[var(--accent-primary-light)] font-bold mb-0.5">
                      CURRENT STAGE: {STAGES[currentRunningIndex].name}
                    </div>
                    <p className="text-xs font-mono text-[var(--text-primary)]">
                      {STAGES[currentRunningIndex].desc}
                    </p>
                  </div>
                  <span className="text-[10px] font-mono text-[var(--accent-primary-light)] shrink-0">
                    STAGE {currentRunningIndex + 1} OF 8
                  </span>
                </div>
              )}

              {/* 8-Stage Progression Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2">
                {STAGES.map((stage, idx) => {
                  let stageState: 'completed' | 'running' | 'pending' = 'pending';
                  if (pipelineStatus === 'completed') {
                    stageState = 'completed';
                  } else if (pipelineStatus === 'running') {
                    if (idx < currentRunningIndex) stageState = 'completed';
                    else if (idx === currentRunningIndex) stageState = 'running';
                    else stageState = 'pending';
                  } else if (pipelineStatus === 'preview') {
                    stageState = 'pending';
                  }

                  const isSelected = selectedStageIndex === idx;

                  return (
                    <div
                      key={stage.id}
                      onClick={() => setSelectedStageIndex(idx)}
                      className={`
                        p-3 bg-[var(--surface-2)] border rounded-[var(--radius-sm)]
                        flex flex-col justify-between h-28 relative overflow-hidden transition-all cursor-pointer
                        ${isSelected ? 'border-[var(--accent-primary-border)] bg-[var(--surface-3)]' : 'border-[var(--border-default)] hover:border-[var(--border-strong)]'}
                      `}
                    >
                      {/* Top State Indicator */}
                      <div className="flex items-center justify-between">
                        <span className="text-[9px] font-mono font-bold text-[var(--accent-primary-light)]">
                          0{idx + 1}
                        </span>
                        {stageState === 'completed' ? (
                          <span className="w-2 h-2 rounded-full bg-[var(--risk-low)]" />
                        ) : stageState === 'running' ? (
                          <span className="w-2 h-2 rounded-full bg-[var(--accent-primary)] animate-ping" />
                        ) : (
                          <span className="w-2 h-2 rounded-full bg-[var(--surface-3)] border border-[var(--border-strong)]" />
                        )}
                      </div>

                      {/* Stage Name & Duration */}
                      <div>
                        <div className="text-[11px] font-mono font-semibold text-[var(--text-primary)] leading-tight">
                          {stage.name.split(' ').slice(1).join(' ')}
                        </div>
                        <div className="text-[10px] font-mono text-[var(--text-tertiary)] mt-1">
                          {stageState === 'completed'
                            ? stage.duration
                            : stageState === 'running'
                            ? 'Running...'
                            : 'Pending'}
                        </div>
                      </div>

                      {/* Bottom Status Bar */}
                      <div
                        className={`absolute bottom-0 left-0 right-0 h-[2.5px] ${
                          stageState === 'completed'
                            ? 'bg-[var(--risk-low)]'
                            : stageState === 'running'
                            ? 'bg-[var(--accent-primary)]'
                            : 'bg-transparent'
                        }`}
                      />
                    </div>
                  );
                })}
              </div>

              {/* Selected Stage Detail Inspector */}
              <div className="p-3.5 bg-[var(--surface-2)] border border-[var(--border-subtle)] rounded-[var(--radius-sm)] flex flex-col sm:flex-row sm:items-center justify-between gap-3 font-mono text-xs">
                <div>
                  <span className="text-[10px] uppercase text-[var(--accent-primary-light)] font-bold">
                    STAGE DETAIL: {STAGES[selectedStageIndex].name}
                  </span>
                  <p className="text-[var(--text-secondary)] text-[11px] mt-0.5">
                    {STAGES[selectedStageIndex].desc}
                  </p>
                </div>
                <div className="flex items-center gap-4 text-[11px] text-[var(--text-tertiary)] shrink-0">
                  <div>
                    <span>Processed: </span>
                    <span className="text-[var(--text-primary)] font-semibold">{STAGES[selectedStageIndex].rows}</span>
                  </div>
                  <div>
                    <span>Output: </span>
                    <span className="text-[var(--text-primary)] font-semibold">{STAGES[selectedStageIndex].output}</span>
                  </div>
                  <div>
                    <span>Time: </span>
                    <span className="text-[var(--accent-primary-light)] font-semibold">{STAGES[selectedStageIndex].duration}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* ── 6. ANALYSIS COMPLETION STATE PANEL ── */}
            {pipelineStatus === 'completed' && (
              <div className="bg-[var(--surface-1)] border border-[var(--border-default)] rounded-[var(--radius-md)] p-6 space-y-5">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-[var(--border-subtle)]">
                  <div className="flex items-start gap-3">
                    <div className="w-9 h-9 rounded-[var(--radius-sm)] bg-[var(--surface-2)] border border-[var(--risk-low-border)] flex items-center justify-center text-[var(--risk-low)] shrink-0 mt-0.5">
                      <CheckCircle2 size={18} />
                    </div>
                    <div>
                      <h3 className="text-xs font-mono font-bold uppercase tracking-[0.12em] text-[var(--text-primary)]">
                        ANALYSIS COMPLETE
                      </h3>
                      <p className="text-xs text-[var(--text-secondary)] mt-0.5">
                        Dataset processed successfully in offline airgapped runtime.
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <Link href="/transactions">
                      <Button variant="secondary" size="sm">
                        <span>View Transactions</span>
                      </Button>
                    </Link>
                    <Link href="/alerts">
                      <Button variant="accent" size="sm">
                        <span>View Investigative Leads</span>
                        <ArrowRight size={13} />
                      </Button>
                    </Link>
                  </div>
                </div>

                {/* Summary Metrics Grid */}
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 font-mono text-xs">
                  <div className="p-3 bg-[var(--surface-2)] border border-[var(--border-subtle)] rounded-[var(--radius-sm)]">
                    <span className="text-[10px] uppercase text-[var(--text-tertiary)] block">TRANSACTIONS PROCESSED</span>
                    <span className="text-base font-bold text-[var(--text-primary)]">245,892</span>
                  </div>
                  <div className="p-3 bg-[var(--surface-2)] border border-[var(--border-subtle)] rounded-[var(--radius-sm)]">
                    <span className="text-[10px] uppercase text-[var(--text-tertiary)] block">ALERTS GENERATED</span>
                    <span className="text-base font-bold text-[var(--accent-primary-light)]">147</span>
                  </div>
                  <div className="p-3 bg-[var(--surface-2)] border border-[var(--border-subtle)] rounded-[var(--radius-sm)]">
                    <span className="text-[10px] uppercase text-[var(--text-tertiary)] block">CANDIDATE ENTITIES</span>
                    <span className="text-base font-bold text-[var(--text-primary)]">3</span>
                  </div>
                  <div className="p-3 bg-[var(--surface-2)] border border-[var(--border-subtle)] rounded-[var(--radius-sm)]">
                    <span className="text-[10px] uppercase text-[var(--text-tertiary)] block">GRAPH RELATIONSHIPS</span>
                    <span className="text-base font-bold text-[var(--text-primary)]">4</span>
                  </div>
                  <div className="p-3 bg-[var(--surface-2)] border border-[var(--border-subtle)] rounded-[var(--radius-sm)]">
                    <span className="text-[10px] uppercase text-[var(--text-tertiary)] block">ANALYSIS DURATION</span>
                    <span className="text-base font-bold text-[var(--risk-low)]">18.0s</span>
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </PageContainer>
  );
}
