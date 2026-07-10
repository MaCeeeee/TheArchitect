import mongoose, { Schema, Document } from 'mongoose';
import type {
  RegulationSource,
  RegulationJurisdiction,
  RegulationLanguage,
} from '@thearchitect/shared';
import { isNormSource, isJurisdiction, isLanguage } from '@thearchitect/shared';

/**
 * Regulation — strukturierte Gesetzes-Paragraphen für Industrial Compliance Mapping.
 *
 * Foundation für UC-ICM-002 (LLM-Mapping) und UC-ICM-003 (Reverse-Lookup).
 * Wird via packages/compliance-crawler von externen Quellen (EUR-Lex, gesetze-im-internet)
 * gecrawlt und mit Embeddings (all-mpnet-base-v2 → Qdrant) angereichert.
 *
 * Linear: THE-275 (REQ-ICM-001.1)
 */
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
  provenance?: IRegulationProvenance;
  /** THE-417 AC-2: the NORM_ONTOLOGY version that validated this write. Optional — existing docs predate the stamp. */
  ontologyVersion?: string;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Provenance for every ingested fact (THE-414 AC-3, UC-PROV hook). Mirrors the
 * crawler's `Provenance` shape (sources/types.ts) — inlined here so the server
 * package does not depend on the crawler package.
 */
export interface IRegulationProvenance {
  adapter: string;            // ingest adapter id, e.g. 'eur-lex'
  format: string;             // source format, e.g. 'html'
  fetchedAt?: Date;           // set at ingest
  sourceUri?: string;         // resolvable origin (per-paragraph URL)
}

const regulationSchema = new Schema<IRegulation>(
  {
    projectId: { type: Schema.Types.ObjectId, ref: 'Project', required: true },
    // THE-413 (ADR-0004 E6): allowed sources are ontology DATA, not an enum.
    // A new law = a row in norm-ontology.v1.ts normSources — no edit here.
    // Validators pass null through (built-in enum parity); presence is required()'s job.
    source: {
      type: String,
      required: true,
      validate: {
        validator: (v: string | null | undefined) => v == null || isNormSource(v),
        message: (props: { value: string }) =>
          `source '${props.value}' is not in the norm ontology (add a normSources row in norm-ontology.v1.ts — THE-413)`,
      },
    },
    jurisdiction: {
      type: String,
      required: true,
      validate: {
        validator: (v: string | null | undefined) => v == null || isJurisdiction(v),
        message: (props: { value: string }) =>
          `jurisdiction '${props.value}' is not in the norm ontology`,
      },
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
    language: {
      type: String,
      required: true,
      validate: {
        validator: (v: string | null | undefined) => v == null || isLanguage(v),
        message: (props: { value: string }) =>
          `language '${props.value}' is not in the norm ontology (add a languages row in norm-ontology.v1.ts — THE-417)`,
      },
    },
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
    provenance: {
      type: new Schema({
        adapter: { type: String, required: true },
        format: { type: String, required: true },
        fetchedAt: { type: Date },
        sourceUri: { type: String },
      }, { _id: false }),
      required: false,
    },
    ontologyVersion: { type: String, trim: true },
  },
  { timestamps: true }
);

// AC-3: Unique compound index for Upsert-Dedup
// Same (project, source, paragraph) at different versions allowed (e.g., when law changes).
regulationSchema.index(
  { projectId: 1, source: 1, paragraphNumber: 1, version: 1 },
  { unique: true, name: 'unique_regulation_per_version' }
);

// AC-4: Query indexes for performance
regulationSchema.index({ projectId: 1, source: 1 }, { name: 'by_project_source' });
regulationSchema.index({ projectId: 1, effectiveFrom: 1 }, { name: 'by_project_effective' });

export const Regulation = mongoose.model<IRegulation>('Regulation', regulationSchema);
