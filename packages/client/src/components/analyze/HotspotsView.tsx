import { useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Flame, RefreshCw, AlertCircle, ChevronRight, Loader2, Eye, EyeOff, Settings as SettingsIcon, Info } from 'lucide-react';
import { FACTOR_LABELS } from '@thearchitect/shared';
import type { CriticalityFactor, CriticalityScoreEntry } from '@thearchitect/shared';
import { useArchitectureStore } from '../../stores/architectureStore';
import { useCriticalityStore } from '../../stores/criticalityStore';
import { useCriticality } from '../../hooks/useCriticality';
import { fitToScreen } from '../3d/ViewModeCamera';
import CriticalitySettingsDialog from './CriticalitySettingsDialog';

// Thresholds calibrated to the max-blend score model:
// Critical ≥ 60 (multiple high factors or one extreme single factor)
// High     ≥ 40 (one dominant + 1-2 contributing factors)
// Medium   ≥ 25 (single moderate factor)
const TIER_CRITICAL = 60;
const TIER_HIGH = 40;
const TIER_MEDIUM = 25;

const scoreColor = (score: number): { bg: string; text: string; ring: string; pill: string } => {
  if (score >= TIER_CRITICAL)
    return {
      bg: 'bg-red-500/15',
      text: 'text-red-200',
      ring: 'ring-red-400/40',
      pill: 'bg-red-500/25 text-red-200',
    };
  if (score >= TIER_HIGH)
    return {
      bg: 'bg-orange-500/15',
      text: 'text-orange-200',
      ring: 'ring-orange-400/40',
      pill: 'bg-orange-500/25 text-orange-200',
    };
  if (score >= TIER_MEDIUM)
    return {
      bg: 'bg-yellow-500/15',
      text: 'text-yellow-200',
      ring: 'ring-yellow-400/40',
      pill: 'bg-yellow-500/25 text-yellow-200',
    };
  return {
    bg: 'bg-slate-700/30',
    text: 'text-slate-400',
    ring: 'ring-slate-500/30',
    pill: 'bg-slate-700/40 text-slate-400',
  };
};

const barColor = (factor: CriticalityFactor): string => {
  switch (factor) {
    case 'spof':
      return 'bg-red-400';
    case 'riskConnectivity':
      return 'bg-orange-400';
    case 'maturityFloor':
      return 'bg-yellow-400';
    case 'complianceGap':
      return 'bg-purple-400';
    case 'costBurden':
      return 'bg-blue-400';
    case 'stakeholderBottleneck':
      return 'bg-cyan-400';
    case 'cycleTangle':
      return 'bg-rose-400';
  }
};

type LayerFilter = 'architecture' | 'all' | 'tech' | 'business' | 'strategy' | 'motivation';

const ARCHITECTURE_LAYERS = [
  'strategy',
  'business',
  'information',
  'application',
  'technology',
  'physical',
  'implementation_migration',
];

interface LayerFilterDef {
  id: LayerFilter;
  label: string;
  layers: string[];
  hint?: string;
}

// Order matters — Architecture is default (first), Motivation last.
const LAYER_FILTERS: LayerFilterDef[] = [
  {
    id: 'architecture',
    label: 'Architecture',
    layers: ARCHITECTURE_LAYERS,
    hint: 'Fixable architecture-layer elements (strategy → tech). Drivers excluded.',
  },
  { id: 'all', label: 'All Layers', layers: [] },
  {
    id: 'tech',
    label: 'Tech',
    layers: ['information', 'application', 'technology', 'physical', 'implementation_migration'],
  },
  { id: 'business', label: 'Business', layers: ['business'] },
  { id: 'strategy', label: 'Strategy', layers: ['strategy'] },
  {
    id: 'motivation',
    label: 'Motivation',
    layers: ['motivation'],
    hint: 'External drivers / regulations — not architecturally fixable. Shown for compliance traceability.',
  },
];

