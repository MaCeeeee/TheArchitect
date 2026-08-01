/**
 * Tests für die Einlese-Prüfungen des menschlichen Golds
 * (THE-382 Slice 1, Task 5).
 *
 * Der Zweck dieser Stufe ist, dass ein Fehler LAUT wird. Ein gefiltertes Gold
 * liefert ein plausibles Kappa auf weniger Fällen, und niemand sieht es.
 */
import { checkPairGold, UNSURE_WARN } from '../scripts/pair-ingest';
import type { PairGold } from '../evals/pairGold';

const known = new Set(['a', 'b', 'c', 'd']);

const gold = (verdicts: PairGold['verdicts'], over: Partial<PairGold> = {}): PairGold => ({
  version: 'actions.human.v1',
  sourceSet: 'actions.v1',
  annotator: 'ea-1',
  blinded: true,
  verdicts,
  ...over,
});

describe('checkPairGold (THE-382)', () => {
  it('aborts on an unknown caseId instead of silently dropping it', () => {
    const r = checkPairGold(gold([{ caseId: 'zzz', relation: 'equal' }]), known);
    expect(r.ok).toBe(false);
    expect(r.problems.join()).toMatch(/unbekannte caseId/);
  });

  it('aborts on duplicates — one case cannot have two human verdicts', () => {
    const r = checkPairGold(gold([{ caseId: 'a', relation: 'equal' }, { caseId: 'a', relation: 'unrelated' }]), known);
    expect(r.ok).toBe(false);
    expect(r.problems.join()).toMatch(/doppelte caseIds/);
  });

  it('aborts on an unblinded gold', () => {
    const r = checkPairGold(gold([{ caseId: 'a', relation: 'equal' }], { blinded: false }), known);
    expect(r.ok).toBe(false);
    expect(r.problems.join()).toMatch(/blinded=false/);
  });

  it('accepts a clean gold', () => {
    expect(checkPairGold(gold([{ caseId: 'a', relation: 'intersects' }]), known).ok).toBe(true);
  });

  it('flags a high unsure share as an INSTRUMENT problem, not a person problem', () => {
    const r = checkPairGold(
      gold([
        { caseId: 'a', relation: null },
        { caseId: 'b', relation: null },
        { caseId: 'c', relation: 'equal' },
      ]),
      known
    );
    expect(r.notes.join()).toMatch(/WARNUNG/);
    expect(r.notes.join()).toMatch(/INSTRUMENT/);
    // Eine Warnung ist kein Abbruch: das Gold ist erhoben und bleibt lesbar,
    // die Deutung gehoert in den Bericht.
    expect(r.ok).toBe(true);
  });

  it('stays quiet below the threshold', () => {
    const r = checkPairGold(
      gold([
        { caseId: 'a', relation: null },
        { caseId: 'b', relation: 'equal' },
        { caseId: 'c', relation: 'equal' },
        { caseId: 'd', relation: 'equal' },
      ]),
      known
    );
    expect(0.25).toBeLessThan(UNSURE_WARN);
    expect(r.notes.join()).not.toMatch(/WARNUNG/);
  });

  it('reads equal:0 as the independent confirmation of the experiment', () => {
    const r = checkPairGold(gold([{ caseId: 'a', relation: 'intersects' }]), known);
    expect(r.notes.join()).toMatch(/gemeinsamer Kern, ausgewiesene Zusätze/);
  });

  it('reads a human equal as a rubric difference that blocks publication (O-5)', () => {
    const r = checkPairGold(gold([{ caseId: 'a', relation: 'equal' }]), known);
    expect(r.notes.join()).toMatch(/Rubrik-Differenz/);
    expect(r.notes.join()).toMatch(/O-5/);
  });
});
