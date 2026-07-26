/**
 * INTERPRETS mechanisch prüfbar machen (THE-519, Task 1).
 *
 * Zwei reine, deterministische Funktionen bilden zusammen ein
 * Entscheidungs-Instrument für die Beziehungsart INTERPRETS ("Norm X borgt
 * einen Begriff aus Norm Y"):
 *
 *   1. `parseBorrowTemplate` zerlegt einen Verweis-Satz in vier Schablonen-Slots
 *      (term · operator · targetArticle · targetLawHit). Ein "Leih-Operator"
 *      ("im Sinne von", "as defined in", …) plus ein Definiendum (der geborgte
 *      Begriff) ist die Signatur einer echten Begriffs-Anleihe — im Gegensatz
 *      zu einer bloßen Nutzungs-/Verweis-Referenz ("nach der Richtlinie …").
 *
 *   2. `auditInterpretsCandidate` läuft einen strengen Prüfbaum P0→P1→P2 und
 *      leitet ein Verdikt ab. Die **Richtung wird berechnet, nie geraten**:
 *      Sie zeigt vom DEFINIERER (der zitierten Norm = Ziel-Seite) weg. Genau
 *      hier lagen in der v4-Kalibrierung BEIDE Rater falsch
 *      (cra-en-art-3 → nis2-art-6 wurde a-to-b statt b-to-a gelabelt); mit
 *      `deriveDirection` als eigener, einzeln getesteter Funktion ist dieser
 *      Freiheitsgrad entfernt.
 *
 * Die Gesetzes-Identifikatoren (Verordnungsnummern) kommen aus derselben Quelle
 * wie der Verweis-Miner (`LAW_FAMILY_PATTERNS`/`referencesLaw` in
 * `lawPatterns.ts`) — der Aufrufer (Task 4) reicht sie als `targetLawIdents`
 * herein, damit hier keine zweite, driftende Nummern-Wahrheit entsteht.
 *
 * shared trägt keine eigenen Tests — die Tests liegen in
 * `packages/server/src/__tests__/interpretsAudit.test.ts` (Muster wie prompt.ts).
 *
 * Linear: THE-519
 */

import { normalizeArticleNumber, splitSentences } from './lawPatterns';

/** Zwei Anführungs-Konventionen des Korpus: DE „ … " und EN ‘ … ' (plus gerade). */
// Unicode-Escapes, damit die geraden Quotes das String-Literal nicht abschließen.
const QUOTE_CHARS = '\u201E\u201C\u201D\u201F\u2018\u2019\u201A\u201B\u0022\u0027';
const QUOTED_TERM = new RegExp(`[${QUOTE_CHARS}]([^${QUOTE_CHARS}]+)[${QUOTE_CHARS}]`, 'g');

/**
 * Leih-Operatoren, die immer zählen (Begriffs-Anleihe unabhängig vom Kontext).
 * `im Sinne` deckt „im Sinne von/des/dieser" ab; `bezeichnet … gemäß` ist die
 * DE-Definitions-Anleihe.
 */
const UNCONDITIONAL_OPERATORS: Array<{ re: RegExp; label: string }> = [
  { re: /\bas defined in\b/i, label: 'as defined in' },
  { re: /\bas referred to in\b/i, label: 'as referred to in' },
  { re: /\bim Sinne\b/i, label: 'im Sinne' },
  { re: /\bbezeichnet\b[^.;:]*\bgemäß\b/i, label: 'bezeichnet … gemäß' },
];

/**
 * Bedingte Operatoren: „pursuant to"/„gemäß" sind NUR dann eine Begriffs-Anleihe,
 * wenn der Satz ein Definiendum-Muster trägt (ein Ausdruck in Anführungszeichen
 * bzw. ein nummeriertes Item, gefolgt von „means"/„bezeichnet"/„ist"). Ohne
 * diesen Kontext ist „pursuant to Article X" eine reine Nutzungs-Referenz — das
 * war der dora-46-Fehler.
 */
const CONDITIONAL_OPERATORS: Array<{ re: RegExp; label: string }> = [
  { re: /\bpursuant to\b/i, label: 'pursuant to' },
  { re: /\bgemäß\b/i, label: 'gemäß' },
];

