// REQ-RED-003 + REQ-RED-004 — Redundancy panel
// Lists semantic-similarity pair candidates from the project, gives the
// user a one-click "zoom to both" navigation into 3D, and lets them
// resolve pairs in bulk: merge into A, merge into B, keep both, or skip.

import { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { GitMerge, Loader2, RefreshCw, X, AlertCircle, ArrowLeft, ArrowRight, Check, SkipForward } from 'lucide-react';
import Modal from '../../design-system/patterns/Modal';
import { useRedundancies, type RedundancyPair } from '../../hooks/useRedundancies';
import { useArchitectureStore } from '../../stores/architectureStore';
import { architectureAPI } from '../../services/api';
import { fitToScreen } from '../3d/ViewModeCamera';

type DecisionAction = 'merge-into-a' | 'merge-into-b' | 'keep-both' | 'skip';

// Build a stable key per pair (a-id|b-id sorted) so the decision-state
// survives list re-orderings.
const pairKey = (p: RedundancyPair) => (p.aId < p.bId ? `${p.aId}|${p.bId}` : `${p.bId}|${p.aId}`);

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
  const { state, fetch, reset, applyDecisions } = useRedundancies(projectId);
  const elements = useArchitectureStore((s) => s.elements);
  const selectElement = useArchitectureStore((s) => s.selectElement);
  const [typeFilter, setTypeFilter] = useState<string>('all');
  // REQ-RED-004 — per-pair decision state. Map from pair-key → action.
  // Pairs without an entry have no decision yet and won't be submitted.
  const [decisions, setDecisions] = useState<Record<string, DecisionAction>>({});
  const [submitting, setSubmitting] = useState(false);

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

  const setDecision = (pair: RedundancyPair, action: DecisionAction | null) => {
    const key = pairKey(pair);
    setDecisions((prev) => {
      const next = { ...prev };
      if (action === null) delete next[key];
      else next[key] = action;
      return next;
    });
  };

  // REQ-RED-004 — count decisions for the apply button label/state
  const decisionCounts = useMemo(() => {
    const counts = { merge: 0, keep: 0, skip: 0, total: 0 };
    for (const action of Object.values(decisions)) {
      counts.total++;
      if (action === 'merge-into-a' || action === 'merge-into-b') counts.merge++;
      else if (action === 'keep-both') counts.keep++;
      else if (action === 'skip') counts.skip++;
    }
    return counts;
  }, [decisions]);

  const submitDecisions = async () => {
    if (decisionCounts.total === 0) return;
    const allPairs = state.data?.pairs ?? [];
    const payload = allPairs
      .map((p) => ({ pair: p, action: decisions[pairKey(p)] }))
      .filter((x) => x.action)
      .map((x) => ({ aId: x.pair.aId, bId: x.pair.bId, action: x.action! }));

    if (payload.length === 0) return;

    setSubmitting(true);
    try {
      const res = await applyDecisions(payload);
      if (!res.success) {
        toast.error(res.error || 'Failed to apply decisions');
        return;
      }
      const r = res.result!;
      const parts: string[] = [];
      if (r.merged > 0) parts.push(`${r.merged} merged`);
      if (r.kept > 0) parts.push(`${r.kept} kept`);
      if (r.skipped > 0) parts.push(`${r.skipped} skipped`);
      if (r.errors.length > 0) parts.push(`${r.errors.length} failed`);
      toast.success(parts.join(' · ') || 'Decisions applied');

      // After merges, the architecture has changed — reload elements +
      // connections so the 3D-scene catches up. Then refresh the
      // pair list (some pairs are gone because one side was deleted).
      if (r.merged > 0 && projectId) {
        try {
          const [elemRes, connRes] = await Promise.all([
            architectureAPI.getElements(projectId),
            architectureAPI.getConnections(projectId),
          ]);
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const newElements = (elemRes.data?.data ?? elemRes.data) as any;
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const newConnections = (connRes.data?.data ?? connRes.data) as any;
          useArchitectureStore.setState({ elements: newElements, connections: newConnections });
        } catch {
          // non-blocking
        }
      }
      setDecisions({});
      await fetch(); // re-scan with the new graph
    } finally {
      setSubmitting(false);
    }
  };

  const handleClose = () => {
    reset();
    setTypeFilter('all');
    setDecisions({});
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
            const key = pairKey(pair);
            const decision = decisions[key];
            const isMergeIntoA = decision === 'merge-into-a';
            const isMergeIntoB = decision === 'merge-into-b';
            const isKeepBoth = decision === 'keep-both';
            const isSkip = decision === 'skip';

            return (
              <div
                key={`${pair.aId}-${pair.bId}-${i}`}
                className={`flex flex-col gap-2 p-3 border-b border-[var(--border-subtle)] last:border-b-0 transition ${
                  decision ? 'bg-[var(--surface-base)]' : 'hover:bg-[var(--surface-base)]/40'
                }`}
              >
                {/* Pair row (clickable for zoom) */}
                <button
                  onClick={() => zoomToPair(pair)}
                  className="w-full text-left flex items-stretch gap-2"
                  title="Click to zoom to both elements"
                >
                  {/* Element A card */}
                  <div className={`flex-1 min-w-0 border rounded p-2 bg-[var(--surface-base)] transition ${
                    isMergeIntoA ? 'border-[#22c55e] ring-1 ring-[#22c55e]/40' : 'border-[var(--border-subtle)]'
                  }`}>
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
                  </div>

                  {/* Element B card */}
                  <div className={`flex-1 min-w-0 border rounded p-2 bg-[var(--surface-base)] transition ${
                    isMergeIntoB ? 'border-[#22c55e] ring-1 ring-[#22c55e]/40' : 'border-[var(--border-subtle)]'
                  }`}>
                    <div className="text-[9px] uppercase tracking-wider text-[var(--text-tertiary)]">
                      {pair.bType} · {pair.bLayer}
                    </div>
                    <div className="text-sm font-semibold text-white truncate">{pair.bName}</div>
                  </div>
                </button>

                {/* REQ-RED-004 — Decision buttons */}
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setDecision(pair, isMergeIntoA ? null : 'merge-into-a')}
                    className={`flex items-center gap-1 px-2 py-1 rounded text-[10px] border transition ${
                      isMergeIntoA
                        ? 'bg-[#22c55e]/15 border-[#22c55e] text-[#22c55e]'
                        : 'border-[var(--border-subtle)] text-[var(--text-secondary)] hover:bg-[var(--surface-base)]'
                    }`}
                    title={`Keep ${pair.aName}, drop ${pair.bName}, transfer connections to A`}
                  >
                    <ArrowLeft size={10} />
                    Merge into A
                  </button>
                  <button
                    onClick={() => setDecision(pair, isMergeIntoB ? null : 'merge-into-b')}
                    className={`flex items-center gap-1 px-2 py-1 rounded text-[10px] border transition ${
                      isMergeIntoB
                        ? 'bg-[#22c55e]/15 border-[#22c55e] text-[#22c55e]'
                        : 'border-[var(--border-subtle)] text-[var(--text-secondary)] hover:bg-[var(--surface-base)]'
                    }`}
                    title={`Keep ${pair.bName}, drop ${pair.aName}, transfer connections to B`}
                  >
                    Merge into B
                    <ArrowRight size={10} />
                  </button>
                  <button
                    onClick={() => setDecision(pair, isKeepBoth ? null : 'keep-both')}
                    className={`flex items-center gap-1 px-2 py-1 rounded text-[10px] border transition ${
                      isKeepBoth
                        ? 'bg-[#3b82f6]/15 border-[#3b82f6] text-[#3b82f6]'
                        : 'border-[var(--border-subtle)] text-[var(--text-secondary)] hover:bg-[var(--surface-base)]'
                    }`}
                    title="Mark as reviewed, both stay (intentionally different)"
                  >
                    <Check size={10} />
                    Keep both
                  </button>
                  <button
                    onClick={() => setDecision(pair, isSkip ? null : 'skip')}
                    className={`flex items-center gap-1 px-2 py-1 rounded text-[10px] border transition ${
                      isSkip
                        ? 'bg-[var(--text-tertiary)]/15 border-[var(--text-tertiary)] text-[var(--text-secondary)]'
                        : 'border-[var(--border-subtle)] text-[var(--text-secondary)] hover:bg-[var(--surface-base)]'
                    }`}
                    title="Skip — decide later"
                  >
                    <SkipForward size={10} />
                    Skip
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer with hint + apply button */}
        <div className="flex items-center gap-2">
          <div className="text-[10px] text-[var(--text-tertiary)] flex items-center gap-1 flex-1">
            <GitMerge size={10} />
            {decisionCounts.total === 0 ? (
              <span>Click cards to zoom · pick a decision to enable Apply</span>
            ) : (
              <span>
                {decisionCounts.merge} merge · {decisionCounts.keep} keep · {decisionCounts.skip} skip
              </span>
            )}
          </div>
          <button
            onClick={handleClose}
            className="flex items-center gap-1 px-2 py-1 rounded text-xs border border-[var(--border-subtle)] hover:bg-[var(--surface-base)]"
          >
            <X size={11} />
            Close
          </button>
          <button
            onClick={() => void submitDecisions()}
            disabled={decisionCounts.total === 0 || submitting}
            className="flex items-center gap-1 px-3 py-1 rounded text-xs font-semibold bg-[#00ff41] text-black hover:bg-[#00ff41]/90 disabled:bg-[#00ff41]/30 disabled:cursor-not-allowed"
          >
            {submitting ? <Loader2 size={11} className="animate-spin" /> : '✓'}
            Apply ({decisionCounts.total})
          </button>
        </div>
      </div>
    </Modal>
  );
}
