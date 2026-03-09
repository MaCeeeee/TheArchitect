import { useState } from 'react';
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
import CapacityPlanning from '../simulation/CapacityPlanning';
import MonteCarloSimulation from '../simulation/MonteCarloSimulation';
import TemplateMarketplace from '../marketplace/TemplateMarketplace';
import AICopilot from '../copilot/AICopilot';

const LAYER_CONFIG = [
  { id: 'strategy', label: 'Strategy', color: '#ef4444' },
  { id: 'business', label: 'Business', color: '#22c55e' },
  { id: 'information', label: 'Information', color: '#3b82f6' },
  { id: 'application', label: 'Application', color: '#f97316' },
  { id: 'technology', label: 'Technology', color: '#a855f7' },
];

const ELEMENT_PALETTE: { type: string; label: string; layer: ArchitectureElement['layer']; togafDomain: ArchitectureElement['togafDomain'] }[] = [
  { type: 'business_capability', label: 'Business Capability', layer: 'business', togafDomain: 'business' },
  { type: 'process', label: 'Business Process', layer: 'business', togafDomain: 'business' },
  { type: 'value_stream', label: 'Value Stream', layer: 'business', togafDomain: 'business' },
  { type: 'business_service', label: 'Business Service', layer: 'business', togafDomain: 'business' },
  { type: 'application', label: 'Application', layer: 'application', togafDomain: 'application' },
  { type: 'application_component', label: 'App Component', layer: 'application', togafDomain: 'application' },
  { type: 'application_service', label: 'App Service', layer: 'application', togafDomain: 'application' },
  { type: 'data_entity', label: 'Data Entity', layer: 'information', togafDomain: 'data' },
  { type: 'data_model', label: 'Data Model', layer: 'information', togafDomain: 'data' },
  { type: 'technology_component', label: 'Tech Component', layer: 'technology', togafDomain: 'technology' },
  { type: 'infrastructure', label: 'Infrastructure', layer: 'technology', togafDomain: 'technology' },
  { type: 'platform_service', label: 'Platform Service', layer: 'technology', togafDomain: 'technology' },
];

