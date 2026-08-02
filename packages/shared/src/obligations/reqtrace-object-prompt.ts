/**
 * reqtrace-object-prompt — der Gegenstand einer Anforderung (THE-547).
 *
 * ── WARUM ES DAS GIBT ──
 *
 * Am menschlichen Tor von THE-545 wurden 10 von 32 Maßnahmen abgelehnt, und
 * **alle zehn** paaren dieselbe kanonische Handlung mit einem ANDEREN
 * Gegenstand: „Vorfall melden" neben „Fristüberschreitung begründen",
 * „Geschäftsfortführung prüfen" neben „personenbezogene Daten wiederherstellen".
 *
 * Die Enterprise-Architektur benennt genau diese Struktur: eine Business
 * Capability heißt **Substantiv + Verb** (TOGAF G233 §6.1.1), das Substantiv ist
 * ein *business object* — „a single, persistent thing that is of interest to the
 * business". Unser Slot-Modell (`slots.ts`) führt Handlung, Empfänger,
 * Modalität und Bedingung, aber KEINEN Gegenstand; `empfaenger` ist, an *wen*
 * zu leisten ist, nicht, *woran* gehandelt wird. Der Harmonisierungs-Schlüssel
 * ist damit die halbe Capability.
 *
 * ── FREITEXT ZUERST, KATALOG DANACH ──
 *
 * Dieser Prompt fragt den Gegenstand als **Freitext**. Der kanonische Werteraum
 * entsteht anschließend bottom-up aus dem Material — so wie die 26 Handlungen
 * aus 216 Rohwerten entstanden sind. Einen Katalog vorab zu erfinden wäre
 * derselbe Fehler wie eine Taxonomie vor den Daten: man fände dann genau die
 * Kategorien wieder, die man hineingelegt hat.
 *
 * Linear: THE-547 · Rahmen: ADR-0007 E4
 */
import { blindLawNames } from './prompt';

/** Der Gegenstand ist nicht bestimmbar — ein gültiger Befund, keine Panne. */
export const OBJECT_UNSTATED = '__kein_gegenstand__';

export const OBJECT_SYSTEM = `Du liest EINE Anforderung an ein Unternehmen und nennst ihren GEGENSTAND.

Der Gegenstand ist das, WORAN gehandelt wird — die Sache, um die es geht.
NICHT, an wen geleistet wird, und NICHT, was getan wird.

Beispiele:
- "Das Unternehmen muss Sicherheitsvorfälle der Behörde melden."
  → Gegenstand: "Sicherheitsvorfall"        (nicht "Behörde", nicht "melden")
- "Das Unternehmen muss personenbezogene Daten nach einem Zwischenfall wiederherstellen."
  → Gegenstand: "personenbezogene Daten"
- "Das Unternehmen muss eine Begründung für die Verzögerung der Meldung dokumentieren."
  → Gegenstand: "Begründung der Meldeverzögerung"
- "Das Unternehmen muss die Wirksamkeit seiner Schutzmaßnahmen überprüfen."
  → Gegenstand: "Schutzmaßnahme"

Regeln:
- EIN Gegenstand, als kurze Substantiv-Phrase. Kein Satz, kein Verb.
- Gesetzesneutral formulieren. Keine Paragrafen, keine Rechtsaktnamen.
- Nenne den Gegenstand so, wie ein Fachbereich ihn nennen würde — die Sache selbst,
  nicht ihre juristische Umschreibung.
- Ist der Gegenstand nicht bestimmbar, antworte "${OBJECT_UNSTATED}". Ein erfundener
  Gegenstand ist schlimmer als keiner.

Antworte NUR mit JSON:
{"gegenstand":"…"}`;

/** Geblendet wie jeder andere Prompt dieses Moduls. */
export function buildObjectUserPrompt(text: string): string {
  return blindLawNames(text);
}

/**
 * Parst die Antwort.
 *
 * `null` heißt **unlesbar**, `OBJECT_UNSTATED` heißt **nicht bestimmbar**. Beides
 * zusammenzuwerfen verwandelt einen Ausfall in einen sauberen Negativ-Befund —
 * genau der Fehler, der am 2026-08-01 drei Messungen wertlos machte.
 */
export function parseObjectAssignment(raw: string): { gegenstand: string } | null {
  const m = raw.match(/\{[\s\S]*\}/);
  if (!m) return null;
  let o: unknown;
  try {
    o = JSON.parse(m[0]);
  } catch {
    return null;
  }
  if (typeof o !== 'object' || o === null) return null;
  const g = (o as { gegenstand?: unknown }).gegenstand;
  if (typeof g !== 'string' || g.trim().length === 0) return null;
  return { gegenstand: g.trim() };
}