/**
 * Definiens-Verb: was einem Definiendum folgt, wenn ein Begriff GEPRÄGT wird.
 * `ist` ist eine schwache dt. Kopula und bleibt hier NUR, weil der Plan sie für
 * den P2-Fallback + die Definiendum-Kontext-Gate ausdrücklich nennt („Term
 * gefolgt von means/bezeichnet/ist"). Für die schärfere Definiendum-POSITION
 * (Term direkt vor dem Operator, `isDefiniendumLink`) wird `ist` bewusst NICHT
 * verwendet — dort zählen nur die starken Verben means/bezeichnet.
 *
 * `bedeutet` (THE-529 Härtung): deutsche Sammel-Definitionen prägen ihre
 * Begriffe mit „bedeutet" statt „bezeichnet" — z. B. 1025/2012 (Norm-VO)
 * Art. 2 „‚harmonisierte Norm' bedeutet eine Norm …". Ohne „bedeutet" trüge
 * ein solcher Satz keinen Definiendum-Kontext, und ein bedingter Operator
 * („gemäß") würde nicht als Anleihe zählen.
 */
const DEFINIENS_VERB = /\b(?:means|bezeichnet|bedeutet|ist)\b/i;

/**
 * Definitions-Überschrift (DE + EN): trägt die ZIEL-Provision einen Titel wie
 * „Begriffsbestimmungen"/„Definitions", IST sie ein Definitions-Ort (P2) — auch
 * wenn sie nicht getypt ist (fehlender `provisionKind`) und die Sammel-Definition
 * den Begriff so prägt, dass der Ziel-Text-Fallback ihn nicht fasst (Definiendum
 * NACH dem Verb: „… bezeichnet der Ausdruck: 1. ‚X' …"). Gehoben aus
 * build-interprets-audit.ts (THE-529 Härtung), damit Server-Eval und
 * Crawler-Prod byte-gleich dieselbe dritte P2-Quelle nutzen.
 */
const DEFINITION_TITLE = /\b(?:definition|definitions|definitionen|begriffsbestimmung|begriffsbestimmungen|begriffe)\b/i;

/** Ist die Ziel-Provision laut Überschrift ein Definitions-Ort? */
export function isDefinitionTitle(title: string | undefined): boolean {
  return Boolean(title && DEFINITION_TITLE.test(title));
}

/** Max. Distanz (Zeichen) zwischen Definiendum-Ausdruck und Operator. */
const DEFINIENDUM_WINDOW = 40;

export interface BorrowSlots {
  /** Das Definiendum — der geborgte Begriff (Anführungszeichen-/Nummern-Item). */
  term?: string;
  /** Der erkannte Leih-Operator (Klartext-Label, nicht der Roh-Match). */
  operator?: string;
  /** Die Artikelnummer, die dem Operator + einem Ziel-Gesetz zugeordnet ist. */
  targetArticle?: string;
  /** Der im Satz gematchte Ziel-Gesetz-Identifikator (z. B. „2016/679"). */
  targetLawHit?: string;
}

export type InterpretsVerdict = 'interprets' | 'none-usage' | 'pair-artifact' | 'policy-A';
export type Direction = 'a-to-b' | 'b-to-a';

/**
 * Herkunft des P2-Belegs, damit die Konsumenten den Prüfpfad korrekt labeln
 * können (Server-Artefakt „(typisiert)/(Überschrift)/(Ziel-Text)", Crawler-
 * pPath). `null`, wenn P2 nicht (positiv) griff — d. h. vor P2 abgebrochen oder
 * P2 ✗ (policy-A).
 *   'typed'    — Ziel-Provision als Definition typisiert (`provisionKind`).
 *   'title'    — Ziel-Provision trägt eine Definitions-Überschrift.
 *   'fallback' — Ziel-Text prägt den Begriff selbst („X means/bezeichnet …").
 */
export type P2Source = 'typed' | 'title' | 'fallback' | null;

export interface InterpretsAudit {
  slots: BorrowSlots;
  /** P0 — Leih-Operator + Definiendum vorhanden. */
  p0: boolean;
  /** P1 — Verweis zielt auf den Paar-Artikel des Ziel-Gesetzes. */
  p1: boolean;
  /** P2 — Ziel ist ein Definitions-Ort (true) oder per Fallback belegt. */
  p2: boolean | 'fallback';
  /** Quelle des P2-Belegs (typed > title > fallback) — `null`, wenn P2 nicht positiv griff. */
  p2Source: P2Source;
  verdict: InterpretsVerdict;
  /** Berechnete Richtung (fehlt, wenn der Prüfbaum vor P2 abbricht). */
  direction?: Direction;
  /** Je durchlaufener Knoten ein Klartext-Satz — Rohstoff für das Audit-Artefakt. */
  reasons: string[];
}

