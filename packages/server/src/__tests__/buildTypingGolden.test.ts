/**
 * build-typing-golden + typing-worksheet pure transforms — THE-430 Slice 1.
 *
 * Run: cd packages/server && npx jest src/__tests__/buildTypingGolden.test.ts
 */
import { buildTypingDraft, slugifyCaseId } from '../scripts/build-typing-golden';
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

  it('does not pad with duplicates when the round-robin cannot fill the quota', () => {
    // Only 2 sources, 3 cases total — asking for 12 must yield exactly those 3,
    // no repeats.
    const scarce = [reg('dsgvo', 'art-5'), reg('dsgvo', 'art-6'), reg('nis2', 'art-21', { language: 'en' })];
    const draft = buildTypingDraft(scarce, { targetSize: 12 });
    expect(draft.cases).toHaveLength(3);
    expect(new Set(draft.cases.map((c) => c.caseId)).size).toBe(3);
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
