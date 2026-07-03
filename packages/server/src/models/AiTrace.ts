import mongoose, { Schema, Document } from 'mongoose';

/**
 * AiTrace — one record per LLM call in the compliance pipeline (mapping,
 * requirement-generation). Foundation for Observability (UC-EVAL-001 / THE-384):
 * lets us (a) debug individual calls, (b) detect drift, and (c) JOIN a prediction
 * to the later human decision (ComplianceMapping.status) via
 * (projectId, regulationId) or (regulationKey, regulationVersionHash).
 *
 * Writes are best-effort and must never block or fail the request path — see
 * aiTrace.service.ts. This model only defines the shape + indexes.
 *
 * Linear: THE-384 (REQ-EVAL-001.6)
 */
export type AiTraceOperation =
  | 'mapping' // Regulation → element, persisted
  | 'mapping-live' // Paste-&-see, not persisted
  | 'requirement-generation';

export interface AiTracePrediction {
  elementId: string;
  elementType?: string;
  confidence: number;
}

export interface IAiTrace extends Document {
  requestId: string;
  operation: AiTraceOperation;
  /** Model id (field is `modelId`, not `model` — `model` is reserved on Document). */
  modelId: string;
  promptVersionHash: string;

  projectId?: mongoose.Types.ObjectId;
  regulationId?: mongoose.Types.ObjectId;
  regulationKey?: string;
  regulationVersionHash?: string;

  candidateCount: number;
  candidateElementIds: string[];
  predictions: AiTracePrediction[];
  predictionCount: number;

  /** Truncated raw model text — for debugging only, not a source of truth. */
  rawResponse?: string;

  latencyMs: number;
  inputTokens?: number;
  outputTokens?: number;
  costUsd?: number;

  createdAt: Date;
  updatedAt: Date;
}

const predictionSchema = new Schema<AiTracePrediction>(
  {
    elementId: { type: String, required: true },
    elementType: { type: String },
    confidence: { type: Number, required: true, min: 0, max: 1 },
  },
  { _id: false },
);

const aiTraceSchema = new Schema<IAiTrace>(
  {
    requestId: { type: String, required: true, index: true },
    operation: {
      type: String,
      enum: ['mapping', 'mapping-live', 'requirement-generation'],
      required: true,
    },
    modelId: { type: String, required: true },
    promptVersionHash: { type: String, required: true },

    projectId: { type: Schema.Types.ObjectId, ref: 'Project' },
    regulationId: { type: Schema.Types.ObjectId, ref: 'Regulation' },
    regulationKey: { type: String, trim: true },
    regulationVersionHash: { type: String, trim: true },

    candidateCount: { type: Number, required: true, default: 0 },
    candidateElementIds: { type: [String], default: [] },
    predictions: { type: [predictionSchema], default: [] },
    predictionCount: { type: Number, required: true, default: 0 },

    rawResponse: { type: String, maxlength: 4000 },

    latencyMs: { type: Number, required: true },
    inputTokens: { type: Number },
    outputTokens: { type: Number },
    costUsd: { type: Number },
  },
  { timestamps: true },
);

// Join a prediction to the human decision on the same regulation/project.
aiTraceSchema.index({ projectId: 1, regulationId: 1, createdAt: -1 });
// Drift + corpus-reference lookup (mirror of ComplianceMapping.by_corpus_reference).
aiTraceSchema.index({ regulationKey: 1, regulationVersionHash: 1 });
// Time-series scans (accept-rate over time, cost dashboards).
aiTraceSchema.index({ operation: 1, createdAt: -1 });

export const AiTrace = mongoose.model<IAiTrace>('AiTrace', aiTraceSchema);
