import type { NavigateFunction } from 'react-router-dom';
import { useUIStore } from '../stores/uiStore';

// ─── Type-safe routing from insights/banners to fix destinations ───

export type ActionTarget =
  | { type: 'element'; elementId: string }
  | { type: 'panel'; panel: 'explorer' | 'architect' | 'analyze' | 'copilot'; tab?: string }
  | { type: 'compliance'; section: string }
  | { type: 'settings'; section?: string }
  | { type: 'modal'; modal: 'import-csv' | 'import-bpmn' | 'import-n8n' }
  | { type: 'copilot'; prompt: string }
  | { type: 'mission-control' };

export function executeAction(
  target: ActionTarget,
  navigate: NavigateFunction,
  projectId: string | null,
  callbacks?: {
    onSelectElement?: (elementId: string) => void;
    onOpenModal?: (modal: string) => void;
  },
) {
  switch (target.type) {
    case 'element':
      callbacks?.onSelectElement?.(target.elementId);
      break;

    case 'panel':
      useUIStore.getState().setSidebarPanel(target.panel);
      break;

    case 'compliance': {
      // If we're on the 3D project view, open overlay instead of navigating away
      const currentPath = window.location.pathname;
      const isOnProjectView = projectId && currentPath === `/project/${projectId}`;
      if (isOnProjectView) {
        useUIStore.getState().openComplianceOverlay(target.section);
      } else if (projectId) {
        navigate(`/project/${projectId}/compliance/${target.section}`);
      }
      break;
    }

    case 'settings':
      navigate(target.section ? `/settings/${target.section}` : '/settings');
      break;

    case 'modal':
      callbacks?.onOpenModal?.(target.modal);
      break;

    case 'copilot':
      useUIStore.getState().setSidebarPanel('copilot');
      break;

    case 'mission-control':
      useUIStore.getState().toggleMissionControl();
      break;
  }
}
