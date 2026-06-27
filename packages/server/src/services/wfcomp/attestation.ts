/**
 * attestation (.5-Mechanik / REQ-WFCOMP-001.5, THE-356) — Ask/Confirm + Recompute.
 *
 * Reine Funktionen über den gelifteten Graphen (Queue-UI + Neo4j-Persistenz = THE-356/THE-360).
 *   - annotateModes: needs_attestation-Feld → 'confirm' (mit Vorschlag) oder 'ask' (ohne).  [G8]
 *   - applyAttestation: bestätigte Antwort als Graph-Pfad materialisieren → Recompute flippt
 *     das Feld auf 'present'. Ein Mensch (nicht das LLM) macht grün.                          [G9]
 */
import { v4 as uuid } from 'uuid';
import type { LiftedGraph, LiftedElement, GapReport, FieldSuggestion } from './types';
import type { TraceTarget } from '@thearchitect/shared';
import { ART30_FIELDS } from '../../data/art30.seed-data';

// ─── G8: Ask vs. Confirm ───
export function annotateModes(report: GapReport, suggestions: FieldSuggestion[]): GapReport {
  const byLitera = new Map(suggestions.map((s) => [s.litera, s]));
  return {
    ...report,
    fields: report.fields.map((f) => {
      if (f.status !== 'needs_attestation') return f;
      const suggestion = byLitera.get(f.litera);
      return suggestion
        ? { ...f, mode: 'confirm' as const, suggestion }
        : { ...f, mode: 'ask' as const };
    }),
  };
}

// ─── G9: Attestierung materialisieren + Recompute ───
export interface Attestation {
  litera: string;
  value: string; // die vom Menschen bestätigte/eingegebene Angabe
}

function matchType(el: LiftedElement, type: string): boolean {
  return type === '*' || el.type === type;
}
function matchAttrs(el: LiftedElement, where?: Record<string, unknown>): boolean {
  if (!where) return true;
  return Object.entries(where).every(([k, v]) => el.attrs[k] === v);
}

/** Materialisiert den traceTarget-Pfad: fehlende Knoten/Kanten ergänzen, bis der Pfad existiert. */
function materializePath(graph: LiftedGraph, target: TraceTarget, label: string): LiftedGraph {
  const elements = [...graph.elements];
  const edges = [...graph.edges];
  const newNode = (type: string, attrs: Record<string, unknown>): string => {
    const id = `att-${uuid().slice(0, 8)}`;
    elements.push({ id, type: type === '*' ? 'object' : type, name: label, attrs, provenance: 'import' });
    return id;
  };

  let current = elements
    .filter((e) => matchType(e, target.from) && matchAttrs(e, target.where))
    .map((e) => e.id);
  if (current.length === 0) current = [newNode(target.from, target.where ?? {})];

  for (const step of target.steps) {
    const byId = new Map(elements.map((e) => [e.id, e]));
    const existing = edges
      .filter((ed) => ed.rel === step.rel && current.includes(ed.from))
      .map((ed) => byId.get(ed.to))
      .filter((t): t is LiftedElement => !!t && matchType(t, step.to) && matchAttrs(t, step.where))
      .map((t) => t.id);
    if (existing.length > 0) {
      current = existing;
      continue;
    }
    const id = newNode(step.to, step.where ?? {});
    edges.push({ from: current[0], to: id, rel: step.rel });
    current = [id];
  }
  return { elements, edges };
}

export function applyAttestation(graph: LiftedGraph, attestations: Attestation[]): LiftedGraph {
  let g: LiftedGraph = { elements: [...graph.elements], edges: [...graph.edges] };
  for (const att of attestations) {
    const field = ART30_FIELDS.find((f) => f.litera === att.litera);
    if (!field) continue;
    g = materializePath(g, field.traceTarget, att.value);
  }
  return g;
}
