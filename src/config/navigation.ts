// ============================================================
// SANKET — Navigation Configuration
// ============================================================

import { NavItem } from '@/types';

export const mainNavItems: NavItem[] = [
  {
    label: 'Overview',
    href: '/overview',
    icon: 'LayoutDashboard',
    description: 'System overview and investigative intelligence.',
    section: 'main',
  },
  {
    label: 'Analyze',
    href: '/analyze',
    icon: 'Upload',
    description: 'Upload and analyze transaction/network datasets.',
    section: 'main',
  },
  {
    label: 'Alerts',
    href: '/alerts',
    icon: 'ShieldAlert',
    description: 'Prioritized investigative leads.',
    section: 'main',
  },
  {
    label: 'Transactions',
    href: '/transactions',
    icon: 'ArrowLeftRight',
    description: 'Search and inspect transaction activity.',
    section: 'main',
  },
  {
    label: 'Entities',
    href: '/entities',
    icon: 'Users',
    description: 'Explore candidate entity relationships.',
    section: 'main',
  },
  {
    label: 'Graph',
    href: '/graph',
    icon: 'GitBranch',
    description: 'Investigate transaction and network relationships.',
    section: 'main',
  },
  {
    label: 'Analytics',
    href: '/analytics',
    icon: 'BarChart3',
    description: 'Detection and model analytics.',
    section: 'main',
  },
];

export const systemNavItems: NavItem[] = [
  {
    label: 'Run History',
    href: '/runs',
    icon: 'History',
    description: 'Previous analysis runs.',
    section: 'system',
  },
  {
    label: 'Settings',
    href: '/settings',
    icon: 'Settings',
    description: 'System configuration and information.',
    section: 'system',
  },
];
