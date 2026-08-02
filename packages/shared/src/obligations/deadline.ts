/**
 * deadline — das Fristobjekt ⟨Dauer, Bezugspunkt, Stufe⟩ (THE-549).
 *
 * ── DER BEFUND, DEN ES RECHNET ──
 *
 * Primärquellenprüfung 2026-08-01: NIS2 zählt seine Melde-Fristen ab
 * KENNTNIS, DORA ab der jeweils VORANGEGANGENEN MELDUNG. „72 Stunden ab
 * Kenntnis" und „72 Stunden ab Erstmeldung" unterscheiden sich als String um
 * zwei Wörter — und bezeichnen zwei verschiedene Uhren. Ein System, das eine
 * Frist für beide berechnet, rechnet für eine falsch. Der `bezugspunkt` ist
 * die Achse, die im Slot-Modell bisher vollständig fehlte.
 *
 * ── MECHANISCH, KEIN MODELL ──
 *
 * Die Ableitung ist ein Lexikon-Parser: mechanisch Entscheidbares gehört
 * nicht ins LLM. Was das Lexikon nicht erkennt, wird `null` — NIE ein
 * Default. Eine Frist, deren Uhr niemand kennt, kann man nicht rechnen;
 * sie doch zu tragen hieße still falsch zu rechnen.
 *
 * ── KEIN ERSATZ, EINE ERGÄNZUNG ──
 *
 * `ObligationSlots.bedingung` bleibt unverändert Freitext (Messeingabe der
 * Vokabular-Ableitung, Begründung in `slots.ts`). Dieses Modul ist die
 * fehlende zweite Hälfte: ein ABGELEITETES Objekt, das seine Herkunft
 * (`quelle`) trägt — ohne sie wäre die Ableitung nicht nachprüfbar, dieselbe
 * Lücke, die in THE-545 eine Offline-Auswertung unmöglich machte.
 *
 * ── EINE BEWUSSTE ABWEICHUNG VOM TICKET-SCHEMA ──
 *
 * `stufe` ist nullable. Eine geratene Stufe wäre so unehrlich wie ein
 * geratener Bezugspunkt — aber anders als er ist sie nicht rechnungswirksam:
 * die bindende Frist hängt nur an Dauer und Bezugspunkt. Eine ungestufte
 * Meldepflicht gilt als `erst` (das ist keine Vermutung, sondern die
 * Semantik: die einzige Meldung IST die erste).
 *
 * Linear: THE-549 · Beleg: docs/strategy/2026-08-01-the538-dora-meldepflicht.md
 */

export interface DeadlineDuration {
  wert: number;
  einheit: 'h' | 'd' | 'mon';
}

export type DeadlineReference = 'kenntnis' | 'einstufung' | 'vorherige-meldung' | 'ereignis';
export type DeadlineStage = 'erst' | 'zwischen' | 'abschluss';

export interface Deadline {
  dauer: DeadlineDuration;
  bezugspunkt: DeadlineReference;
  stufe: DeadlineStage | null;
  /** Der Freitext, aus dem abgeleitet wurde — Pflicht, sonst unnachprüfbar. */
  quelle: string;
}

// ── Dauer ────────────────────────────────────────────────────────────────
// Erster Treffer im Text. Trägt eine Klausel eine Primärfrist plus eine
// Obergrenze („innerhalb von 4 Stunden nach Einstufung, spätestens jedoch
// 24 Stunden nach Kenntnisnahme"), nimmt der Parser die PRIMÄRE (erste);
// die Obergrenze wäre ein zweites Deadline-Objekt und bleibt hier bewusst
// draußen — ausgewiesen statt still vermischt.
const DURATION_PATTERNS: readonly [RegExp, (m: RegExpMatchArray) => DeadlineDuration][] = [
  [/(\d+)\s*Stunden?/i, (m) => ({ wert: Number(m[1]), einheit: 'h' })],
  [/(\d+)\s*Tage?n?\b/i, (m) => ({ wert: Number(m[1]), einheit: 'd' })],
  [/(?:(\d+)|einen|einem)\s*Monat(?:e|en|s)?\b/i, (m) => ({ wert: m[1] ? Number(m[1]) : 1, einheit: 'mon' })],
];

// ── Bezugspunkt ──────────────────────────────────────────────────────────
// Gesucht wird der FRÜHESTE Treffer NACH der Dauer — die Uhr steht im
// Gesetzestext hinter der Frist („72 Stunden, nachdem …").
const REFERENCE_PATTERNS: readonly [RegExp, DeadlineReference][] = [
  [/nachdem[^,.;]*bekannt\s*(?:wurde|geworden)/i, 'kenntnis'],
  [/nach\s+Kenntnisnahme|nach\s+Kenntnis\b|ab\s+Kenntnis/i, 'kenntnis'],
  [/(?:nach|ab)\s+(?:der\s+)?Einstufung/i, 'einstufung'],
  // Übermittlung einer früheren Meldung / eines früheren Berichts — DORAs Uhr.
  [/nach\s+(?:der\s+)?Übermittlung/i, 'vorherige-meldung'],
  [/nach\s+(?:der\s+)?(?:Erstmeldung|letzten\s+Aktualisierung)/i, 'vorherige-meldung'],
  [/nach\s+dem\s+(?:Vorfall|Ereignis|Zwischenfall)/i, 'ereignis'],
];

