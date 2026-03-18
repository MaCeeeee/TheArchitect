import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import Scene from '../3d/Scene';
import PropertyPanel from './PropertyPanel';
import { useUIStore } from '../../stores/uiStore';
import { useArchitectureStore } from '../../stores/architectureStore';
import { architectureAPI, projectAPI, workspaceAPI } from '../../services/api';
import { useWorkspaceStore } from '../../stores/workspaceStore';

export default function ProjectView() {
  const { projectId } = useParams<{ projectId: string }>();
  const setElements = useArchitectureStore((s) => s.setElements);
  const setConnections = useArchitectureStore((s) => s.setConnections);
  const setProjectId = useArchitectureStore((s) => s.setProjectId);
  const setProjectName = useArchitectureStore((s) => s.setProjectName);
  const setWorkspaces = useWorkspaceStore((s) => s.setWorkspaces);
  const isPropertyPanelOpen = useUIStore((s) => s.isPropertyPanelOpen);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
        <div className="h-8 w-8 rounded-full border-2 border-[#1a2a1a] border-t-[#00ff41] animate-spin" />
        <span className="text-sm text-[#7a8a7a]" style={{ textShadow: '0 0 8px rgba(0,255,65,0.3)' }}>Loading architecture...</span>
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
      </div>
      {isPropertyPanelOpen && <PropertyPanel />}
    </div>
  );
}
