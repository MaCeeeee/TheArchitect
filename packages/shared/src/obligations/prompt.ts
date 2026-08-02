/**
 * Prompt-Bauer für die Pflicht-Zerlegung, die Klassifikation und den
 * Paar-Richter (THE-438 Slice 1).
 *
 * WARUM HIER UND NICHT IM SKRIPT: Eval und Produktionspfad müssen byteidentische
 * Prompts benutzen, sonst misst der Eval etwas anderes als die Produktion.
 * Vorbild: `packages/shared/src/typing/prompt.ts`.
 *
 * ── DIE BLENDUNG IST DIE ZENTRALE GARANTIE DIESES MODULS ──
 *
 * Trägt ein Prompt Gesetzesnamen, urteilt das Modell über das Etikett statt
 * über den Text. Gemessen (THE-538, 2026-08-01): wortgleicher Pflichttext unter
 * zwei Gesetzes-Etiketten ergab beim Paar-Richter 7/15 „verschiedene Sache",
 * begründet mit „unterschiedliche Rechtsgüter" — geblendet 15/15. Drei
 * vorherige Messungen waren mit diesem Defekt erhoben worden und ergaben
 * scheinbar saubere 0-Treffer-Befunde.
 *
 * Sie ist deshalb STRUKTURELL gelöst: alle drei Prompts rendern die Pflicht
 * über `renderObligation`, und nur darüber. Es gibt keinen Pfad, auf dem man
 * die Blendung vergessen kann, und `law`/`para` des Datensatzes werden nie
 * gerendert — sie existieren für die Auswertung, nicht für das Modell.
 *
 * Auch die Zerlegung wird geblendet, nicht nur der Richter: an den 219
 * zerlegten Pflichten trugen 3 Handlungs-Formulierungen, 4 Bedingungen und 1
 * Adressat einen Gesetzesnamen — ausnahmslos DSGVO. Das ist eine GERICHTETE
 * Verunreinigung (sie macht DSGVO-Pflichten DSGVO-spezifischer und senkt ihre
 * Chance, auf eine NIS2-/DORA-Formulierung zu passen). Mit 1,4 % hat sie das
 * Ergebnis nicht getragen; sie ist nur umsonst zu beseitigen.
 *
 * Linear: THE-438 · Prämisse: THE-538
 */
import { NORM_ONTOLOGY, isCanonicalAction } from '../ontology';
import { ObligationSlotsSchema, SLOT_UNSTATED, type ObligationSlots } from './slots';

/** Antwortwert des Klassifikators, wenn keine Katalog-Handlung passt. */
export const NO_ACTION = 'keine';

/**
 * Eine Pflicht, wie die Prompt-Bauer sie brauchen. `law` und `para` dienen
 * ausschließlich der Auswertung — gerendert werden sie NIE (siehe Kopf).
 */
export interface ObligationRef {
  law: string;
  para: string;
  title: string;
  text: string;
}

/**
 * Namen und Fundstellen, die die Herkunft verraten. Bewusst großzügig: ein zu
 * viel geblendeter Begriff kostet nichts, ein durchgerutschter verfälscht die
 * Messung. Reihenfolge in der Alternation ist bedeutungstragend — `NIS[-\s]?2`
 * muss vor `NIS` stehen, sonst bliebe die „2" stehen.
 */
const LAW_NAME_PATTERN =
  /\b(DSGVO|GDPR|NIS[-\s]?2|NIS|DORA|AI[-\s]?Act|KI[-\s]?VO|CRA|ePrivacy|eIDAS|MDR|LkSG|CSRD|ESRS|UNECE|Data[-\s]Act)\b/gi;

/**
 * `Art. 33`, `Artikel 45`, `§ 4`, `§§ 30` — inklusive Absatz-Zusatz.
 *
 * Die Wortgrenze steht INNERHALB der `Art`-Alternative, nicht vor der Gruppe:
 * `§` ist kein Wortzeichen, ein vorangestelltes `\b` verlangte also ein
 * Wortzeichen unmittelbar davor und griffe am Satzanfang nie („§ 4 LkSG …"
 * bliebe stehen).
 *
 * Der Buchstaben-Zusatz (`Art. 6a`, `§ 4b`) muss UNMITTELBAR an der Ziffer
 * hängen. Stand dort `\s*[a-z]?`, verschluckte das Muster den ersten Buchstaben
 * des Folgeworts: „Art. 33 binnen 72 Stunden" wurde zu „der Bestimmunginnen
 * 72 Stunden". Auf dem eingefrorenen Prüfsatz traf das 40 von 480 Textfeldern
 * (8,3 %) — der Richter las diese Stellen verstümmelt. Gefunden 2026-08-01
 * beim Bau des Arbeitsblatts (THE-382).
 */
