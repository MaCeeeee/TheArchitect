/**
 * Tests für den INTERPRETS-Prüfbaum (THE-519, Task 1). shared trägt keine
 * eigenen Tests — der Testort ist der Server (Muster wie prompt.ts).
 *
 * Die vier Kalibrier-Fälle nutzen ECHTE Verweis-Sätze aus
 * `packages/server/src/evals/golden/relations.v4.json`. Die Sätze sind hier als
 * Fixtures hartkodiert; die AUTOMATISCHE Ableitung von `citingSentence` +
 * `pairTargetArticle` (Re-Run von referencesLaw + Satz-Segmentierung über beide
 * Seiten) baut Task 4 (Instrument-Generator). Der Zweck dieser Fälle: beweisen,
 * dass der Prüfbaum die drei v4-Fehler mechanisch fängt und die eine korrekte
 * Schablone bestätigt — insbesondere, dass die Richtung BERECHNET wird.
 */
import {
  auditInterpretsCandidate,
  parseBorrowTemplate,
  deriveDirection,
  isDefinitionTitle,
  type InterpretsAuditInput,
} from '@thearchitect/shared';

// ─── Kalibrier-Fixtures (echte Golden-Sätze, exakte Anführungszeichen) ───────
const IDENTS = {
  gdpr: ['2016/679'],
  nis2: ['2022/2555'],
  psd2: ['2015/2366'],
  standardisation: ['1025/2012'],
};

describe('deriveDirection — die Richtung entsteht NUR hier, berechnet', () => {
  it('zitiert a, zeigt der Pfeil von der Ziel-Seite b weg → b-to-a', () => {
    expect(deriveDirection('a')).toBe('b-to-a');
  });
  it('zitiert b, zeigt der Pfeil von der Ziel-Seite a weg → a-to-b', () => {
    expect(deriveDirection('b')).toBe('a-to-b');
  });
});

describe('parseBorrowTemplate', () => {
  it('erkennt DE-Operator „im Sinne" + Definiendum + Ziel-Artikel im selben Satz', () => {
    const slots = parseBorrowTemplate(
      '3. „personenbezogene Daten“ personenbezogene Daten im Sinne des Artikels 4 Nummer 1 der Verordnung (EU) 2016/679;',
      IDENTS.gdpr,
    );
    expect(slots.operator).toBe('im Sinne');
    expect(slots.term).toBe('personenbezogene Daten');
    expect(slots.targetArticle).toBe('4');
    expect(slots.targetLawHit).toBe('2016/679');
  });

  it('erkennt EN-Operator „as defined in" + Term + Artikel', () => {
    const slots = parseBorrowTemplate(
      '(43) ‘incident’ means an incident as defined in Article 6, point (6), of Directive (EU) 2022/2555;',
      IDENTS.nis2,
    );
    expect(slots.operator).toBe('as defined in');
    expect(slots.term).toBe('incident');
    expect(slots.targetArticle).toBe('6');
    expect(slots.targetLawHit).toBe('2022/2555');
  });

  it('„pursuant to" OHNE Definiendum-Kontext ist KEIN Operator (dora-46-Falle)', () => {
    const slots = parseBorrowTemplate(
      'a CSIRT designated as coordinator pursuant to Article 12(1) of Directive (EU) 2022/2555',
      IDENTS.nis2,
    );
    expect(slots.operator).toBeUndefined();
  });

  it('„pursuant to" MIT Definiendum-Kontext („X" means …) zählt als Operator', () => {
    const slots = parseBorrowTemplate(
      '‘competent authority’ means an authority pursuant to Article 8 of Directive (EU) 2022/2555',
      IDENTS.nis2,
    );
    expect(slots.operator).toBe('pursuant to');
    expect(slots.term).toBe('competent authority');
    expect(slots.targetArticle).toBe('8');
  });

  it('ordnet targetArticle nur zu, wenn Nummer UND Ziel-Ident im selben Satz stehen', () => {
    // Artikel-Nummer da, aber KEIN Ziel-Gesetz im Satz → targetArticle undefined.
    const slots = parseBorrowTemplate('„Begriff“ im Sinne des Artikels 9 dieser Verordnung', IDENTS.gdpr);
    expect(slots.operator).toBe('im Sinne');
    expect(slots.targetArticle).toBeUndefined();
    expect(slots.targetLawHit).toBeUndefined();
  });
});

