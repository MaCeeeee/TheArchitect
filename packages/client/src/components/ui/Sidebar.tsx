import { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDoubleClick } from '../../hooks/useDoubleClick';
import {
  FolderTree, Search, Plus, ChevronRight, ChevronDown, Eye, EyeOff,
  Settings, BookOpen, BarChart3, Sparkles, X, ShieldCheck,
  FileText, Grid3X3, Wrench, FileCheck, TrendingUp, ClipboardCheck, ShieldAlert,
  Briefcase, Users, Bot, Cable,
} from 'lucide-react';
import { useArchitectureStore, ArchitectureElement } from '../../stores/architectureStore';
import { useUIStore } from '../../stores/uiStore';
import { flyToElement } from '../3d/CameraControls';
import ArchitectPanel from './ArchitectPanel';
import ElementPalette from './ElementPalette';
import ImpactAnalysis from '../analytics/ImpactAnalysis';
import RiskDashboard from '../analytics/RiskDashboard';
import CostOptimization from '../analytics/CostOptimization';
import CostBreakdown from '../analytics/CostBreakdown';
import ProbabilisticCost from '../analytics/ProbabilisticCost';
import ScenarioDashboard from '../analytics/ScenarioDashboard';
import CapacityPlanning from '../simulation/CapacityPlanning';
import MonteCarloSimulation from '../simulation/MonteCarloSimulation';
import AICopilot from '../copilot/AICopilot';
import RoadmapPanel from '../analytics/RoadmapPanel';
import PhaseBar from './PhaseBar';
import { ARCHITECTURE_LAYERS, LAYER_Y } from '@thearchitect/shared/src/constants/togaf.constants';
import type { ArchitectureLayer, ElementType, TOGAFDomain } from '@thearchitect/shared/src/types/architecture.types';

const LAYER_CONFIG = ARCHITECTURE_LAYERS.map(l => ({ id: l.id, label: l.label, color: l.color }));

const NAV_ITEMS = [
  { id: 'explorer', icon: FolderTree, label: 'Explorer' },
  { id: 'architect', icon: BookOpen, label: 'Architect' },
  { id: 'comply', icon: ShieldCheck, label: 'Comply' },
  { id: 'analyze', icon: BarChart3, label: 'Analyze' },
  { id: 'copilot', icon: Sparkles, label: 'AI Copilot' },
] as const;

