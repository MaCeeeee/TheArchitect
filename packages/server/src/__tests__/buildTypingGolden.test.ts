/**
 * build-typing-golden + typing-worksheet pure transforms — THE-430 Slice 1.
 *
 * Run: cd packages/server && npx jest src/__tests__/buildTypingGolden.test.ts
 */
import { buildTypingDraft, excludeCases, pickOnlyCases, slugifyCaseId } from '../scripts/build-typing-golden';
import { renderTypingWorksheet } from '../scripts/typing-worksheet';
import { TypingGoldenSetSchema, type TypingGoldenSet } from '../evals/typingGolden';

const reg = (source: string, paragraphNumber: string, over: Partial<Record<string, string>> = {}) => ({
  source,
  paragraphNumber,
  fullText: 'Dies ist ein hinreichend langer Provisions-Text zum Testen der Draft-Erzeugung. '.repeat(2),
  language: 'de',
  jurisdiction: 'DE',
  ...over,
});

describe('buildTypingDraft', () => {
  it('erzeugt einen Case je Provision mit LEEREN Labels', () => {
    const draft = buildTypingDraft([reg('dsgvo', 'art-5'), reg('dsgvo', 'art-6')]);
    expect(draft.cases).toHaveLength(2);
    expect(draft.frozen).toBe(false);
    expect(draft.cases[0].labels).toEqual({});
    expect(draft.cases[0].caseId).toBe('dsgvo-art-5');
  });

  it('setzt ontologyVersion aus der E6-Datei', () => {
    const draft = buildTypingDraft([reg('nis2', 'art-21', { language: 'en' })]);
    expect(draft.ontologyVersion).toMatch(/^\d+\.\d+\.\d+$/);
    expect(draft.cases[0].language).toBe('en');
  });

  it('filtert zu kurze Texte + dedupliziert caseIds', () => {
    const draft = buildTypingDraft([
      reg('dsgvo', 'art-5'),
      reg('dsgvo', 'art-5'), // dupe → -x
      { source: 'dsgvo', paragraphNumber: 'x', fullText: 'kurz', language: 'de', jurisdiction: 'DE' },
    ]);
    expect(draft.cases).toHaveLength(2);
    expect(draft.cases.map((c) => c.caseId)).toEqual(['dsgvo-art-5', 'dsgvo-art-5-x']);
  });

  it('Draft ist schema-gültig (leere labels erlaubt)', () => {
    const draft = buildTypingDraft([reg('dsgvo', 'art-5')]);
    expect(TypingGoldenSetSchema.safeParse(draft).success).toBe(true);
  });

  it('slugifyCaseId normalisiert', () => {
    expect(slugifyCaseId('DSGVO', 'Art. 5 (1)')).toBe('dsgvo-art-5-1');
  });
});

