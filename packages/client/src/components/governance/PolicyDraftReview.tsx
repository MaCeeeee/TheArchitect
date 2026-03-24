import { useState, useCallback, useEffect } from 'react';
import {
  FileCheck, Check, X, Edit3, Loader2, AlertCircle,
  AlertTriangle, Info, Sparkles, ChevronDown, ChevronUp,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuthStore } from '../../stores/authStore';
import { useArchitectureStore } from '../../stores/architectureStore';
import { useComplianceStore } from '../../stores/complianceStore';
import type { PolicyDraft } from '@thearchitect/shared';

const SEVERITY_CONFIG = {
  error: { icon: AlertCircle, color: 'text-red-400', bg: 'bg-red-500/10', border: 'border-red-500/30', label: 'Error' },
  warning: { icon: AlertTriangle, color: 'text-yellow-400', bg: 'bg-yellow-500/10', border: 'border-yellow-500/30', label: 'Warning' },
  info: { icon: Info, color: 'text-blue-400', bg: 'bg-blue-500/10', border: 'border-blue-500/30', label: 'Info' },
};

interface DraftState {
  draft: PolicyDraft;
  status: 'pending' | 'approved' | 'rejected' | 'editing';
}

export function PolicyDraftReview() {
  const projectId = useArchitectureStore((s) => s.projectId);
  const token = useAuthStore((s) => s.token);
  const {
    selectedStandardId,
    pipelineStates,
    policyDrafts,
    isGeneratingPolicies,
    policyGenerationProgress,
    setPolicyDrafts,
    setGeneratingPolicies,
    setPolicyGenerationProgress,
    approvePolicies,
    selectStandard,
    loadPipelineStatus,
  } = useComplianceStore();

  // Auto-select first standard if none selected
  useEffect(() => {
    if (!selectedStandardId && pipelineStates.length > 0) {
      selectStandard(pipelineStates[0].standardId);
    }
  }, [selectedStandardId, pipelineStates, selectStandard]);

  // Ensure pipeline data is loaded
  useEffect(() => {
    if (projectId && pipelineStates.length === 0) {
      loadPipelineStatus(projectId);
    }
  }, [projectId, pipelineStates.length, loadPipelineStatus]);

  const [draftStates, setDraftStates] = useState<DraftState[]>([]);
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null);
  const [isApproving, setIsApproving] = useState(false);
  const [savedCount, setSavedCount] = useState(0);

  // Start policy generation via SSE
  const generatePolicies = useCallback(async () => {
    if (!projectId || !selectedStandardId || !token) return;

    setGeneratingPolicies(true);
    setPolicyGenerationProgress('');
    setPolicyDrafts([]);
    setDraftStates([]);
    let progressAccum = '';

    try {
      const apiBase = import.meta.env.VITE_API_URL || '/api';
      const response = await fetch(
        `${apiBase}/projects/${projectId}/standards/${selectedStandardId}/generate-policies`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
        },
      );

      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.error || `Error ${response.status}`);
      }

      const reader = response.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          try {
            const parsed = JSON.parse(line.slice(6));
            if (parsed.error) throw new Error(parsed.error);
            if (parsed.text) {
              progressAccum += parsed.text;
              setPolicyGenerationProgress(progressAccum);
            }
            if (parsed.done && parsed.drafts) {
              const drafts: PolicyDraft[] = parsed.drafts;
              setPolicyDrafts(drafts);
              setDraftStates(drafts.map((d) => ({ draft: d, status: 'pending' })));
            }
          } catch (e) {
            if (e instanceof Error && e.message !== 'Unexpected end of JSON input') {
              throw e;
            }
          }
        }
      }
    } catch (err) {
      toast.error((err as Error).message || 'Policy generation failed');
    } finally {
      setGeneratingPolicies(false);
    }
  }, [projectId, selectedStandardId, token, setGeneratingPolicies, setPolicyGenerationProgress, setPolicyDrafts]);

  const setDraftStatus = (index: number, status: DraftState['status']) => {
    setDraftStates((prev) => prev.map((d, i) => (i === index ? { ...d, status } : d)));
  };

  const approveAll = () => {
    setDraftStates((prev) => prev.map((d) => d.status === 'pending' ? { ...d, status: 'approved' } : d));
  };

  const rejectAll = () => {
    setDraftStates((prev) => prev.map((d) => d.status === 'pending' ? { ...d, status: 'rejected' } : d));
  };

  const submitApproved = async () => {
    if (!projectId || !selectedStandardId) return;
    const approved = draftStates.filter((d) => d.status === 'approved').map((d) => d.draft);
    if (approved.length === 0) {
      toast.error('No policies approved');
      return;
    }

    setIsApproving(true);
    try {
      const created = await approvePolicies(projectId, selectedStandardId, approved);
      if (created > 0) {
        toast.success(`${created} policies created`);
        setSavedCount(created);
        setDraftStates([]);
        setPolicyDrafts([]);
      }
    } finally {
      setIsApproving(false);
    }
  };

  const approvedCount = draftStates.filter((d) => d.status === 'approved').length;
  const rejectedCount = draftStates.filter((d) => d.status === 'rejected').length;
  const pendingCount = draftStates.filter((d) => d.status === 'pending').length;

  if (!selectedStandardId) {
    return (
      <div className="p-4 text-center text-gray-500 text-sm">
        Select a standard in the Pipeline tab to generate policies.
      </div>
    );
  }

  return (
    <div className="p-3 space-y-3">
      {/* Success state after saving policies */}
      {savedCount > 0 && draftStates.length === 0 && !isGeneratingPolicies && (
        <div className="bg-[var(--accent-default)]/10 border border-[var(--accent-default)]/30 rounded-lg p-4 text-center space-y-3">
          <div className="flex items-center justify-center gap-2 text-[var(--accent-default)]">
            <Check size={18} />
            <span className="text-sm font-semibold">{savedCount} Policies Saved</span>
          </div>
          <p className="text-xs text-[var(--text-secondary)]">
            Policies are now active. Continue to Elements to see AI-suggested architecture additions, or generate more policies.
          </p>
          <div className="flex gap-2 justify-center">
            <button
              onClick={() => setSavedCount(0)}
              className="px-3 py-1.5 text-xs text-[var(--text-secondary)] border border-[var(--border-subtle)] rounded hover:bg-[var(--surface-overlay)] transition"
            >
              Generate More
            </button>
          </div>
        </div>
      )}

      {/* Generate Button */}
      {savedCount === 0 && draftStates.length === 0 && !isGeneratingPolicies && (
        <button
          onClick={generatePolicies}
          className="w-full flex items-center justify-center gap-2 px-3 py-2.5 bg-[#7c3aed] hover:bg-[#6d28d9] text-white rounded text-sm font-medium transition-colors"
        >
          <Sparkles size={14} />
          Generate Policy Drafts
        </button>
      )}

      {/* Generation Progress */}
      {isGeneratingPolicies && (
        <div className="bg-[#111827] border border-[var(--border-subtle)] rounded p-3">
          <div className="flex items-center gap-2 text-sm text-[#38bdf8] mb-2">
            <Loader2 size={14} className="animate-spin" />
            Analyzing standard sections...
          </div>
          {policyGenerationProgress && (
            <div className="text-xs text-gray-500 max-h-20 overflow-y-auto font-mono">
              {policyGenerationProgress.slice(-200)}
            </div>
          )}
        </div>
      )}

      {/* Draft Cards */}
      {draftStates.length > 0 && (
        <>
          {/* Bulk Actions */}
          <div className="flex items-center justify-between">
            <span className="text-xs text-gray-400">
              {draftStates.length} drafts — {approvedCount} approved, {rejectedCount} rejected, {pendingCount} pending
            </span>
            <div className="flex gap-1">
              <button onClick={approveAll} className="text-[10px] px-2 py-1 rounded bg-green-500/10 text-green-400 hover:bg-green-500/20">
                Approve All
              </button>
              <button onClick={rejectAll} className="text-[10px] px-2 py-1 rounded bg-red-500/10 text-red-400 hover:bg-red-500/20">
                Reject All
              </button>
            </div>
          </div>

          {/* Draft List */}
          <div className="space-y-2 max-h-[60vh] overflow-y-auto">
            {draftStates.map((ds, i) => {
              const sev = SEVERITY_CONFIG[ds.draft.severity];
              const SevIcon = sev.icon;
              const isExpanded = expandedIndex === i;

              return (
                <div
                  key={i}
                  className={`border rounded p-2.5 transition-colors ${
                    ds.status === 'approved'
                      ? 'bg-green-500/5 border-green-500/30'
                      : ds.status === 'rejected'
                      ? 'bg-red-500/5 border-red-500/30 opacity-60'
                      : 'bg-[#111827] border-[var(--border-subtle)]'
                  }`}
                >
                  {/* Header */}
                  <div className="flex items-start gap-2">
                    <SevIcon size={14} className={`${sev.color} mt-0.5 shrink-0`} />
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-medium text-white truncate">{ds.draft.name}</div>
                      <div className="text-[10px] text-gray-500 mt-0.5">
                        §{ds.draft.sourceSection} {ds.draft.sourceSectionTitle}
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      {/* Confidence badge */}
                      <span className={`text-[10px] px-1.5 py-0.5 rounded ${
                        ds.draft.confidence >= 0.8 ? 'bg-green-500/10 text-green-400'
                        : ds.draft.confidence >= 0.5 ? 'bg-yellow-500/10 text-yellow-400'
                        : 'bg-red-500/10 text-red-400'
                      }`}>
                        {Math.round(ds.draft.confidence * 100)}%
                      </span>
                      {/* Severity badge */}
                      <span className={`text-[10px] px-1.5 py-0.5 rounded ${sev.bg} ${sev.color}`}>
                        {sev.label}
                      </span>
                    </div>
                  </div>

                  {/* Description */}
                  <p className="text-[11px] text-gray-400 mt-1.5 line-clamp-2">{ds.draft.description}</p>

                  {/* Expandable Rules */}
                  <button
                    onClick={() => setExpandedIndex(isExpanded ? null : i)}
                    className="flex items-center gap-1 text-[10px] text-gray-500 hover:text-gray-300 mt-1.5"
                  >
                    {isExpanded ? <ChevronUp size={10} /> : <ChevronDown size={10} />}
                    {ds.draft.rules.length} rule{ds.draft.rules.length !== 1 ? 's' : ''}
                    {ds.draft.scope.layers.length > 0 && ` · ${ds.draft.scope.layers.join(', ')}`}
                  </button>

                  {isExpanded && (
                    <div className="mt-2 space-y-1">
                      {ds.draft.rules.map((rule, ri) => (
                        <div key={ri} className="text-[10px] bg-[var(--surface-raised)] rounded px-2 py-1.5 font-mono text-gray-300">
                          <span className="text-[#38bdf8]">{rule.field}</span>
                          {' '}<span className="text-[#7c3aed]">{rule.operator}</span>
                          {' '}<span className="text-green-400">{JSON.stringify(rule.value)}</span>
                          <div className="text-gray-500 mt-0.5 font-sans">{rule.message}</div>
                        </div>
                      ))}
                      {ds.draft.scope.elementTypes.length > 0 && (
                        <div className="text-[10px] text-gray-500">
                          Scope: {ds.draft.scope.elementTypes.join(', ')}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Action Buttons */}
                  {ds.status === 'pending' && (
                    <div className="flex gap-1.5 mt-2">
                      <button
                        onClick={() => setDraftStatus(i, 'approved')}
                        className="flex items-center gap-1 text-[10px] px-2 py-1 rounded bg-green-500/10 text-green-400 hover:bg-green-500/20"
                      >
                        <Check size={10} /> Approve
                      </button>
                      <button
                        onClick={() => setDraftStatus(i, 'rejected')}
                        className="flex items-center gap-1 text-[10px] px-2 py-1 rounded bg-red-500/10 text-red-400 hover:bg-red-500/20"
                      >
                        <X size={10} /> Reject
                      </button>
                    </div>
                  )}
                  {ds.status !== 'pending' && (
                    <button
                      onClick={() => setDraftStatus(i, 'pending')}
                      className="text-[10px] text-gray-500 hover:text-gray-300 mt-2"
                    >
                      Undo
                    </button>
                  )}
                </div>
              );
            })}
          </div>

          {/* Submit Approved */}
          {approvedCount > 0 && (
            <button
              onClick={submitApproved}
              disabled={isApproving}
              className="w-full flex items-center justify-center gap-2 px-3 py-2.5 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white rounded text-sm font-medium transition-colors"
            >
              {isApproving ? (
                <><Loader2 size={14} className="animate-spin" /> Saving...</>
              ) : (
                <><FileCheck size={14} /> Save {approvedCount} Approved Policies</>
              )}
            </button>
          )}
        </>
      )}
    </div>
  );
}
