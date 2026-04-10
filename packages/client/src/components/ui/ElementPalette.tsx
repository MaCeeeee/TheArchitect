import { useState, useMemo, useRef, useEffect } from 'react';
import {
  Search, Star, Clock, ChevronRight, ChevronDown, X, AlertTriangle,
  Box, Circle, Cylinder, Diamond, Triangle, Octagon, Plus, Zap, Layers,
} from 'lucide-react';
import { useUIStore } from '../../stores/uiStore';
import { useArchitectureStore } from '../../stores/architectureStore';
import {
  ELEMENT_CATEGORIES,
  ASPECT_LABELS,
  ASPECT_ORDER,
  CATEGORY_BY_TYPE,
  type ArchiMateAspect,
  type ElementCategoryInfo,
} from '@thearchitect/shared/src/constants/archimate-categories';
import { ARCHITECTURE_LAYERS, LAYER_Y } from '@thearchitect/shared/src/constants/togaf.constants';
import { VIEWPOINT_BY_ID } from '@thearchitect/shared/src/constants/archimate-viewpoints';
import type { ArchitectureLayer, ElementType, TOGAFDomain } from '@thearchitect/shared/src/types/architecture.types';

// ──────────────────────────────────────────────────────────
// Geometry → Icon mapping
// ──��─────────────────────��─────────────────────────────────
const GEOMETRY_ICONS: Record<string, typeof Box> = {
  box: Box,
  sphere: Circle,
  cylinder: Cylinder,
  octahedron: Octagon,
  diamond: Diamond,
  cone: Triangle,
};

function GeometryIcon({ geometry, color, size = 14 }: { geometry: string; color: string; size?: number }) {
  const Icon = GEOMETRY_ICONS[geometry] || Box;
  return <Icon size={size} style={{ color }} />;
}

// ──────────────────────────────────────────────────────────
// Group elements by layer → aspect
// ──────────────────────────────────��───────────────────────
interface LayerGroup {
  layer: ArchitectureLayer;
  label: string;
  color: string;
  aspects: { aspect: ArchiMateAspect; label: string; items: ElementCategoryInfo[] }[];
  totalCount: number;
}

function groupByLayerAndAspect(items: ElementCategoryInfo[]): LayerGroup[] {
  return ARCHITECTURE_LAYERS.map(layer => {
    const layerItems = items.filter(i => i.layer === layer.id);
    const aspects = ASPECT_ORDER
      .map(aspect => ({
        aspect,
        label: ASPECT_LABELS[aspect],
        items: layerItems.filter(i => i.aspect === aspect),
      }))
      .filter(a => a.items.length > 0);

    return {
      layer: layer.id,
      label: layer.label,
      color: layer.color,
      aspects,
      totalCount: layerItems.length,
    };
  }).filter(g => g.totalCount > 0);
}

// ──────────────────────────────────────────────────────────
// Domain→Layer mapping (for addElement compatibility)
// ─────────────────────────���────────────────────────────────
const LAYER_TO_DOMAIN: Partial<Record<ArchitectureLayer, TOGAFDomain>> = {
  strategy: 'strategy',
  business: 'business',
  information: 'data',
  application: 'application',
  technology: 'technology',
  physical: 'technology',
  motivation: 'motivation',
  implementation_migration: 'implementation',
};

// ────────────────────────────��─────────────────────────────
// Geometry lookup from ELEMENT_TYPES
// ��─────────────────────────────────────────────────────────
import { ELEMENT_TYPES } from '@thearchitect/shared/src/constants/togaf.constants';
const GEOMETRY_BY_TYPE: Record<string, string> = Object.fromEntries(
  ELEMENT_TYPES.map(et => [et.type, et.geometry])
);

// ──────────────────────────────────────────────────────────
// Quick Start — common types for beginners
// ──────────────────────────────────────────────────────────
const QUICK_START_TYPES: ElementType[] = [
  'application',
  'application_service',
  'process',
  'business_actor',
  'data_object',
  'node',
  'application_component',
  'business_service',
  'system_software',
  'device',
  'business_capability',
  'artifact',
];

// ──────────────────────────────────────────────────────────
// Starter Templates — create multiple elements + connections
// ──────────────────────────────────────────────────────────
export interface StarterTemplate {
  id: string;
  name: string;
  description: string;
  elements: { type: ElementType; layer: ArchitectureLayer; domain: TOGAFDomain; name: string }[];
  connections: [number, number, string][]; // [fromIdx, toIdx, relationshipType]
}

