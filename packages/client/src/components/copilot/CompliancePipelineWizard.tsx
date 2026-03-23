// packages/client/src/components/copilot/CompliancePipelineWizard.tsx
import React, { useEffect } from 'react';
import { Upload, Map, FileCheck, Route, Activity, ChevronRight } from 'lucide-react';
import { useComplianceStore } from '../../stores/complianceStore';
import { useArchitectureStore } from '../../stores/architectureStore';

const PIPELINE_STEPS = [
  { key: 'uploaded', icon: Upload, label: 'Upload', description: 'Standard uploaded' },
  { key: 'mapped', icon: Map, label: 'Mapping', description: 'AI auto-mapping' },
  { key: 'policies_generated', icon: FileCheck, label: 'Policies', description: 'Policy generation' },
  { key: 'roadmap_ready', icon: Route, label: 'Roadmap', description: 'Compliance roadmap' },
  { key: 'tracking', icon: Activity, label: 'Tracking', description: 'Progress tracking' },
] as const;

const STAGE_INDEX: Record<string, number> = {
  uploaded: 0,
  mapped: 1,
  policies_generated: 2,
  roadmap_ready: 3,
  tracking: 4,
};

export function CompliancePipelineWizard() {
  const { portfolioOverview, isLoading, loadPortfolio, selectedStandardId, selectStandard } =
    useComplianceStore();
  const projectId = useArchitectureStore((s) => s.projectId);

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
        <label className="text-[10px] uppercase text-gray-500 font-medium">Standard</label>
        <select
          value={selectedStandardId ?? ''}
          onChange={(e) => selectStandard(e.target.value || null)}
          className="w-full mt-1 bg-[#111827] border border-[#1e293b] rounded px-2 py-1.5 text-xs text-white focus:border-[#38bdf8] outline-none"
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

            return (
              <div
                key={step.key}
                className={`flex items-center gap-2 px-3 py-2 rounded text-xs transition-colors ${
                  isCurrent
                    ? 'bg-[#1e293b] border border-[#38bdf8] text-white'
                    : isCompleted
                    ? 'bg-[#0f1f0f] border border-[#1a3a1a] text-green-400'
                    : 'bg-[#111827] border border-[#1e293b] text-gray-500'
                }`}
              >
                <Icon size={14} className={isCompleted ? 'text-green-400' : isCurrent ? 'text-[#38bdf8]' : ''} />
                <div className="flex-1">
                  <span className="font-medium">{step.label}</span>
                  <span className="text-gray-500 ml-2">{step.description}</span>
                </div>
                {isCurrent && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#38bdf8]/20 text-[#38bdf8]">
                    Active
                  </span>
                )}
                {isCompleted && (
                  <span className="text-[10px] text-green-500">Done</span>
                )}
                {isNext && (
                  <ChevronRight size={12} className="text-gray-500" />
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Action hints per stage */}
      {selectedItem && currentStageIndex === 0 && (
        <div className="text-xs text-gray-400 bg-[#111827] border border-[#1e293b] rounded p-2">
          Next: Run AI Auto-Mapping in the Matrix tab to detect compliance gaps.
        </div>
      )}
      {selectedItem && currentStageIndex === 1 && (
        <div className="text-xs text-gray-400 bg-[#111827] border border-[#1e293b] rounded p-2">
          Next: Go to the <span className="text-[#7c3aed] font-medium">Policies</span> tab to generate policy drafts from the mapped standard.
        </div>
      )}
      {selectedItem && currentStageIndex === 2 && (
        <div className="text-xs text-gray-400 bg-[#111827] border border-[#1e293b] rounded p-2">
          Next: Generate a compliance-driven roadmap from gaps and policy violations.
        </div>
      )}
    </div>
  );
}
