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
  FileSpreadsheet,
  Link2,
  Eye,
  ChevronDown,
} from 'lucide-react';
import { useUIStore } from '../../stores/uiStore';
import { useArchitectureStore } from '../../stores/architectureStore';
import { useXRayStore } from '../../stores/xrayStore';
import { useJourneyStore } from '../../stores/journeyStore';
import { isToolbarActionVisible } from '../../utils/phaseVisibility';
import { reportAPI } from '../../services/api';
import { fitToScreen } from '../3d/ViewModeCamera';
import UserPresence from '../collaboration/UserPresence';
import { useCollaborationStore } from '../../stores/collaborationStore';
import { useAdvisorStore } from '../../stores/advisorStore';
import ProjectCollaborators from './ProjectCollaborators';
import HealthScoreRing from '../copilot/HealthScoreRing';
import { Crosshair } from 'lucide-react';
import { ARCHIMATE_VIEWPOINTS, VIEWPOINT_CATEGORIES } from '@thearchitect/shared/src/constants/archimate-viewpoints';

interface ToolbarProps {
  onOpenBPMNImport: () => void;
  onOpenN8nImport: () => void;
  onOpenCSVImport: () => void;
  onOpenImportMapping?: () => void;
  onOpenWalkthrough: () => void;
}

export default function Toolbar({ onOpenBPMNImport, onOpenN8nImport, onOpenCSVImport, onOpenImportMapping, onOpenWalkthrough }: ToolbarProps) {
  const {
    viewMode,
    setViewMode,
    isSidebarOpen,
    toggleSidebar,
    toggleChat,
    toggleMinimap,
    toggleMissionControl,
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
  const isConnectionMode = useUIStore((s) => s.isConnectionMode);
  const enterConnectionMode = useUIStore((s) => s.enterConnectionMode);
  const exitConnectionMode = useUIStore((s) => s.exitConnectionMode);
  const isXRayActive = useXRayStore((s) => s.isActive);
  const toggleXRay = useXRayStore((s) => s.toggleXRay);
  const activeViewpoint = useUIStore((s) => s.activeViewpoint);
  const setActiveViewpoint = useUIStore((s) => s.setActiveViewpoint);
  const showAllSections = useUIStore((s) => s.showAllSections);
  const currentPhase = useJourneyStore((s) => s.currentPhase);
  const [showViewpointMenu, setShowViewpointMenu] = useState(false);
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const moreRef = useRef<HTMLDivElement>(null);
  const viewpointRef = useRef<HTMLDivElement>(null);

  // X-Ray guard: auto-switch to 3D when activating X-Ray
  const handleXRayToggle = () => {
    if (!isXRayActive && viewMode !== '3d') {
      setViewMode('3d');
      toast('Switching to 3D for X-Ray mode', { icon: '🔬' });
      // Small delay to let camera animate, then toggle
      setTimeout(() => toggleXRay(), 300);
      return;
    }
    toggleXRay();
  };

  // Guard: deactivate X-Ray when switching away from 3D
  const handleSetViewMode = (mode: typeof viewMode) => {
    if (isXRayActive && mode !== '3d') {
      toggleXRay();
    }
    setViewMode(mode);
  };
  const advisorHealthScore = useAdvisorStore((s) => s.healthScore);
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

  // Close viewpoint menu on outside click
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (viewpointRef.current && !viewpointRef.current.contains(e.target as Node)) {
        setShowViewpointMenu(false);
      }
    };
    if (showViewpointMenu) document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [showViewpointMenu]);

  // Close more menu on outside click
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (moreRef.current && !moreRef.current.contains(e.target as Node)) {
        setShowMoreMenu(false);
      }
    };
    if (showMoreMenu) document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [showMoreMenu]);

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
      if (import.meta.env.DEV) console.error(`[Export] Failed to download ${type} report:`, err);
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
      // Ctrl+1/2/3 for view mode switching
      if ((e.ctrlKey || e.metaKey) && e.key === '1') {
        e.preventDefault();
        handleSetViewMode('3d');
      }
      if ((e.ctrlKey || e.metaKey) && e.key === '2') {
        e.preventDefault();
        handleSetViewMode('2d-topdown');
      }
      if ((e.ctrlKey || e.metaKey) && e.key === '3') {
        e.preventDefault();
        handleSetViewMode('layer');
      }

      // C = toggle connection mode
      if (e.key === 'c' && !e.ctrlKey && !e.metaKey && isProjectView) {
        e.preventDefault();
        const ui = useUIStore.getState();
        ui.isConnectionMode ? ui.exitConnectionMode() : ui.enterConnectionMode();
      }

      // V = toggle viewpoint menu
      if (e.key === 'v' && !e.ctrlKey && !e.metaKey && isProjectView) {
        e.preventDefault();
        setShowViewpointMenu(prev => !prev);
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
  }, [undo, redo, isProjectView]);

  return (
    <header className="flex h-12 items-center justify-between border-b border-[var(--border-subtle)] bg-[var(--surface-raised)] px-4">
      {/* Left section */}
      <div className="flex items-center gap-2">
        <button
          onClick={toggleSidebar}
          className="rounded p-1.5 hover:bg-[#1a2a1a] text-[var(--text-secondary)] hover:text-white transition"
          title={isSidebarOpen ? 'Close Sidebar' : 'Open Sidebar'}
        >
          {isSidebarOpen ? <PanelLeftClose size={18} /> : <PanelLeftOpen size={18} />}
        </button>

        <div className="mx-2 h-5 w-px bg-[#1a2a1a]" />

        <button onClick={() => navigate('/dashboard')} className="flex items-center gap-1.5 hover:opacity-80 transition" title="Back to Dashboard">
          <span className="text-sm font-semibold text-[#00ff41]" style={{ textShadow: '0 0 10px rgba(0,255,65,0.5)' }}>TheArchitect</span>
          {!isProjectView && <span className="text-xs text-[var(--text-secondary)]">Enterprise Architecture</span>}
        </button>
        {isProjectView && projectName && (
          <div className="flex items-center gap-1.5">
            <span className="text-[var(--text-disabled)]">/</span>
            <span className="text-sm font-medium text-white">{projectName}</span>
            <button
              onClick={() => setShowCollaborators(true)}
              className="ml-1.5 rounded p-1 text-[var(--text-tertiary)] hover:text-white hover:bg-[#1a2a1a] transition"
              title="Project Members"
            >
              <Users size={14} />
            </button>
            {advisorHealthScore && (
              <div className="ml-2 border-l border-[var(--border-subtle)] pl-2">
                <HealthScoreRing score={advisorHealthScore} compact />
              </div>
            )}
            <button
              onClick={toggleMissionControl}
              className="ml-2 flex items-center gap-1 rounded px-2 py-1 text-[10px] font-medium text-[var(--status-purple)] hover:bg-[var(--status-purple)]/10 transition"
              title="Mission Control"
            >
              <Crosshair size={12} />
              Mission
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

      {/* Center section - View modes + Viewpoint */}
      <div className="flex items-center gap-2">
        <div className="flex items-center gap-1 rounded-lg bg-[var(--surface-base)] p-0.5">
          <ViewModeButton
            icon={<Box size={16} />}
            label="3D"
            active={viewMode === '3d'}
            onClick={() => handleSetViewMode('3d')}
          />
          <ViewModeButton
            icon={<Grid3x3 size={16} />}
            label="2D"
            active={viewMode === '2d-topdown'}
            onClick={() => handleSetViewMode('2d-topdown')}
          />
          <ViewModeButton
            icon={<Layers size={16} />}
            label="Layers"
            active={viewMode === 'layer'}
            onClick={() => handleSetViewMode('layer')}
          />
        </div>

        {/* Viewpoint selector */}
        {isProjectView && (
          <div className="relative" ref={viewpointRef}>
            <button
              onClick={() => setShowViewpointMenu(!showViewpointMenu)}
              className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-medium transition ${
                activeViewpoint
                  ? 'bg-[#00ff41]/10 text-[#33ff66] border border-[#00ff41]/30'
                  : 'text-[var(--text-secondary)] hover:text-white hover:bg-[var(--surface-base)] border border-transparent'
              }`}
              title={activeViewpoint ? `Viewpoint: ${ARCHIMATE_VIEWPOINTS.find(v => v.id === activeViewpoint)?.name}` : 'Select Viewpoint (V)'}
            >
              <Eye size={14} />
              <span className="max-w-[100px] truncate">
                {activeViewpoint
                  ? ARCHIMATE_VIEWPOINTS.find(v => v.id === activeViewpoint)?.name || 'Viewpoint'
                  : 'Viewpoint'}
              </span>
              <ChevronDown size={12} className={`transition ${showViewpointMenu ? 'rotate-180' : ''}`} />
            </button>
            {showViewpointMenu && (
              <div className="absolute left-0 top-full mt-1 w-64 rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-raised)] py-1 shadow-xl z-50 max-h-80 overflow-y-auto">
                {/* Clear viewpoint */}
                <button
                  onClick={() => { setActiveViewpoint(null); setShowViewpointMenu(false); }}
                  className={`flex w-full items-center gap-2 px-3 py-1.5 text-xs transition ${
                    !activeViewpoint ? 'text-[#00ff41] bg-[#00ff41]/5' : 'text-[var(--text-secondary)] hover:bg-[#1a2a1a]'
                  }`}
                >
                  <Eye size={12} />
                  All Elements (No Filter)
                </button>
                <div className="mx-2 my-1 h-px bg-[#1a2a1a]" />
                {VIEWPOINT_CATEGORIES.map(cat => (
                  <div key={cat.id}>
                    <div className="px-3 py-1 text-[9px] font-semibold uppercase tracking-wider text-[var(--text-disabled)]">
                      {cat.label}
                    </div>
                    {ARCHIMATE_VIEWPOINTS.filter(v => v.category === cat.id).map(vp => (
                      <button
                        key={vp.id}
                        onClick={() => { setActiveViewpoint(vp.id); setShowViewpointMenu(false); toast.success(`Viewpoint: ${vp.name}`); }}
                        className={`flex w-full items-center gap-2 px-3 py-1.5 text-xs transition ${
                          activeViewpoint === vp.id ? 'text-[#00ff41] bg-[#00ff41]/5' : 'text-[#d0d0d0] hover:bg-[#1a2a1a]'
                        }`}
                      >
                        <span className="flex-1 text-left">{vp.name}</span>
                        <span className="text-[10px] text-[var(--text-disabled)]">{vp.allowedElementTypes.length} types</span>
                      </button>
                    ))}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Right section */}
      <div className="flex items-center gap-1">
        <ToolbarButton icon={<Undo2 size={16} />} title="Undo (Ctrl+Z)" onClick={undo} disabled={!canUndo} />
        <ToolbarButton icon={<Redo2 size={16} />} title="Redo (Ctrl+Shift+Z)" onClick={redo} disabled={!canRedo} />
        <div className="mx-1 h-5 w-px bg-[#1a2a1a]" />
        {isProjectView && (
          <ToolbarButton
            icon={<Link2 size={16} />}
            title={isConnectionMode ? 'Exit Connection Mode (Esc)' : 'Connect Elements (C)'}
            onClick={() => isConnectionMode ? exitConnectionMode() : enterConnectionMode()}
            active={isConnectionMode}
          />
        )}
        <ToolbarButton icon={<Maximize size={16} />} title="Fit to Screen (F)" onClick={() => fitToScreen(elements)} />
        {/* Phase-gated: X-Ray and Scenario visible from Phase 4+ */}
        {isToolbarActionVisible('xray', currentPhase, showAllSections) && (
          <>
            <XRayButton isActive={isXRayActive} onClick={handleXRayToggle} />
            <ToolbarButton
              icon={<Play size={16} />}
              title={isScenarioMode ? 'Exit Scenario Mode' : 'Enter Scenario Mode'}
              onClick={() => setScenarioMode(!isScenarioMode)}
              active={isScenarioMode}
            />
          </>
        )}
        <ChatButton onClick={toggleChat} />
        <ToolbarButton icon={<Map size={16} />} title="Minimap" onClick={toggleMinimap} />
        <ToolbarButton icon={<Lightbulb size={16} />} title="Tour" onClick={onOpenWalkthrough} />
        {/* More dropdown — imports + phase-hidden actions */}
        <div className="relative" ref={moreRef}>
          <ToolbarButton
            icon={<ChevronDown size={16} />}
            title="More actions"
            onClick={() => setShowMoreMenu(!showMoreMenu)}
          />
          {showMoreMenu && (
            <div className="absolute right-0 top-full mt-1 w-48 rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-raised)] py-1 shadow-xl z-50">
              <div className="px-3 py-1 text-[9px] font-medium text-[var(--text-tertiary)] uppercase tracking-wider">Import</div>
              <button onClick={() => { onOpenBPMNImport(); setShowMoreMenu(false); }} className="flex w-full items-center gap-2 px-3 py-2 text-xs text-[#d0d0d0] hover:bg-[#1a2a1a] transition">
                <Upload size={14} /> BPMN
              </button>
              <button onClick={() => { onOpenN8nImport(); setShowMoreMenu(false); }} className="flex w-full items-center gap-2 px-3 py-2 text-xs text-[#d0d0d0] hover:bg-[#1a2a1a] transition">
                <Workflow size={14} /> n8n Workflow
              </button>
              <button onClick={() => { onOpenCSVImport(); setShowMoreMenu(false); }} className="flex w-full items-center gap-2 px-3 py-2 text-xs text-[#d0d0d0] hover:bg-[#1a2a1a] transition">
                <FileSpreadsheet size={14} /> CSV
              </button>
              {onOpenImportMapping && (
                <button onClick={() => { onOpenImportMapping(); setShowMoreMenu(false); }} className="flex w-full items-center gap-2 px-3 py-2 text-xs text-[#d0d0d0] hover:bg-[#1a2a1a] transition">
                  <Upload size={14} /> Data Mapping
                </button>
              )}
              {!isToolbarActionVisible('xray', currentPhase, showAllSections) && (
                <>
                  <div className="mx-2 my-1 h-px bg-[#1a2a1a]" />
                  <button onClick={() => { handleXRayToggle(); setShowMoreMenu(false); }} className="flex w-full items-center gap-2 px-3 py-2 text-xs text-[#d0d0d0] hover:bg-[#1a2a1a] transition">
                    <ScanEye size={14} /> X-Ray Mode
                  </button>
                  <button onClick={() => { setScenarioMode(!isScenarioMode); setShowMoreMenu(false); }} className="flex w-full items-center gap-2 px-3 py-2 text-xs text-[#d0d0d0] hover:bg-[#1a2a1a] transition">
                    <Play size={14} /> Scenario Mode
                  </button>
                </>
              )}
            </div>
          )}
        </div>
        <div className="relative" ref={exportRef}>
          <ToolbarButton
            icon={exportLoading ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}
            title="Export PDF"
            onClick={() => setShowExportMenu(!showExportMenu)}
          />
          {showExportMenu && projectId && (
            <div className="absolute right-0 top-full mt-1 w-52 rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-raised)] py-1 shadow-xl z-50">
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
              <div className="px-3 py-1.5 text-[10px] text-[var(--text-tertiary)]">
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
          : 'text-[var(--text-secondary)] hover:text-white hover:bg-[var(--surface-raised)]'
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
            ? 'text-[var(--text-disabled)] cursor-not-allowed'
            : 'text-[var(--text-secondary)] hover:bg-[#1a2a1a] hover:text-white'
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
          : 'text-[var(--text-secondary)] hover:bg-[#1a2a1a] hover:text-white border border-transparent'
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
      className="relative rounded p-1.5 text-[var(--text-secondary)] hover:bg-[#1a2a1a] hover:text-white transition"
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
