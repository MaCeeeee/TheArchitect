/**
 * THE-681 (REQ-679.2): Erwägungsgründe — Extraktion, Bauer, Schema.
 *
 * Kein Live-Mongo (Crawler-Suite-Konvention): Dokument-Ebene läuft über
 * validateSync/toObject, die Extraktion über Inline-Fixtures.
 */
import {
  extractRecitals,
  extractCitedArticles,
  recitalVersionHash,
  buildRecitalDoc,
} from '../lib/recitalExtract';
import { Recital } from '../db/recital.model';

// ─── Fixtures ────────────────────────────────────────────────────────────────

/** Moderne ELI-Struktur (alle 12 Spike-Familien) — inkl. der Falle: ein
 *  Artikel-Absatz, der ebenfalls mit „(1)" beginnt, NACH der Erlass-Formel. */
const ELI_HTML = `<html><body><div class="eli-container">
  <div class="eli-subdivision"><p class="oj-normal">(1) Die Union braucht klare Regeln für Produkte mit digitalen Elementen, damit Hersteller und Nutzer geschützt sind.</p></div>
  <div class="eli-subdivision"><p class="oj-normal">(2) Die Hersteller sollten nach Artikel 13 und Artikel 14 Absatz 1 verpflichtet werden, Schwachstellen zu melden.</p></div>
  <div class="eli-subdivision"><p class="oj-normal">(3) Diese Verordnung ergänzt Artikel 5 der Verordnung (EU) 2016/679 und lässt sie unberührt.</p></div>
  <p class="oj-normal">HABEN FOLGENDE VERORDNUNG ERLASSEN:</p>
  <div class="eli-subdivision"><p class="oj-ti-art">Artikel 1</p>
    <p class="oj-normal">(1) Diese Verordnung gilt für Produkte mit digitalen Elementen, die auf dem Markt bereitgestellt werden und deren Zweckbestimmung eine Datenverbindung umfasst.</p></div>
</div></body></html>`;

/** Alte Struktur ohne ELI-Container (eprivacy-Klasse) — nackte Absätze. */
const OLD_HTML = `<html><body>
  <p>(1) Die Richtlinie 95/46/EG verlangt von den Mitgliedstaaten den Schutz personenbezogener Daten in der elektronischen Kommunikation sicherzustellen.</p>
  <p>(2) Die Vertraulichkeit der Kommunikation ist nach Artikel 8 zu gewährleisten und gegen unbefugten Zugriff abzusichern.</p>
  <p>HABEN FOLGENDE RICHTLINIE ERLASSEN:</p>
  <p>Artikel 1</p>
  <p>(1) Diese Richtlinie regelt den Schutz personenbezogener Daten im Bereich der elektronischen Kommunikation und harmonisiert die Vorschriften.</p>
</body></html>`;

// ─── Extraktion ──────────────────────────────────────────────────────────────

describe('extractRecitals', () => {
  it('liest ELI-Struktur: 3 Erwägungsgründe, keine Lücken, Formel gefunden', () => {
    const r = extractRecitals(ELI_HTML);
    expect(r.selector).toBe('eli-subdivision');
    expect(r.recitals.map((x) => x.recitalNumber)).toEqual([1, 2, 3]);
    expect(r.gaps).toEqual([]);
    expect(r.enactingFormulaFound).toBe(true);
  });

  it('der Artikel-Absatz „(1)" NACH der Erlass-Formel wird NICHT zum Erwägungsgrund', () => {
    const r = extractRecitals(ELI_HTML);
    // Erwägungsgrund 1 ist der Präambel-Text, nicht der Artikel-1-Absatz
    expect(r.recitals[0].fullText).toContain('klare Regeln');
    expect(r.recitals[0].fullText).not.toContain('Zweckbestimmung');
  });

  it('fullText trägt die Nummer nicht mehr — sie steht im Feld', () => {
    const r = extractRecitals(ELI_HTML);
    expect(r.recitals[0].fullText.startsWith('(1)')).toBe(false);
  });

  it('Fallback greift bei alter Struktur ohne ELI-Container', () => {
    const r = extractRecitals(OLD_HTML);
    expect(r.selector).toBe('paragraph-fallback');
    expect(r.recitals.map((x) => x.recitalNumber)).toEqual([1, 2]);
    expect(r.enactingFormulaFound).toBe(true);
  });

  it('ohne Erlass-Formel liefert der Fallback NICHTS — Raten ist verboten', () => {
    const ohneFormel = OLD_HTML.replace('HABEN FOLGENDE RICHTLINIE ERLASSEN:', '');
    const r = extractRecitals(ohneFormel);
    expect(r.selector).toBe('none');
    expect(r.recitals).toEqual([]);
  });

  it('meldet Lücken einzeln — vollzählig ist nicht vollständig', () => {
    const lueckig = ELI_HTML.replace('(2) Die Hersteller', '(9) Die Hersteller');
    const r = extractRecitals(lueckig);
    expect(r.gaps).toEqual([2, 4, 5, 6, 7, 8]);
  });
});

// ─── citedArticles (AC-4) ────────────────────────────────────────────────────

