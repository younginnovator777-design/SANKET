'use client';

import { SystemStatusType } from '@/types';
import { Tooltip } from '@/components/ui';

interface SystemStatusProps {
  status?: SystemStatusType;
  compact?: boolean;
  className?: string;
}

const statusInfo: Record<SystemStatusType, { label: string; sublabel: string; dotClass: string }> = {
  OFFLINE: {
    label: 'Offline',
    sublabel: 'Airgapped Engine',
    dotClass: 'bg-[var(--risk-low)]',
  },
  READY: {
    label: 'Ready',
    sublabel: 'Local Pipeline',
    dotClass: 'bg-[var(--risk-low)]',
  },
  PROCESSING: {
    label: 'Processing',
    sublabel: 'Analyzing Dataset',
    dotClass: 'bg-[var(--accent-primary)] animate-pulse',
  },
  ERROR: {
    label: 'Error',
    sublabel: 'Engine Fault',
    dotClass: 'bg-[var(--risk-critical)]',
  },
};

export function SystemStatus({
  status = 'OFFLINE',
  compact = false,
  className = '',
}: SystemStatusProps) {
  const info = statusInfo[status];

  const content = (
    <div
      className={`
        inline-flex items-center gap-2
        px-2.5 py-1
        bg-[var(--surface-1)] border border-[var(--border-default)]
        rounded-[var(--radius-sm)]
        ${className}
      `}
      role="status"
      aria-label={`System status: ${info.label}. ${info.sublabel}`}
    >
      {/* Restrained indicator dot */}
      <span className="relative flex h-1.5 w-1.5">
        <span className={`inline-flex rounded-full h-1.5 w-1.5 ${info.dotClass}`} />
      </span>

      {/* Labels */}
      <div className="flex items-center gap-1.5">
        <span className="text-[11px] font-mono font-medium text-[var(--text-primary)] uppercase tracking-wider">
          {info.label}
        </span>
        {!compact && (
          <>
            <span className="text-[var(--text-muted)] text-[10px]">/</span>
            <span className="text-[10px] font-mono text-[var(--text-tertiary)] uppercase">
              {info.sublabel}
            </span>
          </>
        )}
      </div>
    </div>
  );

  return (
    <Tooltip content="All analysis is performed locally in an airgapped environment." position="bottom">
      {content}
    </Tooltip>
  );
}
