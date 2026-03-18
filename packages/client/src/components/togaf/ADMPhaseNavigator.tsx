import { useState } from 'react';
import { ChevronRight, CheckCircle2, Circle, Clock, Info } from 'lucide-react';

interface ADMPhaseData {
  phase: string;
  name: string;
  description: string;
  status: 'not_started' | 'in_progress' | 'completed';
  completionPercentage: number;
  objectives: string[];
  inputs: string[];
  outputs: string[];
  color: string;
}

const ADM_PHASES: ADMPhaseData[] = [
  {
    phase: 'P', name: 'Preliminary', description: 'Framework and Principles',
    status: 'completed', completionPercentage: 100, color: '#7a8a7a',
    objectives: ['Define architecture framework', 'Establish architecture principles', 'Define scope of organizations impacted'],
    inputs: ['Board strategies and directives', 'Business principles', 'IT governance model'],
    outputs: ['Architecture framework', 'Architecture principles', 'Tailored architecture method'],
  },
  {
    phase: 'A', name: 'Architecture Vision', description: 'Define scope, stakeholders, and vision',
    status: 'in_progress', completionPercentage: 65, color: '#ef4444',
    objectives: ['Establish architecture project', 'Identify stakeholders', 'Create Architecture Vision'],
    inputs: ['Architecture Request', 'Business principles', 'Architecture principles'],
    outputs: ['Architecture Vision document', 'Statement of Architecture Work', 'Stakeholder Map'],
  },
  {
    phase: 'B', name: 'Business Architecture', description: 'Develop business architecture',
    status: 'in_progress', completionPercentage: 40, color: '#22c55e',
    objectives: ['Develop Business Architecture', 'Analyze gaps between baseline and target'],
    inputs: ['Architecture Vision', 'Business principles', 'Architecture Repository'],
    outputs: ['Business Architecture document', 'Gap analysis results', 'Updated requirements'],
  },
  {
    phase: 'C', name: 'Information Systems', description: 'Data and application architecture',
    status: 'not_started', completionPercentage: 0, color: '#3b82f6',
    objectives: ['Develop Data Architecture', 'Develop Application Architecture', 'Analyze gaps'],
    inputs: ['Business Architecture', 'Architecture Vision', 'Data principles'],
    outputs: ['Data Architecture', 'Application Architecture', 'Gap analysis results'],
  },
  {
    phase: 'D', name: 'Technology Architecture', description: 'Technology infrastructure',
    status: 'not_started', completionPercentage: 0, color: '#00ff41',
    objectives: ['Develop Technology Architecture', 'Map applications to technology', 'Define standards'],
    inputs: ['Information Systems Architecture', 'Technology principles'],
    outputs: ['Technology Architecture', 'Standards catalog', 'Gap analysis'],
  },
  {
    phase: 'E', name: 'Opportunities & Solutions', description: 'Identify delivery vehicles',
    status: 'not_started', completionPercentage: 0, color: '#f97316',
    objectives: ['Generate implementation plan', 'Identify transition architectures', 'Define solution building blocks'],
    inputs: ['Target architectures (B, C, D)', 'Gap analysis results'],
    outputs: ['Implementation plan', 'Transition architectures', 'Architecture roadmap'],
  },
  {
    phase: 'F', name: 'Migration Planning', description: 'Create implementation and migration plan',
    status: 'not_started', completionPercentage: 0, color: '#eab308',
    objectives: ['Finalize architecture roadmap', 'Create migration plan', 'Ensure stakeholder buy-in'],
    inputs: ['Implementation plan', 'Transition architectures'],
    outputs: ['Implementation and Migration Plan', 'Architecture contract'],
  },
  {
    phase: 'G', name: 'Implementation Governance', description: 'Provide architectural oversight',
    status: 'not_started', completionPercentage: 0, color: '#06b6d4',
    objectives: ['Ensure conformance of implementation', 'Perform governance functions', 'Handle change requests'],
    inputs: ['Architecture contract', 'Implementation plan'],
    outputs: ['Compliance assessments', 'Change requests', 'Architecture updates'],
  },
  {
    phase: 'H', name: 'Change Management', description: 'Manage changes to architecture',
    status: 'not_started', completionPercentage: 0, color: '#ec4899',
    objectives: ['Manage architecture change process', 'Monitor technology changes', 'Monitor business changes'],
    inputs: ['Change requests', 'Architecture updates'],
    outputs: ['Architecture updates', 'New Architecture Request (cycle)'],
  },
];

interface Props {
  onPhaseSelect?: (phase: string) => void;
}

