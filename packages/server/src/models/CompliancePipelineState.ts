import mongoose, { Document, Schema, Types } from 'mongoose';

export interface ICompliancePipelineState extends Document {
  projectId: Types.ObjectId;
  standardId: Types.ObjectId;
  stage: 'uploaded' | 'mapped' | 'policies_generated' | 'roadmap_ready' | 'tracking';
  mappingStats: {
    total: number;
    compliant: number;
    partial: number;
    gap: number;
    unmapped: number;
  };
  policyStats: {
    generated: number;
    approved: number;
    rejected: number;
  };
  roadmapId?: Types.ObjectId;
  lastSnapshotAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const CompliancePipelineStateSchema = new Schema<ICompliancePipelineState>(
  {
    projectId: { type: Schema.Types.ObjectId, required: true, index: true },
    standardId: { type: Schema.Types.ObjectId, required: true, ref: 'Standard' },
    stage: {
      type: String,
      enum: ['uploaded', 'mapped', 'policies_generated', 'roadmap_ready', 'tracking'],
      default: 'uploaded',
    },
    mappingStats: {
      total: { type: Number, default: 0 },
      compliant: { type: Number, default: 0 },
      partial: { type: Number, default: 0 },
      gap: { type: Number, default: 0 },
      unmapped: { type: Number, default: 0 },
    },
    policyStats: {
      generated: { type: Number, default: 0 },
      approved: { type: Number, default: 0 },
      rejected: { type: Number, default: 0 },
    },
    roadmapId: { type: Schema.Types.ObjectId, ref: 'TransformationRoadmap' },
    lastSnapshotAt: { type: Date },
  },
  { timestamps: true }
);

CompliancePipelineStateSchema.index({ projectId: 1, standardId: 1 }, { unique: true });

export const CompliancePipelineState = mongoose.model<ICompliancePipelineState>(
  'CompliancePipelineState',
  CompliancePipelineStateSchema
);
