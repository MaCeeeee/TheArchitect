import { useWorkspaceStore } from '../../stores/workspaceStore';
import { useArchitectureStore } from '../../stores/architectureStore';
import { flyToWorkspace } from '../3d/CameraControls';
import { WORKSPACE_GAP } from '../../stores/workspaceStore';

export default function Minimap() {
  const workspaces = useWorkspaceStore((s) => s.workspaces);
  const activeWorkspaceId = useWorkspaceStore((s) => s.activeWorkspaceId);
  const setActiveWorkspace = useWorkspaceStore((s) => s.setActiveWorkspace);
  const elements = useArchitectureStore((s) => s.elements);

  if (workspaces.length <= 1) return null;

  const maxOffset = Math.max(...workspaces.map((ws) => ws.offsetX));
  const totalWidth = maxOffset + 30; // last workspace + plane width
  const scale = 180 / Math.max(totalWidth, 1);

  const handleClick = (wsId: string, offsetX: number) => {
    setActiveWorkspace(wsId);
    flyToWorkspace(offsetX);
  };

  return (
    <div className="absolute bottom-4 right-4 z-30 rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-raised)]/90 backdrop-blur-sm p-3 shadow-xl">
      <div className="text-[9px] text-[var(--text-tertiary)] uppercase tracking-wider mb-2 font-medium">
        Workspaces
      </div>
      <div className="relative" style={{ width: 180, height: 60 }}>
        {workspaces.map((ws) => {
          const left = ws.offsetX * scale;
          const width = 30 * scale;
          const count = elements.filter((el) => el.workspaceId === ws.id).length;
          const isActive = ws.id === activeWorkspaceId;

          return (
            <button
              key={ws.id}
              onClick={() => handleClick(ws.id, ws.offsetX)}
              className={`absolute top-0 h-full rounded transition-all ${
                isActive ? 'ring-1 ring-white/30' : 'hover:brightness-125'
              }`}
              style={{
                left,
                width: Math.max(width, 20),
                backgroundColor: ws.color + (isActive ? '40' : '20'),
                borderLeft: `2px solid ${ws.color}`,
              }}
              title={`${ws.name} (${count} elements)`}
            >
              <span
                className="absolute bottom-1 left-1 text-[8px] truncate max-w-full pr-1"
                style={{ color: ws.color }}
              >
                {ws.name}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
