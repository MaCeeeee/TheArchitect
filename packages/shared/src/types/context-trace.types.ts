export type ContextTraceFeature =
  | 'discovery' | 'mapping' | 'reqgen' | 'gap' | 'oracle'
  | 'activity' | 'connection' | 'process' | 'dataobject' | 'rag-query';

export type RetrievalMethod = 'direct' | 'selector' | 'dense';

export interface ConsumedRef {
  regulationKey: string;
  versionHash: string;
  sectionRef?: string;        // e.g. eId/paragraphNumber; provisionKind display later (THE-421)
  retrievalMethod: RetrievalMethod;
  score?: number;
  citedByJudge?: boolean;     // discovery: was fed AND cited by the judge (core "Art.16 vs Art.2" diagnostic)
  checkpointNo?: number;      // reserved (eval checkpoints), unset for now
  /**
   * Herkunfts-Markierung (ADR-0006 E4, THE-516): 'scope-guarantee' = per
   * Beweis-Garantie injizierter Geltungsbereichs-§. ADDITIV: fehlend ⇒
   * implizit 'retrieval' (bestehende Traces bleiben gültig, kein Backfill) —
   * so bleibt „wurden injizierte §§ zitiert, kippten Urteile?" eine
   * Datenbankabfrage (Notar-Prinzip).
   */
  origin?: 'retrieval' | 'scope-guarantee';
}

export interface ContextAuditPayload {   // oracle only (AC-4)
  systemPrompt?: string;
  rawResponse?: string;
  architectureContextRef?: string;
  modelParams?: Record<string, unknown>;
}

export interface ContextTraceRecord {
  requestId: string;          // = the AC-1 "traceId"; mirrors AiTrace.requestId to enable the llmTraceRef join
  feature: ContextTraceFeature;
  projectId: string;
  userId?: string;
  consumed: ConsumedRef[];
  model?: string;
  promptVersion?: string;
  llmTraceRef?: string;       // AiTrace.requestId (AC-6), only where an AiTrace exists
  audit?: ContextAuditPayload;
  evidenceSetHash?: string;
  /**
   * Scope-Guarantee-Zustand des Discovery-Laufs (ADR-0006 E4/E5, THE-516) —
   * additiv, nur bei aktivem Flag gesetzt; Run-Metadatum wie evidenceSetHash.
   */
  scopeGuarantee?: 'applied' | 'partial' | 'unavailable';
  createdAt?: string;
}

export interface TraceCtx {
  feature: ContextTraceFeature;
  userId?: string;
  model?: string;
  promptVersion?: string;
  llmTraceRef?: string;
}
