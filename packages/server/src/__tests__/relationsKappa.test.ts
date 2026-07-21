/**
 * relations-kappa Tests — Doppel-Labeling-Werkzeug für das Relations-Golden-
 * Set (THE-421, RUBRIC.md §7). Präzedenzfall: typingKappa.test.ts — aber die
 * Relations-Klasse ist EINE kombinierte type+direction-Achse
 * (relationLabelForKappa), nicht mehrere unabhängige Achsen, und die
 * Negativ-Klasse ('__none__') dominiert das Set (Class Imbalance) statt
 * gleichverteilt zu sein.
 *
 * Run: cd packages/server && npx jest src/__tests__/relationsKappa.test.ts
 */
import { makeBlindRelationsCopy, compareRelationsSets } from '../scripts/relations-kappa';
import {
  RelationsGoldenSetSchema,
  type RelationsGoldenSet,
  type RelationsGoldenCase,
  type RelationsGoldenPairSide,
} from '../evals/relationsGolden';

function side(regulationKey: string, source: string, overrides: Partial<RelationsGoldenPairSide> = {}): RelationsGoldenPairSide {
  return {
    regulationKey,
    source,
    paragraphNumber: 'art-1',
    fullText: `Volltext für ${regulationKey} — genug Zeichen, um die Schema-Mindestlänge zu erfüllen.`,
    language: 'de',
    ...overrides,
  };
}

const sideA = side('dora:art-1', 'dora');
const sideB = side('nis2:art-1', 'nis2');

function set(cases: Array<Record<string, unknown>>): RelationsGoldenSet {
  return RelationsGoldenSetSchema.parse({
    version: 'vX',
    frozen: false,
    ontologyVersion: 'norm-ontology.v1',
    rubricRef: 'RUBRIC.md',
    cases,
  });
}

/** One case, defaulting to the dora×nis2 pair; pass relation/direction (or leave open). */
function caseFixture(caseId: string, extra: Record<string, unknown> = {}): Record<string, unknown> {
  return { caseId, a: sideA, b: sideB, ...extra };
}

describe('makeBlindRelationsCopy()', () => {
  const prelabeledSet = set([
    caseFixture('case-1', {
      relation: 'DEROGATED_BY',
      direction: 'a-to-b',
      ambiguous: true,
      notes: 'LLM-Vorschlag: DORA verdrängt NIS2 für Finanzunternehmen',
      annotator: 'A',
      labeledAt: '2026-07-20',
    }),
  ]);

  it('blind copy strips relation, direction and every trace of the first pass', () => {
    const blind = makeBlindRelationsCopy(prelabeledSet);
    for (const c of blind.cases) {
      expect(c.relation).toBeUndefined();
      expect(c.direction).toBeUndefined();
      expect(c.annotator).toBeUndefined();
      expect(c.notes).toBeUndefined();
      expect(c.ambiguous).toBeUndefined();
      expect(c.labeledAt).toBeUndefined();
    }
    expect(blind.frozen).toBe(false);
    expect(RelationsGoldenSetSchema.safeParse(blind).success).toBe(true);
  });

  it('keeps both paragraph texts so annotator B can actually label', () => {
    const blind = makeBlindRelationsCopy(prelabeledSet);
    expect(blind.cases[0].a.fullText).toBe(prelabeledSet.cases[0].a.fullText);
    expect(blind.cases[0].b.fullText).toBe(prelabeledSet.cases[0].b.fullText);
    expect(blind.cases[0].caseId).toBe(prelabeledSet.cases[0].caseId);
  });

  it('does not mutate the input set', () => {
    makeBlindRelationsCopy(prelabeledSet);
    expect(prelabeledSet.cases[0].relation).toBe('DEROGATED_BY');
    expect(prelabeledSet.cases[0].direction).toBe('a-to-b');
    expect(prelabeledSet.cases[0].annotator).toBe('A');
  });

  it('suffixes version with -blind', () => {
    const blind = makeBlindRelationsCopy(prelabeledSet);
    expect(blind.version).toBe('vX-blind');
  });
});

describe('compareRelationsSets() — direction as part of the claim', () => {
  it('counts same type but OPPOSITE direction as a disagreement', () => {
    const setDerogatedAtoB = set([caseFixture('case-1', { relation: 'DEROGATED_BY', direction: 'a-to-b' })]);
    const setDerogatedBtoA = set([caseFixture('case-1', { relation: 'DEROGATED_BY', direction: 'b-to-a' })]);
    const r = compareRelationsSets(setDerogatedAtoB, setDerogatedBtoA);
    expect(r.overall.kappa).toBeLessThan(1);
    expect(r.disagreements).toHaveLength(1);
    expect(r.disagreements[0]).toEqual({ caseId: 'case-1', a: 'DEROGATED_BY:a-to-b', b: 'DEROGATED_BY:b-to-a' });
  });
});

