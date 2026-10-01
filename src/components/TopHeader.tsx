'use client';

import { useState, useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { mainNavItems, systemNavItems } from '@/config/navigation';
import { SystemStatus } from '@/components/SystemStatus';
import { useCurrentRun } from '@/context/RunContext';
import { getHealth } from '@/lib/api';
import type { SystemStatusType } from '@/types';

/**
 * Derives a compact display label for the current run lifecycle.
 * Returns null when there is no run to report.
 */
function useRunLabel(): { label: string; accent: boolean } | null {
  const { lifecycle, runId, currentRun } = useCurrentRun();

  if (lifecycle === 'idle' || !currentRun) {
    return null;
  }

  const id = runId || '—';

  switch (lifecycle) {
    case 'running':
      return { label: `${id || 'IN PROGRESS'}`, accent: true };
    case 'completed':
      return { label: id, accent: false };
    case 'failed':
      return { label: `${id} (FAILED)`, accent: false };
    default:
      return null;
  }
}

/**
 * Polls the backend /health endpoint to determine connection status.
 * Returns the appropriate SystemStatusType for the header badge.
 * This tracks backend *connectivity*, NOT analysis/run state.
 */
function useBackendHealth(): SystemStatusType {
  const [status, setStatus] = useState<SystemStatusType>('OFFLINE');

  useEffect(() => {
    let cancelled = false;

    async function check() {
      try {
        const res = await getHealth();
        if (!cancelled) {
          setStatus(res.status === 'healthy' ? 'READY' : 'OFFLINE');
        }
      } catch {
        if (!cancelled) {
          setStatus('OFFLINE');
        }
      }
    }

    // Initial check
    check();

    // Periodic health polling (every 30 seconds)
    const interval = setInterval(check, 30_000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  return status;
}

export function TopHeader() {
  const pathname = usePathname();
  const runLabel = useRunLabel();
  const backendStatus = useBackendHealth();
  const { lifecycle } = useCurrentRun();

  // Find current page info
  const allItems = [...mainNavItems, ...systemNavItems];
  const currentPage = allItems.find((item) => {
    if (item.href === '/overview' && pathname === '/') return true;
    return pathname === item.href || pathname.startsWith(item.href + '/');
  });

  const pageTitle = currentPage?.label || 'Overview';

  // If the pipeline is actively processing, override the backend status indicator
  const displayStatus: SystemStatusType =
    lifecycle === 'running' ? 'PROCESSING' : backendStatus;

  return (
    <header
      className="
        sticky top-0 z-20
        flex items-center justify-between
        h-[var(--header-height)]
        px-6
        bg-[var(--bg-primary)]
        border-b border-[var(--border-subtle)]
      "
      role="banner"
    >
      {/* Left: Page Title & Context */}
      <div className="flex items-center gap-3">
        <h1 className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--text-primary)]">
          {pageTitle}
        </h1>
        <span className="text-[var(--border-strong)]">/</span>
        <span className="text-xs text-[var(--text-tertiary)] hidden sm:inline">
          Bitcoin Transaction Intelligence
        </span>
      </div>

      {/* Right: Active Run Info + Backend Status */}
      <div className="flex items-center gap-3">
        {/* Run state — only shown when there is an actual run */}
        {runLabel ? (
          <div className="hidden md:flex items-center gap-1.5 px-2 py-0.5 rounded-[var(--radius-sm)] bg-[var(--surface-2)] border border-[var(--border-default)]">
            <span className="text-[10px] text-[var(--text-tertiary)] uppercase tracking-wider font-mono">
              {lifecycle === 'running' ? 'ACTIVE RUN:' : 'LAST RUN:'}
            </span>
            <span
              className={`text-[10px] font-mono font-medium ${
                runLabel.accent
                  ? 'text-[var(--accent-primary-light)]'
                  : 'text-[var(--text-secondary)]'
              }`}
            >
              {runLabel.label}
            </span>
          </div>
        ) : (
          <div className="hidden md:flex items-center gap-1.5 px-2 py-0.5 rounded-[var(--radius-sm)] bg-[var(--surface-2)] border border-[var(--border-default)]">
            <span className="text-[10px] text-[var(--text-muted)] uppercase tracking-wider font-mono">
              NO ACTIVE RUN
            </span>
          </div>
        )}
        <SystemStatus status={displayStatus} compact />
      </div>
    </header>
  );
}
