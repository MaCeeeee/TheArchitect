import mongoose, { Schema, Document } from 'mongoose';

// Document<string> → string _id. The client-generated stable id (e.g. "ws-1748-abc")
// is used as the Mongo _id so it survives reloads and stays consistent with each
// element's `workspaceId` — otherwise workspace deletion can't find the elements.
export interface IWorkspace extends Document<string> {
  _id: string;
  name: string;
  projectId: mongoose.Types.ObjectId;
  source: 'bpmn' | 'n8n' | 'manual' | 'archimate' | 'csv' | 'blueprint';
  color: string;
  offsetX: number;
  createdBy: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const workspaceSchema = new Schema<IWorkspace>(
  {
    _id: { type: String, required: true },
    name: { type: String, required: true },
    projectId: { type: Schema.Types.ObjectId, ref: 'Project', required: true, index: true },
    source: {
      type: String,
      enum: ['bpmn', 'n8n', 'manual', 'archimate', 'csv', 'blueprint'],
      default: 'manual',
    },
    color: { type: String, default: '#3b82f6' },
    offsetX: { type: Number, default: 0 },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true }
);

export const Workspace = mongoose.model<IWorkspace>('Workspace', workspaceSchema);