describe('compareRelationsSets() — negative class', () => {
  it('treats agreement on "no relation" as real agreement', () => {
    const cases = Array.from({ length: 5 }, (_, i) => caseFixture(`case-${i}`, { relation: null }));
    const setAllNone = set(cases);
    const r = compareRelationsSets(setAllNone, setAllNone);
    expect(r.overall.kappa).toBeCloseTo(1, 6);
    expect(r.overall.pairs).toBe(5);
  });

  it('never gives the no-relation class its own per-type entry, but counts it overall', () => {
    const casesA = [
      ...Array.from({ length: 10 }, (_, i) => caseFixture(`none-${i}`, { relation: null })),
      caseFixture('typed-1', { relation: 'CONCRETIZES', direction: 'a-to-b' }),
    ];
    const casesB = [
      ...Array.from({ length: 10 }, (_, i) => caseFixture(`none-${i}`, { relation: null })),
      caseFixture('typed-1', { relation: 'CONCRETIZES', direction: 'a-to-b' }),
    ];
    const r = compareRelationsSets(set(casesA), set(casesB));
    expect(Object.keys(r.perType)).not.toContain('__none__');
    expect(r.overall.pairs).toBeGreaterThan(0);
    expect(r.overall.pairs).toBe(11);
  });
});

describe('compareRelationsSets() — per-type kappa, n >= 10 gate', () => {
  it('reports a per-type figure only at n >= 10 and marks thinner types', () => {
    const derogated = Array.from({ length: 12 }, (_, i) =>
      caseFixture(`derogated-${i}`, { relation: 'DEROGATED_BY', direction: 'a-to-b' }),
    );
    const interprets = Array.from({ length: 3 }, (_, i) =>
      caseFixture(`interprets-${i}`, { relation: 'INTERPRETS', direction: 'a-to-b' }),
    );
    const setWith12Derogated3Interprets = set([...derogated, ...interprets]);
    const otherRater = set([...derogated, ...interprets]); // full agreement — isolates the n-gate, not kappa math

    const r = compareRelationsSets(setWith12Derogated3Interprets, otherRater);
    expect(r.perType.DEROGATED_BY.n).toBe(12);
    expect(r.perType.DEROGATED_BY.kappa).toBeDefined();
    expect(r.perType.DEROGATED_BY.tooThin).toBeUndefined();
    expect(r.perType.INTERPRETS.n).toBe(3);
    expect(r.perType.INTERPRETS.tooThin).toBe(true);
    expect(r.perType.INTERPRETS.kappa).toBeUndefined();
  });

  it('counts a case toward a type when only ONE rater assigned it (real disagreement, not silently dropped)', () => {
    // 9 cases where both raters agree on DEROGATED_BY, + 1 where A says DEROGATED_BY but B says no relation.
    const agreed = Array.from({ length: 9 }, (_, i) =>
      caseFixture(`agree-${i}`, { relation: 'DEROGATED_BY', direction: 'a-to-b' }),
    );
    const aOnly = caseFixture('disputed-1', { relation: 'DEROGATED_BY', direction: 'a-to-b' });
    const bOnly = caseFixture('disputed-1', { relation: null });

    const r = compareRelationsSets(set([...agreed, aOnly]), set([...agreed, bOnly]));
    expect(r.perType.DEROGATED_BY.n).toBe(10);
    expect(r.perType.DEROGATED_BY.kappa).toBeDefined();
  });
});

describe('compareRelationsSets() — open (unlabeled) cases', () => {
  it('excludes pairs either rater left open and counts them as skipped', () => {
    const setWithOpenCase = set([caseFixture('case-1')]); // relation absent — draft/open
    const fullyLabeled = set([caseFixture('case-1', { relation: 'IMPLEMENTS', direction: 'a-to-b' })]);
    const r = compareRelationsSets(setWithOpenCase, fullyLabeled);
    expect(r.overall.skipped).toBe(1);
    expect(r.overall.pairs).toBe(0);
  });

  it('guards the all-open case so cohenKappaMulti is never called with empty arrays', () => {
    const allOpenA = set([caseFixture('case-1'), caseFixture('case-2')]);
    const allOpenB = set([caseFixture('case-1'), caseFixture('case-2')]);
    expect(() => compareRelationsSets(allOpenA, allOpenB)).not.toThrow();
    const r = compareRelationsSets(allOpenA, allOpenB);
    expect(r.overall.pairs).toBe(0);
    expect(r.overall.skipped).toBe(2);
    expect(r.overall.kappa).toBe(0);
    expect(Number.isNaN(r.overall.kappa)).toBe(false);
  });
});

describe('compareRelationsSets() — unmatched cases', () => {
  it('reports cases present in only one of the two files', () => {
    const setA = set([
      caseFixture('case-1', { relation: 'IMPLEMENTS', direction: 'a-to-b' }),
      caseFixture('case-2', { relation: 'IMPLEMENTS', direction: 'a-to-b' }), // only in A
    ]);
    const setB = set([
      caseFixture('case-1', { relation: 'IMPLEMENTS', direction: 'a-to-b' }),
      caseFixture('case-3', { relation: 'IMPLEMENTS', direction: 'a-to-b' }), // only in B
    ]);
    const r = compareRelationsSets(setA, setB);
    expect(r.unmatchedCaseIds).toContain('case-2');
    expect(r.unmatchedCaseIds).toContain('case-3');
    expect(r.sharedCases).toBe(1);
  });
});
