import { create } from 'zustand';
import { useArchitectureStore, ArchitectureElement, Connection } from './architectureStore';

export type XRaySubView = 'risk' | 'cost' | 'timeline' | 'simulation';

export interface XRayMetrics {
  totalRiskExposure: number;
  transformationProgress: number;
  timeToTarget: number;
  decisionConfidence: number;
  // Cost metrics
  totalCost: number;
  optimizationTotal: number;
  costP10: number;
  costP50: number;
  costP90: number;
}

export interface XRayElementData {
  elementId: string;
  riskScore: number;
  estimatedCost: number;
  optimizationPotential: number;
  dependencyDepth: number;
  isCriticalPath: boolean;
}

const BASE_COSTS: Record<string, number> = {
  application: 50000,
  application_component: 20000,
  application_service: 15000,
  service: 15000,
  application_collaboration: 15000,
  application_interface: 12000,
  application_function: 18000,
  application_interaction: 10000,
  application_process: 15000,
  application_event: 5000,
  data_object: 8000,
  technology_component: 30000,
  infrastructure: 80000,
  platform_service: 40000,
  node: 60000,
  device: 50000,
  system_software: 25000,
  artifact: 5000,
  communication_network: 45000,
  path: 10000,
  data_entity: 10000,
  data_model: 8000,
  business_capability: 5000,
  process: 12000,
  business_service: 10000,
  business_actor: 0,
  business_role: 0,
  business_function: 12000,
  business_event: 2000,
  business_object: 3000,
  business_collaboration: 8000,
  business_interaction: 5000,
  business_interface: 5000,
  contract: 3000,
  representation: 2000,
  product: 15000,
  value_stream: 8000,
  resource: 20000,
  course_of_action: 5000,
  // Motivation (no direct cost)
  stakeholder: 0,
  driver: 0,
  assessment: 0,
  goal: 0,
  outcome: 0,
  principle: 0,
  requirement: 0,
  constraint: 0,
  meaning: 0,
  am_value: 0,
  // Implementation & Migration
  work_package: 50000,
  deliverable: 20000,
  implementation_event: 5000,
  plateau: 0,
  gap: 10000,
  // Physical
  equipment: 60000,
  facility: 200000,
  distribution_network: 80000,
  material: 15000,
};

export interface XRayPosition {
  x: number;
  y: number;
  z: number;
}

interface XRayState {
  isActive: boolean;
  subView: XRaySubView;
  metrics: XRayMetrics;
  elementData: Map<string, XRayElementData>;
  xrayPositions: Map<string, XRayPosition>;
  criticalPath: string[];
  aiNarrative: string;
  isLoadingNarrative: boolean;

  toggleXRay: () => void;
  setSubView: (view: XRaySubView) => void;
  recompute: () => void;
  computePositions: (view: XRaySubView) => void;
  setAINarrative: (text: string) => void;
  setLoadingNarrative: (loading: boolean) => void;
}

function computeRiskScore(
  el: ArchitectureElement,
  connections: Connection[]
): number {
  const outDegree = connections.filter((c) => c.sourceId === el.id).length;
  const inDegree = connections.filter((c) => c.targetId === el.id).length;
  const riskScores: Record<string, number> = { critical: 10, high: 7, medium: 4, low: 1 };
  const statusScores: Record<string, number> = { retired: 8, transitional: 6, target: 3, current: 1 };

  const inherent = riskScores[el.riskLevel] || 2;
  const maturityRisk = (5 - el.maturityLevel) * 2;
  const depExposure = Math.min(outDegree * 1.5, 10);
  const depImpact = Math.min(inDegree * 2, 10);
  const lifecycle = statusScores[el.status] || 5;

  return Math.round((inherent * 0.3 + maturityRisk * 0.2 + depExposure * 0.2 + depImpact * 0.2 + lifecycle * 0.1) * 10) / 10;
}

function computeCost(el: ArchitectureElement): { estimated: number; optimization: number } {
  const baseCost = BASE_COSTS[el.type] || 15000;
  const statusMultiplier = el.status === 'retired' ? 0.2
    : el.status === 'transitional' ? 1.5
    : el.status === 'target' ? 1.8 : 1.0;
  const estimated = Math.round(baseCost * statusMultiplier);
  const optimization = el.status === 'retired' ? estimated * 0.9
    : el.maturityLevel <= 2 ? estimated * 0.3
    : el.status === 'transitional' ? estimated * 0.4 : 0;
  return { estimated, optimization: Math.round(optimization) };
}

