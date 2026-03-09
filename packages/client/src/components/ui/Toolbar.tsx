import { useEffect } from 'react';
import {
  PanelLeftClose,
  PanelLeftOpen,
  Box,
  Grid3x3,
  Layers,
  ZoomIn,
  ZoomOut,
  Maximize,
  Undo2,
  Redo2,
  Download,
  Play,
  MessageSquare,
  Map,
  Upload,
  Lightbulb,
  Workflow,
  ScanEye,
} from 'lucide-react';
import { useUIStore } from '../../stores/uiStore';
import { useArchitectureStore } from '../../stores/architectureStore';
import { useXRayStore } from '../../stores/xrayStore';
import { fitToScreen } from '../3d/CameraControls';
import UserPresence from '../collaboration/UserPresence';
import { useCollaborationStore } from '../../stores/collaborationStore';

interface ToolbarProps {
  onOpenBPMNImport: () => void;
  onOpenN8nImport: () => void;
  onOpenWalkthrough: () => void;
}

export default function Toolbar({ onOpenBPMNImport, onOpenN8nImport, onOpenWalkthrough }: ToolbarProps) {
  const {
    viewMode,
    setViewMode,
    isSidebarOpen,
    toggleSidebar,
    toggleChat,
    toggleMinimap,
  } = useUIStore();

  const undo = useArchitectureStore((s) => s.undo);
  const redo = useArchitectureStore((s) => s.redo);
  const canUndo = useArchitectureStore((s) => s.canUndo);
  const canRedo = useArchitectureStore((s) => s.canRedo);
  const elements = useArchitectureStore((s) => s.elements);
  const isScenarioMode = useArchitectureStore((s) => s.isScenarioMode);
  const setScenarioMode = useArchitectureStore((s) => s.setScenarioMode);

  const isXRayActive = useXRayStore((s) => s.isActive);
  const toggleXRay = useXRayStore((s) => s.toggleXRay);

  // Global keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        undo();
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && e.shiftKey) {
        e.preventDefault();
        redo();
      }
      if (e.key === 'Delete' || e.key === 'Backspace') {
        const selectedId = useArchitectureStore.getState().selectedElementId;
        if (selectedId) {
          useArchitectureStore.getState().removeElement(selectedId);
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [undo, redo]);

  return (
    <header className="flex h-12 items-center justify-between border-b border-[#334155] bg-[#1e293b] px-4">
      {/* Left section */}
      <div className="flex items-center gap-2">
        <button
          onClick={toggleSidebar}
          className="rounded p-1.5 hover:bg-[#334155] text-[#94a3b8] hover:text-white transition"
          title={isSidebarOpen ? 'Close Sidebar' : 'Open Sidebar'}
        >
          {isSidebarOpen ? <PanelLeftClose size={18} /> : <PanelLeftOpen size={18} />}
        </button>

        <div className="mx-2 h-5 w-px bg-[#334155]" />

        <span className="text-sm font-semibold text-[#7c3aed]">TheArchitect</span>
        <span className="text-xs text-[#94a3b8]">Enterprise Architecture</span>

        <div className="ml-4">
          <UserPresence />
        </div>

        {isScenarioMode && (
          <span className="ml-2 rounded-full bg-amber-500/20 px-2 py-0.5 text-[10px] font-medium text-amber-300">
            SCENARIO MODE
          </span>
        )}
        {isXRayActive && (
          <span className="ml-2 rounded-full bg-red-500/20 px-2 py-0.5 text-[10px] font-medium text-red-300 animate-pulse">
            X-RAY
          </span>
        )}
      </div>

      {/* Center section - View modes */}
      <div className="flex items-center gap-1 rounded-lg bg-[#0f172a] p-0.5">
        <ViewModeButton
          icon={<Box size={16} />}
          label="3D"
          active={viewMode === '3d'}
          onClick={() => setViewMode('3d')}
        />
        <ViewModeButton
          icon={<Grid3x3 size={16} />}
          label="2D"
          active={viewMode === '2d-topdown'}
          onClick={() => setViewMode('2d-topdown')}
        />
        <ViewModeButton
          icon={<Layers size={16} />}
          label="Layers"
          active={viewMode === 'layer'}
          onClick={() => setViewMode('layer')}
        />
      </div>

      {/* Right section */}
      <div className="flex items-center gap-1">
        <ToolbarButton icon={<Undo2 size={16} />} title="Undo (Ctrl+Z)" onClick={undo} disabled={!canUndo} />
        <ToolbarButton icon={<Redo2 size={16} />} title="Redo (Ctrl+Shift+Z)" onClick={redo} disabled={!canRedo} />
        <div className="mx-1 h-5 w-px bg-[#334155]" />
        <ToolbarButton icon={<Maximize size={16} />} title="Fit to Screen (F)" onClick={() => fitToScreen(elements)} />
        <ToolbarButton icon={<Upload size={16} />} title="Import BPMN" onClick={onOpenBPMNImport} />
        <ToolbarButton icon={<Workflow size={16} />} title="Import n8n" onClick={onOpenN8nImport} />
        <div className="mx-1 h-5 w-px bg-[#334155]" />
        <XRayButton isActive={isXRayActive} onClick={toggleXRay} />
        <ToolbarButton
          icon={<Play size={16} />}
          title={isScenarioMode ? 'Exit Scenario Mode' : 'Enter Scenario Mode'}
          onClick={() => setScenarioMode(!isScenarioMode)}
          active={isScenarioMode}
        />
        <ChatButton onClick={toggleChat} />
        <ToolbarButton icon={<Map size={16} />} title="Minimap" onClick={toggleMinimap} />
        <ToolbarButton icon={<Lightbulb size={16} />} title="Tour" onClick={onOpenWalkthrough} />
        <ToolbarButton icon={<Download size={16} />} title="Export" />
      </div>
    </header>
  );
}

