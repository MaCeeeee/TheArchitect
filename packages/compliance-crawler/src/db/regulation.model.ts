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
  /** Stable, project-independent identity, e.g. "nis2:art-23" (ADR-0001). */
  regulationKey: string;
  /** sha256 of fullText — content version fingerprint (THE-306). */
  versionHash: string;
  /**
   * Optional in the canonical corpus (one record per regulationKey, no tenant).
   * Retained for the legacy per-project model until migration (THE-368).
   */
  projectId?: mongoose.Types.ObjectId;
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
    regulationKey: { type: String, required: true, trim: true },
    versionHash: { type: String, required: true, trim: true },
    projectId: { type: Schema.Types.ObjectId, ref: 'Project', required: false },
    source: {
      type: String,
      enum: [
        'nis2',
        'lksg',
        'dsgvo',
        'dora',
        'iso27001',
        'ai-act-en',
        'ai-act-de',
        'data-act-en',
        'data-act-de',
        'custom',
      ],
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
  { regulationKey: 1, version: 1 },
  { unique: true, name: 'unique_regulation_per_version' }
);
regulationSchema.index({ source: 1, jurisdiction: 1 }, { name: 'by_source_jurisdiction' });
regulationSchema.index({ effectiveFrom: 1 }, { name: 'by_effective' });

export const Regulation = mongoose.model<IRegulation>('Regulation', regulationSchema);
