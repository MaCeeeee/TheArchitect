import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { X, Boxes, GitFork, FileText, Shield } from 'lucide-react';
import { useArchitectureStore } from '../../stores/architectureStore';
import { useComplianceStore } from '../../stores/complianceStore';
import { useJourneyStore } from '../../stores/journeyStore';
import { ProgressRing } from '../../design-system';
import type { JourneyPhase } from '../../stores/journeyStore';

const PHASE_ICONS: Record<JourneyPhase, typeof Boxes> = {
  1: Boxes,
  2: FileText,
  3: Shield,
  4: GitFork,
  5: Shield,
};

interface MissionControlProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function MissionControl({ isOpen, onClose }: MissionControlProps) {
  const navigate = useNavigate();
  const projectId = useArchitectureStore((s) => s.projectId);
  const elements = useArchitectureStore((s) => s.elements);
  const connections = useArchitectureStore((s) => s.connections);
  const pipelineStates = useComplianceStore((s) => s.pipelineStates);
  const { phases, currentPhase, healthScore, recompute } = useJourneyStore();

  useEffect(() => {
    if (projectId && isOpen) recompute(projectId);
  }, [projectId, isOpen, recompute]);

  if (!isOpen || !projectId) return null;

  const current = phases.find((p) => p.phase === currentPhase);
  const riskElements = elements.filter((e) => e.riskLevel === 'high' || e.riskLevel === 'critical');

  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-[480px] max-h-[80vh] overflow-y-auto rounded-xl border border-[var(--border-default)] bg-[var(--surface-raised)] shadow-2xl animate-[scaleIn_200ms_ease-out]">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--border-subtle)]">
          <h2 className="text-sm font-semibold text-[var(--text-primary)]">Mission Control</h2>
          <button onClick={onClose} className="text-[var(--text-tertiary)] hover:text-white transition">
            <X size={16} />
          </button>
        </div>

        {/* Health Score + Quick Stats */}
        <div className="flex items-center gap-6 px-5 py-4">
          <ProgressRing value={healthScore} size={72} strokeWidth={5} color="var(--accent-default)">
            <span className="text-lg font-bold text-[var(--accent-default)]">{healthScore}%</span>
          </ProgressRing>
          <div className="flex-1 grid grid-cols-2 gap-3">
            <Stat label="Elements" value={elements.length} />
            <Stat label="Connections" value={connections.length} />
            <Stat label="Standards" value={pipelineStates.length} />
            <Stat label="Risks" value={riskElements.length} highlight={riskElements.length > 0} />
          </div>
        </div>

        {/* Phase Journey */}
        <div className="px-5 pb-4">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-tertiary)] mb-3">
            Project Journey
          </p>
          <div className="space-y-1">
            {phases.map((p) => {
              const Icon = PHASE_ICONS[p.phase];
              const isCurrent = p.phase === currentPhase;
              return (
                <div
                  key={p.phase}
                  className={`flex items-center gap-3 rounded-lg px-3 py-2.5 transition ${
                    isCurrent
                      ? 'bg-[var(--status-purple)]/10 border border-[var(--status-purple)]/30'
                      : p.isDone
                      ? 'opacity-60'
                      : 'opacity-30'
                  }`}
                >
                  <div
                    className={`flex items-center justify-center w-7 h-7 rounded-full ${
                      p.isDone
                        ? 'bg-[var(--accent-default)]/20 text-[var(--accent-default)]'
                        : isCurrent
                        ? 'bg-[var(--status-purple)]/20 text-[var(--status-purple)]'
                        : 'bg-[var(--border-subtle)] text-[var(--text-disabled)]'
                    }`}
                  >
                    <Icon size={14} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className={`text-xs font-medium ${isCurrent ? 'text-[var(--text-primary)]' : 'text-[var(--text-secondary)]'}`}>
                        {p.name}
                      </span>
                      {p.isDone && (
                        <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-[var(--accent-default)]/15 text-[var(--accent-default)] font-medium">
                          Done
                        </span>
                      )}
                    </div>
                    <p className="text-[10px] text-[var(--text-tertiary)] truncate">{p.description}</p>
                  </div>
                  {p.nextAction && isCurrent && (
                    <button
                      onClick={() => {
                        navigate(p.nextAction!.route);
                        onClose();
                      }}
                      className="shrink-0 text-[10px] font-medium px-2.5 py-1 rounded-md bg-[var(--status-purple)] text-white hover:bg-[#8b5cf6] transition"
                    >
                      {p.nextAction.label} →
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, highlight }: { label: string; value: number; highlight?: boolean }) {
  return (
    <div className="text-center">
      <p className={`text-lg font-bold ${highlight ? 'text-[var(--status-danger)]' : 'text-[var(--text-primary)]'}`}>
        {value}
      </p>
      <p className="text-[10px] text-[var(--text-tertiary)]">{label}</p>
    </div>
  );
}