export default function HotspotsView() {
  const { projectId } = useParams<{ projectId: string }>();
  const { scores, loading, error, computedAt, reload } = useCriticality(projectId ?? null, {
    topN: 50, // fetch more so we can filter client-side without re-querying
  });
  const [layerFilter, setLayerFilter] = useState<LayerFilter>('architecture');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const showGlow = useCriticalityStore((s) => s.showGlow);
  const toggleGlow = useCriticalityStore((s) => s.toggleGlow);
  const setSelectedHotspot = useCriticalityStore((s) => s.setSelectedHotspot);
  const openBreakdownPopover = useCriticalityStore((s) => s.openBreakdownPopover);
  const elements = useArchitectureStore((s) => s.elements);

  const activeFilter = LAYER_FILTERS.find((f) => f.id === layerFilter) ?? LAYER_FILTERS[0];
  const visible = useMemo(() => {
    const filtered = scores.filter((s: CriticalityScoreEntry) => s.totalScore >= TIER_MEDIUM);
    if (activeFilter.layers.length === 0) return filtered.slice(0, 10);
    return filtered.filter((s) => activeFilter.layers.includes(s.layer)).slice(0, 10);
  }, [scores, activeFilter]);

  const filterCounts = useMemo(() => {
    const counts: Record<LayerFilter, number> = {
      architecture: 0,
      all: 0,
      tech: 0,
      business: 0,
      strategy: 0,
      motivation: 0,
    };
    scores.forEach((s) => {
      if (s.totalScore < TIER_MEDIUM) return;
      counts.all += 1;
      for (const f of LAYER_FILTERS) {
        if (f.id !== 'all' && f.layers.includes(s.layer)) counts[f.id] += 1;
      }
    });
    return counts;
  }, [scores]);

  const tierCounts = useMemo(() => {
    const counts = { critical: 0, high: 0, medium: 0 };
    visible.forEach((s) => {
      if (s.totalScore >= TIER_CRITICAL) counts.critical += 1;
      else if (s.totalScore >= TIER_HIGH) counts.high += 1;
      else if (s.totalScore >= TIER_MEDIUM) counts.medium += 1;
    });
    return counts;
  }, [visible]);

  const handleClick = (entry: CriticalityScoreEntry) => {
    setSelectedHotspot(entry.elementId);
    openBreakdownPopover(entry.elementId);
    const el = elements.find((e) => e.id === entry.elementId);
    if (el) fitToScreen([el]);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold text-[var(--text-primary)] flex items-center gap-2">
            <Flame className="w-5 h-5 text-orange-400" />
            Critical Hotspots
          </h2>
          <p className="text-sm text-[var(--text-tertiary)] mt-1">
            7-factor composite criticality score across your architecture. Click a hotspot to zoom + see why.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={toggleGlow}
            className={`px-3 py-1.5 rounded text-xs font-medium flex items-center gap-1.5 transition-colors ${
              showGlow
                ? 'bg-orange-500/20 text-orange-200 border border-orange-400/30'
                : 'bg-slate-700/40 text-slate-400 hover:text-slate-200 border border-transparent'
            }`}
            title={showGlow ? 'Hide 3D glow on hotspots' : 'Show 3D glow on hotspots'}
          >
            {showGlow ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
            3D Glow
          </button>
          <button
            type="button"
            onClick={reload}
            disabled={loading}
            className="px-3 py-1.5 rounded text-xs font-medium flex items-center gap-1.5 bg-slate-700/40 text-slate-300 hover:text-white disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            Recompute
          </button>
          <button
            type="button"
            onClick={() => setSettingsOpen(true)}
            className="px-3 py-1.5 rounded text-xs font-medium flex items-center gap-1.5 bg-slate-700/40 text-slate-300 hover:text-white"
            data-testid="open-settings"
          >
            <SettingsIcon className="w-3.5 h-3.5" />
            Settings
          </button>
        </div>
      </div>

      <CriticalitySettingsDialog
        isOpen={settingsOpen}
        projectId={projectId ?? null}
        onClose={() => setSettingsOpen(false)}
        onSaved={() => reload()}
      />

      <div className="flex flex-wrap items-center gap-1.5">
        {LAYER_FILTERS.map((f, idx) => {
          const isActive = f.id === layerFilter;
          const count = filterCounts[f.id];
          const isMotivation = f.id === 'motivation';
          return (
            <div key={f.id} className="flex items-center gap-1.5">
              {/* Insert visual separator after "All Layers" to distinguish drill-down filters */}
              {idx === 2 && (
                <span className="text-slate-600 text-xs select-none">·</span>
              )}
              <button
                type="button"
                onClick={() => setLayerFilter(f.id)}
                className={`px-3 py-1 rounded-full text-xs font-medium transition-colors flex items-center gap-1.5 ${
                  isActive
                    ? 'bg-[#7c3aed] text-white'
                    : 'bg-[#1e293b] text-slate-300 hover:bg-[#334155]'
                } ${isMotivation && !isActive ? 'opacity-75' : ''}`}
                data-testid={`layer-filter-${f.id}`}
                title={f.hint}
              >
                {f.label}
                <span
                  className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${
                    isActive ? 'bg-white/20' : 'bg-slate-700/50'
                  }`}
                >
                  {count}
                </span>
              </button>
            </div>
          );
        })}
      </div>

      {activeFilter.hint && (
        <div className="text-[10px] text-slate-500 italic flex items-center gap-1.5 -mt-1">
          <Info className="w-3 h-3 flex-shrink-0" />
          {activeFilter.hint}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="rounded-lg border border-red-500/30 bg-red-500/5 p-4">
          <div className="text-[10px] uppercase tracking-wide text-red-300 font-semibold">
            Critical (≥{TIER_CRITICAL})
          </div>
          <div className="text-2xl font-bold text-red-200 mt-1">{tierCounts.critical}</div>
        </div>
        <div className="rounded-lg border border-orange-500/30 bg-orange-500/5 p-4">
          <div className="text-[10px] uppercase tracking-wide text-orange-300 font-semibold">
            High ({TIER_HIGH}-{TIER_CRITICAL - 1})
          </div>
          <div className="text-2xl font-bold text-orange-200 mt-1">{tierCounts.high}</div>
        </div>
        <div className="rounded-lg border border-yellow-500/30 bg-yellow-500/5 p-4">
          <div className="text-[10px] uppercase tracking-wide text-yellow-300 font-semibold">
            Medium ({TIER_MEDIUM}-{TIER_HIGH - 1})
          </div>
          <div className="text-2xl font-bold text-yellow-200 mt-1">{tierCounts.medium}</div>
        </div>
      </div>

      {loading && scores.length === 0 && (
        <div className="flex items-center justify-center py-16 text-slate-400 gap-2">
          <Loader2 className="w-5 h-5 animate-spin" />
          Computing criticality scores…
        </div>
      )}

      {error && (
        <div className="flex items-start gap-2 text-sm text-red-300 bg-red-500/10 border border-red-500/30 rounded p-3">
          <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {!loading && !error && visible.length === 0 && (
        <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-raised)]/40 p-12 text-center">
          <p className="text-3xl mb-2">🎉</p>
          <p className="text-sm text-[var(--text-primary)] font-medium">
            No critical elements found
          </p>
          <p className="text-xs text-[var(--text-tertiary)] mt-1">
            Your architecture is healthy. Recompute after structural changes.
          </p>
        </div>
      )}

      {visible.length > 0 && (
        <div className="space-y-2">
          {visible.map((entry, idx) => {
            const colors = scoreColor(entry.totalScore);
            const factors = entry.factors ?? ({} as Record<CriticalityFactor, { raw: number; normalized: number; weighted: number }>);
            const factorRows = (Object.keys(factors) as CriticalityFactor[])
              .filter((k) => factors[k] !== undefined && factors[k] !== null)
              .map((k) => ({
                key: k,
                raw: factors[k]?.raw ?? 0,
                normalized: factors[k]?.normalized ?? 0,
                weighted: factors[k]?.weighted ?? 0,
              }))
              .sort((a, b) => b.weighted - a.weighted)
              .slice(0, 3)
              .filter((f) => f.weighted > 0);

            return (
              <button
                key={entry.elementId}
                type="button"
                onClick={() => handleClick(entry)}
                className={`w-full text-left rounded-lg border transition-colors p-4 flex items-center gap-4 hover:border-[#7c3aed]/40 ${colors.bg} border-[var(--border-subtle)]`}
                data-testid={`hotspot-row-${entry.elementId}`}
              >
                <div
                  className={`flex-shrink-0 w-12 h-12 rounded-lg flex items-center justify-center font-mono font-bold text-lg ${colors.pill}`}
                >
                  {entry.totalScore}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[10px] text-slate-500 font-mono">#{idx + 1}</span>
                    <h3 className="text-sm font-semibold text-white truncate" title={entry.name}>
                      {entry.name}
                    </h3>
                    <span className="text-[10px] text-slate-400 px-1.5 py-0.5 rounded bg-slate-700/40 capitalize">
                      {entry.type}
                    </span>
                    <span className="text-[10px] text-slate-500 capitalize">
                      {entry.layer}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 mt-2">
                    {factorRows.map((f) => (
                      <div key={f.key} className="flex items-center gap-1.5 text-[10px]">
                        <div className="w-12 bg-slate-700/40 rounded h-1 overflow-hidden">
                          <div
                            className={`h-full ${barColor(f.key)}`}
                            style={{ width: `${Math.min(100, f.normalized * 100)}%` }}
                          />
                        </div>
                        <span className="text-slate-400">{FACTOR_LABELS[f.key]}</span>
                      </div>
                    ))}
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 text-slate-500 flex-shrink-0" />
              </button>
            );
          })}
        </div>
      )}

      {computedAt && (
        <p className="text-[10px] text-slate-600 text-right">
          Computed {new Date(computedAt).toLocaleString()}
        </p>
      )}
    </div>
  );
}
