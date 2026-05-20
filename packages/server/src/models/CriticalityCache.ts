import { Schema, model, Document, Types } from 'mongoose';
import type { CriticalityScoreEntry, FactorWeights } from '@thearchitect/shared';

export interface CriticalityCacheDoc extends Document {
  projectId: Types.ObjectId | string;
  scores: CriticalityScoreEntry[];
  weights: FactorWeights;
  inputHash: string;
  computedAt: Date;
}

const CriticalityCacheSchema = new Schema<CriticalityCacheDoc>(
  {
    projectId: { type: Schema.Types.Mixed, required: true, unique: true, index: true },
    scores: { type: Schema.Types.Mixed, default: [] },
    weights: { type: Schema.Types.Mixed, required: true },
    inputHash: { type: String, required: true },
    computedAt: { type: Date, default: Date.now },
  },
  { timestamps: false }
);

export const CriticalityCacheModel = model<CriticalityCacheDoc>(
  'CriticalityCache',
  CriticalityCacheSchema
);
