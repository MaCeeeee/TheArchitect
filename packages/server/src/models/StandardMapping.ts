import mongoose, { Schema, Document } from 'mongoose';

export interface IStandardMapping extends Document {
  projectId: mongoose.Types.ObjectId;
  standardId: mongoose.Types.ObjectId;
  sectionId: string;
  sectionNumber: string;
  elementId: string;
  elementName: string;
  elementLayer: string;
  status: 'compliant' | 'partial' | 'gap' | 'not_applicable';
  notes: string;
  source: 'ai' | 'manual';
  confidence: number;
  createdBy: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
  suggestedNewElement?: {
    name: string;
    type: string;
    layer: string;
    description: string;
  };
}

const standardMappingSchema = new Schema<IStandardMapping>(
  {
    projectId: { type: Schema.Types.ObjectId, ref: 'Project', required: true },
    standardId: { type: Schema.Types.ObjectId, ref: 'Standard', required: true },
    sectionId: { type: String, required: true },
    sectionNumber: { type: String, default: '' },
    elementId: { type: String, required: true },
    elementName: { type: String, default: '' },
    elementLayer: { type: String, default: '' },
    status: {
      type: String,
      enum: ['compliant', 'partial', 'gap', 'not_applicable'],
      default: 'gap',
    },
    notes: { type: String, default: '' },
    source: {
      type: String,
      enum: ['ai', 'manual'],
      default: 'manual',
    },
    confidence: { type: Number, default: 0, min: 0, max: 1 },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    suggestedNewElement: {
      name: { type: String },
      type: { type: String },
      layer: { type: String },
      description: { type: String, default: '' },
      _id: false,
    },
  },
  { timestamps: true },
);

standardMappingSchema.index({ projectId: 1, standardId: 1, sectionId: 1 });
standardMappingSchema.index({ projectId: 1, elementId: 1 });
standardMappingSchema.index({ standardId: 1, sectionId: 1, elementId: 1 }, { unique: true });

export const StandardMapping = mongoose.model<IStandardMapping>('StandardMapping', standardMappingSchema);
