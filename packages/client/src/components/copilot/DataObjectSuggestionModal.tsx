// UC-DATA-001 Generator D — Preview Modal for AI-generated Data-Objects
// Mirrors ActivitySuggestionModal patterns for UI consistency.

import { useEffect, useState } from 'react';
import { Database, CheckCircle2, X, AlertTriangle, Loader2, Shield } from 'lucide-react';
import Modal from '../../design-system/patterns/Modal';
import type {
  GeneratedDataObject,
  DataObjectGeneratorStatus,
  Sensitivity,
} from '../../hooks/useDataObjectGenerator';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  status: DataObjectGeneratorStatus;
  dataObjects: GeneratedDataObject[];
  ragChunks: number;
  processName: string | null;
  existingDataObjectCount: number;
  durationMs: number | null;
  rejectedCount: number;
  errorMessage: string | null;
  onApply: (selected: GeneratedDataObject[]) => Promise<void>;
}

const SENSITIVITY_COLORS: Record<Sensitivity, { bg: string; text: string; border: string; label: string }> = {
  PII:          { bg: 'bg-red-500/15',    text: 'text-red-300',    border: 'border-red-500/40',    label: 'PII' },
  confidential: { bg: 'bg-orange-500/15', text: 'text-orange-300', border: 'border-orange-500/40', label: 'CONFIDENTIAL' },
  internal:     { bg: 'bg-yellow-500/15', text: 'text-yellow-300', border: 'border-yellow-500/40', label: 'INTERNAL' },
  public:       { bg: 'bg-green-500/15',  text: 'text-green-300',  border: 'border-green-500/40',  label: 'PUBLIC' },
};

export default function DataObjectSuggestionModal({
  isOpen,
  onClose,
  status,
  dataObjects,
  ragChunks,
  processName,
  existingDataObjectCount,
  durationMs,
  rejectedCount,
  errorMessage,
  onApply,
}: Props) {
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [isApplying, setIsApplying] = useState(false);

  useEffect(() => {
    setSelected((prev) => {
      const next = new Set(prev);
      for (let i = 0; i < dataObjects.length; i++) {
        if (!next.has(i)) next.add(i);
      }
      return next;
    });
  }, [dataObjects.length]);

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

  const selectAll = () => setSelected(new Set(dataObjects.map((_, i) => i)));
  const selectNone = () => setSelected(new Set());

  const handleApply = async () => {
    const toApply = dataObjects.filter((_, i) => selected.has(i));
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
      title={`✨ Generate Data-Objects${processName ? ` for "${processName}"` : ''}`}
      size="lg"
    >
      <div className="flex flex-col gap-3 max-h-[70vh]">
        {/* Status bar */}
        <div className="flex items-center justify-between text-xs text-[var(--text-tertiary)] px-1">
          <div className="flex items-center gap-3">
            {isStreaming && <><Loader2 size={12} className="animate-spin" /><span>{status === 'thinking' ? 'Analyzing process + standards…' : `Streaming ${dataObjects.length} suggestions…`}</span></>}
            {isDone && <><CheckCircle2 size={12} className="text-[#00ff41]" /><span>Done in {Math.round((durationMs ?? 0) / 1000)}s</span>{rejectedCount > 0 && <span className="text-yellow-400">· {rejectedCount} rejected (schema)</span>}</>}
            {isError && <><AlertTriangle size={12} className="text-red-400" /><span className="text-red-400">{errorMessage}</span></>}
          </div>
          <div className="flex items-center gap-2 text-[10px]">
            {ragChunks > 0 && <span>· {ragChunks} RAG chunks</span>}
            {existingDataObjectCount > 0 && <span>· {existingDataObjectCount} existing data-objects considered for reuse</span>}
          </div>
        </div>

        {/* Suggestions list */}
        <div className="flex-1 overflow-y-auto border border-[var(--border-subtle)] rounded">
          {dataObjects.length === 0 && !isError && (
            <div className="p-6 text-center text-xs text-[var(--text-tertiary)]">
              {isStreaming ? 'Waiting for first suggestion…' : 'No suggestions yet.'}
            </div>
          )}
          {dataObjects.map((d, i) => {
            const sens = SENSITIVITY_COLORS[d.sensitivity];
            const isSelected = selected.has(i);
            return (
              <div
                key={i}
                className={`flex items-start gap-2 p-3 border-b border-[var(--border-subtle)] last:border-b-0 cursor-pointer transition ${isSelected ? 'bg-[#00ff41]/5' : 'hover:bg-[var(--surface-base)]'}`}
                onClick={() => toggle(i)}
              >
                <input
                  type="checkbox"
                  checked={isSelected}
                  onChange={() => toggle(i)}
                  onClick={(e) => e.stopPropagation()}
                  className="mt-0.5 accent-[#00ff41]"
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <span className="text-sm font-semibold text-white">{d.name}</span>
                    <span className={`text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded border ${sens.bg} ${sens.text} ${sens.border}`}>
                      {d.sensitivity === 'PII' && <Shield size={8} className="inline mr-0.5" />}
                      {sens.label}
                    </span>
                    <span className="text-[9px] uppercase tracking-wider text-[var(--text-tertiary)]">
                      {d.dataClass}
                    </span>
                    <span className="text-[9px] font-mono text-[var(--text-tertiary)] bg-[var(--surface-base)] px-1.5 py-0.5 rounded">
                      {d.crudOperations}
                    </span>
                  </div>
                  <p className="text-[11px] text-[var(--text-secondary)] leading-snug">
                    {d.description}
                  </p>
                </div>
              </div>
            );
          })}
        </div>

        {/* Action bar */}
        <div className="flex items-center justify-between pt-2 border-t border-[var(--border-subtle)]">
          <div className="flex items-center gap-2 text-[10px]">
            <button
              type="button"
              onClick={selectAll}
              disabled={dataObjects.length === 0}
              className="px-2 py-1 text-[var(--text-secondary)] hover:text-white disabled:opacity-30 transition"
            >
              All
            </button>
            <button
              type="button"
              onClick={selectNone}
              disabled={selected.size === 0}
              className="px-2 py-1 text-[var(--text-secondary)] hover:text-white disabled:opacity-30 transition"
            >
              None
            </button>
            <span className="text-[var(--text-tertiary)] ml-2">{selected.size} of {dataObjects.length} selected</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 text-xs text-[var(--text-secondary)] hover:text-white transition flex items-center gap-1"
            >
              <X size={12} />
              Cancel
            </button>
            <button
              type="button"
              onClick={handleApply}
              disabled={selected.size === 0 || isStreaming || isApplying}
              className="px-4 py-1.5 text-xs font-semibold rounded bg-[#00ff41] text-black hover:bg-[#33ff66] disabled:opacity-30 disabled:cursor-not-allowed transition flex items-center gap-1"
            >
              {isApplying ? <Loader2 size={12} className="animate-spin" /> : <CheckCircle2 size={12} />}
              Apply {selected.size > 0 ? `(${selected.size})` : ''}
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
