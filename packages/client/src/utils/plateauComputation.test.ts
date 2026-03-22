import { describe, test, expect } from 'vitest';
import {
  computePlateauSnapshots,
  computeCrossPlateauDependencies,
  computePlateauSnapshotsMemoized,
  type PlateauInputElement,
} from './plateauComputation';
import type {
  TransformationRoadmap,
  RoadmapWave,
  WaveElement,
  WaveMetrics,
  PlateauSnapshot,
} from '@thearchitect/shared';

// ─── Test Helpers ───

function makeElement(overrides: Partial<PlateauInputElement> & { id: string }): PlateauInputElement {
  return {
    name: `Element ${overrides.id}`,
    type: 'application_component',
    layer: 'application',
    status: 'current',
    position3D: { x: 0, y: 0, z: 0 },
    ...overrides,
  };
}

function makeWaveMetrics(overrides?: Partial<WaveMetrics>): WaveMetrics {
  return {
    totalCost: 10000,
    riskDelta: -1,
    complianceImpact: 0,
    avgFatigue: 0.2,
    elementCount: 1,
    ...overrides,
  };
}

function makeWaveElement(overrides: Partial<WaveElement> & { elementId: string }): WaveElement {
  return {
    name: `WE ${overrides.elementId}`,
    type: 'application_component',
    layer: 'application',
    currentStatus: 'current',
    targetStatus: 'transitional',
    riskScore: 5,
    estimatedCost: 10000,
    stakeholderFatigue: 0.2,
    dependsOnElementIds: [],
    ...overrides,
  };
}

function makeWave(overrides: Partial<RoadmapWave> & { waveNumber: number }): RoadmapWave {
  return {
    name: `Wave ${overrides.waveNumber}`,
    description: '',
    elements: [],
    metrics: makeWaveMetrics(),
    dependsOnWaves: [],
    estimatedDurationMonths: 3,
    ...overrides,
  };
}

function makeRoadmap(waves: RoadmapWave[], overrides?: Partial<TransformationRoadmap>): TransformationRoadmap {
  return {
    id: 'roadmap-1',
    projectId: 'proj-1',
    createdBy: 'user-1',
    name: 'Test Roadmap',
    config: {
      strategy: 'balanced',
      maxWaves: 4,
      targetStates: {},
      includeAIRecommendations: false,
    },
    waves,
    summary: {
      totalCost: waves.reduce((s, w) => s + w.metrics.totalCost, 0),
      totalDurationMonths: waves.length * 3,
      totalElements: waves.reduce((s, w) => s + w.elements.length, 0),
      riskReduction: 20,
      complianceImprovement: 0,
      waveCount: waves.length,
      costConfidence: { p10: 8000, p50: 10000, p90: 15000 },
    },
    advisorInsightsAddressed: [],
    status: 'completed',
    version: 1,
    createdAt: '2026-03-22T00:00:00Z',
    updatedAt: '2026-03-22T00:00:00Z',
    ...overrides,
  };
}

// ─── Tests ───