const CITATION_PATTERN = /(?:\bArt(?:ikel)?\b\.?|§{1,2})\s*\d+[a-z]?\b(?:\s*(?:Abs\.?|Absatz)\s*\d+)?/gi;

/**
 * Entfernt Gesetzesnamen und Fundstellen aus einem Textstück. Ersetzt durch
 * neutrale Platzhalter statt durch Leerstring, damit der Satzbau lesbar bleibt
 * und das Modell erkennt, DASS dort ein Verweis stand.
 */
export function blindLawNames(s: string): string {
  return s.replace(LAW_NAME_PATTERN, 'dem Rechtsakt').replace(CITATION_PATTERN, 'der Bestimmung');
}

/**
 * Der EINZIGE Weg, eine Pflicht in einen Prompt zu rendern. Immer geblendet.
 * Alle Prompt-Bauer gehen hier durch — das macht die Garantie strukturell
 * statt zu einer Regel, an die sich jede Aufrufstelle erinnern müsste.
 */
function renderObligation(o: ObligationRef): string {
  return `Titel: ${blindLawNames(o.title)}\n\n${blindLawNames(o.text)}`;
}

// ─── 1. Zerlegung ────────────────────────────────────────────────────────
export const SLOT_SYSTEM = `Du zerlegst eine regulatorische Pflicht in vier Bestandteile.

- handlung:   WAS getan werden muss — die Maßnahme, gesetzesneutral formuliert.
- empfaenger: AN WEN / GEGENÜBER WEM zu leisten ist — Behörde, betroffene Person,
              Kunde, Vertragspartner. NICHT wer verpflichtet ist.
              Nicht genannt: "${SLOT_UNSTATED}".
- modalitaet: "pflicht", "verbot" oder "erlaubnis".
- bedingung:  WANN/UNTER WELCHEN UMSTÄNDEN — Frist, Schwelle, Auslöser. Nicht genannt: "${SLOT_UNSTATED}".

Formuliere die Handlung mit deinen eigenen Worten. Es gibt KEINE Vorgabeliste.

Antworte NUR mit JSON: {"handlung":"...","empfaenger":"...","modalitaet":"...","bedingung":"..."}`;

export function buildSlotUserPrompt(o: ObligationRef): string {
  return renderObligation(o);
}

// ─── 1b. Vokabular-Ableitung ─────────────────────────────────────────────
/**
 * Leitet aus den FREIEN Handlungs-Formulierungen ein kanonisches Vokabular ab.
 *
 * Steht hier und nicht im Skript, weil REQ-REQHARM-001.0 eine WIEDERHOLBARE
 * Ableitung verlangt: ein Prompt, der im Skript lebt, driftet gegenüber dem
 * Katalog, den er einmal erzeugt hat.
 *
 * Bewusst OHNE Vorgabeliste und ohne Zielzahl. Gibt man eine Anzahl vor,
 * produziert das Modell sie — und man misst die Vorgabe statt den Korpus. Der
 * ausdrückliche Hinweis, dass „lässt sich nicht bündeln" eine zulässige
 * Antwort ist, ist die Gegenprobe: ohne ihn erzeugt jedes Modell ein
 * plausibles Vokabular, auch wenn keines existiert.
 */