const LAYER_Y: Record<string, number> = { strategy: 12, business: 8, information: 4, application: 0, technology: -4 };

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
  const [searchQuery, setSearchQuery] = useState('');
  const [showPalette, setShowPalette] = useState(false);
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
    if (el) flyToElement(el.position3D);
  };

  return (
    <aside className="flex h-full w-64 flex-col border-r border-[#334155] bg-[#1e293b]">
      {/* Navigation tabs */}
      <div className="flex border-b border-[#334155]">
        {NAV_ITEMS.map((item) => (
          <button
            key={item.id}
            onClick={() => setSidebarPanel(item.id as typeof sidebarPanel)}
            className={`flex-1 flex items-center justify-center p-2.5 transition ${
              sidebarPanel === item.id
                ? 'text-[#7c3aed] border-b-2 border-[#7c3aed]'
                : 'text-[#94a3b8] hover:text-white'
            }`}
            title={item.label}
          >
            <item.icon size={16} />
          </button>
        ))}
      </div>

      {sidebarPanel === 'explorer' && (
        <>
          {/* Search */}
          <div className="p-3">
            <div className="flex items-center gap-2 rounded-md bg-[#0f172a] px-3 py-1.5">
              <Search size={14} className="text-[#94a3b8]" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search elements..."
                className="flex-1 bg-transparent text-xs text-white placeholder:text-[#64748b] outline-none"
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

          {/* Add element button + palette */}
          <div className="border-t border-[#334155] p-3 relative">
            {showPalette && (
              <div className="absolute bottom-full left-0 right-0 mb-1 mx-3 max-h-64 overflow-y-auto rounded-lg border border-[#334155] bg-[#0f172a] shadow-xl">
                <div className="flex items-center justify-between px-3 py-2 border-b border-[#334155]">
                  <span className="text-xs font-medium text-white">Add Element</span>
                  <button onClick={() => setShowPalette(false)} className="text-[#94a3b8] hover:text-white">
                    <X size={14} />
                  </button>
                </div>
                {ELEMENT_PALETTE.map((item) => (
                  <button
                    key={item.type}
                    onClick={() => handleAddElement(item)}
                    className="flex w-full items-center gap-2 px-3 py-1.5 text-xs text-[#94a3b8] hover:bg-[#1e293b] hover:text-white transition"
                  >
                    <div className="h-2 w-2 rounded-full" style={{ backgroundColor: LAYER_CONFIG.find((l) => l.id === item.layer)?.color }} />
                    {item.label}
                    <span className="ml-auto text-[10px] text-[#475569]">{item.layer}</span>
                  </button>
                ))}
              </div>
            )}
            <button
              onClick={() => setShowPalette(!showPalette)}
              className="flex w-full items-center justify-center gap-2 rounded-md bg-[#7c3aed] px-3 py-2 text-xs font-medium text-white hover:bg-[#6d28d9] transition"
            >
              <Plus size={14} />
              Add Element
            </button>
          </div>
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

      {sidebarPanel === 'settings' && <SettingsPanel />}
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
      <div className="flex border-b border-[#334155]">
        {GOVERNANCE_TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex-1 px-1 py-2 text-[10px] font-medium transition ${
              tab === t.id
                ? 'text-white border-b-2 border-[#7c3aed]'
                : 'text-[#64748b] hover:text-[#94a3b8]'
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
  const [tab, setTab] = useState<'risk' | 'impact' | 'cost' | 'monte' | 'scenario' | 'capacity'>('risk');

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      <div className="flex border-b border-[#334155]">
        {ANALYTICS_TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex-1 px-1 py-2 text-[10px] font-medium transition ${
              tab === t.id
                ? 'text-white border-b-2 border-[#7c3aed]'
                : 'text-[#64748b] hover:text-[#94a3b8]'
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
        {tab === 'scenario' && <ScenarioComparison />}
        {tab === 'capacity' && <CapacityPlanning />}
      </div>
    </div>
  );
}

function SettingsPanel() {
  const { viewMode, setViewMode, showMinimap, toggleMinimap } = useUIStore();

  return (
    <div className="flex-1 overflow-y-auto p-3 space-y-3">
      <h4 className="text-[10px] font-semibold uppercase text-[#64748b]">Display</h4>
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-[10px] text-[#94a3b8]">View Mode</span>
          <select
            value={viewMode}
            onChange={(e) => setViewMode(e.target.value as '3d' | '2d-topdown' | 'layer')}
            className="bg-[#0f172a] border border-[#334155] rounded px-2 py-0.5 text-[10px] text-white outline-none"
          >
            <option value="3d">3D</option>
            <option value="2d-topdown">2D Top-Down</option>
            <option value="layer">Layer View</option>
          </select>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-[10px] text-[#94a3b8]">Minimap</span>
          <button onClick={toggleMinimap} className={`text-[10px] px-2 py-0.5 rounded ${showMinimap ? 'bg-[#7c3aed] text-white' : 'bg-[#334155] text-[#64748b]'}`}>
            {showMinimap ? 'On' : 'Off'}
          </button>
        </div>
      </div>

      <h4 className="text-[10px] font-semibold uppercase text-[#64748b] pt-2 border-t border-[#334155]">About</h4>
      <div className="text-[10px] text-[#64748b] space-y-1">
        <p><span className="text-white">TheArchitect</span> v0.1.0</p>
        <p>Enterprise Architecture Management</p>
        <p>TOGAF 10 Compliant</p>
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
      <div className="flex items-center gap-1 rounded px-1 py-1 hover:bg-[#0f172a]">
        <button onClick={() => setIsOpen(!isOpen)} className="text-[#94a3b8]">
          {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </button>
        <div className="h-2 w-2 rounded-full" style={{ backgroundColor: layer.color }} />
        <span className="flex-1 text-xs font-medium text-[#f1f5f9]">{layer.label}</span>
        <span className="text-[10px] text-[#64748b] mr-1">{layer.elements.length}</span>
        <button onClick={onToggleVisibility} className="text-[#94a3b8] hover:text-white">
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
                  ? 'bg-[#7c3aed]/20 text-[#a78bfa]'
                  : 'text-[#94a3b8] hover:bg-[#0f172a] hover:text-white'
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
