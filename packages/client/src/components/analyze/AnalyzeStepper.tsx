import { useNavigate, useParams } from 'react-router-dom';
import { Check, LayoutDashboard, Shield, DollarSign, Dice5, Map } from 'lucide-react';
import { useArchitectureStore } from '../../stores/architectureStore';
import { useXRayStore } from '../../stores/xrayStore';
import { useScenarioStore } from '../../stores/scenarioStore';
import { useRoadmapStore } from '../../stores/roadmapStore';

const ANALYSIS_STAGES = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboard, sections: ['dashboard'] },
  { id: 'risk', label: 'Risk', icon: Shield, sections: ['risk', 'impact'] },
  { id: 'cost', label: 'Cost', icon: DollarSign, sections: ['cost'] },
  { id: 'simulate', label: 'Simulate', icon: Dice5, sections: ['monte-carlo', 'scenarios', 'capacity'] },
  { id: 'roadmap', label: 'Roadmap', icon: Map, sections: ['roadmap'] },
] as const;

export default function AnalyzeStepper() {
  const navigate = useNavigate();
  const { projectId, section } = useParams<{ projectId: string; section?: string }>();
  const elements = useArchitectureStore((s) => s.elements);
  const graphCostProfiles = useXRayStore((s) => s.graphCostProfiles);
  const scenarios = useScenarioStore((s) => s.scenarios);
  const activeRoadmap = useRoadmapStore((s) => s.activeRoadmap);

  // Completion heuristics (no backend state needed)
  const isComplete: Record<string, boolean> = {
    overview: true,
    risk: elements.length > 0,
    cost: graphCostProfiles.length > 0,
    simulate: scenarios.length > 0,
    roadmap: activeRoadmap !== null,
  };

  // Map current URL section to parent stage
  const currentSection = section || 'dashboard';
  const activeStageIdx = ANALYSIS_STAGES.findIndex((stage) =>
    (stage.sections as readonly string[]).includes(currentSection)
  );

  return (
    <div className="flex items-center gap-0 px-4 py-3 bg-[var(--surface-raised)]/50 border border-[var(--border-subtle)] rounded-lg mb-6">
      {ANALYSIS_STAGES.map((stage, idx) => {
        const completed = isComplete[stage.id];
        const isCurrent = idx === activeStageIdx;
        const Icon = stage.icon;

        return (
          <div key={stage.id} className="flex items-center flex-1 last:flex-initial">
            <button
              onClick={() => navigate(`/project/${projectId}/analyze/${stage.sections[0]}`)}
              className="flex flex-col items-center gap-1 group cursor-pointer"
            >
              <div
                className={`flex items-center justify-center w-8 h-8 rounded-full border-2 transition-all ${
                  completed && !isCurrent
                    ? 'bg-[#00ff41]/20 border-[#00ff41] text-[#00ff41]'
                    : isCurrent
                    ? 'bg-[#7c3aed]/20 border-[#7c3aed] text-[#a78bfa] shadow-[0_0_12px_rgba(124,58,237,0.4)]'
                    : 'bg-transparent border-[var(--border-subtle)] text-[var(--text-tertiary)]'
                }`}
              >
                {completed && !isCurrent ? (
                  <Check size={14} strokeWidth={3} />
                ) : (
                  <Icon size={14} />
                )}
              </div>
              <span
                className={`text-xs font-medium whitespace-nowrap ${
                  isCurrent
                    ? 'text-[#a78bfa]'
                    : completed
                    ? 'text-[#00ff41]/70'
                    : 'text-[var(--text-tertiary)]'
                }`}
              >
                {stage.label}
              </span>
            </button>

            {idx < ANALYSIS_STAGES.length - 1 && (
              <div className="flex-1 mx-1">
                <div
                  className={`h-0.5 w-full ${
                    completed ? 'bg-[#00ff41]/40' : 'bg-[var(--surface-overlay)]'
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
