/**
 * Tests für das eingefrorene Rechtstext-Fixture (THE-545, Task 1).
 *
 * ── WOZU EIN FIXTURE UND NICHT DER KORPUS ──
 *
 * THE-545 sagt „liest den Korpus". Das ist vom Mac aus derzeit unmöglich:
 * `CORPUS_MONGODB_URI` zeigt lokal auf localhost, der Korpus liegt auf
 * Server B. Ersatz ist ein eingefrorener Auszug aus EUR-Lex mit CELEX-Nachweis
 * — dieselbe Reproduzierbarkeits-Idee wie bei den Golden Sets. Die Abweichung
 * gehört in den Bericht, nicht unter den Teppich (RVTM O-1, MV-3).
 *
 * ── DIE ZWEI GARANTIEN, DIE HIER GEPRÜFT WERDEN ──
 *
 * 1. Es ist ROHTEXT. Die zweite Prämisse aus THE-545 lautet: REQGENs Ausgabe
 *    ist unbrauchbar, weil sie Ebenen verschmilzt und nach dem WIE fragt. Käme
 *    sie hier durch die Hintertür zurück, misst der ganze Schnitt nichts.
 * 2. Jede Adressatenklasse trägt ihre FUNDSTELLE. Sie ersetzt den
 *    Korpus-Join von Hand — belegt, nicht geraten.
 */
import { loadReqtraceLaws } from '../evals/reqtrace/lawsFixture';
import { isPartyRole } from '@thearchitect/shared';

const LAW_SOURCES = ['dsgvo', 'nis2', 'dora'] as const;

describe('reqtrace laws fixture (THE-545)', () => {
  const set = loadReqtraceLaws();

  it('carries all nine articles of the vertical cut', () => {
    const keys = set.articles.map((a) => `${a.source}:${a.article}`).sort();
    expect(keys).toEqual(
      [
        'dora:art5',
        'dora:art6',
        'dora:art9',
        'dora:art19',
        'dsgvo:art24',
        'dsgvo:art32',
        'dsgvo:art33',
        'nis2:art21',
        'nis2:art23',
      ].sort(),
    );
  });

  it('is RAW law text, not a REQGEN artefact', () => {
    // Rohtext erkennt man an der Absatz-Struktur des Rechtsakts. Ein
    // REQGEN-Requirement traegt stattdessen einen imperativen Titel und eine
    // Umsetzungs-Beschreibung — beides waere hier ein Alarmsignal.
    for (const a of set.articles) {
      expect(a.fullText.length).toBeGreaterThan(500);
      expect(a.fullText).toMatch(/\(1\)|\(2\)/);
    }
  });

  it('pins provenance: CELEX + retrieval date on every article', () => {
    for (const a of set.articles) {
      expect(a.celex).toMatch(/^3\d{4}[RL]\d{4}$/);
      expect(a.retrievedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });

  it('records the addressee class as an ontology partyRole WITH citation', () => {
    for (const a of set.articles) {
      expect(isPartyRole(a.addresseeClass)).toBe(true);
      expect(a.addresseeCitation.length).toBeGreaterThan(10);
    }
  });

  it('assigns the addressee class each law actually names', () => {
    const roleOf = (s: string): string =>
      set.articles.find((a) => a.source === s)!.addresseeClass;
    expect(roleOf('dsgvo')).toBe('controller');
    expect(roleOf('nis2')).toBe('essential_important_entity');
    expect(roleOf('dora')).toBe('financial_entity');
  });

  it('spot-checks one load-bearing sentence per law against the source', () => {
    // Der Schutz gegen den wahrscheinlichsten Fetch-Fehler: EUR-Lex liefert
    // Navigations-Rahmen statt Artikeltext. Diese drei Saetze stehen im
    // jeweiligen Artikel und in keinem Menue.
    const text = (s: string, art: string): string =>
      set.articles.find((a) => a.source === s && a.article === art)!.fullText;
    expect(text('dsgvo', 'art32')).toContain('geeignete technische und organisatorische Maßnahmen');
    expect(text('nis2', 'art21')).toContain('Risiken für die Sicherheit der Netz- und Informationssysteme');
    expect(text('dora', 'art6')).toContain('IKT-Risikomanagementrahmen');
  });

  it('covers the three control cases the vertical cut needs', () => {
    // Positiv (SCF-Gold), mechanisch negativ (lex specialis), semantisch
    // negativ (gleicher Adressat, andere Handlung) — faellt einer weg, ist
    // eine der drei Kontrollen aus THE-545 nicht messbar.
    const has = (s: string, art: string): boolean =>
      set.articles.some((a) => a.source === s && a.article === art);
    expect(has('dsgvo', 'art32') && has('nis2', 'art21')).toBe(true); // positiv
    expect(has('nis2', 'art23') && has('dora', 'art19')).toBe(true); // mechanisch
    expect(has('nis2', 'art21') && has('dsgvo', 'art33')).toBe(true); // semantisch
  });

  it('names one language and one law family per entry — no mixed records', () => {
    for (const a of set.articles) {
      expect(a.language).toBe('de');
      expect(LAW_SOURCES).toContain(a.source as (typeof LAW_SOURCES)[number]);
    }
  });

  it('rejects duplicate article keys', () => {
    const keys = set.articles.map((a) => `${a.source}:${a.article}`);
    expect(new Set(keys).size).toBe(keys.length);
  });
});
