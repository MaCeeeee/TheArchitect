import { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Loader2, Wand2, Boxes, ArrowRight } from 'lucide-react';
import Scene from '../3d/Scene';
import PropertyPanel from './PropertyPanel';
import ConnectionTypePicker from './ConnectionTypePicker';
import SelectionActionBar from './SelectionActionBar';
import { useUIStore } from '../../stores/uiStore';
import { useArchitectureStore } from '../../stores/architectureStore';
import { architectureAPI, projectAPI, workspaceAPI } from '../../services/api';
import { useWorkspaceStore } from '../../stores/workspaceStore';
import { useJourneyStore } from '../../stores/journeyStore';
import { useComplianceStore } from '../../stores/complianceStore';
import { useEnvisionStore } from '../../stores/envisionStore';
import { useRoadmapStore } from '../../stores/roadmapStore';
import { connectSocket, joinProject, getSocket } from '../../services/socket';
import MissionControl from './MissionControl';
import ComplianceOverlay from './ComplianceOverlay';
import NextStepBanner from '../../design-system/patterns/NextStepBanner';

export default function ProjectView() {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const setElements = useArchitectureStore((s) => s.setElements);
  const setConnections = useArchitectureStore((s) => s.setConnections);
  const setProjectId = useArchitectureStore((s) => s.setProjectId);
  const setProjectName = useArchitectureStore((s) => s.setProjectName);
  const setWorkspaces = useWorkspaceStore((s) => s.setWorkspaces);
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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
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

  useEffect(() => {
    if (!projectId) return;
    setProjectId(projectId);

    let cancelled = false;
    let violationDebounce: ReturnType<typeof setTimeout> | null = null;
    setLoading(true);
    setError(null);

    Promise.all([
      architectureAPI.getElements(projectId),
      architectureAPI.getConnections(projectId),
      projectAPI.get(projectId),
      workspaceAPI.list(projectId).catch(() => ({ data: { data: [] } })),
    ])
      .then(([elemRes, connRes, projRes, wsRes]) => {
        if (cancelled) return;
        setElements(elemRes.data.data || []);
        setConnections(connRes.data.data || []);
        setProjectName(projRes.data.data?.name || projRes.data.name || null);
        const serverWorkspaces = wsRes.data.data || [];
        if (serverWorkspaces.length > 0) {
          setWorkspaces(serverWorkspaces.map((ws: any) => ({
            id: ws._id || ws.id,
            name: ws.name,
            projectId: ws.projectId,
            source: ws.source,
            color: ws.color,
            offsetX: ws.offsetX,
            createdAt: ws.createdAt,
          })));
        }

        // Load envision data (vision + stakeholders) for Phase A
        useEnvisionStore.getState().load(projectId);

        // Load policy violations for real-time compliance visualization
        useComplianceStore.getState().loadViolations(projectId);

        // Connect WebSocket and listen for violation updates (debounced to prevent request storms)
        const sock = connectSocket();
        joinProject(projectId);
        sock.on('violation:update', (data: { projectId: string }) => {
          if (data.projectId === projectId) {
            if (violationDebounce) clearTimeout(violationDebounce);
            violationDebounce = setTimeout(() => {
              useComplianceStore.getState().loadViolations(projectId);
            }, 1000);
          }
        });
      })
      .catch((err) => {
        if (cancelled) return;
        if (import.meta.env.DEV) console.error('Failed to load project data:', err);
        setError('Failed to load project data');
        setElements([]);
        setConnections([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
      if (violationDebounce) clearTimeout(violationDebounce);
      const sock = getSocket();
      if (sock) sock.off('violation:update');
    };
  }, [projectId, setElements, setConnections, setProjectId, setProjectName, setWorkspaces]);

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

        {/* Contextual next-step guidance floating above 3D scene */}
        {currentPhaseInfo?.nextAction && !isConnectionMode && (
          <div className={`absolute left-1/2 -translate-x-1/2 z-30 w-[420px] max-w-[90%] pointer-events-auto ${isPlateauActive ? 'bottom-14' : 'bottom-4'}`}>
            <NextStepBanner
              message={`Phase ${currentPhase}: ${currentPhaseInfo.name} — ${currentPhaseInfo.description}`}
              actionLabel={currentPhaseInfo.nextAction.label}
              onAction={() => {
                if (currentPhaseInfo.nextAction!.route === '__connection_mode__') {
                  useUIStore.getState().enterConnectionMode();
                } else if (currentPhaseInfo.nextAction!.route.startsWith('__envision')) {
                  useUIStore.getState().setSidebarPanel('envision');
                  useUIStore.setState({ isSidebarOpen: true });
                  useUIStore.getState().highlightField('scope');
                } else {
                  navigate(currentPhaseInfo.nextAction!.route);
                }
              }}
              className="backdrop-blur-md bg-[var(--surface-base)]/80 shadow-lg"
            />
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
