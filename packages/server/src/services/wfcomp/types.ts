/**
 * UC-WFCOMP-001 — In-Memory Compliance-Pipeline Typen.
 *
 * Reiner Mechanismus (DB-frei): assessWorkflow = sanitize → scope → lift → trace.
 * Neo4j-Persistenz/Cypher = Folge-Integration (REQ-WFCOMP-001.8 / THE-360).
 */
// Verdikt-Contract liegt in shared (Client ↔ Server) — hier re-exportiert
// unter den lokalen Namen, damit der Pipeline-Code unverändert bleibt.
import type {
  WfcompFieldStatus,
  WfcompFieldSuggestion,
  WfcompFieldResult,
  WfcompGapReport,
} from '@thearchitect/shared';

export type FieldStatus = WfcompFieldStatus;
export type FieldSuggestion = WfcompFieldSuggestion;
export type FieldResult = WfcompFieldResult;
export type GapReport = WfcompGapReport;

// ─── Sanitize (.0 / THE-358) ───
export interface SanitizedNode {
  name: string; // Node-Name (struktur, kein Wert)
  type: string; // n8n-Node-Typ, z.B. 'n8n-nodes-base.httpRequest'
  paramKeys: string[]; // Parameter-/Feld-SCHLÜSSEL, niemals Werte
  targetDomains: string[]; // nur Hostnames, niemals volle URLs/Payloads
}
export interface SanitizedEdge {
  from: string; // Node-Name
  to: string; // Node-Name
  kind: 'trigger' | 'flow';
}
export interface SanitizedWorkflow {
  name: string;
  nodes: SanitizedNode[];
  edges: SanitizedEdge[];
}

// ─── Lift (.2 / THE-353) — GDPR-Semantik-Graph (in-memory) ───
export type LiftedRole = 'Controller' | 'Recipient';
export interface LiftedElement {
  id: string;
  type: string; // ArchiMate-Typ, z.B. 'process' | 'data_object' | 'business_role'
  name: string;
  /** semantische Marker, gegen die traceTarget.where matched. */
  attrs: Record<string, unknown>; // z.B. { personal:true } | { role:'Recipient', thirdCountry:true }
  provenance: 'import';
}
export interface LiftedEdge {
  from: string; // element id
  to: string; // element id
  rel: string; // ConnectionType, z.B. 'flow' | 'access' | 'association'
}
export interface LiftedGraph {
  elements: LiftedElement[];
  edges: LiftedEdge[];
}

// FieldSuggestion / FieldStatus / FieldResult / GapReport: siehe shared-Re-Exports oben.