describe('computePlateauSnapshots', () => {
  // ─── TPCV-001: Basic Snapshot Generation ───

  test('returns empty array when no waves', () => {
    const elements = [makeElement({ id: 'e1' })];
    const roadmap = makeRoadmap([]);
    expect(computePlateauSnapshots(elements, roadmap)).toEqual([]);
  });

  test('returns empty array when no elements', () => {
    const wave = makeWave({ waveNumber: 1 });
    const roadmap = makeRoadmap([wave]);
    expect(computePlateauSnapshots([], roadmap)).toEqual([]);
  });

  test('generates N+1 snapshots for N waves', () => {
    const elements = [makeElement({ id: 'e1' }), makeElement({ id: 'e2' })];
    const waves = [
      makeWave({ waveNumber: 1, elements: [makeWaveElement({ elementId: 'e1', targetStatus: 'transitional' })] }),
      makeWave({ waveNumber: 2, elements: [makeWaveElement({ elementId: 'e1', targetStatus: 'target' })] }),
      makeWave({ waveNumber: 3, elements: [makeWaveElement({ elementId: 'e2', targetStatus: 'retired' })] }),
    ];
    const roadmap = makeRoadmap(waves);
    const snapshots = computePlateauSnapshots(elements, roadmap);

    expect(snapshots).toHaveLength(4); // As-Is + 3 waves
  });

  // ─── Snapshot 0: As-Is ───

  test('Snapshot 0 (As-Is) has all elements with original status and isChanged=false', () => {
    const elements = [
      makeElement({ id: 'e1', status: 'current' }),
      makeElement({ id: 'e2', status: 'target' }),
    ];
    const roadmap = makeRoadmap([makeWave({ waveNumber: 1 })]);
    const snapshots = computePlateauSnapshots(elements, roadmap);

    const asIs = snapshots[0];
    expect(asIs.plateauIndex).toBe(0);
    expect(asIs.label).toBe('As-Is');
    expect(asIs.waveNumber).toBeNull();
    expect(asIs.changedElementIds).toEqual([]);
    expect(asIs.cumulativeCost).toBe(0);
    expect(asIs.cumulativeRiskDelta).toBe(0);
    expect(asIs.metrics).toBeNull();

    // All elements present, no changes
    expect(Object.keys(asIs.elements)).toHaveLength(2);
    expect(asIs.elements['e1'].status).toBe('current');
    expect(asIs.elements['e1'].isChanged).toBe(false);
    expect(asIs.elements['e1'].changeWaveNumber).toBeNull();
    expect(asIs.elements['e2'].status).toBe('target');
    expect(asIs.elements['e2'].isChanged).toBe(false);
  });

  // ─── Wave Transitions ───

  test('Wave 1 applies targetStatus to changed elements', () => {
    const elements = [
      makeElement({ id: 'e1', status: 'current' }),
      makeElement({ id: 'e2', status: 'current' }),
    ];
    const waves = [
      makeWave({
        waveNumber: 1,
        elements: [
          makeWaveElement({ elementId: 'e1', targetStatus: 'transitional', riskScore: 7, estimatedCost: 25000 }),
        ],
      }),
    ];
    const roadmap = makeRoadmap(waves);
    const snapshots = computePlateauSnapshots(elements, roadmap);

    const wave1 = snapshots[1];
    expect(wave1.plateauIndex).toBe(1);
    expect(wave1.label).toBe('Wave 1: Wave 1');
    expect(wave1.waveNumber).toBe(1);

    // e1 changed
    expect(wave1.elements['e1'].status).toBe('transitional');
    expect(wave1.elements['e1'].previousStatus).toBe('current');
    expect(wave1.elements['e1'].isChanged).toBe(true);
    expect(wave1.elements['e1'].changeWaveNumber).toBe(1);
    expect(wave1.elements['e1'].riskScore).toBe(7);
    expect(wave1.elements['e1'].estimatedCost).toBe(25000);

    // e2 unchanged
    expect(wave1.elements['e2'].status).toBe('current');
    expect(wave1.elements['e2'].isChanged).toBe(false);

    expect(wave1.changedElementIds).toEqual(['e1']);
  });

  test('cumulative state across multiple waves', () => {
    const elements = [makeElement({ id: 'e1', status: 'current' })];
    const waves = [
      makeWave({
        waveNumber: 1,
        elements: [makeWaveElement({ elementId: 'e1', targetStatus: 'transitional' })],
        metrics: makeWaveMetrics({ totalCost: 5000, riskDelta: -2 }),
      }),
      makeWave({
        waveNumber: 2,
        elements: [makeWaveElement({ elementId: 'e1', targetStatus: 'target' })],
        metrics: makeWaveMetrics({ totalCost: 8000, riskDelta: -3 }),
      }),
    ];
    const roadmap = makeRoadmap(waves);
    const snapshots = computePlateauSnapshots(elements, roadmap);

    // Wave 1: current → transitional
    expect(snapshots[1].elements['e1'].status).toBe('transitional');
    expect(snapshots[1].elements['e1'].previousStatus).toBe('current');
    expect(snapshots[1].cumulativeCost).toBe(5000);
    expect(snapshots[1].cumulativeRiskDelta).toBe(-2);

    // Wave 2: transitional → target
    expect(snapshots[2].elements['e1'].status).toBe('target');
    expect(snapshots[2].elements['e1'].previousStatus).toBe('transitional');
    expect(snapshots[2].cumulativeCost).toBe(13000); // 5000 + 8000
    expect(snapshots[2].cumulativeRiskDelta).toBe(-5); // -2 + -3
  });

  test('element changed in Wave 1 shows isChanged=false in Wave 2 (if not changed again)', () => {
    const elements = [
      makeElement({ id: 'e1', status: 'current' }),
      makeElement({ id: 'e2', status: 'current' }),
    ];
    const waves = [
      makeWave({
        waveNumber: 1,
        elements: [makeWaveElement({ elementId: 'e1', targetStatus: 'transitional' })],
      }),
      makeWave({
        waveNumber: 2,
        elements: [makeWaveElement({ elementId: 'e2', targetStatus: 'target' })],
      }),
    ];
    const roadmap = makeRoadmap(waves);
    const snapshots = computePlateauSnapshots(elements, roadmap);

    // Wave 2: e1 NOT changed in this wave
    expect(snapshots[2].elements['e1'].isChanged).toBe(false);
    expect(snapshots[2].elements['e1'].status).toBe('transitional'); // cumulative state preserved
    expect(snapshots[2].elements['e1'].riskScore).toBe(0); // reset for unchanged

    // Wave 2: e2 IS changed
    expect(snapshots[2].elements['e2'].isChanged).toBe(true);
    expect(snapshots[2].elements['e2'].status).toBe('target');
    expect(snapshots[2].changedElementIds).toEqual(['e2']);
  });

  // ─── Position Preservation ───

  test('position3D is preserved from original element', () => {
    const elements = [makeElement({ id: 'e1', position3D: { x: 10, y: 5, z: -3 } })];
    const waves = [
      makeWave({ waveNumber: 1, elements: [makeWaveElement({ elementId: 'e1' })] }),
    ];
    const roadmap = makeRoadmap(waves);
    const snapshots = computePlateauSnapshots(elements, roadmap);

    expect(snapshots[0].elements['e1'].position3D).toEqual({ x: 10, y: 5, z: -3 });
    expect(snapshots[1].elements['e1'].position3D).toEqual({ x: 10, y: 5, z: -3 });
  });

  // ─── Metadata Propagation ───

  test('element name, type, layer are propagated to all snapshots', () => {
    const elements = [makeElement({ id: 'e1', name: 'CRM System', type: 'application', layer: 'application' })];
    const waves = [
      makeWave({ waveNumber: 1, elements: [makeWaveElement({ elementId: 'e1' })] }),
    ];
    const roadmap = makeRoadmap(waves);
    const snapshots = computePlateauSnapshots(elements, roadmap);

    for (const snap of snapshots) {
      expect(snap.elements['e1'].name).toBe('CRM System');
      expect(snap.elements['e1'].type).toBe('application');
      expect(snap.elements['e1'].layer).toBe('application');
    }
  });

  // ─── Wave Metrics ───

  test('wave metrics are attached to correct snapshot', () => {
    const elements = [makeElement({ id: 'e1' })];
    const metrics1 = makeWaveMetrics({ totalCost: 5000, avgFatigue: 0.3, complianceImpact: 2, elementCount: 1 });
    const metrics2 = makeWaveMetrics({ totalCost: 12000, avgFatigue: 0.5, complianceImpact: 0, elementCount: 1 });
    const waves = [
      makeWave({ waveNumber: 1, elements: [makeWaveElement({ elementId: 'e1' })], metrics: metrics1 }),
      makeWave({ waveNumber: 2, elements: [makeWaveElement({ elementId: 'e1', targetStatus: 'target' })], metrics: metrics2 }),
    ];
    const roadmap = makeRoadmap(waves);
    const snapshots = computePlateauSnapshots(elements, roadmap);

    expect(snapshots[0].metrics).toBeNull(); // As-Is
    expect(snapshots[1].metrics).toEqual(metrics1);
    expect(snapshots[2].metrics).toEqual(metrics2);
  });

  // ─── Edge Case: 8 Waves (maximum) ───

  test('handles 8 waves correctly (9 snapshots)', () => {
    const elements = [makeElement({ id: 'e1' })];
    const waves = Array.from({ length: 8 }, (_, i) =>
      makeWave({
        waveNumber: i + 1,
        elements: i === 0 ? [makeWaveElement({ elementId: 'e1', targetStatus: 'transitional' })] : [],
        metrics: makeWaveMetrics({ totalCost: 1000 * (i + 1) }),
      }),
    );
    const roadmap = makeRoadmap(waves);
    const snapshots = computePlateauSnapshots(elements, roadmap);

    expect(snapshots).toHaveLength(9);
    expect(snapshots[8].cumulativeCost).toBe(1000 + 2000 + 3000 + 4000 + 5000 + 6000 + 7000 + 8000);
  });

  // ─── Edge Case: Element only in wave data but not in architecture ───

  test('wave element not in architecture elements is silently ignored', () => {
    const elements = [makeElement({ id: 'e1' })];
    const waves = [
      makeWave({
        waveNumber: 1,
        elements: [
          makeWaveElement({ elementId: 'e1', targetStatus: 'transitional' }),
          makeWaveElement({ elementId: 'ghost', targetStatus: 'retired' }), // not in elements
        ],
      }),
    ];
    const roadmap = makeRoadmap(waves);
    const snapshots = computePlateauSnapshots(elements, roadmap);

    expect(snapshots[1].elements['e1'].isChanged).toBe(true);
    expect(snapshots[1].elements['ghost']).toBeUndefined(); // ghost not in snapshots
    expect(snapshots[1].changedElementIds).toEqual(['e1']); // only real element
  });
});

