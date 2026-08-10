/**
 * DER SEKTIONS-ANKER — eine Norm, ein Schlüssel (THE-645/647).
 *
 * ── WARUM DAS EIN TOR IST ──
 *
 * `regulation-key.ts` erklärt die Invariante selbst für verbindlich:
 *
 *   „MUST stay byte-identical on both sides, otherwise a ComplianceMapping's
 *    reference key never matches its corpus entry (ADR-0001)."
 *
 * Am 10.08. war sie gebrochen, und zwar unsichtbar: `regulationsToNormView`
 * baute den Schlüssel bei fehlendem `regulationKey` von Hand nach —
 * `${source}:${paragraphNumber}`, ohne `normaliseParagraph`. Dieselbe Norm
 * hiess dann `dsgvo:art-32`, wenn sie aus dem Korpus kam, und
 * `dsgvo:Art. 32`, wenn sie aus einer Projekt-Kopie kam.
 *
 * Die Folge war kein Fehler, sondern Stille: Der Remediations-Vorschlag
 * entstand, das Element wurde erzeugt, der Rückschluss suchte einen Schlüssel
 * ohne Gegenstück — und die Lücke blieb offen, obwohl die Massnahme existierte.
 *
 * Rein mechanisch: keine Datenbank, kein Netz, kein Modell.
 */
import { regulationsToNormView } from '../services/norm.service';
import { buildRegulationKey } from '@thearchitect/shared';

type Reg = Parameters<typeof regulationsToNormView>[2][number];

const reg = (over: Partial<Reg> = {}): Reg => ({
  source: 'dsgvo',
  jurisdiction: 'EU',
  paragraphNumber: 'Art. 32',
  title: 'Sicherheit der Verarbeitung',
  fullText: 'Der Verantwortliche trifft geeignete technische und organisatorische Massnahmen.',
  sourceUrl: 'https://example.invalid/dsgvo/art-32',
  effectiveFrom: new Date('2018-05-25T00:00:00.000Z'),
  language: 'de',
  ...over,
});

/**
 * Der Schlüssel entsteht aus dem `source`-PARAMETER, nicht aus `r.source`:
 * die Funktion projiziert die Paragraphen EINES Gesetzes auf eine Norm. Wer
 * ein anderes Gesetz prüfen will, gibt es hier mit — nicht am Datensatz.
 */
const eIds = (regs: Reg[], source = 'dsgvo') =>
  regulationsToNormView('507f1f77bcf86cd799439011', source, regs).sections.map((s) => s.eId);

describe('regulationsToNormView — der Sektions-Anker', () => {
  it('AC-1: ohne regulationKey wird der Schlüssel KANONISCH gebildet', () => {
    // Der Bug: hier stand `dsgvo:Art. 32`.
    expect(eIds([reg()])).toEqual(['dsgvo:art-32']);
  });

  it('AC-2: Korpus-Eintrag und Projekt-Kopie liefern denselben Anker', () => {
    // So kommt es aus dem Korpus (der Crawler hat den Schlüssel geschrieben) …
    const ausKorpus = eIds([reg({ regulationKey: 'dsgvo:art-32' })]);
    // … und so aus einer Projekt-Kopie, die keinen trägt.
    const ausKopie = eIds([reg()]);
    expect(ausKopie).toEqual(ausKorpus);
  });

  it('AC-3: ein vorhandener regulationKey gewinnt und wird NICHT neu abgeleitet', () => {
    // Der Crawler ist die Wahrheit. Gesetze mit Sonderschreibweisen dürfen
    // nicht nachträglich durch unsere Ableitung umgeschnitten werden.
    expect(eIds([reg({ regulationKey: 'dsgvo:anhang-i-nr-3' })])).toEqual([
      'dsgvo:anhang-i-nr-3',
    ]);
  });

  it('AC-5: beide Schreibweisen desselben Paragraphen fallen zusammen', () => {
    // Vorher zwei Sektionen für einen Paragraphen — die Anzeige zeigte ihn
    // doppelt, und die Zählung („1 von 2 offen") war schlicht falsch.
    const sections = eIds([
      reg({ regulationKey: 'dsgvo:art-32' }),
      reg({ paragraphNumber: 'Art. 32' }),
    ]);
    expect(sections).toEqual(['dsgvo:art-32']);
  });

  it('bildet auch Paragraphen-Zeichen und Bindestriche stabil ab', () => {
    expect(eIds([reg({ paragraphNumber: '§ 6' })], 'lksg')).toEqual(['lksg:6']);
    expect(eIds([reg({ paragraphNumber: 'art-32' })])).toEqual(['dsgvo:art-32']);
  });

  it('ist identisch zu dem, was der Crawler geschrieben hätte', () => {
    // Die eigentliche Aussage: unsere Ableitung und die geteilte Funktion
    // dürfen nie auseinanderlaufen — sonst bricht ADR-0001.
    for (const para of ['Art. 32', 'Art. 5 Abs. 1', '§ 6', 'Anhang I Nr. 3']) {
      expect(eIds([reg({ paragraphNumber: para })])).toEqual([
        buildRegulationKey('dsgvo', para),
      ]);
    }
  });

  it('AC-4: ein unbildbarer Schlüssel bricht sichtbar statt leer zu werden', () => {
    // `buildRegulationKey` wirft bei leerem Paragraphen. Ein stiller
    // `dsgvo:`-Anker wäre schlimmer als der Abbruch: er sähe gültig aus.
    expect(() => eIds([reg({ paragraphNumber: '' })])).toThrow(/cannot build regulationKey/);
  });
});
