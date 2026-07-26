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

import { normalizeArticleNumber } from './lawPatterns';

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

/** Definiens-Verb: was einem Definiendum folgt, wenn ein Begriff GEPRÄGT wird. */
const DEFINIENS_VERB = /\b(?:means|bezeichnet|ist)\b/i;

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

export interface InterpretsAudit {
  slots: BorrowSlots;
  /** P0 — Leih-Operator + Definiendum vorhanden. */
  p0: boolean;
  /** P1 — Verweis zielt auf den Paar-Artikel des Ziel-Gesetzes. */
  p1: boolean;
  /** P2 — Ziel ist ein Definitions-Ort (true) oder per Fallback belegt. */
  p2: boolean | 'fallback';
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
  // Bevorzugt der Ausdruck VOR dem Operator (Anleihe-Muster
  // „TERM im Sinne von …"); fehlt einer, der erste Ausdruck des Satzes
  // (Definitions-Kopf-Muster „im Sinne … bezeichnet TERM"). Ohne Ausdruck
  // in Anführungszeichen bleibt der Slot leer.
  const quotes = quotedTerms(sentence);
  if (quotes.length > 0) {
    if (operatorIndex >= 0) {
      const before = quotes.filter((q) => q.end <= operatorIndex);
      slots.term = (before.length > 0 ? before[before.length - 1] : quotes[0]).text;
    } else {
      slots.term = quotes[0].text;
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
    return { slots, p0: false, p1: false, p2: false, verdict: 'none-usage', reasons };
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
    return { slots, p0: true, p1: false, p2: false, verdict: 'pair-artifact', reasons };
  }
  reasons.push(`P1 positiv: Verweis auf Artikel ${slots.targetArticle} des Ziel-Gesetzes (${slots.targetLawHit}).`);

  // ── P2: Ziel ist ein Definitions-Ort ────────────────────────────────
  let p2: boolean | 'fallback' = false;
  if (input.targetProvisionKind === 'definition') {
    p2 = true;
    reasons.push('P2 positiv: Ziel-Provision ist als Definition typisiert.');
  } else if (input.targetFullText && slots.term && definiendumInText(slots.term, input.targetFullText)) {
    p2 = 'fallback';
    reasons.push(`P2 (fallback): kein provisionKind, aber der Ziel-Text prägt „${slots.term}" als definierten Ausdruck.`);
  } else {
    reasons.push('P2 negativ: Ziel-Provision ist kein Definitions-Ort (geprägter Begriff über einen Sach-Artikel).');
  }

  const direction = deriveDirection(input.citingSide);

  if (p2 === true || p2 === 'fallback') {
    reasons.push(`Verdikt interprets — Richtung berechnet: ${direction} (vom Definierer weg).`);
    return { slots, p0: true, p1: true, p2, verdict: 'interprets', direction, reasons };
  }

  // P0 ✓ ∧ P1 ✓ ∧ P2 ✗ → policy-A: Klasse bleibt offen bis Architekten-Regel A.
  // Richtung dennoch berechnen und mitgeben (falls Regel A „interprets" sagt).
  reasons.push(`Verdikt policy-A (offen bis Architekten-Regel A) — Richtung berechnet: ${direction}.`);
  return { slots, p0: true, p1: true, p2: false, verdict: 'policy-A', direction, reasons };
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
