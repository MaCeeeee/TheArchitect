import mongoose, { Schema, Document } from 'mongoose';

export interface ITransformationRoadmap extends Document {
  projectId: mongoose.Types.ObjectId;
  createdBy: mongoose.Types.ObjectId;
  name: string;
  status: 'generating' | 'completed' | 'failed';
  config: Record<string, unknown>;
  waves: Record<string, unknown>[];
  summary: Record<string, unknown> | null;
  advisorInsightsAddressed: string[];
  version: number;
  createdAt: Date;
  updatedAt: Date;
}

const TransformationRoadmapSchema = new Schema<ITransformationRoadmap>(
  {
    projectId: { type: Schema.Types.ObjectId, ref: 'Project', required: true },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    name: { type: String, required: true },
    status: {
      type: String,
      enum: ['generating', 'completed', 'failed'],
      default: 'generating',
    },
    config: { type: Schema.Types.Mixed, required: true },
    waves: [{ type: Schema.Types.Mixed }],
    summary: { type: Schema.Types.Mixed, default: null },
    advisorInsightsAddressed: [{ type: String }],
    version: { type: Number, default: 1 },
  },
  {
    timestamps: true,
  },
);

TransformationRoadmapSchema.index({ projectId: 1, createdAt: -1 });
TransformationRoadmapSchema.index({ status: 1 });

export const TransformationRoadmap = mongoose.model<ITransformationRoadmap>(
  'TransformationRoadmap',
  TransformationRoadmapSchema,
);
