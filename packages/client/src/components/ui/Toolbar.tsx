import { useEffect, useState, useRef } from 'react';
import toast from 'react-hot-toast';
import { useNavigate, useMatch } from 'react-router-dom';
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
  Users,
  FileText,
  BarChart3,
  ListTree,
  Loader2,
} from 'lucide-react';
import { useUIStore } from '../../stores/uiStore';
import { useArchitectureStore } from '../../stores/architectureStore';
import { useXRayStore } from '../../stores/xrayStore';
import { reportAPI } from '../../services/api';
import { fitToScreen } from '../3d/CameraControls';
import UserPresence from '../collaboration/UserPresence';
import { useCollaborationStore } from '../../stores/collaborationStore';
import ProjectCollaborators from './ProjectCollaborators';

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
  const navigate = useNavigate();
  const isProjectView = useMatch('/project/:projectId');
  const projectName = useArchitectureStore((s) => s.projectName);

  const undo = useArchitectureStore((s) => s.undo);
  const redo = useArchitectureStore((s) => s.redo);
  const canUndo = useArchitectureStore((s) => s.canUndo);
  const canRedo = useArchitectureStore((s) => s.canRedo);
  const elements = useArchitectureStore((s) => s.elements);
  const isScenarioMode = useArchitectureStore((s) => s.isScenarioMode);
  const setScenarioMode = useArchitectureStore((s) => s.setScenarioMode);

  const projectId = useArchitectureStore((s) => s.projectId);
  const isXRayActive = useXRayStore((s) => s.isActive);
  const toggleXRay = useXRayStore((s) => s.toggleXRay);
  const [showCollaborators, setShowCollaborators] = useState(false);
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [exportLoading, setExportLoading] = useState<string | null>(null);
  const exportRef = useRef<HTMLDivElement>(null);

  // Close export menu on outside click
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (exportRef.current && !exportRef.current.contains(e.target as Node)) {
        setShowExportMenu(false);
      }
    };
    if (showExportMenu) document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [showExportMenu]);

  const handleExport = async (type: 'executive' | 'inventory') => {
    if (!projectId) return;
    setExportLoading(type);
    try {
      const { data } = type === 'executive'
        ? await reportAPI.downloadExecutive(projectId)
        : await reportAPI.downloadInventory(projectId);
      const url = URL.createObjectURL(data as Blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `TheArchitect-${type}-${new Date().toISOString().split('T')[0]}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success(`${type === 'executive' ? 'Executive Summary' : 'Architecture Inventory'} downloaded`);
    } catch (err) {
      console.error(`[Export] Failed to download ${type} report:`, err);
      toast.error(`Failed to download ${type} report`);
    } finally {
      setExportLoading(null);
      setShowExportMenu(false);
    }
  };

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
    <header className="flex h-12 items-center justify-between border-b border-[#1a2a1a] bg-[#111111] px-4">
      {/* Left section */}
      <div className="flex items-center gap-2">
        <button
          onClick={toggleSidebar}
          className="rounded p-1.5 hover:bg-[#1a2a1a] text-[#7a8a7a] hover:text-white transition"
          title={isSidebarOpen ? 'Close Sidebar' : 'Open Sidebar'}
        >
          {isSidebarOpen ? <PanelLeftClose size={18} /> : <PanelLeftOpen size={18} />}
        </button>

        <div className="mx-2 h-5 w-px bg-[#1a2a1a]" />

        <button onClick={() => navigate('/')} className="flex items-center gap-1.5 hover:opacity-80 transition" title="Back to Dashboard">
          <span className="text-sm font-semibold text-[#00ff41]" style={{ textShadow: '0 0 10px rgba(0,255,65,0.5)' }}>TheArchitect</span>
          {!isProjectView && <span className="text-xs text-[#7a8a7a]">Enterprise Architecture</span>}
        </button>
        {isProjectView && projectName && (
          <div className="flex items-center gap-1.5">
            <span className="text-[#3a4a3a]">/</span>
            <span className="text-sm font-medium text-white">{projectName}</span>
            <button
              onClick={() => setShowCollaborators(true)}
              className="ml-1.5 rounded p-1 text-[#4a5a4a] hover:text-white hover:bg-[#1a2a1a] transition"
              title="Project Members"
            >
              <Users size={14} />
            </button>
          </div>
        )}

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
      <div className="flex items-center gap-1 rounded-lg bg-[#0a0a0a] p-0.5">
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
        <div className="mx-1 h-5 w-px bg-[#1a2a1a]" />
        <ToolbarButton icon={<Maximize size={16} />} title="Fit to Screen (F)" onClick={() => fitToScreen(elements)} />
        <ToolbarButton icon={<Upload size={16} />} title="Import BPMN" onClick={onOpenBPMNImport} />
        <ToolbarButton icon={<Workflow size={16} />} title="Import n8n" onClick={onOpenN8nImport} />
        <div className="mx-1 h-5 w-px bg-[#1a2a1a]" />
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
        <div className="relative" ref={exportRef}>
          <ToolbarButton
            icon={exportLoading ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}
            title="Export PDF"
            onClick={() => setShowExportMenu(!showExportMenu)}
          />
          {showExportMenu && projectId && (
            <div className="absolute right-0 top-full mt-1 w-52 rounded-lg border border-[#1a2a1a] bg-[#111111] py-1 shadow-xl z-50">
              <button
                onClick={() => handleExport('executive')}
                disabled={!!exportLoading}
                className="flex w-full items-center gap-2 px-3 py-2 text-xs text-[#d0d0d0] hover:bg-[#1a2a1a] transition disabled:opacity-50"
              >
                <BarChart3 size={14} className="text-[#00ff41]" />
                Executive Summary
                {exportLoading === 'executive' && <Loader2 size={12} className="ml-auto animate-spin" />}
              </button>
              <button
                onClick={() => handleExport('inventory')}
                disabled={!!exportLoading}
                className="flex w-full items-center gap-2 px-3 py-2 text-xs text-[#d0d0d0] hover:bg-[#1a2a1a] transition disabled:opacity-50"
              >
                <ListTree size={14} className="text-[#22c55e]" />
                Architecture Inventory
                {exportLoading === 'inventory' && <Loader2 size={12} className="ml-auto animate-spin" />}
              </button>
              <div className="mx-2 my-1 h-px bg-[#1a2a1a]" />
              <div className="px-3 py-1.5 text-[10px] text-[#4a5a4a]">
                Simulation reports can be exported from the Simulation panel
              </div>
            </div>
          )}
        </div>
      </div>

      {projectId && (
        <ProjectCollaborators
          isOpen={showCollaborators}
          onClose={() => setShowCollaborators(false)}
          projectId={projectId}
        />
      )}
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
          ? 'bg-[#00ff41] text-black shadow-[0_0_10px_rgba(0,255,65,0.3)]'
          : 'text-[#7a8a7a] hover:text-white hover:bg-[#111111]'
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
      aria-label={title}
      disabled={disabled}
      className={`rounded p-1.5 transition ${
        active
          ? 'bg-[#00ff41]/20 text-[#33ff66]'
          : disabled
            ? 'text-[#3a4a3a] cursor-not-allowed'
            : 'text-[#7a8a7a] hover:bg-[#1a2a1a] hover:text-white'
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
          : 'text-[#7a8a7a] hover:bg-[#1a2a1a] hover:text-white border border-transparent'
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
      className="relative rounded p-1.5 text-[#7a8a7a] hover:bg-[#1a2a1a] hover:text-white transition"
    >
      <MessageSquare size={16} />
      {unreadCount > 0 && (
        <span className="absolute -top-0.5 -right-0.5 w-3.5 h-3.5 rounded-full bg-[#00ff41] text-[8px] text-black flex items-center justify-center font-bold">
          {unreadCount > 9 ? '9+' : unreadCount}
        </span>
      )}
    </button>
  );
}
