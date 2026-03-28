import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import {
  Wrench, Loader2, RefreshCw, AlertCircle, Sparkles,
  FileSearch, ShieldAlert, Zap,
} from 'lucide-react';
import { useRemediationStore } from '../../stores/remediationStore';
import { useComplianceStore } from '../../stores/complianceStore';
import { useAdvisorStore } from '../../stores/advisorStore';
import ProposalCard from './ProposalCard';
import ProposalDiffView from './ProposalDiffView';
import type { RemediationContext } from '@thearchitect/shared';

type SourceMode = 'compliance' | 'advisor' | 'manual';

export default function RemediationPanel() {
  const { projectId } = useParams();
  const {
    proposals, isGenerating, isApplying, generationProgress, error,
    selectedProposalId,
    generate, loadProposals, selectProposal, editProposal, applyProposal,
    rollbackProposal, setPreviewElements, clearPreview,
  } = useRemediationStore();

  const pipelineStates = useComplianceStore((s) => s.pipelineStates);
  const insights = useAdvisorStore((s) => s.insights);

  const [sourceMode, setSourceMode] = useState<SourceMode>('compliance');
  const [manualPrompt, setManualPrompt] = useState('');

  // Load proposals on mount
  useEffect(() => {
    if (projectId) {
      loadProposals(projectId);
    }
    return () => { clearPreview(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  if (!projectId) {
    return (
      <div className="flex flex-col h-full items-center justify-center p-6">
        <Wrench size={24} className="text-[var(--text-disabled)] mb-2" />
        <p className="text-xs text-[var(--text-tertiary)] text-center">
          Open a project to use the Remediation Engine.
        </p>
      </div>
    );
  }

  const handleGenerate = () => {
    if (!projectId || isGenerating) return;

    let context: RemediationContext;

    if (sourceMode === 'compliance') {
      // Collect all gap section IDs from pipeline states
      const gapSectionIds: string[] = [];
      let standardId = '';
      for (const ps of pipelineStates) {
        if (ps.mappingStats && ps.mappingStats.gap > 0) {
          standardId = ps.standardId;
          // We'll request remediation for this standard's gaps
          break;
        }
      }
      if (!standardId) {
        useRemediationStore.setState({ error: 'No compliance gaps found. Upload a standard and run AI mapping first.' });
        return;
      }
      context = { source: 'compliance', standardId, gapSectionIds: gapSectionIds.length > 0 ? gapSectionIds : ['all'] };
    } else if (sourceMode === 'advisor') {
      const remediableInsights = insights.filter((i) =>
        ['missing_compliance_element', 'orphan_elements', 'missing_connection', 'maturity_gap', 'single_point_of_failure'].includes(i.category),
      );
      if (remediableInsights.length === 0) {
        useRemediationStore.setState({ error: 'No remediable advisor insights found. Run an Advisor scan first.' });
        return;
      }
      context = { source: 'advisor', insightIds: remediableInsights.slice(0, 10).map((i) => i.id) };
    } else {
      if (!manualPrompt.trim()) {
        useRemediationStore.setState({ error: 'Please enter a description of what to remediate.' });
        return;
      }
      context = { source: 'manual', prompt: manualPrompt.trim() };
    }

    generate(projectId, context);
  };

  const selectedProposal = proposals.find((p) => p.id === selectedProposalId);

  const pendingProposals = proposals.filter((p) => p.status === 'validated' || p.status === 'draft');
  const appliedProposals = proposals.filter((p) => p.status === 'applied' || p.status === 'partially_applied');

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-3 py-2 flex items-center justify-between border-b border-[var(--border-subtle)]">
        <h3 className="text-[11px] font-semibold text-white flex items-center gap-1.5">
          <Wrench size={12} className="text-[#7c3aed]" />
          Remediation Engine
        </h3>
        <button
          onClick={() => loadProposals(projectId)}
          className="p-1 rounded hover:bg-white/5 text-[var(--text-tertiary)] hover:text-white transition"
          title="Refresh"
        >
          <RefreshCw size={11} />
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {/* Source Selector */}
        <div className="space-y-2">
          <div className="flex gap-1">
            {([
              { mode: 'compliance' as const, icon: FileSearch, label: 'Compliance' },
              { mode: 'advisor' as const, icon: ShieldAlert, label: 'Advisor' },
              { mode: 'manual' as const, icon: Sparkles, label: 'Manual' },
            ]).map(({ mode, icon: Icon, label }) => (
              <button
                key={mode}
                onClick={() => setSourceMode(mode)}
                className={`flex-1 flex items-center justify-center gap-1 px-2 py-1.5 rounded text-[9px] font-medium transition ${
                  sourceMode === mode
                    ? 'bg-[#7c3aed]/20 text-[#7c3aed] border border-[#7c3aed]/30'
                    : 'bg-[#1e293b] text-[var(--text-tertiary)] border border-[#334155] hover:border-[#475569]'
                }`}
              >
                <Icon size={10} />
                {label}
              </button>
            ))}
          </div>

          {sourceMode === 'manual' && (
            <textarea
              value={manualPrompt}
              onChange={(e) => setManualPrompt(e.target.value)}
              placeholder="Describe what gaps to address..."
              className="w-full h-16 px-2 py-1.5 rounded bg-[#0f172a] border border-[#334155] text-[9px] text-white placeholder-[var(--text-disabled)] resize-none outline-none focus:border-[#7c3aed]/50"
            />
          )}

          <button
            onClick={handleGenerate}
            disabled={isGenerating}
            className="w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded text-[10px] font-medium bg-[#7c3aed] text-white hover:bg-[#6d28d9] disabled:opacity-50 disabled:cursor-not-allowed transition"
          >
            {isGenerating ? (
              <>
                <Loader2 size={11} className="animate-spin" />
                {generationProgress || 'Generating...'}
              </>
            ) : (
              <>
                <Zap size={11} />
                Generate Remediation
              </>
            )}
          </button>
        </div>

        {/* Error */}
        {error && (
          <div className="flex items-start gap-1.5 p-2 rounded bg-red-500/10 border border-red-500/20">
            <AlertCircle size={10} className="text-red-400 mt-0.5 shrink-0" />
            <p className="text-[9px] text-red-300">{error}</p>
          </div>
        )}

        {/* Selected Proposal Diff View */}
        {selectedProposal && (
          <div className="p-2 rounded border border-[#7c3aed]/20 bg-[#7c3aed]/5">
            <ProposalDiffView proposal={selectedProposal} />
          </div>
        )}

        {/* Pending Proposals */}
        {pendingProposals.length > 0 && (
          <div className="space-y-1.5">
            <span className="text-[8px] text-[var(--text-tertiary)] uppercase tracking-wider">
              Pending ({pendingProposals.length})
            </span>
            {pendingProposals.map((p) => (
              <ProposalCard
                key={p.id}
                proposal={p}
                onApply={(id, tempIds) => applyProposal(projectId, id, tempIds)}
                onRollback={(id) => rollbackProposal(projectId, id)}
                onEdit={(id, changes) => editProposal(projectId, id, changes)}
                onPreview={(elements) => {
                  selectProposal(p.id);
                  setPreviewElements(elements);
                }}
                isApplying={isApplying}
              />
            ))}
          </div>
        )}

        {/* Applied Proposals */}
        {appliedProposals.length > 0 && (
          <div className="space-y-1.5">
            <span className="text-[8px] text-[var(--text-tertiary)] uppercase tracking-wider">
              Applied ({appliedProposals.length})
            </span>
            {appliedProposals.map((p) => (
              <ProposalCard
                key={p.id}
                proposal={p}
                onApply={(id, tempIds) => applyProposal(projectId, id, tempIds)}
                onRollback={(id) => rollbackProposal(projectId, id)}
                onEdit={(id, changes) => editProposal(projectId, id, changes)}
                onPreview={(elements) => {
                  selectProposal(p.id);
                  setPreviewElements(elements);
                }}
                isApplying={isApplying}
              />
            ))}
          </div>
        )}

        {/* Empty State */}
        {proposals.length === 0 && !isGenerating && !error && (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <Wrench size={28} className="text-[var(--text-disabled)] mb-3" />
            <p className="text-[10px] text-[var(--text-tertiary)] mb-1">No remediation proposals yet</p>
            <p className="text-[9px] text-[var(--text-disabled)] max-w-[200px]">
              Select a source and generate proposals to close architecture gaps with AI-powered suggestions.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
