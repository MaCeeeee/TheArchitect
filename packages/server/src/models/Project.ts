import mongoose, { Schema, Document } from 'mongoose';

export interface IStakeholder {
  id: string;
  name: string;
  role: string;
  stakeholderType: 'c_level' | 'business_unit' | 'it_ops' | 'data_team' | 'external';
  interests: string[];
  influence: 'high' | 'medium' | 'low';
  attitude: 'champion' | 'supporter' | 'neutral' | 'critic';
}

export interface IVision {
  scope: string;
  visionStatement: string;
  principles: string[];
  drivers: string[];
  goals: string[];
}

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
  vision?: IVision;
  stakeholders: IStakeholder[];
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
  integrations: Array<{
    _id?: mongoose.Types.ObjectId;
    connectionId: mongoose.Types.ObjectId;
    filters: Record<string, string>;
    mappingRules: Array<{ sourceType: string; targetType: string }>;
    syncIntervalMinutes: number;
    enabled: boolean;
    lastSync?: {
      status: string;
      syncedAt: Date;
      elementsCreated: number;
      connectionsCreated: number;
      durationMs: number;
      warnings: string[];
    };
  }>;
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
    vision: {
      scope: { type: String, default: '' },
      visionStatement: { type: String, default: '' },
      principles: [{ type: String }],
      drivers: [{ type: String }],
      goals: [{ type: String }],
    },
    stakeholders: [{
      id: { type: String, required: true },
      name: { type: String, required: true },
      role: { type: String, default: '' },
      stakeholderType: { type: String, enum: ['c_level', 'business_unit', 'it_ops', 'data_team', 'external'], default: 'business_unit' },
      interests: [{ type: String }],
      influence: { type: String, enum: ['high', 'medium', 'low'], default: 'medium' },
      attitude: { type: String, enum: ['champion', 'supporter', 'neutral', 'critic'], default: 'neutral' },
    }],
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
    integrations: [{
      connectionId: { type: Schema.Types.ObjectId, ref: 'Connection', required: true },
      filters: { type: Schema.Types.Mixed, default: {} },
      mappingRules: [{ sourceType: String, targetType: String }],
      syncIntervalMinutes: { type: Number, default: 0 },
      enabled: { type: Boolean, default: true },
      lastSync: {
        status: String,
        syncedAt: Date,
        elementsCreated: Number,
        connectionsCreated: Number,
        durationMs: Number,
        warnings: [String],
      },
    }],
  },
  { timestamps: true }
);

projectSchema.index({ ownerId: 1 });
projectSchema.index({ 'collaborators.userId': 1 });

export const Project = mongoose.model<IProject>('Project', projectSchema);