function ViewModeButton({
  icon,
  label,
  active,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1.5 rounded-md px-3 py-1 text-xs font-medium transition ${
        active
          ? 'bg-[#7c3aed] text-white'
          : 'text-[#94a3b8] hover:text-white hover:bg-[#1e293b]'
      }`}
    >
      {icon}
      {label}
    </button>
  );
}

function ToolbarButton({
  icon,
  title,
  onClick,
  disabled,
  active,
}: {
  icon: React.ReactNode;
  title: string;
  onClick?: () => void;
  disabled?: boolean;
  active?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      disabled={disabled}
      className={`rounded p-1.5 transition ${
        active
          ? 'bg-[#7c3aed]/20 text-[#a78bfa]'
          : disabled
            ? 'text-[#475569] cursor-not-allowed'
            : 'text-[#94a3b8] hover:bg-[#334155] hover:text-white'
      }`}
    >
      {icon}
    </button>
  );
}

function XRayButton({ isActive, onClick }: { isActive: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      title={isActive ? 'Exit X-Ray Mode' : 'Transformation X-Ray'}
      className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-semibold transition ${
        isActive
          ? 'bg-red-500/20 text-red-400 border border-red-500/40 hover:bg-red-500/30'
          : 'text-[#94a3b8] hover:bg-[#334155] hover:text-white border border-transparent'
      }`}
    >
      <ScanEye size={16} />
      X-Ray
    </button>
  );
}

function ChatButton({ onClick }: { onClick: () => void }) {
  const unreadCount = useCollaborationStore((s) => s.unreadCount);
  return (
    <button
      onClick={onClick}
      title="Chat"
      className="relative rounded p-1.5 text-[#94a3b8] hover:bg-[#334155] hover:text-white transition"
    >
      <MessageSquare size={16} />
      {unreadCount > 0 && (
        <span className="absolute -top-0.5 -right-0.5 w-3.5 h-3.5 rounded-full bg-[#7c3aed] text-[8px] text-white flex items-center justify-center font-bold">
          {unreadCount > 9 ? '9+' : unreadCount}
        </span>
      )}
    </button>
  );
}
