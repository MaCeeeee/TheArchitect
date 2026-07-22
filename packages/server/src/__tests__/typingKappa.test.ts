/**
 * typing-kappa Tests — Doppel-Labeling-Werkzeug für die Term-Typing-Achsen
 * (THE-421/THE-430, RUBRIC.md §7). Präzedenzfall: goldenKappa.test.ts — aber
 * die Typing-Achsen sind Multi-Klassen (nicht binär match/no-match), daher
 * eigene Vergleichslogik über cohenKappaMulti.
 *
 * Run: cd packages/server && npx jest src/__tests__/typingKappa.test.ts
 */
import { makeBlindTypingCopy, compareTypingSets } from '../scripts/typing-kappa';
import { TypingGoldenSetSchema, TYPING_AXES, type TypingGoldenSet } from '../evals/typingGolden';

function set(
  cases: Array<{
    caseId: string;
    normKind?: string | null;
    bindingness?: string | null;
    obligationKind?: string | null;
    partyRole?: string | null;
    provisionKind?: string | null;
  }>
): TypingGoldenSet {
  return TypingGoldenSetSchema.parse({
    version: 'vX',
    frozen: false,
    ontologyVersion: 'norm-ontology.v1',
    rubricRef: 'RUBRIC.md',
    cases: cases.map((c) => ({
      caseId: c.caseId,
      source: 'dsgvo',
      paragraphNumber: 'Art. 1',
      fullText: 'x'.repeat(60),
      language: 'de',
      jurisdiction: 'EU',
      labels: {
        normKind: c.normKind,
        bindingness: c.bindingness,
        obligationKind: c.obligationKind,
        partyRole: c.partyRole,
        provisionKind: c.provisionKind,
      },
    })),
  });
}

describe('makeBlindTypingCopy()', () => {
  const prelabeledSet = (() => {
    const s = set([
      {
        caseId: 'case-1',
        normKind: 'legislation',
        bindingness: 'binding',
        obligationKind: 'obligation',
        partyRole: 'controller',
        provisionKind: undefined,
      },
    ]);
    s.cases[0].notes = 'LLM-Vorschlag: eindeutig bindend';
    s.cases[0].ambiguous = true;
    s.cases[0].annotator = 'A';
    s.cases[0].labeledAt = '2026-07-20';
    return s;
  })();

  it('blind copy strips ALL labels and every trace of the first pass (anti-anchoring)', () => {
    const blind = makeBlindTypingCopy(prelabeledSet);
    for (const c of blind.cases) {
      for (const axis of TYPING_AXES) expect(c.labels[axis]).toBeUndefined();
      expect(c.annotator).toBeUndefined();
      expect(c.notes).toBeUndefined();
      expect(c.ambiguous).toBeUndefined();
      expect(c.labeledAt).toBeUndefined();
    }
    expect(blind.frozen).toBe(false);
    expect(TypingGoldenSetSchema.safeParse(blind).success).toBe(true);
  });

  it('keeps the legal text and case identity so annotator B can actually label', () => {
    const blind = makeBlindTypingCopy(prelabeledSet);
    expect(blind.cases[0].fullText).toBe(prelabeledSet.cases[0].fullText);
    expect(blind.cases[0].caseId).toBe(prelabeledSet.cases[0].caseId);
  });

  it('does not mutate the original set', () => {
    makeBlindTypingCopy(prelabeledSet);
    expect(prelabeledSet.cases[0].labels.normKind).toBe('legislation');
    expect(prelabeledSet.cases[0].annotator).toBe('A');
  });

  it('suffixes version with -blind', () => {
    const blind = makeBlindTypingCopy(prelabeledSet);
    expect(blind.version).toBe('vX-blind');
  });
});

