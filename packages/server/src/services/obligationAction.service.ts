/**
 * obligationAction.service — ordnet eine Pflicht einer kanonischen Handlung zu
 * (THE-438 Slice 1, REQ-REQHARM-001.2).
 *
 * READ-ONLY: dieser Dienst schreibt NICHTS. Er ersetzt die Ähnlichkeitssuche
 * aus dem ursprünglichen Bauplan — gemessen (THE-538): lexikalische und
 * semantische Ähnlichkeit vergleichen FORMULIERUNGEN, gefragt ist aber, ob EINE
 * Maßnahme beide Pflichten erfüllt. Über die kanonische Handlung trennt es
 * sauber (35 % gemeinsam erfüllbar gegen 0/60 in der Negativ-Kontrolle).
 *
 * `ask` ist INJIZIERT — zwei Gründe: der Dienst ist ohne Live-LLM testbar, und
 * der Eval fährt denselben Codepfad wie die Produktion. In der Produktion kommt
 * der Aufrufer aus `evals/raterClient` (der löst Reasoning-Budget und
 * Leer-Antwort-Retry bereits; nicht neu bauen).
 *
 * WARUM `unparseable` GETRENNT VON `actionId: null`: „keine passende Handlung"
 * ist ein Befund über den KATALOG (er hat eine Lücke), eine unlesbare Antwort
 * ein Befund über den LAUF (Budget, Modell, Prompt). Zusammengeworfen
 * verfälschen sie die „keine"-Quote — und genau die zeigt an, ob der Katalog
 * Lücken hat oder das Modell Treffer erzwingt. Eine auffällig NIEDRIGE
 * „keine"-Quote auf fremdem Korpus ist ein Warnzeichen, kein Erfolg: in der
 * Referenzmessung lag sie bei 0,5 %, und das war der Anlass zu kontrollieren.
 *
 * Linear: THE-438 · Prämisse: THE-538
 */
import {
  NORM_ONTOLOGY,
  CLASSIFY_SYSTEM,
  buildClassifyUserPrompt,
  parseActionAssignment,
  type ObligationRef,
} from '@thearchitect/shared';

/** Minimale Rater-Schnittstelle: System- und User-Prompt rein, Rohtext raus. */
export type AskFn = (system: string, user: string) => Promise<string>;

export interface ActionAssignment {
  /** Katalog-id, oder `null` bei „keine passende Handlung" UND bei unlesbar. */
  actionId: string | null;
  /** Trennt den Lauf-Fehler von der bewussten Nicht-Zuordnung. */
  unparseable: boolean;
  /** Katalog-Stand, gegen den zugeordnet wurde. Ohne ihn ist die Zuordnung später nicht deutbar. */
  ontologyVersion: string;
}

export async function classifyObligation(o: ObligationRef, ask: AskFn): Promise<ActionAssignment> {
  const raw = await ask(CLASSIFY_SYSTEM, buildClassifyUserPrompt(o));
  const parsed = parseActionAssignment(raw);
  return {
    actionId: parsed?.actionId ?? null,
    unparseable: parsed === null,
    ontologyVersion: NORM_ONTOLOGY.ontologyVersion,
  };
}

export interface BatchStats {
  total: number;
  /** Pflichten mit Katalog-Zuordnung. */
  assigned: number;
  /** Bewusst nicht zugeordnet — Aussage über den Katalog. */
  none: number;
  /** Unlesbare Antworten — Aussage über den Lauf, nicht über den Katalog. */
  unparseable: number;
}

/**
 * Sequenziell, nicht parallel: der Aufrufer ist ein Batch-Skript, und die
 * Reihenfolge der Ergebnisse muss der Eingabe entsprechen, damit sich
 * Zuordnungen den Pflichten wieder zuordnen lassen.
 */
export async function classifyObligations(
  obligations: ObligationRef[],
  ask: AskFn,
): Promise<{ assignments: ActionAssignment[]; stats: BatchStats }> {
  const assignments: ActionAssignment[] = [];
  for (const o of obligations) assignments.push(await classifyObligation(o, ask));

  return {
    assignments,
    stats: {
      total: assignments.length,
      assigned: assignments.filter((a) => a.actionId !== null).length,
      none: assignments.filter((a) => a.actionId === null && !a.unparseable).length,
      unparseable: assignments.filter((a) => a.unparseable).length,
    },
  };
}
