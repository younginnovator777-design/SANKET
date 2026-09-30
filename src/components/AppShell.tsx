'use client';

import React from 'react';
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
 */
export function AppShell({ children }: AppShellProps) {
  const pathname = usePathname();
  const isLandingPage = pathname === '/';

  // Landing page renders full-screen without sidebar/header
  if (isLandingPage) {
    return <>{children}</>;
  }

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Sidebar */}
      <Sidebar />

      {/* Main content area — offset by sidebar width */}
      <div
        className="
          flex-1 flex flex-col
          ml-[var(--sidebar-width)]
          min-h-screen
          transition-[margin] duration-[var(--transition-slow)]
        "
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