function findCriticalPath(
  elements: ArchitectureElement[],
  connections: Connection[],
  elementDataMap: Map<string, XRayElementData>
): string[] {
  // Find the path through the architecture that accumulates the highest risk
  const adjacency = new Map<string, string[]>();
  for (const conn of connections) {
    if (!adjacency.has(conn.sourceId)) adjacency.set(conn.sourceId, []);
    adjacency.get(conn.sourceId)!.push(conn.targetId);
  }

  let bestPath: string[] = [];
  let bestScore = 0;

  // Start from elements with no incoming connections (roots)
  const hasIncoming = new Set(connections.map((c) => c.targetId));
  const roots = elements.filter((el) => !hasIncoming.has(el.id));
  if (roots.length === 0 && elements.length > 0) {
    // If no roots, pick highest risk element
    const sorted = [...elements].sort((a, b) => {
      const aData = elementDataMap.get(a.id);
      const bData = elementDataMap.get(b.id);
      return (bData?.riskScore || 0) - (aData?.riskScore || 0);
    });
    roots.push(sorted[0]);
  }

  for (const root of roots) {
    // DFS to find highest-risk path
    const stack: { id: string; path: string[]; score: number }[] = [
      { id: root.id, path: [root.id], score: elementDataMap.get(root.id)?.riskScore || 0 },
    ];
    const visited = new Set<string>();

    while (stack.length > 0) {
      const { id, path, score } = stack.pop()!;
      if (visited.has(id)) continue;
      visited.add(id);

      if (score > bestScore) {
        bestScore = score;
        bestPath = [...path];
      }

      const neighbors = adjacency.get(id) || [];
      for (const nId of neighbors) {
        if (!visited.has(nId)) {
          const nScore = elementDataMap.get(nId)?.riskScore || 0;
          stack.push({ id: nId, path: [...path, nId], score: score + nScore });
        }
      }
    }
  }

  return bestPath;
}

