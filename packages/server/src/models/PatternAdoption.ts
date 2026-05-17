import { Schema, model, Document, Types } from 'mongoose';

export interface PatternAdoptionDoc extends Document {
  patternId: Types.ObjectId;
  projectId: Types.ObjectId;
  userId: Types.ObjectId;
  version: string;
  timestamp: Date;
}

const PatternAdoptionSchema = new Schema<PatternAdoptionDoc>({
  patternId: { type: Schema.Types.ObjectId, ref: 'DecisionPattern', required: true, index: true },
  projectId: { type: Schema.Types.ObjectId, ref: 'Project', required: true, index: true },
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  version: { type: String, required: true },
  timestamp: { type: Date, default: Date.now },
});

PatternAdoptionSchema.index({ patternId: 1, projectId: 1 });
PatternAdoptionSchema.index({ patternId: 1, timestamp: -1 });

export const PatternAdoptionModel = model<PatternAdoptionDoc>(
  'PatternAdoption',
  PatternAdoptionSchema
);
