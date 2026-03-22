import type {
  ElementStatus,
  Position3D,
} from '@thearchitect/shared';
import type {
  TransformationRoadmap,
  RoadmapWave,
  PlateauSnapshot,
  PlateauElementState,
  CrossPlateauDependency,
} from '@thearchitect/shared';

// Minimal element shape required for plateau computation
export interface PlateauInputElement {
  id: string;
  name: string;
  type: string;
  layer: string;
  status: string;
  position3D: Position3D;
}

// ─── Plateau Snapshot Computation ───
// Pure function: takes architecture elements + a completed roadmap,
// returns N+1 snapshots (As-Is + one per wave) with cumulative state.

export function computePlateauSnapshots(
  elements: PlateauInputElement[],
  roadmap: TransformationRoadmap,
): PlateauSnapshot[] {
  const waves = roadmap.waves;
  if (!waves.length || !elements.length) return [];

  // Build element lookup
  const elementMap = new Map<string, PlateauInputElement>();
  for (const el of elements) {
    elementMap.set(el.id, el);
  }

  // Build wave element lookup: which wave changes each element, and to what
  // waveChanges[waveIndex] = Map<elementId, WaveElement>
  const waveChanges = waves.map((w) => {
    const map = new Map<string, { targetStatus: ElementStatus; riskScore: number; estimatedCost: number }>();
    for (const we of w.elements) {
      map.set(we.elementId, {
        targetStatus: we.targetStatus,
        riskScore: we.riskScore,
        estimatedCost: we.estimatedCost,
      });
    }
    return map;
  });

  const snapshots: PlateauSnapshot[] = [];

  // ─── Snapshot 0: As-Is ───
  const asIsElements: Record<string, PlateauElementState> = {};
  for (const el of elements) {
    asIsElements[el.id] = {
      elementId: el.id,
      name: el.name,
      type: el.type,
      layer: el.layer,
      status: el.status as ElementStatus,
      previousStatus: el.status as ElementStatus,
      isChanged: false,
      changeWaveNumber: null,
      riskScore: 0,
      estimatedCost: 0,
      position3D: { ...el.position3D },
    };
  }

  snapshots.push({
    plateauIndex: 0,
    label: 'As-Is',
    waveNumber: null,
    elements: asIsElements,
    changedElementIds: [],
    cumulativeCost: 0,
    cumulativeRiskDelta: 0,
    metrics: null,
  });

  // ─── Snapshot 1..N: After each wave ───
  let cumulativeCost = 0;
  let cumulativeRiskDelta = 0;

  for (let i = 0; i < waves.length; i++) {
    const wave = waves[i];
    const changes = waveChanges[i];
    const prevElements = snapshots[i].elements;
    const changedIds: string[] = [];

    // Clone previous state and apply wave transitions
    const newElements: Record<string, PlateauElementState> = {};

    for (const [id, prevState] of Object.entries(prevElements)) {
      const change = changes.get(id);
      if (change) {
        changedIds.push(id);
        newElements[id] = {
          ...prevState,
          previousStatus: prevState.status,
          status: change.targetStatus,
          isChanged: true,
          changeWaveNumber: wave.waveNumber,
          riskScore: change.riskScore,
          estimatedCost: change.estimatedCost,
        };
      } else {
        newElements[id] = {
          ...prevState,
          previousStatus: prevState.status,
          isChanged: false,
          // Preserve changeWaveNumber from earlier waves
          riskScore: 0,
          estimatedCost: 0,
        };
      }
    }

    cumulativeCost += wave.metrics.totalCost;
    cumulativeRiskDelta += wave.metrics.riskDelta;

    snapshots.push({
      plateauIndex: i + 1,
      label: `Wave ${wave.waveNumber}: ${wave.name}`,
      waveNumber: wave.waveNumber,
      elements: newElements,
      changedElementIds: changedIds,
      cumulativeCost,
      cumulativeRiskDelta,
      metrics: wave.metrics,
    });
  }

  return snapshots;
}

// ─── Cross-Plateau Dependency Computation ───
// Finds elements that depend on elements completed in earlier waves.

export function computeCrossPlateauDependencies(
  snapshots: PlateauSnapshot[],
  waves: RoadmapWave[],
): CrossPlateauDependency[] {
  if (snapshots.length < 2) return [];

  // Build lookup: elementId → plateauIndex where it was last changed
  const elementCompletedIn = new Map<string, number>();
  for (let i = 1; i < snapshots.length; i++) {
    for (const elId of snapshots[i].changedElementIds) {
      elementCompletedIn.set(elId, i);
    }
  }

  const deps: CrossPlateauDependency[] = [];

  for (const wave of waves) {
    const targetPlateauIndex = wave.waveNumber; // plateau index = waveNumber (1-indexed)
    for (const we of wave.elements) {
      for (const depId of we.dependsOnElementIds) {
        const sourcePlateauIndex = elementCompletedIn.get(depId);
        // Only create cross-plateau line if dependency was completed in an EARLIER plateau
        if (sourcePlateauIndex !== undefined && sourcePlateauIndex < targetPlateauIndex) {
          deps.push({
            sourceElementId: depId,
            sourcePlateauIndex,
            targetElementId: we.elementId,
            targetPlateauIndex,
          });
        }
      }
    }
  }

  return deps;
}

// ─── Memoization Cache ───
let cachedRoadmapId: string | null = null;
let cachedRoadmapVersion: number | null = null;
let cachedElementsRef: PlateauInputElement[] | null = null;
let cachedSnapshots: PlateauSnapshot[] | null = null;
let cachedDeps: CrossPlateauDependency[] | null = null;

export function computePlateauSnapshotsMemoized(
  elements: PlateauInputElement[],
  roadmap: TransformationRoadmap,
): { snapshots: PlateauSnapshot[]; dependencies: CrossPlateauDependency[] } {
  if (
    cachedRoadmapId === roadmap.id &&
    cachedRoadmapVersion === roadmap.version &&
    cachedElementsRef === elements &&
    cachedSnapshots !== null &&
    cachedDeps !== null
  ) {
    return { snapshots: cachedSnapshots, dependencies: cachedDeps };
  }

  const snapshots = computePlateauSnapshots(elements, roadmap);
  const dependencies = computeCrossPlateauDependencies(snapshots, roadmap.waves);

  cachedRoadmapId = roadmap.id;
  cachedRoadmapVersion = roadmap.version;
  cachedElementsRef = elements;
  cachedSnapshots = snapshots;
  cachedDeps = dependencies;

  return { snapshots, dependencies };
}
