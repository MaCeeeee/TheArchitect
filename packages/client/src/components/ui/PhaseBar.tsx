import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Check, ChevronDown } from 'lucide-react';
import { useArchitectureStore } from '../../stores/architectureStore';
import { useComplianceStore } from '../../stores/complianceStore';
import { useJourneyStore } from '../../stores/journeyStore';
import { useUIStore } from '../../stores/uiStore';
import type { JourneyPhase, PhaseInfo } from '../../stores/journeyStore';

// Short labels for the circles
const ADM_LETTER: Record<JourneyPhase, string> = {
  1: 'A',
  2: 'B-D',
  3: 'E',
  4: 'F',
  5: 'G',
  6: 'H',
};

export default function PhaseBar() {
  const navigate = useNavigate();
  const projectId = useArchitectureStore((s) => s.projectId);
  const elements = useArchitectureStore((s) => s.elements);
  const connections = useArchitectureStore((s) => s.connections);
  const pipelineStates = useComplianceStore((s) => s.pipelineStates);
  const snapshots = useComplianceStore((s) => s.snapshots);
  const loadPipelineStatus = useComplianceStore((s) => s.loadPipelineStatus);
  const { phases, currentPhase, recompute } = useJourneyStore();
  const [expandedPhase, setExpandedPhase] = useState<JourneyPhase | null>(null);

  useEffect(() => {
    if (projectId) loadPipelineStatus(projectId);
  }, [projectId, loadPipelineStatus]);

  useEffect(() => {
    if (projectId) recompute(projectId);
  }, [projectId, elements.length, connections.length, pipelineStates, snapshots, recompute]);

  if (!projectId || phases.length === 0) return null;

  const current = phases.find((p) => p.phase === currentPhase);
  const expanded = expandedPhase ? phases.find((p) => p.phase === expandedPhase) : null;

  const handleCircleClick = (phase: JourneyPhase) => {
    setExpandedPhase((prev) => (prev === phase ? null : phase));
  };

  const handleNextAction = (phaseInfo: PhaseInfo) => {
    if (!phaseInfo.nextAction) return;
    const route = phaseInfo.nextAction.route;
    if (route === '__connection_mode__') {
      useUIStore.getState().enterConnectionMode();
    } else if (route === '__envision__' || route === '__envision_stakeholders__') {
      useUIStore.getState().setSidebarPanel('envision');
      useUIStore.setState({ isSidebarOpen: true });
      if (route === '__envision__') useUIStore.getState().highlightField('scope');
    } else {
      navigate(route);
    }
    setExpandedPhase(null);
  };

  return (
    <div className="border-b border-[var(--border-subtle)] bg-[var(--surface-base)]">
      {/* Compact bar */}
      <div className="flex items-center gap-3 px-3 py-1.5">
        {/* Phase circles + connectors */}
        <div className="flex items-center">
          {phases.map((p, idx) => {
            const isCurrent = p.phase === currentPhase;
            const isExpanded = p.phase === expandedPhase;

            return (
              <div key={p.phase} className="flex items-center">
                <button
                  onClick={() => handleCircleClick(p.phase)}
                  title={`${p.admLabel}: ${p.name}`}
                  className={`flex items-center justify-center rounded-full border-2 transition-all ${
                    p.phase === 2 ? 'w-7 h-6' : 'w-6 h-6'
                  } ${
                    p.isDone
                      ? 'bg-[var(--accent-muted)] border-[var(--accent-default)] text-[var(--accent-default)]'
                      : isCurrent
                      ? 'bg-[var(--status-purple)]/20 border-[var(--status-purple)] text-[var(--status-purple)] shadow-[0_0_8px_rgba(167,139,250,0.4)]'
                      : 'bg-transparent border-[var(--border-strong)] text-[var(--text-disabled)]'
                  } ${isExpanded ? 'ring-1 ring-[var(--status-purple)]/50' : ''} hover:scale-110 cursor-pointer`}
                >
                  {p.isDone ? (
                    <Check size={11} strokeWidth={3} />
                  ) : (
                    <span className={`font-semibold leading-none ${p.phase === 2 ? 'text-[8px]' : 'text-[9px]'}`}>
                      {ADM_LETTER[p.phase]}
                    </span>
                  )}
                </button>
                {idx < phases.length - 1 && (
                  <div
                    className={`w-3 h-0.5 ${
                      p.isDone ? 'bg-[var(--accent-default)]/40' : 'bg-[var(--border-subtle)]'
                    }`}
                  />
                )}
              </div>
            );
          })}
        </div>

        {/* Current phase label */}
        <button
          onClick={() => handleCircleClick(currentPhase)}
          className="flex items-center gap-1 hover:opacity-80 transition"
        >
          <span className="text-[10px] text-[var(--text-tertiary)]">
            {current?.admLabel}:
          </span>
          <span className="text-[10px] font-medium text-[var(--text-secondary)]">
            {current?.name}
          </span>
          <ChevronDown
            size={10}
            className={`text-[var(--text-tertiary)] transition-transform ${expandedPhase === currentPhase ? 'rotate-180' : ''}`}
          />
        </button>

        {/* Progress indicator */}
        {current && !current.isDone && (
          <div className="flex items-center gap-1.5 ml-1">
            <div className="w-16 h-1 rounded-full bg-[var(--border-subtle)] overflow-hidden">
              <div
                className="h-full rounded-full bg-[var(--status-purple)] transition-all"
                style={{ width: `${Math.min((current.progress.current / current.progress.target) * 100, 100)}%` }}
              />
            </div>
            <span className="text-[9px] text-[var(--text-disabled)]">
              {Math.round((current.progress.current / current.progress.target) * 100)}%
            </span>
          </div>
        )}

        {/* Next action (when not expanded) */}
        {!expandedPhase && current?.nextAction && (
          <button
            onClick={() => handleNextAction(current)}
            className="ml-auto text-[10px] font-medium text-[var(--status-purple)] hover:text-[#c4b5fd] transition animate-[pulseGlow_2s_ease-in-out_infinite]"
          >
            {current.nextAction.label} →
          </button>
        )}
      </div>

      {/* Expanded detail panel */}
      {expanded && (
        <div className="px-3 pb-2 animate-[fadeIn_150ms_ease-out]">
          <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-raised)] px-3 py-2.5">
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="text-[9px] font-semibold uppercase tracking-wider text-[var(--status-purple)]">
                    {expanded.admLabel}
                  </span>
                  {expanded.isDone && (
                    <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-[var(--accent-default)]/15 text-[var(--accent-default)] font-medium">
                      Complete
                    </span>
                  )}
                </div>
                <p className="text-[11px] font-medium text-[var(--text-primary)]">{expanded.name}</p>
                <p className="text-[10px] text-[var(--text-tertiary)] mt-0.5">{expanded.description}</p>

                {/* Progress bar */}
                {!expanded.isDone && (
                  <div className="flex items-center gap-2 mt-2">
                    <div className="flex-1 h-1.5 rounded-full bg-[var(--border-subtle)] overflow-hidden">
                      <div
                        className="h-full rounded-full bg-[var(--status-purple)] transition-all"
                        style={{ width: `${Math.min((expanded.progress.current / expanded.progress.target) * 100, 100)}%` }}
                      />
                    </div>
                    <span className="text-[9px] text-[var(--text-tertiary)] whitespace-nowrap">
                      {expanded.progress.current}/{expanded.progress.target} {expanded.progress.label}
                    </span>
                  </div>
                )}
              </div>

              {/* Next action button */}
              {expanded.nextAction && (
                <button
                  onClick={() => handleNextAction(expanded)}
                  className="shrink-0 text-[10px] font-medium px-2.5 py-1.5 rounded-md bg-[var(--status-purple)] text-white hover:bg-[#8b5cf6] transition"
                >
                  {expanded.nextAction.label} →
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
