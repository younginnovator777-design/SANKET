'use client';

import Link from 'next/link';
import Image from 'next/image';
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
    transition: { delay: 0.15 + i * 0.08, duration: 0.5, ease: 'easeOut' as const },
  }),
};

export default function LandingPage() {
  return (
    <div className="relative min-h-screen flex flex-col">

      {/* ── Background Texture Layer ── */}
      <div className="fixed inset-0 z-0">
        {/* Base black */}
        <div className="absolute inset-0 bg-[var(--bg-primary)]" />
        {/* Particle texture — heavily dimmed */}
        <Image
          src="/noise-texture.png"
          alt=""
          fill
          className="object-cover opacity-[0.35] mix-blend-screen pointer-events-none select-none"
          priority
          aria-hidden="true"
        />
        {/* Dark overlay to further subdue the texture */}
        <div className="absolute inset-0 bg-[var(--bg-primary)]/60" />
      </div>

      {/* ── Main Content ── */}
      <main className="relative z-10 flex-1 flex flex-col items-center justify-center px-6 py-20 sm:py-28">
        <div className="w-full max-w-[860px] flex flex-col items-center text-center">

          {/* ── Signal Mark ── */}
          <motion.div
            initial={{ opacity: 0, scale: 0.85 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.5, ease: 'easeOut' }}
            className="mb-10"
          >
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-[var(--radius-lg)] bg-[var(--surface-2)]/80 border border-[var(--border-default)]">
              <svg width="20" height="20" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                <circle cx="8" cy="8" r="2.5" fill="var(--accent-primary)" />
                <circle cx="8" cy="8" r="6.5" stroke="var(--text-tertiary)" strokeWidth="1" strokeDasharray="2 2" />
                <line x1="8" y1="1" x2="8" y2="3.5" stroke="var(--text-tertiary)" strokeWidth="1" />
                <line x1="8" y1="12.5" x2="8" y2="15" stroke="var(--text-tertiary)" strokeWidth="1" />
                <line x1="1" y1="8" x2="3.5" y2="8" stroke="var(--text-tertiary)" strokeWidth="1" />
                <line x1="12.5" y1="8" x2="15" y2="8" stroke="var(--text-tertiary)" strokeWidth="1" />
              </svg>
            </div>
          </motion.div>

          {/* ── SANKET Hero Wordmark ── */}
          <motion.h1
            custom={0}
            variants={fadeIn}
            initial="hidden"
            animate="visible"
            className="
              font-mono font-bold tracking-[0.24em]
              text-[var(--text-primary)]
              text-[clamp(3.5rem,10vw,8rem)]
              leading-none
              mb-4
            "
          >
            SANKET
          </motion.h1>

          {/* ── Acronym Expansion ── */}
          <motion.p
            custom={1}
            variants={fadeIn}
            initial="hidden"
            animate="visible"
            className="font-mono text-[10px] sm:text-[11px] md:text-xs uppercase tracking-[0.14em] text-[var(--text-secondary)] mb-12 max-w-[520px] leading-relaxed"
          >
            System for Anomaly &amp; Network Knowledge Extraction from Transactions
          </motion.p>

          {/* ── Divider ── */}
          <motion.div
            custom={2}
            variants={fadeIn}
            initial="hidden"
            animate="visible"
            className="w-20 h-px bg-[var(--accent-primary)]/40 mb-12"
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
            className="text-sm sm:text-[15px] leading-relaxed text-[var(--text-secondary)] max-w-[640px] mb-16"
          >
            An offline analytical platform that correlates Bitcoin transaction and
            network data to detect anomalous patterns, uncover structural
            relationships, and generate explainable investigative leads.
          </motion.p>

          {/* ── Capability Grid ── */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 w-full mb-16">
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
                    bg-[var(--surface-1)]/90 border border-[var(--border-subtle)]
                    rounded-[var(--radius-md)]
                    backdrop-blur-sm
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
                transition-all duration-[var(--transition-normal)]
                hover:bg-[var(--accent-primary-hover)] hover:shadow-[0_2px_16px_rgba(200,169,107,0.25)] hover:scale-[1.02]
                active:bg-[var(--accent-primary)] active:scale-100
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
          relative z-10
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
