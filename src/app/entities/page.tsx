'use client';

import React, { useState, useEffect, useCallback, useMemo, Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import {
  Users,
  Search,
  ExternalLink,
  ShieldAlert,
  GitBranch,
  Layers,
  Info,
  ChevronRight,
  Copy,
  Check,
  Download,
  Boxes,
  ArrowLeftRight,
  Clock,
  Sparkles,
  AlertTriangle,
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
  LoadingState,
  DataTable,
  Column,
} from '@/components/ui';
import { mockCandidateEntities, mockRuns } from '@/data/mock';
import { CandidateEntity, RiskLevel } from '@/types';
import { downloadCSV } from '@/lib/export';

type RiskFilterOption = 'ALL' | 'CRITICAL' | 'HIGH' | 'MEDIUM';

function EntitiesContent() {
  const searchParams = useSearchParams();
  const initialQuery = searchParams.get('search') || searchParams.get('entity') || '';

  const [searchQuery, setSearchQuery] = useState(initialQuery);
  const [selectedRiskFilter, setSelectedRiskFilter] = useState<RiskFilterOption>('ALL');
  const [selectedHeuristic, setSelectedHeuristic] = useState<string>('ALL');
  const [selectedEntity, setSelectedEntity] = useState<CandidateEntity | null>(() => {
    if (initialQuery) {
      const match = mockCandidateEntities.find(
        (e) => e.entity_id.toLowerCase().includes(initialQuery.toLowerCase()) ||
               e.label.toLowerCase().includes(initialQuery.toLowerCase())
      );
      return match || null;
    }
    return null;
  });
  const [copiedId, setCopiedId] = useState(false);
  const [copiedAddress, setCopiedAddress] = useState<string | null>(null);

  const handleSelectEntity = useCallback((entity: CandidateEntity) => {
    setSelectedEntity(entity);
    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href);
      url.searchParams.set('entity', entity.entity_id);
      window.history.pushState(null, '', url.toString());
    }
  }, []);

  const handleCloseDossier = useCallback(() => {
    setSelectedEntity(null);
    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href);
      url.searchParams.delete('entity');
      window.history.pushState(null, '', url.toString());
    }
  }, []);

  // Synchronize entity selection with URL search parameters
  useEffect(() => {
    let isCancelled = false;
    const syncEntity = async () => {
      await Promise.resolve();
      if (isCancelled) return;
      const target = searchParams.get('entity') || searchParams.get('search');
      if (target && target.trim()) {
        const q = target.trim().toLowerCase();
        const match = mockCandidateEntities.find(
          (e) => e.entity_id.toLowerCase() === q || e.label.toLowerCase() === q
        );
        if (match && selectedEntity?.entity_id !== match.entity_id) {
          setSelectedEntity(match);
        }
      } else {
        setSelectedEntity(null);
      }
    };
    syncEntity();
    return () => {
      isCancelled = true;
    };
  }, [searchParams, selectedEntity]);

  // Support browser Back/Forward navigation
  useEffect(() => {
    const onPopState = () => {
      const sp = new URLSearchParams(window.location.search);
      const target = sp.get('entity') || sp.get('search');
      if (target && target.trim()) {
        const q = target.trim().toLowerCase();
        const match = mockCandidateEntities.find(
          (e) => e.entity_id.toLowerCase() === q || e.label.toLowerCase() === q
        );
        setSelectedEntity(match || null);
      } else {
        setSelectedEntity(null);
      }
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  const activeRun = mockRuns[0];

  // Derive unique heuristic methods
  const allHeuristics = useMemo(() => {
    const set = new Set<string>();
    mockCandidateEntities.forEach((ent) => set.add(ent.heuristic_method));
    return Array.from(set);
  }, []);

  // Filter entities
  const filteredEntities = useMemo(() => {
    return mockCandidateEntities.filter((ent) => {
      // Risk filter
      if (selectedRiskFilter !== 'ALL' && ent.risk_assessment !== selectedRiskFilter) return false;

      // Heuristic filter
      if (selectedHeuristic !== 'ALL' && ent.heuristic_method !== selectedHeuristic) return false;

      // Search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchId = ent.entity_id.toLowerCase().includes(q);
        const matchLabel = ent.label.toLowerCase().includes(q);
        const matchHeuristic = ent.heuristic_method.toLowerCase().includes(q);
        const matchAddr = ent.sample_addresses.some((a) => a.toLowerCase().includes(q));
        const matchEvidence = ent.supporting_evidence.some((e) => e.toLowerCase().includes(q));
        if (!matchId && !matchLabel && !matchHeuristic && !matchAddr && !matchEvidence) return false;
      }

      return true;
    });
  }, [searchQuery, selectedRiskFilter, selectedHeuristic]);

  // Forensic summary metrics
  const totalClusters = mockCandidateEntities.length;
  const highCriticalClusters = mockCandidateEntities.filter(
    (e) => e.risk_assessment === 'CRITICAL' || e.risk_assessment === 'HIGH'
  ).length;
  const totalGroupedAddresses = mockCandidateEntities.reduce((acc, e) => acc + e.address_count, 0);
  const totalAggregatedVolume = mockCandidateEntities.reduce((acc, e) => acc + e.total_volume_btc, 0);
  const avgClusterConfidence = totalClusters > 0
    ? (mockCandidateEntities.reduce((acc, e) => acc + e.confidence, 0) / totalClusters) * 100
    : 0;

  const handleCopyId = (id: string) => {
    navigator.clipboard?.writeText(id);
    setCopiedId(true);
    setTimeout(() => setCopiedId(false), 2000);
  };

  const handleCopyAddress = (addr: string) => {
    navigator.clipboard?.writeText(addr);
    setCopiedAddress(addr);
    setTimeout(() => setCopiedAddress(null), 2000);
  };

  const clearFilters = () => {
    setSearchQuery('');
    setSelectedRiskFilter('ALL');
    setSelectedHeuristic('ALL');
  };

  return (
    <PageContainer
      title="CANDIDATE ENTITIES"
      description="Heuristic groupings derived from observed transaction and network relationships."
      tag="HEURISTIC CLUSTERS"
      icon={<Users size={18} />}
      actions={
        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => downloadCSV(filteredEntities, 'sanket-entities.csv')}
          >
            <Download size={13} />
            <span>Export Entities</span>
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
              <span className="text-[10px] uppercase text-[var(--text-tertiary)]">DATASET:</span>
              <span className="text-[var(--text-primary)] font-medium">{activeRun.dataset_name}</span>
            </div>
            <span className="text-[var(--border-strong)]">|</span>
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] uppercase text-[var(--text-tertiary)]">STATUS:</span>
              <span className="text-[var(--accent-primary-light)]">HEURISTIC ONLY · OWNERSHIP NOT ESTABLISHED</span>
            </div>
          </div>

          <div className="flex items-center gap-2 text-[11px] text-[var(--text-secondary)]">
            <span className="w-1.5 h-1.5 rounded-full bg-[var(--risk-low)]" />
            <span className="uppercase tracking-wider">AIRGAPPED / OFFLINE</span>
          </div>
        </div>

        {/* ── 2. Prominent Heuristic Disclaimer Banner ── */}
        <div className="flex items-start gap-3.5 p-4 bg-[var(--surface-1)] border border-[var(--border-default)] rounded-[var(--radius-md)] text-xs">
          <Info size={18} className="text-[var(--accent-primary-light)] shrink-0 mt-0.5" />
          <div className="space-y-1">
            <div className="font-mono font-bold uppercase tracking-wider text-[var(--accent-primary-light)] flex items-center gap-2">
              <span>HEURISTIC CANDIDATE GROUPING NOTICE</span>
              <span className="text-[9px] px-1.5 py-0.2 rounded-xs bg-[var(--surface-2)] text-[var(--text-secondary)] border border-[var(--border-subtle)]">
                NON-ACCUSATORY
              </span>
            </div>
            <p className="text-[var(--text-secondary)] leading-relaxed font-sans">
              Entities represent algorithmic candidate groupings derived from observed on-chain multi-input spending, change address patterns, and temporal co-occurrence. They do not constitute confirmed real-world identities, known actors, or verified legal ownership.
            </p>
          </div>
        </div>

        {/* ── 3. Forensic Summary Strip ── */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 font-mono text-xs">
          <div className="p-3 bg-[var(--surface-1)] border border-[var(--border-default)] rounded-[var(--radius-sm)] flex flex-col justify-between">
            <span className="text-[10px] uppercase text-[var(--text-tertiary)]">CANDIDATE CLUSTERS</span>
            <div className="text-lg font-bold text-[var(--text-primary)] mt-1">{totalClusters}</div>
          </div>
          <div className="p-3 bg-[var(--surface-1)] border border-[var(--border-default)] rounded-[var(--radius-sm)] flex flex-col justify-between">
            <span className="text-[10px] uppercase text-[var(--text-tertiary)]">HIGH / CRITICAL</span>
            <div className="text-lg font-bold text-[var(--risk-critical)] mt-1">{highCriticalClusters}</div>
          </div>
          <div className="p-3 bg-[var(--surface-1)] border border-[var(--border-default)] rounded-[var(--radius-sm)] flex flex-col justify-between">
            <span className="text-[10px] uppercase text-[var(--text-tertiary)]">GROUPED ADDRESSES</span>
            <div className="text-lg font-bold text-[var(--accent-primary-light)] mt-1">{totalGroupedAddresses} vectors</div>
          </div>
          <div className="p-3 bg-[var(--surface-1)] border border-[var(--border-default)] rounded-[var(--radius-sm)] flex flex-col justify-between">
            <span className="text-[10px] uppercase text-[var(--text-tertiary)]">AGGREGATED VOLUME</span>
            <div className="text-lg font-bold text-[var(--text-primary)] mt-1">{totalAggregatedVolume.toFixed(1)} BTC</div>
          </div>
          <div className="p-3 bg-[var(--surface-1)] border border-[var(--border-default)] rounded-[var(--radius-sm)] flex flex-col justify-between">
            <span className="text-[10px] uppercase text-[var(--text-tertiary)]">AVG CONFIDENCE</span>
            <div className="text-lg font-bold text-[var(--text-secondary)] mt-1">{avgClusterConfidence.toFixed(1)}%</div>
          </div>
        </div>

        {/* ── 4. Forensic Search & Filter Strip ── */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 p-3 bg-[var(--surface-1)] border border-[var(--border-default)] rounded-[var(--radius-md)]">
          <div className="flex-1 max-w-md">
            <SearchInput
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search candidate clusters, heuristics, address hashes..."
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Risk Tier Filters */}
            <div className="flex items-center gap-1">
              <span className="text-[10px] font-mono uppercase text-[var(--text-tertiary)] mr-1">
                RISK:
              </span>
              {(['ALL', 'CRITICAL', 'HIGH', 'MEDIUM'] as const).map((opt) => (
                <FilterButton
                  key={opt}
                  label={opt}
                  active={selectedRiskFilter === opt}
                  onClick={() => setSelectedRiskFilter(opt)}
                />
              ))}
            </div>

            {/* Heuristic Filter Dropdown */}
            <div className="flex items-center gap-1.5 pl-2 border-l border-[var(--border-subtle)] font-mono text-xs">
              <span className="text-[10px] uppercase text-[var(--text-tertiary)]">HEURISTIC:</span>
              <select
                value={selectedHeuristic}
                onChange={(e) => setSelectedHeuristic(e.target.value)}
                className="h-7 px-2 text-[11px] bg-[var(--surface-2)] text-[var(--text-secondary)] border border-[var(--border-default)] rounded-[var(--radius-sm)] focus:outline-none focus:border-[var(--accent-primary-border)]"
              >
                <option value="ALL">All Heuristics</option>
                {allHeuristics.map((h) => (
                  <option key={h} value={h}>
                    {h}
                  </option>
                ))}
              </select>
            </div>

            {/* Active count */}
            <div className="text-[11px] font-mono text-[var(--text-tertiary)] pl-2 border-l border-[var(--border-subtle)]">
              {filteredEntities.length} OF {mockCandidateEntities.length} CLUSTERS
            </div>
          </div>
        </div>

        {/* ── 5. Candidate Entity Cards & List ── */}
        {filteredEntities.length === 0 ? (
          <EmptyState
            icon={<Search size={22} />}
            title="NO MATCHING CANDIDATE ENTITIES"
            description="No candidate clusters match the selected heuristic criteria or search query."
            action={
              <Button variant="secondary" size="sm" onClick={clearFilters}>
                <span>CLEAR FILTERS</span>
              </Button>
            }
          />
        ) : (
          <div className="space-y-4">
            {filteredEntities.map((entity) => {
              const isSelected = selectedEntity?.entity_id === entity.entity_id;
              return (
                <div
                  key={entity.entity_id}
                  onClick={() => handleSelectEntity(entity)}
                  className={`
                    p-5 bg-[var(--surface-1)] border rounded-[var(--radius-md)] cursor-pointer transition-all duration-150
                    ${isSelected
                      ? 'border-[var(--accent-primary-border)] bg-[var(--surface-2)] ring-1 ring-[var(--accent-primary-border)]'
                      : 'border-[var(--border-default)] hover:border-[var(--border-strong)] hover:bg-[var(--surface-2)]'
                    }
                  `}
                >
                  {/* Entity Header */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3.5 border-b border-[var(--border-subtle)]">
                    <div>
                      <div className="flex items-center gap-2.5">
                        <span className="text-xs font-mono font-bold text-[var(--accent-primary-light)]">
                          {entity.entity_id}
                        </span>
                        <span className="text-xs font-mono text-[var(--text-tertiary)]">|</span>
                        <span className="text-xs font-mono font-medium text-[var(--text-primary)]">
                          {entity.label}
                        </span>
                        <span className="text-[9px] font-mono uppercase px-1.5 py-0.2 rounded-xs bg-[var(--surface-3)] text-[var(--text-secondary)] border border-[var(--border-subtle)]">
                          Heuristic Candidate
                        </span>
                      </div>
                      <div className="text-[11px] font-mono text-[var(--text-tertiary)] mt-1.5 flex items-center gap-2">
                        <span>Method:</span>
                        <span className="text-[var(--text-secondary)] font-medium">
                          {entity.heuristic_method}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      <div className="flex items-center gap-1.5 font-mono text-xs">
                        <span className="text-[10px] text-[var(--text-tertiary)] uppercase">CONF:</span>
                        <span className="font-bold text-[var(--accent-primary-light)]">
                          {(entity.confidence * 100).toFixed(0)}%
                        </span>
                      </div>
                      <RiskBadge level={entity.risk_assessment} size="sm" />
                      <ChevronRight size={15} className="text-[var(--text-tertiary)]" />
                    </div>
                  </div>

                  {/* Metrics Grid */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 py-3.5 border-b border-[var(--border-subtle)] font-mono text-xs">
                    <div>
                      <span className="text-[10px] uppercase text-[var(--text-tertiary)] block">Grouped Addresses</span>
                      <span className="text-sm font-bold text-[var(--text-primary)] mt-0.5 block">
                        {entity.address_count} vectors
                      </span>
                    </div>
                    <div>
                      <span className="text-[10px] uppercase text-[var(--text-tertiary)] block">Aggregated Volume</span>
                      <span className="text-sm font-bold text-[var(--text-primary)] mt-0.5 block">
                        {entity.total_volume_btc.toFixed(1)} BTC
                      </span>
                    </div>
                    <div>
                      <span className="text-[10px] uppercase text-[var(--text-tertiary)] block">Linked Alerts</span>
                      <span className="text-sm font-bold text-[var(--risk-critical)] mt-0.5 block">
                        {entity.associated_alerts_count} priority
                      </span>
                    </div>
                    <div>
                      <span className="text-[10px] uppercase text-[var(--text-tertiary)] block">Observed Timeline</span>
                      <span className="text-xs font-semibold text-[var(--text-secondary)] mt-1 block">
                        {entity.first_seen.slice(11, 19)} → {entity.last_seen.slice(11, 19)} UTC
                      </span>
                    </div>
                  </div>

                  {/* Observed Evidence Snippets */}
                  <div className="pt-3 font-mono">
                    <div className="text-[10px] uppercase text-[var(--text-tertiary)] mb-2 flex items-center gap-1.5">
                      <GitBranch size={12} className="text-[var(--accent-primary)]" />
                      <span>OBSERVED SUPPORTING EVIDENCE & RELATIONSHIPS</span>
                    </div>
                    <div className="space-y-1.5">
                      {entity.supporting_evidence.map((ev, idx) => (
                        <div key={idx} className="flex items-start gap-2 text-xs text-[var(--text-secondary)]">
                          <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent-primary)] shrink-0 mt-1.5" />
                          <span className="leading-relaxed">{ev}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── 6. Candidate Entity Investigation Dossier Drawer ── */}
      <Drawer
        isOpen={selectedEntity !== null}
        onClose={handleCloseDossier}
        title="CANDIDATE ENTITY FORENSIC DOSSIER"
        className="max-w-2xl"
      >
        {selectedEntity && (
          <div className="space-y-6 font-mono text-xs">
            {/* Header: Entity ID & Legal Status */}
            <div className="p-4 bg-[var(--surface-2)] border border-[var(--border-default)] rounded-[var(--radius-md)] space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">
                  CANDIDATE ENTITY IDENTIFIER
                </span>
                <RiskBadge level={selectedEntity.risk_assessment} size="sm" />
              </div>

              <div className="flex items-start justify-between gap-3 bg-[var(--surface-1)] p-3 rounded-[var(--radius-sm)] border border-[var(--border-subtle)]">
                <div>
                  <div className="text-xs font-bold text-[var(--accent-primary-light)]">
                    {selectedEntity.entity_id}
                  </div>
                  <div className="text-[11px] text-[var(--text-primary)] font-medium mt-0.5">
                    {selectedEntity.label}
                  </div>
                </div>
                <button
                  onClick={() => handleCopyId(selectedEntity.entity_id)}
                  className="p-1.5 text-[var(--text-tertiary)] hover:text-[var(--text-primary)] bg-[var(--surface-2)] hover:bg-[var(--surface-3)] rounded-[var(--radius-sm)] transition-colors shrink-0"
                  title="Copy Entity ID"
                >
                  {copiedId ? <Check size={14} className="text-[var(--risk-low)]" /> : <Copy size={14} />}
                </button>
              </div>

              {/* Explicit Ownership Notice */}
              <div className="p-2.5 bg-[var(--surface-1)] border border-[var(--border-subtle)] rounded-[var(--radius-sm)] text-[10px] text-[var(--accent-primary-light)] leading-relaxed flex items-center gap-2">
                <Info size={14} className="shrink-0" />
                <span className="font-semibold uppercase tracking-wider">
                  HEURISTIC ONLY · OWNERSHIP NOT ESTABLISHED
                </span>
              </div>
            </div>

            {/* Metrics Strip */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
              <div className="p-3 bg-[var(--surface-2)] border border-[var(--border-subtle)] rounded-[var(--radius-sm)]">
                <span className="text-[10px] uppercase text-[var(--text-tertiary)] block">GROUPED ADDRESSES</span>
                <span className="text-sm font-bold text-[var(--text-primary)] mt-1 block">
                  {selectedEntity.address_count} vectors
                </span>
              </div>
              <div className="p-3 bg-[var(--surface-2)] border border-[var(--border-subtle)] rounded-[var(--radius-sm)]">
                <span className="text-[10px] uppercase text-[var(--text-tertiary)] block">TOTAL VOLUME</span>
                <span className="text-sm font-bold text-[var(--text-primary)] mt-1 block">
                  {selectedEntity.total_volume_btc.toFixed(1)} BTC
                </span>
              </div>
              <div className="p-3 bg-[var(--surface-2)] border border-[var(--border-subtle)] rounded-[var(--radius-sm)]">
                <span className="text-[10px] uppercase text-[var(--text-tertiary)] block">LINKED ALERTS</span>
                <span className="text-sm font-bold text-[var(--risk-critical)] mt-1 block">
                  {selectedEntity.associated_alerts_count} priority
                </span>
              </div>
              <div className="p-3 bg-[var(--surface-2)] border border-[var(--border-subtle)] rounded-[var(--radius-sm)]">
                <span className="text-[10px] uppercase text-[var(--text-tertiary)] block">CONFIDENCE</span>
                <span className="text-sm font-bold text-[var(--accent-primary-light)] mt-1 block">
                  {(selectedEntity.confidence * 100).toFixed(0)}%
                </span>
              </div>
            </div>

            {/* ── Heuristic Methodology Section ── */}
            <div className="p-4 bg-[var(--surface-2)] border border-[var(--border-default)] rounded-[var(--radius-md)] space-y-2.5">
              <div className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">
                HEURISTIC CLUSTERING METHODOLOGY
              </div>
              <div className="p-3 bg-[var(--surface-1)] border border-[var(--border-subtle)] rounded-[var(--radius-sm)] space-y-1.5">
                <div className="text-xs font-bold text-[var(--accent-primary-light)]">
                  {selectedEntity.heuristic_method}
                </div>
                <p className="text-[11px] text-[var(--text-secondary)] leading-relaxed font-sans">
                  {selectedEntity.heuristic_method.includes('Common-Input') &&
                    'Common-Input-Ownership Heuristic assumes all input addresses co-spent in a multi-input transaction are controlled by a single common private key coordinator, subject to non-interactive multi-party transaction caveats.'}
                  {selectedEntity.heuristic_method.includes('Peel-Chain') &&
                    'Peel-Chain Continuation Heuristic identifies systematic address chains where change outputs peel off fixed amounts while maintaining a single forward transaction lineage.'}
                  {selectedEntity.heuristic_method.includes('Temporal') &&
                    'Temporal Co-occurrence Clustering identifies address clusters exhibiting synchronized transaction broadcast timestamps within a tightly bounded trailing block window.'}
                </p>
              </div>
            </div>

            {/* ── Supported Observed Evidence & Relationships ── */}
            <div className="p-4 bg-[var(--surface-2)] border border-[var(--border-default)] rounded-[var(--radius-md)] space-y-3">
              <div className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">
                SUPPORTED OBSERVED RELATIONSHIPS ({selectedEntity.supporting_evidence.length})
              </div>
              <div className="space-y-2">
                {selectedEntity.supporting_evidence.map((ev, i) => (
                  <div
                    key={i}
                    className="p-3 bg-[var(--surface-1)] border border-[var(--border-subtle)] rounded-[var(--radius-sm)] text-[11px] text-[var(--text-secondary)] leading-relaxed flex items-start gap-2.5"
                  >
                    <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent-primary)] shrink-0 mt-1.5" />
                    <span>{ev}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* ── Sample Grouped Addresses ── */}
            <div className="p-4 bg-[var(--surface-2)] border border-[var(--border-default)] rounded-[var(--radius-md)] space-y-3">
              <div className="flex items-center justify-between">
                <div className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">
                  SAMPLE GROUPED ADDRESS VECTORS ({selectedEntity.sample_addresses.length} of {selectedEntity.address_count})
                </div>
                <span className="text-[10px] text-[var(--text-tertiary)]">On-Chain Hashes</span>
              </div>

              <div className="space-y-2">
                {selectedEntity.sample_addresses.map((addr, i) => (
                  <div
                    key={i}
                    className="p-2.5 bg-[var(--surface-1)] border border-[var(--border-subtle)] rounded-[var(--radius-sm)] flex items-center justify-between gap-3"
                  >
                    <div className="flex items-center gap-2 overflow-hidden">
                      <span className="text-[10px] text-[var(--text-tertiary)] shrink-0">#{i + 1}</span>
                      <span className="text-xs text-[var(--text-primary)] font-mono truncate">
                        {addr}
                      </span>
                    </div>
                    <button
                      onClick={() => handleCopyAddress(addr)}
                      className="p-1 text-[var(--text-tertiary)] hover:text-[var(--text-primary)] bg-[var(--surface-2)] hover:bg-[var(--surface-3)] rounded-[var(--radius-sm)] transition-colors shrink-0"
                      title="Copy Address"
                    >
                      {copiedAddress === addr ? <Check size={13} className="text-[var(--risk-low)]" /> : <Copy size={13} />}
                    </button>
                  </div>
                ))}
              </div>
            </div>

            {/* ── Risk Context & Observed Signals ── */}
            <div className="p-4 bg-[var(--surface-2)] border border-[var(--border-default)] rounded-[var(--radius-md)] space-y-2.5">
              <div className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">
                RISK CONTEXT & OBSERVED SIGNALS
              </div>
              <p className="text-[11px] text-[var(--text-secondary)] leading-relaxed font-sans bg-[var(--surface-1)] p-3 rounded-[var(--radius-sm)] border border-[var(--border-subtle)]">
                Observed activity across member addresses includes {selectedEntity.associated_alerts_count} high-priority anomaly leads generated during the current analysis run. Anomaly signals reflect structural clustering and transaction velocity patterns.
              </p>
            </div>

            {/* ── Forensic Action CTAs ── */}
            <div className="pt-3 border-t border-[var(--border-subtle)] flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Link href={`/transactions?search=${encodeURIComponent(selectedEntity.entity_id)}`}>
                  <Button variant="primary" size="sm">
                    <ArrowLeftRight size={13} />
                    <span>VIEW RELATED TRANSACTIONS</span>
                  </Button>
                </Link>
                <Link href={`/graph?entity=${encodeURIComponent(selectedEntity.entity_id)}`}>
                  <Button variant="secondary" size="sm">
                    <ExternalLink size={13} />
                    <span>VIEW IN GRAPH</span>
                  </Button>
                </Link>
              </div>

              <Button variant="ghost" size="sm" onClick={handleCloseDossier}>
                <span>CLOSE DOSSIER</span>
              </Button>
            </div>
          </div>
        )}
      </Drawer>
    </PageContainer>
  );
}

export default function EntitiesPage() {
  return (
    <Suspense fallback={<LoadingState message="Loading candidate entity clusters..." />}>
      <EntitiesContent />
    </Suspense>
  );
}
