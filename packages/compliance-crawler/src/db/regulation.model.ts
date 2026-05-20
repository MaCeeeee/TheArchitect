/**
 * Regulation Mongoose Model — Crawler-side copy.
 *
 * Mirrors packages/server/src/models/Regulation.ts but lives in its own Node process
 * (Server B). Writes go to Server A's MongoDB via Tailscale (configured via MONGODB_URI).
 *
 * Schema must stay in sync with server-side Regulation model. Shared types from
 * @thearchitect/shared enforce TypeScript-level consistency.
 *
 * Linear: THE-276 (uses Regulation type from THE-275)
 */
import mongoose, { Schema, Document } from 'mongoose';
import type {
  RegulationSource,
  RegulationJurisdiction,
  RegulationLanguage,
} from '@thearchitect/shared';

export interface IRegulation extends Document {
  projectId: mongoose.Types.ObjectId;
  source: RegulationSource;
  jurisdiction: RegulationJurisdiction;
  paragraphNumber: string;
  title: string;
  fullText: string;
  summary?: string;
  sourceUrl: string;
  effectiveFrom: Date;
  effectiveUntil?: Date;
  language: RegulationLanguage;
  embedding?: number[];
  crawledAt: Date;
  version: number;
  createdAt: Date;
  updatedAt: Date;
}

const regulationSchema = new Schema<IRegulation>(
  {
    projectId: { type: Schema.Types.ObjectId, ref: 'Project', required: true },
    source: {
      type: String,
      enum: ['nis2', 'lksg', 'dsgvo', 'dora', 'iso27001', 'custom'],
      required: true,
    },
    jurisdiction: {
      type: String,
      enum: ['EU', 'DE', 'AT', 'CH'],
      required: true,
    },
    paragraphNumber: { type: String, required: true, trim: true },
    title: { type: String, required: true, trim: true },
    fullText: {
      type: String,
      required: true,
      maxlength: 20000,
      validate: {
        validator: (v: string) => typeof v === 'string' && v.length >= 50,
        message: 'fullText must be at least 50 characters (AC-5)',
      },
    },
    summary: { type: String, maxlength: 500 },
    sourceUrl: { type: String, required: true, trim: true },
    effectiveFrom: { type: Date, required: true },
    effectiveUntil: { type: Date },
    language: { type: String, enum: ['de', 'en'], required: true },
    embedding: {
      type: [Number],
      default: undefined,
      validate: {
        validator: (v: number[] | undefined) =>
          v === undefined || (Array.isArray(v) && (v.length === 0 || v.length === 768)),
        message: 'embedding must be 768-dim (all-mpnet-base-v2) or empty',
      },
    },
    crawledAt: { type: Date, default: Date.now },
    version: { type: Number, default: 1 },
  },
  { timestamps: true }
);

regulationSchema.index(
  { projectId: 1, source: 1, paragraphNumber: 1, version: 1 },
  { unique: true, name: 'unique_regulation_per_version' }
);
regulationSchema.index({ projectId: 1, source: 1 }, { name: 'by_project_source' });
regulationSchema.index({ projectId: 1, effectiveFrom: 1 }, { name: 'by_project_effective' });

export const Regulation = mongoose.model<IRegulation>('Regulation', regulationSchema);
