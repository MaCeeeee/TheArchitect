import mongoose, { Schema, Document } from 'mongoose';

export type PolicyViolationStatus = 'open' | 'resolved' | 'suppressed';

export interface IPolicyViolation extends Document {
  projectId: mongoose.Types.ObjectId;
  policyId: mongoose.Types.ObjectId;
  elementId: string; // Neo4j UUID
  violationType: 'violation' | 'partial';
  severity: 'error' | 'warning' | 'info';
  message: string;
  field: string;
  currentValue: unknown;
  expectedValue: unknown;
  status: PolicyViolationStatus;
  detectedAt: Date;
  resolvedAt?: Date;
  resolvedBy?: mongoose.Types.ObjectId;
  details: string;
}

const policyViolationSchema = new Schema<IPolicyViolation>(
  {
    projectId: { type: Schema.Types.ObjectId, ref: 'Project', required: true },
    policyId: { type: Schema.Types.ObjectId, ref: 'Policy', required: true },
    elementId: { type: String, required: true },
    violationType: {
      type: String,
      enum: ['violation', 'partial'],
      default: 'violation',
    },
    severity: {
      type: String,
      enum: ['error', 'warning', 'info'],
      default: 'warning',
    },
    message: { type: String, required: true },
    field: { type: String, required: true },
    currentValue: { type: Schema.Types.Mixed },
    expectedValue: { type: Schema.Types.Mixed },
    status: {
      type: String,
      enum: ['open', 'resolved', 'suppressed'],
      default: 'open',
    },
    detectedAt: { type: Date, default: Date.now },
    resolvedAt: { type: Date },
    resolvedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    details: { type: String, default: '' },
  },
  { timestamps: true }
);

policyViolationSchema.index({ projectId: 1, status: 1 });
policyViolationSchema.index({ projectId: 1, elementId: 1, status: 1 });
policyViolationSchema.index({ policyId: 1, elementId: 1, field: 1 }, { unique: true });

export const PolicyViolation = mongoose.model<IPolicyViolation>('PolicyViolation', policyViolationSchema);
