import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Loader2, Sparkles, AlertTriangle, CheckCircle2, Link, ArrowRight, RefreshCw } from 'lucide-react';
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
  const navigate = useNavigate();
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

  // Auto-select first standard if none selected
  const { pipelineStates, selectStandard, loadPipelineStatus } = useComplianceStore();

  useEffect(() => {
    if (!selectedStandardId && pipelineStates.length > 0) {
      selectStandard(pipelineStates[0].standardId);
    }
  }, [selectedStandardId, pipelineStates, selectStandard]);

  useEffect(() => {
    if (projectId && pipelineStates.length === 0) {
      loadPipelineStatus(projectId);
    }
  }, [projectId, pipelineStates.length, loadPipelineStatus]);

  const allCreated = suggestions.length > 0 && suggestions.every((s) => createdNames.has(s.name));
  const someCreated = createdNames.size > 0;

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
        <Loader2 size={16} className="animate-spin" />
        Analyzing coverage gaps...
      </div>
    );
  }

  if (suggestions.length === 0) {
    return (
      <div className="p-6 text-center space-y-3">
        <CheckCircle2 size={28} className="mx-auto text-green-500" />
        <p className="text-sm text-gray-400">No missing elements detected.</p>
        <p className="text-sm text-[var(--text-secondary)]">
          Your architecture covers all mapped standard sections. Continue to the Roadmap to plan the transformation.
        </p>
        <button
          onClick={() => navigate(`/project/${projectId}/compliance/roadmap`)}
          className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-[#7c3aed] hover:bg-[#6d28d9] rounded transition"
        >
          Continue to Roadmap <ArrowRight size={14} />
        </button>
      </div>
    );
  }

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm text-gray-400">
          <Sparkles size={16} className="text-[#7c3aed]" />
          {suggestions.length} suggested element{suggestions.length !== 1 ? 's' : ''}
        </div>
        <button
          onClick={loadSuggestions}
          className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-300"
        >
          <RefreshCw size={12} /> Refresh
        </button>
      </div>

      <div className="space-y-3 max-h-[60vh] overflow-y-auto">
        {suggestions.map((s, i) => {
          const isCreated = createdNames.has(s.name);
          const isCreating = creatingIndex === i;
          const prio = PRIORITY_CONFIG[s.priority];

          return (
            <div
              key={i}
              className={`border rounded-lg p-3.5 transition-colors ${
                isCreated
                  ? 'bg-green-500/5 border-green-500/30'
                  : 'bg-[#111827] border-[var(--border-subtle)]'
              }`}
            >
              <div className="flex items-start gap-2.5">
                <AlertTriangle size={18} className="text-yellow-400 mt-0.5 shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-white">{s.name}</div>
                  <div className="text-xs text-gray-500 mt-0.5">
                    {s.type} · {s.layer} · §{s.sectionNumber}
                  </div>
                </div>
                <span className={`text-xs px-2 py-0.5 rounded shrink-0 ${prio.bg} ${prio.color}`}>
                  {prio.label}
                </span>
              </div>

              <p className="text-sm text-gray-400 mt-2 line-clamp-2">{s.description}</p>

              {s.connections.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {s.connections.slice(0, 3).map((c, ci) => (
                    <span key={ci} className="flex items-center gap-1 text-xs px-2 py-0.5 rounded bg-[var(--surface-raised)] text-gray-400">
                      <Link size={10} /> {c.targetName}
                    </span>
                  ))}
                </div>
              )}

              {!isCreated ? (
                <button
                  onClick={() => handleCreate(s, i)}
                  disabled={isCreating}
                  className="flex items-center gap-1.5 mt-2.5 text-xs px-3 py-1.5 rounded bg-[#7c3aed]/10 text-[#7c3aed] hover:bg-[#7c3aed]/20 disabled:opacity-50"
                >
                  {isCreating ? (
                    <><Loader2 size={14} className="animate-spin" /> Creating...</>
                  ) : (
                    <><Plus size={14} /> Create Element</>
                  )}
                </button>
              ) : (
                <div className="flex items-center gap-1.5 mt-2.5 text-xs text-green-400">
                  <CheckCircle2 size={14} /> Created
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Next Step: Continue to Roadmap */}
      {(allCreated || someCreated) && (
        <div className="bg-[var(--accent-default)]/10 border border-[var(--accent-default)]/30 rounded-lg p-4 space-y-2">
          <p className="text-sm text-[var(--text-secondary)]">
            {allCreated
              ? 'All elements created. Plan the transformation roadmap next.'
              : `${createdNames.size} of ${suggestions.length} elements created. You can continue to the Roadmap or create more elements.`}
          </p>
          <button
            onClick={() => navigate(`/project/${projectId}/compliance/roadmap`)}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-[#7c3aed] hover:bg-[#6d28d9] rounded transition"
          >
            Continue to Roadmap <ArrowRight size={14} />
          </button>
        </div>
      )}
    </div>
  );
}
