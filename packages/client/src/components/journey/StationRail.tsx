// The Rail (CONTEXT.md): the visible Phase navigator of the v2 shell. Shows
// the path, marks progress, is ALWAYS freely jumpable (ADR-0005: free map +
// suggestion, no lock). Tools do not live here.
import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useJourneyStore } from '../../stores/journeyStore';
import { useArchitectureStore } from '../../stores/architectureStore';
import { useComplianceStore } from '../../stores/complianceStore';
import NextStepBanner from '../../design-system/patterns/NextStepBanner';
import { STATIONS, stationForPhase, type StationKey } from './stations';

interface Props {
  projectId: string;
  station: StationKey;
}

export default function StationRail({ projectId, station }: Props) {
  const navigate = useNavigate();
  const { phases, currentPhase, recompute } = useJourneyStore();
  const elements = useArchitectureStore((s) => s.elements);
  const connections = useArchitectureStore((s) => s.connections);
  const pipelineStates = useComplianceStore((s) => s.pipelineStates);
  const snapshots = useComplianceStore((s) => s.snapshots);

  // Same recompute trigger pattern as PhaseBar.tsx:36-37.
  useEffect(() => {
    if (projectId) recompute(projectId);
  }, [projectId, elements.length, connections.length, pipelineStates, snapshots, recompute]);

  const currentPhaseInfo = phases.find((p) => p.phase === currentPhase);
  const doneByPhase = new Map(phases.map((p) => [p.phase, p.isDone]));

  return (
    <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-30 flex flex-col items-center gap-2 pointer-events-none">
      {/* The one CTA: recommended next step (suggestion, not a lock).
          Slice 1: navigational only — it flies to the recommended station.
          Executing the action itself (connection mode, envision fields, …)
          needs that station's tools in v2 → later slices. Don't "fix" this. */}
      {currentPhaseInfo?.nextAction && (
        <div className="w-[420px] max-w-[90vw] pointer-events-auto">
          <NextStepBanner
            message={`${stationForPhase(currentPhase).label} — ${currentPhaseInfo.description}`}
            actionLabel={currentPhaseInfo.nextAction.label}
            onAction={() => navigate(`/v2/project/${projectId}/${stationForPhase(currentPhase).key}`)}
            className="backdrop-blur-md bg-[var(--surface-base)]/80 shadow-lg"
          />
        </div>
      )}

      {/* The Rail */}
      <nav
        aria-label="Journey stations"
        className="pointer-events-auto flex items-center gap-1 rounded-full border border-[var(--border-subtle)] bg-[var(--surface-base)]/85 backdrop-blur-md px-2 py-1.5 shadow-lg"
      >
        {STATIONS.map((s) => {
          const isCurrent = s.key === station;
          const isDone = doneByPhase.get(s.phase) ?? false;
          return (
            <button
              key={s.key}
              aria-current={isCurrent ? 'true' : undefined}
              onClick={() => navigate(`/v2/project/${projectId}/${s.key}`)}
              className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-xs transition ${
                isCurrent
                  ? 'bg-[#00ff41]/10 text-[#00ff41]'
                  : isDone
                    ? 'text-[var(--text-secondary)] hover:text-white'
                    : 'text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]'
              }`}
            >
              <span
                className={`h-1.5 w-1.5 rounded-full ${
                  isCurrent ? 'bg-[#00ff41]' : isDone ? 'bg-[#a78bfa]' : 'bg-[var(--border-default)]'
                }`}
              />
              <span className="font-medium">{s.label}</span>
              <span className="text-[9px] font-mono uppercase tracking-wide text-[var(--text-tertiary)]">
                {s.admBadge}
              </span>
            </button>
          );
        })}
      </nav>
    </div>
  );
}
