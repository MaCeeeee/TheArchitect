import mongoose, { Schema, Document } from 'mongoose';

export interface IInvitation extends Document {
  projectId: mongoose.Types.ObjectId;
  invitedEmail: string;
  inviterUserId: mongoose.Types.ObjectId;
  role: string;
  status: string;
  token: string;
  expiresAt: Date;
  respondedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const InvitationSchema = new Schema<IInvitation>(
  {
    projectId: { type: Schema.Types.ObjectId, ref: 'Project', required: true },
    invitedEmail: { type: String, required: true, lowercase: true, trim: true },
    inviterUserId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    role: { type: String, enum: ['editor', 'reviewer', 'viewer'], default: 'viewer' },
    status: {
      type: String,
      enum: ['pending', 'accepted', 'declined', 'expired', 'cancelled'],
      default: 'pending',
    },
    token: { type: String, required: true, unique: true },
    expiresAt: { type: Date, required: true },
    respondedAt: { type: Date },
  },
  { timestamps: true }
);

InvitationSchema.index({ projectId: 1, status: 1 });
InvitationSchema.index({ invitedEmail: 1, status: 1 });
InvitationSchema.index({ token: 1 }, { unique: true });
InvitationSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const Invitation = mongoose.model<IInvitation>('Invitation', InvitationSchema);