describe('auditInterpretsCandidate — 4 Kalibrier-Fälle aus relations.v4.json', () => {
  // ── Positiv-Schablone: data-act-de-art-2 ↔ dsgvo-art-4 (v4 KORREKT) ──────
  it('data-act-de-art-2 ↔ dsgvo-art-4 → interprets, Richtung b-to-a (zitiert a)', () => {
    const input: InterpretsAuditInput = {
      citingSide: 'a', // data-act ist die zitierende Seite
      citingSentence:
        '3. „personenbezogene Daten“ personenbezogene Daten im Sinne des Artikels 4 Nummer 1 der Verordnung (EU) 2016/679;',
      pairTargetArticle: '4', // dsgvo:art-4
      targetLawIdents: IDENTS.gdpr,
      targetProvisionKind: 'definition', // dsgvo Art. 4 ist der Definitions-Artikel
    };
    const audit = auditInterpretsCandidate(input);
    expect(audit.p0).toBe(true);
    expect(audit.p1).toBe(true);
    expect(audit.p2).toBe(true);
    expect(audit.verdict).toBe('interprets');
    expect(audit.direction).toBe('b-to-a');
  });

  // ── Fehler 1: cra-en-art-3 ↔ nis2-art-6 (v4 speicherte fälschlich a-to-b) ─
  it('cra-en-art-3 ↔ nis2-art-6 → interprets; Richtung b-to-a und NIEMALS a-to-b', () => {
    const input: InterpretsAuditInput = {
      citingSide: 'a', // cra ist die zitierende Seite
      citingSentence: '(43) ‘incident’ means an incident as defined in Article 6, point (6), of Directive (EU) 2022/2555;',
      pairTargetArticle: '6', // nis2:art-6
      targetLawIdents: IDENTS.nis2,
      targetProvisionKind: 'definition',
    };
    const audit = auditInterpretsCandidate(input);
    expect(audit.verdict).toBe('interprets');
    // Kern-Beweis: der v4-Fehler (a-to-b) ist nicht mehr reproduzierbar.
    expect(audit.direction).toBe('b-to-a');
    expect(audit.direction).not.toBe('a-to-b');
  });

  // ── Fehler 2: dora-de-art-46 ↔ psd2-de-art-33 (v4 fälschlich INTERPRETS) ─
  it('dora-de-art-46 ↔ psd2-de-art-33 → none-usage (P0 ✗, kein Leih-Operator)', () => {
    const input: InterpretsAuditInput = {
      citingSide: 'a',
      citingSentence:
        'b) bei Zahlungsinstituten, einschließlich der nach der Richtlinie (EU) 2015/2366 ausgenommenen Zahlungsinstitute, bei E-Geld-Instituten',
      pairTargetArticle: '33',
      targetLawIdents: IDENTS.psd2,
    };
    const audit = auditInterpretsCandidate(input);
    expect(audit.p0).toBe(false);
    expect(audit.verdict).toBe('none-usage');
    expect(audit.direction).toBeUndefined();
    expect(audit.reasons.join(' ')).toMatch(/Leih-Operator|Definiendum/);
  });

  // ── Fehler 3: dsgvo-art-4 ↔ nis2-de-art-35 (kein Definitions-Borrow) ─────
  // Der EINZIGE echte Cross-Norm-Verweis dieses Paars steht in nis2-35 (Seite b)
  // und ist eine reine NUTZUNG („… im Sinne von Artikel 4 … der Verordnung (EU)
  // 2016/679 …") OHNE Anführungszeichen-Definiendum. Nach der P0-Term-Schärfung
  // (Definiendum-Position erzwungen) fehlt der Term → P0 ✗ → none-usage. Das
  // spurioese PAAR selbst (dsgvo-4 ↔ nis2-35) entstand über ein
  // satzübergreifendes Pinpoint-Fenster (Task 2) und wird auf der
  // Ableitungs-Ebene von Task 4 als pair-artifact aussortiert (kein
  // Definiendum-Satz findet den Paar-Artikel) — auf der FUNKTIONS-Ebene ist der
  // echte Satz korrekt none-usage.
  it('dsgvo-art-4 ↔ nis2-de-art-35 → none-usage (echter Verweis ist Nutzung ohne Definiendum)', () => {
    const input: InterpretsAuditInput = {
      citingSide: 'b', // nis2-35 trägt den echten Verweis auf dsgvo
      citingSentence:
        'Stellen die zuständigen Behörden fest, dass der Verstoß eine Verletzung des Schutzes personenbezogener Daten im Sinne von Artikel 4 Nummer 12 der Verordnung (EU) 2016/679 zur Folge haben kann;',
      pairTargetArticle: '4',
      targetLawIdents: IDENTS.gdpr,
    };
    const audit = auditInterpretsCandidate(input);
    expect(audit.p0).toBe(false); // „im Sinne von" ohne Anführungszeichen-Definiendum
    expect(audit.verdict).toBe('none-usage');
    expect(audit.direction).toBeUndefined();
  });

  // ── P1-Zweig eigenständig: echte Anleihe-Schablone, aber falscher Artikel ─
  // Beweist den pair-artifact-Ausgang (P0 ✓, P1 ✗) mit ECHTEM Text: der
  // CRA-Satz borgt „incident" von NIS2 Art. 6 — gegen ein Paar geprüft, das
  // fälschlich Art. 35 als Ziel behauptet, nennt der Satz Art. 35 NICHT.
  it('echte Anleihe gegen falschen Paar-Artikel → pair-artifact (P0 ✓, P1 ✗)', () => {
    const input: InterpretsAuditInput = {
      citingSide: 'a',
      citingSentence: '(43) ‘incident’ means an incident as defined in Article 6, point (6), of Directive (EU) 2022/2555;',
      pairTargetArticle: '35', // falsch: der Satz nennt Art. 6, nicht Art. 35
      targetLawIdents: IDENTS.nis2,
      targetProvisionKind: 'definition',
    };
    const audit = auditInterpretsCandidate(input);
    expect(audit.p0).toBe(true);
    expect(audit.p1).toBe(false);
    expect(audit.verdict).toBe('pair-artifact');
    expect(audit.direction).toBeUndefined();
    expect(audit.reasons.join(' ')).toMatch(/Mining-Artefakt/);
  });

  // ── P0-Term-Loch (Review-Fund): irgendein Quote ≠ Definiendum ───────────
  // „The ‚Commission' shall act as defined in Article 6 …": ‚Commission' steht
  // NICHT in Definiendum-Position (zwischen Quote und Operator steht das
  // Prädikat „shall act", keine Wiederholung/kein Definiens-Verb) → term leer
  // → P0 ✗ → none-usage. Ohne die Schärfung liefe das fälschlich als interprets.
  it('Quote in Nicht-Definiendum-Position (⟨X⟩ shall act as defined in …) → none-usage', () => {
    const input: InterpretsAuditInput = {
      citingSide: 'a',
      citingSentence: "The 'Commission' shall act as defined in Article 6 of Directive (EU) 2022/2555",
      pairTargetArticle: '6',
      targetLawIdents: IDENTS.nis2,
      targetProvisionKind: 'definition',
    };
    const audit = auditInterpretsCandidate(input);
    expect(audit.slots.term).toBeUndefined();
    expect(audit.p0).toBe(false);
    expect(audit.verdict).toBe('none-usage');
  });
});

