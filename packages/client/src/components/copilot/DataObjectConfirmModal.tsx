// REQ-SIM-004 Stage 6b — Confirm-decision modal for similar data-objects.
//
// Opens after `apply-data-objects` returns one or more `pendingConfirm`
// items (similarity score 0.65-0.85). The user decides per item:
//   - "Merge" → use the suggested existing element
//   - "Create new" → force-create the originally-proposed item
// On submit, the decisions are sent to the backend's
// `apply-data-object-decisions` endpoint.

import { useState } from 'react';
import { GitMerge, PlusCircle, Loader2, AlertTriangle, X } from 'lucide-react';
import Modal from '../../design-system/patterns/Modal';
import type { GeneratedDataObject } from '../../hooks/useDataObjectGenerator';

export interface PendingConfirmItem {
  originalIndex: number;
  original: GeneratedDataObject;
  suggestion: {
    elementId: string;
    name: string;
    type: string;
    score: number;
  };
}

export type Decision = 'merge' | 'create';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  items: PendingConfirmItem[];
  onSubmit: (
    decisions: Array<{
      originalIndex: number;
      action: Decision;
      original: GeneratedDataObject;
      suggestion?: { elementId: string; name: string };
    }>,
  ) => Promise<void>;
}

export default function DataObjectConfirmModal({ isOpen, onClose, items, onSubmit }: Props) {
  // Default: "merge" for all (the suggested behavior — score is high)
  const [decisions, setDecisions] = useState<Record<number, Decision>>(() =>
    Object.fromEntries(items.map((it) => [it.originalIndex, 'merge'])),
  );
  const [submitting, setSubmitting] = useState(false);

  if (!isOpen) return null;

  const setDecision = (idx: number, d: Decision) =>
    setDecisions((prev) => ({ ...prev, [idx]: d }));

  const mergeCount = Object.values(decisions).filter((d) => d === 'merge').length;
  const createCount = items.length - mergeCount;

  const submit = async () => {
    setSubmitting(true);
    try {
      const payload = items.map((it) => ({
        originalIndex: it.originalIndex,
        action: decisions[it.originalIndex] ?? 'merge',
        original: it.original,
        suggestion:
          decisions[it.originalIndex] === 'merge'
            ? { elementId: it.suggestion.elementId, name: it.suggestion.name }
            : undefined,
      }));
      await onSubmit(payload);
      onClose();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="✨ Confirm similar data-objects" size="lg">
      <div className="flex flex-col gap-3 max-h-[70vh]">
        <div className="flex items-center gap-2 text-xs text-[var(--text-tertiary)] px-1">
          <AlertTriangle size={12} className="text-yellow-400" />
          <span>
            {items.length} {items.length === 1 ? 'data-object looks' : 'data-objects look'} similar
            to something already in this project. Pick per item: merge with the suggestion or
            create a new copy.
          </span>
        </div>

        <div className="flex-1 overflow-y-auto border border-[var(--border-subtle)] rounded">
          {items.map((it) => {
            const d = decisions[it.originalIndex] ?? 'merge';
            const scorePct = Math.round(it.suggestion.score * 100);
            return (
              <div
                key={it.originalIndex}
                className="p-3 border-b border-[var(--border-subtle)] last:border-b-0"
              >
                <div className="grid grid-cols-2 gap-3 mb-3">
                  {/* Original */}
                  <div className="border border-[var(--border-subtle)] rounded p-2 bg-[var(--surface-base)]">
                    <div className="text-[10px] uppercase tracking-wider text-[var(--text-tertiary)] mb-1">
                      AI proposed (new)
                    </div>
                    <div className="text-sm font-semibold text-white">{it.original.name}</div>
                    <div className="text-[11px] text-[var(--text-secondary)] mt-1 line-clamp-2">
                      {it.original.description}
                    </div>
                  </div>
                  {/* Suggestion */}
                  <div className="border border-yellow-500/40 rounded p-2 bg-yellow-500/5">
                    <div className="text-[10px] uppercase tracking-wider text-yellow-300 mb-1">
                      Existing match · {scorePct}%
                    </div>
                    <div className="text-sm font-semibold text-white">{it.suggestion.name}</div>
                    <div className="text-[11px] text-[var(--text-secondary)] mt-1">
                      {it.suggestion.type}
                    </div>
                  </div>
                </div>

                {/* Decision buttons */}
                <div className="flex gap-2">
                  <button
                    onClick={() => setDecision(it.originalIndex, 'merge')}
                    className={`flex-1 flex items-center justify-center gap-1 px-3 py-1.5 rounded text-xs border transition ${
                      d === 'merge'
                        ? 'bg-[#00ff41]/15 border-[#00ff41]/60 text-[#00ff41]'
                        : 'border-[var(--border-subtle)] text-[var(--text-secondary)] hover:bg-[var(--surface-base)]'
                    }`}
                  >
                    <GitMerge size={12} />
                    Merge with existing
                  </button>
                  <button
                    onClick={() => setDecision(it.originalIndex, 'create')}
                    className={`flex-1 flex items-center justify-center gap-1 px-3 py-1.5 rounded text-xs border transition ${
                      d === 'create'
                        ? 'bg-orange-500/15 border-orange-500/60 text-orange-300'
                        : 'border-[var(--border-subtle)] text-[var(--text-secondary)] hover:bg-[var(--surface-base)]'
                    }`}
                  >
                    <PlusCircle size={12} />
                    Create new
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-2">
          <span className="text-[11px] text-[var(--text-tertiary)]">
            {mergeCount} merge · {createCount} create
          </span>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="px-3 py-1.5 rounded text-xs border border-[var(--border-subtle)] text-[var(--text-secondary)] hover:bg-[var(--surface-base)] flex items-center gap-1"
              disabled={submitting}
            >
              <X size={12} />
              Cancel
            </button>
            <button
              onClick={submit}
              disabled={submitting || items.length === 0}
              className="px-4 py-1.5 rounded text-xs font-semibold bg-[#00ff41] text-black hover:bg-[#00ff41]/90 disabled:bg-[#00ff41]/40 disabled:cursor-not-allowed flex items-center gap-1"
            >
              {submitting ? <Loader2 size={12} className="animate-spin" /> : '✓'}
              Apply decisions
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
