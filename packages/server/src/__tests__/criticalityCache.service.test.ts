/**
 * REQ-CRIT-006 — Cache service unit tests
 *
 * Run: cd packages/server && npx jest src/__tests__/criticalityCache.service.test.ts
 */

import { computeInputHash } from '../services/criticalityCache.service';
import { DEFAULT_FACTOR_WEIGHTS } from '@thearchitect/shared';

describe('computeInputHash', () => {
  const baseInput = {
    elementIds: ['e1', 'e2', 'e3'],
    connectionEdges: [
      ['e1', 'e2'],
      ['e2', 'e3'],
    ] as Array<[string, string]>,
    mappingKeys: ['e1:compliant', 'e2:gap'],
    waveCount: 2,
    weights: DEFAULT_FACTOR_WEIGHTS,
  };

  test('1. returns same hash for identical inputs', () => {
    const h1 = computeInputHash(baseInput);
    const h2 = computeInputHash(baseInput);
    expect(h1).toBe(h2);
  });

  test('2. order of elementIds does not change hash', () => {
    const h1 = computeInputHash(baseInput);
    const h2 = computeInputHash({ ...baseInput, elementIds: ['e3', 'e1', 'e2'] });
    expect(h1).toBe(h2);
  });

  test('3. order of connectionEdges does not change hash', () => {
    const h1 = computeInputHash(baseInput);
    const h2 = computeInputHash({
      ...baseInput,
      connectionEdges: [
        ['e2', 'e3'],
        ['e1', 'e2'],
      ],
    });
    expect(h1).toBe(h2);
  });

  test('4. adding an element changes the hash', () => {
    const h1 = computeInputHash(baseInput);
    const h2 = computeInputHash({ ...baseInput, elementIds: ['e1', 'e2', 'e3', 'e4'] });
    expect(h1).not.toBe(h2);
  });

  test('5. changing a weight changes the hash', () => {
    const h1 = computeInputHash(baseInput);
    const h2 = computeInputHash({
      ...baseInput,
      weights: { ...DEFAULT_FACTOR_WEIGHTS, spof: 2.0 },
    });
    expect(h1).not.toBe(h2);
  });

  test('6. mapping status change invalidates hash', () => {
    const h1 = computeInputHash(baseInput);
    const h2 = computeInputHash({
      ...baseInput,
      mappingKeys: ['e1:compliant', 'e2:compliant'], // e2 changed from gap → compliant
    });
    expect(h1).not.toBe(h2);
  });

  test('7. wave count change invalidates hash', () => {
    const h1 = computeInputHash(baseInput);
    const h2 = computeInputHash({ ...baseInput, waveCount: 3 });
    expect(h1).not.toBe(h2);
  });

  test('8. hash is a 16-char hex string', () => {
    const h = computeInputHash(baseInput);
    expect(h).toMatch(/^[0-9a-f]{16}$/);
  });
});
