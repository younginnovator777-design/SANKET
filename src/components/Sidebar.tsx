'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  Upload,
  ShieldAlert,
  ArrowLeftRight,
  Users,
  GitBranch,
  BarChart3,
  History,
  Settings,
  ChevronLeft,
  ChevronRight,
  Radio,
} from 'lucide-react';
import { mainNavItems, systemNavItems } from '@/config/navigation';
import { Tooltip } from '@/components/ui';

// Map icon string names to Lucide components
const iconMap: Record<string, React.ElementType> = {
  LayoutDashboard,
  Upload,
  ShieldAlert,
  ArrowLeftRight,
  Users,
  GitBranch,
  BarChart3,
  History,
  Settings,
};

interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
}

export function Sidebar({ collapsed, onToggle }: SidebarProps) {
  const pathname = usePathname();

  const isActive = (href: string) => {
    if (href === '/overview' && pathname === '/') return true;
    return pathname === href || pathname.startsWith(href + '/');
  };

  const NavLink = ({ item }: { item: typeof mainNavItems[0] }) => {
    const Icon = iconMap[item.icon] || LayoutDashboard;
    const active = isActive(item.href);

    const linkContent = (
      <Link
        href={item.href}
        className={`
          group relative flex items-center gap-3
          ${collapsed ? 'justify-center px-0' : 'px-3'}
          py-2 rounded-[var(--radius-sm)]
          text-xs font-medium tracking-wide
          transition-colors duration-[var(--transition-fast)]
          ${active
            ? 'bg-[var(--accent-primary-subtle)] text-[var(--text-primary)] border border-[var(--accent-primary-border)]'
            : 'text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] border border-transparent'
          }
        `}
        aria-current={active ? 'page' : undefined}
      >
        {/* Subtle accent indicator pip on active */}
        {active && (
          <span className="absolute left-1 top-1/2 -translate-y-1/2 w-1 h-3.5 bg-[var(--accent-primary)] rounded-xs" />
        )}

        <Icon
          size={16}
          className={`shrink-0 transition-colors ${
            active ? 'text-[var(--accent-primary)] ml-1' : 'text-[var(--text-tertiary)] group-hover:text-[var(--text-secondary)]'
          }`}
        />

        {!collapsed && (
          <span className="truncate">{item.label}</span>
        )}
      </Link>
    );

    if (collapsed) {
      return (
        <Tooltip content={item.label} position="right">
          {linkContent}
        </Tooltip>
      );
    }

    return linkContent;
  };

  return (
    <aside
      className={`
        fixed top-0 left-0 z-30
        h-full
        bg-[var(--bg-secondary)] border-r border-[var(--border-subtle)]
        flex flex-col
        transition-[width] duration-[var(--transition-slow)]
        ${collapsed ? 'w-[var(--sidebar-collapsed-width)]' : 'w-[var(--sidebar-width)]'}
      `}
      role="navigation"
      aria-label="Main navigation"
    >
      {/* ── Brand / Wordmark ── */}
      <div className={`
        flex items-center ${collapsed ? 'justify-center' : 'justify-between'}
        h-[var(--header-height)]
        px-4 border-b border-[var(--border-subtle)]
        shrink-0
      `}>
        {!collapsed ? (
          <div className="flex items-center gap-2.5">
            {/* Minimal geometric signal mark */}
            <div className="flex items-center justify-center w-6 h-6 rounded-[var(--radius-sm)] bg-[var(--surface-2)] border border-[var(--border-default)]">
              <svg width="12" height="12" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                <circle cx="8" cy="8" r="2.5" fill="var(--accent-primary)" />
                <circle cx="8" cy="8" r="6.5" stroke="var(--text-tertiary)" strokeWidth="1" strokeDasharray="2 2" />
                <line x1="8" y1="1" x2="8" y2="3.5" stroke="var(--text-tertiary)" strokeWidth="1" />
                <line x1="8" y1="12.5" x2="8" y2="15" stroke="var(--text-tertiary)" strokeWidth="1" />
              </svg>
            </div>
            <div className="flex flex-col">
              <span className="text-xs font-bold tracking-[0.18em] text-[var(--text-primary)]">
                SANKET
              </span>
              <span className="text-[9px] uppercase tracking-[0.06em] text-[var(--text-tertiary)] leading-tight">
                Forensic Intelligence
              </span>
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-center w-7 h-7 rounded-[var(--radius-sm)] bg-[var(--surface-2)] border border-[var(--border-default)]">
            <span className="text-xs font-bold text-[var(--accent-primary)] font-mono">S</span>
          </div>
        )}
      </div>

      {/* ── Main Navigation ── */}
      <div className="flex-1 overflow-y-auto px-2.5 py-3 space-y-4">
        {/* Core section */}
        <div>
          {!collapsed && (
            <div className="px-3 pb-1.5 text-[10px] font-semibold tracking-[0.12em] uppercase text-[var(--text-muted)]">
              Console
            </div>
          )}
          <nav className="space-y-0.5">
            {mainNavItems.map((item) => (
              <NavLink key={item.href} item={item} />
            ))}
          </nav>
        </div>

        {/* System section */}
        <div>
          {!collapsed && (
            <div className="px-3 pb-1.5 text-[10px] font-semibold tracking-[0.12em] uppercase text-[var(--text-muted)]">
              System
            </div>
          )}
          <div className="space-y-0.5">
            {systemNavItems.map((item) => (
              <NavLink key={item.href} item={item} />
            ))}
          </div>
        </div>
      </div>

      {/* ── Bottom Section: Status + Collapse Toggle ── */}
      <div className="p-2.5 border-t border-[var(--border-subtle)] space-y-2 shrink-0 bg-[var(--bg-primary)]/40">
        {/* Offline Badge */}
        {!collapsed ? (
          <div className="flex items-center justify-between px-2.5 py-1.5 rounded-[var(--radius-sm)] bg-[var(--surface-1)] border border-[var(--border-subtle)]">
            <div className="flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-[var(--risk-low)]" />
              <span className="text-[11px] font-mono uppercase tracking-wider text-[var(--text-secondary)]">
                OFFLINE MODE
              </span>
            </div>
            <span className="text-[9px] uppercase tracking-widest text-[var(--text-muted)]">AIRGAPPED</span>
          </div>
        ) : (
          <div className="flex justify-center py-1">
            <Tooltip content="Offline Mode — Airgapped Local Execution" position="right">
              <span className="w-2 h-2 rounded-full bg-[var(--risk-low)]" />
            </Tooltip>
          </div>
        )}

        {/* Collapse toggle */}
        <button
          onClick={() => onToggle()}
          className={`
            flex items-center ${collapsed ? 'justify-center' : 'justify-between'}
            w-full px-2.5 py-1.5 rounded-[var(--radius-sm)]
            text-[11px] text-[var(--text-tertiary)]
            hover:bg-[var(--bg-hover)] hover:text-[var(--text-secondary)]
            transition-colors duration-[var(--transition-fast)]
            cursor-pointer
          `}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {!collapsed && <span>Collapse Sidebar</span>}
          {collapsed ? <ChevronRight size={13} /> : <ChevronLeft size={13} />}
        </button>
      </div>
    </aside>
  );
}
