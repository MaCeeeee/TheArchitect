import mongoose, { Schema, Document } from 'mongoose';

export interface IPolicyRule {
  field: string;
  operator: 'equals' | 'not_equals' | 'contains' | 'gt' | 'lt' | 'gte' | 'lte' | 'exists' | 'regex';
  value: unknown;
  message: string;
}

export interface IPolicy extends Document {
  projectId: mongoose.Types.ObjectId;
  name: string;
  description: string;
  category: 'naming' | 'security' | 'compliance' | 'architecture' | 'data' | 'custom';
  framework: string;
  severity: 'error' | 'warning' | 'info';
  enabled: boolean;
  scope: {
    domains: string[];
    elementTypes: string[];
    layers: string[];
  };
  rules: IPolicyRule[];
  createdBy: mongoose.Types.ObjectId;
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
    scope: {
      domains: [{ type: String }],
      elementTypes: [{ type: String }],
      layers: [{ type: String }],
    },
    rules: [policyRuleSchema],
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true }
);

policySchema.index({ projectId: 1, enabled: 1 });

export const Policy = mongoose.model<IPolicy>('Policy', policySchema);
