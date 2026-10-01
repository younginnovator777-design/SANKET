'use client';

import React from 'react';

interface PageContainerProps {
  title: string;
  description?: string;
  icon?: React.ReactNode;
  children?: React.ReactNode;
  actions?: React.ReactNode;
  tag?: string;
}

/**
 * Reusable page layout wrapper. Ensures consistent spacing, max-width,
 * and visual structure across forensic intelligence views.
 */
export function PageContainer({
  title,
  description,
  icon,
  children,
  actions,
  tag,
}: PageContainerProps) {
  return (
    <div className="flex-1 w-full min-h-0">
      <div className="mx-auto max-w-[var(--page-max-width)] px-[var(--page-padding)] py-6">
        {/* ── Page Header ── */}
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 pb-6 mb-6 border-b border-[var(--border-subtle)]">
          <div className="flex items-start gap-3.5">
            {icon && (
              <div className="
                w-9 h-9 rounded-[var(--radius-sm)]
                bg-[var(--surface-2)] border border-[var(--border-default)]
                flex items-center justify-center shrink-0 mt-0.5
              ">
                <span className="text-[var(--text-secondary)]">{icon}</span>
              </div>
            )}
            <div>
              <div className="flex items-center gap-2.5">
                {tag && (
                  <span className="text-[10px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded-[var(--radius-sm)] bg-[var(--surface-2)] text-[var(--accent-primary-light)] border border-[var(--border-default)]">
                    {tag}
                  </span>
                )}
                <h1 className="text-base font-semibold uppercase tracking-[0.06em] text-[var(--text-primary)]">
                  {title}
                </h1>
              </div>
              {description && (
                <p className="mt-1 text-xs text-[var(--text-secondary)] max-w-2xl leading-relaxed">
                  {description}
                </p>
              )}
            </div>
          </div>
          {actions && <div className="flex flex-wrap items-center gap-2 shrink-0">{actions}</div>}
        </div>

        {/* ── Page Content ── */}
        {children}
      </div>
    </div>
  );
}
