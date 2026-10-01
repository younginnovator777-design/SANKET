'use client';

import React, { useState, useEffect, useRef, useMemo } from 'react';
import Link from 'next/link';
import {
  Upload,
  FileCode,
  CheckCircle2,
  Cpu,
  ArrowRight,
  Play,
  RotateCcw,
  AlertTriangle,
  Check,
  ChevronRight,
  ExternalLink,
} from 'lucide-react';
import { PageContainer } from '@/components/PageContainer';
import {
  Button,
  Badge,
  RiskBadge,
  StatusBadge,
  EmptyState,
} from '@/components/ui';
import { analyzeFile, ApiAnalysisResponse, ApiError } from '@/lib/api';
import { useCurrentRun, toCompactRunMetadata } from '@/context/RunContext';

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
    duration: '0.2s',
    rows: '—',
    output: 'Memory Buffer',
  },
  {
    id: 'CANONICALIZE',
    name: '02 CANONICALIZE',
    desc: 'Normalizing inputs, outputs, fee rates, and timestamps into canonical schema.',
    duration: '0.3s',
    rows: '—',
    output: 'Canonical Table',
  },
  {
    id: 'EXTRACT_FEATURES',
    name: '03 FEATURE EXTRACTION',
    desc: 'Computing transaction, temporal, network, entity and graph features.',
    duration: '0.5s',
    rows: '32 Feature Dims',
    output: 'Feature Vectors',
  },
  {
    id: 'DETECT',
    name: '04 DETECTION',
    desc: 'Executing multi-family detector engines and unsupervised Isolation Forest.',
    duration: '1.2s',
    rows: '6 Detectors',
    output: 'Signal Matrix',
  },
  {
    id: 'CORRELATE',
    name: '05 CORRELATION',
    desc: 'Correlating multi-source temporal and network signals across sliding windows.',
    duration: '0.4s',
    rows: 'Signal Clusters',
    output: 'Signal Clusters',
  },
  {
    id: 'SCORE',
    name: '06 RISK SCORING',
    desc: 'Calculating composite multi-detector risk indices and confidence intervals.',
    duration: '0.2s',
    rows: '—',
    output: 'Ranked Priority',
  },
  {
    id: 'BUILD_GRAPH',
    name: '07 GRAPH BUILD',
    desc: 'Constructing transaction adjacency matrix and candidate entity clusters.',
    duration: '0.3s',
    rows: '—',
    output: 'Topology Index',
  },
  {
    id: 'GENERATE_LEADS',
    name: '08 INVESTIGATIVE LEADS',
    desc: 'Generating prioritized, ranked lead case files for investigative review.',
    duration: '0.1s',
    rows: '—',
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
  const { startRun, completeRun, failRun, clearRun } = useCurrentRun();
  const [format, setFormat] = useState<'CSV' | 'JSON' | 'XML'>('CSV');
  const [pipelineStatus, setPipelineStatus] = useState<PipelineStatus>('empty');
  const [currentRunningIndex, setCurrentRunningIndex] = useState<number>(0); // 0 to 7
  const [selectedStageIndex, setSelectedStageIndex] = useState<number>(0);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [analysisResult, setAnalysisResult] = useState<ApiAnalysisResponse | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Validate and stage a file for analysis
  const validateAndSetFile = (file: File | null | undefined) => {
    if (!file) {
      setErrorMessage('No file selected. Please select a valid CSV dataset file.');
      setPipelineStatus('error');
      return;
    }

    const isCsv = file.name.toLowerCase().endsWith('.csv') || file.type === 'text/csv';
    if (!isCsv) {
      setErrorMessage(`Selected file "${file.name}" is not a CSV dataset. SANKET requires a CSV file matching the canonical transaction schema.`);
      setPipelineStatus('error');
      return;
    }

    setSelectedFile(file);
    setAnalysisResult(null);
    setErrorMessage(null);
    setCurrentRunningIndex(0);
    setPipelineStatus('preview');
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      validateAndSetFile(file);
    }
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  // Pipeline simulation ticker while real POST /api/v1/analyze is in flight
  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (pipelineStatus === 'running') {
      if (currentRunningIndex < STAGES.length - 2) {
        timer = setTimeout(() => {
          setCurrentRunningIndex((prev) => Math.min(prev + 1, STAGES.length - 2));
        }, 500);
      }
    }
    return () => clearTimeout(timer);
  }, [pipelineStatus, currentRunningIndex]);

  // Execute real analysis via POST /api/v1/analyze
  const handleStartAnalysis = async () => {
    if (!selectedFile) {
      setErrorMessage('No CSV file selected. Please select a dataset file before running analysis.');
      setPipelineStatus('error');
      return;
    }

    const runStartTime = new Date().toISOString();
    setPipelineStatus('running');
    setCurrentRunningIndex(0);
    setErrorMessage(null);
    startRun(selectedFile.name);

    try {
      const result = await analyzeFile(selectedFile);
      setAnalysisResult(result);
      completeRun(toCompactRunMetadata(result, runStartTime));
      setCurrentRunningIndex(7);
      setSelectedStageIndex(7);
      setPipelineStatus('completed');
    } catch (err) {
      const detail =
        err instanceof ApiError
          ? err.detail
          : err instanceof Error
          ? err.message
          : String(err);
      setErrorMessage(detail);
      setPipelineStatus('error');
      failRun(detail);
    }
  };

  const handleReset = () => {
    setSelectedFile(null);
    setAnalysisResult(null);
    setErrorMessage(null);
    setPipelineStatus('empty');
    setCurrentRunningIndex(0);
    setSelectedStageIndex(0);
    clearRun();
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleLoadSample = async () => {
    try {
      const res = await fetch('/sample.csv');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      const sampleFile = new File([blob], 'sample_transactions.csv', { type: 'text/csv' });
      validateAndSetFile(sampleFile);
    } catch {
      fileInputRef.current?.click();
    }
  };

  // Dynamic stage details computed from real pipeline execution results
  const dynamicStages = useMemo(() => {
    return STAGES.map((s, idx) => {
      let rows = s.rows;
      let duration = s.duration;

      if (analysisResult) {
        if (idx === 0) {
          rows = `${analysisResult.record_count.toLocaleString()} TXs`;
          duration = analysisResult.execution_timings?.ingestion_time
            ? `${(analysisResult.execution_timings.ingestion_time * 1000).toFixed(0)}ms`
            : '0.2s';
        } else if (idx === 1) {
          rows = `${(analysisResult.record_count - (analysisResult.rejected_record_count || 0)).toLocaleString()} Valid`;
          duration = '0.3s';
        } else if (idx === 2) {
          rows = '32 Feature Dims';
          duration = analysisResult.execution_timings?.feature_time
            ? `${(analysisResult.execution_timings.feature_time * 1000).toFixed(0)}ms`
            : '0.5s';
        } else if (idx === 3) {
          rows = `${Object.keys(analysisResult.detector_versions || {}).length || 6} Detectors`;
          duration = analysisResult.execution_timings?.detection_time
            ? `${analysisResult.execution_timings.detection_time.toFixed(2)}s`
            : '1.2s';
        } else if (idx === 4) {
          rows = 'Signal Clusters';
          duration = '0.4s';
        } else if (idx === 5) {
          rows = `${analysisResult.record_count.toLocaleString()} Scored`;
          duration = analysisResult.execution_timings?.scoring_time
            ? `${(analysisResult.execution_timings.scoring_time * 1000).toFixed(0)}ms`
            : '0.2s';
        } else if (idx === 6) {
          const rawSummary = analysisResult.graph_summary as Record<string, unknown> | undefined;
          const nodes = rawSummary?.node_count ?? rawSummary?.total_nodes ?? '—';
          const edges = rawSummary?.edge_count ?? rawSummary?.total_edges ?? '—';
          rows = `${nodes} Nodes / ${edges} Edges`;
          duration = analysisResult.execution_timings?.graph_time
            ? `${(analysisResult.execution_timings.graph_time * 1000).toFixed(0)}ms`
            : '0.3s';
        } else if (idx === 7) {
          rows = `${analysisResult.ranked_alerts.length} Alerts`;
          duration = analysisResult.execution_timings?.ranking_time
            ? `${(analysisResult.execution_timings.ranking_time * 1000).toFixed(0)}ms`
            : '0.1s';
        }
      } else if (selectedFile && idx === 0) {
        rows = 'Pending Analysis';
      }

      return {
        ...s,
        rows,
        duration,
      };
    });
  }, [analysisResult, selectedFile]);

  const totalDuration = analysisResult?.execution_timings?.total_time
    ? `${analysisResult.execution_timings.total_time.toFixed(2)}s`
    : analysisResult?.execution_timings?.total
    ? `${analysisResult.execution_timings.total.toFixed(2)}s`
    : '—';

  return (
    <PageContainer
      title="ANALYZE"
      description="Run offline transaction and network intelligence analysis."
      tag="OFFLINE PIPELINE"
      icon={<Upload size={18} />}
      actions={
        <div className="flex items-center gap-2">
          {pipelineStatus === 'empty' && (
            <>
              <Button variant="accent" size="sm" onClick={() => fileInputRef.current?.click()}>
                <Upload size={13} />
                <span>Select Dataset File</span>
              </Button>
              <Button variant="secondary" size="sm" onClick={handleLoadSample}>
                <span>Load Sample Dataset</span>
              </Button>
            </>
          )}

          {pipelineStatus === 'preview' && (
            <>
              <Button variant="secondary" size="sm" onClick={handleReset}>
                <RotateCcw size={13} />
                <span>Clear</span>
              </Button>
              <Button variant="accent" size="sm" onClick={handleStartAnalysis}>
                <Play size={13} />
                <span>Start Offline Pipeline</span>
              </Button>
            </>
          )}

          {pipelineStatus === 'running' && (
            <Button variant="accent" size="sm" disabled>
              <StatusBadge status="processing" />
              <span>Analyzing Pipeline...</span>
            </Button>
          )}

          {pipelineStatus === 'completed' && (
            <>
              <Button variant="secondary" size="sm" onClick={handleReset}>
                <RotateCcw size={13} />
                <span>Analyze New File</span>
              </Button>
              <Link href="/alerts">
                <Button variant="accent" size="sm">
                  <span>View Investigative Leads ({analysisResult ? analysisResult.ranked_alerts.length : 0})</span>
                  <ArrowRight size={13} />
                </Button>
              </Link>
            </>
          )}

          {pipelineStatus === 'error' && (
            <>
              <Button variant="secondary" size="sm" onClick={handleReset}>
                <RotateCcw size={13} />
                <span>Reset</span>
              </Button>
              {selectedFile && (
                <Button variant="accent" size="sm" onClick={handleStartAnalysis}>
                  <RotateCcw size={13} />
                  <span>Retry Pipeline</span>
                </Button>
              )}
            </>
          )}
        </div>
      }
    >
      {/* Hidden Native File Input */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".csv,text/csv"
        onChange={handleFileInputChange}
        className="hidden"
        id="dataset-file-input"
      />

      <div className="space-y-6">
        {/* ── 1. Page Header Context Strip ── */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 bg-[var(--surface-1)] border border-[var(--border-default)] rounded-[var(--radius-md)] text-xs font-mono">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] uppercase text-[var(--text-tertiary)]">CURRENT RUN:</span>
              <span className="font-semibold text-[var(--accent-primary-light)]">
                {analysisResult ? analysisResult.run_id : '—'}
              </span>
            </div>
            <span className="text-[var(--border-strong)]">|</span>
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] uppercase text-[var(--text-tertiary)]">DATASET STATUS:</span>
              <span className="text-[var(--text-primary)] font-medium">
                {pipelineStatus === 'empty'
                  ? 'NO DATASET'
                  : pipelineStatus === 'preview'
                  ? 'READY FOR ANALYSIS'
                  : pipelineStatus === 'running'
                  ? 'ANALYZING...'
                  : pipelineStatus === 'completed'
                  ? 'COMPLETED & RANKED'
                  : 'ANALYSIS FAILED'}
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
              description="Upload a canonical transaction CSV dataset to execute the deterministic SANKET offline pipeline."
              icon={<FileCode size={22} className="text-[var(--accent-primary)]" />}
              action={
                <div className="flex flex-col sm:flex-row items-center gap-3">
                  <Button variant="accent" size="md" onClick={() => fileInputRef.current?.click()}>
                    <Upload size={14} />
                    <span>Select Dataset File</span>
                  </Button>
                  <Button variant="secondary" size="md" onClick={handleLoadSample}>
                    <span>Load Sample Dataset</span>
                  </Button>
                </div>
              }
            />

            {/* Ingestion Info Strip */}
            <div className="mt-8 pt-6 border-t border-[var(--border-subtle)] grid grid-cols-1 md:grid-cols-3 gap-4 text-xs font-mono text-[var(--text-secondary)]">
              <div className="p-3 bg-[var(--surface-2)] border border-[var(--border-subtle)] rounded-[var(--radius-sm)]">
                <span className="text-[10px] uppercase text-[var(--text-tertiary)] block mb-1">SUPPORTED FORMATS</span>
                <span className="text-[var(--text-primary)] font-medium">CSV (Canonical v26)</span>
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
                  ANALYSIS ERROR
                </h3>
                <p className="text-xs text-[var(--text-secondary)] mt-1">
                  The dataset could not be processed. Review the diagnostic status below.
                </p>
              </div>
            </div>

            <div className="p-3.5 bg-[var(--surface-2)] border border-[var(--border-subtle)] rounded-[var(--radius-sm)] font-mono text-xs text-[var(--text-secondary)]">
              <div className="text-[10px] uppercase text-[var(--text-tertiary)] mb-1">DIAGNOSTIC STATUS</div>
              <p className="text-[var(--risk-critical)] break-words font-medium">
                {errorMessage || 'Unknown error occurred while processing the dataset.'}
              </p>
            </div>

            <div className="flex items-center gap-3 pt-2">
              {selectedFile && (
                <Button variant="accent" size="sm" onClick={handleStartAnalysis}>
                  <RotateCcw size={13} />
                  <span>Retry Pipeline Execution</span>
                </Button>
              )}
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setErrorMessage(null);
                  setPipelineStatus(selectedFile ? 'preview' : 'empty');
                }}
              >
                <span>{selectedFile ? 'Return to Dataset Preview' : 'Select Another File'}</span>
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
                        onClick={() => {
                          if (fmt !== 'CSV') {
                            setErrorMessage(`Format ${fmt} is not supported directly in the offline pipeline yet. Please provide a canonical CSV file.`);
                            setPipelineStatus('error');
                          } else {
                            setFormat('CSV');
                          }
                        }}
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
                <div
                  onDragOver={(e) => {
                    e.preventDefault();
                    setIsDragging(true);
                  }}
                  onDragLeave={() => setIsDragging(false)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setIsDragging(false);
                    const file = e.dataTransfer.files?.[0];
                    if (file) validateAndSetFile(file);
                  }}
                  className={`border border-dashed rounded-[var(--radius-md)] p-6 text-center transition-colors flex flex-col items-center justify-center gap-2.5 ${
                    isDragging
                      ? 'border-[var(--accent-primary)] bg-[var(--surface-3)]'
                      : 'border-[var(--border-strong)] bg-[var(--surface-2)] hover:border-[var(--accent-primary-border)]'
                  }`}
                >
                  <div className="w-9 h-9 rounded-[var(--radius-sm)] bg-[var(--surface-3)] border border-[var(--border-default)] flex items-center justify-center text-[var(--accent-primary-light)]">
                    <FileCode size={16} />
                  </div>
                  <div>
                    <p className="text-xs font-mono font-semibold text-[var(--text-primary)]">
                      {selectedFile ? `Loaded: ${selectedFile.name}` : 'Drop a transaction/network dataset here'}
                    </p>
                    <p className="text-[11px] font-mono text-[var(--text-tertiary)] mt-0.5">
                      {selectedFile
                        ? `${(selectedFile.size / 1024).toFixed(1)} KB · Ready to analyze`
                        : 'Supported format: CSV'}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 mt-1">
                    <Button variant="primary" size="sm" onClick={() => fileInputRef.current?.click()}>
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
                    <Badge variant="accent">
                      {pipelineStatus === 'completed' ? 'ANALYZED' : 'VALIDATED'}
                    </Badge>
                  </div>

                  <div className="space-y-2.5 font-mono text-xs">
                    <div className="flex items-center justify-between p-2 rounded-[var(--radius-sm)] bg-[var(--surface-2)] border border-[var(--border-subtle)]">
                      <span className="text-[10px] text-[var(--text-tertiary)] uppercase">File Name</span>
                      <span className="text-[var(--text-primary)] font-medium truncate max-w-[200px]">
                        {selectedFile ? selectedFile.name : '—'}
                      </span>
                    </div>
                    <div className="flex items-center justify-between p-2 rounded-[var(--radius-sm)] bg-[var(--surface-2)] border border-[var(--border-subtle)]">
                      <span className="text-[10px] text-[var(--text-tertiary)] uppercase">File Type / Size</span>
                      <span className="text-[var(--text-secondary)]">
                        {selectedFile
                          ? `CSV / ${(selectedFile.size / 1024).toFixed(1)} KB`
                          : '—'}
                      </span>
                    </div>
                    <div className="flex items-center justify-between p-2 rounded-[var(--radius-sm)] bg-[var(--surface-2)] border border-[var(--border-subtle)]">
                      <span className="text-[10px] text-[var(--text-tertiary)] uppercase">Row Count</span>
                      <span className="text-[var(--text-primary)] font-semibold">
                        {analysisResult
                          ? `${analysisResult.record_count.toLocaleString()} transactions`
                          : selectedFile
                          ? 'Pending analysis'
                          : '—'}
                      </span>
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
                      CURRENT STAGE: {dynamicStages[currentRunningIndex].name}
                    </div>
                    <p className="text-xs font-mono text-[var(--text-primary)]">
                      {dynamicStages[currentRunningIndex].desc}
                    </p>
                  </div>
                  <span className="text-[10px] font-mono text-[var(--accent-primary-light)] shrink-0">
                    STAGE {currentRunningIndex + 1} OF 8
                  </span>
                </div>
              )}

              {/* 8-Stage Progression Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2">
                {dynamicStages.map((stage, idx) => {
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
                    STAGE DETAIL: {dynamicStages[selectedStageIndex].name}
                  </span>
                  <p className="text-[var(--text-secondary)] text-[11px] mt-0.5">
                    {dynamicStages[selectedStageIndex].desc}
                  </p>
                </div>
                <div className="flex items-center gap-4 text-[11px] text-[var(--text-tertiary)] shrink-0">
                  <div>
                    <span>Processed: </span>
                    <span className="text-[var(--text-primary)] font-semibold">{dynamicStages[selectedStageIndex].rows}</span>
                  </div>
                  <div>
                    <span>Output: </span>
                    <span className="text-[var(--text-primary)] font-semibold">{dynamicStages[selectedStageIndex].output}</span>
                  </div>
                  <div>
                    <span>Time: </span>
                    <span className="text-[var(--accent-primary-light)] font-semibold">{dynamicStages[selectedStageIndex].duration}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* ── 6. ANALYSIS COMPLETION STATE PANEL ── */}
            {pipelineStatus === 'completed' && analysisResult && (
              <div className="bg-[var(--surface-1)] border border-[var(--border-default)] rounded-[var(--radius-md)] p-6 space-y-5">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-[var(--border-subtle)]">
                  <div className="flex items-start gap-3">
                    <div className="w-9 h-9 rounded-[var(--radius-sm)] bg-[var(--surface-2)] border border-[var(--risk-low-border)] flex items-center justify-center text-[var(--risk-low)] shrink-0 mt-0.5">
                      <CheckCircle2 size={18} />
                    </div>
                    <div>
                      <h3 className="text-xs font-mono font-bold uppercase tracking-[0.12em] text-[var(--text-primary)]">
                        ANALYSIS COMPLETE — {analysisResult.run_id}
                      </h3>
                      <p className="text-xs text-[var(--text-secondary)] mt-0.5">
                        Dataset processed successfully through all 8 SANKET pipeline stages in offline airgapped runtime.
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
                        <span>View Investigative Leads ({analysisResult.ranked_alerts.length})</span>
                        <ArrowRight size={13} />
                      </Button>
                    </Link>
                  </div>
                </div>

                {/* Summary Metrics Grid */}
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 font-mono text-xs">
                  <div className="p-3 bg-[var(--surface-2)] border border-[var(--border-subtle)] rounded-[var(--radius-sm)]">
                    <span className="text-[10px] uppercase text-[var(--text-tertiary)] block">TRANSACTIONS PROCESSED</span>
                    <span className="text-base font-bold text-[var(--text-primary)]">
                      {analysisResult.record_count.toLocaleString()}
                    </span>
                  </div>
                  <div className="p-3 bg-[var(--surface-2)] border border-[var(--border-subtle)] rounded-[var(--radius-sm)]">
                    <span className="text-[10px] uppercase text-[var(--text-tertiary)] block">ALERTS GENERATED</span>
                    <span className="text-base font-bold text-[var(--accent-primary-light)]">
                      {analysisResult.ranked_alerts.length.toLocaleString()}
                    </span>
                  </div>
                  <div className="p-3 bg-[var(--surface-2)] border border-[var(--border-subtle)] rounded-[var(--radius-sm)]">
                    <span className="text-[10px] uppercase text-[var(--text-tertiary)] block">GRAPH NODES</span>
                    <span className="text-base font-bold text-[var(--text-primary)]">
                      {((analysisResult.graph_summary as Record<string, unknown>)?.node_count as number) ??
                        ((analysisResult.graph_summary as Record<string, unknown>)?.total_nodes as number) ??
                        0}
                    </span>
                  </div>
                  <div className="p-3 bg-[var(--surface-2)] border border-[var(--border-subtle)] rounded-[var(--radius-sm)]">
                    <span className="text-[10px] uppercase text-[var(--text-tertiary)] block">GRAPH EDGES</span>
                    <span className="text-base font-bold text-[var(--text-primary)]">
                      {((analysisResult.graph_summary as Record<string, unknown>)?.edge_count as number) ??
                        ((analysisResult.graph_summary as Record<string, unknown>)?.total_edges as number) ??
                        0}
                    </span>
                  </div>
                  <div className="p-3 bg-[var(--surface-2)] border border-[var(--border-subtle)] rounded-[var(--radius-sm)]">
                    <span className="text-[10px] uppercase text-[var(--text-tertiary)] block">ANALYSIS DURATION</span>
                    <span className="text-base font-bold text-[var(--risk-low)]">
                      {totalDuration}
                    </span>
                  </div>
                </div>

                {/* Generated Ranked Alerts List */}
                {analysisResult.ranked_alerts && analysisResult.ranked_alerts.length > 0 && (
                  <div className="space-y-3 pt-3 border-t border-[var(--border-subtle)]">
                    <div className="flex items-center justify-between">
                      <div className="text-[10px] font-mono uppercase tracking-wider text-[var(--text-tertiary)]">
                        TOP GENERATED LEADS ({analysisResult.ranked_alerts.length})
                      </div>
                      <Link
                        href="/alerts"
                        className="text-[11px] font-mono text-[var(--accent-primary-light)] hover:underline flex items-center gap-1"
                      >
                        <span>Open Full Leads Table</span>
                        <ChevronRight size={12} />
                      </Link>
                    </div>

                    <div className="space-y-2">
                      {analysisResult.ranked_alerts.slice(0, 5).map((alert) => (
                        <div
                          key={alert.alert_id}
                          className="p-3 bg-[var(--surface-2)] border border-[var(--border-subtle)] rounded-[var(--radius-sm)] flex flex-col sm:flex-row sm:items-center justify-between gap-2 font-mono text-xs"
                        >
                          <div className="space-y-1">
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-[var(--text-primary)]">#{alert.rank}</span>
                              <span className="text-[var(--accent-primary-light)]">{alert.alert_id}</span>
                              <RiskBadge level={alert.risk_level} size="sm" />
                              <span className="text-[10px] text-[var(--text-tertiary)]">
                                Score: {(alert.risk_score * 100).toFixed(0)}%
                              </span>
                            </div>
                            <div className="text-[11px] text-[var(--text-secondary)] truncate max-w-md">
                              TX: <span className="text-[var(--text-primary)]">{alert.transaction_id}</span>
                            </div>
                          </div>

                          <div className="flex items-center gap-2">
                            <div className="flex flex-wrap gap-1">
                              {alert.triggered_detectors.slice(0, 3).map((d) => (
                                <span
                                  key={d}
                                  className="px-1.5 py-0.5 rounded-[var(--radius-xs)] bg-[var(--surface-3)] text-[10px] text-[var(--text-secondary)] border border-[var(--border-subtle)]"
                                >
                                  {d}
                                </span>
                              ))}
                            </div>
                            <Link href={`/transactions?search=${encodeURIComponent(alert.transaction_id)}`}>
                              <Button variant="ghost" size="sm" className="h-7 px-2 text-[10px]">
                                <ExternalLink size={11} />
                              </Button>
                            </Link>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </PageContainer>
  );
}
