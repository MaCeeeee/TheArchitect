import mongoose, { Schema, Document } from 'mongoose';
import { ViolationSeverity, EnforcementLevel } from '@thearchitect/shared';

export type PolicyViolationStatus = 'open' | 'resolved' | 'suppressed';

export interface IPolicyViolation extends Document {
  projectId: mongoose.Types.ObjectId;
  policyId: mongoose.Types.ObjectId;
  elementId: string; // Neo4j UUID
  ruleId: string;    // THE-442: referenziert Policy.rules[].ruleId
  violationType: 'violation' | 'partial';
  severity: ViolationSeverity;
  enforcementLevel: EnforcementLevel;
  message: string;
  field: string;
  resourcePath: string; // REQ-003.2: /elements/{elementId}/{field}
  docLink?: string;     // REQ-003.2: Norm-Registry oder Knowledge-Base
  currentValue: unknown;
  expectedValue: unknown;
  status: PolicyViolationStatus;
  detectedAt: Date;
  resolvedAt?: Date;
  resolvedBy?: mongoose.Types.ObjectId;
  overrideReason?: string;              // REQ-003.4
  suppressedAt?: Date;                  // REQ-003.4
  suppressedBy?: mongoose.Types.ObjectId; // REQ-003.4
  details: string;
}

const policyViolationSchema = new Schema<IPolicyViolation>(
  {
    projectId: { type: Schema.Types.ObjectId, ref: 'Project', required: true },
    policyId: { type: Schema.Types.ObjectId, ref: 'Policy', required: true },
    elementId: { type: String, required: true },
    // THE-442: referenziert Policy.rules[].ruleId; Upserts schreiben echte Werte (Task 5)
    ruleId: { type: String, required: true },
    violationType: {
      type: String,
      enum: ['violation', 'partial'],
      default: 'violation',
    },
    severity: {
      type: String,
      enum: ['low', 'medium', 'high', 'critical'],
      default: 'medium',
    },
    enforcementLevel: {
      type: String,
      enum: ['advisory', 'soft_mandatory', 'hard_mandatory'],
      default: 'advisory',
    },
    message: { type: String, required: true },
    field: { type: String, required: true },
    resourcePath: { type: String, default: '' },
    docLink: { type: String },
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
    overrideReason: { type: String },
    suppressedAt: { type: Date },
    suppressedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    details: { type: String, default: '' },
  },
  { timestamps: true }
);

policyViolationSchema.index({ projectId: 1, status: 1 });
policyViolationSchema.index({ projectId: 1, elementId: 1, status: 1 });
policyViolationSchema.index({ policyId: 1, elementId: 1, ruleId: 1 }, { unique: true });

export const PolicyViolation = mongoose.model<IPolicyViolation>('PolicyViolation', policyViolationSchema);