describe('extractCitedArticles', () => {
  it('fängt Einzelverweise DE und EN', () => {
    expect(extractCitedArticles('gemäß Artikel 13 dieser Verordnung')).toEqual(['art-13']);
    expect(extractCitedArticles('as set out in Article 14')).toEqual(['art-14']);
  });

  it('fängt Aufzählungen und expandiert Bereiche', () => {
    expect(extractCitedArticles('nach Artikel 13 und Artikel 14 Absatz 1')).toEqual(['art-13', 'art-14']);
    expect(extractCitedArticles('die Artikel 13 bis 15 gelten entsprechend')).toEqual(['art-13', 'art-14', 'art-15']);
    expect(extractCitedArticles('Articles 5, 7 and 9 shall apply')).toEqual(['art-5', 'art-7', 'art-9']);
  });

  it('schließt Verweise auf FREMDE Rechtsakte aus — nie geraten (AC-4)', () => {
    expect(extractCitedArticles('ergänzt Artikel 5 der Verordnung (EU) 2016/679')).toEqual([]);
    expect(extractCitedArticles('complements Article 5 of Regulation (EU) 2016/679')).toEqual([]);
    expect(extractCitedArticles('gemäß Artikel 22 der Richtlinie 95/46/EG')).toEqual([]);
  });

  it('Charta, AEUV und Vertrag sind Fremdakte — der dsgvo:rec-1-Fall vom 14.08.', () => {
    // Am echten Bestand gefunden: Recital 1 der DSGVO lieferte fälschlich
    // art-8/art-16 — Artikel 8 der Charta, Artikel 16 AEUV. Zwei Löcher:
    // fehlende Akt-Namen und das „Absatz 1"-Zwischenstück.
    const dsgvoRec1 =
      'Der Schutz natürlicher Personen bei der Verarbeitung personenbezogener Daten ist ' +
      'in Artikel 8 Absatz 1 der Charta der Grundrechte der Europäischen Union und ' +
      'Artikel 16 Absatz 1 des Vertrags über die Arbeitsweise der Europäischen Union (AEUV) verankert.';
    expect(extractCitedArticles(dsgvoRec1)).toEqual([]);
    expect(extractCitedArticles('as enshrined in Article 8(1) of the Charter')).toEqual([]);
    expect(extractCitedArticles('pursuant to Article 16(1) TFEU')).toEqual([]);
    expect(extractCitedArticles('nach Artikel 288 AEUV')).toEqual([]);
  });

  it('„Absatz"-Zusatz beim EIGENEN Artikel bleibt ein Treffer', () => {
    expect(extractCitedArticles('nach Artikel 14 Absatz 1 dieser Verordnung')).toEqual(['art-14']);
    expect(extractCitedArticles('as referred to in Article 14(1) of this Regulation')).toEqual(['art-14']);
  });

  it('gemischter Fall: eigener Verweis bleibt, fremder fällt', () => {
    const t = 'Nach Artikel 13 gilt ergänzend Artikel 5 der Verordnung (EU) 2016/679.';
    expect(extractCitedArticles(t)).toEqual(['art-13']);
  });

  it('kein Verweis → leere Liste, nicht null', () => {
    expect(extractCitedArticles('Die Union braucht klare Regeln.')).toEqual([]);
  });

  it('deckelt absurde Bereiche statt sie zu expandieren', () => {
    expect(extractCitedArticles('Artikel 1 bis 300 finden Anwendung')).toEqual([]);
  });
});

// ─── Idempotenz-Anker (AC-6) ─────────────────────────────────────────────────

describe('recitalVersionHash', () => {
  it('gleicher Text (auch mit Whitespace-Varianz) → gleicher Hash', () => {
    expect(recitalVersionHash('Die  Union\n braucht Regeln')).toBe(
      recitalVersionHash('Die Union braucht Regeln')
    );
  });
  it('anderer Text → anderer Hash', () => {
    expect(recitalVersionHash('a')).not.toBe(recitalVersionHash('b'));
  });
});

// ─── Bauer + Schema (AC-1, AC-7) ─────────────────────────────────────────────

describe('buildRecitalDoc + Recital-Schema', () => {
  const doc = buildRecitalDoc({
    source: 'cra-de',
    language: 'de',
    celex: '32024R2847',
    recital: { recitalNumber: 12, fullText: 'Die Hersteller sollten nach Artikel 13 melden.' },
    crawledAt: new Date('2026-08-14T06:00:00.000Z'),
  });

  it('Schlüssel entsteht über die unveränderte shared-Funktion (AC-1)', () => {
    expect(doc.regulationKey).toBe('cra-de:rec-12');
  });

  it('citedArticles kommen mechanisch aus dem Text', () => {
    expect(doc.citedArticles).toEqual(['art-13']);
  });

  it('TOR: jedes Feld des Bauers steht im Schema — die zwei Listen im Gleichstand (AC-7)', () => {
    // Die Falle vom 12.08.: Interface kannte partyRoleObserved, das Schema
    // nicht, mongoose strippte es bei 1746 Writes still. Hier von Anfang an
    // mechanisch verhindert.
    const schemaPaths = Object.keys(Recital.schema.paths);
    for (const key of Object.keys(doc)) {
      expect(schemaPaths).toContain(key);
    }
  });

  it('validiert und überlebt den Dokument-Roundtrip', () => {
    const m = new Recital(doc);
    expect(m.validateSync()).toBeUndefined();
    const obj = m.toObject();
    expect(obj.recitalNumber).toBe(12);
    expect(obj.versionHash).toBe(recitalVersionHash(doc.fullText));
  });

  it('strict throw: ein unbekanntes Feld bricht laut statt still zu verschwinden', () => {
    expect(() => new Recital({ ...doc, futureField: 'x' } as never)).toThrow(/strict/i);
  });

  it('Pflichtfelder fehlen nicht still: ohne versionHash → Validierungsfehler', () => {
    const { versionHash: _vh, ...rest } = doc;
    const m = new Recital(rest as never);
    expect(m.validateSync()?.errors?.versionHash).toBeDefined();
  });
});
