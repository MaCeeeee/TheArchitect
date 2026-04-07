import mongoose, { Schema, Document } from 'mongoose';

export interface IPolicyRule {
  field: string;
  operator: 'equals' | 'not_equals' | 'contains' | 'gt' | 'lt' | 'gte' | 'lte' | 'exists' | 'regex';
  value: unknown;
  message: string;
}

export type PolicyStatus = 'active' | 'draft' | 'deprecated' | 'archived';
export type PolicySource = 'custom' | 'dora' | 'nis2' | 'togaf' | 'archimate' | 'iso27001';

export interface IPolicy extends Document {
  projectId: mongoose.Types.ObjectId;
  name: string;
  description: string;
  category: 'naming' | 'security' | 'compliance' | 'architecture' | 'data' | 'custom';
  framework: string;
  severity: 'error' | 'warning' | 'info';
  enabled: boolean;
  status: PolicyStatus;
  source: PolicySource;
  scope: {
    domains: string[];
    elementTypes: string[];
    layers: string[];
  };
  rules: IPolicyRule[];
  standardId?: mongoose.Types.ObjectId;
  sourceSectionNumber?: string;
  effectiveFrom?: Date;
  effectiveUntil?: Date;
  version: number;
  createdBy: mongoose.Types.ObjectId;
  updatedBy?: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const policyRuleSchema = new Schema<IPolicyRule>({
  field: { type: String, required: true },
  operator: {
    type: String,
    enum: ['equals', 'not_equals', 'contains', 'gt', 'lt', 'gte', 'lte', 'exists', 'regex'],
    required: true,
  },
  value: { type: Schema.Types.Mixed, required: true },
  message: { type: String, required: true },
}, { _id: false });

const policySchema = new Schema<IPolicy>(
  {
    projectId: { type: Schema.Types.ObjectId, ref: 'Project', required: true },
    name: { type: String, required: true, trim: true },
    description: { type: String, default: '' },
    category: {
      type: String,
      enum: ['naming', 'security', 'compliance', 'architecture', 'data', 'custom'],
      required: true,
    },
    framework: { type: String, default: 'TOGAF 10' },
    severity: { type: String, enum: ['error', 'warning', 'info'], default: 'warning' },
    enabled: { type: Boolean, default: true },
    status: {
      type: String,
      enum: ['active', 'draft', 'deprecated', 'archived'],
      default: 'active',
    },
    source: {
      type: String,
      enum: ['custom', 'dora', 'nis2', 'togaf', 'archimate', 'iso27001'],
      default: 'custom',
    },
    scope: {
      domains: [{ type: String }],
      elementTypes: [{ type: String }],
      layers: [{ type: String }],
    },
    rules: [policyRuleSchema],
    standardId: { type: Schema.Types.ObjectId, ref: 'Standard' },
    sourceSectionNumber: { type: String },
    effectiveFrom: { type: Date },
    effectiveUntil: { type: Date },
    version: { type: Number, default: 1 },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

policySchema.index({ projectId: 1, enabled: 1 });
policySchema.index({ projectId: 1, status: 1 });
policySchema.index({ projectId: 1, standardId: 1 });

export const Policy = mongoose.model<IPolicy>('Policy', policySchema);
