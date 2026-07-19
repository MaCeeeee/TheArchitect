import mongoose, { Schema, Document } from 'mongoose';
import type { ContextTraceFeature, RetrievalMethod } from '@thearchitect/shared';

/**
 * ContextTrace — append-only durable store for AC-1 (THE-423). One record per
 * governed-retrieval call across the 10 ContextTraceFeature call sites
 * (discovery, mapping, reqgen, gap, oracle, activity, connection, process,
 * dataobject, rag-query). Records WHAT context an LLM call consumed (`consumed`),
 * enabling reverse-lookup ("which decisions used regulationKey X @ versionHash Y")
 * and, for the oracle, an uncapped audit trail (`audit`) as source-of-truth.
 *
 * Mirrors packages/server/src/models/AiTrace.ts conventions (indexes,
 * optional-field style) with two deliberate differences:
 *   1. Append-only: `timestamps: { createdAt: true, updatedAt: false }` — a
 *      ContextTrace is never mutated after creation.
 *   2. `audit.rawResponse` has NO maxlength cap. AiTrace caps `rawResponse` at
 *      4000 chars "for debugging only, not a source of truth" — ContextTrace's
 *      `audit` is the oracle's source-of-truth, so no cap.
 *
 * Writes must be best-effort and never block the request path — see the
 * recorder service (later task). This model only defines the shape + indexes.
 *
 * Linear: THE-423
 */
export interface IConsumedRef {
  regulationKey: string;
  versionHash: string;
  sectionRef?: string;
  retrievalMethod: RetrievalMethod;
  score?: number;
  citedByJudge?: boolean;
  checkpointNo?: number;
}

export interface IContextAuditPayload {
  systemPrompt?: string;
  /** Uncapped — unlike AiTrace.rawResponse, this is a source-of-truth for the oracle. */
  rawResponse?: string;
  architectureContextRef?: string;
  modelParams?: Record<string, unknown>;
}

// `model` is reserved on Document (returns the owning Model constructor — see
// AiTrace.ts, which sidesteps the same collision by naming its field
// `modelId`). ContextTraceRecord's shared DTO contract uses `model`, so here
// we Omit Document's `model` instead of renaming the field.
export interface IContextTrace extends Omit<Document, 'model'> {
  // = the AC-1 "traceId"; mirrors AiTrace.requestId to enable the llmTraceRef join
  requestId: string;
  feature: ContextTraceFeature;
  projectId: mongoose.Types.ObjectId;
  userId?: string;
  consumed: IConsumedRef[];
  model?: string;
  promptVersion?: string;
  llmTraceRef?: string;
  audit?: IContextAuditPayload;
  evidenceSetHash?: string;

  createdAt: Date;
}

const CONTEXT_TRACE_FEATURES: ContextTraceFeature[] = [
  'discovery',
  'mapping',
  'reqgen',
  'gap',
  'oracle',
  'activity',
  'connection',
  'process',
  'dataobject',
  'rag-query',
];

const RETRIEVAL_METHODS: RetrievalMethod[] = ['direct', 'selector', 'dense'];

const consumedRefSchema = new Schema<IConsumedRef>(
  {
    regulationKey: { type: String, required: true },
    versionHash: { type: String, required: true },
    sectionRef: { type: String },
    retrievalMethod: { type: String, enum: RETRIEVAL_METHODS, required: true },
    score: { type: Number },
    citedByJudge: { type: Boolean },
    checkpointNo: { type: Number },
  },
  { _id: false },
);

const contextAuditPayloadSchema = new Schema<IContextAuditPayload>(
  {
    systemPrompt: { type: String },
    // No maxlength — source-of-truth for the oracle, unlike AiTrace.rawResponse.
    rawResponse: { type: String },
    architectureContextRef: { type: String },
    modelParams: { type: Schema.Types.Mixed },
  },
  { _id: false },
);

const contextTraceSchema = new Schema<IContextTrace>(
  {
    requestId: { type: String, required: true },
    feature: { type: String, enum: CONTEXT_TRACE_FEATURES, required: true },
    projectId: { type: Schema.Types.ObjectId, ref: 'Project', required: true, index: true },
    userId: { type: String },
    consumed: { type: [consumedRefSchema], default: [] },
    model: { type: String },
    promptVersion: { type: String },
    llmTraceRef: { type: String },
    audit: { type: contextAuditPayloadSchema },
    evidenceSetHash: { type: String },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

// Time-series scans per project/feature (dashboards, drift over time).
contextTraceSchema.index({ projectId: 1, feature: 1, createdAt: -1 });
// Reverse-lookup: which decisions consumed regulationKey X @ versionHash Y.
contextTraceSchema.index({ 'consumed.regulationKey': 1, 'consumed.versionHash': 1 });
// Join to the human/system decision made off the same request (AC-6, llmTraceRef).
contextTraceSchema.index({ requestId: 1 });

export const ContextTrace = mongoose.model<IContextTrace>('ContextTrace', contextTraceSchema);
