/**
 * reqtrace-prompt — die zwei Transformationen der Anforderungskette
 * (THE-545, ADR-0007). Diese Datei trägt Stufe 1: Klausel →
 * Stakeholder-Anforderung.
 *
 * ── WARUM HIER UND NICHT IM SKRIPT ──
 *
 * Wie bei `prompt.ts`: Eval und Produktionspfad müssen byteidentische Prompts
 * benutzen, sonst misst der Eval etwas anderes als die Produktion.
 *
 * ── DER UNTERSCHIED ZU REQGEN ──
 *
 * `requirementGenerator.prompt.ts` verlangt wörtlich *„what concretely MUST be
 * done **HOW**"* und liefert im selben Aufruf die Zuordnung zu
 * Architektur-Elementen. Damit verschmelzen Stakeholder-Anforderung,
 * Systemanforderung und Architektur in einem Artefakt — und ISO/IEC/IEEE 15288
 * §6.4.3.1 verlangt das Gegenteil („should not imply any specific
 * implementation"). Diese Stufe extrahiert deshalb NUR, was die Klausel
 * fordert, ohne jeden Umsetzungsvorschlag.
 *
 * ── SINGULARITÄT IST EINE ZÄHLUNG, KEIN URTEIL ──
 *
 * Der Prompt liefert die Slots als LISTEN. Das Tor ist dann `length === 1` je
 * Liste — kein zweites Modell, das „ist das singulär?" beantwortet und dabei
 * dasselbe Kappa-Problem mitbringt wie alles andere, das wir in dieser Woche
 * gemessen haben. Das Modell extrahiert, die Entscheidung ist ein Vergleich
 * (ADR-0007 E7).
 *
 * Linear: THE-545 · Rahmen: ADR-0007 · Glossar: CONTEXT.md
 */
import { blindLawNames, NO_ACTION } from './prompt';
import { OBLIGATION_MODALITIES, SLOT_UNSTATED } from './slots';

/** Eine Klausel, wie der Zerleger sie liefert. `id` ist Anker, nie Prompt-Inhalt. */
export interface ClauseRef {
  id: string;
  path: string;
  text: string;
}

/**
 * Ein Anforderungs-Kandidat mit Slots als Listen.
 *
 * `kind` folgt der Modalität: ein Verbot schränkt den Lösungsraum ein und wird
 * zum **Constraint** (15288 §6.4.2.2 c), Pflicht und Erlaubnis fordern eine
 * Fähigkeit und werden zur **Anforderung**. Die ArchiMate-Projektion trennt
 * beides bereits (`requirementProjection.service.ts`) — hier entsteht die
 * Information, statt sie später zu erraten.
 */
export interface StakeholderCandidate {
  /** Die Anforderung in einem eigenständigen, gesetzesneutralen Satz. */
  text: string;
  handlungen: string[];
  empfaenger: string[];
  modalitaeten: string[];
  bedingungen: string[];
  kind: 'requirement' | 'constraint';
}

export const STAKEHOLDER_REQ_SYSTEM = `Du liest EINE Klausel eines Rechtsakts und extrahierst die Anforderungen, die sie an ein Unternehmen stellt.

Für jede Anforderung nennst du vier Bestandteile — jeweils als LISTE, weil eine Klausel mehrere tragen kann:

- "handlungen":   WAS getan werden muss — die Maßnahme, gesetzesneutral formuliert.
                  Zwei Tätigkeiten ("etablieren und dokumentieren") sind ZWEI Einträge.
- "empfaenger":   AN WEN / GEGENÜBER WEM zu leisten ist. Nicht genannt: "${SLOT_UNSTATED}".
- "modalitaeten": "pflicht", "verbot" oder "erlaubnis" — nichts anderes.
- "bedingungen":  WANN / UNTER WELCHEN UMSTÄNDEN: Frist, Schwelle, Auslöser.
                  Nicht genannt: "${SLOT_UNSTATED}".

Dazu "text": die Anforderung als EIN eigenständig lesbarer Satz.

Regeln:
- Beschreibe NUR, was gefordert ist — nicht WIE es umzusetzen wäre. Keine Technologien,
  keine Produkte, kein Umsetzungsvorschlag.
- Trägt die Klausel KEINE Anforderung an ein Unternehmen (Begriffsbestimmung, Verweis,
  Auftrag an eine Behörde, Erwägung), gib eine leere Liste zurück. Das ist ein
  ausdrücklich erwünschtes Ergebnis — erzwinge nichts. Ein erfundener Treffer ist
  schlimmer als "${NO_ACTION}".
- Erfinde nichts, was nicht im Text steht.

Antworte NUR mit JSON:
{"candidates":[{"text":"…","handlungen":["…"],"empfaenger":["…"],"modalitaeten":["…"],"bedingungen":["…"]}]}`;

