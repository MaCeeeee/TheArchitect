import { useMemo } from 'react';
import { Flame, Loader2, RefreshCw, AlertCircle, ChevronRight } from 'lucide-react';
import { FACTOR_LABELS } from '@thearchitect/shared';
import type { CriticalityScoreEntry } from '@thearchitect/shared';
import { useCriticalityStore } from '../../stores/criticalityStore';
import { useArchitectureStore } from '../../stores/architectureStore';
import { useCriticality } from '../../hooks/useCriticality';
import { fitToScreen } from '../3d/ViewModeCamera';

interface Props {
  projectId: string | null;
}

const scoreColor = (score: number): { bg: string; text: string; ring: string } => {
  if (score >= 90) return { bg: 'bg-red-500/20', text: 'text-red-200', ring: 'ring-red-400/40' };
  if (score >= 70)
    return {
      bg: 'bg-orange-500/20',
      text: 'text-orange-200',
      ring: 'ring-orange-400/40',
    };
  if (score >= 50)
    return {
      bg: 'bg-yellow-500/20',
      text: 'text-yellow-200',
      ring: 'ring-yellow-400/40',
    };
  return { bg: 'bg-slate-500/15', text: 'text-slate-400', ring: 'ring-slate-500/30' };
};

export function CriticalHotspotsWidget({ projectId }: Props) {
  const { scores, loading, error, reload } = useCriticality(projectId, { topN: 10 });
  const selectedHotspotId = useCriticalityStore((s) => s.selectedHotspotId);
  const setSelectedHotspot = useCriticalityStore((s) => s.setSelectedHotspot);
  const openBreakdownPopover = useCriticalityStore((s) => s.openBreakdownPopover);
  const showGlow = useCriticalityStore((s) => s.showGlow);
  const toggleGlow = useCriticalityStore((s) => s.toggleGlow);
  const elements = useArchitectureStore((s) => s.elements);

  const visible = useMemo(
    () => scores.filter((s: CriticalityScoreEntry) => s.totalScore >= 50).slice(0, 10),
    [scores],
  );

  const handleClick = (entry: CriticalityScoreEntry) => {
    setSelectedHotspot(entry.elementId);
    openBreakdownPopover(entry.elementId);
    const el = elements.find((e) => e.id === entry.elementId);
    if (el) {
      fitToScreen([el]);
    }
  };

  if (!projectId) return null;

  return (
    <div
      className="border border-[var(--border-subtle)] rounded-md bg-[var(--surface-base)]/40 p-3"
      data-testid="critical-hotspots-widget"
    >
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-[var(--text-secondary)]">
          <Flame className="w-3.5 h-3.5 text-orange-400" />
          Critical Hotspots
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={toggleGlow}
            title={showGlow ? 'Hide 3D glow' : 'Show 3D glow'}
            className={`text-[10px] px-1.5 py-0.5 rounded transition-colors ${
              showGlow
                ? 'bg-orange-500/20 text-orange-200'
                : 'bg-slate-700/40 text-slate-400 hover:text-slate-200'
            }`}
            data-testid="toggle-glow"
          >
            Glow
          </button>
          <button
            type="button"
            onClick={reload}
            disabled={loading}
            title="Recompute scores"
            className="text-[var(--text-tertiary)] hover:text-white p-0.5 disabled:opacity-50"
            data-testid="reload-hotspots"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {loading && scores.length === 0 && (
        <div className="flex items-center gap-2 text-xs text-slate-500 py-3">
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
          Computing scores…
        </div>
      )}

      {error && (
        <div className="flex items-start gap-1.5 text-xs text-red-300 bg-red-500/10 border border-red-500/30 rounded p-2">
          <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {!loading && !error && visible.length === 0 && (
        <div className="text-xs text-slate-500 py-2 italic">
          No critical elements found — your architecture is healthy 🎉
        </div>
      )}

      {visible.length > 0 && (
        <ol className="space-y-1.5">
          {visible.map((entry, idx) => {
            const colors = scoreColor(entry.totalScore);
            const isSelected = selectedHotspotId === entry.elementId;
            const dominantLabel = entry.dominantFactor
              ? FACTOR_LABELS[entry.dominantFactor]
              : '—';
            return (
              <li key={entry.elementId}>
                <button
                  type="button"
                  onClick={() => handleClick(entry)}
                  className={`w-full text-left rounded p-2 transition-colors flex items-start gap-2 group ${
                    isSelected
                      ? `${colors.bg} ring-1 ${colors.ring}`
                      : 'hover:bg-[var(--surface-raised)]/50'
                  }`}
                  data-testid={`hotspot-${entry.elementId}`}
                >
                  <span className="text-[10px] font-mono text-slate-500 w-4 pt-0.5">
                    {idx + 1}.
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-medium text-white truncate" title={entry.name}>
                        {entry.name}
                      </span>
                      <span
                        className={`text-[10px] px-1.5 py-0.5 rounded font-mono font-semibold ${colors.bg} ${colors.text}`}
                      >
                        {entry.totalScore}
                      </span>
                    </div>
                    <p className="text-[10px] text-slate-500 mt-0.5 truncate">
                      {dominantLabel}
                    </p>
                  </div>
                  <ChevronRight className="w-3 h-3 text-slate-600 group-hover:text-slate-400 mt-1 flex-shrink-0" />
                </button>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}

export default CriticalHotspotsWidget;