export const DERIVE_SYSTEM = `Du leitest aus einer Liste regulatorischer Handlungs-Phrasen ein KANONISCHES HANDLUNGS-VOKABULAR ab.

Regeln:
- Jeder Eintrag ist eine gesetzesneutrale Maßnahme, die ein Unternehmen UMSETZEN kann
  ("Vorfall an Aufsicht melden", "Daten verschlüsseln", "Wirksamkeit prüfen").
- Granularität: so grob, dass verschiedene Gesetze denselben Eintrag treffen können —
  so fein, dass er umsetzbar bleibt.
- Leite AUS DEN DATEN ab. Erfinde keine Einträge, die die Liste nicht hergibt.
  Erzwinge keine runde Zahl.
- Wenn die Phrasen sich NICHT sinnvoll bündeln lassen, sag das (wenige, sehr breite
  Einträge sind ein ehrliches Signal).

Antworte NUR mit JSON: {"vokabular":[{"id":"kebab-case-id","label":"<englisch>","description":"<ein Satz, deutsch>"}],"anmerkung":"<was dir bei der Ableitung aufgefallen ist>"}`;

/** Nummerierte Liste der freien Formulierungen — geblendet wie alles andere. */
export function buildDeriveUserPrompt(phrases: string[]): string {
  return phrases.map((p, i) => `${i + 1}. ${blindLawNames(p)}`).join('\n');
}

// ─── 2. Klassifikation ───────────────────────────────────────────────────
const CATALOGUE = NORM_ONTOLOGY.canonicalActions
  .map((a) => `${a.id}: ${a.label} — ${a.description}`)
  .join('\n');

export const CLASSIFY_SYSTEM = `Ordne die Pflicht GENAU EINER kanonischen Handlung zu.

KATALOG:
${CATALOGUE}

Regeln:
- Wähle den Eintrag, der die MASSNAHME trifft — nicht das Thema.
- Passt kein Eintrag wirklich: "${NO_ACTION}". Das ist ausdrücklich erlaubt und
  wichtig. Erzwinge nichts; ein falsch erzwungener Treffer ist schlimmer als
  eine offene Zuordnung.
- Bei mehreren plausiblen Einträgen: den spezifischeren.

Antworte NUR mit JSON: {"id":"<katalog-id oder ${NO_ACTION}>"}`;

export function buildClassifyUserPrompt(o: ObligationRef): string {
  return renderObligation(o);
}

// ─── 2b. Empfänger-Vokabular ─────────────────────────────────────────────
/**
 * Leitet aus den freien `empfaenger`-Formulierungen ein Vokabular ab —
 * dieselbe Methode wie beim Handlungs-Katalog: erst frei extrahieren, dann
 * bündeln, KEINE Vorgabeliste.
 *
 * Warum das gebraucht wird: „Aufsichtsbehörde", „die zuständige Behörde", „das
 * CSIRT", „EBA, ESMA oder EIOPA" sind Freitext. Auf Freitext lässt sich nicht
 * paaren — und die Empfängerklasse ist eine der vier Achsen, auf denen zwei
 * Pflichten überhaupt vergleichbar sind (THE-382, Prüfsatz-Reparatur).
 */
export const RECIPIENT_DERIVE_SYSTEM = `Du leitest aus einer Liste von EMPFÄNGERN regulatorischer Pflichten ein Vokabular ab.

Der Empfänger ist, an WEN eine Pflicht adressiert ist — wer die Meldung, die Auskunft, die
Unterlage bekommt. NICHT wer verpflichtet ist.

Regeln:
- Bündle Formulierungen, die DENSELBEN Empfänger meinen ("Aufsichtsbehörde", "die zuständige
  Behörde" gehören zusammen).
- Trenne, was rechtlich verschieden ist: eine Behörde ist nicht dasselbe wie die betroffene
  Person, und eine Fachaufsicht nicht dasselbe wie eine Datenschutzaufsicht.
- Wenn eine Pflicht keinen externen Empfänger hat (rein interne Maßnahme), ist das eine
  eigene Klasse.
- Gib KEINE Anzahl vor und erfinde keine Klassen, die in der Liste nicht vorkommen.
- Lässt sich eine Formulierung NICHT sinnvoll bündeln, sag das ausdrücklich.

Antworte NUR mit JSON:
{"classes":[{"id":"<kebab-case>","label":"<kurz>","description":"<ein Satz>"}],"unbundled":["<Formulierung>"]}`;

/**
 * Ordnet einen einzelnen Empfänger einer der abgeleiteten Klassen zu.
 * `keine` ist eine erstklassige Antwort — ein erzwungener Treffer verfälscht
 * die Achse und paart Pflichten, die nichts miteinander zu tun haben.
 */
