import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import Scene from '../3d/Scene';
import PropertyPanel from './PropertyPanel';
import { useUIStore } from '../../stores/uiStore';
import { useArchitectureStore } from '../../stores/architectureStore';
import { architectureAPI, projectAPI, workspaceAPI } from '../../services/api';
import { useWorkspaceStore } from '../../stores/workspaceStore';
import { useJourneyStore } from '../../stores/journeyStore';
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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const currentPhaseInfo = phases.find((p) => p.phase === currentPhase);

  useEffect(() => {
    if (!projectId) return;
    setProjectId(projectId);

    let cancelled = false;
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
      })
      .catch((err) => {
        if (cancelled) return;
        console.error('Failed to load project data:', err);
        setError('Failed to load project data');
        setElements([]);
        setConnections([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
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

  return (
    <div className="flex h-full">
      <div className="flex-1 relative">
        <Scene />
        {/* Contextual next-step guidance floating above 3D scene */}
        {currentPhaseInfo?.nextAction && (
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-10 w-[420px] max-w-[90%]">
            <NextStepBanner
              message={`Phase ${currentPhase}: ${currentPhaseInfo.name} — ${currentPhaseInfo.description}`}
              actionLabel={currentPhaseInfo.nextAction.label}
              onAction={() => navigate(currentPhaseInfo.nextAction!.route)}
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
    </div>
  );
}
