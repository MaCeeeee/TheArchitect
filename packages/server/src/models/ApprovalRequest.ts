import mongoose, { Schema, Document } from 'mongoose';

export interface IApprovalStep {
  approverId: mongoose.Types.ObjectId;
  approverName: string;
  status: 'pending' | 'approved' | 'rejected';
  comment: string;
  decidedAt?: Date;
}

export interface IApprovalRequest extends Document {
  projectId: mongoose.Types.ObjectId;
  requesterId: mongoose.Types.ObjectId;
  requesterName: string;
  type: 'change_request' | 'architecture_review' | 'policy_exception' | 'deployment';
  title: string;
  description: string;
  entityType?: string;
  entityId?: string;
  changes?: Record<string, unknown>;
  status: 'pending' | 'approved' | 'rejected' | 'cancelled';
  priority: 'low' | 'medium' | 'high' | 'critical';
  steps: IApprovalStep[];
  currentStep: number;
  dueDate?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const approvalStepSchema = new Schema<IApprovalStep>({
  approverId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  approverName: { type: String, required: true },
  status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' },
  comment: { type: String, default: '' },
  decidedAt: { type: Date },
}, { _id: false });

const approvalRequestSchema = new Schema<IApprovalRequest>(
  {
    projectId: { type: Schema.Types.ObjectId, ref: 'Project', required: true },
    requesterId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    requesterName: { type: String, required: true },
    type: {
      type: String,
      enum: ['change_request', 'architecture_review', 'policy_exception', 'deployment'],
      required: true,
    },
    title: { type: String, required: true, trim: true },
    description: { type: String, default: '' },
    entityType: { type: String },
    entityId: { type: String },
    changes: { type: Schema.Types.Mixed },
    status: { type: String, enum: ['pending', 'approved', 'rejected', 'cancelled'], default: 'pending' },
    priority: { type: String, enum: ['low', 'medium', 'high', 'critical'], default: 'medium' },
    steps: [approvalStepSchema],
    currentStep: { type: Number, default: 0 },
    dueDate: { type: Date },
  },
  { timestamps: true }
);

approvalRequestSchema.index({ projectId: 1, status: 1 });
approvalRequestSchema.index({ requesterId: 1 });
approvalRequestSchema.index({ 'steps.approverId': 1, status: 1 });

export const ApprovalRequest = mongoose.model<IApprovalRequest>('ApprovalRequest', approvalRequestSchema);
