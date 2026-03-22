import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  FolderTree, Search, Plus, ChevronRight, ChevronDown, Eye, EyeOff,
  Settings, BookOpen, BarChart3, Shield, Store, Sparkles, X,
} from 'lucide-react';
import { useArchitectureStore, ArchitectureElement } from '../../stores/architectureStore';
import { useUIStore } from '../../stores/uiStore';
import { flyToElement } from '../3d/CameraControls';
import TOGAF10Framework from '../togaf/TOGAF10Framework';
import ImpactAnalysis from '../analytics/ImpactAnalysis';
import RiskDashboard from '../analytics/RiskDashboard';
import CostOptimization from '../analytics/CostOptimization';
import PredictiveAnalytics from '../analytics/PredictiveAnalytics';
import ComplianceDashboard from '../governance/ComplianceDashboard';
import ApprovalWorkflow from '../governance/ApprovalWorkflow';
import AuditTrail from '../governance/AuditTrail';
import PolicyManager from '../governance/PolicyManager';
import ScenarioComparison from '../simulation/ScenarioComparison';
import SimulationPanel from '../simulation/SimulationPanel';
import CapacityPlanning from '../simulation/CapacityPlanning';
import MonteCarloSimulation from '../simulation/MonteCarloSimulation';
import TemplateMarketplace from '../marketplace/TemplateMarketplace';
import AICopilot from '../copilot/AICopilot';
import RoadmapPanel from '../analytics/RoadmapPanel';
import { ARCHITECTURE_LAYERS, ELEMENT_TYPES, LAYER_Y } from '@thearchitect/shared/src/constants/togaf.constants';
import type { ArchitectureLayer, TOGAFDomain } from '@thearchitect/shared/src/types/architecture.types';

const LAYER_CONFIG = ARCHITECTURE_LAYERS.map(l => ({ id: l.id, label: l.label, color: l.color }));

// Map ElementType → default layer using ELEMENT_TYPES + ARCHITECTURE_LAYERS
const DOMAIN_TO_LAYER: Record<string, string> = {
  business: 'business',
  data: 'information',
  application: 'application',
  technology: 'technology',
  motivation: 'motivation',
  implementation: 'implementation_migration',
};

// Strategy-layer types (capabilities, value streams, resources, courses of action)
const STRATEGY_TYPES = new Set(['business_capability', 'value_stream', 'resource', 'course_of_action']);
// Physical-layer types
const PHYSICAL_TYPES = new Set(['equipment', 'facility', 'distribution_network', 'material']);

const ELEMENT_PALETTE = ELEMENT_TYPES.map(et => {
  let layer: ArchitectureLayer;
  if (STRATEGY_TYPES.has(et.type)) layer = 'strategy';
  else if (PHYSICAL_TYPES.has(et.type)) layer = 'physical';
  else layer = (DOMAIN_TO_LAYER[et.domain] || 'application') as ArchitectureLayer;
  return { type: et.type, label: et.label, layer, togafDomain: et.domain as TOGAFDomain };
});

const NAV_ITEMS = [
  { id: 'explorer', icon: FolderTree, label: 'Explorer' },
  { id: 'togaf', icon: BookOpen, label: 'TOGAF' },
  { id: 'analytics', icon: BarChart3, label: 'Analytics' },
  { id: 'governance', icon: Shield, label: 'Governance' },
  { id: 'marketplace', icon: Store, label: 'Marketplace' },
  { id: 'copilot', icon: Sparkles, label: 'AI Copilot' },
  { id: 'settings', icon: Settings, label: 'Settings' },
] as const;

