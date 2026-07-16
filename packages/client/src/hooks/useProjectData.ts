// packages/client/src/hooks/useProjectData.ts
// Owns project bootstrap: elements, connections, project meta, workspaces,
// envision data, violations, socket join + violation:update listener.
// Extracted from ProjectView (ADR-0005 AC-2) so the classic UI and the v2
// JourneyShell share one loading path. Behavior is identical to the old
// inline effect — if you change semantics here, you change both shells.
import { useEffect, useState } from 'react';
import { useArchitectureStore } from '../stores/architectureStore';
import { useWorkspaceStore } from '../stores/workspaceStore';
import { useEnvisionStore } from '../stores/envisionStore';
import { useComplianceStore } from '../stores/complianceStore';
import { architectureAPI, projectAPI, workspaceAPI } from '../services/api';
import { connectSocket, joinProject, getSocket } from '../services/socket';

export function useProjectData(projectId: string | undefined) {
  const setElements = useArchitectureStore((s) => s.setElements);
  const setConnections = useArchitectureStore((s) => s.setConnections);
  const setProjectId = useArchitectureStore((s) => s.setProjectId);
  const setProjectName = useArchitectureStore((s) => s.setProjectName);
  const setWorkspaces = useWorkspaceStore((s) => s.setWorkspaces);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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

  return { loading, error };
}
