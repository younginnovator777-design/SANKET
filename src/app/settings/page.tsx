'use client';

import React, { useState } from 'react';
import {
  Settings as SettingsIcon,
  Shield,
  Cpu,
  Database,
  HardDrive,
  Save,
  RotateCcw,
  CheckCircle2,
} from 'lucide-react';
import { PageContainer } from '@/components/PageContainer';
import {
  Button,
  Badge,
  SectionHeader,
} from '@/components/ui';

export default function SettingsPage() {
  // Declared defaults — used for initial state and reset
  const DEFAULTS = {
    thresholdFloor: '0.15',
    minConfidence: '0.60',
    modelVersion: 'v2.1.0-airgap-prod',
    airgapEnforce: true,
  };

  const [thresholdFloor, setThresholdFloor] = useState(DEFAULTS.thresholdFloor);
  const [minConfidence, setMinConfidence] = useState(DEFAULTS.minConfidence);
  const [modelVersion, setModelVersion] = useState(DEFAULTS.modelVersion);
  const [airgapEnforce, setAirgapEnforce] = useState(DEFAULTS.airgapEnforce);

  function handleResetDefaults() {
    setThresholdFloor(DEFAULTS.thresholdFloor);
    setMinConfidence(DEFAULTS.minConfidence);
    setModelVersion(DEFAULTS.modelVersion);
    setAirgapEnforce(DEFAULTS.airgapEnforce);
  }

  return (
    <PageContainer
      title="System Settings"
      description="Workstation runtime configuration, model parameters, and offline storage management."
      tag="CONTROL PANEL"
      icon={<SettingsIcon size={18} />}
      actions={
        <div className="flex items-center gap-2">
          <Button variant="secondary" size="sm" onClick={handleResetDefaults}>
            <RotateCcw size={13} />
            <span>Reset Defaults</span>
          </Button>
          <Button variant="accent" size="sm">
            <Save size={13} />
            <span>Save Configuration</span>
          </Button>
        </div>
      }
    >
      <div className="space-y-6 max-w-4xl">
        {/* 1. Airgap & Security Environment */}
        <div className="bg-[var(--surface-1)] border border-[var(--border-default)] rounded-[var(--radius-md)] p-5">
          <SectionHeader
            title="Airgap & Security Integrity"
            description="Workstation network isolation and deterministic local execution settings."
            badge={<Badge variant="accent">ENFORCED</Badge>}
          />

          <div className="space-y-4 mt-4 font-mono text-xs">
            <div className="flex items-center justify-between p-3 rounded-[var(--radius-sm)] bg-[var(--surface-2)] border border-[var(--border-subtle)]">
              <div>
                <div className="font-semibold text-[var(--text-primary)]">Strict Airgap Enforcement</div>
                <div className="text-[10px] text-[var(--text-tertiary)] mt-0.5">
                  Block all outbound sockets, telemetry, and external DNS lookups.
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-[var(--risk-low)]">ENABLED</span>
                <span className="w-2 h-2 rounded-full bg-[var(--risk-low)]" />
              </div>
            </div>

            <div className="flex items-center justify-between p-3 rounded-[var(--radius-sm)] bg-[var(--surface-2)] border border-[var(--border-subtle)]">
              <div>
                <div className="font-semibold text-[var(--text-primary)]">In-Memory Canonicalization Cache</div>
                <div className="text-[10px] text-[var(--text-tertiary)] mt-0.5">
                  Store normalized transaction feature vectors in RAM during pipeline runs.
                </div>
              </div>
              <span className="text-[11px] text-[var(--text-secondary)]">2,048 MB Limit</span>
            </div>
          </div>
        </div>

        {/* 2. Scoring & Anomaly Detection Parameters */}
        <div className="bg-[var(--surface-1)] border border-[var(--border-default)] rounded-[var(--radius-md)] p-5">
          <SectionHeader
            title="Model & Detection Thresholds"
            description="Adjust floor scores and active scoring model runtime."
          />

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4 font-mono text-xs">
            <div className="p-3.5 bg-[var(--surface-2)] border border-[var(--border-subtle)] rounded-[var(--radius-sm)] space-y-2">
              <label className="text-[10px] uppercase text-[var(--text-tertiary)] block">
                Anomaly Score Floor (0.00 – 1.00)
              </label>
              <input
                type="number"
                step="0.01"
                value={thresholdFloor}
                onChange={(e) => setThresholdFloor(e.target.value)}
                className="w-full h-8 px-2.5 bg-[var(--surface-3)] text-[var(--text-primary)] border border-[var(--border-default)] rounded-[var(--radius-sm)] text-xs font-mono focus:border-[var(--accent-primary-border)] focus:outline-none"
              />
              <span className="text-[10px] text-[var(--text-muted)] block">
                Transactions with risk &lt; floor will not trigger candidate alerts.
              </span>
            </div>

            <div className="p-3.5 bg-[var(--surface-2)] border border-[var(--border-subtle)] rounded-[var(--radius-sm)] space-y-2">
              <label className="text-[10px] uppercase text-[var(--text-tertiary)] block">
                Minimum Confidence Threshold
              </label>
              <input
                type="number"
                step="0.05"
                value={minConfidence}
                onChange={(e) => setMinConfidence(e.target.value)}
                className="w-full h-8 px-2.5 bg-[var(--surface-3)] text-[var(--text-primary)] border border-[var(--border-default)] rounded-[var(--radius-sm)] text-xs font-mono focus:border-[var(--accent-primary-border)] focus:outline-none"
              />
              <span className="text-[10px] text-[var(--text-muted)] block">
                Minimum multi-signal agreement required for priority ranking.
              </span>
            </div>
          </div>
        </div>

        {/* 3. Local Storage & Database Stats */}
        <div className="bg-[var(--surface-1)] border border-[var(--border-default)] rounded-[var(--radius-md)] p-5">
          <SectionHeader
            title="Local Data Store Status"
            description="Local SQLite index and Apache Arrow vector partition."
          />

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-4 font-mono text-xs">
            <div className="p-3 bg-[var(--surface-2)] border border-[var(--border-subtle)] rounded-[var(--radius-sm)]">
              <span className="text-[10px] uppercase text-[var(--text-tertiary)] block">Storage Size</span>
              <span className="text-sm font-bold text-[var(--text-primary)]">142.8 MB</span>
            </div>
            <div className="p-3 bg-[var(--surface-2)] border border-[var(--border-subtle)] rounded-[var(--radius-sm)]">
              <span className="text-[10px] uppercase text-[var(--text-tertiary)] block">Indexed Records</span>
              <span className="text-sm font-bold text-[var(--text-primary)]">245,892 TXs</span>
            </div>
            <div className="p-3 bg-[var(--surface-2)] border border-[var(--border-subtle)] rounded-[var(--radius-sm)]">
              <span className="text-[10px] uppercase text-[var(--text-tertiary)] block">Graph Adjacency Index</span>
              <span className="text-sm font-bold text-[var(--accent-primary-light)]">1.2ms Lookup</span>
            </div>
          </div>
        </div>
      </div>
    </PageContainer>
  );
}
