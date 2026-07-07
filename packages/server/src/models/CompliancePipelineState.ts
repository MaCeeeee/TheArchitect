import mongoose, { Document, Schema, Types } from 'mongoose';

export interface ICompliancePipelineState extends Document {
  projectId: Types.ObjectId;
  /**
   * Upload-Welt: echte Standard-ObjectId. Korpus-Welt (THE-390 P2): ein
   * deterministischer Anker aus dem workId-Hash (`derivePipelineAnchorId`) —
   * hält den bestehenden unique-Index funktionsfähig, referenziert aber kein
   * Standard-Doc. Der echte Schlüssel ist dann `normId`. Stirbt in P4 (Index-Flip).
   */
  standardId: Types.ObjectId;
  /** Kanonische Norm-Identität (`corpus:<source>` | `upload:<standardId>`), THE-390 P2. */
  normId?: string;
  stage: 'uploaded' | 'mapped' | 'policies_generated' | 'roadmap_ready' | 'tracking' | 'audit_ready';
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
    normId: { type: String, trim: true },
    stage: {
      type: String,
      enum: ['uploaded', 'mapped', 'policies_generated', 'roadmap_ready', 'tracking', 'audit_ready'],
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
// THE-390 P2: kanonischer Zweit-Schlüssel; sparse, weil Bestands-States kein normId tragen.
CompliancePipelineStateSchema.index(
  { projectId: 1, normId: 1 },
  { unique: true, sparse: true, name: 'unique_pipeline_norm' },
);

export const CompliancePipelineState = mongoose.model<ICompliancePipelineState>(
  'CompliancePipelineState',
  CompliancePipelineStateSchema
);
