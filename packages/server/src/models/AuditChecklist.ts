import mongoose, { Schema, Document } from 'mongoose';

export interface IAuditChecklistItem {
  id: string;
  sectionNumber: string;
  title: string;
  status: 'not_started' | 'in_progress' | 'evidence_collected' | 'verified';
  evidence: Array<{
    type: 'document' | 'mapping' | 'policy';
    referenceId: string;
    description: string;
  }>;
  assignedTo?: mongoose.Types.ObjectId;
  dueDate?: Date;
  notes: string;
}

export interface IAuditChecklist extends Document {
  projectId: mongoose.Types.ObjectId;
  standardId: mongoose.Types.ObjectId;
  name: string;
  targetDate: Date;
  responsibleUserId?: mongoose.Types.ObjectId;
  items: IAuditChecklistItem[];
  overallReadiness: number;
  createdAt: Date;
  updatedAt: Date;
}

const evidenceSchema = new Schema(
  {
    type: { type: String, enum: ['document', 'mapping', 'policy'], required: true },
    referenceId: { type: String, required: true },
    description: { type: String, default: '' },
  },
  { _id: false }
);

const auditChecklistItemSchema = new Schema<IAuditChecklistItem>(
  {
    id: { type: String, required: true },
    sectionNumber: { type: String, required: true },
    title: { type: String, required: true },
    status: {
      type: String,
      enum: ['not_started', 'in_progress', 'evidence_collected', 'verified'],
      default: 'not_started',
    },
    evidence: [evidenceSchema],
    assignedTo: { type: Schema.Types.ObjectId, ref: 'User' },
    dueDate: { type: Date },
    notes: { type: String, default: '' },
  },
  { _id: false }
);

const auditChecklistSchema = new Schema<IAuditChecklist>(
  {
    projectId: { type: Schema.Types.ObjectId, ref: 'Project', required: true },
    standardId: { type: Schema.Types.ObjectId, ref: 'Standard', required: true },
    name: { type: String, required: true, trim: true },
    targetDate: { type: Date, required: true },
    responsibleUserId: { type: Schema.Types.ObjectId, ref: 'User' },
    items: [auditChecklistItemSchema],
    overallReadiness: { type: Number, default: 0, min: 0, max: 100 },
  },
  { timestamps: true }
);

auditChecklistSchema.index({ projectId: 1, standardId: 1 });

export const AuditChecklist = mongoose.model<IAuditChecklist>(
  'AuditChecklist',
  auditChecklistSchema
);
