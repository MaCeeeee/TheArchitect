import mongoose, { Schema, Document } from 'mongoose';

export interface IOracleAssessment extends Document {
  projectId: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  proposal: Record<string, unknown>;
  verdict: Record<string, unknown>;
  generatedAlternatives: Record<string, unknown>[] | null;
  /** THE-423 AC-4: id of the ContextTrace(feature:'oracle') persisted for this assessment. */
  contextTraceId?: string;
  createdAt: Date;
}

const OracleAssessmentSchema = new Schema<IOracleAssessment>(
  {
    projectId: { type: Schema.Types.ObjectId, ref: 'Project', required: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    proposal: { type: Schema.Types.Mixed, required: true },
    verdict: { type: Schema.Types.Mixed, required: true },
    generatedAlternatives: { type: Schema.Types.Mixed, default: null },
    contextTraceId: { type: String, trim: true },
  },
  {
    timestamps: true,
  },
);

OracleAssessmentSchema.index({ projectId: 1, createdAt: -1 });

export const OracleAssessment = mongoose.model<IOracleAssessment>(
  'OracleAssessment',
  OracleAssessmentSchema,
);
