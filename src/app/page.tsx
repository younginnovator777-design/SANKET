'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';
import {
  ShieldAlert,
  GitBranch,
  BarChart3,
  HardDrive,
  ArrowRight,
} from 'lucide-react';

// ============================================================
// SANKET Landing Page
// System for Anomaly & Network Knowledge Extraction from Transactions
// ============================================================

const capabilities = [
  {
    icon: ShieldAlert,
    title: 'AI Anomaly Detection',
    description:
      'Detect unusual transaction, temporal, structural, and network patterns using explainable analytical signals.',
  },
  {
    icon: GitBranch,
    title: 'Graph Investigation',
    description:
      'Explore relationships between transactions, addresses, network observations, and heuristic candidate entities.',
  },
  {
    icon: BarChart3,
    title: 'Explainable Risk Scoring',
    description:
      'Combine multiple signals into ranked investigative leads with supporting evidence and confidence context.',
  },
  {
    icon: HardDrive,
    title: 'Offline Analysis',
    description:
      'Process transaction and network datasets locally without requiring external online analysis services.',
  },
] as const;

const fadeIn = {
  hidden: { opacity: 0, y: 12 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: 0.12 + i * 0.08, duration: 0.5, ease: 'easeOut' as const },
  }),
};

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-[var(--bg-primary)] flex flex-col">
      {/* ── Main Content ── */}
      <main className="flex-1 flex flex-col items-center justify-center px-6 py-16 sm:py-24">
        <div className="w-full max-w-[820px] flex flex-col items-center text-center">

          {/* ── Signal Mark ── */}
          <motion.div
            initial={{ opacity: 0, scale: 0.85 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.5, ease: 'easeOut' }}
            className="mb-8"
          >
            <div className="inline-flex items-center justify-center w-14 h-14 rounded-[var(--radius-lg)] bg-[var(--surface-2)] border border-[var(--border-default)]">
              <svg width="24" height="24" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                <circle cx="8" cy="8" r="2.5" fill="var(--accent-primary)" />
                <circle cx="8" cy="8" r="6.5" stroke="var(--text-tertiary)" strokeWidth="1" strokeDasharray="2 2" />
                <line x1="8" y1="1" x2="8" y2="3.5" stroke="var(--text-tertiary)" strokeWidth="1" />
                <line x1="8" y1="12.5" x2="8" y2="15" stroke="var(--text-tertiary)" strokeWidth="1" />
                <line x1="1" y1="8" x2="3.5" y2="8" stroke="var(--text-tertiary)" strokeWidth="1" />
                <line x1="12.5" y1="8" x2="15" y2="8" stroke="var(--text-tertiary)" strokeWidth="1" />
              </svg>
            </div>
          </motion.div>

          {/* ── SANKET Wordmark ── */}
          <motion.h1
            custom={0}
            variants={fadeIn}
            initial="hidden"
            animate="visible"
            className="font-mono text-3xl sm:text-4xl font-bold tracking-[0.22em] text-[var(--text-primary)] mb-2"
          >
            SANKET
          </motion.h1>

          {/* ── Acronym Expansion ── */}
          <motion.p
            custom={1}
            variants={fadeIn}
            initial="hidden"
            animate="visible"
            className="font-mono text-[10px] sm:text-[11px] uppercase tracking-[0.14em] text-[var(--text-tertiary)] mb-10"
          >
            System for Anomaly &amp; Network Knowledge Extraction from Transactions
          </motion.p>

          {/* ── Divider ── */}
          <motion.div
            custom={2}
            variants={fadeIn}
            initial="hidden"
            animate="visible"
            className="w-16 h-px bg-[var(--border-strong)] mb-10"
          />

          {/* ── Main Headline ── */}
          <motion.h2
            custom={2}
            variants={fadeIn}
            initial="hidden"
            animate="visible"
            className="font-serif-display text-2xl sm:text-3xl md:text-[2.25rem] leading-tight text-[var(--text-primary)] mb-5"
          >
            AI-Powered Bitcoin Transaction Intelligence
          </motion.h2>

          {/* ── Supporting Copy ── */}
          <motion.p
            custom={3}
            variants={fadeIn}
            initial="hidden"
            animate="visible"
            className="text-sm sm:text-[15px] leading-relaxed text-[var(--text-secondary)] max-w-[640px] mb-14"
          >
            An offline analytical platform that correlates Bitcoin transaction and
            network data to detect anomalous patterns, uncover structural
            relationships, and generate explainable investigative leads.
          </motion.p>

          {/* ── Capability Grid ── */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 w-full mb-14">
            {capabilities.map((cap, i) => {
              const Icon = cap.icon;
              return (
                <motion.div
                  key={cap.title}
                  custom={4 + i}
                  variants={fadeIn}
                  initial="hidden"
                  animate="visible"
                  className="
                    text-left p-5
                    bg-[var(--surface-1)] border border-[var(--border-subtle)]
                    rounded-[var(--radius-md)]
                    transition-colors duration-[var(--transition-fast)]
                    hover:border-[var(--border-strong)] hover:bg-[var(--surface-2)]
                  "
                >
                  <div className="flex items-start gap-3.5">
                    <div className="flex items-center justify-center w-8 h-8 rounded-[var(--radius-sm)] bg-[var(--surface-2)] border border-[var(--border-default)] shrink-0 mt-0.5">
                      <Icon size={15} className="text-[var(--accent-primary)]" />
                    </div>
                    <div>
                      <h3 className="text-xs font-mono font-semibold uppercase tracking-[0.08em] text-[var(--text-primary)] mb-1.5">
                        {cap.title}
                      </h3>
                      <p className="text-[12px] leading-relaxed text-[var(--text-secondary)]">
                        {cap.description}
                      </p>
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </div>

          {/* ── Primary CTA ── */}
          <motion.div
            custom={8}
            variants={fadeIn}
            initial="hidden"
            animate="visible"
          >
            <Link
              href="/overview"
              className="
                group inline-flex items-center gap-2.5
                h-11 px-7
                bg-[var(--accent-primary)] text-[#080808]
                font-mono text-xs font-bold uppercase tracking-[0.1em]
                rounded-[var(--radius-sm)]
                transition-colors duration-[var(--transition-fast)]
                hover:bg-[var(--accent-primary-hover)]
                active:bg-[var(--accent-primary)]
                focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent-primary)]
              "
            >
              <span>Launch SANKET</span>
              <ArrowRight size={14} className="transition-transform duration-150 group-hover:translate-x-0.5" />
            </Link>
          </motion.div>
        </div>
      </main>

      {/* ── Subtle Footer Strip ── */}
      <motion.footer
        custom={9}
        variants={fadeIn}
        initial="hidden"
        animate="visible"
        className="
          flex flex-col sm:flex-row items-center justify-center gap-3
          px-6 py-5
          border-t border-[var(--border-subtle)]
        "
      >
        <div className="flex items-center gap-4 text-[10px] font-mono uppercase tracking-[0.12em] text-[var(--text-muted)]">
          <span className="flex items-center gap-1.5">
            <span className="w-1 h-1 rounded-full bg-[var(--risk-low)]" />
            Offline-First
          </span>
          <span className="text-[var(--border-strong)]">•</span>
          <span>Explainable</span>
          <span className="text-[var(--border-strong)]">•</span>
          <span>Investigation-Focused</span>
        </div>
      </motion.footer>
    </div>
  );
}
