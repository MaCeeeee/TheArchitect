/**
 * THE-529 (Task 1): Hebung von `identsForSource` + `splitSentences` +
 * Satz-Auswahl (`selectBorrowSentence`) aus dem Server-Skript
 * `build-interprets-audit.ts` nach @thearchitect/shared.
 *
 * Die Golden-Assertions hier sind VOR dem Umzug mit den Server-lokalen
 * Original-Funktionen erfasst worden (ts-node, 2026-07-26) — sie frieren das
 * IST-Verhalten byte-identisch ein. Verhalten ändern heißt: diese Tests
 * brechen absichtlich.
 *
 * shared trägt keine eigenen Tests — Muster wie interpretsAudit.test.ts.
 *
 * Run: cd packages/server && npx jest src/__tests__/interpretsSharedLift.test.ts
 */
import {
  identsForSource,
  splitSentences,
  selectBorrowSentence,
} from '@thearchitect/shared';

// ─── identsForSource — Golden (erfasst vor dem Umzug) ────────────────

describe('identsForSource (shared) — Golden-Identität zum Server-Original', () => {
  it.each([
    ['dsgvo', ['2016/679']],
    ['standardisation-en', ['1025/2012']],
    ['emoney-de', ['2009/110']],
    ['nis2', ['2022/2555']],
    ['psd2-en', ['2015/2366']],
  ])('%s → %j', (source, expected) => {
    expect(identsForSource(source)).toEqual(expected);
  });

  it('unbekannte Quelle → leeres Array', () => {
    expect(identsForSource('unbekannt')).toEqual([]);
  });
});

// ─── splitSentences — Identitäts-Test (3 Beispieltexte, erfasst vorher) ──

describe('splitSentences (shared) — Identität zum Server-Original', () => {
  it('Text 1: juristische Abkürzungen schneiden NICHT', () => {
    expect(
      splitSentences(
        'Erster Satz endet hier. Zweiter Satz nennt Art. 5 und läuft weiter; Dritter Satz beginnt mit Abs. 2 gem. Nr. 3. Vierter Satz.',
      ),
    ).toEqual([
      'Erster Satz endet hier.',
      'Zweiter Satz nennt Art. 5 und läuft weiter;',
      'Dritter Satz beginnt mit Abs. 2 gem. Nr. 3.',
      'Vierter Satz.',
    ]);
  });

  it('Text 2: Semikolon + nummerierte Absätze + „z. B." bleibt ganz', () => {
    expect(
      splitSentences(
        '„Vorfall“ bezeichnet einen Vorfall im Sinne des Artikels 6 der Verordnung (EU) 2022/2555; (2) Die Mitgliedstaaten stellen sicher, dass z. B. Meldungen erfolgen. (3) Weitere Pflichten gelten.',
      ),
    ).toEqual([
      '„Vorfall“ bezeichnet einen Vorfall im Sinne des Artikels 6 der Verordnung (EU) 2022/2555;',
      '(2) Die Mitgliedstaaten stellen sicher, dass z. B. Meldungen erfolgen.',
      '(3) Weitere Pflichten gelten.',
    ]);
  });

  it('Text 3: EN-Quote nach Punkt ist KEIN Satzanfang (Lookahead verlangt Großbuchstabe/Ziffer/Klammer)', () => {
    expect(
      splitSentences(
        'This Regulation applies to financial entities. ‘incident’ means an incident as defined in Article 6, point (6), of Directive (EU) 2022/2555. Member States shall ensure compliance; They shall report annually.',
      ),
    ).toEqual([
      'This Regulation applies to financial entities. ‘incident’ means an incident as defined in Article 6, point (6), of Directive (EU) 2022/2555.',
      'Member States shall ensure compliance;',
      'They shall report annually.',
    ]);
  });

  it('leerer Text → leeres Array', () => {
    expect(splitSentences('')).toEqual([]);
  });
});

// ─── selectBorrowSentence — die gehobene Satz-Auswahl ────────────────

describe('selectBorrowSentence (shared)', () => {
  const CITING_TEXT =
    'This Regulation applies to products. ' +
    "(43) ‘incident’ means an incident as defined in Article 6, point (6), of Directive (EU) 2022/2555; " +
    'Member States shall ensure compliance.';

  it('findet den Borrow-Satz, liefert Slots + Verdikt + berechnete Richtung', () => {
    const hit = selectBorrowSentence({
      citingSide: 'a',
      fullText: CITING_TEXT,
      pairTargetArticle: '6',
      targetLawIdents: ['2022/2555'],
      targetProvisionKind: 'definition',
    });
    expect(hit).toBeDefined();
    expect(hit!.sentence).toMatch(/as defined in Article 6/);
    expect(hit!.slots.term).toBe('incident');
    expect(hit!.slots.operator).toBe('as defined in');
    expect(hit!.slots.targetArticle).toBe('6');
    expect(hit!.slots.targetLawHit).toBe('2022/2555');
    expect(hit!.verdict).toBe('interprets');
    expect(hit!.direction).toBe('b-to-a'); // a zitiert → Pfeil vom Definierer (b) weg
    expect(hit!.p0).toBe(true);
    expect(hit!.p1).toBe(true);
    expect(hit!.p2).toBe(true);
  });

  it('kein Satz nennt den Paar-Artikel des Ziel-Gesetzes → undefined', () => {
    const hit = selectBorrowSentence({
      citingSide: 'a',
      fullText: 'Diese Vorschrift regelt Verstöße ohne jeden Verweis auf eine andere Verordnung.',
      pairTargetArticle: '6',
      targetLawIdents: ['2022/2555'],
    });
    expect(hit).toBeUndefined();
  });

  it('mehrere Kandidaten-Sätze → der mit dem höchsten Verdikt gewinnt', () => {
    // Satz 1: Nutzungs-Referenz auf Art. 6 (kein Operator) → none-usage.
    // Satz 2: echte Anleihe auf Art. 6 → interprets. Die Auswahl muss Satz 2 nehmen.
    const text =
      'Die Behörden handeln nach Artikel 6 der Verordnung (EU) 2022/2555 im Rahmen ihrer Aufgaben; ' +
      '(2) „Vorfall“ bezeichnet einen Vorfall im Sinne des Artikels 6 der Verordnung (EU) 2022/2555;';
    const hit = selectBorrowSentence({
      citingSide: 'b',
      fullText: text,
      pairTargetArticle: '6',
      targetLawIdents: ['2022/2555'],
      targetProvisionKind: 'definition',
    });
    expect(hit).toBeDefined();
    expect(hit!.verdict).toBe('interprets');
    expect(hit!.sentence).toMatch(/bezeichnet einen Vorfall/);
    expect(hit!.direction).toBe('a-to-b'); // b zitiert → Pfeil vom Definierer (a) weg
  });

  it('P2-Fallback: kein provisionKind, aber der Ziel-Text prägt den Begriff', () => {
    const hit = selectBorrowSentence({
      citingSide: 'a',
      fullText: "‘incident’ means an incident as defined in Article 6 of Directive (EU) 2022/2555;",
      pairTargetArticle: '6',
      targetLawIdents: ['2022/2555'],
      targetFullText: "(6) ‘incident’ means an event compromising availability;",
    });
    expect(hit).toBeDefined();
    expect(hit!.verdict).toBe('interprets');
    expect(hit!.p2).toBe('fallback');
  });
});
