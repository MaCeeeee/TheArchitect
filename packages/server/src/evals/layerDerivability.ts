/**
 * layerDerivability — Messmechanik für THE-551: Ist die Ziel-Architekturebene
 * aus der kanonischen Handlung ableitbar?
 *
 * ── WAS HIER LIEGT UND WAS NICHT ──
 *
 * Hier liegt die MECHANIK (Antwortraum, Parser, Treffer, Guards) und die
 * KODIER-TABELLE von Kodierer A — als Experiment-Artefakt, NICHT als
 * Ontologie-Erweiterung. Ob die Tabelle in `NORM_ONTOLOGY` einzieht,
 * entscheidet das Ticket nach der Messung, nicht dieser Commit.
 *
 * Rubrik (vorab fixiert, gegen die Kappa-Fallen aus
 * docs/evals/typed-relation-experiment.md):
 *   Die primäre Ebene ist die, auf der das UMSETZENDE Element lebt — nicht
 *   die, aus der die Pflicht stammt. „Meldepflicht" stammt aus dem Recht,
 *   umgesetzt wird sie von einem Meldeprozess (business) und einem
 *   Meldeportal (application).
 *
 * Antwortraum: die TOGAF-Domains, auf denen Elemente leben können. `motivation`
 * und `implementation` sind ausgeschlossen — dort leben Ableitungs- und
 * Migrations-Artefakte, keine umsetzenden Elemente.
 *
 * Linear: THE-551 · Formgleiche Warnung: THE-547 (Capability-Achse fiel).
 */

export const TOGAF_LAYER_ANSWER_SPACE = ['strategy', 'business', 'data', 'application', 'technology'] as const;
export type TogafLayer = (typeof TOGAF_LAYER_ANSWER_SPACE)[number];

export interface LayerCoding {
  primary: TogafLayer;
  secondary?: TogafLayer;
}

export interface CoderARow extends LayerCoding {
  actionId: string;
  rationale: string;
}

/**
 * Kodierer A (Mensch-adjudizierbar, im Review sichtbar). Jede Zeile nennt ihr
 * umsetzendes Element — das ist die Begründung, nicht Dekoration.
 */
export const CODER_A_TABLE: CoderARow[] = [
  { actionId: 'rechtsgrundlage-dokumentieren', primary: 'business', secondary: 'application', rationale: 'Prüf- und Dokumentationsprozess; das Register, das ihn trägt, ist eine Applikation.' },
  { actionId: 'zweck-festlegen', primary: 'business', secondary: 'data', rationale: 'Governance-Festlegung; die Zweckbindung klebt an Datenkategorien.' },
  { actionId: 'aufbewahrung-loeschfristen', primary: 'data', secondary: 'application', rationale: 'Fristen sind Eigenschaften der Datenkategorien; durchgesetzt werden sie in Systemen.' },
  { actionId: 'datenminimierung', primary: 'data', secondary: 'application', rationale: 'Der Datenbestand selbst wird beschränkt; Voreinstellungen leben in den Apps.' },
  { actionId: 'betroffene-informieren', primary: 'business', secondary: 'application', rationale: 'Informationsprozess (Datenschutzerklärung); ausgeliefert über Portale.' },
  { actionId: 'betroffenenrechte-bearbeiten', primary: 'business', secondary: 'application', rationale: 'Antragsbearbeitung ist ein Prozess; Self-Service/Workflow ist die App-Seite.' },
  { actionId: 'einwilligung-verwalten', primary: 'application', secondary: 'business', rationale: 'Consent-Management ist ein System; das Einholen bleibt ein Prozess.' },
  { actionId: 'loeschung-durchfuehren', primary: 'application', secondary: 'data', rationale: 'Löschfunktionen der Systeme wirken auf Bestände samt Kopien und Backups.' },
  { actionId: 'technisch-organisatorische-massnahmen', primary: 'technology', secondary: 'business', rationale: 'Der Name sagt es: technisch UND organisatorisch — Infrastruktur plus Anweisungswesen.' },
  { actionId: 'verschluesselung-pseudonymisierung', primary: 'technology', secondary: 'data', rationale: 'Kryptografie ist Infrastruktur; geschützt werden Datenbestände.' },
  { actionId: 'zugriffskontrolle', primary: 'technology', secondary: 'application', rationale: 'IAM und physische Kontrollen sind Technologie; App-Berechtigungen die zweite Front.' },
  { actionId: 'risikobewertung', primary: 'business', rationale: 'Risikomanagement ist ein Prozess/eine Funktion, egal worauf sich das Risiko bezieht.' },
  { actionId: 'folgenabschaetzung', primary: 'business', rationale: 'Die DSFA ist ein Bewertungsprozess mit dokumentiertem Ergebnis.' },
  { actionId: 'wirksamkeit-pruefen', primary: 'business', secondary: 'technology', rationale: 'Review-/Audit-Prozess; technische Prüfungen (Tests, Scans) sind die zweite Hälfte.' },
  { actionId: 'verzeichnis-fuehren', primary: 'business', secondary: 'application', rationale: 'Das VVT ist ein gepflegtes Register: Pflegeprozess plus tragende Applikation.' },
  { actionId: 'auftragsverarbeiter-steuern', primary: 'business', rationale: 'Auswahl, Vertrag und Steuerung sind Beschaffungs-/Governance-Prozesse.' },
  { actionId: 'compliance-nachweisen', primary: 'business', rationale: 'Nachweisführung und Zertifizierung sind organisatorische Prozesse.' },
  { actionId: 'vorfall-erkennen-behandeln', primary: 'technology', secondary: 'business', rationale: 'Detektion lebt in der Technik (Monitoring/SIEM); die Behandlung ist ein Prozess.' },
  { actionId: 'vorfall-melden-behoerde', primary: 'business', secondary: 'application', rationale: 'Meldeprozess mit Fristen; das Meldeportal/Workflow-System ist die App-Seite. (Beispiel aus dem Ticket.)' },
  { actionId: 'vorfall-benachrichtigen-betroffene', primary: 'business', secondary: 'application', rationale: 'Benachrichtigungsprozess; Massen-Kommunikation läuft über Systeme.' },
  { actionId: 'drittlandtransfer-absichern', primary: 'business', secondary: 'data', rationale: 'SCC/TIA sind Vertrags- und Prüfprozesse; abgesichert werden Datenflüsse.' },
  { actionId: 'resilienz-governance', primary: 'business', secondary: 'technology', rationale: 'Governance ist organisatorisch; ihr Gegenstand ist die IKT.' },
  { actionId: 'betriebskontinuitaet', primary: 'business', secondary: 'technology', rationale: 'BCM ist ein Prozess; Recovery-Fähigkeit lebt in der Infrastruktur.' },
  { actionId: 'revision-ueberwachung', primary: 'business', rationale: 'Unabhängige Revision ist eine organisatorische Funktion.' },
  { actionId: 'cyberhygiene-schulung', primary: 'business', rationale: 'Schulungsprogramme sind organisatorische Maßnahmen.' },
  { actionId: 'lieferkette-bewerten', primary: 'business', rationale: 'Lieferantenbewertung ist ein Beschaffungs-/Risikoprozess.' },
];

