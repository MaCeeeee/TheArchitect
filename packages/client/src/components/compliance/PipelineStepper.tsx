import { useNavigate, useParams } from 'react-router-dom';
import { Check, Upload, GitBranch, FileCheck, Map, TrendingUp, ClipboardCheck } from 'lucide-react';
import { useComplianceStore } from '../../stores/complianceStore';

const PIPELINE_STAGES = [
  { id: 'uploaded', label: 'Upload', icon: Upload, section: 'standards' },
  { id: 'mapped', label: 'Map', icon: GitBranch, section: 'matrix' },
  { id: 'policies_generated', label: 'Policies', icon: FileCheck, section: 'policies' },
  { id: 'roadmap_ready', label: 'Roadmap', icon: Map, section: 'roadmap' },
  { id: 'tracking', label: 'Track', icon: TrendingUp, section: 'progress' },
  { id: 'audit_ready', label: 'Audit', icon: ClipboardCheck, section: 'audit' },
] as const;

const STAGE_ORDER: Record<string, number> = {
  uploaded: 0,
  mapped: 1,
  policies_generated: 2,
  roadmap_ready: 3,
  tracking: 4,
  audit_ready: 5,
};

export default function PipelineStepper() {
  const navigate = useNavigate();
  const { projectId, section } = useParams<{ projectId: string; section?: string }>();
  const pipelineStates = useComplianceStore((s) => s.pipelineStates);

  // Determine the highest stage reached across all standards
  let maxStageIdx = -1;
  for (const ps of pipelineStates) {
    const idx = STAGE_ORDER[ps.stage] ?? -1;
    if (idx > maxStageIdx) maxStageIdx = idx;
  }

  // Map current section to active stage index
  const sectionToStageIdx: Record<string, number> = {
    standards: 0, pipeline: 0,
    matrix: 1,
    policies: 2,
    roadmap: 3, elements: 3,
    progress: 4,
    audit: 5,
  };
  const activeStageIdx = section ? (sectionToStageIdx[section] ?? -1) : -1;

  return (
    <div className="flex items-center gap-0 px-4 py-3 bg-[var(--surface-raised)]/50 border border-[var(--border-subtle)] rounded-lg mb-6">
      {PIPELINE_STAGES.map((stage, idx) => {
        const isCompleted = idx <= maxStageIdx;
        const isCurrent = idx === activeStageIdx;
        const isClickable = idx <= maxStageIdx + 1; // can click completed + next
        const Icon = stage.icon;

        return (
          <div key={stage.id} className="flex items-center flex-1 last:flex-initial">
            {/* Step circle + label */}
            <button
              onClick={() => {
                if (isClickable) {
                  navigate(`/project/${projectId}/compliance/${stage.section}`);
                }
              }}
              disabled={!isClickable}
              className={`flex flex-col items-center gap-1 group ${
                isClickable ? 'cursor-pointer' : 'cursor-not-allowed opacity-40'
              }`}
            >
              <div
                className={`flex items-center justify-center w-8 h-8 rounded-full border-2 transition-all ${
                  isCompleted && !isCurrent
                    ? 'bg-[#00ff41]/20 border-[#00ff41] text-[#00ff41]'
                    : isCurrent
                    ? 'bg-[#7c3aed]/20 border-[#7c3aed] text-[#a78bfa] shadow-[0_0_12px_rgba(124,58,237,0.4)]'
                    : 'bg-transparent border-[var(--border-subtle)] text-[var(--text-tertiary)]'
                }`}
              >
                {isCompleted && !isCurrent ? (
                  <Check size={14} strokeWidth={3} />
                ) : (
                  <Icon size={14} />
                )}
              </div>
              <span
                className={`text-[10px] font-medium whitespace-nowrap ${
                  isCurrent
                    ? 'text-[#a78bfa]'
                    : isCompleted
                    ? 'text-[#00ff41]/70'
                    : 'text-[var(--text-tertiary)]'
                }`}
              >
                {stage.label}
              </span>
            </button>

            {/* Connector line */}
            {idx < PIPELINE_STAGES.length - 1 && (
              <div className="flex-1 mx-1">
                <div
                  className={`h-0.5 w-full ${
                    idx < maxStageIdx
                      ? 'bg-[#00ff41]/40'
                      : 'bg-[var(--surface-overlay)]'
                  }`}
                />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