describe('buildTypingDraft — stratified selection (targetSize)', () => {
  // 3 sources, each with 5 de + 5 en cases (30 total) — enough headroom for
  // a targetSize=12 stratified pull to spread across sources + languages.
  const mixedRegulations = ['dsgvo', 'nis2', 'aiact'].flatMap((source) =>
    ['de', 'en'].flatMap((language) =>
      Array.from({ length: 5 }, (_, i) => reg(source, `art-${i}`, { language }))
    )
  );

  // 5 sources, each with 10 de + 10 en cases (100 total) — headroom for
  // seed-comparison pulls (targetSize=10) to plausibly differ per seed.
  const manyRegs = Array.from({ length: 5 }, (_, s) => `src${s}`).flatMap((source) =>
    ['de', 'en'].flatMap((language) =>
      Array.from({ length: 10 }, (_, i) => reg(source, `art-${i}`, { language }))
    )
  );

  it('stratifies across sources and languages up to a target size', () => {
    const draft = buildTypingDraft(mixedRegulations, { targetSize: 12 });
    expect(draft.cases).toHaveLength(12);
    expect(new Set(draft.cases.map((c) => c.source)).size).toBeGreaterThanOrEqual(3);
    expect(new Set(draft.cases.map((c) => c.language))).toEqual(new Set(['de', 'en']));
  });

  it('is deterministic for the same seed', () => {
    const ids = (o: object) => buildTypingDraft(manyRegs, o).cases.map((c) => c.caseId);
    expect(ids({ targetSize: 10, seed: 42 })).toEqual(ids({ targetSize: 10, seed: 42 }));
  });

  it('produces a different selection for a different seed', () => {
    const ids = (s: number) => buildTypingDraft(manyRegs, { targetSize: 10, seed: s }).cases.map((c) => c.caseId);
    expect(ids(1)).not.toEqual(ids(2));
  });

  it('takes everything when no targetSize is given (unchanged behaviour)', () => {
    const eligible = mixedRegulations.filter((r) => r.fullText.length >= 50).length;
    expect(buildTypingDraft(mixedRegulations).cases).toHaveLength(eligible);
  });

  it('does not exceed available cases when targetSize is larger than the input', () => {
    const draft = buildTypingDraft(mixedRegulations, { targetSize: 9999 });
    expect(draft.cases.length).toBeLessThanOrEqual(mixedRegulations.length);
    expect(draft.cases.length).toBe(mixedRegulations.length);
  });

  // mustInclude: bewusste Über-Abtastung seltener, aber wichtiger Klassen. Die
  // Stratifikation bildet die natürliche Korpus-Verteilung ab, in der Geltungs-
  // bereichs- und Definitions-Provisions eine Handvoll gegenüber Dutzenden
  // Pflichten-Artikeln sind — zu dünn, um eine Kappa-Zahl zu tragen. Pflicht-
  // Fälle müssen daher jeden Seed überleben und Quote verbrauchen, statt den
  // Satz über targetSize hinaus aufzublähen.
  it('always includes forced cases regardless of seed', () => {
    const forced = ['src0-art-0', 'src4-art-9'];
    for (const seed of [1, 2, 7, 42]) {
      const ids = buildTypingDraft(manyRegs, {
        targetSize: 10,
        seed,
        mustInclude: forced,
      }).cases.map((c) => c.caseId);
      expect(ids).toEqual(expect.arrayContaining(forced));
    }
  });

  it('counts forced cases against the target size and never duplicates them', () => {
    const forced = ['src0-art-0', 'src1-art-0', 'src2-art-0'];
    const draft = buildTypingDraft(manyRegs, { targetSize: 10, seed: 42, mustInclude: forced });
    expect(draft.cases).toHaveLength(10);
    expect(new Set(draft.cases.map((c) => c.caseId)).size).toBe(10);
  });

  it('ignores forced ids that are not present in the input', () => {
    const draft = buildTypingDraft(manyRegs, {
      targetSize: 10,
      seed: 42,
      mustInclude: ['does-not-exist'],
    });
    expect(draft.cases).toHaveLength(10);
  });

  it('does not pad with duplicates when the round-robin cannot fill the quota', () => {
    // Only 2 sources, 3 cases total — asking for 12 must yield exactly those 3,
    // no repeats.
    const scarce = [reg('dsgvo', 'art-5'), reg('dsgvo', 'art-6'), reg('nis2', 'art-21', { language: 'en' })];
    const draft = buildTypingDraft(scarce, { targetSize: 12 });
    expect(draft.cases).toHaveLength(3);
    expect(new Set(draft.cases.map((c) => c.caseId)).size).toBe(3);
  });
});

// Golden v2 (THE-430): --exclude-file erzwingt Disjunktheit zu v1 (Out-of-
// Sample-Garantie), --only-cases baut den Audit-Topf aus einer festen
// Positivliste. Beides läuft über reine Kernfunktionen, damit die Garantien
// hier ohne I/O beweisbar sind.
describe('excludeCases — Disjunktheit v1/v2', () => {
  const pool = buildTypingDraft([
    reg('dsgvo', 'art-1'),
    reg('dsgvo', 'art-2'),
    reg('nis2', 'art-1', { language: 'en' }),
    reg('aiact', 'art-9'),
  ]).cases;

  it('entfernt exakt die passenden caseIds und erhält Reihenfolge/Rest', () => {
    const out = excludeCases(pool, ['dsgvo-art-1', 'aiact-art-9']);
    expect(out.map((c) => c.caseId)).toEqual(['dsgvo-art-2', 'nis2-art-1']);
  });

  it('ist ein No-Op bei leerer Liste oder unbekannten Ids', () => {
    expect(excludeCases(pool, [])).toEqual(pool);
    expect(excludeCases(pool, ['gibt-es-nicht'])).toEqual(pool);
  });

  it('end-to-end: stratifizierter Draft enthält NIE eine ausgeschlossene Id', () => {
    // 5 Quellen × 2 Sprachen × 10 Artikel — genug Material, dass die Quote
    // trotz Ausschluss aus frischem Material gefüllt wird.
    const manyRegs = Array.from({ length: 5 }, (_, s) => `src${s}`).flatMap((source) =>
      ['de', 'en'].flatMap((language) =>
        Array.from({ length: 10 }, (_, i) => reg(source, `art-${i}`, { language }))
      )
    );
    const excluded = ['src0-art-0', 'src1-art-1', 'src2-art-2', 'src3-art-3'];
    for (const seed of [1, 7, 42]) {
      const draft = buildTypingDraft(manyRegs, { targetSize: 20, seed, excludeCaseIds: excluded });
      expect(draft.cases).toHaveLength(20);
      const ids = new Set(draft.cases.map((c) => c.caseId));
      for (const id of excluded) expect(ids.has(id)).toBe(false);
    }
  });
});