export const STARTER_TEMPLATES: StarterTemplate[] = [
  {
    id: 'web-app-stack',
    name: 'Web Application Stack',
    description: 'Frontend + Backend API + Database + Server',
    elements: [
      { type: 'application', layer: 'application', domain: 'application', name: 'Frontend App' },
      { type: 'application_service', layer: 'application', domain: 'application', name: 'Backend API' },
      { type: 'data_object', layer: 'application', domain: 'data', name: 'Database' },
      { type: 'node', layer: 'technology', domain: 'technology', name: 'Server' },
    ],
    connections: [[0, 1, 'serving'], [1, 2, 'access'], [1, 3, 'serving']],
  },
  {
    id: 'business-process',
    name: 'Business Process',
    description: 'Process + Actor + Service + Business Object',
    elements: [
      { type: 'process', layer: 'business', domain: 'business', name: 'Core Process' },
      { type: 'business_actor', layer: 'business', domain: 'business', name: 'Process Owner' },
      { type: 'business_service', layer: 'business', domain: 'business', name: 'Business Service' },
      { type: 'business_object', layer: 'business', domain: 'business', name: 'Business Object' },
    ],
    connections: [[1, 0, 'assignment'], [0, 2, 'realization'], [0, 3, 'access']],
  },
  {
    id: 'api-microservice',
    name: 'API Microservice',
    description: 'API + Service + Database + Container',
    elements: [
      { type: 'application_interface', layer: 'application', domain: 'application', name: 'API Endpoint' },
      { type: 'application_component', layer: 'application', domain: 'application', name: 'Microservice' },
      { type: 'data_object', layer: 'application', domain: 'data', name: 'Data Store' },
      { type: 'system_software', layer: 'technology', domain: 'technology', name: 'Container' },
    ],
    connections: [[0, 1, 'serving'], [1, 2, 'access'], [1, 3, 'serving']],
  },
];

// ──────────────────────────────────────────────────────────
// Main Component
// ──────────────────────────────────────────────────────────
interface ElementPaletteProps {
  onAddElement: (type: ElementType, layer: ArchitectureLayer, domain: TOGAFDomain) => void;
  onAddTemplate?: (template: StarterTemplate) => void;
}

