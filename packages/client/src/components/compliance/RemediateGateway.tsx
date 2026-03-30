import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Wrench, ArrowRight, CheckCircle2, XCircle, AlertTriangle, Sparkles, Loader2 } from 'lucide-react';
import { useComplianceStore } from '../../stores/complianceStore';
import { useRemediationStore } from '../../stores/remediationStore';
import { useArchitectureStore } from '../../stores/architectureStore';
import { standardsAPI } from '../../services/api';
import ProposalCard from '../copilot/ProposalCard';

export default function RemediateGateway() {
  const navigate = useNavigate();
  const { projectId: paramProjectId } = useParams<{ projectId: string }>();
  const storeProjectId = useArchitectureStore((s) => s.projectId);
  const projectId = paramProjectId || storeProjectId;
  const { portfolioOverview, selectedStandardId } = useComplianceStore();
  const proposals = useRemediationStore((s) => s.proposals);
  const loadProposals = useRemediationStore((s) => s.loadProposals);
  const generate = useRemediationStore((s) => s.generate);
  const isGenerating = useRemediationStore((s) => s.isGenerating);
  const isApplying = useRemediationStore((s) => s.isApplying);
  const generationProgress = useRemediationStore((s) => s.generationProgress);
  const applyProposal = useRemediationStore((s) => s.applyProposal);
  const rollbackProposal = useRemediationStore((s) => s.rollbackProposal);
  const editProposal = useRemediationStore((s) => s.editProposal);
  const selectProposal = useRemediationStore((s) => s.selectProposal);

  const selectedItem = portfolioOverview?.portfolio.find(
    (p) => p.standardId === selectedStandardId,
  );

  const gapCount = selectedItem?.mappingStats.gap ?? 0;
  const partialCount = selectedItem?.mappingStats.partial ?? 0;
  const totalIssues = gapCount + partialCount;

  const [gapSectionIds, setGapSectionIds] = useState<string[]>([]);

  const pendingProposals = proposals.filter((p) => p.status === 'validated' || p.status === 'draft');
  const appliedProposals = proposals.filter((p) => p.status === 'applied' || p.status === 'partially_applied');

  useEffect(() => {
    if (!projectId || projectId === 'null') return;
    if (proposals.length === 0 && !isGenerating) {
      loadProposals(projectId);
    }
    // Load gap section IDs from mappings
    if (selectedStandardId) {
      standardsAPI.getMappings(projectId, selectedStandardId).then((res) => {
        const mappings = res.data?.data || res.data || [];
        const ids = [...new Set(
          (Array.isArray(mappings) ? mappings : [])
            .filter((m: { status: string }) => m.status === 'gap')
            .map((m: { sectionId: string }) => m.sectionId),
        )];
        setGapSectionIds(ids);
      }).catch(() => {});
    }
  }, [projectId, selectedStandardId]);  // eslint-disable-line react-hooks/exhaustive-deps

  const handleGenerate = () => {
    if (!projectId || !selectedStandardId || gapSectionIds.length === 0) return;
    generate(projectId, {
      source: 'compliance',
      standardId: selectedStandardId,
      gapSectionIds,
    });
  };

  const handleApply = (proposalId: string, selectedTempIds?: string[]) => {
    if (!projectId) return;
    applyProposal(projectId, proposalId, selectedTempIds);
  };

  const handleRollback = (proposalId: string) => {
    if (!projectId) return;
    rollbackProposal(projectId, proposalId);
  };

  const handleEdit = (proposalId: string, changes: Record<string, unknown>) => {
    if (!projectId) return;
    editProposal(projectId, proposalId, changes);
  };

  return (
    <div className="max-w-2xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-lg bg-[#7c3aed]/20 flex items-center justify-center">
          <Wrench size={20} className="text-[#a78bfa]" />
        </div>
        <div>
          <h2 className="text-lg font-semibold text-white">Remediate Gaps</h2>
          <p className="text-xs text-[var(--text-tertiary)]">
            Fix detected gaps before generating policies
          </p>
        </div>
      </div>

      {/* Gap Summary */}
      {selectedItem ? (
        <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-raised)] p-4 mb-4">
          <p className="text-sm font-medium text-white mb-3">
            {selectedItem.standardName}
          </p>
          <div className="grid grid-cols-3 gap-3">
            <div className="flex items-center gap-2 text-sm">
              <XCircle size={14} className="text-red-400" />
              <span className="text-red-400 font-medium">{gapCount}</span>
              <span className="text-[var(--text-tertiary)]">Gaps</span>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <AlertTriangle size={14} className="text-yellow-400" />
              <span className="text-yellow-400 font-medium">{partialCount}</span>
              <span className="text-[var(--text-tertiary)]">Partial</span>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <CheckCircle2 size={14} className="text-emerald-400" />
              <span className="text-emerald-400 font-medium">{selectedItem.mappingStats.compliant}</span>
              <span className="text-[var(--text-tertiary)]">Compliant</span>
            </div>
          </div>
        </div>
      ) : (
        <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-raised)] p-4 mb-4 text-center">
          <p className="text-sm text-[var(--text-tertiary)]">
            Select a standard in the Pipeline tab first.
          </p>
        </div>
      )}

      {/* Generate Button */}
      {totalIssues > 0 && selectedStandardId && !isGenerating && (
        <button
          onClick={handleGenerate}
          className="flex items-center justify-center gap-2 w-full py-3 rounded-lg bg-[#7c3aed]/10 border border-[#7c3aed]/30 text-[#a78bfa] hover:bg-[#7c3aed]/20 transition text-sm font-medium mb-4"
        >
          <Sparkles size={16} />
          Generate AI Fix for {totalIssues} issue{totalIssues !== 1 ? 's' : ''}
        </button>
      )}

      {/* Generation Progress */}
      {isGenerating && (
        <div className="rounded-lg border border-[#7c3aed]/30 bg-[#7c3aed]/5 p-4 mb-4">
          <div className="flex items-center gap-2 mb-2">
            <Loader2 size={14} className="animate-spin text-[#a78bfa]" />
            <span className="text-sm font-medium text-[#a78bfa]">Generating remediation proposals...</span>
          </div>
          {generationProgress && (
            <p className="text-xs text-[var(--text-tertiary)] line-clamp-3">{generationProgress}</p>
          )}
        </div>
      )}

      {/* Proposal Cards — inline review */}
      {pendingProposals.length > 0 && (
        <div className="space-y-3 mb-4">
          <p className="text-sm font-medium text-white">
            {pendingProposals.length} proposal{pendingProposals.length !== 1 ? 's' : ''} ready for review
          </p>
          {pendingProposals.map((proposal) => (
            <ProposalCard
              key={proposal.id}
              proposal={proposal}
              onApply={handleApply}
              onRollback={handleRollback}
              onEdit={handleEdit}
              onPreview={() => selectProposal(proposal.id)}
              isApplying={isApplying}
            />
          ))}
        </div>
      )}

      {/* Applied Proposals */}
      {appliedProposals.length > 0 && (
        <div className="space-y-3 mb-4">
          <div className="flex items-center gap-2">
            <CheckCircle2 size={14} className="text-emerald-400" />
            <p className="text-sm font-medium text-emerald-400">
              {appliedProposals.length} applied
            </p>
          </div>
          {appliedProposals.map((proposal) => (
            <ProposalCard
              key={proposal.id}
              proposal={proposal}
              onApply={handleApply}
              onRollback={handleRollback}
              onEdit={handleEdit}
              onPreview={() => selectProposal(proposal.id)}
              isApplying={isApplying}
            />
          ))}
        </div>
      )}

      {/* No gaps state */}
      {totalIssues === 0 && selectedItem && pendingProposals.length === 0 && (
        <div className="text-center py-4 mb-4">
          <CheckCircle2 size={24} className="text-emerald-400 mx-auto mb-2" />
          <p className="text-sm text-emerald-400 font-medium">No gaps detected</p>
          <p className="text-xs text-[var(--text-tertiary)] mt-1">All sections are compliant or partially mapped.</p>
        </div>
      )}

      {/* Next Step */}
      <button
        onClick={() => navigate(`/project/${projectId}/compliance/policies`)}
        className="flex items-center justify-between w-full py-3 px-4 rounded-lg bg-[var(--surface-raised)] border border-[var(--border-subtle)] text-white hover:border-[var(--status-purple)]/40 transition text-sm group"
      >
        <span>
          {pendingProposals.length > 0 ? 'Skip to Policies' : 'Continue to Policies'}
        </span>
        <ArrowRight size={16} className="text-[var(--text-tertiary)] group-hover:text-[var(--status-purple)] group-hover:translate-x-0.5 transition-all" />
      </button>
    </div>
  );
}
