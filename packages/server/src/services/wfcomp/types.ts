/**
 * UC-WFCOMP-001 — In-Memory Compliance-Pipeline Typen.
 *
 * Reiner Mechanismus (DB-frei): assessWorkflow = sanitize → scope → lift → trace.
 * Neo4j-Persistenz/Cypher = Folge-Integration (REQ-WFCOMP-001.8 / THE-360).
 */
import type { Art30Criticality } from '@thearchitect/shared';

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

// ─── Trace (.4 / THE-355) ───
export type FieldStatus = 'present' | 'missing' | 'needs_attestation';
export interface FieldResult {
  litera: string;
  criticality: Art30Criticality;
  status: FieldStatus;
}
export interface GapReport {
  gdprScope: boolean;
  fields: FieldResult[]; // leer wenn gdprScope=false
}
