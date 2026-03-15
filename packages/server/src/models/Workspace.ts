import mongoose, { Schema, Document } from 'mongoose';

export interface IWorkspace extends Document {
  name: string;
  projectId: mongoose.Types.ObjectId;
  source: 'bpmn' | 'n8n' | 'manual' | 'archimate';
  color: string;
  offsetX: number;
  createdBy: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const workspaceSchema = new Schema<IWorkspace>(
  {
    name: { type: String, required: true },
    projectId: { type: Schema.Types.ObjectId, ref: 'Project', required: true, index: true },
    source: {
      type: String,
      enum: ['bpmn', 'n8n', 'manual', 'archimate'],
      default: 'manual',
    },
    color: { type: String, default: '#3b82f6' },
    offsetX: { type: Number, default: 0 },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true }
);

export const Workspace = mongoose.model<IWorkspace>('Workspace', workspaceSchema);
