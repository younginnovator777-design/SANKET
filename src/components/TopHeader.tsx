'use client';

import { usePathname } from 'next/navigation';
import { mainNavItems, systemNavItems } from '@/config/navigation';
import { SystemStatus } from '@/components/SystemStatus';

export function TopHeader() {
  const pathname = usePathname();

  // Find current page info
  const allItems = [...mainNavItems, ...systemNavItems];
  const currentPage = allItems.find((item) => {
    if (item.href === '/overview' && pathname === '/') return true;
    return pathname === item.href || pathname.startsWith(item.href + '/');
  });

  const pageTitle = currentPage?.label || 'Overview';

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

      {/* Right: Active Run ID + Airgapped Status */}
      <div className="flex items-center gap-3">
        <div className="hidden md:flex items-center gap-1.5 px-2 py-0.5 rounded-[var(--radius-sm)] bg-[var(--surface-2)] border border-[var(--border-default)]">
          <span className="text-[10px] text-[var(--text-tertiary)] uppercase tracking-wider font-mono">ACTIVE RUN:</span>
          <span className="text-[10px] text-[var(--accent-primary-light)] font-mono font-medium">RUN-2024-001</span>
        </div>
        <SystemStatus status="OFFLINE" compact />
      </div>
    </header>
  );
}
