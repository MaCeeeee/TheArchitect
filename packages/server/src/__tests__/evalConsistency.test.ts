/**
 * Konsistenz-Eval Tests — Zwei-Ansichten-Prinzip (THE-380 / UC-EVAL-001)
 *
 * Run: cd packages/server && npx jest src/__tests__/evalConsistency.test.ts --verbose
 */
import fs from 'node:fs';
import path from 'node:path';
import {
  jaccard,
  pairOutcome,
  aggregateConsistency,
  seededShuffle,
  seedFromString,
  ConsistencySetSchema,
} from '../evals/consistency';
import { cacheKeyFor } from '../evals/predictionCache';

describe('jaccard()', () => {
  it('identical sets → 1, disjoint → 0', () => {
    expect(jaccard(['a', 'b'], ['b', 'a'])).toBe(1);
    expect(jaccard(['a'], ['b'])).toBe(0);
  });

  it('both empty → 1 (Einigkeit auf "nichts"), one empty → 0', () => {
    expect(jaccard([], [])).toBe(1);
    expect(jaccard(['a'], [])).toBe(0);
  });

  it('partial overlap', () => {
    // {a,b} vs {b,c}: |∩|=1, |∪|=3
    expect(jaccard(['a', 'b'], ['b', 'c'])).toBeCloseTo(1 / 3, 5);
  });

  it('ignores duplicates (set semantics)', () => {
    expect(jaccard(['a', 'a', 'b'], ['a', 'b'])).toBe(1);
  });
});

describe('pairOutcome()', () => {
  it('computes disagreement lists and exactMatch', () => {
    const o = pairOutcome({
      caseId: 'c1',
      source: 'dsgvo',
      mode: 'language',
      viewALabel: 'de',
      viewBLabel: 'en',
      predictedA: ['x', 'y'],
      predictedB: ['y', 'z'],
    });
    expect(o.exactMatch).toBe(false);
    expect(o.onlyA).toEqual(['x']);
    expect(o.onlyB).toEqual(['z']);
    expect(o.jaccard).toBeCloseTo(1 / 3, 5);
  });

  it('exact match regardless of order', () => {
    const o = pairOutcome({
      caseId: 'c1',
      source: 'dsgvo',
      mode: 'candidate-order',
      viewALabel: 'original',
      viewBLabel: 'shuffled',
      predictedA: ['a', 'b'],
      predictedB: ['b', 'a'],
    });
    expect(o.exactMatch).toBe(true);
    expect(o.onlyA).toEqual([]);
    expect(o.onlyB).toEqual([]);
  });
});

describe('aggregateConsistency()', () => {
  it('aggregates mean jaccard, exact-match rate and disagreements', () => {
    const outcomes = [
      pairOutcome({ caseId: 'c1', source: 's', mode: 'm', viewALabel: 'a', viewBLabel: 'b', predictedA: ['x'], predictedB: ['x'] }),
      pairOutcome({ caseId: 'c2', source: 's', mode: 'm', viewALabel: 'a', viewBLabel: 'b', predictedA: ['x'], predictedB: ['y'] }),
    ];
    const s = aggregateConsistency(outcomes);
    expect(s.pairs).toBe(2);
    expect(s.meanJaccard).toBeCloseTo(0.5, 5);
    expect(s.exactMatchRate).toBe(0.5);
    expect(s.disagreements).toBe(1);
  });

  it('empty input yields zeros', () => {
    expect(aggregateConsistency([])).toEqual({ pairs: 0, meanJaccard: 0, exactMatchRate: 0, disagreements: 0 });
  });
});

describe('seededShuffle() / seedFromString()', () => {
  it('is deterministic: same input + seed → same permutation', () => {
    const items = ['a', 'b', 'c', 'd', 'e'];
    const seed = seedFromString('case-1');
    expect(seededShuffle(items, seed)).toEqual(seededShuffle(items, seed));
  });

  it('is a permutation (same elements) and does not mutate input', () => {
    const items = ['a', 'b', 'c', 'd', 'e'];
    const copy = [...items];
    const shuffled = seededShuffle(items, 123);
    expect(items).toEqual(copy);
    expect([...shuffled].sort()).toEqual([...items].sort());
  });

  it('seedFromString is stable and differs across ids', () => {
    expect(seedFromString('case-1')).toBe(seedFromString('case-1'));
    expect(seedFromString('case-1')).not.toBe(seedFromString('case-2'));
  });
});

describe('cacheKeyFor()', () => {
  it('changes when candidate ORDER changes (shuffle views must not collide)', () => {
    const a = cacheKeyFor('text', ['e1', 'e2'], 'model', 'hash');
    const b = cacheKeyFor('text', ['e2', 'e1'], 'model', 'hash');
    expect(a).not.toBe(b);
  });

  it('changes when text/model/prompt change', () => {
    const base = cacheKeyFor('text', ['e1'], 'model', 'hash');
    expect(cacheKeyFor('other', ['e1'], 'model', 'hash')).not.toBe(base);
    expect(cacheKeyFor('text', ['e1'], 'model2', 'hash')).not.toBe(base);
    expect(cacheKeyFor('text', ['e1'], 'model', 'hash2')).not.toBe(base);
  });
});

describe('consistency-pairs seed file', () => {
  it('is schema-valid and views share candidates but differ in language', () => {
    const p = path.join(__dirname, '..', 'evals', 'golden', 'consistency-pairs.v1.json');
    const set = ConsistencySetSchema.parse(JSON.parse(fs.readFileSync(p, 'utf8')));
    expect(set.cases.length).toBeGreaterThanOrEqual(1);
    for (const c of set.cases) {
      expect(c.viewA.language).not.toBe(c.viewB.language);
      expect(c.candidates.length).toBeGreaterThanOrEqual(2);
    }
  });
});
