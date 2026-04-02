/**
 * Smart Patterns — Context-aware architecture suggestions.
 *
 * Analyzes the current canvas and suggests missing elements/connections
 * based on ArchiMate best practices. Each suggestion is one-click actionable
 * and wires into existing elements.
 */
import { useMemo, useState, useEffect, useCallback } from 'react';
import {
  Sparkles, Server, Globe, Database, Target, Shield,
  Workflow, Link2, Check, ChevronDown, ChevronRight,
  AlertTriangle, Zap, Bookmark, Play, Trash2,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { useArchitectureStore, type ArchitectureElement } from '../../stores/architectureStore';
import type { Connection } from '../../stores/architectureStore';
import { LAYER_Y, ELEMENT_TYPES } from '@thearchitect/shared/src/constants/togaf.constants';
import type { ElementType, ArchitectureLayer, TOGAFDomain } from '@thearchitect/shared/src/types/architecture.types';
import {
  loadCustomPatterns,
  deleteCustomPattern,
  instantiatePattern,
  type CustomPattern,
} from '../../utils/patternUtils';

// ──────────────────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────────────────
interface Suggestion {
  id: string;
  icon: typeof Server;
  title: string;
  description: string;
  priority: 'high' | 'medium' | 'low';
  /** Elements that triggered this suggestion */
  triggerElements: ArchitectureElement[];
  /** What gets created on apply */
  additions: {
    elements: Array<{
      type: ElementType;
      name: string;
      layer: ArchitectureLayer;
      domain: TOGAFDomain;
      /** Offset from trigger element position */
      offsetX: number;
      offsetZ: number;
    }>;
    connections: Array<{
      /** Index in additions.elements or 'trigger:N' for trigger element */
      sourceRef: string;
      targetRef: string;
      type: string;
    }>;
  };
}

const PRIORITY_ORDER = { high: 0, medium: 1, low: 2 };

// ──────────────────────────────────────────────────────────
// Analysis rules
// ──────────────────────────────────────────────────────────

function analyzeCanvas(
  elements: ArchitectureElement[],
  connections: Connection[],
): Suggestion[] {
  const suggestions: Suggestion[] = [];
  const connSet = new Set(connections.flatMap(c => [c.sourceId, c.targetId]));
  const typeSet = new Set(elements.map(e => e.type));
  const layerSet = new Set(elements.map(e => e.layer));

  const byType = (type: string) => elements.filter(e => e.type === type);
  const byLayer = (layer: ArchitectureLayer) => elements.filter(e => e.layer === layer);
  const connectedTo = (elId: string) =>
    connections.filter(c => c.sourceId === elId || c.targetId === elId);

  // ── Rule 1: App components without technology ──────────
  const appComponents = byType('application_component');
  const techTypes = new Set(['node', 'device', 'system_software', 'technology_service']);
  const appsWithoutTech = appComponents.filter(app => {
    const conns = connectedTo(app.id);
    return !conns.some(c => {
      const otherId = c.sourceId === app.id ? c.targetId : c.sourceId;
      const other = elements.find(e => e.id === otherId);
      return other && techTypes.has(other.type);
    });
  });

  if (appsWithoutTech.length > 0) {
    suggestions.push({
      id: 'missing-tech-stack',
      icon: Server,
      title: 'Missing Technology Layer',
      description: `${appsWithoutTech.length} application component${appsWithoutTech.length > 1 ? 's' : ''} without infrastructure. Add Node + System Software for each.`,
      priority: 'high',
      triggerElements: appsWithoutTech.slice(0, 3),
      additions: {
        elements: [
          { type: 'node' as ElementType, name: 'Application Server', layer: 'technology', domain: 'technology', offsetX: 0, offsetZ: 4 },
          { type: 'system_software' as ElementType, name: 'Runtime Environment', layer: 'technology', domain: 'technology', offsetX: 3, offsetZ: 4 },
        ],
        connections: [
          { sourceRef: 'new:0', targetRef: 'new:1', type: 'composition' },
          { sourceRef: 'trigger:0', targetRef: 'new:0', type: 'assignment' },
        ],
      },
    });
  }

  // ── Rule 2: Business processes without serving applications ──
  const bizProcesses = byType('business_process');
  const bizWithoutApp = bizProcesses.filter(bp => {
    const conns = connectedTo(bp.id);
    return !conns.some(c => {
      const otherId = c.sourceId === bp.id ? c.targetId : c.sourceId;
      const other = elements.find(e => e.id === otherId);
      return other && other.layer === 'application';
    });
  });

  if (bizWithoutApp.length > 0) {
    suggestions.push({
      id: 'biz-without-app',
      icon: Workflow,
      title: 'Business Process without Application Support',
      description: `${bizWithoutApp.length} business process${bizWithoutApp.length > 1 ? 'es' : ''} not supported by any application. Add an Application Service.`,
      priority: 'high',
      triggerElements: bizWithoutApp.slice(0, 3),
      additions: {
        elements: [
          { type: 'application_service' as ElementType, name: 'Supporting Service', layer: 'application', domain: 'application', offsetX: 0, offsetZ: 4 },
        ],
        connections: [
          { sourceRef: 'new:0', targetRef: 'trigger:0', type: 'serving' },
        ],
      },
    });
  }

  // ── Rule 3: Application components without interfaces ──────
  const appsWithoutInterface = appComponents.filter(app => {
    const conns = connectedTo(app.id);
    return !conns.some(c => {
      const otherId = c.sourceId === app.id ? c.targetId : c.sourceId;
      const other = elements.find(e => e.id === otherId);
      return other && other.type === 'application_interface';
    });
  });

  if (appsWithoutInterface.length > 0 && appComponents.length > 1) {
    suggestions.push({
      id: 'missing-interfaces',
      icon: Globe,
      title: 'Applications without Interfaces',
      description: `${appsWithoutInterface.length} application${appsWithoutInterface.length > 1 ? 's' : ''} have no exposed interface. Add an API/UI Interface for communication.`,
      priority: 'medium',
      triggerElements: appsWithoutInterface.slice(0, 3),
      additions: {
        elements: [
          { type: 'application_interface' as ElementType, name: 'API Interface', layer: 'application', domain: 'application', offsetX: -3, offsetZ: 0 },
        ],
        connections: [
          { sourceRef: 'trigger:0', targetRef: 'new:0', type: 'composition' },
        ],
      },
    });
  }

  // ── Rule 4: Data objects missing ──────────────────────────
  if (appComponents.length > 0 && !typeSet.has('data_object') && !typeSet.has('artifact')) {
    suggestions.push({
      id: 'missing-data-layer',
      icon: Database,
      title: 'No Data Objects',
      description: 'Applications exist but no data objects are modeled. Add data objects to document what data is processed.',
      priority: 'medium',
      triggerElements: appComponents.slice(0, 2),
      additions: {
        elements: [
          { type: 'data_object' as ElementType, name: 'Business Data', layer: 'application', domain: 'data', offsetX: 3, offsetZ: 0 },
        ],
        connections: [
          { sourceRef: 'trigger:0', targetRef: 'new:0', type: 'access' },
        ],
      },
    });
  }

  // ── Rule 5: No motivation layer ────────────────────────────
  if ((layerSet.has('business') || layerSet.has('application')) && !layerSet.has('motivation')) {
    suggestions.push({
      id: 'missing-motivation',
      icon: Target,
      title: 'No Motivation Layer',
      description: 'Architecture has no documented drivers, goals, or requirements. Add motivation to justify architectural decisions.',
      priority: 'medium',
      triggerElements: byLayer('business').slice(0, 1).concat(byLayer('application').slice(0, 1)),
      additions: {
        elements: [
          { type: 'goal' as ElementType, name: 'Business Goal', layer: 'motivation', domain: 'motivation', offsetX: 0, offsetZ: -8 },
          { type: 'requirement' as ElementType, name: 'Key Requirement', layer: 'motivation', domain: 'motivation', offsetX: 4, offsetZ: -8 },
        ],
        connections: [
          { sourceRef: 'new:0', targetRef: 'new:1', type: 'aggregation' },
        ],
      },
    });
  }

  // ── Rule 6: Isolated elements ──────────────────────────────
  const isolated = elements.filter(e => !connSet.has(e.id) && e.type !== 'grouping' && e.type !== 'location');
  if (isolated.length > 2) {
    suggestions.push({
      id: 'isolated-elements',
      icon: Link2,
      title: `${isolated.length} Isolated Elements`,
      description: 'Multiple elements have no connections. Press C to enter connection mode and link them.',
      priority: 'high',
      triggerElements: isolated.slice(0, 4),
      additions: { elements: [], connections: [] },
    });
  }

  // ── Rule 7: Multiple apps without integration ──────────────
  if (appComponents.length >= 3) {
    const appPairs = appComponents.flatMap((a, i) =>
      appComponents.slice(i + 1).map(b => [a, b] as const)
    );
    const unlinkedPairs = appPairs.filter(([a, b]) =>
      !connections.some(c =>
        (c.sourceId === a.id && c.targetId === b.id) ||
        (c.sourceId === b.id && c.targetId === a.id)
      )
    );
    if (unlinkedPairs.length > appPairs.length * 0.6) {
      suggestions.push({
        id: 'missing-integration',
        icon: Zap,
        title: 'Missing Application Integration',
        description: `Most applications aren't connected. Consider adding flow or serving relationships to model data/service exchange.`,
        priority: 'medium',
        triggerElements: appComponents.slice(0, 3),
        additions: { elements: [], connections: [] },
      });
    }
  }

  // ── Rule 8: No strategy layer ──────────────────────────────
  if (layerSet.has('business') && !layerSet.has('strategy') && elements.length >= 5) {
    suggestions.push({
      id: 'missing-strategy',
      icon: Shield,
      title: 'No Strategy Layer',
      description: 'Business elements exist but no capabilities or resources are defined. Add strategy elements for long-term planning.',
      priority: 'low',
      triggerElements: byLayer('business').slice(0, 2),
      additions: {
        elements: [
          { type: 'business_capability' as ElementType, name: 'Core Capability', layer: 'strategy', domain: 'strategy', offsetX: 0, offsetZ: -4 },
          { type: 'resource' as ElementType, name: 'Key Resource', layer: 'strategy', domain: 'strategy', offsetX: 4, offsetZ: -4 },
        ],
        connections: [
          { sourceRef: 'new:0', targetRef: 'new:1', type: 'association' },
        ],
      },
    });
  }

  return suggestions.sort((a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority]);
}

// ──────────────────────────────────────────────────────────
// Component
// ──────────────────────────────────────────────────────────

export default function PatternCatalog() {
  const elements = useArchitectureStore(s => s.elements);
  const connections = useArchitectureStore(s => s.connections);
  const addElement = useArchitectureStore(s => s.addElement);
  const addConnection = useArchitectureStore(s => s.addConnection);
  const importElements = useArchitectureStore(s => s.importElements);
  const projectId = useArchitectureStore(s => s.projectId);
  const [applied, setApplied] = useState<Set<string>>(new Set());
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [customPatterns, setCustomPatterns] = useState<CustomPattern[]>(loadCustomPatterns);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [myPatternsOpen, setMyPatternsOpen] = useState(true);

  // Listen for cross-component pattern changes (from SelectionActionBar)
  useEffect(() => {
    const handler = () => setCustomPatterns(loadCustomPatterns());
    window.addEventListener('custom-patterns-changed', handler);
    return () => window.removeEventListener('custom-patterns-changed', handler);
  }, []);

  const handleInstantiateCustom = useCallback((pattern: CustomPattern) => {
    if (!projectId) { toast.error('Open a project first'); return; }
    // Compute drop position: centroid of existing elements + offset
    const cx = elements.length > 0
      ? elements.reduce((s, e) => s + e.position3D.x, 0) / elements.length + 10
      : 0;
    const cz = elements.length > 0
      ? elements.reduce((s, e) => s + e.position3D.z, 0) / elements.length
      : 0;
    const { elements: newEls, connections: newConns } = instantiatePattern(pattern, { x: cx, z: cz });
    importElements(newEls, newConns, `custom-pattern-${pattern.id}-${Date.now()}`);
    toast.success(`Pattern "${pattern.name}" instantiated`);
  }, [projectId, elements, importElements]);

  const handleDeleteCustom = useCallback((id: string) => {
    deleteCustomPattern(id);
    setCustomPatterns(loadCustomPatterns());
    setConfirmDeleteId(null);
    toast.success('Pattern deleted');
  }, []);

  const suggestions = useMemo(
    () => analyzeCanvas(elements, connections),
    [elements, connections],
  );

  const handleApply = (suggestion: Suggestion) => {
    if (!projectId) {
      toast.error('Open a project first');
      return;
    }
    if (suggestion.additions.elements.length === 0) {
      // Informational suggestion (e.g., isolated elements)
      toast('Use Connection Mode (C) to address this', { icon: '💡' });
      return;
    }

    const timestamp = Date.now();
    const trigger = suggestion.triggerElements[0];
    if (!trigger) return;

    const newIds: string[] = [];

    // Create new elements positioned relative to trigger
    for (const elDef of suggestion.additions.elements) {
      const id = `el-${timestamp}-${Math.random().toString(36).slice(2, 7)}`;
      newIds.push(id);

      addElement({
        id,
        type: elDef.type,
        name: elDef.name,
        description: '',
        layer: elDef.layer,
        togafDomain: elDef.domain,
        maturityLevel: 3,
        riskLevel: 'low',
        status: 'current',
        position3D: {
          x: trigger.position3D.x + elDef.offsetX,
          y: LAYER_Y[elDef.layer] || 0,
          z: trigger.position3D.z + elDef.offsetZ,
        },
        metadata: {},
      });
    }

    // Create connections
    for (const connDef of suggestion.additions.connections) {
      const resolveRef = (ref: string): string | null => {
        if (ref.startsWith('new:')) return newIds[parseInt(ref.split(':')[1])] || null;
        if (ref.startsWith('trigger:')) return suggestion.triggerElements[parseInt(ref.split(':')[1])]?.id || null;
        return null;
      };
      const srcId = resolveRef(connDef.sourceRef);
      const tgtId = resolveRef(connDef.targetRef);
      if (srcId && tgtId) {
        addConnection({
          id: `conn-${timestamp}-${Math.random().toString(36).slice(2, 7)}`,
          sourceId: srcId,
          targetId: tgtId,
          type: connDef.type,
        });
      }
    }

    setApplied(prev => new Set(prev).add(suggestion.id));
    const count = suggestion.additions.elements.length;
    toast.success(`Added ${count} element${count > 1 ? 's' : ''} + ${suggestion.additions.connections.length} connection${suggestion.additions.connections.length !== 1 ? 's' : ''}`);
  };

  const toggleExpand = (id: string) => {
    setExpanded(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const highCount = suggestions.filter(s => s.priority === 'high').length;

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2.5 border-b border-[var(--border-subtle)] shrink-0">
        <Sparkles size={13} className="text-[var(--accent-text)]" />
        <span className="text-[11px] font-semibold text-white">Smart Suggestions</span>
        {suggestions.length > 0 && (
          <span className="ml-auto text-[10px] text-[var(--text-disabled)]">
            {suggestions.length} suggestion{suggestions.length !== 1 ? 's' : ''}
          </span>
        )}
      </div>

      {/* Scrollable content */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        {/* ── My Patterns ─────────────────────────────────── */}
        <div className="border-b border-[var(--border-subtle)]">
          <button
            onClick={() => setMyPatternsOpen(prev => !prev)}
            className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-[var(--surface-base)] transition"
          >
            {myPatternsOpen
              ? <ChevronDown size={12} className="text-[var(--text-tertiary)]" />
              : <ChevronRight size={12} className="text-[var(--text-tertiary)]" />
            }
            <Bookmark size={12} className="text-[var(--accent-text)]" />
            <span className="text-[11px] font-semibold text-white flex-1">My Patterns</span>
            {customPatterns.length > 0 && (
              <span className="text-[10px] text-[var(--text-disabled)]">{customPatterns.length}</span>
            )}
          </button>
          {myPatternsOpen && (
            <div className="px-2 pb-2 space-y-1">
              {customPatterns.length === 0 ? (
                <p className="px-2 py-2 text-[10px] text-[var(--text-tertiary)] leading-relaxed">
                  Shift+Click 2+ elements, then "Save as Pattern" to create reusable blueprints.
                </p>
              ) : (
                customPatterns.map(pattern => (
                  <div
                    key={pattern.id}
                    className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-base)] p-2"
                  >
                    <div className="flex items-start gap-2">
                      <div className="flex-1 min-w-0">
                        <h4 className="text-[11px] font-semibold text-white truncate">{pattern.name}</h4>
                        {pattern.description && (
                          <p className="text-[9px] text-[var(--text-tertiary)] mt-0.5 line-clamp-2">{pattern.description}</p>
                        )}
                        <div className="flex items-center gap-2 mt-1">
                          <span className="text-[9px] text-[var(--text-disabled)]">
                            {pattern.elements.length} el.
                          </span>
                          <span className="text-[9px] text-[var(--text-disabled)]">
                            {pattern.connections.length} conn.
                          </span>
                        </div>
                      </div>
                    </div>
                    {/* Actions */}
                    {confirmDeleteId === pattern.id ? (
                      <div className="flex items-center gap-1.5 mt-2">
                        <span className="text-[9px] text-red-400 flex-1">Delete?</span>
                        <button
                          onClick={() => handleDeleteCustom(pattern.id)}
                          className="rounded px-2 py-0.5 text-[9px] font-medium bg-red-500/10 text-red-400 hover:bg-red-500/20 transition"
                        >
                          Yes
                        </button>
                        <button
                          onClick={() => setConfirmDeleteId(null)}
                          className="rounded px-2 py-0.5 text-[9px] text-[var(--text-tertiary)] hover:text-white transition"
                        >
                          No
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1 mt-2">
                        <button
                          onClick={() => handleInstantiateCustom(pattern)}
                          className="flex-1 flex items-center justify-center gap-1 rounded-md bg-[var(--accent-default)]/10 border border-[var(--accent-default)]/20 py-1 text-[9px] font-medium text-[var(--accent-text)] hover:bg-[var(--accent-default)]/20 transition"
                        >
                          <Play size={9} />
                          Instantiate
                        </button>
                        <button
                          onClick={() => setConfirmDeleteId(pattern.id)}
                          className="rounded-md p-1 text-[var(--text-disabled)] hover:text-red-400 hover:bg-red-500/10 transition"
                          title="Delete pattern"
                        >
                          <Trash2 size={11} />
                        </button>
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          )}
        </div>

        {/* ── Smart Suggestions ────────────────────────────── */}
        {suggestions.length === 0 ? (
          <div className="p-4 text-center space-y-2">
            <Check size={24} className="mx-auto text-green-400" />
            <p className="text-xs text-green-400 font-medium">Architecture looks complete</p>
            <p className="text-[10px] text-[var(--text-tertiary)]">
              No structural gaps detected. Add more elements to get new suggestions.
            </p>
          </div>
        ) : (
          <div className="p-2 space-y-1.5">
            {/* Priority summary */}
            {highCount > 0 && (
              <div className="flex items-center gap-1.5 px-2 py-1 mb-1">
                <AlertTriangle size={10} className="text-amber-400" />
                <span className="text-[10px] text-amber-300">
                  {highCount} high priority gap{highCount > 1 ? 's' : ''}
                </span>
              </div>
            )}

            {suggestions.map(suggestion => {
              const Icon = suggestion.icon;
              const isApplied = applied.has(suggestion.id);
              const isExpanded = expanded.has(suggestion.id);
              const isActionable = suggestion.additions.elements.length > 0;

              return (
                <div
                  key={suggestion.id}
                  className={`rounded-lg border transition ${
                    isApplied
                      ? 'border-green-500/20 bg-green-500/5'
                      : suggestion.priority === 'high'
                        ? 'border-amber-500/20 bg-[var(--surface-base)]'
                        : 'border-[var(--border-subtle)] bg-[var(--surface-base)]'
                  }`}
                >
                  {/* Suggestion header — clickable to expand */}
                  <button
                    onClick={() => toggleExpand(suggestion.id)}
                    className="flex items-start gap-2 w-full text-left p-2.5"
                  >
                    <div className={`h-6 w-6 rounded-md flex items-center justify-center shrink-0 mt-0.5 ${
                      isApplied
                        ? 'bg-green-500/10'
                        : suggestion.priority === 'high'
                          ? 'bg-amber-500/10'
                          : 'bg-[var(--accent-default)]/10'
                    }`}>
                      {isApplied
                        ? <Check size={12} className="text-green-400" />
                        : <Icon size={12} className={suggestion.priority === 'high' ? 'text-amber-400' : 'text-[var(--accent-text)]'} />
                      }
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <h4 className="text-[11px] font-semibold text-white truncate">{suggestion.title}</h4>
                        {suggestion.priority === 'high' && !isApplied && (
                          <span className="text-[8px] font-bold uppercase tracking-wider text-amber-400 shrink-0">!</span>
                        )}
                      </div>
                      <p className="text-[10px] text-[var(--text-tertiary)] mt-0.5 leading-relaxed">
                        {suggestion.description}
                      </p>
                    </div>
                    {isExpanded
                      ? <ChevronDown size={12} className="text-[var(--text-disabled)] shrink-0 mt-1" />
                      : <ChevronRight size={12} className="text-[var(--text-disabled)] shrink-0 mt-1" />
                    }
                  </button>

                  {/* Expanded detail */}
                  {isExpanded && (
                    <div className="px-2.5 pb-2.5 space-y-2">
                      {/* Trigger elements */}
                      <div className="flex flex-wrap gap-1">
                        {suggestion.triggerElements.map(el => (
                          <span
                            key={el.id}
                            className="rounded bg-[var(--surface-raised)] px-1.5 py-0.5 text-[9px] text-[var(--text-secondary)]"
                          >
                            {el.name}
                          </span>
                        ))}
                      </div>

                      {/* What will be added */}
                      {suggestion.additions.elements.length > 0 && (
                        <div className="text-[9px] text-[var(--text-disabled)]">
                          Will add: {suggestion.additions.elements.map(e => {
                            const label = ELEMENT_TYPES.find(et => et.type === e.type)?.label || e.type.replace(/_/g, ' ');
                            return label;
                          }).join(', ')}
                        </div>
                      )}

                      {/* Apply button */}
                      {isActionable && (
                        <button
                          onClick={() => handleApply(suggestion)}
                          disabled={isApplied}
                          className={`flex w-full items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-[10px] font-medium transition ${
                            isApplied
                              ? 'bg-green-500/10 text-green-400 border border-green-500/20 cursor-default'
                              : 'bg-[var(--accent-default)]/10 text-[var(--accent-text)] hover:bg-[var(--accent-default)]/20 border border-[var(--accent-default)]/20'
                          }`}
                        >
                          {isApplied
                            ? <><Check size={11} /> Applied</>
                            : <><Sparkles size={11} /> Apply Suggestion</>
                          }
                        </button>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
