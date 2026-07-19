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
  createdAt?: string;
}

export interface TraceCtx {
  feature: ContextTraceFeature;
  userId?: string;
  model?: string;
  promptVersion?: string;
  llmTraceRef?: string;
}
