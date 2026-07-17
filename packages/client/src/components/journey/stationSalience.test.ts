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

import { forcedLabelIds, FORCED_LABEL_MAX } from './stationSalience';

describe('forcedLabelIds (THE-500 label-wall fix, user-reported)', () => {
  const map = (entries: [string, number][]) => new Map(entries);

  test('all-salient station (Model/fallbacks) forces NO labels — no label wall', () => {
    const m = map([['a', 1], ['b', 1], ['c', 1]]);
    expect(forcedLabelIds(m).size).toBe(0);
  });

  test('discriminating station with a small salient set forces exactly those labels', () => {
    const m = map([['a', 1], ['b', 0.18], ['c', 0.18]]);
    expect([...forcedLabelIds(m)]).toEqual(['a']);
  });

  test('salient set above the cap forces no labels (visual pop still applies)', () => {
    const entries: [string, number][] = [];
    for (let i = 0; i < FORCED_LABEL_MAX + 1; i++) entries.push([`s${i}`, 1]);
    entries.push(['r', 0.18]);
    expect(forcedLabelIds(map(entries)).size).toBe(0);
  });

  test('all-receded (empty focus) forces no labels', () => {
    expect(forcedLabelIds(map([['a', 0.18]])).size).toBe(0);
  });
});
