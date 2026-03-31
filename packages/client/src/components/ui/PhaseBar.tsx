import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useArchitectureStore } from '../../stores/architectureStore';
import { useComplianceStore } from '../../stores/complianceStore';
import { useJourneyStore } from '../../stores/journeyStore';
import { useUIStore } from '../../stores/uiStore';
import type { JourneyPhase } from '../../stores/journeyStore';

export default function PhaseBar() {
  const navigate = useNavigate();
  const projectId = useArchitectureStore((s) => s.projectId);
  const elements = useArchitectureStore((s) => s.elements);
  const connections = useArchitectureStore((s) => s.connections);
  const pipelineStates = useComplianceStore((s) => s.pipelineStates);
  const snapshots = useComplianceStore((s) => s.snapshots);
  const loadPipelineStatus = useComplianceStore((s) => s.loadPipelineStatus);
  const { phases, currentPhase, recompute } = useJourneyStore();

  // Load compliance pipeline data when project is available
  useEffect(() => {
    if (projectId) {
      loadPipelineStatus(projectId);
    }
  }, [projectId, loadPipelineStatus]);

  // Recompute when project data or compliance data changes
  useEffect(() => {
    if (projectId) recompute(projectId);
  }, [projectId, elements.length, connections.length, pipelineStates, snapshots, recompute]);

  if (!projectId || phases.length === 0) return null;

  const current = phases.find((p) => p.phase === currentPhase);

  return (
    <div className="flex items-center gap-2 px-3 py-1.5 border-b border-[var(--border-subtle)] bg-[var(--surface-base)]">
      {/* Phase dots */}
      <div className="flex items-center gap-1">
        {phases.map((p) => (
          <div
            key={p.phase}
            className={`h-1.5 w-1.5 rounded-full transition-all ${
              p.isDone
                ? 'bg-[var(--accent-default)]'
                : p.phase === currentPhase
                ? 'bg-[var(--status-purple)] shadow-[0_0_6px_rgba(167,139,250,0.5)]'
                : 'bg-[var(--border-subtle)]'
            }`}
            title={`Phase ${p.phase}: ${p.name}`}
          />
        ))}
      </div>

      {/* Current phase label */}
      <span className="text-[10px] text-[var(--text-tertiary)]">
        Phase {currentPhase}:
      </span>
      <span className="text-[10px] font-medium text-[var(--text-secondary)]">
        {current?.name}
      </span>

      {/* Next action */}
      {current?.nextAction && (
        <button
          onClick={() => {
            if (current.nextAction!.route === '__connection_mode__') {
              useUIStore.getState().enterConnectionMode();
            } else {
              navigate(current.nextAction!.route);
            }
          }}
          className="ml-auto text-[10px] font-medium text-[var(--status-purple)] hover:text-[#c4b5fd] transition animate-[pulseGlow_2s_ease-in-out_infinite]"
        >
          {current.nextAction.label} →
        </button>
      )}
    </div>
  );
}