export function buildRecipientClassifySystem(
  classes: { id: string; label: string; description: string }[],
): string {
  const list = classes.map((c) => `- ${c.id}: ${c.label} — ${c.description}`).join('\n');
  return `Ordne den Empfänger GENAU EINER Klasse zu.

${list}
- ${NO_ACTION}: keine der Klassen passt

Antworte NUR mit JSON: {"id":"<klassen-id oder ${NO_ACTION}>"}`;
}

/** Der Empfänger, geblendet wie alles andere. */
export function buildRecipientClassifyUserPrompt(recipient: string): string {
  return `Empfänger: ${blindLawNames(recipient)}`;
}

// ─── 3. Paar-Richter, binäre Vorgängerfassung ────────────────────────────
/**
 * BINÄRE VORGÄNGERFASSUNG. Am 2026-08-01 als unterspezifiziert gemessen und
 * durch `PAIR_RELATION_SYSTEM` ersetzt; bleibt exportiert, weil der
 * eingefrorene Vergleichslauf reproduzierbar bleiben muss.
 *
 * Nicht für neue Läufe verwenden: auf denselben 120 Fällen erzwang die
 * Ja/Nein-Frage bei jedem Mittelfeld-Paar einen Münzwurf (κ Haiku ↔ Kimi 0,308
 * gegen 0,681 bei vier Typen), und 70 % der Meinungsverschiedenheiten waren
 * Fälle, in denen beide Häuser „teilweise" meinten.
 */
export const PAIR_JUDGE_SYSTEM = `Du bist Compliance-Jurist und berätst ein Unternehmen bei der UMSETZUNG.

Zwei Pflichten aus verschiedenen Rechtsakten. Entscheide EINE Frage:
Lässt sich das mit EINER gemeinsam betriebenen Maßnahme abdecken — auch wenn
Adressat, Frist oder Schwelle je Rechtsakt unterschiedlich parametriert werden müssen?

Denk an die Umsetzung, nicht an den Rechtstext:
- JA, wenn EIN Prozess/System beide bedient und die Unterschiede reine Parameter sind
  (z.B. eine Meldekette, die je nach Norm an andere Behörde und in anderer Frist auslöst).
- NEIN, wenn zwei getrennte Maßnahmen nötig sind, weil Inhalt, Schutzgut oder
  auszuführende Tätigkeit verschieden sind — nicht nur der Empfänger oder die Frist.
Im Zweifel NEIN.

Antworte NUR mit JSON: {"same": true|false, "delta": "<abweichende Parameter, oder '${SLOT_UNSTATED}'>", "why": "<ein knapper Satz>"}`;

export function buildPairJudgeUserPrompt(a: ObligationRef, b: ObligationRef): string {
  return `A) Rechtsakt X, Bestimmung 1\n${renderObligation(a)}\n\nB) Rechtsakt Y, Bestimmung 2\n${renderObligation(b)}`;
}

// ─── 4. Paar-Richter, typisiert nach NIST IR 8477 ─────────────────────────
/**
 * Die vier Beziehungstypen. Reihenfolge und Schreibweise sind an NIST IR 8477
 * (Set Theory Relationship Mapping) angelehnt, damit unsere Urteile später auf
 * einen extern gepflegten Katalog abbildbar bleiben (das SCF mappt nach
 * derselben Methodik) — siehe `toIr8477`.
 */
export const PAIR_RELATIONS = ['equal', 'subset', 'intersects', 'unrelated'] as const;
export type PairRelation = (typeof PAIR_RELATIONS)[number];

/** Welche der beiden Pflichten die WEITERE ist. Nur bei `subset` belegt. */
export type WiderSide = 'A' | 'B';

export interface PairRelationVerdict {
  relation: PairRelation;
  /** Nur bei `subset`: die weitere Pflicht. Sonst `undefined`. */
  wider?: WiderSide;
  why: string;
}

