'use client';

import React from 'react';
import { RiskLevel, StatusType } from '@/types';

// ============================================================
// Button
// ============================================================

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'accent';
  size?: 'sm' | 'md' | 'lg';
  children: React.ReactNode;
}

export function Button({
  variant = 'secondary',
  size = 'md',
  children,
  className = '',
  disabled,
  ...props
}: ButtonProps) {
  const baseStyles = `
    inline-flex items-center justify-center gap-2
    font-medium rounded-[var(--radius-sm)]
    transition-colors duration-[var(--transition-fast)]
    cursor-pointer select-none
    focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent-primary)]
    disabled:opacity-30 disabled:cursor-not-allowed
  `;

  const variants: Record<string, string> = {
    // Primary: Dark graphite with crisp border and warm off-white text
    primary: `
      bg-[var(--surface-3)] text-[var(--text-primary)]
      border border-[var(--border-strong)]
      hover:bg-[var(--bg-hover)] hover:border-[var(--accent-primary-border)]
      active:bg-[var(--bg-active)]
    `,
    // Accent: Warm amber/copper tone for high priority actions
    accent: `
      bg-[var(--accent-primary)] text-[#080808] font-semibold
      hover:bg-[var(--accent-primary-hover)]
      active:bg-[var(--accent-primary)]
    `,
    // Secondary: Subdued surface with subtle border
    secondary: `
      bg-[var(--surface-1)] text-[var(--text-secondary)]
      border border-[var(--border-default)]
      hover:bg-[var(--surface-2)] hover:text-[var(--text-primary)] hover:border-[var(--border-strong)]
    `,
    // Ghost: Transparent with hover
    ghost: `
      bg-transparent text-[var(--text-secondary)]
      hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]
    `,
    // Danger: Desaturated critical red
    danger: `
      bg-[var(--risk-critical-bg)] text-[var(--risk-critical)]
      border border-[var(--risk-critical-border)]
      hover:bg-[var(--risk-critical)] hover:text-white
    `,
  };

  const sizes: Record<string, string> = {
    sm: 'h-7 px-2.5 text-xs',
    md: 'h-8 px-3.5 text-xs',
    lg: 'h-10 px-5 text-sm',
  };

  return (
    <button
      className={`${baseStyles} ${variants[variant]} ${sizes[size]} ${className}`}
      disabled={disabled}
      {...props}
    >
      {children}
    </button>
  );
}

// ============================================================
// IconButton
// ============================================================

interface IconButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  icon: React.ReactNode;
  label: string;
  size?: 'sm' | 'md' | 'lg';
  variant?: 'ghost' | 'secondary';
}

export function IconButton({
  icon,
  label,
  size = 'md',
  variant = 'ghost',
  className = '',
  ...props
}: IconButtonProps) {
  const sizes: Record<string, string> = {
    sm: 'h-7 w-7',
    md: 'h-8 w-8',
    lg: 'h-10 w-10',
  };

  const variants: Record<string, string> = {
    ghost: 'bg-transparent hover:bg-[var(--bg-hover)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]',
    secondary: 'bg-[var(--surface-1)] border border-[var(--border-default)] hover:bg-[var(--surface-2)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]',
  };

  return (
    <button
      className={`
        inline-flex items-center justify-center rounded-[var(--radius-sm)]
        transition-colors duration-[var(--transition-fast)]
        cursor-pointer
        focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent-primary)]
        ${sizes[size]} ${variants[variant]} ${className}
      `}
      aria-label={label}
      title={label}
      {...props}
    >
      {icon}
    </button>
  );
}

// ============================================================
// Badge
// ============================================================

interface BadgeProps {
  children: React.ReactNode;
  variant?: 'default' | 'outline' | 'accent' | 'muted';
  size?: 'sm' | 'md';
  className?: string;
}