export default function Sidebar() {
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState('');
  const projectId = useArchitectureStore((s) => s.projectId);
  const elements = useArchitectureStore((s) => s.elements);
  const visibleLayers = useArchitectureStore((s) => s.visibleLayers);
  const toggleLayer = useArchitectureStore((s) => s.toggleLayer);
  const selectElement = useArchitectureStore((s) => s.selectElement);
  const selectedElementId = useArchitectureStore((s) => s.selectedElementId);
  const addElement = useArchitectureStore((s) => s.addElement);
  const { sidebarPanel, setSidebarPanel, isPaletteOpen, togglePalette } = useUIStore();

  const filteredElements = elements.filter((el) =>
    el.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const elementsByLayer = LAYER_CONFIG.map((layer) => ({
    ...layer,
    elements: filteredElements.filter((el) => el.layer === layer.id),
  }));

  const handleAddElement = (type: ElementType, layer: ArchitectureLayer, domain: TOGAFDomain) => {
    const layerElements = elements.filter((el) => el.layer === layer);
    const xOffset = (layerElements.length % 5) * 3 - 6;
    const zOffset = Math.floor(layerElements.length / 5) * 3;
    // Find label from ELEMENT_CATEGORIES or fallback
    const label = type.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

    const newElement: ArchitectureElement = {
      id: `el-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      type,
      name: `New ${label}`,
      description: '',
      layer,
      togafDomain: domain,
      maturityLevel: 3,
      riskLevel: 'low',
      status: 'current',
      position3D: { x: xOffset, y: LAYER_Y[layer], z: zOffset },
      metadata: {},
    };
    addElement(newElement);
    selectElement(newElement.id);
    flyToElement(newElement.position3D, newElement.id);
  };

  const handleElementClick = (id: string) => {
    selectElement(id);
    const el = elements.find((e) => e.id === id);
    if (el) flyToElement(el.position3D, el.id);
  };

  return (
    <aside className="flex h-full w-64 flex-col border-r border-[var(--border-subtle)] bg-[var(--surface-raised)]">
      {/* Navigation tabs */}
      <div className="flex border-b border-[var(--border-subtle)]">
        {NAV_ITEMS.map((item) => (
          <NavButton
            key={item.id}
            item={item}
            isActive={sidebarPanel === item.id}
            setSidebarPanel={setSidebarPanel}
          />
        ))}
      </div>

      {/* Phase Progress Bar */}
      <PhaseBar />

      {sidebarPanel === 'explorer' && (
        <>
          {!projectId ? (
            <div className="flex-1 flex flex-col items-center justify-center px-6 text-center">
              <FolderTree size={32} className="text-[#1a2a1a] mb-3" />
              <p className="text-sm font-medium text-[var(--text-tertiary)]">No project open</p>
              <p className="text-xs text-[var(--text-disabled)] mt-1">Open a project from the dashboard to explore its architecture elements.</p>
            </div>
          ) : (
            <>
              {/* Search */}
              <div className="p-3">
                <div className="flex items-center gap-2 rounded-md bg-[var(--surface-base)] px-3 py-1.5">
                  <Search size={14} className="text-[var(--text-secondary)]" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search elements..."
                    className="flex-1 bg-transparent text-xs text-white placeholder:text-[var(--text-tertiary)] outline-none"
                  />
                </div>
              </div>

              {/* Layer toggles & elements */}
              <div className="flex-1 overflow-y-auto px-2">
                {elementsByLayer.map((layer) => (
                  <LayerSection
                    key={layer.id}
                    layer={layer}
                    isVisible={visibleLayers.has(layer.id)}
                    onToggleVisibility={() => toggleLayer(layer.id)}
                    selectedElementId={selectedElementId}
                    onSelectElement={handleElementClick}
                  />
                ))}
              </div>
            </>
          )}

          {/* Smart Element Palette (collapsible) */}
          {projectId && isPaletteOpen && (
            <ElementPalette onAddElement={handleAddElement} />
          )}

          {/* Add element toggle button */}
          {projectId && (
            <div className="border-t border-[var(--border-subtle)] p-3">
              <button
                onClick={togglePalette}
                className={`flex w-full items-center justify-center gap-2 rounded-md px-3 py-2 text-xs font-medium transition ${
                  isPaletteOpen
                    ? 'bg-[var(--surface-base)] text-[#00ff41] border border-[#00ff41]/30'
                    : 'bg-[#00ff41] text-black hover:bg-[#00cc33]'
                }`}
              >
                <Plus size={14} className={isPaletteOpen ? 'rotate-45 transition-transform' : 'transition-transform'} />
                {isPaletteOpen ? 'Close Palette' : 'Add Element'}
              </button>
            </div>
          )}
        </>
      )}

      {sidebarPanel === 'architect' && <ArchitectPanel />}

      {sidebarPanel === 'comply' && <CompliancePanel />}

      {sidebarPanel === 'analyze' && <AnalyticsPanel />}

      {sidebarPanel === 'copilot' && (
        <div className="flex-1 overflow-hidden">
          <AICopilot />
        </div>
      )}

      {/* Settings footer icon */}
      <div className="border-t border-[var(--border-subtle)] p-2">
        <button
          onClick={() => navigate('/settings')}
          className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-xs text-[var(--text-secondary)] hover:bg-[var(--surface-base)] hover:text-white transition"
          title="Settings"
        >
          <Settings size={14} />
          Settings
        </button>
      </div>
    </aside>
  );
}

// ─── NavButton with single/double-click support ───

function NavButton({
  item,
  isActive,
  setSidebarPanel,
}: {
  item: (typeof NAV_ITEMS)[number];
  isActive: boolean;
  setSidebarPanel: (panel: 'explorer' | 'architect' | 'analyze' | 'comply' | 'copilot' | 'none') => void;
}) {
  const navigate = useNavigate();
  const projectId = useArchitectureStore((s) => s.projectId);

  const handleAnalyze = useDoubleClick(
    useCallback(() => setSidebarPanel('analyze'), [setSidebarPanel]),
    useCallback(() => {
      if (projectId) navigate(`/project/${projectId}/analyze/dashboard`);
      else setSidebarPanel('analyze');
    }, [projectId, navigate, setSidebarPanel]),
  );

  const handleComply = useDoubleClick(
    useCallback(() => setSidebarPanel('comply'), [setSidebarPanel]),
    useCallback(() => {
      if (projectId) navigate(`/project/${projectId}/compliance/pipeline`);
      else setSidebarPanel('comply');
    }, [projectId, navigate, setSidebarPanel]),
  );

  const handleClick = () => {
    if (item.id === 'analyze') return handleAnalyze();
    if (item.id === 'comply') return handleComply();
    setSidebarPanel(item.id as typeof item.id);
  };

  return (
    <button
      onClick={handleClick}
      className={`flex-1 flex items-center justify-center p-2.5 transition ${
        isActive
          ? 'text-[#00ff41] border-b-2 border-[#00ff41]'
          : 'text-[var(--text-secondary)] hover:text-white'
      }`}
      title={
        item.id === 'analyze' || item.id === 'comply'
          ? `${item.label} (double-click for full view)`
          : item.label
      }
    >
      <item.icon size={16} />
    </button>
  );
}

// ─── Compliance Sidebar Panel ───

const COMPLIANCE_SECTIONS = [
  { id: 'pipeline', label: 'Pipeline', icon: ShieldAlert, group: 'workflow' },
  { id: 'standards', label: 'Standards', icon: FileText, group: 'workflow' },
  { id: 'matrix', label: 'Matrix', icon: Grid3X3, group: 'workflow' },
  { id: 'remediate', label: 'Remediate', icon: Wrench, group: 'workflow' },
  { id: 'policies', label: 'Policies', icon: FileCheck, group: 'govern' },
  { id: 'elements', label: 'Elements', icon: Sparkles, group: 'govern' },
  { id: 'progress', label: 'Progress', icon: TrendingUp, group: 'track' },
  { id: 'audit', label: 'Audit', icon: ClipboardCheck, group: 'track' },
] as const;

const COMPLIANCE_GROUPS = [
  { key: 'workflow', label: 'Workflow' },
  { key: 'govern', label: 'Govern' },
  { key: 'track', label: 'Track' },
] as const;

function CompliancePanel() {
  const navigate = useNavigate();
  const projectId = useArchitectureStore((s) => s.projectId);
  const [activeSection, setActiveSection] = useState('pipeline');

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      {/* Header with Full View link */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-[var(--border-subtle)]">
        <p className="text-xs font-semibold text-[var(--text-primary)]">Comply</p>
        {projectId && (
          <button
            onClick={() => navigate(`/project/${projectId}/compliance/${activeSection}`)}
            className="text-[10px] text-[var(--status-purple)] hover:text-[#c4b5fd] transition"
          >
            Full View →
          </button>
        )}
      </div>

      {/* Section buttons grouped */}
      <div className="overflow-y-auto border-b border-[var(--border-subtle)] px-2 py-2 space-y-2">
        {COMPLIANCE_GROUPS.map((group) => (
          <div key={group.key}>
            <p className="text-[9px] font-semibold uppercase tracking-wider text-[var(--text-tertiary)] px-1 mb-1">
              {group.label}
            </p>
            <div className="flex gap-0.5">
              {COMPLIANCE_SECTIONS.filter((s) => s.group === group.key).map((section) => (
                <button
                  key={section.id}
                  onClick={() => setActiveSection(section.id)}
                  className={`flex-1 flex items-center justify-center gap-1 px-1.5 py-1.5 rounded text-[10px] font-medium transition ${
                    activeSection === section.id
                      ? 'bg-[var(--accent-default)]/15 text-[var(--accent-text)]'
                      : 'text-[var(--text-tertiary)] hover:bg-[var(--surface-base)] hover:text-[var(--text-secondary)]'
                  }`}
                >
                  <section.icon size={11} />
                  {section.label}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Section content — open overlay with the selected section */}
      <div className="flex-1 overflow-y-auto p-3">
        <p className="text-xs text-[var(--text-secondary)] mb-3">
          {activeSection === 'pipeline' && 'Compliance pipeline overview — upload standards, map controls, generate policies.'}
          {activeSection === 'standards' && 'Manage regulatory standards and frameworks (ISO 27001, GDPR, SOC 2, etc.).'}
          {activeSection === 'matrix' && 'Compliance matrix — map architecture elements to standard requirements.'}
          {activeSection === 'remediate' && 'Review and fix compliance gaps with AI-suggested remediation actions.'}
          {activeSection === 'policies' && 'Auto-generated policies from compliance analysis. Review and approve.'}
          {activeSection === 'elements' && 'AI-suggested architecture elements to improve compliance coverage.'}
          {activeSection === 'progress' && 'Track compliance progress across all mapped standards.'}
          {activeSection === 'audit' && 'Audit readiness dashboard — evidence collection and gap analysis.'}
        </p>
        {projectId && (
          <button
            onClick={() => navigate(`/project/${projectId}/compliance/${activeSection}`)}
            className="flex w-full items-center justify-center gap-2 rounded-md bg-[#7c3aed] px-3 py-2 text-xs font-medium text-white hover:bg-[#6d28d9] transition"
          >
            <ShieldCheck size={14} />
            Open {COMPLIANCE_SECTIONS.find((s) => s.id === activeSection)?.label || 'Section'}
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Analytics Sidebar Panel ───

const ANALYTICS_GROUPS = [
  {
    key: 'assess',
    label: 'Assess',
    items: [
      { id: 'risk', label: 'Risk' },
      { id: 'impact', label: 'Impact' },
      { id: 'cost', label: 'Cost' },
    ],
  },
  {
    key: 'simulate',
    label: 'Simulate',
    items: [
      { id: 'monte', label: 'Monte Carlo' },
      { id: 'scenario', label: 'Scenarios' },
      { id: 'capacity', label: 'Capacity' },
    ],
  },
  {
    key: 'plan',
    label: 'Plan',
    items: [
      { id: 'roadmap', label: 'Roadmap' },
    ],
  },
  {
    key: 'manage',
    label: 'Manage',
    items: [
      { id: 'portfolio', label: 'Portfolio' },
      { id: 'integrations', label: 'Integrations' },
    ],
  },
] as const;

type AnalyticsTab = 'risk' | 'impact' | 'cost' | 'monte' | 'scenario' | 'capacity' | 'roadmap' | 'portfolio' | 'integrations';

const ANALYTICS_ROUTE_MAP: Record<string, string> = {
  monte: 'monte-carlo',
  scenario: 'scenarios',
  portfolio: 'portfolio',
  integrations: 'integrations',
};

function AnalyticsPanel() {
  const navigate = useNavigate();
  const projectId = useArchitectureStore((s) => s.projectId);
  const [tab, setTab] = useState<AnalyticsTab>('risk');

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      {/* Header with Full View link */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-[var(--border-subtle)]">
        <p className="text-xs font-semibold text-[var(--text-primary)]">Analyze</p>
        {projectId && (
          <button
            onClick={() => navigate(`/project/${projectId}/analyze/${ANALYTICS_ROUTE_MAP[tab] || tab}`)}
            className="text-[10px] text-[var(--status-purple)] hover:text-[#c4b5fd] transition"
          >
            Full View →
          </button>
        )}
      </div>
      <div className="overflow-y-auto border-b border-[var(--border-subtle)] px-2 py-2 space-y-2">
        {ANALYTICS_GROUPS.map((group) => (
          <div key={group.key}>
            <p className="text-[9px] font-semibold uppercase tracking-wider text-[var(--text-tertiary)] px-1 mb-1">
              {group.label}
            </p>
            <div className="flex gap-0.5">
              {group.items.map((item) => (
                <button
                  key={item.id}
                  onClick={() => setTab(item.id as AnalyticsTab)}
                  className={`flex-1 px-1.5 py-1.5 rounded text-[10px] font-medium transition ${
                    tab === item.id
                      ? 'bg-[var(--accent-default)]/15 text-[var(--accent-text)]'
                      : 'text-[var(--text-tertiary)] hover:bg-[var(--surface-base)] hover:text-[var(--text-secondary)]'
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
      <div className="flex-1 overflow-hidden">
        {tab === 'risk' && <RiskDashboard />}
        {tab === 'impact' && <ImpactAnalysis />}
        {tab === 'cost' && (
          <>
            <CostOptimization />
            <CostBreakdown />
            <ProbabilisticCost />
          </>
        )}
        {tab === 'monte' && <MonteCarloSimulation />}
        {tab === 'scenario' && <ScenarioDashboard />}
        {tab === 'capacity' && <CapacityPlanning />}
        {tab === 'roadmap' && <RoadmapPanel />}
        {tab === 'portfolio' && (
          <div className="p-3 space-y-2">
            {[
              { label: 'Portfolio Overview', desc: 'Lifecycle, risk & status', icon: Briefcase, path: 'portfolio' },
              { label: 'Stakeholder Dashboard', desc: 'Stakeholder mapping', icon: Users, path: 'stakeholder' },
              { label: 'AI Agent Inventory', desc: 'AI agents & governance', icon: Bot, path: 'ai-agents' },
            ].map((card) => (
              <button
                key={card.path}
                onClick={() => projectId && navigate(`/project/${projectId}/${card.path}`)}
                className="flex items-center gap-3 w-full rounded-md border border-[var(--border-subtle)] bg-[var(--surface-base)] p-3 text-left transition hover:border-[#7c3aed]/50 hover:bg-[var(--surface-overlay)]"
              >
                <card.icon size={16} className="text-[#a78bfa] shrink-0" />
                <div>
                  <p className="text-xs font-semibold text-[var(--text-primary)]">{card.label}</p>
                  <p className="text-[10px] text-[var(--text-tertiary)]">{card.desc}</p>
                </div>
              </button>
            ))}
          </div>
        )}
        {tab === 'integrations' && (
          <div className="p-3 space-y-2">
            <button
              onClick={() => projectId && navigate(`/project/${projectId}/analyze/integrations`)}
              className="flex items-center gap-3 w-full rounded-md border border-[var(--border-subtle)] bg-[var(--surface-base)] p-3 text-left transition hover:border-[#7c3aed]/50 hover:bg-[var(--surface-overlay)]"
            >
              <Cable size={16} className="text-[#a78bfa] shrink-0" />
              <div>
                <p className="text-xs font-semibold text-[var(--text-primary)]">Connector Manager</p>
                <p className="text-[10px] text-[var(--text-tertiary)]">Import & sync external tools</p>
              </div>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function LayerSection({
  layer, isVisible, onToggleVisibility, selectedElementId, onSelectElement,
}: {
  layer: { id: string; label: string; color: string; elements: { id: string; name: string; type: string }[] };
  isVisible: boolean;
  onToggleVisibility: () => void;
  selectedElementId: string | null;
  onSelectElement: (id: string) => void;
}) {
  const [isOpen, setIsOpen] = useState(true);

  return (
    <div className="mb-1">
      <div className="flex items-center gap-1 rounded px-1 py-1 hover:bg-[var(--surface-base)]">
        <button onClick={() => setIsOpen(!isOpen)} className="text-[var(--text-secondary)]">
          {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </button>
        <div className="h-2 w-2 rounded-full" style={{ backgroundColor: layer.color }} />
        <span className="flex-1 text-xs font-medium text-[var(--text-primary)]">{layer.label}</span>
        <span className="text-[10px] text-[var(--text-tertiary)] mr-1">{layer.elements.length}</span>
        <button onClick={onToggleVisibility} className="text-[var(--text-secondary)] hover:text-white">
          {isVisible ? <Eye size={12} /> : <EyeOff size={12} />}
        </button>
      </div>

      {isOpen && (
        <div className="ml-5">
          {layer.elements.map((el) => (
            <button
              key={el.id}
              onClick={() => onSelectElement(el.id)}
              className={`flex w-full items-center gap-2 rounded px-2 py-1 text-xs transition ${
                selectedElementId === el.id
                  ? 'bg-[#00ff41]/20 text-[#33ff66] shadow-[0_0_10px_rgba(0,255,65,0.15)]'
                  : 'text-[var(--text-secondary)] hover:bg-[var(--surface-base)] hover:text-white'
              }`}
            >
              <span className="truncate">{el.name}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
