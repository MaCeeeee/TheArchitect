// UC-TRUST-001 / REQ-TRUST-001.2 — Trust summary widget (Trust-Spine).
//
// Aggregated trust signal for the overview-first screen: "X% confirmed,
// Y% AI-assumed". Honest-signal framing (not a score to maximize) — confirmed
// is green, to-verify is amber, never alarm-red. Click leads into the
// certification queue (UC-CERT-001). Reads the same provenance/certifiedBy
// fields via certificationAPI.getTrustSummary.

import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { ShieldCheck, Loader2 } from 'lucide-react';
import { certificationAPI } from '../../services/api';

interface SourceStat {
  total: number;
  confirmed: number;
  unconfirmed: number;
}

interface TrustSummary {
  total: number;
  confirmed: number;
  unconfirmed: number;
  confirmedPct: number | null;
  byProvenance: {
    user: number;
    ai_generated: number;
    import: number;
    mcp_discovered: number;
  };
  bySource?: Record<string, SourceStat>;
}

// Compact source labels — mirror CertificationQueue's badge vocabulary.
const SOURCE_LABEL: Record<string, string> = {
  github: 'GitHub', gitlab: 'GitLab', n8n: 'n8n', sap: 'SAP',
  servicenow: 'ServiceNow', salesforce: 'Salesforce', jira: 'Jira',
  leanix: 'LeanIX', sparxea: 'Sparx EA', csv: 'CSV', excel: 'Excel',
  json: 'JSON', archimate: 'ArchiMate', api: 'API', upload: 'Upload',
};
const sourceLabel = (s: string) => SOURCE_LABEL[s] ?? s;

interface Props {
  projectId: string;
  // Called after navigating into the queue (e.g. to close the overview modal).
  onNavigate?: () => void;
}

const CONFIRMED = '#22c55e'; // green — trusted
const TO_VERIFY = '#eab308'; // amber — needs review (deliberately not red)

export default function TrustSummaryWidget({ projectId, onNavigate }: Props) {
  const navigate = useNavigate();
  const [data, setData] = useState<TrustSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const res = await certificationAPI.getTrustSummary(projectId);
      setData(res.data.data);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    void load();
  }, [load]);

  // Open the queue, optionally pre-filtered to one source (REQ-PROV-002.3 filter).
  const openQueue = (source?: string) => {
    const qs = source ? `?source=${encodeURIComponent(source)}` : '';
    navigate(`/project/${projectId}/compliance/certify${qs}`);
    onNavigate?.();
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-base)] px-3 py-3 text-[var(--text-tertiary)]">
        <Loader2 size={14} className="animate-spin" />
        <span className="text-xs">Loading trust summary…</span>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-base)] px-3 py-3">
        <p className="text-xs text-[var(--text-tertiary)]">
          Trust summary unavailable.{' '}
          <button onClick={() => void load()} className="text-[#a78bfa] hover:underline">
            Retry
          </button>
        </p>
      </div>
    );
  }

  // Empty project — no atoms yet. Show an honest empty state, never "0%".
  if (data.total === 0 || data.confirmedPct === null) {
    return (
      <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-base)] px-3 py-3">
        <div className="flex items-center gap-2">
          <ShieldCheck size={14} className="text-[var(--text-tertiary)]" />
          <p className="text-xs font-medium text-[var(--text-secondary)]">Trust</p>
        </div>
        <p className="mt-1 text-[11px] text-[var(--text-tertiary)]">
          No atoms yet — build or import your architecture to see how much is confirmed.
        </p>
      </div>
    );
  }

  const confirmedPct = data.confirmedPct;
  const toVerifyPct = 100 - confirmedPct;

  // Top origins with atoms still to verify — most unconfirmed first, max 3.
  const topSources = Object.entries(data.bySource ?? {})
    .filter(([, s]) => s.unconfirmed > 0)
    .sort((a, b) => b[1].unconfirmed - a[1].unconfirmed)
    .slice(0, 3);

  return (
    <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-base)] px-3 py-3 transition focus-within:border-[#7c3aed]/40 hover:border-[#7c3aed]/40">
      <button
        onClick={() => openQueue()}
        title="Open certification queue"
        className="group block w-full text-left"
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ShieldCheck size={14} className="text-[#22c55e]" />
            <p className="text-xs font-medium text-[var(--text-secondary)]">Trust</p>
          </div>
          <span className="text-[10px] text-[var(--text-tertiary)] opacity-0 group-hover:opacity-100 transition">
            Review →
          </span>
        </div>

        <p className="mt-1.5 text-lg font-bold text-[var(--text-primary)]">
          {confirmedPct}% <span className="text-xs font-medium text-[var(--text-tertiary)]">confirmed</span>
        </p>

        {/* Stacked honesty bar: confirmed (green) vs. to-verify (amber) */}
        <div className="mt-2 flex h-2 w-full overflow-hidden rounded-full bg-[var(--border-subtle)]">
          <div style={{ width: `${confirmedPct}%`, backgroundColor: CONFIRMED }} />
          <div style={{ width: `${toVerifyPct}%`, backgroundColor: TO_VERIFY }} />
        </div>

        <p className="mt-1.5 text-[11px] text-[var(--text-tertiary)]">
          {toVerifyPct}% AI-assumed — {data.unconfirmed} atom{data.unconfirmed === 1 ? '' : 's'} to review
        </p>
      </button>

      {/* Unverified-by-source chips → jump into the queue pre-filtered. */}
      {topSources.length > 0 && (
        <div className="mt-2 flex flex-wrap items-center gap-1 border-t border-[var(--border-subtle)] pt-2">
          <span className="text-[10px] text-[var(--text-tertiary)]">Unverified:</span>
          {topSources.map(([src, stat]) => (
            <button
              key={src}
              onClick={() => openQueue(src)}
              title={`Review ${stat.unconfirmed} unconfirmed from ${sourceLabel(src)}`}
              className="rounded-full bg-[#7c3aed]/10 px-2 py-0.5 text-[10px] font-medium text-[#a78bfa] transition hover:bg-[#7c3aed]/20"
            >
              {sourceLabel(src)} {stat.unconfirmed}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
