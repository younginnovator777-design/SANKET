'use client';

import React, { useState } from 'react';
import { usePathname } from 'next/navigation';
import { Sidebar } from '@/components/Sidebar';
import { TopHeader } from '@/components/TopHeader';

interface AppShellProps {
  children: React.ReactNode;
}

/**
 * The main application shell — sidebar + top header + content area.
 * This wraps all pages in the (app) route group.
 * The landing page (pathname === '/') renders without the shell chrome.
 *
 * Sidebar collapse state is owned here so the content area margin
 * tracks the actual sidebar width — no blank gutter on collapse.
 */
export function AppShell({ children }: AppShellProps) {
  const pathname = usePathname();
  const isLandingPage = pathname === '/';
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  // Landing page renders full-screen without sidebar/header
  if (isLandingPage) {
    return <>{children}</>;
  }

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Sidebar */}
      <Sidebar collapsed={sidebarCollapsed} onToggle={() => setSidebarCollapsed((c) => !c)} />

      {/* Main content area — offset tracks actual sidebar width */}
      <div
        className={`
          flex-1 flex flex-col
          min-h-screen
          transition-[margin] duration-[var(--transition-slow)]
        `}
        style={{
          marginLeft: sidebarCollapsed
            ? 'var(--sidebar-collapsed-width)'
            : 'var(--sidebar-width)',
        }}
      >
        {/* Top Header */}
        <TopHeader />

        {/* Page content */}
        <main className="flex-1 overflow-y-auto bg-[var(--bg-primary)]">
          {children}
        </main>
      </div>
    </div>
  );
}
