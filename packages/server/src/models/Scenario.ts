import mongoose, { Schema, Document } from 'mongoose';

export interface IScenarioDelta {
  elementId: string;
  field: string;
  baselineValue: unknown;
  scenarioValue: unknown;
}

export interface IScenarioCostProfile {
  totalCost: number;
  dimensions: Record<string, number>;
  p10: number;
  p50: number;
  p90: number;
  deltaFromBaseline: number;
  deltaPercent: number;
  roi?: number;
  paybackMonths?: number;
}

export interface IScenario extends Document {
  projectId: mongoose.Types.ObjectId;
  name: string;
  description?: string;
  baselineSnapshotId?: mongoose.Types.ObjectId;
  deltas: IScenarioDelta[];
  costProfile?: IScenarioCostProfile;
  mcdaScore?: number;
  createdAt: Date;
  updatedAt: Date;
}

const ScenarioDeltaSchema = new Schema<IScenarioDelta>(
  {
    elementId: { type: String, required: true },
    field: { type: String, required: true },
    baselineValue: { type: Schema.Types.Mixed },
    scenarioValue: { type: Schema.Types.Mixed },
  },
  { _id: false },
);

const ScenarioCostProfileSchema = new Schema<IScenarioCostProfile>(
  {
    totalCost: { type: Number, default: 0 },
    dimensions: { type: Schema.Types.Mixed, default: {} },
    p10: { type: Number, default: 0 },
    p50: { type: Number, default: 0 },
    p90: { type: Number, default: 0 },
    deltaFromBaseline: { type: Number, default: 0 },
    deltaPercent: { type: Number, default: 0 },
    roi: { type: Number },
    paybackMonths: { type: Number },
  },
  { _id: false },
);

const ScenarioSchema = new Schema<IScenario>(
  {
    projectId: { type: Schema.Types.ObjectId, ref: 'Project', required: true },
    name: { type: String, required: true, trim: true, maxlength: 200 },
    description: { type: String, maxlength: 2000 },
    baselineSnapshotId: { type: Schema.Types.ObjectId, ref: 'ArchitectureSnapshot' },
    deltas: { type: [ScenarioDeltaSchema], default: [] },
    costProfile: { type: ScenarioCostProfileSchema },
    mcdaScore: { type: Number },
  },
  { timestamps: true },
);

ScenarioSchema.index({ projectId: 1, createdAt: -1 });

export const Scenario = mongoose.model<IScenario>('Scenario', ScenarioSchema);
