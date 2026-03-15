import { useState } from 'react';
import { Layers, X, ChevronLeft, ChevronRight, Home } from 'lucide-react';
import { useWorkspaceStore } from '../../stores/workspaceStore';
import { useArchitectureStore } from '../../stores/architectureStore';
import { flyToWorkspace, fitAllWorkspaces } from '../3d/CameraControls';

export default function WorkspaceBar() {
  const workspaces = useWorkspaceStore((s) => s.workspaces);
  const activeWorkspaceId = useWorkspaceStore((s) => s.activeWorkspaceId);
  const setActiveWorkspace = useWorkspaceStore((s) => s.setActiveWorkspace);
  const removeWorkspace = useWorkspaceStore((s) => s.removeWorkspace);
  const updateWorkspace = useWorkspaceStore((s) => s.updateWorkspace);
  const removeWorkspaceElements = useArchitectureStore((s) => s.removeWorkspaceElements);
  const elements = useArchitectureStore((s) => s.elements);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');

  if (workspaces.length <= 1) return null;

  const activeIndex = workspaces.findIndex((ws) => ws.id === activeWorkspaceId);

  const handleSelectWorkspace = (wsId: string) => {
    setActiveWorkspace(wsId);
    const ws = workspaces.find((w) => w.id === wsId);
    if (ws) flyToWorkspace(ws.offsetX);
  };

  const handlePrev = () => {
    const prevIndex = activeIndex > 0 ? activeIndex - 1 : workspaces.length - 1;
    handleSelectWorkspace(workspaces[prevIndex].id);
  };

  const handleNext = () => {
    const nextIndex = activeIndex < workspaces.length - 1 ? activeIndex + 1 : 0;
    handleSelectWorkspace(workspaces[nextIndex].id);
  };

  const handleDelete = (wsId: string) => {
    removeWorkspaceElements(wsId);
    removeWorkspace(wsId);
  };

  const handleDoubleClick = (wsId: string, name: string) => {
    setEditingId(wsId);
    setEditName(name);
  };

  const handleRenameSubmit = (wsId: string) => {
    if (editName.trim()) {
      updateWorkspace(wsId, { name: editName.trim() });
    }
    setEditingId(null);
  };

  const getElementCount = (wsId: string) => {
    return elements.filter((el) => el.workspaceId === wsId).length;
  };

  return (
    <div className="absolute top-3 left-1/2 -translate-x-1/2 z-30 flex items-center gap-1 rounded-lg border border-[#334155] bg-[#1e293b]/90 backdrop-blur-sm px-2 py-1.5 shadow-xl">
      {/* Fit all button */}
      <button
        onClick={() => fitAllWorkspaces(workspaces)}
        className="flex items-center justify-center rounded p-1.5 text-[#64748b] hover:text-white hover:bg-[#334155] transition"
        title="Fit all workspaces (Home)"
      >
        <Home size={14} />
      </button>

      {/* Previous */}
      <button
        onClick={handlePrev}
        className="flex items-center justify-center rounded p-1.5 text-[#64748b] hover:text-white hover:bg-[#334155] transition"
        title="Previous workspace (←)"
      >
        <ChevronLeft size={14} />
      </button>

      {/* Workspace tabs */}
      <div className="flex items-center gap-1">
        {workspaces.map((ws, index) => (
          <div
            key={ws.id}
            className={`group relative flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs cursor-pointer transition ${
              ws.id === activeWorkspaceId
                ? 'bg-[#334155] text-white'
                : 'text-[#94a3b8] hover:text-white hover:bg-[#334155]/50'
            }`}
            onClick={() => handleSelectWorkspace(ws.id)}
            onDoubleClick={() => handleDoubleClick(ws.id, ws.name)}
          >
            {/* Color dot */}
            <span
              className="w-2 h-2 rounded-full shrink-0"
              style={{ backgroundColor: ws.color }}
            />

            {editingId === ws.id ? (
              <input
                type="text"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                onBlur={() => handleRenameSubmit(ws.id)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleRenameSubmit(ws.id);
                  if (e.key === 'Escape') setEditingId(null);
                }}
                autoFocus
                className="w-24 bg-transparent border-b border-[#7c3aed] text-xs text-white outline-none"
                onClick={(e) => e.stopPropagation()}
              />
            ) : (
              <>
                <span className="max-w-[100px] truncate">{ws.name}</span>
                <span className="text-[10px] text-[#64748b]">
                  ({getElementCount(ws.id)})
                </span>
              </>
            )}

            {/* Keyboard hint */}
            <span className="hidden group-hover:inline text-[9px] text-[#475569] ml-0.5">
              {index + 1}
            </span>

            {/* Delete button */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleDelete(ws.id);
              }}
              className="hidden group-hover:flex items-center justify-center rounded p-0.5 text-[#64748b] hover:text-red-400 transition"
            >
              <X size={10} />
            </button>
          </div>
        ))}
      </div>

      {/* Next */}
      <button
        onClick={handleNext}
        className="flex items-center justify-center rounded p-1.5 text-[#64748b] hover:text-white hover:bg-[#334155] transition"
        title="Next workspace (→)"
      >
        <ChevronRight size={14} />
      </button>
    </div>
  );
}