describe('auditInterpretsCandidate — P2-Zweige', () => {
  it('P2 fallback: kein provisionKind, aber Ziel-Text prägt den Term ("… means …")', () => {
    const input: InterpretsAuditInput = {
      citingSide: 'a',
      citingSentence: '(43) ‘incident’ means an incident as defined in Article 6, point (6), of Directive (EU) 2022/2555;',
      pairTargetArticle: '6',
      targetLawIdents: IDENTS.nis2,
      // KEIN targetProvisionKind → Fallback über den Ziel-Text
      targetFullText: "(6) 'incident' means an event compromising the availability of a system;",
    };
    const audit = auditInterpretsCandidate(input);
    expect(audit.p2).toBe('fallback');
    expect(audit.verdict).toBe('interprets');
    expect(audit.direction).toBe('b-to-a');
  });

  it('P2 ✗ → policy-A (geprägter Begriff über Sach-Artikel), Richtung DENNOCH berechnet', () => {
    const input: InterpretsAuditInput = {
      citingSide: 'b',
      citingSentence: '(43) ‘incident’ means an incident as defined in Article 6, point (6), of Directive (EU) 2022/2555;',
      pairTargetArticle: '6',
      targetLawIdents: IDENTS.nis2,
      // Kein provisionKind, Ziel-Text prägt den Term NICHT → P2 false
      targetFullText: 'Article 6 sets out the tasks of the competent authorities.',
    };
    const audit = auditInterpretsCandidate(input);
    expect(audit.p2).toBe(false);
    expect(audit.p2Source).toBeNull();
    expect(audit.verdict).toBe('policy-A');
    expect(audit.direction).toBe('a-to-b'); // Richtung mitgegeben (Regel A könnte interprets sagen)
  });

  it('p2Source weist die Quelle des P2-Belegs aus (typed / fallback)', () => {
    const typed = auditInterpretsCandidate({
      citingSide: 'a',
      citingSentence: '(43) ‘incident’ means an incident as defined in Article 6, point (6), of Directive (EU) 2022/2555;',
      pairTargetArticle: '6',
      targetLawIdents: IDENTS.nis2,
      targetProvisionKind: 'definition',
    });
    expect(typed.p2).toBe(true);
    expect(typed.p2Source).toBe('typed');

    const fallback = auditInterpretsCandidate({
      citingSide: 'a',
      citingSentence: '(43) ‘incident’ means an incident as defined in Article 6, point (6), of Directive (EU) 2022/2555;',
      pairTargetArticle: '6',
      targetLawIdents: IDENTS.nis2,
      targetFullText: "(6) 'incident' means an event compromising the availability of a system;",
    });
    expect(fallback.p2).toBe('fallback');
    expect(fallback.p2Source).toBe('fallback');
  });
});

