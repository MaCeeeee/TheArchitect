import mongoose, { Schema, Document } from 'mongoose';
import type { NormMappingStatusKind, NormSource } from '@thearchitect/shared';

/**
 * NormMapping — vereinheitlicht StandardMapping (Upload-Welt) + ComplianceMapping
 * (Korpus-Welt) zu einer Entität (ADR-0004 E4). Zielschema nach ADR-0004.
 *
 * WICHTIG (P1): Als **Zielschema** definiert, in P1 NICHT beschrieben. Die
 * `norm.service`-Facade projiziert die beiden Legacy-Mapping-Collections lesend
 * auf `NormMappingView`. Schreibpfad + Migration + Unique-Index-Flip = P4.
 *
 * Erhaltene ICM-Invarianten (UC-ICM-002/003): confidence, reasoning, createdBy,
 * Status-Lifecycle. `statusKind` trennt die zwei Status-Vokabulare sauber
 * (conformance vs. lifecycle) statt sie zu vermengen.
 */
export interface INormMapping extends Document {
  projectId: mongoose.Types.ObjectId;
  /** = Norm.workId der zugehörigen Norm. */
  normId: string;
  sectionEId?: string;
  elementId: string;
  status: string;
  statusKind: NormMappingStatusKind;
  confidence: number;
  reasoning?: string;
  createdBy?: string;
  source: NormSource;
  corpusRef?: {
    regulationKey: string;
    versionHash?: string;
  };
  createdAt: Date;
  updatedAt: Date;
}

const normMappingSchema = new Schema<INormMapping>(
  {
    projectId: { type: Schema.Types.ObjectId, ref: 'Project', required: true },
    normId: { type: String, required: true, trim: true },
    sectionEId: { type: String, trim: true },
    elementId: { type: String, required: true, trim: true },
    status: { type: String, required: true, trim: true },
    statusKind: { type: String, enum: ['conformance', 'lifecycle'], required: true },
    confidence: { type: Number, default: 0, min: 0, max: 1 },
    reasoning: { type: String },
    createdBy: { type: String, trim: true },
    source: { type: String, enum: ['upload', 'corpus'], required: true },
    corpusRef: {
      type: new Schema(
        {
          regulationKey: { type: String, required: true, trim: true },
          versionHash: { type: String, trim: true },
        },
        { _id: false },
      ),
    },
  },
  { timestamps: true },
);

// Ein Mapping je (Projekt, Norm, Section, Element) — Zielschema für den P4-Index-Flip
// von legacy `regulationId` (ADR-0004 E4).
normMappingSchema.index(
  { projectId: 1, normId: 1, sectionEId: 1, elementId: 1 },
  { unique: true, name: 'unique_norm_mapping' },
);

export const NormMapping = mongoose.model<INormMapping>('NormMapping', normMappingSchema);