export function Badge({
  children,
  variant = 'default',
  size = 'sm',
  className = '',
}: BadgeProps) {
  const baseStyles = 'inline-flex items-center font-mono font-medium rounded-[var(--radius-sm)] uppercase tracking-wider';

  const variants: Record<string, string> = {
    default: 'bg-[var(--surface-2)] text-[var(--text-secondary)] border border-[var(--border-default)]',
    outline: 'bg-transparent text-[var(--text-secondary)] border border-[var(--border-default)]',
    accent: 'bg-[var(--accent-primary-subtle)] text-[var(--accent-primary-light)] border border-[var(--accent-primary-border)]',
    muted: 'bg-[var(--surface-1)] text-[var(--text-muted)] border border-[var(--border-subtle)]',
  };

  const sizes: Record<string, string> = {
    sm: 'text-[10px] px-1.5 py-0.5',
    md: 'text-xs px-2 py-0.5',
  };

  return (
    <span className={`${baseStyles} ${variants[variant]} ${sizes[size]} ${className}`}>
      {children}
    </span>
  );
}

// ============================================================
// RiskBadge
// ============================================================

interface RiskBadgeProps {
  level: RiskLevel;
  size?: 'sm' | 'md';
  showDot?: boolean;
  className?: string;
}

const riskStyles: Record<RiskLevel, { bg: string; text: string; border: string; dot: string }> = {
  LOW: {
    bg: 'bg-[var(--risk-low-bg)]',
    text: 'text-[var(--risk-low)]',
    border: 'border-[var(--risk-low-border)]',
    dot: 'bg-[var(--risk-low)]',
  },
  MEDIUM: {
    bg: 'bg-[var(--risk-medium-bg)]',
    text: 'text-[var(--risk-medium)]',
    border: 'border-[var(--risk-medium-border)]',
    dot: 'bg-[var(--risk-medium)]',
  },
  HIGH: {
    bg: 'bg-[var(--risk-high-bg)]',
    text: 'text-[var(--risk-high)]',
    border: 'border-[var(--risk-high-border)]',
    dot: 'bg-[var(--risk-high)]',
  },
  CRITICAL: {
    bg: 'bg-[var(--risk-critical-bg)]',
    text: 'text-[var(--risk-critical)]',
    border: 'border-[var(--risk-critical-border)]',
    dot: 'bg-[var(--risk-critical)]',
  },
};

export function RiskBadge({
  level,
  size = 'sm',
  showDot = true,
  className = '',
}: RiskBadgeProps) {
  const style = riskStyles[level];
  const sizeStyles = size === 'sm' ? 'text-[10px] px-1.5 py-0.5' : 'text-xs px-2 py-0.5';

  return (
    <span
      className={`
        inline-flex items-center gap-1.5
        font-mono font-medium uppercase tracking-wider
        rounded-[var(--radius-sm)] border
        ${style.bg} ${style.text} ${style.border} ${sizeStyles} ${className}
      `}
      role="status"
    >
      {showDot && (
        <span className={`w-1.5 h-1.5 rounded-full ${style.dot} shrink-0`} />
      )}
      <span>{level}</span>
    </span>
  );
}

// ============================================================
// StatusBadge
// ============================================================

interface StatusBadgeProps {
  status: StatusType;
  size?: 'sm' | 'md';
  className?: string;
}

const statusBadgeStyles: Record<StatusType, { bg: string; text: string; border: string; dot: string; label: string }> = {
  completed: {
    bg: 'bg-[var(--risk-low-bg)]',
    text: 'text-[var(--risk-low)]',
    border: 'border-[var(--risk-low-border)]',
    dot: 'bg-[var(--risk-low)]',
    label: 'COMPLETED',
  },
  processing: {
    bg: 'bg-[var(--accent-primary-subtle)]',
    text: 'text-[var(--accent-primary-light)]',
    border: 'border-[var(--accent-primary-border)]',
    dot: 'bg-[var(--accent-primary)] animate-pulse',
    label: 'PROCESSING',
  },
  failed: {
    bg: 'bg-[var(--risk-critical-bg)]',
    text: 'text-[var(--risk-critical)]',
    border: 'border-[var(--risk-critical-border)]',
    dot: 'bg-[var(--risk-critical)]',
    label: 'FAILED',
  },
  queued: {
    bg: 'bg-[var(--surface-2)]',
    text: 'text-[var(--text-tertiary)]',
    border: 'border-[var(--border-default)]',
    dot: 'bg-[var(--text-muted)]',
    label: 'QUEUED',
  },
};

