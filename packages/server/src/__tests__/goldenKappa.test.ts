/**
 * golden-kappa Tests — Doppel-Labeling-Werkzeug (THE-379 / RUBRIC.md §7)
 *
 * Run: cd packages/server && npx jest src/__tests__/goldenKappa.test.ts
 */
import { compareGoldenSets, makeBlindCopy } from '../scripts/golden-kappa';
import { GoldenSetSchema, type GoldenSet } from '../evals/goldenSet';

function set(cases: Array<{ caseId: string; gold: string[]; candidateIds?: string[] }>): GoldenSet {
  return GoldenSetSchema.parse({
    version: 'vX',
    frozen: false,
    cases: cases.map(c => ({
      caseId: c.caseId,
      source: 'dsgvo',
      paragraphNumber: 'Art. 1',
      fullText: 'x'.repeat(60),
      language: 'de',
      jurisdiction: 'EU',
      candidates: (c.candidateIds ?? ['e1', 'e2', 'e3']).map(id => ({
        id,
        name: `El ${id}`,
        type: 'application',
      })),
      goldElementIds: c.gold,
    })),
  });
}

describe('compareGoldenSets()', () => {
  it('perfect agreement → kappa 1, no disagreements', () => {
    const a = set([{ caseId: 'c1', gold: ['e1'] }, { caseId: 'c2', gold: [] }]);
    const b = set([{ caseId: 'c1', gold: ['e1'] }, { caseId: 'c2', gold: [] }]);
    const r = compareGoldenSets(a, b);
    expect(r.sharedCases).toBe(2);
    expect(r.pairs).toBe(6);
    expect(r.agreementRate).toBe(1);
    expect(r.kappa).toBe(1);
    expect(r.disagreements).toEqual([]);
  });

  it('lists each disagreement with both labels', () => {
    const a = set([{ caseId: 'c1', gold: ['e1', 'e2'] }]);
    const b = set([{ caseId: 'c1', gold: ['e1', 'e3'] }]);
    const r = compareGoldenSets(a, b);
    expect(r.disagreements).toHaveLength(2);
    expect(r.disagreements).toContainEqual({ caseId: 'c1', elementId: 'e2', a: 'match', b: 'no-match' });
    expect(r.disagreements).toContainEqual({ caseId: 'c1', elementId: 'e3', a: 'no-match', b: 'match' });
    expect(r.kappa).toBeLessThan(1);
  });

  it('compares only shared cases and shared candidates', () => {
    const a = set([
      { caseId: 'c1', gold: ['e1'], candidateIds: ['e1', 'e2', 'extra-only-a'] },
      { caseId: 'only-a', gold: [] },
    ]);
    const b = set([
      { caseId: 'c1', gold: ['e1'], candidateIds: ['e1', 'e2'] },
      { caseId: 'only-b', gold: [] },
    ]);
    const r = compareGoldenSets(a, b);
    expect(r.sharedCases).toBe(1);
    expect(r.pairs).toBe(2); // e1, e2 — extra-only-a nicht vergleichbar
    expect(r.unmatchedCaseIds.sort()).toEqual(['only-a', 'only-b']);
  });

  it('empty intersection yields zeroed result (no crash)', () => {
    const r = compareGoldenSets(set([{ caseId: 'a', gold: [] }]), set([{ caseId: 'b', gold: [] }]));
    expect(r.pairs).toBe(0);
    expect(r.kappa).toBe(0);
  });
});

describe('makeBlindCopy()', () => {
  it('strips gold, notes, ambiguous, annotator and stays schema-valid', () => {
    const a = set([{ caseId: 'c1', gold: ['e1'] }]);
    a.cases[0].notes = 'A-Begründung, darf B nicht sehen';
    a.cases[0].ambiguous = true;
    a.cases[0].annotator = 'A';
    a.cases[0].labeledAt = '2026-07-03';

    const blind = makeBlindCopy(a);
    expect(blind.version).toBe('vX-blind');
    expect(blind.cases[0].goldElementIds).toEqual([]);
    expect(blind.cases[0].notes).toBeUndefined();
    expect(blind.cases[0].ambiguous).toBeUndefined();
    expect(blind.cases[0].annotator).toBeUndefined();
    // Kandidaten + Texte bleiben identisch (B braucht denselben Kontext)
    expect(blind.cases[0].candidates).toEqual(a.cases[0].candidates);
    expect(blind.cases[0].fullText).toBe(a.cases[0].fullText);
    // Roundtrip durch das Schema (wie beim Speichern/Laden)
    expect(() => GoldenSetSchema.parse(JSON.parse(JSON.stringify(blind)))).not.toThrow();
    // Original unangetastet
    expect(a.cases[0].goldElementIds).toEqual(['e1']);
  });
});
