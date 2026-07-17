import { describe, test, expect } from 'vitest';
import { stationSalience, RECEDE, type SalienceContext } from './stationSalience';

const el = (over: Record<string, unknown> = {}) =>
  ({ id: 'e', layer: 'application', annualCost: 0, ...over }) as never;

const ctx = (over: Partial<SalienceContext> = {}): SalienceContext => ({
  degreeById: new Map(), coverageGapIds: new Set(), violationIds: new Set(),
  costById: new Map(), roadmapElementIds: new Set(), selectedId: null,
  hasData: { explore: true, govern: true, plan: true, track: true },
  ...over,
});

describe('stationSalience (THE-500)', () => {
  test('Model shows everything at full salience (home view)', () => {
    expect(stationSalience(el(), 'model', ctx())).toBe(1);
  });
  test('Vision lifts motivation/strategy, recedes lower layers', () => {
    expect(stationSalience(el({ layer: 'motivation' }), 'vision', ctx())).toBe(1);
    expect(stationSalience(el({ layer: 'technology' }), 'vision', ctx())).toBe(RECEDE);
  });
  test('Explore: coverage gaps salient, covered recede', () => {
    const c = ctx({ coverageGapIds: new Set(['e']) });
    expect(stationSalience(el({ id: 'e' }), 'explore', c)).toBe(1);
    expect(stationSalience(el({ id: 'x' }), 'explore', c)).toBe(RECEDE);
  });
  test('Govern: violators salient, conform recede', () => {
    const c = ctx({ violationIds: new Set(['e']) });
    expect(stationSalience(el({ id: 'e' }), 'govern', c)).toBe(1);
    expect(stationSalience(el({ id: 'x' }), 'govern', c)).toBe(RECEDE);
  });
  test('Plan: roadmap members salient, rest recede', () => {
    const c = ctx({ roadmapElementIds: new Set(['e']) });
    expect(stationSalience(el({ id: 'e' }), 'plan', c)).toBe(1);
    expect(stationSalience(el({ id: 'x' }), 'plan', c)).toBe(RECEDE);
  });
  test('fallback: absent phase-data → full salience (no empty re-form)', () => {
    const c = ctx({ hasData: { explore: false, govern: false, plan: false, track: false } });
    expect(stationSalience(el(), 'explore', c)).toBe(1);
    expect(stationSalience(el(), 'plan', c)).toBe(1);
  });
});
