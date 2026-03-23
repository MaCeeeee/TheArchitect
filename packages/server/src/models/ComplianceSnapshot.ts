import mongoose, { Schema, Document } from 'mongoose';

export interface IComplianceSnapshot extends Document {
  projectId: mongoose.Types.ObjectId;
  standardId?: mongoose.Types.ObjectId;
  type: 'actual' | 'projected';
  waveNumber?: number;
  roadmapId?: mongoose.Types.ObjectId;
  policyComplianceScore: number;
  standardCoverageScore: number;
  totalSections: number;
  compliantSections: number;
  partialSections: number;
  gapSections: number;
  totalViolations: number;
  maturityLevel: number;
  createdAt: Date;
}

const complianceSnapshotSchema = new Schema<IComplianceSnapshot>(
  {
    projectId: { type: Schema.Types.ObjectId, ref: 'Project', required: true },
    standardId: { type: Schema.Types.ObjectId, ref: 'Standard' },
    type: { type: String, enum: ['actual', 'projected'], default: 'actual' },
    waveNumber: { type: Number },
    roadmapId: { type: Schema.Types.ObjectId, ref: 'TransformationRoadmap' },
    policyComplianceScore: { type: Number, default: 0 },
    standardCoverageScore: { type: Number, default: 0 },
    totalSections: { type: Number, default: 0 },
    compliantSections: { type: Number, default: 0 },
    partialSections: { type: Number, default: 0 },
    gapSections: { type: Number, default: 0 },
    totalViolations: { type: Number, default: 0 },
    maturityLevel: { type: Number, default: 1, min: 1, max: 5 },
  },
  { timestamps: true }
);

complianceSnapshotSchema.index({ projectId: 1, standardId: 1, createdAt: -1 });
complianceSnapshotSchema.index({ projectId: 1, type: 1 });

export const ComplianceSnapshot = mongoose.model<IComplianceSnapshot>(
  'ComplianceSnapshot',
  complianceSnapshotSchema
);
