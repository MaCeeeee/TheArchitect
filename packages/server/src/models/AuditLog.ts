import mongoose, { Schema, Document } from 'mongoose';

export interface IAuditLog extends Document {
  userId: mongoose.Types.ObjectId;
  projectId: mongoose.Types.ObjectId;
  action: string;
  entityType: string;
  entityId: string;
  before: Record<string, unknown>;
  after: Record<string, unknown>;
  ip: string;
  userAgent: string;
  riskLevel: string;
  timestamp: Date;
}

const auditLogSchema = new Schema<IAuditLog>({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  projectId: { type: Schema.Types.ObjectId, ref: 'Project' },
  action: { type: String, required: true },
  entityType: { type: String, required: true },
  entityId: { type: String },
  before: { type: Schema.Types.Mixed },
  after: { type: Schema.Types.Mixed },
  ip: { type: String },
  userAgent: { type: String },
  riskLevel: { type: String, default: 'low' },
  timestamp: { type: Date, default: Date.now },
});

auditLogSchema.index({ userId: 1, timestamp: -1 });
auditLogSchema.index({ projectId: 1, timestamp: -1 });
auditLogSchema.index({ action: 1 });

export const AuditLog = mongoose.model<IAuditLog>('AuditLog', auditLogSchema);