/** System-Prompt für Kodierer B — bekommt die Rubrik, NICHT die A-Tabelle. */
export const LAYER_CODER_SYSTEM = `Du kodierst regulatorische HANDLUNGEN auf die Architekturebene, auf der das UMSETZENDE Element lebt — nicht die Ebene, aus der die Pflicht stammt.

Ebenen (genau diese Werte): strategy | business | data | application | technology
- business: Prozesse, organisatorische Funktionen, Rollen, Anweisungswesen
- data: Datenbestände, Datenkategorien und ihre Eigenschaften
- application: Anwendungssysteme und ihre Funktionen
- technology: Infrastruktur, Plattformen, physische und logische Technik
- strategy: Fähigkeiten und strategische Ressourcen (selten die richtige Antwort für eine konkrete Handlung)

Antworte NUR mit JSON: {"primary": "<ebene>", "secondary": "<ebene>"} — secondary nur, wenn die Handlung eine zweite Ebene WESENTLICH trifft; sonst weglassen. Keine Begründung.`;

export function buildLayerCoderPrompt(a: { id: string; label: string; description: string }): string {
  return `HANDLUNG: ${a.label}\nBESCHREIBUNG: ${a.description}`;
}

/**
 * Liest eine Kodierer-Antwort. `null` bei allem, was keine gültige Kodierung
 * ist — unlesbar ist ein Befund über den LAUF und darf nicht als stille
 * Zufalls-Kodierung in das Kappa einfließen (Muster obligationAction.service).
 */
export function parseLayerCoding(raw: string): LayerCoding | null {
  const m = raw.match(/\{[\s\S]*?\}/);
  if (!m) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(m[0]);
  } catch {
    return null;
  }
  if (typeof parsed !== 'object' || parsed === null) return null;
  const p = (parsed as Record<string, unknown>).primary;
  const s = (parsed as Record<string, unknown>).secondary;
  if (typeof p !== 'string' || !(TOGAF_LAYER_ANSWER_SPACE as readonly string[]).includes(p)) return null;
  if (s !== undefined) {
    if (typeof s !== 'string' || !(TOGAF_LAYER_ANSWER_SPACE as readonly string[]).includes(s)) return null;
    if (s !== p) return { primary: p as TogafLayer, secondary: s as TogafLayer };
  }
  return { primary: p as TogafLayer };
}

/** Die abgeleitete Ebenen-Menge einer Handlung: {primär, sekundär?}. */
export function derivedLayerSet(c: LayerCoding): Set<TogafLayer> {
  return new Set(c.secondary ? [c.primary, c.secondary] : [c.primary]);
}

/**
 * Vokabular-Brücke: die req-self-Goldens sprechen ArchiMate („information" für
 * `data_object`-Elemente), der Antwortraum TOGAF („data"). OHNE die Brücke
 * fielen alle Daten-Elemente am Wort statt an der Ableitung (gemessen:
 * 0/24 im ersten Lauf). Nur diese eine, belegte Äquivalenz — kein weiteres
 * Weichzeichnen.
 */
export function normalizeGoldLayer(layer: string): string {
  return layer === 'information' ? 'data' : layer;
}

/** Treffer ⇔ die (normalisierte) Ebene des Gold-Elements liegt in der Menge. */
export function layerHit(goldLayer: string, set: Set<TogafLayer>): boolean {
  return (set as Set<string>).has(normalizeGoldLayer(goldLayer));
}

/**
 * Trivialitäts-Guard 1: Anteil der häufigsten primären Ebene. Eine Tabelle,
 * die (fast) alles auf eine Ebene wirft, ist trivial richtig und wertlos —
 * das steht so in der Negativ-Kontrolle des Tickets.
 */
export function primaryConcentration(codings: LayerCoding[]): number {
  if (codings.length === 0) return 0;
  const counts = new Map<string, number>();
  for (const c of codings) counts.set(c.primary, (counts.get(c.primary) ?? 0) + 1);
  return Math.max(...counts.values()) / codings.length;
}

/** Trivialitäts-Guard 2: mittlere Mengengröße — wer viel erlaubt, trifft trivial. */
export function meanSetSize(codings: LayerCoding[]): number {
  if (codings.length === 0) return 0;
  return codings.reduce((s, c) => s + derivedLayerSet(c).size, 0) / codings.length;
}
