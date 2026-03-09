import mongoose, { Schema, Document } from 'mongoose';

export interface IProject extends Document {
  name: string;
  description: string;
  ownerId: mongoose.Types.ObjectId;
  collaborators: Array<{
    userId: mongoose.Types.ObjectId;
    role: string;
    joinedAt: Date;
  }>;
  togafPhase: string;
  settings: {
    defaultLayer: string;
    gridSize: number;
  };
  versions: Array<{
    versionId: string;
    label: string;
    snapshot: Record<string, unknown>;
    createdAt: Date;
    createdBy: mongoose.Types.ObjectId;
  }>;
  tags: string[];
  createdAt: Date;
  updatedAt: Date;
}

const projectSchema = new Schema<IProject>(
  {
    name: { type: String, required: true, trim: true },
    description: { type: String, default: '' },
    ownerId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    collaborators: [
      {
        userId: { type: Schema.Types.ObjectId, ref: 'User' },
        role: { type: String, default: 'viewer' },
        joinedAt: { type: Date, default: Date.now },
      },
    ],
    togafPhase: { type: String, default: 'preliminary' },
    settings: {
      defaultLayer: { type: String, default: 'business' },
      gridSize: { type: Number, default: 1 },
    },
    versions: [
      {
        versionId: { type: String, required: true },
        label: { type: String, default: '' },
        snapshot: { type: Schema.Types.Mixed },
        createdAt: { type: Date, default: Date.now },
        createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
      },
    ],
    tags: [{ type: String }],
  },
  { timestamps: true }
);

projectSchema.index({ ownerId: 1 });
projectSchema.index({ 'collaborators.userId': 1 });

export const Project = mongoose.model<IProject>('Project', projectSchema);
