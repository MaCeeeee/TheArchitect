import mongoose, { Schema, Document } from 'mongoose';
import { randomUUID } from 'crypto';

export interface IStandardSection {
  id: string;
  title: string;
  number: string;
  content: string;
  level: number;
}

export interface IStandard extends Document {
  projectId: mongoose.Types.ObjectId;
  name: string;
  version: string;
  type: 'iso' | 'aspice' | 'togaf' | 'custom';
  description: string;
  sections: IStandardSection[];
  fullText: string;
  pageCount: number;
  uploadedBy: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const standardSectionSchema = new Schema<IStandardSection>(
  {
    id: { type: String, default: () => randomUUID() },
    title: { type: String, required: true },
    number: { type: String, default: '' },
    content: { type: String, default: '' },
    level: { type: Number, default: 1 },
  },
  { _id: false },
);

const standardSchema = new Schema<IStandard>(
  {
    projectId: { type: Schema.Types.ObjectId, ref: 'Project', required: true },
    name: { type: String, required: true, trim: true },
    version: { type: String, default: '' },
    type: {
      type: String,
      enum: ['iso', 'aspice', 'togaf', 'custom'],
      default: 'iso',
    },
    description: { type: String, default: '' },
    sections: [standardSectionSchema],
    fullText: { type: String, default: '' },
    pageCount: { type: Number, default: 0 },
    uploadedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true },
);

standardSchema.index({ projectId: 1, name: 1 });

export const Standard = mongoose.model<IStandard>('Standard', standardSchema);
