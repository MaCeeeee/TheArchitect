// @vitest-environment jsdom
// packages/client/src/components/journey/stationTempo.test.ts
import { describe, test, expect, beforeEach, vi, afterEach } from 'vitest';
import { decideTempo, markStationSeen, getSeenStations, prefersReducedMotion } from './stationTempo';

beforeEach(() => localStorage.clear());
afterEach(() => vi.unstubAllGlobals());

describe('stationTempo (THE-494, ADR-0005 #8)', () => {
  test('first arrival is cinematic; after markStationSeen it is instant', () => {
    expect(decideTempo('p1', 'model')).toBe('cinematic');
    markStationSeen('p1', 'model');
    expect(decideTempo('p1', 'model')).toBe('instant');
    // other stations and other projects are unaffected
    expect(decideTempo('p1', 'track')).toBe('cinematic');
    expect(decideTempo('p2', 'model')).toBe('cinematic');
  });

  test('persists per project as ta_seen_stations:{projectId}', () => {
    markStationSeen('p1', 'model');
    markStationSeen('p1', 'govern');
    expect(JSON.parse(localStorage.getItem('ta_seen_stations:p1')!).sort()).toEqual(['govern', 'model']);
    expect(getSeenStations('p1').has('govern')).toBe(true);
  });

  test('prefers-reduced-motion forces instant regardless of seen-state', () => {
    vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({ matches: true }));
    expect(decideTempo('p1', 'model')).toBe('instant'); // never seen, still instant
  });

  test('prefersReducedMotion is false when matchMedia is unavailable (jsdom default)', () => {
    expect(prefersReducedMotion()).toBe(false);
  });

  test('corrupt storage falls back to cinematic, never throws', () => {
    localStorage.setItem('ta_seen_stations:p1', '{not json');
    expect(decideTempo('p1', 'model')).toBe('cinematic');
  });
});
