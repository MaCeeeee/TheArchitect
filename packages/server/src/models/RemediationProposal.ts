import mongoose, { Schema, Document } from 'mongoose';

export interface IRemediationProposal extends Document {
  projectId: mongoose.Types.ObjectId;
  source: 'compliance' | 'advisor' | 'manual';
  sourceRef?: {
    normId?: string;
    standardId?: mongoose.Types.ObjectId;
    sectionIds?: string[];
    insightIds?: string[];
  };
  title: string;
  description: string;
  elements: Array<{
    tempId: string;
    name: string;
    type: string;
    layer: string;
    togafDomain: string;
    description: string;
    status: string;
    riskLevel: string;
    maturityLevel: number;
    confidence: number;
    sectionReference?: string;
    reasoning: string;
  }>;
  connections: Array<{
    tempId: string;
    sourceTempId: string;
    targetTempId: string;
    type: string;
    label?: string;
    confidence: number;
    reasoning: string;
  }>;
  validation?: Record<string, unknown>;
  status: 'draft' | 'validated' | 'partially_applied' | 'applied' | 'rejected' | 'expired';
  confidence: number;
  createdBy: mongoose.Types.ObjectId;
  appliedElementIds: string[];
  appliedConnectionIds: string[];
  appliedAt?: Date;
  appliedBy?: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const remediationProposalSchema = new Schema<IRemediationProposal>(
  {
    projectId: { type: Schema.Types.ObjectId, ref: 'Project', required: true },
    source: {
      type: String,
      enum: ['compliance', 'advisor', 'manual'],
      required: true,
    },
    sourceRef: {
      // ── ZWEI FELDER FÜR EINEN BEGRIFF, MIT ABLAUFDATUM (THE-643) ──
      //
      // `normId` ist der kanonische Schlüssel beider Welten
      // (`corpus:<source>` | `upload:<standardId>`) und der einzige, über den
      // der Rückschluss joint. `standardId` bleibt daneben stehen, weil
      // Bestands-Proposals ihn tragen — NICHT weil er noch etwas trägt: es
      // gibt kein `populate`, keinen `$lookup`, keinen Leser, der die
      // ObjectId-Natur braucht (gemessen im Pre-Flight zu THE-642).
      //
      // Genau diese Typisierung war der Bug: `corpus:dsgvo` ist ein String,
      // Mongoose lehnte beim Speichern ab, und der Nutzer sah nichts.
      //
      // ABLAUFDATUM: `standardId` stirbt mit dem Index-Flip in THE-390 P4
      // (ADR-0004 E4), zusammen mit `derivePipelineAnchorId`. Wer das hier
      // liest und beide Felder pflegen muss: das ist der Grund, und das ist
      // das Ende.
      normId: { type: String, trim: true },
      standardId: { type: Schema.Types.ObjectId, ref: 'Standard' },
      sectionIds: [String],
      insightIds: [String],
      _id: false,
    },
    title: { type: String, required: true },
    description: { type: String, default: '' },
    elements: [{
      tempId: { type: String, required: true },
      name: { type: String, required: true },
      type: { type: String, required: true },
      layer: { type: String, required: true },
      togafDomain: { type: String, required: true },
      description: { type: String, default: '' },
      status: { type: String, default: 'target' },
      riskLevel: { type: String, default: 'low' },
      maturityLevel: { type: Number, default: 1 },
      confidence: { type: Number, min: 0, max: 1, default: 0.5 },
      sectionReference: { type: String },
      reasoning: { type: String, default: '' },
      _id: false,
    }],
    connections: [{
      tempId: { type: String, required: true },
      sourceTempId: { type: String, required: true },
      targetTempId: { type: String, required: true },
      type: { type: String, required: true },
      label: { type: String },
      confidence: { type: Number, min: 0, max: 1, default: 0.5 },
      reasoning: { type: String, default: '' },
      _id: false,
    }],
    validation: { type: Schema.Types.Mixed },
    status: {
      type: String,
      enum: ['draft', 'validated', 'partially_applied', 'applied', 'rejected', 'expired'],
      default: 'draft',
    },
    confidence: { type: Number, min: 0, max: 1, default: 0 },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    appliedElementIds: { type: [String], default: [] },
    appliedConnectionIds: { type: [String], default: [] },
    appliedAt: { type: Date },
    appliedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true },
);

remediationProposalSchema.index({ projectId: 1, status: 1 });
remediationProposalSchema.index({ projectId: 1, createdAt: -1 });

export const RemediationProposal = mongoose.model<IRemediationProposal>(
  'RemediationProposal',
  remediationProposalSchema,
);