/**
 * Der Klausel-Prompt. Rendert AUSSCHLIESSLICH geblendeten Pfad und Text.
 *
 * Die Klausel-Id (`dsgvo:art32:c01`) erscheint NIE: `CITATION_PATTERN` fängt
 * `art32` nicht (zwischen Buchstabe und Ziffer steht keine Wortgrenze), sie
 * würde die Herkunft also ungeblendet mittragen.
 */
export function buildStakeholderReqUserPrompt(clause: ClauseRef): string {
  return `Fundstelle: ${blindLawNames(clause.path)}\n\n${blindLawNames(clause.text)}`;
}

function asStringList(v: unknown): string[] | null {
  if (!Array.isArray(v)) return null;
  if (v.some((x) => typeof x !== 'string')) return null;
  return v as string[];
}

/**
 * Parst die Kandidaten einer Klausel.
 *
 * `[]` heißt „diese Klausel trägt keine Anforderung" — ein GÜLTIGER Befund.
 * `null` heißt „unlesbar". Wer beides zusammenwirft, verwandelt einen Ausfall
 * in einen sauberen Negativ-Befund; genau dieser Fehler machte am 2026-08-01
 * drei Messungen wertlos.
 *
 * Ist EIN Kandidat fehlerhaft, ist die ganze Antwort unlesbar. Den kaputten
 * still zu verwerfen wäre nicht unterscheidbar von „das Modell hat weniger
 * geliefert" — und ein unsichtbarer Verlust ist schlimmer als ein sichtbarer
 * Fehlschlag.
 */
export function parseStakeholderCandidates(raw: string): StakeholderCandidate[] | null {
  const m = raw.replace(/^```json\s*|\s*```$/g, '').match(/\{[\s\S]*\}/);
  if (!m) return null;

  let obj: { candidates?: unknown };
  try {
    obj = JSON.parse(m[0]);
  } catch {
    return null;
  }
  if (!Array.isArray(obj.candidates)) return null;

  const out: StakeholderCandidate[] = [];
  for (const c of obj.candidates as Record<string, unknown>[]) {
    const handlungen = asStringList(c?.handlungen);
    const empfaenger = asStringList(c?.empfaenger);
    const modalitaeten = asStringList(c?.modalitaeten);
    const bedingungen = asStringList(c?.bedingungen);
    if (!handlungen || !empfaenger || !modalitaeten || !bedingungen) return null;
    if (typeof c?.text !== 'string' || c.text.trim() === '') return null;
    if (modalitaeten.some((x) => !(OBLIGATION_MODALITIES as readonly string[]).includes(x))) return null;

    // Ein Verbot schraenkt den Loesungsraum ein statt eine Faehigkeit zu
    // fordern. Gemischte Listen bleiben `requirement` — sie sind ohnehin nicht
    // singulaer und werden aufgeteilt.
    const kind =
      modalitaeten.length > 0 && modalitaeten.every((x) => x === 'verbot') ? 'constraint' : 'requirement';

    out.push({ text: c.text, handlungen, empfaenger, modalitaeten, bedingungen, kind });
  }
  return out;
}

/**
 * Das Singularitätstor: genau ein Wert je Slot (ADR-0007 E7).
 *
 * Eine LEERE Liste besteht nicht. „Nicht genannt" hat einen eigenen Wert
 * (`SLOT_UNSTATED`) — eine leere Liste ist eine fehlende Angabe, kein
 * gemessenes Nichts.
 */
export function isSingular(c: StakeholderCandidate): boolean {
  return (
    c.handlungen.length === 1 &&
    c.empfaenger.length === 1 &&
    c.modalitaeten.length === 1 &&
    c.bedingungen.length === 1
  );
}

/**
 * Teilt einen Kandidaten entlang der HANDLUNG auf — und nur entlang dieser.
 *
 * Die Handlung ist die Identität einer Anforderung: „Konzepte etablieren **und**
 * dokumentieren" (NIS2 Art. 21, echter Wortlaut) sind zwei Anforderungen.
 *
 * Bewusst KEIN kartesisches Produkt: zwei Handlungen × zwei Bedingungen
 * ergäben vier Anforderungen, davon zwei, die so nie im Gesetz stehen. Was
 * nach dem Handlungs-Schnitt mehrdeutig bleibt, ist nach `isSingular` weiterhin
 * unsingulär — der Harness zählt und weist es aus, statt es zu multiplizieren.
 */
export function splitByAction(c: StakeholderCandidate): StakeholderCandidate[] {
  if (c.handlungen.length === 0) return [];
  if (c.handlungen.length === 1) return [c];
  return c.handlungen.map((h) => ({ ...c, handlungen: [h] }));
}
