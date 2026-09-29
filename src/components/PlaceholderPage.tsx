'use client';

import React from 'react';
import { PageContainer } from '@/components/PageContainer';
import { Card, EmptyState } from '@/components/ui';

interface PlaceholderPageProps {
  title: string;
  description: string;
  icon: React.ReactNode;
  features?: string[];
}

/**
 * Shared placeholder page used for secondary routes during UI-1 phase.
 */
export function PlaceholderPage({
  title,
  description,
  icon,
  features,
}: PlaceholderPageProps) {
  return (
    <PageContainer
      title={title}
      description={description}
      icon={icon}
    >
      <Card className="mt-2 border-[var(--border-default)]">
        <EmptyState
          title={`MODULE: ${title}`}
          description={`Offline investigative module for ${title.toLowerCase()}. Module interface will mount here.`}
          icon={<span className="text-[var(--text-secondary)]">{icon}</span>}
        />
        {features && features.length > 0 && (
          <div className="border-t border-[var(--border-subtle)] px-6 py-4 bg-[var(--surface-1)]">
            <p className="text-[10px] font-mono font-semibold uppercase tracking-[0.1em] text-[var(--text-tertiary)] mb-3">
              Module Specifications & Capabilities
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
              {features.map((feature, i) => (
                <div
                  key={i}
                  className="
                    flex items-center gap-2.5 px-3 py-2
                    bg-[var(--surface-2)] border border-[var(--border-subtle)] rounded-[var(--radius-sm)]
                    text-xs text-[var(--text-secondary)]
                  "
                >
                  <span className="w-1 h-1 rounded-full bg-[var(--accent-primary)] shrink-0" />
                  <span className="font-mono text-[11px]">{feature}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </Card>
    </PageContainer>
  );
}