// ─── Cross-Plateau Dependencies ───

describe('computeCrossPlateauDependencies', () => {
  test('returns empty array when <2 snapshots', () => {
    expect(computeCrossPlateauDependencies([], [])).toEqual([]);
    expect(computeCrossPlateauDependencies([{} as PlateauSnapshot], [])).toEqual([]);
  });

  test('finds cross-plateau dependency when element in Wave 2 depends on element completed in Wave 1', () => {
    const elements = [makeElement({ id: 'e1' }), makeElement({ id: 'e2' })];
    const waves: RoadmapWave[] = [
      makeWave({
        waveNumber: 1,
        elements: [makeWaveElement({ elementId: 'e1', targetStatus: 'transitional' })],
      }),
      makeWave({
        waveNumber: 2,
        elements: [makeWaveElement({ elementId: 'e2', targetStatus: 'target', dependsOnElementIds: ['e1'] })],
      }),
    ];
    const roadmap = makeRoadmap(waves);
    const snapshots = computePlateauSnapshots(elements, roadmap);
    const deps = computeCrossPlateauDependencies(snapshots, waves);

    expect(deps).toHaveLength(1);
    expect(deps[0]).toEqual({
      sourceElementId: 'e1',
      sourcePlateauIndex: 1,
      targetElementId: 'e2',
      targetPlateauIndex: 2,
    });
  });

  test('no dependency when element depends on something in the SAME wave', () => {
    const elements = [makeElement({ id: 'e1' }), makeElement({ id: 'e2' })];
    const waves: RoadmapWave[] = [
      makeWave({
        waveNumber: 1,
        elements: [
          makeWaveElement({ elementId: 'e1', targetStatus: 'transitional' }),
          makeWaveElement({ elementId: 'e2', targetStatus: 'target', dependsOnElementIds: ['e1'] }),
        ],
      }),
    ];
    const roadmap = makeRoadmap(waves);
    const snapshots = computePlateauSnapshots(elements, roadmap);
    const deps = computeCrossPlateauDependencies(snapshots, waves);

    // Same wave = not cross-plateau
    expect(deps).toHaveLength(0);
  });

  test('no dependency when element depends on something in a LATER wave', () => {
    const elements = [makeElement({ id: 'e1' }), makeElement({ id: 'e2' })];
    const waves: RoadmapWave[] = [
      makeWave({
        waveNumber: 1,
        elements: [makeWaveElement({ elementId: 'e1', targetStatus: 'transitional', dependsOnElementIds: ['e2'] })],
      }),
      makeWave({
        waveNumber: 2,
        elements: [makeWaveElement({ elementId: 'e2', targetStatus: 'target' })],
      }),
    ];
    const roadmap = makeRoadmap(waves);
    const snapshots = computePlateauSnapshots(elements, roadmap);
    const deps = computeCrossPlateauDependencies(snapshots, waves);

    // e1 (Wave 1) depends on e2 (Wave 2) → later wave, not cross-plateau from earlier
    expect(deps).toHaveLength(0);
  });

  test('multiple cross-plateau dependencies across 3 waves', () => {
    const elements = [makeElement({ id: 'e1' }), makeElement({ id: 'e2' }), makeElement({ id: 'e3' })];
    const waves: RoadmapWave[] = [
      makeWave({
        waveNumber: 1,
        elements: [makeWaveElement({ elementId: 'e1', targetStatus: 'transitional' })],
      }),
      makeWave({
        waveNumber: 2,
        elements: [makeWaveElement({ elementId: 'e2', targetStatus: 'target', dependsOnElementIds: ['e1'] })],
      }),
      makeWave({
        waveNumber: 3,
        elements: [makeWaveElement({ elementId: 'e3', targetStatus: 'retired', dependsOnElementIds: ['e1', 'e2'] })],
      }),
    ];
    const roadmap = makeRoadmap(waves);
    const snapshots = computePlateauSnapshots(elements, roadmap);
    const deps = computeCrossPlateauDependencies(snapshots, waves);

    // e2→e1 (Wave 2 depends on Wave 1), e3→e1 (Wave 3 depends on Wave 1), e3→e2 (Wave 3 depends on Wave 2)
    expect(deps).toHaveLength(3);
    expect(deps).toContainEqual({
      sourceElementId: 'e1', sourcePlateauIndex: 1,
      targetElementId: 'e2', targetPlateauIndex: 2,
    });
    expect(deps).toContainEqual({
      sourceElementId: 'e1', sourcePlateauIndex: 1,
      targetElementId: 'e3', targetPlateauIndex: 3,
    });
    expect(deps).toContainEqual({
      sourceElementId: 'e2', sourcePlateauIndex: 2,
      targetElementId: 'e3', targetPlateauIndex: 3,
    });
  });
});

