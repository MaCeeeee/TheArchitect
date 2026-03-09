import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import Scene from '../3d/Scene';
import PropertyPanel from './PropertyPanel';
import { useUIStore } from '../../stores/uiStore';
import { useArchitectureStore } from '../../stores/architectureStore';
import { architectureAPI } from '../../services/api';

export default function ProjectView() {
  const { projectId } = useParams<{ projectId: string }>();
  const setElements = useArchitectureStore((s) => s.setElements);
  const setConnections = useArchitectureStore((s) => s.setConnections);
  const setProjectId = useArchitectureStore((s) => s.setProjectId);
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
    ])
      .then(([elemRes, connRes]) => {
        if (cancelled) return;
        setElements(elemRes.data.data || []);
        setConnections(connRes.data.data || []);
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
  }, [projectId, setElements, setConnections, setProjectId]);

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 size={24} className="animate-spin text-[#7c3aed]" />
        <span className="ml-2 text-sm text-[#94a3b8]">Loading architecture...</span>
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