describe('compareTypingSets()', () => {
  it('computes kappa per axis and lists disagreements', () => {
    const setA = set([
      { caseId: 'case-1', normKind: 'legislation', bindingness: 'binding', obligationKind: 'obligation', partyRole: 'controller', provisionKind: 'obligation' },
      { caseId: 'case-2', normKind: 'legislation', bindingness: 'binding', obligationKind: 'prohibition', partyRole: 'processor', provisionKind: 'scope-applicability' },
      { caseId: 'case-3', normKind: 'guideline', bindingness: 'persuasive', obligationKind: 'permission', partyRole: 'data_subject', provisionKind: 'definition' },
    ]);
    const setB = set([
      { caseId: 'case-1', normKind: 'legislation', bindingness: 'binding', obligationKind: 'obligation', partyRole: 'controller', provisionKind: 'obligation' },
      { caseId: 'case-2', normKind: 'legislation', bindingness: 'binding', obligationKind: 'obligation', partyRole: 'processor', provisionKind: 'scope-applicability' },
      { caseId: 'case-3', normKind: 'guideline', bindingness: 'persuasive', obligationKind: 'permission', partyRole: 'data_subject', provisionKind: 'definition' },
    ]);
    const r = compareTypingSets(setA, setB);
    expect(Object.keys(r.perAxis).sort()).toEqual([...TYPING_AXES].sort());
    expect(r.perAxis.normKind.kappa).toBeCloseTo(1, 6);
    expect(r.disagreements.map((d) => d.caseId)).toContain('case-2');
  });

  it('excludes a pair from kappa when either side left the axis open, and counts it as skipped', () => {
    const setWithOpenAxis = set([
      { caseId: 'case-1', normKind: 'legislation', bindingness: 'binding', obligationKind: 'obligation', partyRole: undefined, provisionKind: 'obligation' },
      { caseId: 'case-2', normKind: 'legislation', bindingness: 'binding', obligationKind: 'obligation', partyRole: 'controller', provisionKind: 'obligation' },
    ]);
    const setFullyLabeled = set([
      { caseId: 'case-1', normKind: 'legislation', bindingness: 'binding', obligationKind: 'obligation', partyRole: 'controller', provisionKind: 'obligation' },
      { caseId: 'case-2', normKind: 'legislation', bindingness: 'binding', obligationKind: 'obligation', partyRole: 'controller', provisionKind: 'obligation' },
    ]);
    const r = compareTypingSets(setWithOpenAxis, setFullyLabeled);
    expect(r.perAxis.partyRole.skipped).toBe(1);
    expect(r.perAxis.partyRole.pairs).toBe(1);
  });

  it('treats a deliberate not-applicable (null) as a real label that can agree', () => {
    const setWithNullPartyRole = set([
      { caseId: 'case-1', normKind: 'legislation', bindingness: 'binding', obligationKind: null, partyRole: null, provisionKind: 'definition' },
      { caseId: 'case-2', normKind: 'legislation', bindingness: 'binding', obligationKind: null, partyRole: null, provisionKind: 'definition' },
    ]);
    const r = compareTypingSets(setWithNullPartyRole, setWithNullPartyRole);
    expect(r.perAxis.partyRole.kappa).toBeCloseTo(1, 6);
    expect(r.perAxis.partyRole.pairs).toBe(2);
    expect(r.perAxis.partyRole.skipped).toBe(0);
  });

  // Prävalenz-Paradox: auf einem Korpus aus unmittelbar geltenden Gesetzgebungs-
  // akten ist normKind konstruktionsbedingt konstant. Kappa fällt dann auf 0,
  // OBWOHL die Rohübereinstimmung sehr hoch ist. Wer diese 0 für Uneinigkeit
  // hält, baut eine funktionierende Rubrik für ein Problem um, das sie nicht hat.
  it('flags an axis as degenerate when one annotator used only a single class', () => {
    const row = (caseId: string, norm: string) => ({
      caseId,
      normKind: norm,
      bindingness: 'binding',
      obligationKind: 'obligation',
      partyRole: 'controller',
      provisionKind: 'obligation',
    });
    const constantA = set(Array.from({ length: 20 }, (_, i) => row(`case-${i}`, 'legislation')));
    const mostlySameB = set(
      Array.from({ length: 20 }, (_, i) => row(`case-${i}`, i === 0 ? 'guideline' : 'legislation'))
    );
    const r = compareTypingSets(constantA, mostlySameB);
    expect(r.perAxis.normKind.degenerate).toBe(true);
    expect(r.perAxis.normKind.agreementRate).toBeCloseTo(0.95, 6);
    expect(r.perAxis.normKind.kappa).toBeCloseTo(0, 6);
  });

  it('does not flag an axis as degenerate when both annotators used several classes', () => {
    const setA = set([
      { caseId: 'case-1', normKind: 'legislation', bindingness: 'binding', obligationKind: 'obligation', partyRole: 'controller', provisionKind: 'obligation' },
      { caseId: 'case-2', normKind: 'guideline', bindingness: 'persuasive', obligationKind: 'permission', partyRole: 'processor', provisionKind: 'definition' },
    ]);
    expect(compareTypingSets(setA, setA).perAxis.normKind.degenerate).toBe(false);
  });

  it('reports cases present in only one of the two files', () => {
    const setA = set([
      { caseId: 'case-1', normKind: 'legislation', bindingness: 'binding', obligationKind: 'obligation', partyRole: 'controller', provisionKind: 'obligation' },
      { caseId: 'case-3', normKind: 'guideline', bindingness: 'persuasive', obligationKind: 'permission', partyRole: 'data_subject', provisionKind: 'definition' },
    ]);
    const setBMissingCase = set([
      { caseId: 'case-1', normKind: 'legislation', bindingness: 'binding', obligationKind: 'obligation', partyRole: 'controller', provisionKind: 'obligation' },
    ]);
    expect(compareTypingSets(setA, setBMissingCase).unmatchedCaseIds).toContain('case-3');
  });

  it('does not crash or produce NaN when an axis is left open by both annotators everywhere', () => {
    const setA = set([
      { caseId: 'case-1', normKind: 'legislation', bindingness: 'binding', obligationKind: 'obligation', partyRole: undefined, provisionKind: 'obligation' },
    ]);
    const setB = set([
      { caseId: 'case-1', normKind: 'legislation', bindingness: 'binding', obligationKind: 'obligation', partyRole: undefined, provisionKind: 'obligation' },
    ]);
    const r = compareTypingSets(setA, setB);
    expect(r.perAxis.partyRole.pairs).toBe(0);
    expect(r.perAxis.partyRole.skipped).toBe(0);
    expect(r.perAxis.partyRole.kappa).toBe(0);
    expect(Number.isNaN(r.perAxis.partyRole.kappa)).toBe(false);
    expect(Number.isNaN(r.perAxis.partyRole.agreementRate)).toBe(false);
  });
});
