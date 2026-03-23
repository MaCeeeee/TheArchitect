import { useState, useEffect, useCallback } from 'react';
import { Plus, Loader2, Sparkles, AlertTriangle, CheckCircle2, Link } from 'lucide-react';
import toast from 'react-hot-toast';
import { useArchitectureStore } from '../../stores/architectureStore';
import { useComplianceStore } from '../../stores/complianceStore';
import { compliancePipelineAPI } from '../../services/api';

interface SuggestedElement {
  name: string;
  type: string;
  layer: string;
  description: string;
  sectionNumber: string;
  sectionTitle: string;
  priority: 'high' | 'medium' | 'low';
  connections: Array<{ targetName: string; type: string }>;
}

const PRIORITY_CONFIG = {
  high: { color: 'text-red-400', bg: 'bg-red-500/10', label: 'High' },
  medium: { color: 'text-yellow-400', bg: 'bg-yellow-500/10', label: 'Medium' },
  low: { color: 'text-blue-400', bg: 'bg-blue-500/10', label: 'Low' },
};

export function SuggestedElements() {
  const projectId = useArchitectureStore((s) => s.projectId);
  const { selectedStandardId } = useComplianceStore();
  const [suggestions, setSuggestions] = useState<SuggestedElement[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [creatingIndex, setCreatingIndex] = useState<number | null>(null);
  const [createdNames, setCreatedNames] = useState<Set<string>>(new Set());

  const loadSuggestions = useCallback(async () => {
    if (!projectId || !selectedStandardId) return;
    setIsLoading(true);
    try {
      const res = await compliancePipelineAPI.suggestElements(projectId, selectedStandardId);
      setSuggestions(res.data);
    } catch {
      toast.error('Failed to load suggestions');
    } finally {
      setIsLoading(false);
    }
  }, [projectId, selectedStandardId]);

  useEffect(() => {
    loadSuggestions();
  }, [loadSuggestions]);

  const handleCreate = async (suggestion: SuggestedElement, index: number) => {
    if (!projectId || !selectedStandardId) return;
    setCreatingIndex(index);
    try {
      await compliancePipelineAPI.acceptSuggestedElement(projectId, selectedStandardId, {
        name: suggestion.name,
        type: suggestion.type,
        layer: suggestion.layer,
        description: suggestion.description,
        sectionNumber: suggestion.sectionNumber,
      });
      setCreatedNames((prev) => new Set(prev).add(suggestion.name));
      toast.success(`Created "${suggestion.name}"`);
    } catch {
      toast.error('Failed to create element');
    } finally {
      setCreatingIndex(null);
    }
  };

  if (!selectedStandardId) {
    return (
      <div className="p-4 text-center text-gray-500 text-sm">
        Select a standard in the Pipeline tab to see element suggestions.
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="p-4 flex items-center justify-center gap-2 text-gray-400 text-sm">
        <Loader2 size={14} className="animate-spin" />
        Analyzing coverage gaps...
      </div>
    );
  }

  if (suggestions.length === 0) {
    return (
      <div className="p-4 text-center text-gray-500 text-sm">
        <CheckCircle2 size={20} className="mx-auto mb-2 text-green-500" />
        No missing elements detected.
      </div>
    );
  }

  return (
    <div className="p-3 space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-xs text-gray-400">
          <Sparkles size={12} className="text-[#7c3aed]" />
          {suggestions.length} suggested element{suggestions.length !== 1 ? 's' : ''}
        </div>
        <button
          onClick={loadSuggestions}
          className="text-[10px] text-gray-500 hover:text-gray-300"
        >
          Refresh
        </button>
      </div>

      <div className="space-y-2 max-h-[60vh] overflow-y-auto">
        {suggestions.map((s, i) => {
          const isCreated = createdNames.has(s.name);
          const isCreating = creatingIndex === i;
          const prio = PRIORITY_CONFIG[s.priority];

          return (
            <div
              key={i}
              className={`border rounded p-2.5 transition-colors ${
                isCreated
                  ? 'bg-green-500/5 border-green-500/30'
                  : 'bg-[#111827] border-[#1e293b]'
              }`}
            >
              <div className="flex items-start gap-2">
                <AlertTriangle size={12} className="text-yellow-400 mt-0.5 shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-medium text-white">{s.name}</div>
                  <div className="text-[10px] text-gray-500 mt-0.5">
                    {s.type} · {s.layer} · §{s.sectionNumber}
                  </div>
                </div>
                <span className={`text-[10px] px-1.5 py-0.5 rounded shrink-0 ${prio.bg} ${prio.color}`}>
                  {prio.label}
                </span>
              </div>

              <p className="text-[11px] text-gray-400 mt-1.5 line-clamp-2">{s.description}</p>

              {s.connections.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-1.5">
                  {s.connections.slice(0, 3).map((c, ci) => (
                    <span key={ci} className="flex items-center gap-0.5 text-[9px] px-1.5 py-0.5 rounded bg-[#0f172a] text-gray-400">
                      <Link size={8} /> {c.targetName}
                    </span>
                  ))}
                </div>
              )}

              {!isCreated ? (
                <button
                  onClick={() => handleCreate(s, i)}
                  disabled={isCreating}
                  className="flex items-center gap-1 mt-2 text-[10px] px-2 py-1 rounded bg-[#7c3aed]/10 text-[#7c3aed] hover:bg-[#7c3aed]/20 disabled:opacity-50"
                >
                  {isCreating ? (
                    <><Loader2 size={10} className="animate-spin" /> Creating...</>
                  ) : (
                    <><Plus size={10} /> Create Element</>
                  )}
                </button>
              ) : (
                <div className="flex items-center gap-1 mt-2 text-[10px] text-green-400">
                  <CheckCircle2 size={10} /> Created
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
