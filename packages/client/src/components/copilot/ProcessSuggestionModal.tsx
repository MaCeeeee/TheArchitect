// UC-ADD-004 Generator B — Preview Modal for AI-generated Processes
// Mirrors ActivitySuggestionModal. Reuses Modal pattern + checkbox UX.

import { useEffect, useState } from 'react';
import { Sparkles, CheckCircle2, X, AlertTriangle, Loader2 } from 'lucide-react';
import Modal from '../../design-system/patterns/Modal';
import type { GeneratedProcess, ProcessGeneratorStatus } from '../../hooks/useProcessGenerator';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  status: ProcessGeneratorStatus;
  processes: GeneratedProcess[];
  ragChunks: number;
  capabilityName: string | null;
  durationMs: number | null;
  errorMessage: string | null;
  onApply: (selected: GeneratedProcess[]) => Promise<void>;
}

export default function ProcessSuggestionModal({
  isOpen,
  onClose,
  status,
  processes,
  ragChunks,
  capabilityName,
  durationMs,
  errorMessage,
  onApply,
}: Props) {
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [isApplying, setIsApplying] = useState(false);

  // Auto-select every newly streamed process
  useEffect(() => {
    setSelected((prev) => {
      const next = new Set(prev);
      for (let i = 0; i < processes.length; i++) {
        if (!next.has(i)) next.add(i);
      }
      return next;
    });
  }, [processes.length]);

  // Reset on close
  useEffect(() => {
    if (!isOpen) {
      setSelected(new Set());
      setIsApplying(false);
    }
  }, [isOpen]);

  const toggle = (i: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
  };

  const selectAll = () => setSelected(new Set(processes.map((_, i) => i)));
  const selectNone = () => setSelected(new Set());

  const handleApply = async () => {
    const toApply = processes.filter((_, i) => selected.has(i));
    if (toApply.length === 0) return;
    setIsApplying(true);
    try {
      await onApply(toApply);
    } finally {
      setIsApplying(false);
    }
  };

  const isStreaming = status === 'thinking' || status === 'streaming';
  const isDone = status === 'done';
  const isError = status === 'error';

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={capabilityName ? `AI · Processes for "${capabilityName}"` : 'AI · Generate Processes'}
      size="lg"
      footer={
        <>
          <button
            onClick={onClose}
            disabled={isApplying}
            className="rounded-md border border-[var(--border-subtle)] px-3 py-1.5 text-xs text-[var(--text-secondary)] hover:bg-[var(--surface-base)] disabled:opacity-50 transition"
          >
            Cancel
          </button>
          <button
            onClick={handleApply}
            disabled={selected.size === 0 || isStreaming || isApplying}
            className="flex items-center gap-1.5 rounded-md bg-[#00ff41] px-4 py-1.5 text-xs font-semibold text-[#0a0a0a] hover:bg-[#33ff66] disabled:opacity-40 disabled:cursor-not-allowed transition"
          >
            {isApplying ? (
              <>
                <Loader2 size={12} className="animate-spin" />
                Applying…
              </>
            ) : (
              <>
                <CheckCircle2 size={12} />
                Apply {selected.size} {selected.size === 1 ? 'Process' : 'Processes'}
              </>
            )}
          </button>
        </>
      }
    >
      {/* Status banner */}
      <div className="flex items-center gap-2 rounded-md border border-[var(--border-subtle)] bg-[var(--surface-base)] px-3 py-2 text-xs">
        {isStreaming && <Loader2 size={14} className="animate-spin text-[#00ff41]" />}
        {isDone && <CheckCircle2 size={14} className="text-[#00ff41]" />}
        {isError && <AlertTriangle size={14} className="text-amber-400" />}
        <div className="flex-1">
          {status === 'thinking' && (
            <span className="text-[var(--text-secondary)]">Claude is thinking · pulling context from project & RAG…</span>
          )}
          {status === 'streaming' && (
            <span className="text-[var(--text-secondary)]">
              Generating processes · <span className="text-[#33ff66]">{processes.length}</span> received
            </span>
          )}
          {isDone && (
            <span className="text-[var(--text-secondary)]">
              <span className="text-[#33ff66] font-semibold">{processes.length}</span> processes generated
              {durationMs !== null && (
                <span className="text-[var(--text-tertiary)]"> · {(durationMs / 1000).toFixed(1)}s</span>
              )}
              {ragChunks > 0 && (
                <span className="text-[var(--text-tertiary)]"> · {ragChunks} RAG chunks consulted</span>
              )}
            </span>
          )}
          {isError && (
            <span className="text-red-300">{errorMessage || 'Generation failed'}</span>
          )}
        </div>
      </div>

      {/* Bulk controls */}
      {processes.length > 0 && (
        <div className="flex items-center justify-between text-[10px] uppercase tracking-wider text-[var(--text-tertiary)]">
          <span>
            <span className="text-[#33ff66]">{selected.size}</span> / {processes.length} selected
          </span>
          <div className="flex gap-2">
            <button onClick={selectAll} className="hover:text-white transition">All</button>
            <span>·</span>
            <button onClick={selectNone} className="hover:text-white transition">None</button>
          </div>
        </div>
      )}

      {/* Process list */}
      <div className="max-h-[420px] overflow-y-auto space-y-2 pr-1">
        {processes.map((p, i) => (
          <ProcessCard
            key={i}
            index={i}
            process={p}
            selected={selected.has(i)}
            onToggle={() => toggle(i)}
            justArrived={i === processes.length - 1 && isStreaming}
          />
        ))}
        {isStreaming && processes.length === 0 && (
          <div className="flex items-center justify-center py-12 text-xs text-[var(--text-tertiary)]">
            <Sparkles size={14} className="mr-2 animate-pulse text-[#00ff41]" />
            Waiting for first process…
          </div>
        )}
      </div>
    </Modal>
  );
}

function ProcessCard({
  index, process: p, selected, onToggle, justArrived,
}: {
  index: number;
  process: GeneratedProcess;
  selected: boolean;
  onToggle: () => void;
  justArrived: boolean;
}) {
  return (
    <div
      className={`rounded-md border p-2.5 transition ${
        selected
          ? 'border-[#00ff41]/40 bg-[#00ff41]/5'
          : 'border-[var(--border-subtle)] bg-[var(--surface-base)]'
      } ${justArrived ? 'animate-[slideInRight_200ms_ease-out]' : ''}`}
    >
      <div className="flex items-start gap-2">
        <button
          type="button"
          onClick={onToggle}
          className={`mt-0.5 h-4 w-4 shrink-0 rounded border transition flex items-center justify-center ${
            selected
              ? 'border-[#00ff41] bg-[#00ff41]'
              : 'border-[var(--border-subtle)] hover:border-[#00ff41]'
          }`}
          aria-pressed={selected}
        >
          {selected && <CheckCircle2 size={11} className="text-[#0a0a0a]" />}
        </button>
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-2">
            <span className="text-[10px] font-mono text-[var(--text-tertiary)]">
              {String(index + 1).padStart(2, '0')}
            </span>
            <span className="text-xs font-semibold text-white truncate">{p.name}</span>
          </div>
          <p className="mt-1 text-[11px] leading-snug text-[var(--text-secondary)]">
            {p.description}
          </p>
        </div>
        <button
          type="button"
          onClick={onToggle}
          className="shrink-0 text-[var(--text-tertiary)] hover:text-red-400 transition"
          title={selected ? 'Reject this process' : 'Already rejected'}
        >
          {selected && <X size={12} />}
        </button>
      </div>
    </div>
  );
}