/**
 * Die typisierte Rubrik. Der Text der vier Definitionen ist WÖRTLICH der des
 * Experiments vom 2026-08-01 (`docs/evals/typed-relation-experiment.md`) — und
 * die `equal`-Definition ist wörtlich das binäre „JA" der Vorgängerfassung.
 *
 * Genau darauf beruht der Befund: dieselbe Definition, nur mit
 * Ausweichmöglichkeit, ließ die Ja-Quote von 35 % auf 0 % fallen. Wer diese
 * Formulierung ändert, macht den Vergleich zur Messung hinfällig.
 *
 * Neu gegenüber dem Experiment ist allein die RICHTUNG: `subset` ohne Angabe,
 * welche Pflicht die weitere ist, trägt die halbe Aussage nicht und lässt sich
 * nicht auf IR 8477 abbilden, das subset-of und superset-of unterscheidet.
 */
export const PAIR_RELATION_SYSTEM = `Du bist Compliance-Jurist und berätst ein Unternehmen bei der UMSETZUNG.

Zwei Pflichten aus verschiedenen Rechtsakten. Beurteile das Verhältnis der MASSNAHMEN,
die zu ihrer Erfüllung nötig sind — nicht die Ähnlichkeit der Texte.

Wähle GENAU EINEN Beziehungstyp:

- "equal"       Eine gemeinsam betriebene Maßnahme erfüllt BEIDE vollständig.
                Unterschiede beschränken sich auf Parameter (Adressat, Frist, Schwelle).
- "subset"      Die eine Pflicht ist vollständig in der anderen enthalten: wer die
                weitere erfüllt, erfüllt die engere automatisch mit.
- "intersects"  Es gibt einen gemeinsamen Kern, aber JEDE Pflicht verlangt zusätzlich
                etwas, das die andere nicht verlangt. Eine Maßnahme deckt beide nur
                teilweise ab.
- "unrelated"   Getrennte Maßnahmen. Kein gemeinsamer Kern.

Bei "subset" gib zusätzlich mit "wider" an, welche der beiden die WEITERE ist ("A" oder "B").

Antworte NUR mit JSON: {"relation":"equal|subset|intersects|unrelated","wider":"A|B (nur bei subset)","why":"<ein knapper Satz>"}`;

/** Dieselbe geblendete Darstellung wie beim binären Richter. */
export const buildPairRelationUserPrompt = buildPairJudgeUserPrompt;

/**
 * Faltet die typisierte Beziehung auf eine binäre Sicht — NUR dort benutzen, wo
 * eine Ja/Nein-Ansicht unvermeidlich ist, und die Faltung dann ausweisen.
 *
 * `intersects` fällt bewusst auf `false`: „gemeinsamer Kern plus eigene Zusätze"
 * ist NICHT „eine Maßnahme erfüllt beide". Diese Zusammenlegung war der
 * ursprüngliche Fehler, der die veröffentlichten 35 % erzeugt hat.
 */
export function foldRelation(r: PairRelation): boolean {
  return r === 'equal' || r === 'subset';
}

/** Das Vokabular von NIST IR 8477, aus Sicht von A. */
export type Ir8477Relation = 'equal' | 'subset-of' | 'superset-of' | 'intersects-with' | 'not-related-to';

/**
 * Übersetzt ein Urteil in die Sprache des externen Katalogs. Der einzige Grund,
 * warum `wider` erhoben wird: ohne die Richtung ist `subset` hier nicht
 * abbildbar, und damit wäre ein Abgleich gegen ein extern gepflegtes Mapping
 * (SCF, ENISA) nicht möglich.
 */
export function toIr8477(v: PairRelationVerdict): Ir8477Relation {
  switch (v.relation) {
    case 'equal':
      return 'equal';
    case 'subset':
      return v.wider === 'A' ? 'superset-of' : 'subset-of';
    case 'intersects':
      return 'intersects-with';
    case 'unrelated':
      return 'not-related-to';
  }
}

// ─── Parser ──────────────────────────────────────────────────────────────
/**
 * Erstes JSON-Objekt aus einer Rater-Antwort. `null` statt Wurf: eine kaputte
 * Antwort ist ein Datenpunkt über den Lauf, kein Programmfehler.
 */
function firstJsonObject(raw: string): unknown | null {
  const m = raw.replace(/^```json\s*|\s*```$/g, '').match(/\{[\s\S]*\}/);
  if (!m) return null;
  try {
    return JSON.parse(m[0]);
  } catch {
    return null;
  }
}

export function parseSlots(raw: string): ObligationSlots | null {
  const obj = firstJsonObject(raw);
  if (!obj) return null;
  const r = ObligationSlotsSchema.safeParse(obj);
  return r.success ? r.data : null;
}

