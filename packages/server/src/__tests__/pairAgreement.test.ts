/**
 * Tests für den Vergleichslauf Richter ↔ Mensch (THE-382 Slice 1, Task 8).
 *
 * Diese Auswertung entscheidet, ob wir eine Zahl veröffentlichen dürfen.
 * Deshalb ist sie rein und wird hier ohne Netz und ohne Adjudikation geprüft —
 * die Regeln müssen stehen, bevor das erste menschliche Urteil vorliegt.
 */
import { buildAgreement, renderAgreementMarkdown, HUMAN_AGREEMENT_GATE } from '../scripts/pair-agreement';
import type { PairRelation } from '@thearchitect/shared';

type Verdict = { caseId: string; relation: PairRelation | null };

const human: Verdict[] = [
  { caseId: 'a', relation: 'intersects' },
  { caseId: 'b', relation: 'unrelated' },
  { caseId: 'c', relation: 'intersects' },
  { caseId: 'd', relation: null },
];

describe('buildAgreement (THE-382)', () => {
  it('skips the human "unsure" instead of counting it as disagreement', () => {
    // Ein Mensch, der ehrlich zoegert, darf den Kappa nicht druecken.
    const r = buildAgreement(human, { h1: { a: 'intersects', b: 'unrelated', c: 'intersects', d: 'equal' } }, 'ea');
    expect(r.skippedUnsure).toBe(1);
    expect(r.rows[0].n).toBe(3);
  });

  it('drops a silent house from the comparison rather than scoring it as a miss', () => {
    const r = buildAgreement(human, { h1: { a: 'intersects', b: null, c: 'intersects' } }, 'ea');
    expect(r.rows[0].n).toBe(2);
    expect(r.rows[0].agreement).toBe(1);
  });

  it('compares on the four types, not folded to yes/no', () => {
    // Gefaltet waeren `equal` und `subset` identisch — genau diese
    // Zusammenlegung war der urspruengliche Fehler.
    const r = buildAgreement(
      [{ caseId: 'a', relation: 'equal' }, { caseId: 'b', relation: 'subset' }],
      { h1: { a: 'subset', b: 'equal' } },
      'ea',
    );
    expect(r.rows[0].agreement).toBe(0);
  });

  it('reports WHERE the disagreement sits', () => {
    const r = buildAgreement(human, { h1: { a: 'unrelated', b: 'unrelated', c: 'intersects' } }, 'ea');
    expect(r.rows[0].confusion['intersects|unrelated']).toBe(1);
  });

  it('returns kappa null for a constant rater — same rule as everywhere', () => {
    const r = buildAgreement(
      [{ caseId: 'a', relation: 'intersects' }, { caseId: 'b', relation: 'intersects' }],
      { h1: { a: 'intersects', b: 'unrelated' } },
      'ea',
    );
    expect(r.rows[0].kappa).toBeNull();
  });

  it('counts the human relation distribution INCLUDING a zero for equal', () => {
    const r = buildAgreement(human, { h1: {} }, 'ea');
    expect(r.humanRelations.intersects).toBe(2);
    expect(r.humanRelations.equal ?? 0).toBe(0);
    expect(r.humanUnsureRate).toBeCloseTo(0.25, 6);
  });
});

describe('renderAgreementMarkdown (THE-382)', () => {
  const judged = { h1: { a: 'intersects' as const, b: 'unrelated' as const, c: 'intersects' as const } };

  it('confirms the experiment when the human never picks equal', () => {
    const md = renderAgreementMarkdown(buildAgreement(human, judged, 'ea'));
    expect(md).toMatch(/unabhängige Bestätigung/);
    expect(md).toMatch(/gemeinsamer Kern, ausgewiesene Zusätze/);
  });

  it('BLOCKS publication when the human does pick equal (O-5)', () => {
    // Im Experiment kam `equal` in 120 Faellen null Mal vor. Vergibt der Mensch
    // es, liegt eine Rubrik-Differenz vor — und die ist zu klaeren, BEVOR eine
    // Zahl zirkuliert.
    const md = renderAgreementMarkdown(
      buildAgreement([{ caseId: 'a', relation: 'equal' }], { h1: { a: 'intersects' } }, 'ea'),
    );
    expect(md).toMatch(/Rubrik-Differenz/);
    expect(md).toMatch(/O-5/);
    expect(md).toMatch(/keine Zahl aus diesem Lauf zitieren/);
  });

  it('states the verdict against the gate in both directions', () => {
    const pass = renderAgreementMarkdown(buildAgreement(human, judged, 'ea'));
    expect(pass).toMatch(/ist verwendbar/);

    const fail = renderAgreementMarkdown(
      buildAgreement(
        [
          { caseId: 'a', relation: 'intersects' },
          { caseId: 'b', relation: 'unrelated' },
          { caseId: 'c', relation: 'intersects' },
        ],
        { h1: { a: 'unrelated', b: 'intersects', c: 'unrelated' } },
        'ea',
      ),
    );
    expect(fail).toMatch(/Kein Haus erreicht das Tor/);
  });

  it('always carries the statistical limit — one adjudicator, few pairs', () => {
    // Ohne diesen Satz liest jemand einen knappen Kappa als Freigabe.
    const md = renderAgreementMarkdown(buildAgreement(human, judged, 'ea'));
    expect(md).toMatch(/EIN Adjudikator/);
    expect(md).toMatch(/Mensch↔Mensch-Obergrenze/);
  });

  it('names the adjudicator — an anonymous anchor cannot be questioned later', () => {
    expect(renderAgreementMarkdown(buildAgreement(human, judged, 'matthias'))).toContain('matthias');
  });

  it('sets the gate below the coherence gate, deliberately', () => {
    // Mensch↔Maschine darf nicht an derselben Latte gemessen werden wie
    // Maschine↔Maschine — die Aufgabe ist schwerer.
    expect(HUMAN_AGREEMENT_GATE).toBeLessThan(0.8);
  });
});