describe('pickOnlyCases — Audit-Topf', () => {
  const pool = buildTypingDraft([
    reg('dsgvo', 'art-1'),
    reg('dsgvo', 'art-2'),
    reg('nis2', 'art-1', { language: 'en' }),
    reg('aiact', 'art-9'),
  ]).cases;

  it('liefert exakt und nur die angeforderten Ids, in Reihenfolge der Id-Datei', () => {
    const out = pickOnlyCases(pool, ['aiact-art-9', 'dsgvo-art-1']);
    expect(out.map((c) => c.caseId)).toEqual(['aiact-art-9', 'dsgvo-art-1']);
  });

  it('wirft bei fehlenden Ids und nennt sie in der Meldung', () => {
    expect(() => pickOnlyCases(pool, ['dsgvo-art-1', 'fehlt-1', 'fehlt-2'])).toThrow(
      /fehlt-1.*fehlt-2/
    );
  });

  it('buildTypingDraft mit onlyCaseIds wählt exakt diese Fälle, keine Stratifikation', () => {
    const draft = buildTypingDraft(
      [reg('dsgvo', 'art-1'), reg('dsgvo', 'art-2'), reg('nis2', 'art-1', { language: 'en' })],
      { onlyCaseIds: ['nis2-art-1', 'dsgvo-art-2'] }
    );
    expect(draft.cases.map((c) => c.caseId)).toEqual(['nis2-art-1', 'dsgvo-art-2']);
    expect(TypingGoldenSetSchema.safeParse(draft).success).toBe(true);
  });

  it('onlyCaseIds ist mit targetSize/mustInclude nicht kombinierbar', () => {
    const regs = [reg('dsgvo', 'art-1'), reg('dsgvo', 'art-2')];
    expect(() => buildTypingDraft(regs, { onlyCaseIds: ['dsgvo-art-1'], targetSize: 1 })).toThrow();
    expect(() =>
      buildTypingDraft(regs, { onlyCaseIds: ['dsgvo-art-1'], mustInclude: ['dsgvo-art-2'] })
    ).toThrow();
  });
});

describe('renderTypingWorksheet', () => {
  const set: TypingGoldenSet = {
    version: 'v1-draft',
    frozen: false,
    ontologyVersion: '1.3.0',
    rubricRef: '../RUBRIC.md',
    cases: [
      {
        caseId: 'dsgvo-art-5',
        source: 'dsgvo',
        paragraphNumber: 'art-5',
        fullText: 'Grundsätze für die Verarbeitung personenbezogener Daten. '.repeat(2),
        language: 'de',
        jurisdiction: 'DE',
        labels: { normKind: 'legislation', obligationKind: null },
      },
    ],
  };

  it('rendert self-contained HTML mit 5 Achsen-Dropdowns', () => {
    const html = renderTypingWorksheet(set);
    expect(html).toContain('<!doctype html>');
    expect(html).toContain('ax_0_normKind');
    expect(html).toContain('ax_0_bindingness');
    expect(html).toContain('ax_0_obligationKind');
    expect(html).toContain('ax_0_partyRole');
    expect(html).toContain('ax_0_provisionKind');
  });

  it('renders a provisionKind dropdown with the ontology options', () => {
    const html = renderTypingWorksheet(set);
    expect(html).toContain('ProvisionKind'); // the axis title
    expect(html).toContain('scope-applicability'); // an option id
    expect(html).toContain('enforcement-supervision');
  });

  it('belegt vorhandene Labels vor (Adjudikation) + n/a-Option', () => {
    const html = renderTypingWorksheet(set);
    // normKind=legislation ist vorselektiert
    expect(html).toMatch(/<option value="legislation" selected>/);
    // obligationKind=null → n/a vorselektiert
    expect(html).toMatch(/<option value="__na" selected>n\/a/);
    // partyRole=undefined → "offen" vorselektiert
    expect(html).toMatch(/<option value="__open" selected>/);
  });

  it('bettet den Gesetzestext + E6-Version ein', () => {
    const html = renderTypingWorksheet(set);
    expect(html).toContain('Grundsätze für die Verarbeitung');
    expect(html).toContain('1.3.0');
  });
});