// ─── isDefinitionTitle (jetzt in shared, THE-529 Härtung) ────────────────────
describe('isDefinitionTitle (shared) — Definitions-Überschriften DE + EN', () => {
  it('erkennt DE + EN Definitions-Titel', () => {
    expect(isDefinitionTitle('Begriffsbestimmungen')).toBe(true);
    expect(isDefinitionTitle('Definitions')).toBe(true);
    expect(isDefinitionTitle('Article 4 — Definitionen')).toBe(true);
    expect(isDefinitionTitle('Begriffe')).toBe(true);
  });
  it('lehnt Sach-Überschriften + undefined ab', () => {
    expect(isDefinitionTitle('Zuständige Behörden')).toBe(false);
    expect(isDefinitionTitle('Verstöße')).toBe(false);
    expect(isDefinitionTitle(undefined)).toBe(false);
  });
});

// ─── Überschrift-P2 als dritte Quelle (der Beweis der Härtung) ───────────────
//
// Deutsche Sammel-Definition: der Ziel-Text prägt den Begriff NACH dem Verb
// („… bezeichnet der Ausdruck: 1. ‚personenbezogene Daten' alle Informationen
// …"), weshalb der fullText-Fallback (Term unmittelbar VOR means/bezeichnet) ihn
// NICHT fasst. Ohne getyptes provisionKind hing so ein Fall bislang in Prod in
// der Luft. Die Ziel-ÜBERSCHRIFT „Begriffsbestimmungen" ist der einzige Hebel.
describe('auditInterpretsCandidate — Überschrift-P2 (dritte Quelle)', () => {
  const CITING =
    '3. „personenbezogene Daten“ personenbezogene Daten im Sinne des Artikels 4 Nummer 1 der Verordnung (EU) 2016/679;';
  // Sammel-Definition: Definiendum steht NACH dem Verb → fullText-Fallback greift NICHT.
  const COLLECTIVE_DEF =
    'Im Sinne dieser Verordnung bezeichnet der Ausdruck: 1. „personenbezogene Daten“ alle Informationen, die sich auf eine identifizierte oder identifizierbare natürliche Person beziehen;';

  it('MIT Definitions-Überschrift → interprets, P2 über die Überschrift (title)', () => {
    const audit = auditInterpretsCandidate({
      citingSide: 'a',
      citingSentence: CITING,
      pairTargetArticle: '4',
      targetLawIdents: IDENTS.gdpr,
      // KEIN provisionKind (typing-los), aber Definitions-Überschrift
      targetTitle: 'Begriffsbestimmungen',
      targetFullText: COLLECTIVE_DEF,
    });
    expect(audit.p0).toBe(true);
    expect(audit.p1).toBe(true);
    expect(audit.p2).toBe(true);
    expect(audit.p2Source).toBe('title'); // Überschrift war der Hebel, nicht typed/fallback
    expect(audit.verdict).toBe('interprets');
    expect(audit.direction).toBe('b-to-a');
  });

  it('OHNE Überschrift UND ohne provisionKind → NICHT interprets (policy-A) — die Überschrift ist der Hebel', () => {
    const audit = auditInterpretsCandidate({
      citingSide: 'a',
      citingSentence: CITING,
      pairTargetArticle: '4',
      targetLawIdents: IDENTS.gdpr,
      // weder title noch provisionKind; der Sammel-Def-fullText prägt den Term
      // NACH dem Verb → Fallback greift NICHT
      targetFullText: COLLECTIVE_DEF,
    });
    expect(audit.p0).toBe(true);
    expect(audit.p1).toBe(true);
    expect(audit.p2).toBe(false);
    expect(audit.p2Source).toBeNull();
    expect(audit.verdict).toBe('policy-A'); // ohne den Überschrift-Hebel bleibt es offen
  });

  it('P2-Reihenfolge: typed schlägt title (typed gewinnt, wenn beide gälten)', () => {
    const audit = auditInterpretsCandidate({
      citingSide: 'a',
      citingSentence: CITING,
      pairTargetArticle: '4',
      targetLawIdents: IDENTS.gdpr,
      targetProvisionKind: 'definition',
      targetTitle: 'Begriffsbestimmungen',
    });
    expect(audit.p2Source).toBe('typed'); // erste zutreffende Quelle gewinnt
  });

  // Regression (Review-Fund): die Überschrift-P2 darf ein GETYPTES Nicht-
  // Definitions-Provision nicht überstimmen — sonst würde ein Sach-Artikel mit
  // definitions-artigem Titel (MDR Art. 3 „Änderung bestimmter
  // Begriffsbestimmungen", typisiert 'procedural') in Prod fälschlich eine
  // mechanische INTERPRETS-Kante erzeugen. Typing hat Vorrang (alte Server-
  // Reihenfolge); die Überschrift ist nur das Netz für UNTYPISIERTE Provisionen.
  it('getyptes procedural + Definitions-Titel → NICHT interprets (Typing schlägt Überschrift)', () => {
    const audit = auditInterpretsCandidate({
      citingSide: 'a',
      citingSentence: '5. „Produkt“ Produkt im Sinne des Artikels 3 der Verordnung (EU) 2017/745;',
      pairTargetArticle: '3',
      targetLawIdents: ['2017/745'],
      targetProvisionKind: 'procedural',
      targetTitle: 'Änderung bestimmter Begriffsbestimmungen',
    });
    expect(audit.p0).toBe(true); // Begriff + Leih-Operator vorhanden
    expect(audit.p1).toBe(true); // Ziel-Artikel 3 = Paar-Artikel
    expect(audit.p2).toBe(false); // Typing 'procedural' schlägt die Definitions-Überschrift
    expect(audit.p2Source).toBeNull();
    expect(audit.verdict).toBe('policy-A');
  });
});

