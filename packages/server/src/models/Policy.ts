import { randomUUID } from 'crypto';
import mongoose, { Schema, Document } from 'mongoose';
import { isNormSource, ViolationSeverity, EnforcementLevel } from '@thearchitect/shared';

export interface IPolicyRule {
  ruleId: string; // stabile Identität (THE-442) — bleibt über Edits erhalten
  field: string;
  operator: 'equals' | 'not_equals' | 'contains' | 'gt' | 'lt' | 'gte' | 'lte' | 'exists' | 'regex';
  value: unknown;
  message: string;
}

export type PolicyStatus = 'active' | 'draft' | 'deprecated' | 'archived';
/** @deprecated THE-413 (ADR-0004 E6): policy sources validate against NORM_ONTOLOGY.normSources. */
export type PolicySource = string;

export interface IPolicy extends Document {
  projectId: mongoose.Types.ObjectId;
  name: string;
  description: string;
  category: 'naming' | 'security' | 'compliance' | 'architecture' | 'data' | 'custom';
  framework: string;
  severity: ViolationSeverity;
  enforcementLevel: EnforcementLevel;
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
  ruleId: { type: String, default: () => `r-${randomUUID()}` },
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
    severity: { type: String, enum: ['low', 'medium', 'high', 'critical'], default: 'medium' },
    enforcementLevel: {
      type: String,
      enum: ['advisory', 'soft_mandatory', 'hard_mandatory'],
      default: 'advisory', // Audit-Mode-First (REQ-003.3 AC-5)
    },
    enabled: { type: Boolean, default: true },
    status: {
      type: String,
      enum: ['active', 'draft', 'deprecated', 'archived'],
      default: 'active',
    },
    // THE-413 (ADR-0004 E6): allowed sources are ontology DATA, not an enum.
    // Validator passes null through (built-in enum parity); presence is required()'s job.
    source: {
      type: String,
      default: 'custom',
      validate: {
        validator: (v: string | null | undefined) => v == null || isNormSource(v),
        message: (props: { value: string }) =>
          `source '${props.value}' is not in the norm ontology (add a normSources row in norm-ontology.v1.ts — THE-413)`,
      },
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

// ruleId-Stabilität: Client-Payloads ohne ruleId bekommen serverseitig eine;
// mitgeschickte ruleIds bleiben unangetastet (THE-442). Duplikate INNERHALB
// eines Payloads (Buggy-Client, Copy-Paste-Rule) werden neu gewürfelt — sonst
// kollidiert später der Unique-Index (policyId,elementId,ruleId). AC-3: „je
// Policy eindeutige ruleId" wird hier an der Schreibgrenze erzwungen.
export function ensureRuleIds<T extends { ruleId?: string }>(rules: T[]): (T & { ruleId: string })[] {
  const seen = new Set<string>();
  return rules.map((r) => {
    let ruleId = r.ruleId || `r-${randomUUID()}`;
    if (seen.has(ruleId)) ruleId = `r-${randomUUID()}`; // Duplikat → frische Identität
    seen.add(ruleId);
    return { ...r, ruleId };
  });
}

export const Policy = mongoose.model<IPolicy>('Policy', policySchema);
