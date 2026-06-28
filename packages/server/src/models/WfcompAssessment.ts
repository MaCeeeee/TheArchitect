/**
 * WfcompAssessment — a stored Art.-30 assessment of one workflow (Slice 3 / THE-360).
 *
 * Tenant data (per project, per workflow). Holds the GapReport snapshot + a
 * CORPUS REFERENCE (regulationKey + versionHash) instead of a law-text copy
 * (ADR-0001). One current record per workflow (re-assess upserts); the audit
 * history of assess actions lives in the AuditLog.
 */
import mongoose, { Schema, Document } from 'mongoose';
import type { WfcompGapReport } from '@thearchitect/shared';

export interface IWfcompAssessment extends Document {
  projectId: mongoose.Types.ObjectId;
  wfcompId: string;
  workflowName: string;
  gapReport: WfcompGapReport;
  /** Reference into the canonical corpus (ADR-0001) — not a text copy. */
  regulationRef: { regulationKey: string; versionHash: string };
  assessedBy?: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const wfcompAssessmentSchema = new Schema<IWfcompAssessment>(
  {
    projectId: { type: Schema.Types.ObjectId, ref: 'Project', required: true },
    wfcompId: { type: String, required: true, trim: true },
    workflowName: { type: String, default: '' },
    // GapReport snapshot — structurally validated by the pipeline, stored as-is.
    gapReport: { type: Schema.Types.Mixed, required: true },
    regulationRef: {
      regulationKey: { type: String, required: true },
      versionHash: { type: String, required: true },
      _id: false,
    },
    assessedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true },
);

// One current assessment per workflow (re-assess upserts on this key).
wfcompAssessmentSchema.index(
  { projectId: 1, wfcompId: 1 },
  { unique: true, name: 'unique_assessment_per_workflow' },
);

export const WfcompAssessment = mongoose.model<IWfcompAssessment>(
  'WfcompAssessment',
  wfcompAssessmentSchema,
);
