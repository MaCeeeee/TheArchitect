import { describe, test, expect } from 'vitest';
import { computeRoadmapProgress } from './roadmapProgress';
import type { RoadmapWave, WaveElement, WaveMetrics } from '@thearchitect/shared';

// ─── Test Helpers ───

const metrics: WaveMetrics = {
  totalCost: 0,
  riskDelta: 0,
  complianceImpact: 0,
  elementCount: 0,
} as unknown as WaveMetrics;

function makeElement(
  id: string,
  implementedAt: string | null | undefined = null
): WaveElement {
  return {
    elementId: id,
    name: `Element ${id}`,
    type: 'application_component',
    layer: 'application',
    currentStatus: 'current',
    targetStatus: 'target',
    estimatedCost: 0,
    riskScore: 0,
    dependsOnElementIds: [],
    implementedAt,
  } as unknown as WaveElement;
}

function makeWave(waveNumber: number, elements: WaveElement[]): RoadmapWave {
  return {
    waveNumber,
    name: `Wave ${waveNumber}`,
    description: '',
    elements,
    metrics,
    estimatedDurationMonths: 1,
  } as unknown as RoadmapWave;
}

// ─── Tests ───

describe('computeRoadmapProgress (REQ-PLATEAU-005)', () => {
  test('empty roadmap → 0/0, 0%, no next', () => {
    expect(computeRoadmapProgress([])).toEqual({
      implemented: 0,
      total: 0,
      pct: 0,
      next: null,
    });
  });

  test('wave with zero elements contributes nothing', () => {
    const result = computeRoadmapProgress([makeWave(1, [])]);
    expect(result).toEqual({ implemented: 0, total: 0, pct: 0, next: null });
  });

  test('AC-1: counts implemented across all waves with rounded pct', () => {
    // 5 of 31 implemented → 16%
    const waves: RoadmapWave[] = [];
    let n = 0;
    for (let w = 1; w <= 4; w++) {
      const els: WaveElement[] = [];
      for (let i = 0; i < (w === 4 ? 7 : 8); i++) {
        n++;
        els.push(makeElement(`e${n}`, n <= 5 ? '2026-07-01T00:00:00.000Z' : null));
      }
      waves.push(makeWave(w, els));
    }
    const result = computeRoadmapProgress(waves);
    expect(result.total).toBe(31);
    expect(result.implemented).toBe(5);
    expect(result.pct).toBe(16);
  });

  test('AC-2: next = first unimplemented element in wave order', () => {
    const waves = [
      makeWave(1, [
        makeElement('a', '2026-07-01T00:00:00.000Z'),
        makeElement('b', '2026-07-01T00:00:00.000Z'),
      ]),
      makeWave(2, [
        makeElement('c', null),
        makeElement('d', null),
      ]),
    ];
    expect(computeRoadmapProgress(waves).next).toEqual({
      waveNumber: 2,
      elementId: 'c',
    });
  });

  test('next skips implemented gaps within a wave', () => {
    const waves = [
      makeWave(1, [
        makeElement('a', '2026-07-01T00:00:00.000Z'),
        makeElement('b', null),
        makeElement('c', '2026-07-01T00:00:00.000Z'),
      ]),
    ];
    const result = computeRoadmapProgress(waves);
    expect(result.next).toEqual({ waveNumber: 1, elementId: 'b' });
    expect(result.implemented).toBe(2);
    expect(result.pct).toBe(67);
  });

  test('AC-3: all implemented → next is null, pct 100', () => {
    const waves = [
      makeWave(1, [
        makeElement('a', '2026-07-01T00:00:00.000Z'),
        makeElement('b', '2026-07-01T00:00:00.000Z'),
      ]),
    ];
    expect(computeRoadmapProgress(waves)).toEqual({
      implemented: 2,
      total: 2,
      pct: 100,
      next: null,
    });
  });

  test('undefined implementedAt (legacy documents) counts as unimplemented', () => {
    const waves = [makeWave(1, [makeElement('a', undefined)])];
    const result = computeRoadmapProgress(waves);
    expect(result.implemented).toBe(0);
    expect(result.next).toEqual({ waveNumber: 1, elementId: 'a' });
  });
});
