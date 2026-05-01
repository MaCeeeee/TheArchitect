import { useEffect, useMemo, useState } from 'react';
import { Sparkles, Loader2, Check, ChevronRight, ChevronDown, ArrowRight } from 'lucide-react';
import toast from 'react-hot-toast';
import { architectureAPI } from '@/services/api';

interface Suggestion {
  sourceId: string;
  sourceName: string;
  sourceType: string;
  targetId: string;
  targetName: string;
  targetType: string;
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

interface SourceGroup {
  sourceId: string;
  sourceName: string;
  sourceType: string;
  suggestions: Suggestion[];
  topConfidence: number;
}

const TYPE_PILL_COLOR: Record<string, string> = {
  stakeholder: 'bg-pink-900/40 text-pink-200 border-pink-700/50',
  driver: 'bg-pink-900/40 text-pink-200 border-pink-700/50',
  goal: 'bg-pink-900/40 text-pink-200 border-pink-700/50',
  outcome: 'bg-pink-900/40 text-pink-200 border-pink-700/50',
  principle: 'bg-pink-900/40 text-pink-200 border-pink-700/50',
  capability: 'bg-yellow-900/30 text-yellow-200 border-yellow-700/50',
  course_of_action: 'bg-yellow-900/30 text-yellow-200 border-yellow-700/50',
  business_actor: 'bg-amber-900/30 text-amber-200 border-amber-700/50',
  business_role: 'bg-amber-900/30 text-amber-200 border-amber-700/50',
  business_process: 'bg-amber-900/30 text-amber-200 border-amber-700/50',
  application_component: 'bg-blue-900/40 text-blue-200 border-blue-700/50',
  application_service: 'bg-blue-900/40 text-blue-200 border-blue-700/50',
};

function pillClass(type: string): string {
  return TYPE_PILL_COLOR[type] ?? 'bg-slate-800 text-slate-300 border-slate-700';
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
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!isOpen) return;
    setData(null);
    setRejected(new Set());
    setCollapsed(new Set());
    setLoading(true);
    architectureAPI
      .healConnections(projectId, { mode: 'dryRun', minConfidence: 0 })
      .then((res) => setData(res.data?.data ?? res.data))
      .catch((err: Error) => toast.error(`Dry-run failed: ${err?.message ?? 'unknown error'}`))
      .finally(() => setLoading(false));
  }, [isOpen, projectId]);

  const groups: SourceGroup[] = useMemo(() => {
    if (!data) return [];
    const result: SourceGroup[] = [];
    for (const [sourceId, sugs] of Object.entries(data.perElement)) {
      const filtered = sugs
        .filter((s) => s.confidence >= minConfidence)
        .sort((a, b) => b.confidence - a.confidence);
      if (filtered.length === 0) continue;
      const first = filtered[0];
      result.push({
        sourceId,
        sourceName: first.sourceName,
        sourceType: first.sourceType,
        suggestions: filtered,
        topConfidence: first.confidence,
      });
    }
    return result.sort((a, b) => b.topConfidence - a.topConfidence);
  }, [data, minConfidence]);

  const keyOf = (s: Suggestion) => `${s.sourceId}|${s.targetId}|${s.relationshipType}`;

  const totalSuggestions = useMemo(
    () => groups.reduce((sum, g) => sum + g.suggestions.length, 0),
    [groups],
  );
  const acceptedCount = useMemo(
    () => groups.reduce(
      (sum, g) => sum + g.suggestions.filter((s) => !rejected.has(keyOf(s))).length,
      0,
    ),
    [groups, rejected],
  );

  const toggleSuggestion = (s: Suggestion) => {
    const k = keyOf(s);
    setRejected((prev) => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });
  };

  const toggleGroup = (sourceId: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(sourceId)) next.delete(sourceId);
      else next.add(sourceId);
      return next;
    });
  };

  const rejectAllInGroup = (group: SourceGroup) => {
    const allRejected = group.suggestions.every((s) => rejected.has(keyOf(s)));
    setRejected((prev) => {
      const next = new Set(prev);
      for (const s of group.suggestions) {
        if (allRejected) next.delete(keyOf(s));
        else next.add(keyOf(s));
      }
      return next;
    });
  };

  const apply = async () => {
    if (acceptedCount === 0) return;
    setApplying(true);
    try {
      const whitelist = groups.flatMap((g) =>
        g.suggestions
          .filter((s) => !rejected.has(keyOf(s)))
          .map((s) => ({ sourceId: s.sourceId, targetId: s.targetId, type: s.relationshipType })),
      );
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
      <div className="w-[760px] max-h-[85vh] flex flex-col bg-[#0f172a] border border-[#334155] rounded-lg shadow-xl">
        <div className="px-4 py-3 border-b border-[#334155] flex items-center gap-2">
          <Sparkles size={16} className="text-[#7c3aed]" />
          <span className="text-white font-medium">Heal Workspace</span>
          <span className="ml-auto text-xs text-slate-400">
            {data
              ? `${data.elementsAnalyzed} elements · ${groups.length} sources · ${totalSuggestions} suggestions`
              : ''}
          </span>
        </div>

        <div className="px-4 py-2 border-b border-[#334155] flex items-center gap-3">
          <label className="text-xs text-slate-300 flex items-center gap-2 flex-1">
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
          {groups.length > 0 && (
            <button
              onClick={() => {
                if (collapsed.size === groups.length) setCollapsed(new Set());
                else setCollapsed(new Set(groups.map((g) => g.sourceId)));
              }}
              className="text-xs text-slate-400 hover:text-white"
            >
              {collapsed.size === groups.length ? 'Expand all' : 'Collapse all'}
            </button>
          )}
        </div>

        <div className="flex-1 overflow-y-auto px-2 py-2">
          {loading && (
            <div className="flex items-center justify-center py-12 text-slate-400">
              <Loader2 className="animate-spin mr-2" size={16} /> Computing suggestions...
            </div>
          )}
          {!loading && groups.length === 0 && (
            <div className="text-center text-slate-400 py-12 text-sm">
              No isolated elements at this confidence threshold.
            </div>
          )}
          {!loading &&
            groups.map((group) => {
              const isCollapsed = collapsed.has(group.sourceId);
              const groupAccepted = group.suggestions.filter((s) => !rejected.has(keyOf(s))).length;
              const allRejected = groupAccepted === 0;
              return (
                <div
                  key={group.sourceId}
                  className="mb-2 rounded border border-[#334155] bg-[#0b1322]"
                >
                  <div className="flex items-center gap-2 px-3 py-2 border-b border-[#1e293b]">
                    <button
                      onClick={() => toggleGroup(group.sourceId)}
                      className="text-slate-400 hover:text-white"
                      title={isCollapsed ? 'Expand' : 'Collapse'}
                    >
                      {isCollapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
                    </button>
                    <span
                      className={`px-1.5 py-0.5 rounded text-[10px] border ${pillClass(group.sourceType)}`}
                    >
                      {group.sourceType}
                    </span>
                    <span className="text-sm text-white font-medium truncate flex-1" title={group.sourceName}>
                      {group.sourceName}
                    </span>
                    <span className="text-xs text-slate-400 shrink-0">
                      {groupAccepted}/{group.suggestions.length} accepted
                    </span>
                    <button
                      onClick={() => rejectAllInGroup(group)}
                      className="text-[10px] text-slate-400 hover:text-white border border-slate-700 rounded px-1.5 py-0.5"
                    >
                      {allRejected ? 'Accept all' : 'Reject all'}
                    </button>
                  </div>
                  {!isCollapsed && (
                    <div className="px-2 py-1.5">
                      {group.suggestions.map((s) => {
                        const k = keyOf(s);
                        const isRejected = rejected.has(k);
                        return (
                          <button
                            key={k}
                            onClick={() => toggleSuggestion(s)}
                            className={`w-full text-left px-2 py-1.5 mb-1 rounded border transition ${
                              isRejected
                                ? 'border-slate-800 opacity-40'
                                : 'border-[#334155] hover:bg-[#1e293b]'
                            }`}
                          >
                            <div className="flex items-center gap-1.5">
                              <span className="w-3 shrink-0">
                                {!isRejected && <Check size={12} className="text-green-400" />}
                              </span>
                              <ArrowRight size={11} className="text-slate-500 shrink-0" />
                              <span
                                className={`px-1.5 py-0.5 rounded text-[10px] border ${pillClass(s.targetType)}`}
                              >
                                {s.targetType}
                              </span>
                              <span className="text-sm text-white truncate flex-1" title={s.targetName}>
                                {s.targetName}
                              </span>
                              <span className="text-[10px] text-[#a78bfa] font-medium shrink-0">
                                {s.relationshipType}
                              </span>
                              <span className="text-xs text-slate-500 w-10 text-right shrink-0">
                                {(s.confidence * 100).toFixed(0)}%
                              </span>
                            </div>
                            <div className="text-xs text-slate-500 mt-0.5 ml-6">{s.reasoning}</div>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
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
