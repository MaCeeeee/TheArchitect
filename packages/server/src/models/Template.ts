import mongoose, { Schema, Document } from 'mongoose';

export interface ITemplate extends Document {
  name: string;
  description: string;
  category: 'industry' | 'technology' | 'compliance' | 'best_practice';
  industry: string;
  framework: string;
  elements: Record<string, unknown>[];
  connections: Record<string, unknown>[];
  authorId: mongoose.Types.ObjectId;
  authorName: string;
  downloads: number;
  rating: number;
  ratingCount: number;
  price: number;
  tags: string[];
  createdAt: Date;
  updatedAt: Date;
}

const templateSchema = new Schema<ITemplate>(
  {
    name: { type: String, required: true, trim: true },
    description: { type: String, default: '' },
    category: {
      type: String,
      enum: ['industry', 'technology', 'compliance', 'best_practice'],
      required: true,
    },
    industry: { type: String, default: 'General' },
    framework: { type: String, default: 'TOGAF 10' },
    elements: [{ type: Schema.Types.Mixed }],
    connections: [{ type: Schema.Types.Mixed }],
    authorId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    authorName: { type: String, required: true },
    downloads: { type: Number, default: 0 },
    rating: { type: Number, default: 0 },
    ratingCount: { type: Number, default: 0 },
    price: { type: Number, default: 0 },
    tags: [{ type: String }],
  },
  { timestamps: true }
);

templateSchema.index({ category: 1 });
templateSchema.index({ name: 'text', description: 'text' });
templateSchema.index({ downloads: -1 });

export const Template = mongoose.model<ITemplate>('Template', templateSchema);
