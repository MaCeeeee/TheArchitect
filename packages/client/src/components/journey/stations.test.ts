import { describe, test, expect } from 'vitest';
import { STATIONS, DEFAULT_STATION, isStationKey, stationForPhase } from './stations';

describe('stations (ADR-0005 vocabulary)', () => {
  test('exposes the six CONTEXT.md stations in ADM order', () => {
    expect(STATIONS.map((s) => s.key)).toEqual(['vision', 'model', 'explore', 'plan', 'govern', 'track']);
    expect(STATIONS.map((s) => s.label)).toEqual(['Vision', 'Model', 'Explore', 'Plan', 'Govern', 'Track']);
    expect(STATIONS.map((s) => s.phase)).toEqual([1, 2, 3, 4, 5, 6]);
  });

  test('every station carries an ADM badge', () => {
    // Deliberately literal: admBadge is derived from journeyStore's PHASE_CONFIG,
    // so these strings pin the contract — if the store's admLabel values ever
    // change, this test fails loudly instead of the badges drifting silently.
    expect(STATIONS.map((s) => s.admBadge)).toEqual([
      'Phase A', 'Phases B-D', 'Phase E', 'Phase F', 'Phase G', 'Phase H',
    ]);
  });

  test('default station is model', () => {
    expect(DEFAULT_STATION).toBe('model');
  });

  test('isStationKey narrows correctly', () => {
    expect(isStationKey('govern')).toBe(true);
    expect(isStationKey('compliance')).toBe(false);
    expect(isStationKey(undefined)).toBe(false);
  });

  test('stationForPhase maps 1:1', () => {
    ([1, 2, 3, 4, 5, 6] as const).forEach((p) => expect(stationForPhase(p).phase).toBe(p));
    expect(stationForPhase(4).key).toBe('plan');
  });

  test('classic escape routes point into the old UI namespace', () => {
    const expected: Record<string, string> = {
      vision: '/project/p1',
      model: '/project/p1',
      explore: '/project/p1/compliance/standards',
      plan: '/project/p1/compliance/roadmap',
      govern: '/project/p1/compliance/policies',
      track: '/project/p1/compliance/audit',
    };
    for (const s of STATIONS) {
      expect(s.classicRoute('p1')).toBe(expected[s.key]);
    }
  });
});
