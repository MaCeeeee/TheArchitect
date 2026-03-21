import mongoose, { Schema, Document } from 'mongoose';

export interface IArchitectureSnapshot extends Document {
  projectId: mongoose.Types.ObjectId;
  type: 'baseline' | 'wave';
  waveNumber?: number;
  degreeDistribution: number[];
  riskScoreDistribution: number[];
  elementCount: number;
  connectionCount: number;
  createdAt: Date;
}

const ArchitectureSnapshotSchema = new Schema<IArchitectureSnapshot>(
  {
    projectId: { type: Schema.Types.ObjectId, ref: 'Project', required: true },
    type: { type: String, enum: ['baseline', 'wave'], required: true },
    waveNumber: { type: Number },
    degreeDistribution: { type: [Number], required: true },
    riskScoreDistribution: { type: [Number], required: true },
    elementCount: { type: Number, required: true },
    connectionCount: { type: Number, required: true },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
  },
);

ArchitectureSnapshotSchema.index({ projectId: 1, type: 1, createdAt: -1 });

export const ArchitectureSnapshot = mongoose.model<IArchitectureSnapshot>(
  'ArchitectureSnapshot',
  ArchitectureSnapshotSchema,
);