export default function ElementPalette({ onAddElement, onAddTemplate }: ElementPaletteProps) {
  const searchRef = useRef<HTMLInputElement>(null);
  const paletteSearch = useUIStore(s => s.paletteSearch);
  const setPaletteSearch = useUIStore(s => s.setPaletteSearch);
  const recentTypes = useUIStore(s => s.recentTypes);
  const favoriteTypes = useUIStore(s => s.favoriteTypes);
  const toggleFavoriteType = useUIStore(s => s.toggleFavoriteType);
  const addRecentType = useUIStore(s => s.addRecentType);
  const focusedLayer = useUIStore(s => s.focusedLayer);
  const activeViewpoint = useUIStore(s => s.activeViewpoint);
  const elements = useArchitectureStore(s => s.elements);

  const [expandedLayers, setExpandedLayers] = useState<Set<string>>(new Set([focusedLayer]));

  // Auto-expand focused layer when it changes
  useEffect(() => {
    setExpandedLayers(prev => new Set(prev).add(focusedLayer));
  }, [focusedLayer]);

  // Viewpoint-allowed types (null = all allowed)
  const viewpointTypes = useMemo(() => {
    if (!activeViewpoint) return null;
    const vp = VIEWPOINT_BY_ID.get(activeViewpoint);
    return vp ? new Set(vp.allowedElementTypes) : null;
  }, [activeViewpoint]);

  // Filter by search + viewpoint
  const filteredItems = useMemo(() => {
    let items = ELEMENT_CATEGORIES as ElementCategoryInfo[];
    // Apply viewpoint filter
    if (viewpointTypes) {
      items = items.filter(item => viewpointTypes.has(item.type));
    }
    // Apply search filter
    if (paletteSearch.trim()) {
      const q = paletteSearch.toLowerCase();
      items = items.filter(item =>
        item.type.toLowerCase().includes(q) ||
        GEOMETRY_BY_TYPE[item.type]?.toLowerCase().includes(q) ||
        item.description.toLowerCase().includes(q) ||
        item.keywords.some(k => k.toLowerCase().includes(q)) ||
        item.layer.toLowerCase().includes(q) ||
        ASPECT_LABELS[item.aspect].toLowerCase().includes(q)
      );
    }
    return items;
  }, [paletteSearch, viewpointTypes]);

  const groups = useMemo(() => groupByLayerAndAspect(filteredItems), [filteredItems]);
  const isSearching = paletteSearch.trim().length > 0;

  // When searching, expand all groups with results
  const effectiveExpanded = isSearching
    ? new Set(groups.map(g => g.layer))
    : expandedLayers;

  const toggleLayer = (layer: string) => {
    if (isSearching) return;
    setExpandedLayers(prev => {
      const next = new Set(prev);
      next.has(layer) ? next.delete(layer) : next.add(layer);
      return next;
    });
  };

  const handleAdd = (item: ElementCategoryInfo) => {
    const domain = (LAYER_TO_DOMAIN[item.layer] || 'application') as TOGAFDomain;
    addRecentType(item.type);
    onAddElement(item.type, item.layer, domain);
  };

  // Favorites section
  const favItems = favoriteTypes
    .map(t => CATEGORY_BY_TYPE.get(t))
    .filter(Boolean) as ElementCategoryInfo[];
  const showFavorites = favItems.length > 0 && !isSearching;

  // Recent section
  const recentItems = recentTypes
    .map(t => CATEGORY_BY_TYPE.get(t))
    .filter(Boolean) as ElementCategoryInfo[];
  const showRecent = recentItems.length > 0 && !isSearching;

  // Quick Start — shown when few elements and no favorites (beginner mode)
  const showQuickStart = elements.length < 5 && favItems.length === 0 && !isSearching;
  const quickStartItems = QUICK_START_TYPES
    .map(t => CATEGORY_BY_TYPE.get(t))
    .filter(Boolean) as ElementCategoryInfo[];

  return (
    <div className="flex flex-col border-t border-[var(--border-subtle)] bg-[var(--surface-base)] max-h-[50vh]">
      {/* Search Bar */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-[var(--border-subtle)]">
        <Search size={13} className="text-[var(--text-tertiary)] shrink-0" />
        <input
          ref={searchRef}
          type="text"
          value={paletteSearch}
          onChange={e => setPaletteSearch(e.target.value)}
          placeholder="Search elements... (type, layer, keyword)"
          className="flex-1 bg-transparent text-xs text-white placeholder:text-[var(--text-tertiary)] outline-none"
        />
        {paletteSearch && (
          <button onClick={() => setPaletteSearch('')} className="text-[var(--text-tertiary)] hover:text-white">
            <X size={12} />
          </button>
        )}
        <span className="text-[10px] text-[var(--text-disabled)]">{filteredItems.length}</span>
      </div>

      {/* Scrollable Content */}
      <div className="flex-1 overflow-y-auto">
        {/* Quick Start — shown for beginners */}
        {showQuickStart && (
          <>
            {/* Starter Templates */}
            {onAddTemplate && (
              <div className="border-b border-[var(--border-subtle)]">
                <div className="flex items-center gap-1.5 px-3 py-1.5">
                  <Layers size={11} className="text-[var(--status-purple)]" />
                  <span className="text-[9px] font-medium uppercase tracking-wider text-[var(--text-disabled)]">Starter Templates</span>
                </div>
                {STARTER_TEMPLATES.map(tpl => (
                  <button
                    key={tpl.id}
                    onClick={() => onAddTemplate(tpl)}
                    className="w-full flex items-center gap-2 px-3 py-1.5 hover:bg-[var(--surface-raised)] transition text-left group"
                  >
                    <div className="flex items-center justify-center w-5 h-5 rounded bg-[var(--status-purple)]/15 text-[var(--status-purple)] shrink-0">
                      <Zap size={10} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <span className="text-[11px] text-[var(--text-secondary)] group-hover:text-white block truncate">{tpl.name}</span>
                      <span className="text-[9px] text-[var(--text-disabled)] block truncate">{tpl.description}</span>
                    </div>
                    <Plus size={10} className="text-[var(--text-disabled)] group-hover:text-[var(--accent-default)] shrink-0" />
                  </button>
                ))}
              </div>
            )}
            {/* Common Types */}
            <QuickSection
              icon={<Zap size={11} className="text-[#00ff41]" />}
              label="Quick Start"
              items={quickStartItems}
              favoriteTypes={favoriteTypes}
              onAdd={handleAdd}
              onToggleFav={toggleFavoriteType}
            />
          </>
        )}

        {/* Favorites */}
        {showFavorites && (
          <QuickSection
            icon={<Star size={11} className="text-amber-400" />}
            label="Favorites"
            items={favItems}
            favoriteTypes={favoriteTypes}
            onAdd={handleAdd}
            onToggleFav={toggleFavoriteType}
          />
        )}

        {/* Recent */}
        {showRecent && (
          <QuickSection
            icon={<Clock size={11} className="text-[var(--text-tertiary)]" />}
            label="Recently Used"
            items={recentItems}
            favoriteTypes={favoriteTypes}
            onAdd={handleAdd}
            onToggleFav={toggleFavoriteType}
          />
        )}

        {/* Layer Groups */}
        {groups.map(group => (
          <div key={group.layer}>
            {/* Layer Header */}
            <button
              onClick={() => toggleLayer(group.layer)}
              className="flex w-full items-center gap-2 px-3 py-1.5 text-left hover:bg-[var(--surface-raised)] transition"
            >
              <div className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: group.color }} />
              {effectiveExpanded.has(group.layer)
                ? <ChevronDown size={12} className="text-[var(--text-tertiary)]" />
                : <ChevronRight size={12} className="text-[var(--text-tertiary)]" />
              }
              <span className="text-[11px] font-semibold text-white flex-1">{group.label}</span>
              <span className="text-[10px] text-[var(--text-disabled)]">{group.totalCount}</span>
            </button>

            {/* Aspects */}
            {effectiveExpanded.has(group.layer) && group.aspects.map(aspectGroup => (
              <div key={aspectGroup.aspect} className="pl-5">
                {/* Aspect Sub-Header (only if more than one aspect in this layer) */}
                {group.aspects.length > 1 && (
                  <div className="px-2 pt-1.5 pb-0.5">
                    <span className="text-[9px] font-medium uppercase tracking-wider text-[var(--text-disabled)]">
                      {aspectGroup.label}
                    </span>
                  </div>
                )}

                {/* Element Items */}
                {aspectGroup.items.map(item => (
                  <PaletteItem
                    key={item.type}
                    item={item}
                    layerColor={group.color}
                    isFavorite={favoriteTypes.includes(item.type)}
                    onAdd={() => handleAdd(item)}
                    onToggleFav={() => toggleFavoriteType(item.type)}
                  />
                ))}
              </div>
            ))}
          </div>
        ))}

        {filteredItems.length === 0 && (
          <div className="p-4 text-center text-xs text-[var(--text-tertiary)]">
            No elements match "{paletteSearch}"
          </div>
        )}
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────
// Quick Section (Favorites / Recent)
// ────────────────────���─────────────────────────────────────
function QuickSection({
  icon,
  label,
  items,
  favoriteTypes,
  onAdd,
  onToggleFav,
}: {
  icon: React.ReactNode;
  label: string;
  items: ElementCategoryInfo[];
  favoriteTypes: ElementType[];
  onAdd: (item: ElementCategoryInfo) => void;
  onToggleFav: (type: ElementType) => void;
}) {
  const layer = ARCHITECTURE_LAYERS.reduce<Record<string, string>>((acc, l) => {
    acc[l.id] = l.color;
    return acc;
  }, {});

  return (
    <div className="border-b border-[var(--border-subtle)]">
      <div className="flex items-center gap-1.5 px-3 py-1">
        {icon}
        <span className="text-[9px] font-medium uppercase tracking-wider text-[var(--text-disabled)]">{label}</span>
      </div>
      {items.map(item => (
        <PaletteItem
          key={item.type}
          item={item}
          layerColor={layer[item.layer] || '#64748b'}
          isFavorite={favoriteTypes.includes(item.type)}
          onAdd={() => onAdd(item)}
          onToggleFav={() => onToggleFav(item.type)}
          compact
        />
      ))}
    </div>
  );
}

// ──���─────────────���─────────────────────────────────────────
// Single Palette Item
// ───────────────��──────────────────────────────────────────
function PaletteItem({
  item,
  layerColor,
  isFavorite,
  onAdd,
  onToggleFav,
  compact,
}: {
  item: ElementCategoryInfo;
  layerColor: string;
  isFavorite: boolean;
  onAdd: () => void;
  onToggleFav: () => void;
  compact?: boolean;
}) {
  const geometry = GEOMETRY_BY_TYPE[item.type] || 'box';
  const label = ELEMENT_TYPES.find(et => et.type === item.type)?.label || item.type.replace(/_/g, ' ');

  return (
    <div className="group flex items-center gap-1.5 px-2 py-1 hover:bg-[var(--surface-raised)] transition cursor-pointer" title={item.description}>
      {/* Add button */}
      <button
        onClick={onAdd}
        className="flex items-center gap-1.5 flex-1 min-w-0 text-left"
      >
        <GeometryIcon geometry={geometry} color={layerColor} size={compact ? 12 : 14} />
        <span className="text-[11px] text-[var(--text-secondary)] group-hover:text-white truncate">
          {label}
        </span>
        {!item.standard && (
          <span className="shrink-0" title="Non-standard type">
            <AlertTriangle size={10} className="text-amber-500/60" />
          </span>
        )}
      </button>

      {/* Favorite toggle */}
      <button
        onClick={(e) => { e.stopPropagation(); onToggleFav(); }}
        className={`shrink-0 p-0.5 rounded transition ${
          isFavorite
            ? 'text-amber-400'
            : 'text-transparent group-hover:text-[var(--text-disabled)] hover:!text-amber-400'
        }`}
        title={isFavorite ? 'Remove from favorites' : 'Add to favorites'}
      >
        <Star size={10} fill={isFavorite ? 'currentColor' : 'none'} />
      </button>
    </div>
  );
}
