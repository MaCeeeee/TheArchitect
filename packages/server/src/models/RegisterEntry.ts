import mongoose, { Schema, Document } from 'mongoose';
import type {
  RegisterKind,
  RegisterSource,
  RegisterStatus,
  RoutingPath,
} from '@thearchitect/shared';

/**
 * Operational Governance Engine — WORM register (THE-445, UC-PROBMGMT-001 / UC-RISK-001).
 *
 * One collection, two lenses (`kind`). Rows are append-only: a status transition writes a NEW
 * row that `supersedes` the previous one (see register.service.decideGate). The pre('save')
 * guard below enforces this — a persisted row can never be mutated in place (AC-2).
 */

/**
 * A proposed consequent action attached to a register row. NEVER executed automatically — it is
 * surfaced for a human to approve/reject (Asilomar #16, THE-445 AC-4).
 */
export interface ProposedAction {
  type:
    | 'page_oncall'
    | 'create_blocker'
    | 'create_backlog_item'
    | 'reply_reporter'
    | 'reject_noise';
  description: string;
  /** Always true in slice 1 — nothing outward-facing runs without human sign-off. */
  requiresApproval: boolean;
  status: 'proposed' | 'approved' | 'rejected';
}

export interface IRegisterEntry extends Document {
  projectId: mongoose.Types.ObjectId;
  kind: RegisterKind;
  fingerprint: string;
  source: RegisterSource;
  systemComponent: string;
  environment: string;
  title: string;
  description?: string;
  stackTrace?: string;
  errorType?: string;
  severity: number;
  urgency: number;
  criticality: number;
  mitigation: number;
  pScore: number;
  weightsVersion: string;
  routingPath: RoutingPath;
  occurrenceCounter: number;
  parentRef?: mongoose.Types.ObjectId | null;
  supersedes?: mongoose.Types.ObjectId | null;
  status: RegisterStatus;
  owner?: string | null;
  evidence: Record<string, unknown>;
  proposedActions: ProposedAction[];
  createdBy?: mongoose.Types.ObjectId | null;
  createdAt: Date;
  updatedAt: Date;
}

const KINDS: RegisterKind[] = ['incident', 'defect', 'problem', 'risk'];
const SOURCES: RegisterSource[] = [
  'manual',
  'sentry',
  'github',
  'sonarqube',
  'dependabot',
  'support',
];
const STATUSES: RegisterStatus[] = [
  'open',
  'assessed',
  'triaging',
  'mitigating',
  'mitigated',
  'accepted',
  'resolved',
  'superseded',
  'noise',
];
const ROUTES: RoutingPath[] = ['critical', 'normal', 'noise'];

const proposedActionSchema = new Schema<ProposedAction>(
  {
    type: { type: String, required: true },
    description: { type: String, required: true },
    requiresApproval: { type: Boolean, default: true },
    status: {
      type: String,
      enum: ['proposed', 'approved', 'rejected'],
      default: 'proposed',
    },
  },
  { _id: false },
);

const registerEntrySchema = new Schema<IRegisterEntry>(
  {
    projectId: { type: Schema.Types.ObjectId, ref: 'Project', required: true },
    kind: { type: String, enum: KINDS, required: true },
    fingerprint: { type: String, required: true },
    source: { type: String, enum: SOURCES, required: true },
    systemComponent: { type: String, required: true },
    environment: { type: String, required: true },
    title: { type: String, required: true },
    description: { type: String },
    stackTrace: { type: String },
    errorType: { type: String },
    severity: { type: Number, required: true, min: 1, max: 5 },
    urgency: { type: Number, required: true, min: 1, max: 5 },
    criticality: { type: Number, required: true, min: 1, max: 5 },
    mitigation: { type: Number, required: true, min: 0, max: 5, default: 0 },
    pScore: { type: Number, required: true },
    weightsVersion: { type: String, required: true },
    routingPath: { type: String, enum: ROUTES, required: true },
    occurrenceCounter: { type: Number, required: true, default: 1 },
    parentRef: { type: Schema.Types.ObjectId, ref: 'RegisterEntry', default: null },
    supersedes: { type: Schema.Types.ObjectId, ref: 'RegisterEntry', default: null },
    status: { type: String, enum: STATUSES, required: true, default: 'open' },
    owner: { type: String, default: null },
    evidence: { type: Schema.Types.Mixed, default: {} },
    proposedActions: { type: [proposedActionSchema], default: [] },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true },
);

// WORM guard (AC-2): a persisted row is immutable. Status transitions MUST go through
// register.service.decideGate, which writes a NEW row. Re-saving an existing document is a
// programming error and is rejected. (Query-level updateOne/findOneAndUpdate are intentionally
// not used anywhere in the register service.)
registerEntrySchema.pre('save', function (next) {
  if (!this.isNew) {
    return next(
      new Error(
        'RegisterEntry is append-only (WORM): write a new row via decideGate, do not update in place',
      ),
    );
  }
  next();
});

registerEntrySchema.index(
  { projectId: 1, fingerprint: 1 },
  { name: 'by_project_fingerprint' },
);
registerEntrySchema.index(
  { projectId: 1, kind: 1, status: 1 },
  { name: 'by_project_kind_status' },
);
registerEntrySchema.index({ projectId: 1, createdAt: -1 }, { name: 'by_project_created' });

export const RegisterEntry = mongoose.model<IRegisterEntry>(
  'RegisterEntry',
  registerEntrySchema,
);
