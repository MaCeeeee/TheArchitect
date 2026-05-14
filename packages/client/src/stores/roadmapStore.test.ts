import { describe, test, expect, beforeEach, vi } from 'vitest';
import { useRoadmapStore } from './roadmapStore';
import type { TransformationRoadmap, RoadmapWave, WaveMetrics, WaveElement } from '@thearchitect/shared';
import type { PlateauInputElement } from '../utils/plateauComputation';

// ─── Test Helpers ───

function makeElement(id: string, overrides?: Partial<PlateauInputElement>): PlateauInputElement {
  return {
    id,
    name: `Element ${id}`,
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

function makeWaveElement(elementId: string, overrides?: Partial<WaveElement>): WaveElement {
  return {
    elementId,
    name: `WE ${elementId}`,
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

function makeWave(waveNumber: number, overrides?: Partial<RoadmapWave>): RoadmapWave {
  return {
    waveNumber,
    name: `Wave ${waveNumber}`,
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
    id: `roadmap-${Date.now()}`,
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
      totalCost: 10000,
      totalDurationMonths: 6,
      totalElements: 3,
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

describe('roadmapStore — Plateau Actions', () => {
  beforeEach(() => {
    // Reset store to initial state
    useRoadmapStore.getState().clear();
  });

  // ─── Initial State ───

  test('initial plateau state is inactive', () => {
    const state = useRoadmapStore.getState();
    expect(state.isPlateauViewActive).toBe(false);
    expect(state.selectedPlateauIndex).toBeNull();
    expect(state.plateauSnapshots).toEqual([]);
    expect(state.crossPlateauDeps).toEqual([]);
    expect(state.plateauViewMode).toBe('full');
  });

  // ─── activatePlateauView ───

  test('activatePlateauView computes snapshots and sets active', () => {
    const waves = [
      makeWave(1, { elements: [makeWaveElement('e1')] }),
      makeWave(2, { elements: [makeWaveElement('e2', { targetStatus: 'target' })] }),
    ];
    const roadmap = makeRoadmap(waves);
    const elements = [makeElement('e1'), makeElement('e2')];

    // Set activeRoadmap first
    useRoadmapStore.setState({ activeRoadmap: roadmap });
    useRoadmapStore.getState().activatePlateauView(elements);

    const state = useRoadmapStore.getState();
    expect(state.isPlateauViewActive).toBe(true);
    expect(state.selectedPlateauIndex).toBe(0);
    expect(state.plateauSnapshots).toHaveLength(3); // As-Is + 2 waves
  });

  test('activatePlateauView does nothing without activeRoadmap', () => {
    const elements = [makeElement('e1')];
    useRoadmapStore.getState().activatePlateauView(elements);

    expect(useRoadmapStore.getState().isPlateauViewActive).toBe(false);
  });

  test('activatePlateauView does nothing when roadmap status is not completed', () => {
    const roadmap = makeRoadmap(
      [makeWave(1, { elements: [makeWaveElement('e1')] })],
      { status: 'generating' },
    );
    useRoadmapStore.setState({ activeRoadmap: roadmap });
    useRoadmapStore.getState().activatePlateauView([makeElement('e1')]);

    expect(useRoadmapStore.getState().isPlateauViewActive).toBe(false);
  });

  test('activatePlateauView does nothing when roadmap has 0 waves', () => {
    const roadmap = makeRoadmap([], { status: 'completed' });
    useRoadmapStore.setState({ activeRoadmap: roadmap });
    useRoadmapStore.getState().activatePlateauView([makeElement('e1')]);

    expect(useRoadmapStore.getState().isPlateauViewActive).toBe(false);
  });

  // ─── deactivatePlateauView ───

  test('deactivatePlateauView resets active state but preserves snapshots', () => {
    const waves = [makeWave(1, { elements: [makeWaveElement('e1')] })];
    const roadmap = makeRoadmap(waves);
    useRoadmapStore.setState({ activeRoadmap: roadmap });
    useRoadmapStore.getState().activatePlateauView([makeElement('e1')]);

    // Verify it was activated
    expect(useRoadmapStore.getState().isPlateauViewActive).toBe(true);

    // Deactivate
    useRoadmapStore.getState().deactivatePlateauView();

    const state = useRoadmapStore.getState();
    expect(state.isPlateauViewActive).toBe(false);
    expect(state.selectedPlateauIndex).toBeNull();
    // Snapshots are NOT cleared (allows re-activation without recomputation)
    expect(state.plateauSnapshots.length).toBeGreaterThan(0);
  });

  // ─── selectPlateau ───

  test('selectPlateau updates selectedPlateauIndex', () => {
    useRoadmapStore.getState().selectPlateau(3);
    expect(useRoadmapStore.getState().selectedPlateauIndex).toBe(3);

    useRoadmapStore.getState().selectPlateau(0);
    expect(useRoadmapStore.getState().selectedPlateauIndex).toBe(0);

    useRoadmapStore.getState().selectPlateau(null);
    expect(useRoadmapStore.getState().selectedPlateauIndex).toBeNull();
  });

  // ─── setPlateauViewMode ───

  test('setPlateauViewMode toggles between full and changed-only', () => {
    expect(useRoadmapStore.getState().plateauViewMode).toBe('full');

    useRoadmapStore.getState().setPlateauViewMode('changed-only');
    expect(useRoadmapStore.getState().plateauViewMode).toBe('changed-only');

    useRoadmapStore.getState().setPlateauViewMode('full');
    expect(useRoadmapStore.getState().plateauViewMode).toBe('full');
  });

  // ─── computePlateaus ───

  test('computePlateaus recalculates with current activeRoadmap', () => {
    const waves = [
      makeWave(1, { elements: [makeWaveElement('e1')], metrics: makeWaveMetrics({ totalCost: 5000 }) }),
    ];
    const roadmap = makeRoadmap(waves);
    useRoadmapStore.setState({ activeRoadmap: roadmap });

    useRoadmapStore.getState().computePlateaus([makeElement('e1')]);

    const state = useRoadmapStore.getState();
    expect(state.plateauSnapshots).toHaveLength(2);
    expect(state.plateauSnapshots[1].cumulativeCost).toBe(5000);
  });

  test('computePlateaus clears when no activeRoadmap', () => {
    useRoadmapStore.setState({
      plateauSnapshots: [{} as any],
      crossPlateauDeps: [{} as any],
    });

    useRoadmapStore.getState().computePlateaus([makeElement('e1')]);

    expect(useRoadmapStore.getState().plateauSnapshots).toEqual([]);
    expect(useRoadmapStore.getState().crossPlateauDeps).toEqual([]);
  });

  // ─── clear ───

  test('clear resets all plateau state', () => {
    const waves = [makeWave(1, { elements: [makeWaveElement('e1')] })];
    const roadmap = makeRoadmap(waves);
    useRoadmapStore.setState({ activeRoadmap: roadmap });
    useRoadmapStore.getState().activatePlateauView([makeElement('e1')]);
    useRoadmapStore.getState().selectPlateau(1);
    useRoadmapStore.getState().setPlateauViewMode('changed-only');

    // Clear everything
    useRoadmapStore.getState().clear();

    const state = useRoadmapStore.getState();
    expect(state.isPlateauViewActive).toBe(false);
    expect(state.selectedPlateauIndex).toBeNull();
    expect(state.plateauSnapshots).toEqual([]);
    expect(state.crossPlateauDeps).toEqual([]);
    expect(state.plateauViewMode).toBe('full');
    expect(state.activeRoadmap).toBeNull();
  });

  // ─── Cross-Plateau Dependencies ───

  test('activatePlateauView computes cross-plateau dependencies', () => {
    const elements = [makeElement('e1'), makeElement('e2')];
    const waves = [
      makeWave(1, { elements: [makeWaveElement('e1')] }),
      makeWave(2, { elements: [makeWaveElement('e2', { dependsOnElementIds: ['e1'] })] }),
    ];
    const roadmap = makeRoadmap(waves);
    useRoadmapStore.setState({ activeRoadmap: roadmap });
    useRoadmapStore.getState().activatePlateauView(elements);

    const deps = useRoadmapStore.getState().crossPlateauDeps;
    expect(deps).toHaveLength(1);
    expect(deps[0].sourceElementId).toBe('e1');
    expect(deps[0].targetElementId).toBe('e2');
  });

  // ─── REQ-PLATEAU-004 — applyImplementationToggle ───
  describe('applyImplementationToggle', () => {
    test('marks element implemented and bumps roadmap version', () => {
      const waves = [makeWave(1, { elements: [makeWaveElement('e1')] })];
      const roadmap = makeRoadmap(waves, { version: 1 });
      useRoadmapStore.setState({ activeRoadmap: roadmap });

      useRoadmapStore.getState().applyImplementationToggle(1, 'e1', true);

      const after = useRoadmapStore.getState().activeRoadmap!;
      expect(after.version).toBe(2);
      const we = after.waves[0].elements[0];
      expect(we.implementedAt).toBeTruthy();
      expect(typeof we.implementedAt).toBe('string');
    });

    test('un-implements element when implemented=false', () => {
      const waves = [makeWave(1, {
        elements: [makeWaveElement('e1', { implementedAt: '2026-05-13T10:00:00Z' })],
      })];
      const roadmap = makeRoadmap(waves);
      useRoadmapStore.setState({ activeRoadmap: roadmap });

      useRoadmapStore.getState().applyImplementationToggle(1, 'e1', false);

      const we = useRoadmapStore.getState().activeRoadmap!.waves[0].elements[0];
      expect(we.implementedAt).toBeNull();
    });

    test('leaves unrelated waves and elements unchanged', () => {
      const waves = [
        makeWave(1, { elements: [makeWaveElement('e1'), makeWaveElement('e2')] }),
        makeWave(2, { elements: [makeWaveElement('e3')] }),
      ];
      useRoadmapStore.setState({ activeRoadmap: makeRoadmap(waves) });

      useRoadmapStore.getState().applyImplementationToggle(1, 'e1', true);

      const after = useRoadmapStore.getState().activeRoadmap!;
      expect(after.waves[0].elements[0].implementedAt).toBeTruthy();
      expect(after.waves[0].elements[1].implementedAt).toBeFalsy();
      expect(after.waves[1].elements[0].implementedAt).toBeFalsy();
    });

    test('no-op when activeRoadmap is null', () => {
      useRoadmapStore.setState({ activeRoadmap: null });
      // Should not throw
      useRoadmapStore.getState().applyImplementationToggle(1, 'e1', true);
      expect(useRoadmapStore.getState().activeRoadmap).toBeNull();
    });
  });
});
