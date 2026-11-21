import { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Loader2, Wand2, Boxes, ArrowRight } from 'lucide-react';
import Scene from '../3d/Scene';
import PropertyPanel from './PropertyPanel';
import ConnectionTypePicker from './ConnectionTypePicker';
import SelectionActionBar from './SelectionActionBar';
import { useUIStore } from '../../stores/uiStore';
import { useArchitectureStore } from '../../stores/architectureStore';
import { useJourneyStore } from '../../stores/journeyStore';
import { useRoadmapStore } from '../../stores/roadmapStore';
import MissionControl from './MissionControl';
import ComplianceOverlay from './ComplianceOverlay';
import NextStepBanner from '../../design-system/patterns/NextStepBanner';
import { useProjectData } from '../../hooks/useProjectData';
import { useLadderSync } from '../groups/useLadderSync';
import { ladderGuidance } from '../groups/ladderGuidance';
import { showLadderStep } from '../groups/showLadderStep';
import { GROUP_MODE_TEXT } from '../groups/groupModeText';
import GroupModeBar from '../groups/GroupModeBar';
import { useGroupModeStore } from '../../stores/groupModeStore';
import { useAdvisorStore } from '../../stores/advisorStore';
import { buildCommandRegistry, type CommandContext } from '../journey/commands';