export const useXRayStore = create<XRayState>((set, get) => ({
  isActive: false,
  subView: 'risk',
  metrics: { totalRiskExposure: 0, transformationProgress: 0, timeToTarget: 0, decisionConfidence: 0, totalCost: 0, optimizationTotal: 0, costP10: 0, costP50: 0, costP90: 0 },
  elementData: new Map(),
  xrayPositions: new Map(),
  criticalPath: [],
  aiNarrative: '',
  isLoadingNarrative: false,

  toggleXRay: () => {
    const wasActive = get().isActive;
    if (!wasActive) {
      // Mutual exclusion: deactivate Plateau View if active
      // Import lazily to avoid circular dependency at module init
      import('./roadmapStore').then(({ useRoadmapStore }) => {
        if (useRoadmapStore.getState().isPlateauViewActive) {
          useRoadmapStore.getState().deactivatePlateauView();
        }
      });
      get().recompute();
    }
    set({ isActive: !wasActive });
  },

  setSubView: (view) => {
    set({ subView: view });
    // Recompute positions for the new subview
    if (get().isActive) {
      get().computePositions(view);
    }
  },

  setAINarrative: (text) => set({ aiNarrative: text }),
  setLoadingNarrative: (loading) => set({ isLoadingNarrative: loading }),

  recompute: () => {
    const { elements, connections } = useArchitectureStore.getState();
    if (elements.length === 0) return;

    const elementDataMap = new Map<string, XRayElementData>();

    // Compute per-element data
    for (const el of elements) {
      const riskScore = computeRiskScore(el, connections);
      const { estimated, optimization } = computeCost(el);

      // Dependency depth via BFS
      let depth = 0;
      const visited = new Set<string>();
      let frontier = [el.id];
      while (frontier.length > 0) {
        const next: string[] = [];
        for (const fId of frontier) {
          const outConns = connections.filter((c) => c.sourceId === fId);
          for (const c of outConns) {
            if (!visited.has(c.targetId)) {
              visited.add(c.targetId);
              next.push(c.targetId);
            }
          }
        }
        if (next.length > 0) depth++;
        frontier = next;
      }

      elementDataMap.set(el.id, {
        elementId: el.id,
        riskScore,
        estimatedCost: estimated,
        optimizationPotential: optimization,
        dependencyDepth: depth,
        isCriticalPath: false,
      });
    }

    // Find critical path
    const criticalPath = findCriticalPath(elements, connections, elementDataMap);
    for (const id of criticalPath) {
      const data = elementDataMap.get(id);
      if (data) data.isCriticalPath = true;
    }

    // Compute aggregate metrics
    const allData = Array.from(elementDataMap.values());
    const totalRiskExposure = allData.reduce((sum, d) => sum + d.riskScore * d.estimatedCost / 10, 0);

    const currentCount = elements.filter((e) => e.status === 'current').length;
    const targetCount = elements.filter((e) => e.status === 'target').length;
    const transitionalCount = elements.filter((e) => e.status === 'transitional').length;
    const totalTransformable = currentCount + targetCount + transitionalCount;
    const transformationProgress = totalTransformable > 0
      ? Math.round((targetCount / totalTransformable) * 100)
      : 0;

    const timeToTarget = Math.max(3, transitionalCount * 2 + (currentCount - targetCount));

    const avgRisk = allData.reduce((s, d) => s + d.riskScore, 0) / (allData.length || 1);
    const variance = allData.reduce((s, d) => s + Math.pow(d.riskScore - avgRisk, 2), 0) / (allData.length || 1);
    const decisionConfidence = Math.max(10, Math.min(95, Math.round(100 - variance * 8)));

    // Cost metrics
    const totalCost = allData.reduce((sum, d) => sum + d.estimatedCost, 0);
    const optimizationTotal = allData.reduce((sum, d) => sum + d.optimizationPotential, 0);
    const costP10 = Math.round(totalCost * 0.7);
    const costP50 = totalCost;
    const costP90 = Math.round(totalCost * 1.45);

    set({
      elementData: elementDataMap,
      criticalPath,
      metrics: {
        totalRiskExposure: Math.round(totalRiskExposure),
        transformationProgress,
        timeToTarget: Math.max(1, Math.round(timeToTarget)),
        decisionConfidence,
        totalCost: Math.round(totalCost),
        optimizationTotal: Math.round(optimizationTotal),
        costP10,
        costP50,
        costP90,
      },
    });

    // Compute scale-based positions for current subView
    get().computePositions(get().subView);
  },

  computePositions: (view: XRaySubView) => {
    const { elements } = useArchitectureStore.getState();
    const elementData = get().elementData;
    if (elements.length === 0 || elementData.size === 0) return;

    const SCALE_WIDTH = 24; // Total X spread: -12 to +12
    const positions = new Map<string, XRayPosition>();

    // Group elements by layer
    const byLayer = new Map<string, ArchitectureElement[]>();
    for (const el of elements) {
      if (!byLayer.has(el.layer)) byLayer.set(el.layer, []);
      byLayer.get(el.layer)!.push(el);
    }

    for (const [, layerElements] of byLayer) {
      // Sort elements by the metric for this view
      const sorted = [...layerElements].sort((a, b) => {
        const aData = elementData.get(a.id);
        const bData = elementData.get(b.id);
        if (!aData || !bData) return 0;

        if (view === 'risk') return aData.riskScore - bData.riskScore;
        if (view === 'cost') return aData.estimatedCost - bData.estimatedCost;
        if (view === 'timeline') {
          const statusOrder: Record<string, number> = { current: 0, transitional: 1, target: 2, retired: 3 };
          return (statusOrder[a.status] ?? 0) - (statusOrder[b.status] ?? 0);
        }
        return 0;
      });

      // Place elements along X axis based on sorted position
      const count = sorted.length;
      const rowSize = Math.min(count, Math.ceil(SCALE_WIDTH / 2.5)); // Max elements per row
      for (let i = 0; i < count; i++) {
        const el = sorted[i];
        const col = i % rowSize;
        const row = Math.floor(i / rowSize);
        // Spread across X axis: normalized position within the scale
        const x = count <= 1 ? 0 : (col / (rowSize - 1 || 1)) * SCALE_WIDTH - SCALE_WIDTH / 2;
        const z = row * 3; // Stack rows in Z if overflow
        positions.set(el.id, { x, y: el.position3D.y, z });
      }
    }

    set({ xrayPositions: positions });
  },
}));
