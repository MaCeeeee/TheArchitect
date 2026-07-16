import { describe, test, expect } from 'vitest';
import { STATIONS } from './stations';

describe('station conformance gate mapping (THE-487)', () => {
  const gateOf = (k: string) => STATIONS.find((s) => s.key === k)!.conformanceGate;
  test('explore/govern/track carry their gate; others have none', () => {
    expect(gateOf('explore')).toBe('Cover');
    expect(gateOf('govern')).toBe('Enforce');
    expect(gateOf('track')).toBe('Attest');
    expect(gateOf('vision')).toBeUndefined();
    expect(gateOf('model')).toBeUndefined();
    expect(gateOf('plan')).toBeUndefined();
  });
});
