// UC-CERT-001 / REQ-CERT-001.2 — Notar-Queue UI (Trust-Spine).
//
// Lists machine-generated atoms (elements + connections with
// provenance <> 'user' and not yet certified, riskiest = lowest confidence
// first) and lets the architect certify them single, in batch, or all at
// once. Certification is the *verb* of the Trust-Spine: the architect acts
// as a notary, certifying what the machine discovered. Backend:
// certification.routes.ts (GET /pending, POST /certify).

import { useState, useEffect, useMemo, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import {
  BadgeCheck, Loader2, RefreshCw, AlertCircle, Sparkles, Box, Cable, Eye,
  Github, FileSpreadsheet, Braces, Network, Upload, Webhook, Link2, Clock,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { certificationAPI } from '../../services/api';
import { useArchitectureStore } from '../../stores/architectureStore';

// Origin metadata (UC-PROV-002 / THE-335) — present only on connector-synced
// atoms; absent on alt-imports and interactively created atoms.
interface OriginFields {
  sourceRef: string | null;
  importedAt: string | null;
  connectorConfigId: string | null;
}

interface PendingElement extends OriginFields {
  id: string;
  name: string;
  type: string;
  layer: string | null;
  provenance: string;
  source: string | null;
  confidence: number | null;
}

interface PendingConnection extends OriginFields {
  id: string;
  type: string;
  label: string | null;
  provenance: string;
  source: string | null;
  confidence: number | null;
  sourceId: string;
  targetId: string;
  sourceName: string;
  targetName: string;
}

interface PendingData {
  elements: PendingElement[];
  connections: PendingConnection[];
  total: number;
}

// provenance → human label + badge color. Mirrors the deriveProvenance
// vocabulary from UC-PROV-001.
const PROVENANCE_META: Record<string, { label: string; color: string }> = {
  ai_generated: { label: 'AI-generated', color: '#a78bfa' },
  import: { label: 'Import', color: '#38bdf8' },
  mcp_discovered: { label: 'MCP-discovered', color: '#22d3ee' },
};
const provenanceMeta = (p: string) =>
  PROVENANCE_META[p] || { label: p, color: '#94a3b8' };

// Confidence → color (low = risky = red, high = green). null → neutral.
const confidenceColor = (c: number | null) =>
  c == null ? '#64748b' : c < 0.5 ? '#ef4444' : c < 0.8 ? '#eab308' : '#22c55e';
const confidenceLabel = (c: number | null) =>
  c == null ? '—' : `${Math.round(c * 100)}%`;

// source → human label + badge color + icon, per connector / file format
// (UC-PROV-002). De-anonymizes the import: "GitHub" / "CSV" instead of "import".
// Sources NOT listed here (e.g. ai-heal, blueprint, compliance-requirement) fall
// back to the provenance badge — those are AI/MCP origins, not data imports.
const SOURCE_META: Record<string, { label: string; color: string; Icon: LucideIcon }> = {
  github: { label: 'GitHub', color: '#e2e8f0', Icon: Github },
  gitlab: { label: 'GitLab', color: '#fc6d26', Icon: Cable },
  n8n: { label: 'n8n', color: '#ea4b71', Icon: Cable },
  sap: { label: 'SAP', color: '#60a5fa', Icon: Cable },
  servicenow: { label: 'ServiceNow', color: '#22d3ee', Icon: Cable },
  salesforce: { label: 'Salesforce', color: '#38bdf8', Icon: Cable },
  jira: { label: 'Jira', color: '#3b82f6', Icon: Cable },
  leanix: { label: 'LeanIX', color: '#2dd4bf', Icon: Cable },
  sparxea: { label: 'Sparx EA', color: '#a78bfa', Icon: Cable },
  csv: { label: 'CSV', color: '#34d399', Icon: FileSpreadsheet },
  excel: { label: 'Excel', color: '#22c55e', Icon: FileSpreadsheet },
  json: { label: 'JSON', color: '#eab308', Icon: Braces },
  archimate: { label: 'ArchiMate', color: '#f472b6', Icon: Network },
  api: { label: 'API', color: '#94a3b8', Icon: Webhook },
  upload: { label: 'Upload', color: '#64748b', Icon: Upload },
};

// Relative "time ago" for importedAt — null/invalid → null (origin line omits it).
const relativeTime = (iso: string | null): string | null => {
  if (!iso) return null;
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return null;
  const sec = Math.round((Date.now() - then) / 1000);
  if (sec < 60) return 'just now';
  const min = Math.round(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.round(hr / 24);
  if (day < 30) return `${day}d ago`;
  const mo = Math.round(day / 30);
  if (mo < 12) return `${mo}mo ago`;
  return `${Math.round(mo / 12)}y ago`;
};

// Herkunfts-Badge: real source (icon/color) for imports, provenance for the rest.
function OriginBadge({ source, provenance }: { source: string | null; provenance: string }) {
  const sm = source ? SOURCE_META[source] : undefined;
  if (sm) {
    const { label, color, Icon } = sm;
    return (
      <span
        className="shrink-0 inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium"
        style={{ backgroundColor: `${color}22`, color }}
        title={`Source: ${label} · ${provenanceMeta(provenance).label}`}
      >
        <Icon size={10} /> {label}
      </span>
    );
  }
  const pm = provenanceMeta(provenance);
  return (
    <span
      className="shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium"
      style={{ backgroundColor: `${pm.color}22`, color: pm.color }}
      title={source ? `Source: ${source}` : pm.label}
    >
      {pm.label}{source ? ` · ${source}` : ''}
    </span>
  );
}

// Secondary origin line: where it came from + when. Graceful when both absent.
function OriginLine({ sourceRef, importedAt, connectorConfigId }: OriginFields) {
  const rel = relativeTime(importedAt);
  const ref = sourceRef || connectorConfigId;
  if (!ref && !rel) return null;
  return (
    <p className="mt-0.5 flex items-center gap-1 truncate text-[10px] text-[var(--text-tertiary)]">
      {ref && (
        <>
          <Link2 size={9} className="shrink-0" />
          <span className="truncate" title={ref}>{ref}</span>
        </>
      )}
      {ref && rel && <span className="opacity-40">·</span>}
      {rel && (
        <>
          <Clock size={9} className="shrink-0" />
          <span className="shrink-0">{rel}</span>
        </>
      )}
    </p>
  );
}

export default function CertificationQueue() {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const selectElement = useArchitectureStore((s) => s.selectElement);

  const [data, setData] = useState<PendingData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [certifying, setCertifying] = useState(false);
  // Batch selection — stable atom keys ("el:<id>" / "conn:<id>").
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    if (!projectId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await certificationAPI.getPending(projectId);
      setData(res.data.data);
      setSelected(new Set());
    } catch {
      setError('Failed to load certification queue.');
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    void load();
  }, [load]);

  const allElements = data?.elements ?? [];
  const allConnections = data?.connections ?? [];
  const total = data?.total ?? 0;

  // Source filter (UC-PROV-002) — chips group the queue by origin. null = all.
  const [sourceFilter, setSourceFilter] = useState<string | null>(null);
  const sourceKey = (s: string | null) => s || 'upload';

  // Counts per source across elements + connections, busiest first.
  const sourceCounts = useMemo(() => {
    const m = new Map<string, number>();
    [...allElements, ...allConnections].forEach((a) => {
      const k = sourceKey(a.source);
      m.set(k, (m.get(k) ?? 0) + 1);
    });
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [allElements, allConnections]);

  // Drop a stale filter (e.g. its last atom was just certified) → fall back to all.
  const activeFilter = sourceCounts.some(([s]) => s === sourceFilter) ? sourceFilter : null;
  const matches = (s: string | null) => activeFilter === null || sourceKey(s) === activeFilter;
  const elements = activeFilter ? allElements.filter((e) => matches(e.source)) : allElements;
  const connections = activeFilter ? allConnections.filter((c) => matches(c.source)) : allConnections;

  const toggle = (key: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });

  const visibleTotal = elements.length + connections.length;
  const allKeys = useMemo(
    () => [...elements.map((e) => `el:${e.id}`), ...connections.map((c) => `conn:${c.id}`)],
    [elements, connections],
  );
  const allSelected = allKeys.length > 0 && allKeys.every((k) => selected.has(k));
  const toggleAll = () =>
    setSelected(allSelected ? new Set() : new Set(allKeys));

  // Split selected keys back into element/connection id arrays for the API.
  const selectionToBody = () => {
    const elementIds: string[] = [];
    const connectionIds: string[] = [];
    selected.forEach((k) => {
      const [kind, id] = k.split(/:(.+)/);
      if (kind === 'el') elementIds.push(id);
      else if (kind === 'conn') connectionIds.push(id);
    });
    return { elementIds, connectionIds };
  };

  const runCertify = async (body: {
    elementIds?: string[];
    connectionIds?: string[];
    all?: boolean;
  }) => {
    if (!projectId || certifying) return;
    setCertifying(true);
    try {
      const res = await certificationAPI.certify(projectId, body);
      const { elementsCertified, connectionsCertified } = res.data.data;
      const n = elementsCertified + connectionsCertified;
      toast.success(`${n} ${n === 1 ? 'atom' : 'atoms'} certified ✓`);
      await load();
    } catch {
      toast.error('Certification failed.');
    } finally {
      setCertifying(false);
    }
  };

  const certifySelected = () => {
    const { elementIds, connectionIds } = selectionToBody();
    if (elementIds.length + connectionIds.length === 0) return;
    void runCertify({ elementIds, connectionIds });
  };
  // With a filter active, "All" certifies only the visible (filtered) atoms;
  // unfiltered, it short-circuits to the backend's certify-all path.
  const certifyAll = () => {
    if (activeFilter) {
      void runCertify({ elementIds: elements.map((e) => e.id), connectionIds: connections.map((c) => c.id) });
    } else {
      void runCertify({ all: true });
    }
  };
  const certifyOne = (key: string) => {
    const [kind, id] = key.split(/:(.+)/);
    void runCertify(kind === 'el' ? { elementIds: [id] } : { connectionIds: [id] });
  };

  // AC-4 — focus the atom in the 3D explorer. The full-view has no 3D scene,
  // so we select the element in the store and navigate back to the explorer,
  // where fitToScreen runs on the selected element (UC-CRIT pattern).
  const showInModel = (elementId: string) => {
    selectElement(elementId);
    navigate(`/project/${projectId}`);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16 text-[var(--text-tertiary)]">
        <Loader2 size={20} className="animate-spin mr-2" />
        <span className="text-sm">Loading certification queue…</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <AlertCircle size={24} className="text-red-400 mb-2" />
        <p className="text-sm text-[var(--text-secondary)] mb-3">{error}</p>
        <button
          onClick={() => void load()}
          className="flex items-center gap-2 rounded-md bg-[#7c3aed]/15 px-3 py-1.5 text-xs font-medium text-[#a78bfa] hover:bg-[#7c3aed]/25 transition"
        >
          <RefreshCw size={12} /> Retry
        </button>
      </div>
    );
  }

  if (total === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <BadgeCheck size={32} className="text-green-400 mb-3" />
        <p className="text-base font-semibold text-[var(--text-primary)]">All certified ✓</p>
        <p className="text-sm text-[var(--text-tertiary)] mt-1 max-w-sm">
          There are no uncertified, machine-generated atoms. Every element and connection carries
          your certification.
        </p>
        <button
          onClick={() => void load()}
          className="mt-4 flex items-center gap-2 rounded-md border border-[var(--border-subtle)] px-3 py-1.5 text-xs font-medium text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] transition"
        >
          <RefreshCw size={12} /> Reload
        </button>
      </div>
    );
  }

  const selectedCount = selected.size;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-semibold text-[var(--text-primary)]">
            <BadgeCheck size={20} className="text-[#a78bfa]" />
            Certification
          </h2>
          <p className="text-sm text-[var(--text-tertiary)] mt-1 max-w-xl">
            Review machine-generated atoms and certify them as a notary. Riskiest first
            (lowest confidence). <span className="text-[var(--text-secondary)]">{total} pending</span>.
          </p>
        </div>
        <button
          onClick={() => void load()}
          className="flex items-center gap-2 rounded-md border border-[var(--border-subtle)] px-3 py-1.5 text-xs font-medium text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] transition shrink-0"
        >
          <RefreshCw size={12} /> Reload
        </button>
      </div>

      {/* Source filter chips — group the queue by origin (only when >1 source) */}
      {sourceCounts.length > 1 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            onClick={() => setSourceFilter(null)}
            className={`rounded-full px-2.5 py-1 text-[11px] font-medium transition ${
              activeFilter === null
                ? 'bg-[#7c3aed]/20 text-[#a78bfa]'
                : 'text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]'
            }`}
          >
            All ({total})
          </button>
          {sourceCounts.map(([src, count]) => {
            const sm = SOURCE_META[src];
            const active = activeFilter === src;
            const color = sm?.color ?? '#94a3b8';
            const Icon = sm?.Icon;
            return (
              <button
                key={src}
                onClick={() => setSourceFilter(active ? null : src)}
                className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-medium transition"
                style={
                  active
                    ? { backgroundColor: `${color}26`, color }
                    : { color: 'var(--text-tertiary)' }
                }
                title={sm ? `${sm.label}: ${count}` : `${src}: ${count}`}
              >
                {Icon && <Icon size={11} />}
                {sm?.label ?? src} ({count})
              </button>
            );
          })}
        </div>
      )}

      {/* Batch action bar */}
      <div className="flex items-center justify-between gap-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-base)] px-3 py-2">
        <label className="flex items-center gap-2 text-xs text-[var(--text-secondary)] cursor-pointer">
          <input
            type="checkbox"
            checked={allSelected}
            onChange={toggleAll}
            className="accent-[#7c3aed]"
          />
          Select all ({selectedCount}/{visibleTotal})
        </label>
        <div className="flex items-center gap-2">
          <button
            disabled={selectedCount === 0 || certifying}
            onClick={certifySelected}
            className="flex items-center gap-1.5 rounded-md bg-[#7c3aed]/15 px-3 py-1.5 text-xs font-medium text-[#a78bfa] hover:bg-[#7c3aed]/25 transition disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {certifying ? <Loader2 size={12} className="animate-spin" /> : <BadgeCheck size={12} />}
            Certify {selectedCount}
          </button>
          <button
            disabled={certifying}
            onClick={certifyAll}
            className="flex items-center gap-1.5 rounded-md border border-[#7c3aed]/30 px-3 py-1.5 text-xs font-medium text-[#a78bfa] hover:bg-[#7c3aed]/10 transition disabled:opacity-40 disabled:cursor-not-allowed"
          >
            All ({activeFilter ? visibleTotal : total})
          </button>
        </div>
      </div>

      {/* Elements */}
      {elements.length > 0 && (
        <div className="space-y-1.5">
          <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-[var(--text-tertiary)]">
            <Box size={12} /> Elements ({elements.length})
          </p>
          {elements.map((el) => {
            const key = `el:${el.id}`;
            return (
              <div
                key={key}
                className="flex items-center gap-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-base)] px-3 py-2"
              >
                <input
                  type="checkbox"
                  checked={selected.has(key)}
                  onChange={() => toggle(key)}
                  className="accent-[#7c3aed]"
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-[var(--text-primary)]">{el.name}</p>
                  <p className="truncate text-[11px] text-[var(--text-tertiary)]">
                    {el.type}{el.layer ? ` · ${el.layer}` : ''}
                  </p>
                  <OriginLine
                    sourceRef={el.sourceRef}
                    importedAt={el.importedAt}
                    connectorConfigId={el.connectorConfigId}
                  />
                </div>
                <OriginBadge source={el.source} provenance={el.provenance} />
                <span
                  className="shrink-0 w-10 text-right text-[11px] font-mono"
                  style={{ color: confidenceColor(el.confidence) }}
                  title="Confidence"
                >
                  {confidenceLabel(el.confidence)}
                </span>
                <button
                  onClick={() => showInModel(el.id)}
                  title="Show in 3D model"
                  className="shrink-0 rounded p-1 text-[var(--text-tertiary)] hover:text-[#a78bfa] transition"
                >
                  <Eye size={14} />
                </button>
                <button
                  disabled={certifying}
                  onClick={() => certifyOne(key)}
                  className="shrink-0 rounded-md bg-[#7c3aed]/15 px-2.5 py-1 text-[11px] font-medium text-[#a78bfa] hover:bg-[#7c3aed]/25 transition disabled:opacity-40"
                >
                  Certify
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* Connections */}
      {connections.length > 0 && (
        <div className="space-y-1.5">
          <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-[var(--text-tertiary)]">
            <Cable size={12} /> Connections ({connections.length})
          </p>
          {connections.map((conn) => {
            const key = `conn:${conn.id}`;
            return (
              <div
                key={key}
                className="flex items-center gap-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-base)] px-3 py-2"
              >
                <input
                  type="checkbox"
                  checked={selected.has(key)}
                  onChange={() => toggle(key)}
                  className="accent-[#7c3aed]"
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-[var(--text-primary)]">
                    {conn.sourceName} <span className="text-[var(--text-tertiary)]">→</span> {conn.targetName}
                  </p>
                  <p className="truncate text-[11px] text-[var(--text-tertiary)]">
                    {conn.label || conn.type}
                  </p>
                  <OriginLine
                    sourceRef={conn.sourceRef}
                    importedAt={conn.importedAt}
                    connectorConfigId={conn.connectorConfigId}
                  />
                </div>
                <OriginBadge source={conn.source} provenance={conn.provenance} />
                <span
                  className="shrink-0 w-10 text-right text-[11px] font-mono"
                  style={{ color: confidenceColor(conn.confidence) }}
                  title="Confidence"
                >
                  {confidenceLabel(conn.confidence)}
                </span>
                <button
                  onClick={() => showInModel(conn.sourceId)}
                  title="Show source element in 3D model"
                  className="shrink-0 rounded p-1 text-[var(--text-tertiary)] hover:text-[#a78bfa] transition"
                >
                  <Eye size={14} />
                </button>
                <button
                  disabled={certifying}
                  onClick={() => certifyOne(key)}
                  className="shrink-0 rounded-md bg-[#7c3aed]/15 px-2.5 py-1 text-[11px] font-medium text-[#a78bfa] hover:bg-[#7c3aed]/25 transition disabled:opacity-40"
                >
                  Certify
                </button>
              </div>
            );
          })}
        </div>
      )}

      <p className="flex items-center gap-1.5 pt-2 text-[11px] text-[var(--text-tertiary)]">
        <Sparkles size={11} />
        Certifying sets only <code className="text-[var(--text-secondary)]">certifiedBy</code> +{' '}
        <code className="text-[var(--text-secondary)]">certifiedAt</code> — provenance & confidence stay unchanged.
      </p>
    </div>
  );
}
