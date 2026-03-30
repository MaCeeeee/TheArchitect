// packages/client/src/components/copilot/CompliancePipelineWizard.tsx
import React, { useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Upload, Map, FileCheck, Route, Activity, ChevronRight, ArrowRight, Wrench } from 'lucide-react';
import { useComplianceStore } from '../../stores/complianceStore';
import { useArchitectureStore } from '../../stores/architectureStore';

const PIPELINE_STEPS = [
  { key: 'uploaded', icon: Upload, label: 'Upload', description: 'Standard uploaded', section: 'standards' },
  { key: 'mapped', icon: Map, label: 'Mapping', description: 'AI auto-mapping', section: 'matrix' },
  { key: 'mapped', icon: Wrench, label: 'Remediate', description: 'Fix detected gaps', section: 'remediate' },
  { key: 'policies_generated', icon: FileCheck, label: 'Policies', description: 'Policy generation', section: 'policies' },
  { key: 'roadmap_ready', icon: Route, label: 'Roadmap', description: 'Compliance roadmap', section: 'elements' },
  { key: 'tracking', icon: Activity, label: 'Tracking', description: 'Progress tracking', section: 'progress' },
] as const;

const STAGE_INDEX: Record<string, number> = {
  uploaded: 0,
  mapped: 1,
  // 'remediate' shares the 'mapped' backend stage (index 1) — it's a UI-only gateway
  policies_generated: 3,
  roadmap_ready: 4,
  tracking: 5,
};

export function CompliancePipelineWizard() {
  const navigate = useNavigate();
  const { projectId: paramProjectId } = useParams<{ projectId: string }>();
  const { portfolioOverview, isLoading, loadPortfolio, selectedStandardId, selectStandard } =
    useComplianceStore();
  const projectId = useArchitectureStore((s) => s.projectId) || paramProjectId;

  useEffect(() => {
    if (projectId) loadPortfolio(projectId);
  }, [projectId, loadPortfolio]);

  const selectedItem = portfolioOverview?.portfolio.find(
    (p) => p.standardId === selectedStandardId
  );
  const currentStageIndex = selectedItem ? STAGE_INDEX[selectedItem.stage] ?? 0 : -1;

  if (isLoading) {
    return <div className="p-4 text-gray-400 text-sm">Loading pipeline...</div>;
  }

  if (!portfolioOverview || portfolioOverview.portfolio.length === 0) {
    return (
      <div className="p-4 text-center text-gray-500 text-sm">
        <p>No standards in pipeline.</p>
        <p className="text-xs text-gray-600 mt-1">Upload a standard in the Standards tab first.</p>
      </div>
    );
  }

  return (
    <div className="p-3 space-y-3">
      {/* Standard Selector */}
      <div>
        <label className="text-xs uppercase text-gray-500 font-medium">Standard</label>
        <select
          value={selectedStandardId ?? ''}
          onChange={(e) => selectStandard(e.target.value || null)}
          className="w-full mt-1 bg-[#111827] border border-[var(--border-subtle)] rounded px-2 py-1.5 text-xs text-white focus:border-[#38bdf8] outline-none"
        >
          <option value="">Select a standard...</option>
          {portfolioOverview.portfolio.map((item) => (
            <option key={item.standardId} value={item.standardId}>
              {item.standardName} ({item.standardType.toUpperCase()})
            </option>
          ))}
        </select>
      </div>

      {/* Pipeline Steps */}
      {selectedItem && (
        <div className="space-y-1">
          {PIPELINE_STEPS.map((step, i) => {
            const isCompleted = i < currentStageIndex;
            const isCurrent = i === currentStageIndex;
            const isNext = i === currentStageIndex + 1;
            const Icon = step.icon;

            const isClickable = isCompleted || isCurrent || isNext;

            return (
              <div
                key={step.key}
                onClick={() => {
                  if (isClickable) navigate(`/project/${projectId}/compliance/${step.section}`);
                }}
                className={`flex items-center gap-2 px-3 py-2 rounded text-xs transition-colors ${
                  isClickable ? 'cursor-pointer' : 'cursor-default'
                } ${
                  isCurrent
                    ? 'bg-[var(--surface-overlay)] border border-[#38bdf8] text-white'
                    : isCompleted
                    ? 'bg-[#0f1f0f] border border-[#1a3a1a] text-green-400 hover:border-green-500/40'
                    : isNext
                    ? 'bg-[#111827] border border-[var(--border-subtle)] text-gray-400 hover:border-[var(--status-purple)]/40'
                    : 'bg-[#111827] border border-[var(--border-subtle)] text-gray-500'
                }`}
              >
                <Icon size={14} className={isCompleted ? 'text-green-400' : isCurrent ? 'text-[#38bdf8]' : ''} />
                <div className="flex-1">
                  <span className="font-medium">{step.label}</span>
                  <span className="text-gray-500 ml-2">{step.description}</span>
                </div>
                {isCurrent && (
                  <span className="text-xs px-1.5 py-0.5 rounded bg-[#38bdf8]/20 text-[#38bdf8]">
                    Active
                  </span>
                )}
                {isCompleted && (
                  <span className="text-xs text-green-500">Done</span>
                )}
                {isNext && (
                  <span className="flex items-center gap-1 text-xs px-1.5 py-0.5 rounded bg-[var(--status-purple)]/20 text-[var(--status-purple)]">
                    Next <ArrowRight size={10} />
                  </span>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Actionable next-step hints */}
      {selectedItem && currentStageIndex === 0 && (
        <button
          onClick={() => navigate(`/project/${projectId}/compliance/matrix`)}
          className="flex items-center justify-between w-full text-xs bg-[var(--status-purple)]/10 border border-[var(--status-purple)]/30 rounded px-3 py-2.5 text-[var(--status-purple)] hover:bg-[var(--status-purple)]/20 transition group"
        >
          <span>Next: Run <strong>AI Auto-Mapping</strong> in the Matrix tab</span>
          <ArrowRight size={14} className="group-hover:translate-x-0.5 transition-transform" />
        </button>
      )}
      {selectedItem && currentStageIndex === 1 && (
        <button
          onClick={() => navigate(`/project/${projectId}/compliance/remediate`)}
          className="flex items-center justify-between w-full text-xs bg-[var(--status-purple)]/10 border border-[var(--status-purple)]/30 rounded px-3 py-2.5 text-[var(--status-purple)] hover:bg-[var(--status-purple)]/20 transition group"
        >
          <span>Next: <strong>Remediate Gaps</strong> detected in mapping</span>
          <ArrowRight size={14} className="group-hover:translate-x-0.5 transition-transform" />
        </button>
      )}
      {selectedItem && currentStageIndex === 3 && (
        <button
          onClick={() => navigate(`/project/${projectId}/compliance/elements`)}
          className="flex items-center justify-between w-full text-xs bg-[var(--status-purple)]/10 border border-[var(--status-purple)]/30 rounded px-3 py-2.5 text-[var(--status-purple)] hover:bg-[var(--status-purple)]/20 transition group"
        >
          <span>Next: Generate <strong>Compliance Roadmap</strong> from gaps</span>
          <ArrowRight size={14} className="group-hover:translate-x-0.5 transition-transform" />
        </button>
      )}
    </div>
  );
}
