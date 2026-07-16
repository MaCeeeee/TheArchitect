// The Rail (CONTEXT.md): the visible Phase navigator of the v2 shell. Shows
// the path, marks progress, is ALWAYS freely jumpable (ADR-0005: free map +
// suggestion, no lock). Tools do not live here.
import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Check } from 'lucide-react';
import { useJourneyStore } from '../../stores/journeyStore';
import { useArchitectureStore } from '../../stores/architectureStore';
import { useComplianceStore } from '../../stores/complianceStore';
import { STATIONS, type StationKey } from './stations';
import StationActions from './StationActions';

interface Props {
  projectId: string;
  station: StationKey;
}

export default function StationRail({ projectId, station }: Props) {
  const navigate = useNavigate();
  const { phases, recompute } = useJourneyStore();
  const elements = useArchitectureStore((s) => s.elements);
  const connections = useArchitectureStore((s) => s.connections);
  const pipelineStates = useComplianceStore((s) => s.pipelineStates);
  const snapshots = useComplianceStore((s) => s.snapshots);
  const loadPipelineStatus = useComplianceStore((s) => s.loadPipelineStatus);

  // Same load + recompute pairing as PhaseBar.tsx:31-37 — the Rail is
  // self-sufficient: it loads the pipeline data its recompute reads.
  useEffect(() => {
    if (projectId) loadPipelineStatus(projectId);
  }, [projectId, loadPipelineStatus]);

  useEffect(() => {
    if (projectId) recompute(projectId);
  }, [projectId, elements.length, connections.length, pipelineStates, snapshots, recompute]);

  const doneByPhase = new Map(phases.map((p) => [p.phase, p.isDone]));

  return (
    <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-30 flex flex-col items-center gap-2 pointer-events-none">
      {/* The command surface: the station's ≤4 executable actions (THE-492).
          Replaces Slice-1's navigation-only nextAction CTA. */}
      <StationActions station={station} projectId={projectId} />

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
              aria-current={isCurrent ? 'page' : undefined}
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
              {isDone && <Check size={10} strokeWidth={3} className="text-[#a78bfa]" />}
              <span className="text-[9px] font-mono uppercase tracking-wide text-[var(--text-tertiary)]">
                {s.admBadge}
              </span>
              <span className="sr-only">{isDone ? '(complete)' : ''}</span>
            </button>
          );
        })}
      </nav>
    </div>
  );
}
