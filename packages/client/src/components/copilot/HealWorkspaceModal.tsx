import { useEffect, useMemo, useState } from 'react';
import { Sparkles, Loader2, Check } from 'lucide-react';
import toast from 'react-hot-toast';
import { architectureAPI } from '@/services/api';

interface Suggestion {
  sourceId: string;
  targetId: string;
  targetName: string;
  relationshipType: string;
  confidence: number;
  reasoning: string;
}
interface DryRunData {
  elementsAnalyzed: number;
  suggestionsTotal: number;
  perElement: Record<string, Suggestion[]>;
}
interface ApplyData {
  elementsAnalyzed: number;
  suggestionsConsidered: number;
  appliedCount: number;
  skippedAsAlreadyExisting: number;
  applied: Array<{ id: string; sourceId: string; targetId: string; type: string }>;
}

export function HealWorkspaceModal({
  projectId,
  isOpen,
  onClose,
  onApplied,
}: {
  projectId: string;
  isOpen: boolean;
  onClose: () => void;
  onApplied?: (count: number) => void;
}) {
  const [loading, setLoading] = useState(false);
  const [applying, setApplying] = useState(false);
  const [data, setData] = useState<DryRunData | null>(null);
  const [minConfidence, setMinConfidence] = useState(0.7);
  const [rejected, setRejected] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!isOpen) return;
    setData(null);
    setRejected(new Set());
    setLoading(true);
    architectureAPI
      .healConnections(projectId, { mode: 'dryRun', minConfidence: 0 })
      .then((res) => setData(res.data?.data ?? res.data))
      .catch((err: Error) => toast.error(`Dry-run failed: ${err?.message ?? 'unknown error'}`))
      .finally(() => setLoading(false));
  }, [isOpen, projectId]);

  const flatSuggestions = useMemo(() => {
    if (!data) return [];
    return Object.values(data.perElement).flat()
      .filter((s) => s.confidence >= minConfidence)
      .sort((a, b) => b.confidence - a.confidence);
  }, [data, minConfidence]);

  const keyOf = (s: Suggestion) => `${s.sourceId}|${s.targetId}|${s.relationshipType}`;
  const acceptedCount = flatSuggestions.filter((s) => !rejected.has(keyOf(s))).length;

  const toggle = (s: Suggestion) => {
    const k = keyOf(s);
    setRejected((prev) => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });
  };

  const apply = async () => {
    if (acceptedCount === 0) return;
    setApplying(true);
    try {
      const whitelist = flatSuggestions
        .filter((s) => !rejected.has(keyOf(s)))
        .map((s) => ({ sourceId: s.sourceId, targetId: s.targetId, type: s.relationshipType }));
      const res = await architectureAPI.healConnections(projectId, {
        mode: 'apply',
        minConfidence,
        whitelist,
      });
      const result = (res.data?.data ?? res.data) as ApplyData;
      toast.success(`Applied ${result.appliedCount} connection${result.appliedCount === 1 ? '' : 's'}`);
      onApplied?.(result.appliedCount);
      onClose();
    } catch (err) {
      toast.error(`Apply failed: ${(err as Error).message}`);
    } finally {
      setApplying(false);
    }
  };

  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="w-[640px] max-h-[80vh] flex flex-col bg-[#0f172a] border border-[#334155] rounded-lg shadow-xl">
        <div className="px-4 py-3 border-b border-[#334155] flex items-center gap-2">
          <Sparkles size={16} className="text-[#7c3aed]" />
          <span className="text-white font-medium">Heal Workspace</span>
          <span className="ml-auto text-xs text-slate-400">
            {data ? `${data.elementsAnalyzed} elements analyzed` : ''}
          </span>
        </div>

        <div className="px-4 py-2 border-b border-[#334155]">
          <label className="text-xs text-slate-300 flex items-center gap-2">
            <span className="w-32 shrink-0">Min Confidence: {minConfidence.toFixed(2)}</span>
            <input
              type="range"
              min={0.5}
              max={1}
              step={0.05}
              value={minConfidence}
              onChange={(e) => setMinConfidence(parseFloat(e.target.value))}
              className="flex-1"
            />
          </label>
        </div>

        <div className="flex-1 overflow-y-auto px-2 py-2">
          {loading && (
            <div className="flex items-center justify-center py-12 text-slate-400">
              <Loader2 className="animate-spin mr-2" size={16} /> Computing suggestions...
            </div>
          )}
          {!loading && flatSuggestions.length === 0 && (
            <div className="text-center text-slate-400 py-12 text-sm">
              No isolated elements at this confidence threshold.
            </div>
          )}
          {!loading &&
            flatSuggestions.map((s) => {
              const k = keyOf(s);
              const isRejected = rejected.has(k);
              return (
                <button
                  key={k}
                  onClick={() => toggle(s)}
                  className={`w-full text-left px-3 py-2 mb-1 rounded border ${
                    isRejected ? 'border-slate-700 opacity-40' : 'border-[#334155] hover:bg-[#1e293b]'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    {!isRejected && <Check size={12} className="text-green-400" />}
                    <span className="text-sm text-white truncate flex-1">{s.targetName}</span>
                    <span className="text-xs text-slate-400">{s.relationshipType}</span>
                    <span className="text-xs text-slate-500 w-12 text-right">
                      {(s.confidence * 100).toFixed(0)}%
                    </span>
                  </div>
                  <div className="text-xs text-slate-500 mt-0.5">{s.reasoning}</div>
                </button>
              );
            })}
        </div>

        <div className="px-4 py-3 border-t border-[#334155] flex items-center gap-2">
          <button onClick={onClose} className="px-3 py-1.5 text-sm text-slate-300 hover:text-white">
            Cancel
          </button>
          <button
            onClick={apply}
            disabled={applying || acceptedCount === 0}
            className="ml-auto px-4 py-1.5 text-sm bg-[#7c3aed] text-white rounded hover:bg-[#8b5cf6] disabled:opacity-50 flex items-center gap-2"
          >
            {applying && <Loader2 className="animate-spin" size={12} />}
            Apply {acceptedCount} Connection{acceptedCount === 1 ? '' : 's'}
          </button>
        </div>
      </div>
    </div>
  );
}