// ─── DEFINIENS_VERB kennt jetzt „bedeutet" (dt. Sammel-Definitionen) ─────────
//
// „bedeutet" ist das Definiens-Verb der Norm-VO 1025/2012 Art. 2. In
// `hasDefiniendumContext` gatet ein Definiens-Verb hinter einem quotierten
// Begriff den BEDINGTEN Operator (aus reiner Nutzung wird eine Anleihe). Der
// Beweis läuft über den funktionierenden „pursuant to"-Pfad: mit „bedeutet"
// wird der Operator erkannt, mit einem Nicht-Definiens-Verb („applies") nicht.
describe('parseBorrowTemplate — „bedeutet" als Definiens-Verb', () => {
  it('quotierter Begriff + „bedeutet" gatet den bedingten Operator „pursuant to"', () => {
    const slots = parseBorrowTemplate(
      '‘harmonised standard’ bedeutet a standard pursuant to Article 2 of Regulation (EU) 1025/2012',
      IDENTS.standardisation,
    );
    expect(slots.operator).toBe('pursuant to');
    expect(slots.targetArticle).toBe('2');
    expect(slots.targetLawHit).toBe('1025/2012');
  });

  it('dasselbe mit Nicht-Definiens-Verb („applies") → KEIN Operator (Kontrast: „bedeutet" ist der Hebel)', () => {
    const slots = parseBorrowTemplate(
      '‘harmonised standard’ applies as a standard pursuant to Article 2 of Regulation (EU) 1025/2012',
      IDENTS.standardisation,
    );
    expect(slots.operator).toBeUndefined();
  });
});
