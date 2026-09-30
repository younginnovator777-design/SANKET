'use client';

import React, { useState, useMemo, Suspense } from 'react';
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
import { getLatestRun, ApiLatestRun } from '@/lib/api';
import { CandidateEntity, RiskLevel } from '@/types';

type RiskFilterOption = 'ALL' | 'CRITICAL' | 'HIGH' | 'MEDIUM';

// ---------------------------------------------------------------------------
// EntitiesContent: API-connected version
// The backend currently does not expose a candidate-entity list endpoint.
// When GET /api/v1/entities is available, wire it here.
// ---------------------------------------------------------------------------
function EntitiesContent() {
  const searchParams = useSearchParams();

  const [latestRun, setLatestRun] = React.useState<ApiLatestRun | null>(null);

  React.useEffect(() => {
    getLatestRun().then(setLatestRun).catch(() => {});
  }, []);

  const activeRunId = latestRun?.run_id ?? '—';
  const activeDatasetName = (latestRun?.dataset_metadata?.name as string) ?? '—';

  return (
    <PageContainer
      title="CANDIDATE ENTITIES"
      description="Heuristic address clusters and candidate ownership groupings derived from co-spend analysis."
      tag="ENTITY CLUSTERING"
      icon={<Users size={18} />}
      actions={
        <Link href="/graph">
          <Button variant="secondary" size="sm">
            <GitBranch size={13} />
            <span>Graph View</span>
          </Button>
        </Link>
      }
    >
      <div className="space-y-4">
        {/* Header strip */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 bg-[var(--surface-1)] border border-[var(--border-default)] rounded-[var(--radius-md)] text-xs font-mono">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] uppercase text-[var(--text-tertiary)]">ACTIVE RUN:</span>
              <span className="font-semibold text-[var(--accent-primary-light)]">{activeRunId}</span>
            </div>
            <span className="text-[var(--border-strong)]">|</span>
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] uppercase text-[var(--text-tertiary)]">DATASET:</span>
              <span className="text-[var(--text-primary)] font-medium">{activeDatasetName}</span>
            </div>
          </div>
          <div className="flex items-center gap-2 text-[11px] text-[var(--text-secondary)]">
            <span className="w-1.5 h-1.5 rounded-full bg-[var(--risk-low)]" />
            <span className="uppercase tracking-wider">AIRGAPPED / OFFLINE</span>
          </div>
        </div>

        {/* Empty state — entity endpoint not yet available */}
        <EmptyState
          title="ENTITY ENDPOINT NOT YET AVAILABLE"
          description={"The backend does not yet expose GET /api/v1/entities. Candidate entity clusters are derived during analysis and will appear here once the endpoint is implemented. Navigate to the Graph view to explore heuristic relationships."}
          action={
            <div className="flex items-center gap-3">
              <Link href="/analyze">
                <Button variant="accent" size="md">
                  <span>Run Analysis</span>
                  <ArrowLeftRight size={14} />
                </Button>
              </Link>
              <Link href="/graph">
                <Button variant="secondary" size="md">
                  <GitBranch size={13} />
                  <span>Graph View</span>
                </Button>
              </Link>
            </div>
          }
        />

        {/* Informational note on heuristics */}
        <div className="p-4 bg-[var(--surface-1)] border border-[var(--border-default)] rounded-[var(--radius-md)] space-y-2 font-mono text-xs">
          <div className="flex items-center gap-2 text-[var(--accent-primary-light)] font-semibold text-[10px] uppercase tracking-wider">
            <Info size={13} />
            <span>About Candidate Entity Clustering</span>
          </div>
          <p className="text-[var(--text-secondary)] leading-relaxed">
            Candidate entities are heuristic address clusters derived from common-input-ownership (CIO) and
            change-address analysis. Each cluster represents a set of addresses that the SANKET pipeline
            believes may be controlled by the same economic actor, without establishing legal ownership.
          </p>
          <p className="text-[var(--text-tertiary)] leading-relaxed">
            Clusters and their associated forensic metadata (address lists, aggregated volumes, risk assessments)
            are built during the analysis pipeline and are visible within the Graph Investigation view.
          </p>
        </div>
      </div>
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