export default function ProjectView() {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const isPropertyPanelOpen = useUIStore((s) => s.isPropertyPanelOpen);
  const showMissionControl = useUIStore((s) => s.showMissionControl);
  const toggleMissionControl = useUIStore((s) => s.toggleMissionControl);
  const showComplianceOverlay = useUIStore((s) => s.showComplianceOverlay);
  const complianceOverlaySection = useUIStore((s) => s.complianceOverlaySection);
  const closeComplianceOverlay = useUIStore((s) => s.closeComplianceOverlay);
  const { phases, currentPhase } = useJourneyStore();
  const isConnectionMode = useUIStore((s) => s.isConnectionMode);
  const connectionSourceId = useUIStore((s) => s.connectionSourceId);
  const exitConnectionMode = useUIStore((s) => s.exitConnectionMode);
  const isPlateauActive = useRoadmapStore((s) => s.isPlateauViewActive);
  const elements = useArchitectureStore((s) => s.elements);
  const { loading, error } = useProjectData(projectId);
  // UC-METH-002 — the ladder report drives the action field; the group mode belongs to this project.
  useLadderSync(projectId);
  const ladder = useAdvisorStore((s) => s.ladder);
  const guidance = ladderGuidance(ladder, projectId, elements.length);
  const groupModeShown = useGroupModeStore((s) => s.projectId === projectId && (s.active || s.feedback !== null));
  // Connection mode has priority: a group mode that is still open ends when it starts.
  useEffect(() => { if (isConnectionMode) useGroupModeStore.getState().cancel(); }, [isConnectionMode]);
  const [dismissedEmpty, setDismissedEmpty] = useState(false);

  const currentPhaseInfo = phases.find((p) => p.phase === currentPhase);

  // Escape key exits connection mode
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isConnectionMode) exitConnectionMode();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isConnectionMode, exitConnectionMode]);

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center flex-col gap-3">
        <div className="h-8 w-8 rounded-full border-2 border-[var(--border-subtle)] border-t-[#00ff41] animate-spin" />
        <span className="text-sm text-[var(--text-secondary)]" style={{ textShadow: '0 0 8px rgba(0,255,65,0.3)' }}>Loading architecture...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-full items-center justify-center">
        <span className="text-sm text-red-400">{error}</span>
      </div>
    );
  }

  // Empty project — show onboarding choices
  if (!loading && elements.length === 0 && !dismissedEmpty) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-center max-w-xl px-6">
          <div className="mx-auto w-16 h-16 rounded-2xl bg-[#7c3aed]/10 flex items-center justify-center mb-6">
            <Boxes size={32} className="text-[#a78bfa]" />
          </div>
          <h2 className="text-2xl font-bold text-white mb-2">Get Started</h2>
          <p className="text-sm text-[var(--text-secondary)] mb-8">
            Choose how you want to build your enterprise architecture.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-md mx-auto">
            {/* Blueprint Wizard — AI-generated */}
            <button
              onClick={() => navigate(`/project/${projectId}/blueprint`)}
              className="flex flex-col items-center gap-3 rounded-xl border border-[#7c3aed]/30 bg-[#7c3aed]/5 hover:bg-[#7c3aed]/10 px-5 py-6 transition group"
            >
              <div className="w-10 h-10 rounded-lg bg-[#7c3aed]/20 flex items-center justify-center">
                <Wand2 size={20} className="text-[#a78bfa]" />
              </div>
              <div>
                <p className="text-sm font-semibold text-white mb-1">Generate with AI</p>
                <p className="text-[11px] text-[var(--text-tertiary)] leading-relaxed">
                  Describe your business and let AI create a full architecture across all layers.
                </p>
              </div>
              <span className="text-[10px] font-medium text-[#a78bfa] opacity-0 group-hover:opacity-100 transition">
                Start Wizard →
              </span>
            </button>
            {/* Empty canvas — manual */}
            <button
              onClick={() => setDismissedEmpty(true)}
              className="flex flex-col items-center gap-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-raised)]/50 hover:bg-[var(--surface-raised)] px-5 py-6 transition group"
            >
              <div className="w-10 h-10 rounded-lg bg-[var(--surface-base)] flex items-center justify-center">
                <Boxes size={20} className="text-[var(--text-secondary)]" />
              </div>
              <div>
                <p className="text-sm font-semibold text-white mb-1">Start from Scratch</p>
                <p className="text-[11px] text-[var(--text-tertiary)] leading-relaxed">
                  Open an empty canvas and build your architecture manually, element by element.
                </p>
              </div>
              <span className="text-[10px] font-medium text-[var(--text-secondary)] opacity-0 group-hover:opacity-100 transition">
                Open Canvas →
              </span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  // The same registry command the v2 station and ⌘K use (REQ .2 "one command"); built only when shown.
  const commandCtx: CommandContext | null = guidance ? { projectId: projectId!, navigate, phase: currentPhase } : null;
  const makeGroup = commandCtx ? buildCommandRegistry(commandCtx)['action:make-group'] : null;

  return (
    <div className="flex h-full">
      <div className="flex-1 relative">
        <Scene />

        {/* Connection mode banner */}
        {isConnectionMode && (
          <div className="absolute top-4 left-1/2 -translate-x-1/2 z-20">
            <div className="flex items-center gap-3 rounded-lg border border-[#00ff41]/30 bg-[#0a0a0a]/90 backdrop-blur-md px-5 py-3 shadow-lg">
              <div className="h-2 w-2 rounded-full bg-[#00ff41] animate-pulse" />
              {connectionSourceId ? (
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-[#00ff41]">
                    {elements.find(e => e.id === connectionSourceId)?.name || 'Source'}
                  </span>
                  <span className="text-xs text-[var(--text-disabled)]">
                    ({elements.find(e => e.id === connectionSourceId)?.type.replace(/_/g, ' ')})
                  </span>
                  <span className="text-xs text-[var(--text-tertiary)]">&rarr; click target</span>
                </div>
              ) : (
                <span className="text-sm font-medium text-[#00ff41]">
                  Click source element to start connection
                </span>
              )}
              <button
                onClick={exitConnectionMode}
                className="ml-2 rounded px-2 py-0.5 text-xs text-[var(--text-tertiary)] border border-[var(--border-subtle)] hover:text-white hover:border-white/30 transition"
              >
                Esc
              </button>
            </div>
          </div>
        )}

        {/* Selection action bar (Save as Pattern) */}
        <SelectionActionBar />

        {/* Action field above the 3D scene: group mode › ladder step › phase hint (UC-METH-002) */}
        {!isConnectionMode && (groupModeShown || guidance || currentPhaseInfo?.nextAction) && (
          <div className={`absolute left-1/2 -translate-x-1/2 z-30 w-[420px] max-w-[90%] pointer-events-auto ${isPlateauActive ? 'bottom-14' : 'bottom-4'}`}>
            {groupModeShown ? (
              <GroupModeBar projectId={projectId!} className="w-full" />
            ) : guidance && makeGroup && commandCtx ? (
              <NextStepBanner
                tone="ladder"
                label={guidance.headline}
                onLabel={() => showLadderStep(guidance.rung)}
                labelHint={GROUP_MODE_TEXT.showStep}
                message={guidance.next}
                actionLabel={makeGroup.label}
                onAction={() => makeGroup.run(commandCtx)}
                className="backdrop-blur-md bg-[var(--surface-base)]/80 shadow-lg"
              />
            ) : currentPhaseInfo?.nextAction ? (
              <NextStepBanner
                message={`Phase ${currentPhase}: ${currentPhaseInfo.name} — ${currentPhaseInfo.description}`}
                actionLabel={currentPhaseInfo.nextAction.label}
                onAction={() => {
                  if (currentPhaseInfo.nextAction!.route === '__connection_mode__') {
                    useUIStore.getState().enterConnectionMode();
                  } else if (currentPhaseInfo.nextAction!.route.startsWith('__envision')) {
                    useUIStore.getState().setSidebarPanel('envision');
                    useUIStore.setState({ isSidebarOpen: true });
                    const targetField = currentPhaseInfo.nextAction!.field
                      ?? (currentPhaseInfo.nextAction!.route === '__envision_stakeholders__' ? 'stakeholders' : 'scope');
                    useUIStore.getState().highlightField(targetField);
                  } else {
                    navigate(currentPhaseInfo.nextAction!.route);
                  }
                }}
                className="backdrop-blur-md bg-[var(--surface-base)]/80 shadow-lg"
              />
            ) : null}
          </div>
        )}
        <MissionControl isOpen={showMissionControl} onClose={toggleMissionControl} />
        <ComplianceOverlay
          isOpen={showComplianceOverlay}
          onClose={closeComplianceOverlay}
          initialSection={complianceOverlaySection}
        />
      </div>
      {isPropertyPanelOpen && <PropertyPanel />}
      <ConnectionTypePicker />
    </div>
  );
}