// ─── Memoization ───

describe('computePlateauSnapshotsMemoized', () => {
  test('returns same reference for identical inputs', () => {
    const elements = [makeElement({ id: 'e1' })];
    const waves = [makeWave({ waveNumber: 1, elements: [makeWaveElement({ elementId: 'e1' })] })];
    const roadmap = makeRoadmap(waves);

    const result1 = computePlateauSnapshotsMemoized(elements, roadmap);
    const result2 = computePlateauSnapshotsMemoized(elements, roadmap);

    expect(result1.snapshots).toBe(result2.snapshots); // same reference
    expect(result1.dependencies).toBe(result2.dependencies);
  });

  test('recomputes when roadmap ID changes', () => {
    const elements = [makeElement({ id: 'e1' })];
    const waves = [makeWave({ waveNumber: 1, elements: [makeWaveElement({ elementId: 'e1' })] })];
    const roadmap1 = makeRoadmap(waves, { id: 'roadmap-A' });
    const roadmap2 = makeRoadmap(waves, { id: 'roadmap-B' });

    const result1 = computePlateauSnapshotsMemoized(elements, roadmap1);
    const result2 = computePlateauSnapshotsMemoized(elements, roadmap2);

    expect(result1.snapshots).not.toBe(result2.snapshots);
  });

  test('recomputes when roadmap version changes', () => {
    const elements = [makeElement({ id: 'e1' })];
    const waves = [makeWave({ waveNumber: 1, elements: [makeWaveElement({ elementId: 'e1' })] })];
    const roadmap1 = makeRoadmap(waves, { id: 'roadmap-1', version: 1 });
    const roadmap2 = makeRoadmap(waves, { id: 'roadmap-1', version: 2 });

    const result1 = computePlateauSnapshotsMemoized(elements, roadmap1);
    const result2 = computePlateauSnapshotsMemoized(elements, roadmap2);

    expect(result1.snapshots).not.toBe(result2.snapshots);
  });

  test('recomputes when elements reference changes', () => {
    const elements1 = [makeElement({ id: 'e1' })];
    const elements2 = [makeElement({ id: 'e1' })]; // same content, different reference
    const waves = [makeWave({ waveNumber: 1, elements: [makeWaveElement({ elementId: 'e1' })] })];
    const roadmap = makeRoadmap(waves, { id: 'memo-ref-test' });

    const result1 = computePlateauSnapshotsMemoized(elements1, roadmap);
    const result2 = computePlateauSnapshotsMemoized(elements2, roadmap);

    expect(result1.snapshots).not.toBe(result2.snapshots);
  });
});
