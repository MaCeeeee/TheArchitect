/**
 * UC-EVAL-001 / THE-401 S3 — Eskalations-Router der Kaskade.
 *
 * Idee: Nicht jeder Generator-Vorschlag muss vom Judge geprüft werden. Ein
 * Vorschlag, der über N Läufe (mit permutierter Kandidaten-Reihenfolge) STABIL
 * auftaucht und hohe Confidence hat, ist verlässlich — ihn zu prüfen kostet nur
 * und riskiert TP-Damage (der Judge killt echtes Gold, siehe EVAL_BASELINE.md).
 * Nur die WACKELIGEN gehen an den Judge.
 *
 * Signale (LLM-frei, aus vorhandenen Generator-Läufen):
 *   - selfConsistency: Anteil der N Läufe, in denen das Element vorkam
 *     (Shuffle-Permutation je Lauf ⇒ deckt zugleich Positions-Bias ab)
 *   - confidence: mittlere Generator-Confidence über die Läufe, in denen es vorkam
 *
 * Routing (reine Funktion, Schwellen konfigurierbar):
 *   keep      — stabil & sicher: übernehmen, NICHT judgen (schützt TPs)
 *   escalate  — wackelig: an den Judge geben (dessen Präzision hier wertvoll)
 *   drop      — nur in einem einzigen Lauf & schwache Confidence: verwerfen
 *
 * Linear: THE-401 (REQ-EVAL-001.10) · Epic THE-378
 */

export interface EscalationSignals {
  elementId: string;
  /** Anteil [0..1] der Läufe, in denen das Element vorgeschlagen wurde. */
  selfConsistency: number;
  /** Ø Confidence über die Läufe mit Vorkommen (0 wenn nie). */
  confidence: number;
  /** In wie vielen der N Läufe vorgeschlagen. */
  occurrences: number;
  runs: number;
}

export type Route = 'keep' | 'escalate' | 'drop';

export interface EscalationThresholds {
  /** selfConsistency ≥ diesem Wert UND confidence ≥ keepConfidence ⇒ keep. */
  keepConsistency: number;
  keepConfidence: number;
  /** occurrences ≤ diesem Wert UND confidence < dropConfidence ⇒ drop. */
  dropMaxOccurrences: number;
  dropConfidence: number;
}

export const DEFAULT_THRESHOLDS: EscalationThresholds = {
  keepConsistency: 1.0, // in ALLEN Läufen (order-stabil)
  keepConfidence: 0.85,
  dropMaxOccurrences: 1, // nur in einem einzigen Lauf gesehen
  dropConfidence: 0.6,
};

/**
 * Self-Consistency-Signale aus N Generator-Läufen. `runs[i]` = die je Lauf
 * vorgeschlagenen (elementId, confidence)-Paare. Reine Funktion.
 */
export function computeSignals(
  runs: Array<Array<{ elementId: string; confidence: number }>>
): EscalationSignals[] {
  const n = runs.length;
  if (n === 0) return [];
  const occ = new Map<string, number>();
  const confSum = new Map<string, number>();
  for (const run of runs) {
    // pro Lauf ein Element nur einmal zählen (Dedup gegen Doppel-Vorschläge)
    const seen = new Set<string>();
    for (const p of run) {
      if (seen.has(p.elementId)) continue;
      seen.add(p.elementId);
      occ.set(p.elementId, (occ.get(p.elementId) ?? 0) + 1);
      confSum.set(p.elementId, (confSum.get(p.elementId) ?? 0) + p.confidence);
    }
  }
  const out: EscalationSignals[] = [];
  for (const [elementId, occurrences] of occ) {
    out.push({
      elementId,
      occurrences,
      runs: n,
      selfConsistency: occurrences / n,
      confidence: (confSum.get(elementId) ?? 0) / occurrences,
    });
  }
  // stabile Reihenfolge: konsistenteste zuerst, dann nach id
  out.sort((a, b) => b.selfConsistency - a.selfConsistency || a.elementId.localeCompare(b.elementId));
  return out;
}

/** Routing-Entscheidung für ein Signal. Reine Funktion. */
export function routeProposal(
  s: EscalationSignals,
  t: EscalationThresholds = DEFAULT_THRESHOLDS
): Route {
  if (s.selfConsistency >= t.keepConsistency && s.confidence >= t.keepConfidence) return 'keep';
  if (s.occurrences <= t.dropMaxOccurrences && s.confidence < t.dropConfidence) return 'drop';
  return 'escalate';
}

export interface RoutingResult {
  keep: string[]; // übernehmen ohne Judge
  escalate: string[]; // an den Judge
  drop: string[]; // verwerfen
  signals: EscalationSignals[];
}

export function routeAll(
  runs: Array<Array<{ elementId: string; confidence: number }>>,
  t: EscalationThresholds = DEFAULT_THRESHOLDS
): RoutingResult {
  const signals = computeSignals(runs);
  const keep: string[] = [];
  const escalate: string[] = [];
  const drop: string[] = [];
  for (const s of signals) {
    const r = routeProposal(s, t);
    (r === 'keep' ? keep : r === 'escalate' ? escalate : drop).push(s.elementId);
  }
  return { keep, escalate, drop, signals };
}