export interface InterpretsAuditInput {
  citingSide: 'a' | 'b';
  citingSentence: string;
  pairTargetArticle: string;
  targetLawIdents: string[];
  targetProvisionKind?: string;
  /** P2-Quelle „Überschrift": Titel der Ziel-Provision (dritte P2-Quelle). */
  targetTitle?: string;
  targetFullText?: string;
}

/** Escaped einen Ziel-Identifikator zur literalen (aber tolerant-i) Regex-Suche. */
function identRegex(ident: string): RegExp {
  return new RegExp(ident.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
}

/** Alle Anführungszeichen-Ausdrücke des Satzes mit ihrer Position. */
function quotedTerms(sentence: string): Array<{ text: string; start: number; end: number }> {
  const out: Array<{ text: string; start: number; end: number }> = [];
  const re = new RegExp(QUOTED_TERM.source, 'g');
  let m: RegExpExecArray | null;
  while ((m = re.exec(sentence)) !== null) {
    out.push({ text: m[1].trim(), start: m.index, end: m.index + m[0].length });
    if (m.index === re.lastIndex) re.lastIndex++;
  }
  return out;
}

/**
 * Trägt der Satz ein Definiendum-Muster? Ein Ausdruck in Anführungszeichen,
 * gefolgt (in Reichweite) von einem Definiens-Verb — die Signatur einer
 * Begriffs-PRÄGUNG. Nur dann zählen die bedingten Operatoren als Anleihe.
 */
function hasDefiniendumContext(sentence: string): boolean {
  for (const q of quotedTerms(sentence)) {
    const after = sentence.slice(q.end, q.end + 40);
    if (DEFINIENS_VERB.test(after)) return true;
  }
  return false;
}

/**
 * Steht ein Anführungszeichen-Ausdruck in DEFINIENDUM-POSITION vor dem
 * Operator? Zwischen Ausdruck und Operator darf nur ein Definiendum-Link
 * stehen: (a) nichts (Ausdruck grenzt an den Operator), (b) ein starkes
 * Definiens-Verb „means"/„bezeichnet" (Muster „‚incident' means … as defined
 * in"), oder (c) eine Wiederholung des Begriffs selbst (Muster
 * „‚personenbezogene Daten' personenbezogene Daten im Sinne …"). Ein anderes
 * Prädikat („shall act", „applies") disqualifiziert — dann wird der Begriff
 * BENUTZT, nicht geprägt.
 */
function isDefiniendumLink(between: string, term: string): boolean {
  const trimmed = between.trim().replace(/^[\s,;:.()]+|[\s,;:.()]+$/g, '');
  if (trimmed === '') return true;
  if (/\b(?:means|bezeichnet)\b/i.test(trimmed)) return true;
  const words = (s: string): string[] => s.toLowerCase().match(/[\p{L}]+/gu) ?? [];
  const termWords = new Set(words(term));
  const betweenWords = words(trimmed);
  return betweenWords.length > 0 && betweenWords.every((w) => termWords.has(w));
}

/**
 * Zerlegt einen Verweis-Satz in die vier Schablonen-Slots. Rein, deterministisch,
 * ohne Seiteneffekte. Fehlt ein Slot → undefined.
 */
export function parseBorrowTemplate(sentence: string, targetLawIdents: string[]): BorrowSlots {
  const slots: BorrowSlots = {};
  if (!sentence) return slots;

  // ── Operator ─────────────────────────────────────────────────────────
  let operatorIndex = -1;
  for (const op of UNCONDITIONAL_OPERATORS) {
    const m = op.re.exec(sentence);
    if (m) {
      slots.operator = op.label;
      operatorIndex = m.index;
      break;
    }
  }
  if (!slots.operator && hasDefiniendumContext(sentence)) {
    for (const op of CONDITIONAL_OPERATORS) {
      const m = op.re.exec(sentence);
      if (m) {
        slots.operator = op.label;
        operatorIndex = m.index;
        break;
      }
    }
  }

  // ── Term (Definiendum) ──────────────────────────────────────────────
  // Der Term muss in DEFINIENDUM-POSITION stehen: ein Anführungszeichen-
  // Ausdruck unmittelbar VOR dem Operator, wobei zwischen Ausdruck und
  // Operator nur ein Definiendum-Link steht (nichts, ein Definiens-Verb
  // „means/bezeichnet", oder die Wiederholung des Begriffs selbst). Sonst
  // erfüllte JEDER Anführungszeichen-Ausdruck im Satz den Slot — und
  // „The ‚Commission' shall act as defined in Article 6 …" würde fälschlich
  // als Begriffs-Anleihe (term=„Commission") durchgehen, obwohl „Commission"
  // gar nicht der geliehene Begriff ist. Steht kein Ausdruck in
  // Operator-Nähe → term bleibt leer → P0 scheitert → none-usage.
  if (operatorIndex >= 0) {
    const quotes = quotedTerms(sentence);
    // Nächstgelegener Ausdruck vor dem Operator zuerst.
    for (const q of quotes.filter((x) => x.end <= operatorIndex).reverse()) {
      if (operatorIndex - q.end > DEFINIENDUM_WINDOW) break; // zu weit weg → kein Definiendum
      if (isDefiniendumLink(sentence.slice(q.end, operatorIndex), q.text)) {
        slots.term = q.text;
        break;
      }
    }
  }

  // ── Ziel-Gesetz + Artikel ───────────────────────────────────────────
  // targetLawHit: der erste im Satz gematchte Ziel-Identifikator.
  for (const ident of targetLawIdents) {
    const m = identRegex(ident).exec(sentence);
    if (m) {
      slots.targetLawHit = ident;
      break;
    }
  }
  // targetArticle: die Artikelnummer, der binnen kurzer Distanz ein
  // Ziel-Identifikator folgt („Artikel 4 Nummer 1 der Verordnung (EU)
  // 2016/679"). Nur dann ist die Nummer dem ZITIERTEN Gesetz zugeordnet.
  // „Artikel[ns]?" fängt die dt. Flexion („Artikels 4", „Artikeln 4") mit ein.
  const artRe = /\b(?:Artikel[ns]?|Article|Art\.)\s*(\d+[a-z]?)/gi;
  let a: RegExpExecArray | null;
  while ((a = artRe.exec(sentence)) !== null) {
    const window = sentence.slice(a.index + a[0].length, a.index + a[0].length + 100);
    const hit = targetLawIdents.find((ident) => identRegex(ident).test(window));
    if (hit) {
      slots.targetArticle = normalizeArticleNumber(a[1]);
      if (!slots.targetLawHit) slots.targetLawHit = hit;
      break;
    }
  }

  return slots;
}

/**
 * Richtungs-Konverter — die EINZIGE Stelle, an der die Richtung entsteht.
 * Sie zeigt vom Definierer (= Ziel-Seite, die zitierte Norm) weg; die
 * zitierende Seite ist der Nutzer. Nichts wird hier geurteilt.
 */
export function deriveDirection(citingSide: 'a' | 'b'): Direction {
  // Zitiert a, ist das Ziel b → Pfeil zeigt von b weg → 'b-to-a'.
  return citingSide === 'a' ? 'b-to-a' : 'a-to-b';
}

/**
 * Prüft einen INTERPRETS-Kandidaten mechanisch: Schablone parsen, Prüfbaum
 * P0→P1→P2 laufen, Verdikt + (bei INTERPRETS/policy-A) berechnete Richtung
 * ableiten. Reihenfolge streng — ein Knoten wird nur erreicht, wenn der
 * vorige bestand.
 */
export function auditInterpretsCandidate(input: InterpretsAuditInput): InterpretsAudit {
  const slots = parseBorrowTemplate(input.citingSentence, input.targetLawIdents);
  const reasons: string[] = [];

  // ── P0: Leih-Operator + Definiendum ─────────────────────────────────
  const p0 = Boolean(slots.operator && slots.term);
  if (!p0) {
    const missing = !slots.operator && !slots.term ? 'weder Leih-Operator noch Definiendum' : !slots.operator ? 'kein Leih-Operator' : 'kein Definiendum (geborgter Begriff)';
    reasons.push(`P0 negativ: ${missing} im markierten Satz — keine Begriffs-Anleihe, sondern eine Nutzungs-Referenz.`);
    return { slots, p0: false, p1: false, p2: false, p2Source: null, verdict: 'none-usage', reasons };
  }
  reasons.push(`P0 positiv: Leih-Operator „${slots.operator}" auf das Definiendum „${slots.term}".`);

  // ── P1: Verweis zielt auf den Paar-Artikel ──────────────────────────
  const p1 = slots.targetArticle === input.pairTargetArticle && Boolean(slots.targetLawHit);
  if (!p1) {
    reasons.push(
      `P1 negativ: Der Satz zitiert nicht Artikel ${input.pairTargetArticle} des Ziel-Gesetzes` +
        `${slots.targetLawHit ? ` (gefunden: Artikel ${slots.targetArticle ?? '—'} zu ${slots.targetLawHit})` : ' (kein Ziel-Gesetz im Satz)'}` +
        ` — das Paar ist ein Mining-Artefakt, kein Label.`,
    );
    return { slots, p0: true, p1: false, p2: false, p2Source: null, verdict: 'pair-artifact', reasons };
  }
  reasons.push(`P1 positiv: Verweis auf Artikel ${slots.targetArticle} des Ziel-Gesetzes (${slots.targetLawHit}).`);

  // ── P2: Ziel ist ein Definitions-Ort ────────────────────────────────
  // P2-Reihenfolge (erste zutreffende gewinnt):
  //   1. targetProvisionKind === 'definition'  → typed
  //   2. isDefinitionTitle(targetTitle)        → title   (dritte Quelle, THE-529 Härtung)
  //   3. targetFullText && definiendumInText    → fallback
  // Die Überschrift-Quelle fängt die deutschen Sammel-Definitionen (DSGVO/
  // Data-Act „personenbezogene Daten", KI-VO „harmonisierte Norm"), deren
  // Ziel-Text den Begriff NACH dem Verb prägt und die der fullText-Fallback
  // deshalb nicht fasst — bislang hingen sie in Prod allein am Typing.
  let p2: boolean | 'fallback' = false;
  let p2Source: P2Source = null;
  if (input.targetProvisionKind === 'definition') {
    p2 = true;
    p2Source = 'typed';
    reasons.push('P2 positiv: Ziel-Provision ist als Definition typisiert.');
  } else if (!input.targetProvisionKind && isDefinitionTitle(input.targetTitle)) {
    // Überschrift-P2 NUR als Sicherheitsnetz für UNTYPISIERTE Provisionen: ein
    // getyptes `provisionKind` (auch ≠ 'definition') hat Vorrang, sonst würde ein
    // Sach-Artikel mit definitions-artigem Titel (z. B. MDR Art. 3 „Änderung
    // bestimmter Begriffsbestimmungen", typisiert 'procedural') fälschlich P2 ✓.
    // Das entspricht der alten Server-Reihenfolge (Typing schlägt Überschrift).
    p2 = true;
    p2Source = 'title';
    reasons.push(`P2 positiv: Ziel-Provision trägt eine Definitions-Überschrift („${input.targetTitle}").`);
  } else if (input.targetFullText && slots.term && definiendumInText(slots.term, input.targetFullText)) {
    p2 = 'fallback';
    p2Source = 'fallback';
    reasons.push(`P2 (fallback): kein provisionKind/keine Definitions-Überschrift, aber der Ziel-Text prägt „${slots.term}" als definierten Ausdruck.`);
  } else {
    reasons.push('P2 negativ: Ziel-Provision ist kein Definitions-Ort (geprägter Begriff über einen Sach-Artikel).');
  }

  const direction = deriveDirection(input.citingSide);

  if (p2 === true || p2 === 'fallback') {
    reasons.push(`Verdikt interprets — Richtung berechnet: ${direction} (vom Definierer weg).`);
    return { slots, p0: true, p1: true, p2, p2Source, verdict: 'interprets', direction, reasons };
  }

  // P0 ✓ ∧ P1 ✓ ∧ P2 ✗ → policy-A: Klasse bleibt offen bis Architekten-Regel A.
  // Richtung dennoch berechnen und mitgeben (falls Regel A „interprets" sagt).
  reasons.push(`Verdikt policy-A (offen bis Architekten-Regel A) — Richtung berechnet: ${direction}.`);
  return { slots, p0: true, p1: true, p2: false, p2Source: null, verdict: 'policy-A', direction, reasons };
}

// ── Satz-Auswahl (THE-529, Task 1 — gehoben aus build-interprets-audit.ts) ──

/**
 * Verdikt-Rangfolge für die Auswahl des BESTEN Borrow-Satzes (höher gewinnt).
 * Exportiert, damit Server-Eval und Crawler-Batch dieselbe Rangfolge nutzen —
 * auch für die Wahl zwischen den beiden Richtungen eines Paars.
 */
export const INTERPRETS_VERDICT_RANK: Record<InterpretsVerdict, number> = {
  interprets: 3,
  'policy-A': 2,
  'none-usage': 1,
  'pair-artifact': 0,
};

export interface SelectBorrowSentenceInput {
  /** Welche Paar-Seite zitiert — Grundlage der berechneten Richtung. */
  citingSide: 'a' | 'b';
  /** Volltext der ZITIERENDEN Provision (wird hier satz-segmentiert). */
  fullText: string;
  /** Normalisierter Paar-Ziel-Artikel, den der Verweis-Satz nennen muss. */
  pairTargetArticle: string;
  /** Literale Ziel-Gesetz-Identifikatoren (identsForSource). */
  targetLawIdents: string[];
  /** P2-Quelle: Typisierung der Ziel-Provision (falls vorhanden). */
  targetProvisionKind?: string;
  /** P2-Quelle „Überschrift": Titel der Ziel-Provision (dritte P2-Quelle). */
  targetTitle?: string;
  /** P2-Fallback: Volltext der Ziel-Provision. */
  targetFullText?: string;
}

/** Der gewählte Borrow-Satz samt vollständigem Audit-Ergebnis. */
export interface BorrowSentenceHit {
  sentence: string;
  slots: BorrowSlots;
  verdict: InterpretsVerdict;
  direction?: Direction;
  p0: boolean;
  p1: boolean;
  p2: boolean | 'fallback';
  /** Quelle des P2-Belegs (typed > title > fallback) — für den Prüfpfad-Label. */
  p2Source: P2Source;
  reasons: string[];
}

/**
 * Wählt aus dem Volltext der zitierenden Provision den besten Borrow-Satz:
 * satz-segmentieren, je Satz die Schablone parsen, nur Sätze behalten, die den
 * Paar-Ziel-Artikel des Ziel-Gesetzes wirklich nennen, jeden Kandidaten durch
 * `auditInterpretsCandidate` laufen lassen und den Treffer mit dem höchsten
 * Verdikt zurückgeben. Rein und deterministisch — Server-Eval
 * (build-interprets-audit.ts) und Crawler-Batch nutzen exakt dieselbe Auswahl.
 * `undefined`, wenn kein Satz den Paar-Artikel nennt (→ pair-artifact beim
 * Aufrufer). Gehoben aus build-interprets-audit.ts (THE-529, Task 1),
 * Verhalten byte-identisch zum Server-Original.
 */
export function selectBorrowSentence(input: SelectBorrowSentenceInput): BorrowSentenceHit | undefined {
  let best: BorrowSentenceHit | undefined;
  for (const sentence of splitSentences(input.fullText)) {
    const probe = parseBorrowTemplate(sentence, input.targetLawIdents);
    // Nur Sätze, die den Ziel-Paar-Artikel des Ziel-Gesetzes wirklich nennen.
    if (probe.targetArticle !== input.pairTargetArticle || !probe.targetLawHit) continue;

    const audit = auditInterpretsCandidate({
      citingSide: input.citingSide,
      citingSentence: sentence,
      pairTargetArticle: input.pairTargetArticle,
      targetLawIdents: input.targetLawIdents,
      targetProvisionKind: input.targetProvisionKind,
      targetTitle: input.targetTitle,
      targetFullText: input.targetFullText,
    });
    const hit: BorrowSentenceHit = {
      sentence,
      slots: audit.slots,
      verdict: audit.verdict,
      direction: audit.direction,
      p0: audit.p0,
      p1: audit.p1,
      p2: audit.p2,
      p2Source: audit.p2Source,
      reasons: audit.reasons,
    };
    if (!best || INTERPRETS_VERDICT_RANK[hit.verdict] > INTERPRETS_VERDICT_RANK[best.verdict]) {
      best = hit;
    }
  }
  return best;
}

/**
 * Fallback-Beleg für P2: Prägt der Ziel-Text den Term als definierten Ausdruck?
 * Der Term (ggf. in Anführungszeichen) unmittelbar gefolgt von
 * „means"/„bezeichnet"/„ist".
 */
function definiendumInText(term: string, text: string): boolean {
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // Term, optional in Anführungszeichen, dann (in kurzer Reichweite) ein Definiens-Verb.
  const re = new RegExp(`[${QUOTE_CHARS}]?${escaped}[${QUOTE_CHARS}]?\\s+(?:means|bezeichnet|ist)\\b`, 'i');
  return re.test(text);
}