export function StatusBadge({
  status,
  size = 'sm',
  className = '',
}: StatusBadgeProps) {
  const style = statusBadgeStyles[status];
  const sizeStyles = size === 'sm' ? 'text-[10px] px-1.5 py-0.5' : 'text-xs px-2 py-0.5';

  return (
    <span
      className={`
        inline-flex items-center gap-1.5
        font-mono font-medium uppercase tracking-wider
        rounded-[var(--radius-sm)] border
        ${style.bg} ${style.text} ${style.border} ${sizeStyles} ${className}
      `}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${style.dot} shrink-0`} />
      <span>{style.label}</span>
    </span>
  );
}

// ============================================================
// Card
// ============================================================

interface CardProps {
  children: React.ReactNode;
  className?: string;
  hover?: boolean;
  onClick?: () => void;
}

export function Card({
  children,
  className = '',
  hover = false,
  onClick,
}: CardProps) {
  return (
    <div
      onClick={onClick}
      className={`
        bg-[var(--surface-1)] border border-[var(--border-subtle)]
        rounded-[var(--radius-md)] p-5
        ${hover ? 'hover:border-[var(--border-strong)] hover:bg-[var(--surface-2)] transition-colors duration-[var(--transition-fast)] cursor-pointer' : ''}
        ${className}
      `}
    >
      {children}
    </div>
  );
}

// ============================================================
// MetricCard
// ============================================================

interface MetricCardProps {
  label: string;
  value: string | number;
  sublabel?: string;
  change?: string;
  changeType?: 'positive' | 'negative' | 'neutral';
  accentIndicator?: boolean;
  className?: string;
}

export function MetricCard({
  label,
  value,
  sublabel,
  change,
  changeType = 'neutral',
  accentIndicator = false,
  className = '',
}: MetricCardProps) {
  return (
    <div
      className={`
        relative bg-[var(--surface-1)] border border-[var(--border-default)]
        rounded-[var(--radius-md)] p-4 flex flex-col justify-between
        ${className}
      `}
    >
      {accentIndicator && (
        <span className="absolute top-0 left-3 right-3 h-[2px] bg-[var(--accent-primary)]/60" />
      )}

      <div>
        <span className="text-[10px] font-mono uppercase tracking-[0.1em] text-[var(--text-tertiary)] block mb-1">
          {label}
        </span>
        <div className="text-metric text-[var(--text-primary)] font-mono">
          {value}
        </div>
      </div>

      {(sublabel || change) && (
        <div className="flex items-center gap-2 mt-2 pt-2 border-t border-[var(--border-subtle)]">
          {change && (
            <span
              className={`text-[10px] font-mono ${
                changeType === 'positive'
                  ? 'text-[var(--risk-low)]'
                  : changeType === 'negative'
                  ? 'text-[var(--risk-critical)]'
                  : 'text-[var(--text-secondary)]'
              }`}
            >
              {change}
            </span>
          )}
          {sublabel && (
            <span className="text-[10px] font-mono text-[var(--text-muted)]">
              {sublabel}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

// ============================================================
// SectionHeader
// ============================================================

interface SectionHeaderProps {
  title: string;
  description?: string;
  badge?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}

export function SectionHeader({
  title,
  description,
  badge,
  action,
  className = '',
}: SectionHeaderProps) {
  return (
    <div className={`flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-[var(--border-subtle)] ${className}`}>
      <div>
        <div className="flex items-center gap-2.5">
          <h2 className="text-sm font-semibold tracking-wide uppercase text-[var(--text-primary)]">
            {title}
          </h2>
          {badge}
        </div>
        {description && (
          <p className="text-xs text-[var(--text-secondary)] mt-0.5">
            {description}
          </p>
        )}
      </div>
      {action && <div className="flex items-center gap-2 shrink-0">{action}</div>}
    </div>
  );
}

// ============================================================
// SearchInput
// ============================================================

interface SearchInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  onSearch?: (value: string) => void;
}

export function SearchInput({
  placeholder = 'Search records, hashes, addresses...',
  className = '',
  ...props
}: SearchInputProps) {
  return (
    <div className={`relative flex items-center ${className}`}>
      <svg
        className="absolute left-3 w-3.5 h-3.5 text-[var(--text-tertiary)] pointer-events-none"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={2}
      >
        <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
      </svg>
      <input
        type="text"
        placeholder={placeholder}
        className="
          w-full h-8 pl-8 pr-3
          bg-[var(--surface-1)] text-[var(--text-primary)] text-xs font-mono
          placeholder:text-[var(--text-muted)] placeholder:font-sans
          border border-[var(--border-default)] rounded-[var(--radius-sm)]
          focus:border-[var(--accent-primary-border)] focus:outline-none
          transition-colors duration-[var(--transition-fast)]
        "
        {...props}
      />
    </div>
  );
}

// ============================================================
// FilterButton
// ============================================================

interface FilterButtonProps {
  label: string;
  active?: boolean;
  count?: number;
  onClick?: () => void;
  className?: string;
}

export function FilterButton({
  label,
  active = false,
  count,
  onClick,
  className = '',
}: FilterButtonProps) {
  return (
    <button
      onClick={onClick}
      className={`
        inline-flex items-center gap-1.5
        h-7 px-2.5
        text-[11px] font-mono uppercase tracking-wider
        rounded-[var(--radius-sm)] border
        transition-colors duration-[var(--transition-fast)]
        cursor-pointer
        ${active
          ? 'bg-[var(--accent-primary-subtle)] text-[var(--accent-primary-light)] border-[var(--accent-primary-border)]'
          : 'bg-[var(--surface-1)] text-[var(--text-secondary)] border-[var(--border-default)] hover:bg-[var(--surface-2)] hover:text-[var(--text-primary)]'
        }
        ${className}
      `}
    >
      <span>{label}</span>
      {count !== undefined && (
        <span
          className={`
            text-[9px] px-1 py-0.2 rounded-xs font-mono
            ${active ? 'bg-[var(--accent-primary-muted)] text-[var(--accent-primary)]' : 'bg-[var(--surface-2)] text-[var(--text-tertiary)]'}
          `}
        >
          {count}
        </span>
      )}
    </button>
  );
}

// ============================================================
// DataTable
// ============================================================

export interface Column<T> {
  key: string;
  header: string;
  render?: (item: T) => React.ReactNode;
  width?: string;
  align?: 'left' | 'center' | 'right';
  mono?: boolean;
}

interface DataTableProps<T> {
  columns: Column<T>[];
  data: T[];
  keyExtractor: (item: T) => string;
  onRowClick?: (item: T) => void;
  emptyMessage?: string;
  className?: string;
}

export function DataTable<T>({
  columns,
  data,
  keyExtractor,
  onRowClick,
  emptyMessage = 'No records found in active dataset.',
  className = '',
}: DataTableProps<T>) {
  if (data.length === 0) {
    return (
      <div className="text-center py-10 border border-[var(--border-subtle)] rounded-[var(--radius-md)] bg-[var(--surface-1)]">
        <p className="text-xs font-mono text-[var(--text-tertiary)]">{emptyMessage}</p>
      </div>
    );
  }

  return (
    <div className={`overflow-x-auto rounded-[var(--radius-md)] border border-[var(--border-subtle)] ${className}`}>
      <table className="w-full text-left border-collapse text-xs">
        <thead>
          <tr className="border-b border-[var(--border-default)] bg-[var(--surface-1)]">
            {columns.map((col) => (
              <th
                key={col.key}
                style={{ width: col.width }}
                className={`
                  px-3.5 py-2.5
                  text-[10px] font-mono font-semibold uppercase tracking-[0.1em]
                  text-[var(--text-tertiary)]
                  ${col.align === 'right' ? 'text-right' : col.align === 'center' ? 'text-center' : 'text-left'}
                `}
              >
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-[var(--border-subtle)] bg-[var(--bg-primary)]">
          {data.map((item) => (
            <tr
              key={keyExtractor(item)}
              onClick={() => onRowClick?.(item)}
              className={`
                transition-colors duration-[var(--transition-fast)]
                ${onRowClick ? 'cursor-pointer hover:bg-[var(--surface-1)]' : ''}
              `}
            >
              {columns.map((col) => (
                <td
                  key={col.key}
                  className={`
                    px-3.5 py-2.5
                    ${col.mono ? 'font-mono' : ''}
                    text-[var(--text-primary)]
                    ${col.align === 'right' ? 'text-right' : col.align === 'center' ? 'text-center' : 'text-left'}
                  `}
                >
                  {col.render
                    ? col.render(item)
                    : String((item as Record<string, unknown>)[col.key] ?? '')}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ============================================================
// EmptyState
// ============================================================

interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description: string;
  action?: React.ReactNode;
  className?: string;
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  className = '',
}: EmptyStateProps) {
  return (
    <div
      className={`
        flex flex-col items-center justify-center text-center
        p-10 border border-[var(--border-subtle)] rounded-[var(--radius-md)]
        bg-[var(--surface-1)]
        ${className}
      `}
    >
      {icon && (
        <div className="flex items-center justify-center w-10 h-10 rounded-[var(--radius-sm)] bg-[var(--surface-2)] border border-[var(--border-default)] text-[var(--text-tertiary)] mb-3">
          {icon}
        </div>
      )}
      <h3 className="text-xs font-mono font-semibold uppercase tracking-[0.1em] text-[var(--text-primary)] mb-1">
        {title}
      </h3>
      <p className="text-xs text-[var(--text-secondary)] max-w-sm mb-4">
        {description}
      </p>
      {action && <div>{action}</div>}
    </div>
  );
}

// ============================================================
// LoadingState
// ============================================================

interface LoadingStateProps {
  message?: string;
  className?: string;
}

export function LoadingState({
  message = 'Executing local analysis pipeline...',
  className = '',
}: LoadingStateProps) {
  return (
    <div
      className={`
        flex flex-col items-center justify-center
        py-12 gap-3
        ${className}
      `}
      role="status"
    >
      {/* Restrained horizontal loader bar */}
      <div className="w-36 h-[2px] bg-[var(--surface-3)] overflow-hidden rounded-full relative">
        <div className="absolute inset-0 bg-[var(--accent-primary)] animate-[shimmer_1.5s_infinite] -translate-x-full" />
      </div>
      <span className="text-xs font-mono uppercase tracking-wider text-[var(--text-tertiary)]">
        {message}
      </span>
    </div>
  );
}

// ============================================================
// Tooltip
// ============================================================

interface TooltipProps {
  content: string;
  position?: 'top' | 'bottom' | 'left' | 'right';
  children: React.ReactNode;
  className?: string;
}

export function Tooltip({
  content,
  position = 'top',
  children,
  className = '',
}: TooltipProps) {
  const positionClasses: Record<string, string> = {
    top: 'bottom-full left-1/2 -translate-x-1/2 mb-1.5',
    bottom: 'top-full left-1/2 -translate-x-1/2 mt-1.5',
    left: 'right-full top-1/2 -translate-y-1/2 mr-1.5',
    right: 'left-full top-1/2 -translate-y-1/2 ml-1.5',
  };

  return (
    <div className={`relative group inline-flex ${className}`}>
      {children}
      <div
        className={`
          absolute z-50 ${positionClasses[position]}
          hidden group-hover:block
          px-2 py-1
          bg-[var(--surface-elevated)] text-[var(--text-primary)]
          text-[10px] font-mono uppercase tracking-wider
          rounded-[var(--radius-sm)] border border-[var(--border-default)]
          shadow-md whitespace-nowrap pointer-events-none
        `}
        role="tooltip"
      >
        {content}
      </div>
    </div>
  );
}

// ============================================================
// Modal
// ============================================================

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  className?: string;
}

export function Modal({
  isOpen,
  onClose,
  title,
  children,
  footer,
  className = '',
}: ModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#000000]/80">
      <div
        className={`
          relative w-full max-w-lg
          bg-[var(--surface-1)] border border-[var(--border-default)]
          rounded-[var(--radius-md)] shadow-lg
          flex flex-col max-h-[90vh]
          ${className}
        `}
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-[var(--border-subtle)]">
          <h3
            id="modal-title"
            className="text-xs font-mono font-semibold uppercase tracking-[0.1em] text-[var(--text-primary)]"
          >
            {title}
          </h3>
          <button
            onClick={onClose}
            className="text-[var(--text-tertiary)] hover:text-[var(--text-primary)] transition-colors p-1"
            aria-label="Close dialog"
          >
            ✕
          </button>
        </div>

        {/* Content */}
        <div className="p-5 overflow-y-auto flex-1">{children}</div>

        {/* Footer */}
        {footer && (
          <div className="flex items-center justify-end gap-2 px-5 py-3.5 border-t border-[var(--border-subtle)] bg-[var(--bg-primary)]">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================
// Drawer
// ============================================================

interface DrawerProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  side?: 'right' | 'left';
  className?: string;
}

export function Drawer({
  isOpen,
  onClose,
  title,
  children,
  side = 'right',
  className = '',
}: DrawerProps) {
  if (!isOpen) return null;

  const sideClasses = side === 'right' ? 'right-0 border-l' : 'left-0 border-r';

  return (
    <div className="fixed inset-0 z-50 bg-[#000000]/70">
      <div
        className={`
          fixed top-0 ${sideClasses}
          h-full w-full max-w-md
          bg-[var(--surface-1)] border-[var(--border-default)]
          shadow-lg flex flex-col
          ${className}
        `}
        role="dialog"
        aria-modal="true"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-[var(--border-subtle)]">
          <h3 className="text-xs font-mono font-semibold uppercase tracking-[0.1em] text-[var(--text-primary)]">
            {title}
          </h3>
          <button
            onClick={onClose}
            className="text-[var(--text-tertiary)] hover:text-[var(--text-primary)] transition-colors p-1"
            aria-label="Close drawer"
          >
            ✕
          </button>
        </div>

        {/* Content */}
        <div className="p-5 overflow-y-auto flex-1">{children}</div>
      </div>
    </div>
  );
}

// ============================================================
// Tabs
// ============================================================

interface TabItem {
  id: string;
  label: string;
  count?: number;
}

interface TabsProps {
  tabs: TabItem[];
  activeTab: string;
  onChange: (id: string) => void;
  className?: string;
}

export function Tabs({
  tabs,
  activeTab,
  onChange,
  className = '',
}: TabsProps) {
  return (
    <div className={`flex items-center gap-1 border-b border-[var(--border-subtle)] ${className}`}>
      {tabs.map((tab) => {
        const active = activeTab === tab.id;
        return (
          <button
            key={tab.id}
            onClick={() => onChange(tab.id)}
            className={`
              relative flex items-center gap-1.5
              px-3.5 py-2
              text-xs font-mono uppercase tracking-wider
              transition-colors duration-[var(--transition-fast)]
              cursor-pointer
              ${active
                ? 'text-[var(--text-primary)] font-semibold'
                : 'text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]'
              }
            `}
          >
            <span>{tab.label}</span>
            {tab.count !== undefined && (
              <span
                className={`
                  text-[10px] px-1 rounded-xs font-mono
                  ${active ? 'bg-[var(--accent-primary-subtle)] text-[var(--accent-primary-light)]' : 'bg-[var(--surface-2)] text-[var(--text-muted)]'}
                `}
              >
                {tab.count}
              </span>
            )}

            {/* Active underline */}
            {active && (
              <span className="absolute bottom-0 left-0 right-0 h-[2px] bg-[var(--accent-primary)]" />
            )}
          </button>
        );
      })}
    </div>
  );
}
