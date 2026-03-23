import { useState } from 'react';
import { Eye, Filter, CheckCircle2 } from 'lucide-react';
import { useArchitectureStore } from '../../stores/architectureStore';

interface ViewpointDef {
  id: string;
  name: string;
  description: string;
  domainFilter: string[];
  layerFilter: string[];
  icon: string;
  color: string;
}

const VIEWPOINTS: ViewpointDef[] = [
  {
    id: 'all', name: 'All Elements', description: 'Show all architecture elements across all layers',
    domainFilter: ['business', 'data', 'application', 'technology'],
    layerFilter: ['strategy', 'business', 'information', 'application', 'technology'],
    icon: 'grid', color: '#7a8a7a',
  },
  {
    id: 'business', name: 'Business View', description: 'Business capabilities, processes, value streams, and services',
    domainFilter: ['business'],
    layerFilter: ['strategy', 'business'],
    icon: 'briefcase', color: '#22c55e',
  },
  {
    id: 'data', name: 'Data Landscape', description: 'Data entities, models, and information flows',
    domainFilter: ['data'],
    layerFilter: ['information'],
    icon: 'database', color: '#3b82f6',
  },
  {
    id: 'application', name: 'Application Portfolio', description: 'Applications, components, and application services',
    domainFilter: ['application'],
    layerFilter: ['application'],
    icon: 'layout', color: '#f97316',
  },
  {
    id: 'technology', name: 'Technology Standards', description: 'Infrastructure, platforms, and technology components',
    domainFilter: ['technology'],
    layerFilter: ['technology'],
    icon: 'cpu', color: '#00ff41',
  },
  {
    id: 'migration', name: 'Migration View', description: 'Elements by status: current, target, transitional, retired',
    domainFilter: ['business', 'data', 'application', 'technology'],
    layerFilter: ['strategy', 'business', 'information', 'application', 'technology'],
    icon: 'arrow-right', color: '#eab308',
  },
];

interface Props {
  onViewpointChange?: (viewpoint: ViewpointDef) => void;
}

export default function ViewpointSelector({ onViewpointChange }: Props) {
  const [activeViewpoint, setActiveViewpoint] = useState('all');
  const elements = useArchitectureStore((s) => s.elements);
  const visibleLayers = useArchitectureStore((s) => s.visibleLayers);
  const toggleLayer = useArchitectureStore((s) => s.toggleLayer);

  const handleSelect = (viewpoint: ViewpointDef) => {
    setActiveViewpoint(viewpoint.id);

    // Update visible layers based on viewpoint
    const allLayers = ['strategy', 'business', 'information', 'application', 'technology'];
    for (const layer of allLayers) {
      const shouldBeVisible = viewpoint.layerFilter.includes(layer);
      const isVisible = visibleLayers.has(layer);
      if (shouldBeVisible !== isVisible) {
        toggleLayer(layer);
      }
    }

    onViewpointChange?.(viewpoint);
  };

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      <div className="p-3 border-b border-[var(--border-subtle)]">
        <h4 className="text-[10px] font-semibold uppercase text-[var(--text-tertiary)] flex items-center gap-1.5">
          <Eye size={12} />
          Viewpoints
        </h4>
      </div>

      <div className="p-2 space-y-1">
        {VIEWPOINTS.map((vp) => {
          const isActive = activeViewpoint === vp.id;
          const elementCount = vp.id === 'all'
            ? elements.length
            : vp.id === 'migration'
              ? elements.filter((el) => el.status !== 'current').length
              : elements.filter((el) => vp.domainFilter.includes(el.togafDomain)).length;

          return (
            <button
              key={vp.id}
              onClick={() => handleSelect(vp)}
              className={`flex w-full items-start gap-2 rounded-lg p-2 text-left transition ${
                isActive ? 'bg-[#00ff41]/10 border border-[#00ff41]/30' : 'hover:bg-[var(--surface-base)] border border-transparent'
              }`}
            >
              <div
                className="mt-0.5 h-3 w-3 rounded-sm shrink-0 flex items-center justify-center"
                style={{ backgroundColor: isActive ? vp.color : `${vp.color}40` }}
              >
                {isActive && <CheckCircle2 size={8} className="text-white" />}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between">
                  <span className={`text-xs font-medium ${isActive ? 'text-white' : 'text-[var(--text-secondary)]'}`}>
                    {vp.name}
                  </span>
                  <span className="text-[10px] text-[var(--text-disabled)]">{elementCount}</span>
                </div>
                <p className="text-[10px] text-[var(--text-tertiary)] mt-0.5">{vp.description}</p>
              </div>
            </button>
          );
        })}
      </div>

      {/* Active filters */}
      <div className="mt-auto border-t border-[var(--border-subtle)] p-3">
        <div className="flex items-center gap-1.5 mb-1.5">
          <Filter size={12} className="text-[var(--text-tertiary)]" />
          <span className="text-[10px] font-semibold uppercase text-[var(--text-tertiary)]">Active Layers</span>
        </div>
        <div className="flex flex-wrap gap-1">
          {['strategy', 'business', 'information', 'application', 'technology'].map((layer) => (
            <span
              key={layer}
              className={`text-[9px] px-1.5 py-0.5 rounded-full capitalize ${
                visibleLayers.has(layer) ? 'bg-[#1a2a1a] text-white' : 'bg-[var(--surface-base)] text-[var(--text-disabled)]'
              }`}
            >
              {layer}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