export default function Sidebar() {
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState('');
  const [showPalette, setShowPalette] = useState(false);
  const projectId = useArchitectureStore((s) => s.projectId);
  const elements = useArchitectureStore((s) => s.elements);
  const visibleLayers = useArchitectureStore((s) => s.visibleLayers);
  const toggleLayer = useArchitectureStore((s) => s.toggleLayer);
  const selectElement = useArchitectureStore((s) => s.selectElement);
  const selectedElementId = useArchitectureStore((s) => s.selectedElementId);
  const addElement = useArchitectureStore((s) => s.addElement);
  const { sidebarPanel, setSidebarPanel } = useUIStore();

  const filteredElements = elements.filter((el) =>
    el.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const elementsByLayer = LAYER_CONFIG.map((layer) => ({
    ...layer,
    elements: filteredElements.filter((el) => el.layer === layer.id),
  }));

  const handleAddElement = (palette: typeof ELEMENT_PALETTE[0]) => {
    const layerElements = elements.filter((el) => el.layer === palette.layer);
    const xOffset = (layerElements.length % 5) * 3 - 6;
    const zOffset = Math.floor(layerElements.length / 5) * 3;

    const newElement: ArchitectureElement = {
      id: `el-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      type: palette.type,
      name: `New ${palette.label}`,
      description: '',
      layer: palette.layer,
      togafDomain: palette.togafDomain,
      maturityLevel: 3,
      riskLevel: 'low',
      status: 'current',
      position3D: { x: xOffset, y: LAYER_Y[palette.layer], z: zOffset },
      metadata: {},
    };
    addElement(newElement);
    selectElement(newElement.id);
    setShowPalette(false);
  };

  const handleElementClick = (id: string) => {
    selectElement(id);
    const el = elements.find((e) => e.id === id);
    if (el) flyToElement(el.position3D, el.id);
  };

  return (
    <aside className="flex h-full w-64 flex-col border-r border-[#1a2a1a] bg-[#111111]">
      {/* Navigation tabs */}
      <div className="flex border-b border-[#1a2a1a]">
        {NAV_ITEMS.map((item) => (
          <button
            key={item.id}
            onClick={() => {
              if (item.id === 'settings') {
                navigate('/settings');
              } else {
                setSidebarPanel(item.id as typeof sidebarPanel);
              }
            }}
            className={`flex-1 flex items-center justify-center p-2.5 transition ${
              sidebarPanel === item.id
                ? 'text-[#00ff41] border-b-2 border-[#00ff41]'
                : 'text-[#7a8a7a] hover:text-white'
            }`}
            title={item.label}
          >
            <item.icon size={16} />
          </button>
        ))}
      </div>

      {sidebarPanel === 'explorer' && (
        <>
          {!projectId ? (
            <div className="flex-1 flex flex-col items-center justify-center px-6 text-center">
              <FolderTree size={32} className="text-[#1a2a1a] mb-3" />
              <p className="text-sm font-medium text-[#4a5a4a]">No project open</p>
              <p className="text-xs text-[#3a4a3a] mt-1">Open a project from the dashboard to explore its architecture elements.</p>
            </div>
          ) : (
            <>
              {/* Search */}
              <div className="p-3">
                <div className="flex items-center gap-2 rounded-md bg-[#0a0a0a] px-3 py-1.5">
                  <Search size={14} className="text-[#7a8a7a]" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search elements..."
                    className="flex-1 bg-transparent text-xs text-white placeholder:text-[#4a5a4a] outline-none"
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

          {/* Add element button + palette */}
          {projectId && <div className="border-t border-[#1a2a1a] p-3 relative">
            {showPalette && (
              <div className="absolute bottom-full left-0 right-0 mb-1 mx-3 max-h-64 overflow-y-auto rounded-lg border border-[#1a2a1a] bg-[#0a0a0a] shadow-xl">
                <div className="flex items-center justify-between px-3 py-2 border-b border-[#1a2a1a]">
                  <span className="text-xs font-medium text-white">Add Element</span>
                  <button onClick={() => setShowPalette(false)} className="text-[#7a8a7a] hover:text-white">
                    <X size={14} />
                  </button>
                </div>
                {ELEMENT_PALETTE.map((item) => (
                  <button
                    key={item.type}
                    onClick={() => handleAddElement(item)}
                    className="flex w-full items-center gap-2 px-3 py-1.5 text-xs text-[#7a8a7a] hover:bg-[#111111] hover:text-white transition"
                  >
                    <div className="h-2 w-2 rounded-full" style={{ backgroundColor: LAYER_CONFIG.find((l) => l.id === item.layer)?.color }} />
                    {item.label}
                    <span className="ml-auto text-[10px] text-[#3a4a3a]">{item.layer}</span>
                  </button>
                ))}
              </div>
            )}
            <button
              onClick={() => setShowPalette(!showPalette)}
              className="flex w-full items-center justify-center gap-2 rounded-md bg-[#00ff41] px-3 py-2 text-xs font-medium text-black hover:bg-[#00cc33] transition"
            >
              <Plus size={14} />
              Add Element
            </button>
          </div>}
        </>
      )}

      {sidebarPanel === 'togaf' && (
        <div className="flex-1 overflow-hidden">
          <TOGAF10Framework />
        </div>
      )}

      {sidebarPanel === 'analytics' && <AnalyticsPanel />}

      {sidebarPanel === 'governance' && <GovernancePanel />}

      {sidebarPanel === 'marketplace' && (
        <div className="flex-1 overflow-hidden">
          <TemplateMarketplace />
        </div>
      )}

      {sidebarPanel === 'copilot' && (
        <div className="flex-1 overflow-hidden">
          <AICopilot />
        </div>
      )}

      {/* Settings now has its own route at /settings */}
    </aside>
  );
}

const ANALYTICS_TABS = [
  { id: 'risk', label: 'Risk' },
  { id: 'impact', label: 'Impact' },
  { id: 'cost', label: 'Cost' },
  { id: 'monte', label: 'Simulate' },
  { id: 'scenario', label: 'Scenarios' },
  { id: 'capacity', label: 'Capacity' },
  { id: 'roadmap', label: 'Roadmap' },
] as const;

const GOVERNANCE_TABS = [
  { id: 'compliance', label: 'Compliance' },
  { id: 'approvals', label: 'Approvals' },
  { id: 'policies', label: 'Policies' },
  { id: 'audit', label: 'Audit' },
] as const;

function GovernancePanel() {
  const [tab, setTab] = useState<'compliance' | 'approvals' | 'policies' | 'audit'>('compliance');

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      <div className="flex border-b border-[#1a2a1a]">
        {GOVERNANCE_TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex-1 px-1 py-2 text-[10px] font-medium transition ${
              tab === t.id
                ? 'text-white border-b-2 border-[#00ff41]'
                : 'text-[#4a5a4a] hover:text-[#7a8a7a]'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div className="flex-1 overflow-hidden">
        {tab === 'compliance' && <ComplianceDashboard />}
        {tab === 'approvals' && <ApprovalWorkflow />}
        {tab === 'policies' && <PolicyManager />}
        {tab === 'audit' && <AuditTrail />}
      </div>
    </div>
  );
}

function AnalyticsPanel() {
  const [tab, setTab] = useState<'risk' | 'impact' | 'cost' | 'monte' | 'scenario' | 'capacity' | 'roadmap'>('risk');

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      <div className="flex border-b border-[#1a2a1a]">
        {ANALYTICS_TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex-1 px-1 py-2 text-[10px] font-medium transition ${
              tab === t.id
                ? 'text-white border-b-2 border-[#00ff41]'
                : 'text-[#4a5a4a] hover:text-[#7a8a7a]'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div className="flex-1 overflow-hidden">
        {tab === 'risk' && <RiskDashboard />}
        {tab === 'impact' && <ImpactAnalysis />}
        {tab === 'cost' && <CostOptimization />}
        {tab === 'monte' && <MonteCarloSimulation />}
        {tab === 'scenario' && <SimulationPanel />}
        {tab === 'capacity' && <CapacityPlanning />}
        {tab === 'roadmap' && <RoadmapPanel />}
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
      <div className="flex items-center gap-1 rounded px-1 py-1 hover:bg-[#0a0a0a]">
        <button onClick={() => setIsOpen(!isOpen)} className="text-[#7a8a7a]">
          {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </button>
        <div className="h-2 w-2 rounded-full" style={{ backgroundColor: layer.color }} />
        <span className="flex-1 text-xs font-medium text-[#e0e0e0]">{layer.label}</span>
        <span className="text-[10px] text-[#4a5a4a] mr-1">{layer.elements.length}</span>
        <button onClick={onToggleVisibility} className="text-[#7a8a7a] hover:text-white">
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
                  : 'text-[#7a8a7a] hover:bg-[#0a0a0a] hover:text-white'
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