/**
 * Ableitung des kanonischen Gegenstands-Vokabulars — bottom-up aus dem Material,
 * genau wie `DERIVE_SYSTEM` für die Handlungen (216 Rohwerte → 26 Einträge).
 *
 * ── BLIND GEGEN DAS ERGEBNIS ──
 *
 * Dieser Schritt sieht **ausschließlich die Liste der Rohwerte**. Er sieht nicht,
 * welche Paare der Mensch angenommen hat, nicht das SCF-Gold und nicht, welche
 * Bündelung eine Zahl retten würde. Sonst wäre der Katalog auf das Ergebnis
 * hin gebaut, und die anschließende Messung wäre wertlos.
 */
export const OBJECT_DERIVE_SYSTEM = `Du leitest aus einer Liste von GEGENSTÄNDEN regulatorischer Pflichten ein kanonisches Vokabular ab.

Der Gegenstand ist das, WORAN gehandelt wird — die Sache, um die es geht.

Regeln:
- Bündle Formulierungen, die DIESELBE Sache meinen ("Sicherheitsvorfall",
  "IKT-bezogener Vorfall", "Cybervorfall" gehören zusammen).
- Trenne, was fachlich verschieden ist: ein Vorfall ist nicht dasselbe wie die
  MELDUNG über ihn, und personenbezogene Daten sind nicht dasselbe wie ein
  IT-System, auf dem sie liegen.
- Granularität: so grob, dass verschiedene Gesetze denselben Eintrag treffen können —
  so fein, dass zwei Einträge nicht dieselbe Maßnahme meinen.
- Leite AUS DEN DATEN ab. Erfinde keine Einträge, die die Liste nicht hergibt.
  Erzwinge keine runde Zahl.
- Lassen sich die Werte NICHT sinnvoll bündeln, sag das. Wenige sehr breite Einträge
  sind ein ehrliches Signal.

Antworte NUR mit JSON: {"vokabular":[{"id":"kebab-case-id","label":"<deutsch>","description":"<ein Satz>"}],"anmerkung":"<was dir aufgefallen ist>"}`;

/** Nummerierte Liste der Rohwerte — geblendet wie alles andere. */
export function buildObjectDeriveUserPrompt(values: string[]): string {
  return values.map((v, i) => `${i + 1}. ${blindLawNames(v)}`).join('\n');
}

/** Ordnet EINEN Rohwert einem Katalog-Eintrag zu. */
export function buildObjectAssignSystem(
  catalog: { id: string; label: string; description: string }[],
): string {
  return `Ordne den GEGENSTAND genau EINEM Katalog-Eintrag zu.

KATALOG:
${catalog.map((c) => `${c.id}: ${c.label} — ${c.description}`).join('\n')}

Regeln:
- Wähle den Eintrag, der DIESELBE Sache meint — nicht den thematisch nächsten.
- Passt keiner, antworte "${OBJECT_UNSTATED}". Eine erzwungene Zuordnung verschmilzt
  zwei verschiedene Sachen zu einer Maßnahme; das ist der teurere Fehler.

Antworte NUR mit JSON: {"gegenstand":"<id>"}`;
}

/**
 * Der Capability-Schlüssel: Gegenstand + Handlung (TOGAF G233 §6.1.1).
 *
 * `null` bei fehlendem Teil — und das ist bedeutungstragend: wer den fehlenden
 * Gegenstand zu einem leeren String macht, gruppiert alle unbestimmbaren Fälle
 * zu EINER Riesen-Capability zusammen. Genau so entstand in Lauf 1 die
 * 159-Anforderungen-Maßnahme.
 *
 * Der Trenner ist bedeutungstragend wie in `collapseKey`: ohne ihn wäre
 * ⟨"ab","c"⟩ gleich ⟨"a","bc"⟩.
 */
export function capabilityKey(gegenstand: string | null, handlung: string | null): string | null {
  if (!gegenstand || !handlung) return null;
  if (gegenstand === OBJECT_UNSTATED) return null;
  const norm = (s: string): string => s.trim().toLowerCase().replace(/\s+/g, ' ');
  return `${norm(gegenstand)}␟${norm(handlung)}`;
}

/**
 * Teilen zwei Anforderungen dieselbe Capability?
 *
 * Ein unbestimmbarer Gegenstand macht die Antwort **nein**, nicht „vielleicht".
 * Das ist die konservative Richtung: sie kann eine echte Harmonisierung
 * verpassen, aber nie eine erfinden — und ein erfundener Treffer wiegt in einem
 * Compliance-Werkzeug schwerer als ein verpasster.
 */
export function sameCapability(
  a: { gegenstand: string | null; actionId: string | null },
  b: { gegenstand: string | null; actionId: string | null },
): boolean {
  const ka = capabilityKey(a.gegenstand, a.actionId);
  const kb = capabilityKey(b.gegenstand, b.actionId);
  return ka !== null && ka === kb;
}