// ── Stufe ────────────────────────────────────────────────────────────────
// Reihenfolge ist bedeutungstragend: „Meldung mit einer Aktualisierung der
// Frühwarnung" ist eine Zwischenstufe, obwohl „Frühwarnung" im Satz steht.
const STAGE_PATTERNS: readonly [RegExp, DeadlineStage][] = [
  [/Abschlussbericht|abschließend/i, 'abschluss'],
  [/Zwischenbericht|Zwischenmeldung|Aktualisierung/i, 'zwischen'],
  [/Frühwarnung|Erstmeldung/i, 'erst'],
];

/**
 * Leitet das Fristobjekt aus einer Klausel ab. REIN, deterministisch.
 *
 * `null` wenn Dauer ODER Bezugspunkt fehlen — beides ist Pflicht. Eine Dauer
 * ohne Uhr („binnen 48 Stunden" ohne Angabe, wovon an gezählt wird) wird
 * NICHT mit einem Default versehen: das wäre genau die stille Falschrechnung,
 * gegen die dieses Modul gebaut ist (AC-3, N-2).
 */
export function deriveDeadline(text: string): Deadline | null {
  let duration: DeadlineDuration | null = null;
  let durationEnd = -1;
  for (const [re, build] of DURATION_PATTERNS) {
    const m = text.match(re);
    if (m && m.index !== undefined && (durationEnd === -1 || m.index < durationEnd)) {
      duration = build(m);
      durationEnd = m.index + m[0].length;
    }
  }
  if (!duration) return null;

  // Frühester Bezugspunkt-Treffer NACH der Dauer.
  const tail = text.slice(durationEnd);
  let reference: DeadlineReference | null = null;
  let referencePos = Number.POSITIVE_INFINITY;
  for (const [re, ref] of REFERENCE_PATTERNS) {
    const m = tail.match(re);
    if (m && m.index !== undefined && m.index < referencePos) {
      reference = ref;
      referencePos = m.index;
    }
  }
  if (!reference) return null;

  let stage: DeadlineStage | null = null;
  for (const [re, s] of STAGE_PATTERNS) {
    if (re.test(text)) {
      stage = s;
      break;
    }
  }
  // Ungestufte Meldepflicht = die einzige Meldung = die erste. Semantik,
  // keine Vermutung — und nicht rechnungswirksam (siehe Modulkopf).
  if (stage === null && /meldet|Meldung|benachrichtigt|übermittel/i.test(text)) {
    stage = 'erst';
  }

  return { dauer: duration, bezugspunkt: reference, stufe: stage, quelle: text };
}

/**
 * Vergleichs-Umrechnung in Stunden — NUR für die Ordnung, nie als
 * Rechenausgabe. Der Monat ist mit 30 Tagen angenähert; für „ist 1 Monat
 * länger als 72 Stunden?" reicht das, für Kalenderarithmetik nicht — die
 * findet hier bewusst nicht statt.
 */
export function deadlineToHours(d: DeadlineDuration): number {
  switch (d.einheit) {
    case 'h':
      return d.wert;
    case 'd':
      return d.wert * 24;
    case 'mon':
      return d.wert * 720;
  }
}

export interface BindingDeadline {
  bezugspunkt: DeadlineReference;
  /** Die kürzeste Frist DIESER Uhr. */
  binding: Deadline;
  /** Alle Fristen dieser Uhr — die bindende ist eine davon. */
  all: Deadline[];
}

/**
 * Die bindende Frist je Bezugspunkt (AC-4).
 *
 * ES GIBT ABSICHTLICH KEINE FUNKTION, die über Bezugspunkte hinweg ein
 * einzelnes Minimum bildet. „4 h ab Einstufung" und „72 h ab Kenntnis" stehen
 * auf verschiedenen Uhren; sie zu „4 h" zusammenzuziehen behauptete eine
 * Ordnung, die es nicht gibt (N-1). Wer beide Uhren bedienen muss, bekommt
 * beide Antworten.
 */
export function bindingDeadlines(deadlines: Deadline[]): BindingDeadline[] {
  const groups = new Map<DeadlineReference, Deadline[]>();
  for (const d of deadlines) {
    const list = groups.get(d.bezugspunkt) ?? [];
    list.push(d);
    groups.set(d.bezugspunkt, list);
  }
  return [...groups.entries()].map(([bezugspunkt, all]) => ({
    bezugspunkt,
    binding: all.reduce((min, d) => (deadlineToHours(d.dauer) < deadlineToHours(min.dauer) ? d : min)),
    all,
  }));
}