/**
 * `{ actionId: null }` bedeutet „keine passende Handlung" — ein GÜLTIGES
 * Ergebnis. `null` als Rückgabe heißt dagegen „unlesbar". Der Aufrufer muss
 * beides trennen, sonst verfälscht ein kaputter Lauf die „keine"-Quote, und
 * genau die zeigt an, ob der Katalog Lücken hat oder Treffer erzwungen werden.
 */
export function parseActionAssignment(raw: string): { actionId: string | null } | null {
  const obj = firstJsonObject(raw) as { id?: unknown } | null;
  if (!obj || typeof obj.id !== 'string') return null;
  if (obj.id === NO_ACTION) return { actionId: null };
  return isCanonicalAction(obj.id) ? { actionId: obj.id } : null;
}

export interface RecipientClass {
  id: string;
  label: string;
  description: string;
}

/** `null` = unlesbar. Eine leere Klassenliste ist KEIN gültiges Vokabular. */
export function parseRecipientClasses(raw: string): { classes: RecipientClass[]; unbundled: string[] } | null {
  const o = firstJsonObject(raw) as { classes?: unknown; unbundled?: unknown } | null;
  if (!o || !Array.isArray(o.classes) || o.classes.length === 0) return null;
  const classes: RecipientClass[] = [];
  for (const c of o.classes as Record<string, unknown>[]) {
    if (typeof c?.id !== 'string' || typeof c?.label !== 'string') return null;
    classes.push({ id: c.id, label: c.label, description: String(c.description ?? '') });
  }
  return { classes, unbundled: Array.isArray(o.unbundled) ? (o.unbundled as string[]).map(String) : [] };
}

/**
 * `{ classId: null }` heißt „keine Klasse passt" — ein GÜLTIGES Ergebnis.
 * `null` heißt „unlesbar". Dieselbe Trennung wie bei `parseActionAssignment`:
 * ein erzwungener Treffer würde Pflichten paaren, die nichts verbindet.
 */
export function parseRecipientAssignment(
  raw: string,
  validIds: readonly string[],
): { classId: string | null } | null {
  const o = firstJsonObject(raw) as { id?: unknown } | null;
  if (!o || typeof o.id !== 'string') return null;
  if (o.id === NO_ACTION) return { classId: null };
  return validIds.includes(o.id) ? { classId: o.id } : null;
}

export interface PairVerdict {
  same: boolean;
  delta: string;
  why: string;
}

/**
 * Ein fehlendes `same` ist UNLESBAR, nicht „nein". Würde es zu `false`
 * degradieren, verwandelte ein kaputter Lauf sich in einen sauberen
 * Negativ-Befund — der Fehler, der am 2026-08-01 drei Messungen wertlos machte.
 */
export function parsePairVerdict(raw: string): PairVerdict | null {
  const o = firstJsonObject(raw) as Partial<PairVerdict> | null;
  if (!o || typeof o.same !== 'boolean') return null;
  return { same: o.same, delta: String(o.delta ?? SLOT_UNSTATED), why: String(o.why ?? '') };
}

/**
 * Ein fehlender oder erfundener Typ ist UNLESBAR, nicht „unrelated" — dieselbe
 * Regel wie beim fehlenden `same`: sonst verwandelt ein kaputter Lauf sich in
 * einen sauberen Negativ-Befund.
 *
 * Ein `subset` OHNE lesbare Richtung wird ebenso verworfen. Es sähe wie ein
 * Urteil aus, trüge aber die halbe Aussage nicht — und stillschweigend eine
 * Richtung anzunehmen hieße, sie zu erfinden.
 */
export function parsePairRelation(raw: string): PairRelationVerdict | null {
  const o = firstJsonObject(raw) as { relation?: unknown; wider?: unknown; why?: unknown } | null;
  if (!o || typeof o.relation !== 'string') return null;

  const relation = PAIR_RELATIONS.find((r) => r === o.relation);
  if (!relation) return null;

  const why = String(o.why ?? '');
  if (relation !== 'subset') return { relation, why };

  const wider = o.wider === 'A' || o.wider === 'B' ? o.wider : null;
  return wider ? { relation, wider, why } : null;
}
