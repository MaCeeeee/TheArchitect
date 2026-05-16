// REQ-RED-003 — Redundancy panel
// Lists semantic-similarity pair candidates from the project and
// gives the user a one-click "zoom to both" navigation into 3D.

import { useEffect, useMemo, useState } from 'react';
import { GitMerge, Loader2, RefreshCw, X, AlertCircle, ArrowRight } from 'lucide-react';
import Modal from '../../design-system/patterns/Modal';
import { useRedundancies, type RedundancyPair } from '../../hooks/useRedundancies';
import { useArchitectureStore } from '../../stores/architectureStore';
import { fitToScreen } from '../3d/ViewModeCamera';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  projectId: string | null;
}

// Color tier: SAME (≥0.85) green, SIMILAR (0.65–0.85) yellow
const tierColor = (tier: RedundancyPair['tier']) =>
  tier === 'same' ? '#22c55e' : tier === 'similar' ? '#eab308' : '#94a3b8';
const tierLabel = (tier: RedundancyPair['tier']) =>
  tier === 'same' ? 'SAME' : tier === 'similar' ? 'SIMILAR' : 'WEAK';

export default function RedundancyPanel({ isOpen, onClose, projectId }: Props) {
  const { state, fetch, reset } = useRedundancies(projectId);
  const elements = useArchitectureStore((s) => s.elements);
  const selectElement = useArchitectureStore((s) => s.selectElement);
  const [typeFilter, setTypeFilter] = useState<string>('all');

  // Trigger an initial fetch when the modal opens. Subsequent opens
  // re-fetch on demand via the refresh button so the user sees fresh
  // results after they make changes elsewhere.
  useEffect(() => {
    if (isOpen && projectId && state.status === 'idle') {
      void fetch();
    }
  }, [isOpen, projectId, state.status, fetch]);

  const filteredPairs = useMemo(() => {
    const all = state.data?.pairs ?? [];
    if (typeFilter === 'all') return all;
    return all.filter((p) => p.aType === typeFilter || p.bType === typeFilter);
  }, [state.data, typeFilter]);

  // Distinct types appearing in the result set, for the filter chips
  const typesInResult = useMemo(() => {
    const set = new Set<string>();
    for (const p of state.data?.pairs ?? []) {
      set.add(p.aType);
      set.add(p.bType);
    }
    return Array.from(set).sort();
  }, [state.data]);

  const zoomToPair = (pair: RedundancyPair) => {
    const a = elements.find((el) => el.id === pair.aId);
    const b = elements.find((el) => el.id === pair.bId);
    const targets = [a, b].filter(Boolean) as typeof elements;
    if (targets.length === 0) return;
    fitToScreen(targets.map((el) => ({ id: el.id, position3D: el.position3D })));
    // Also select the first one so its property panel pops open
    selectElement(targets[0].id);
  };

  const handleClose = () => {
    reset();
    setTypeFilter('all');
    onClose();
  };

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="🔁 Redundancy Detector (REQ-RED-001)" size="lg">
      <div className="flex flex-col gap-3 max-h-[70vh]">
        {/* Header: status + refresh */}
        <div className="flex items-center justify-between text-xs text-[var(--text-tertiary)] px-1">
          <div className="flex items-center gap-2">
            {state.status === 'loading' && (
              <>
                <Loader2 size={12} className="animate-spin" />
                <span>Scanning project for semantic duplicates…</span>
              </>
            )}
            {state.status === 'done' && state.data && (
              <span>
                Scanned <b className="text-white">{state.data.scanned}</b> of{' '}
                <b className="text-white">{state.data.totalElements}</b> elements ·{' '}
                <b className="text-white">{state.data.pairs.length}</b> candidate
                {state.data.pairs.length === 1 ? '' : 's'} found
              </span>
            )}
            {state.status === 'error' && (
              <span className="text-red-400 flex items-center gap-1">
                <AlertCircle size={12} /> {state.error}
              </span>
            )}
          </div>
          <button
            onClick={() => void fetch()}
            disabled={state.status === 'loading'}
            className="flex items-center gap-1 px-2 py-1 rounded border border-[var(--border-subtle)] hover:bg-[var(--surface-base)] disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <RefreshCw size={11} className={state.status === 'loading' ? 'animate-spin' : ''} />
            Refresh
          </button>
        </div>

        {/* Type filter chips */}
        {typesInResult.length > 1 && (
          <div className="flex items-center gap-1 px-1 flex-wrap">
            <button
              onClick={() => setTypeFilter('all')}
              className={`text-[10px] px-2 py-0.5 rounded-full border transition ${
                typeFilter === 'all'
                  ? 'bg-[#00ff41]/15 border-[#00ff41] text-[#00ff41]'
                  : 'border-[var(--border-subtle)] text-[var(--text-secondary)] hover:bg-[var(--surface-base)]'
              }`}
            >
              All
            </button>
            {typesInResult.map((t) => (
              <button
                key={t}
                onClick={() => setTypeFilter(t)}
                className={`text-[10px] px-2 py-0.5 rounded-full border transition ${
                  typeFilter === t
                    ? 'bg-[#00ff41]/15 border-[#00ff41] text-[#00ff41]'
                    : 'border-[var(--border-subtle)] text-[var(--text-secondary)] hover:bg-[var(--surface-base)]'
                }`}
              >
                {t}
              </button>
            ))}
          </div>
        )}

        {/* Pair list */}
        <div className="flex-1 overflow-y-auto border border-[var(--border-subtle)] rounded">
          {state.status === 'done' && filteredPairs.length === 0 && (
            <div className="p-8 text-center text-xs text-[var(--text-tertiary)]">
              <div className="text-2xl mb-2">🎉</div>
              {state.data?.pairs.length === 0
                ? 'No redundancies detected — your model looks clean.'
                : 'No pairs match the current type filter.'}
            </div>
          )}
          {state.status === 'loading' && (
            <div className="p-8 text-center text-xs text-[var(--text-tertiary)]">
              <Loader2 size={16} className="animate-spin inline mr-2" />
              Computing pair similarities…
            </div>
          )}
          {filteredPairs.map((pair, i) => {
            const color = tierColor(pair.tier);
            const scorePct = Math.round(pair.score * 100);
            return (
              <button
                key={`${pair.aId}-${pair.bId}-${i}`}
                onClick={() => zoomToPair(pair)}
                className="w-full text-left flex items-stretch gap-2 p-3 border-b border-[var(--border-subtle)] last:border-b-0 hover:bg-[var(--surface-base)] transition"
              >
                {/* Element A card */}
                <div className="flex-1 min-w-0 border border-[var(--border-subtle)] rounded p-2 bg-[var(--surface-base)]">
                  <div className="text-[9px] uppercase tracking-wider text-[var(--text-tertiary)]">
                    {pair.aType} · {pair.aLayer}
                  </div>
                  <div className="text-sm font-semibold text-white truncate">{pair.aName}</div>
                </div>

                {/* Score badge in the middle */}
                <div className="flex flex-col items-center justify-center min-w-[64px]">
                  <span
                    className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded border"
                    style={{
                      color,
                      borderColor: `${color}66`,
                      background: `${color}15`,
                    }}
                  >
                    {tierLabel(pair.tier)}
                  </span>
                  <span className="text-lg font-mono font-bold mt-1" style={{ color }}>
                    {scorePct}%
                  </span>
                  <ArrowRight size={11} className="text-[var(--text-tertiary)] mt-0.5" />
                </div>

                {/* Element B card */}
                <div className="flex-1 min-w-0 border border-[var(--border-subtle)] rounded p-2 bg-[var(--surface-base)]">
                  <div className="text-[9px] uppercase tracking-wider text-[var(--text-tertiary)]">
                    {pair.bType} · {pair.bLayer}
                  </div>
                  <div className="text-sm font-semibold text-white truncate">{pair.bName}</div>
                </div>
              </button>
            );
          })}
        </div>

        {/* Footer hint */}
        <div className="text-[10px] text-[var(--text-tertiary)] px-1 flex items-center gap-1">
          <GitMerge size={10} />
          <span>Click a pair to zoom to both elements in the 3D scene.</span>
          <button
            onClick={handleClose}
            className="ml-auto flex items-center gap-1 px-2 py-1 rounded border border-[var(--border-subtle)] hover:bg-[var(--surface-base)]"
          >
            <X size={11} />
            Close
          </button>
        </div>
      </div>
    </Modal>
  );
}
