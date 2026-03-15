import mongoose, { Schema, Document } from 'mongoose';

export interface ISimulationRun extends Document {
  projectId: mongoose.Types.ObjectId;
  createdBy: mongoose.Types.ObjectId;
  name: string;
  status: 'configuring' | 'running' | 'completed' | 'failed' | 'cancelled';
  scenarioType: string;
  config: Record<string, unknown>;
  rounds: Record<string, unknown>[];
  result: Record<string, unknown> | null;
  totalTokensUsed: number;
  totalDurationMs: number;
  createdAt: Date;
  updatedAt: Date;
}

const SimulationRunSchema = new Schema<ISimulationRun>(
  {
    projectId: { type: Schema.Types.ObjectId, ref: 'Project', required: true },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    name: { type: String, required: true },
    status: {
      type: String,
      enum: ['configuring', 'running', 'completed', 'failed', 'cancelled'],
      default: 'configuring',
    },
    scenarioType: {
      type: String,
      enum: ['cloud_migration', 'mna_integration', 'technology_refresh', 'cost_optimization', 'org_restructure', 'custom'],
      required: true,
    },
    config: { type: Schema.Types.Mixed, required: true },
    rounds: [{ type: Schema.Types.Mixed }],
    result: { type: Schema.Types.Mixed, default: null },
    totalTokensUsed: { type: Number, default: 0 },
    totalDurationMs: { type: Number, default: 0 },
  },
  {
    timestamps: true,
  },
);

SimulationRunSchema.index({ projectId: 1, createdAt: -1 });
SimulationRunSchema.index({ status: 1 });

export const SimulationRun = mongoose.model<ISimulationRun>('SimulationRun', SimulationRunSchema);
