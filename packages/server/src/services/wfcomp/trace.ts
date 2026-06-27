/**
 * runTraceCheck (.4 / REQ-WFCOMP-001.4, THE-355) — die „letzte Meile".
 *
 * Reine Funktion über den gelifteten In-Memory-Graphen (DB-frei testbar; die
 * Cypher-Ausführung gegen Neo4j ist REQ-WFCOMP-001.8 / THE-360, gleiche Semantik).
 *
 * Status je Feld:
 *   - present            : Trace-Pfad existiert (ODER bedingtes Feld nicht einschlägig)
 *   - missing            : deterministisch entscheidbar (d/e) UND Pfad fehlt → rot
 *   - needs_attestation  : nicht lift-produzierbar (a/b/c/f/g) → Mensch/LLM, NIE auto-grün/rot
 */
import type { LiftedGraph, LiftedElement, GapReport, FieldResult, FieldStatus } from './types';
import type { TraceTarget, TraceStep } from '@thearchitect/shared';
import type { Art30FieldSpec } from '../../data/art30.seed-data';

// Felder, die der deterministische Lift entscheiden kann. Alle anderen → Attestierung.
const DETERMINISTIC_LITERAE = new Set(['d', 'e']);

function matchType(el: LiftedElement, type: string): boolean {
  return type === '*' || el.type === type;
}
function matchAttrs(el: LiftedElement, where?: Record<string, unknown>): boolean {
  if (!where) return true;
  return Object.entries(where).every(([k, v]) => el.attrs[k] === v);
}

/** Von den aktuellen Knoten einen Schritt folgen → nächste Knotenmenge. */
function followStep(graph: LiftedGraph, fromIds: Set<string>, step: TraceStep): Set<string> {
  const byId = new Map(graph.elements.map((e) => [e.id, e]));
  const next = new Set<string>();
  for (const edge of graph.edges) {
    if (edge.rel !== step.rel || !fromIds.has(edge.from)) continue;
    const target = byId.get(edge.to);
    if (target && matchType(target, step.to) && matchAttrs(target, step.where)) {
      next.add(edge.to);
    }
  }
  return next;
}

/** Existiert ein vollständiger Trace-Pfad im Graphen? */
function pathExists(graph: LiftedGraph, target: TraceTarget): boolean {
  let current = new Set(
    graph.elements
      .filter((e) => matchType(e, target.from) && matchAttrs(e, target.where))
      .map((e) => e.id),
  );
  if (current.size === 0) return false;
  for (const step of target.steps) {
    current = followStep(graph, current, step);
    if (current.size === 0) return false;
  }
  return true;
}

/** Ist ein bedingtes Feld (Guard) überhaupt einschlägig? (lit. e nur bei Drittland-Transfer) */
function guardTriggered(graph: LiftedGraph, target: TraceTarget): boolean {
  if (!target.guard) return true;
  return graph.elements.some((e) => e.attrs[target.guard!.flag] === target.guard!.equals);
}

export function runTraceCheck(graph: LiftedGraph, fields: Art30FieldSpec[]): GapReport {
  const results: FieldResult[] = fields.map((f) => {
    let status: FieldStatus;
    if (!guardTriggered(graph, f.traceTarget)) {
      status = 'present'; // bedingtes Feld nicht einschlägig → erfüllt
    } else if (pathExists(graph, f.traceTarget)) {
      status = 'present';
    } else if (DETERMINISTIC_LITERAE.has(f.litera)) {
      status = 'missing';
    } else {
      status = 'needs_attestation';
    }
    return { litera: f.litera, criticality: f.criticality, status };
  });
  return { gdprScope: true, fields: results };
}
