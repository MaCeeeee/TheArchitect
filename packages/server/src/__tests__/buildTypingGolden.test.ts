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

  it('rendert self-contained HTML mit 4 Achsen-Dropdowns', () => {
    const html = renderTypingWorksheet(set);
    expect(html).toContain('<!doctype html>');
    expect(html).toContain('ax_0_normKind');
    expect(html).toContain('ax_0_bindingness');
    expect(html).toContain('ax_0_obligationKind');
    expect(html).toContain('ax_0_partyRole');
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