export default function ADMPhaseNavigator({ onPhaseSelect }: Props) {
  const [selectedPhase, setSelectedPhase] = useState<string>('A');
  const [showDetail, setShowDetail] = useState(false);

  const selected = ADM_PHASES.find((p) => p.phase === selectedPhase);

  const handlePhaseClick = (phase: string) => {
    setSelectedPhase(phase);
    setShowDetail(true);
    onPhaseSelect?.(phase);
  };

  return (
    <div className="flex flex-col h-full">
      {/* ADM Wheel visualization */}
      <div className="p-3">
        <h3 className="text-xs font-semibold text-white mb-3">ADM Cycle</h3>
        <div className="relative w-full aspect-square max-w-[220px] mx-auto">
          {/* Center circle */}
          <div className="absolute inset-[30%] rounded-full bg-[#00ff41]/20 border border-[#00ff41]/40 flex items-center justify-center">
            <span className="text-[10px] text-[#33ff66] font-medium text-center leading-tight">
              Requirements<br/>Management
            </span>
          </div>

          {/* Phase segments arranged in a circle */}
          {ADM_PHASES.map((phase, i) => {
            const angle = (i / ADM_PHASES.length) * 2 * Math.PI - Math.PI / 2;
            const radius = 42;
            const x = 50 + radius * Math.cos(angle);
            const y = 50 + radius * Math.sin(angle);
            const isSelected = selectedPhase === phase.phase;

            return (
              <button
                key={phase.phase}
                onClick={() => handlePhaseClick(phase.phase)}
                className={`absolute w-9 h-9 -translate-x-1/2 -translate-y-1/2 rounded-full flex items-center justify-center text-[10px] font-bold transition-all border-2 ${
                  isSelected
                    ? 'scale-125 shadow-lg shadow-black/30'
                    : 'hover:scale-110'
                }`}
                style={{
                  left: `${x}%`,
                  top: `${y}%`,
                  backgroundColor: phase.status === 'completed' ? phase.color : phase.status === 'in_progress' ? `${phase.color}40` : '#111111',
                  borderColor: phase.color,
                  color: phase.status === 'completed' ? '#fff' : phase.color,
                }}
                title={phase.name}
              >
                {phase.phase}
              </button>
            );
          })}
        </div>
      </div>

      {/* Phase list */}
      <div className="flex-1 overflow-y-auto border-t border-[#1a2a1a]">
        {ADM_PHASES.map((phase) => (
          <button
            key={phase.phase}
            onClick={() => handlePhaseClick(phase.phase)}
            className={`flex w-full items-center gap-2 px-3 py-2 text-left transition ${
              selectedPhase === phase.phase ? 'bg-[#0a0a0a]' : 'hover:bg-[#0a0a0a]/50'
            }`}
          >
            <StatusIcon status={phase.status} color={phase.color} />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1">
                <span className="text-[10px] font-bold" style={{ color: phase.color }}>
                  {phase.phase}
                </span>
                <span className="text-xs text-white truncate">{phase.name}</span>
              </div>
              {phase.status !== 'not_started' && (
                <div className="mt-1 h-1 rounded-full bg-[#1a2a1a]">
                  <div
                    className="h-full rounded-full transition-all"
                    style={{ width: `${phase.completionPercentage}%`, backgroundColor: phase.color }}
                  />
                </div>
              )}
            </div>
            <span className="text-[10px] text-[#4a5a4a]">{phase.completionPercentage}%</span>
          </button>
        ))}
      </div>

      {/* Detail panel */}
      {showDetail && selected && (
        <div className="border-t border-[#1a2a1a] p-3 max-h-[200px] overflow-y-auto">
          <div className="flex items-center justify-between mb-2">
            <h4 className="text-xs font-semibold text-white">{selected.name}</h4>
            <button onClick={() => setShowDetail(false)} className="text-[#4a5a4a] hover:text-white text-xs">
              Hide
            </button>
          </div>
          <p className="text-[10px] text-[#7a8a7a] mb-2">{selected.description}</p>

          <DetailSection title="Objectives" items={selected.objectives} />
          <DetailSection title="Inputs" items={selected.inputs} />
          <DetailSection title="Outputs" items={selected.outputs} />
        </div>
      )}
    </div>
  );
}

function StatusIcon({ status, color }: { status: string; color: string }) {
  if (status === 'completed') return <CheckCircle2 size={14} style={{ color }} />;
  if (status === 'in_progress') return <Clock size={14} style={{ color }} />;
  return <Circle size={14} className="text-[#3a4a3a]" />;
}

function DetailSection({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="mb-2">
      <h5 className="text-[10px] font-semibold uppercase text-[#4a5a4a] mb-1">{title}</h5>
      <ul className="space-y-0.5">
        {items.map((item, i) => (
          <li key={i} className="flex items-start gap-1 text-[10px] text-[#7a8a7a]">
            <ChevronRight size={10} className="mt-0.5 shrink-0 text-[#3a4a3a]" />
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}
