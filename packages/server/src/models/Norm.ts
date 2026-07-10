import mongoose, { Schema, Document } from 'mongoose';
import type { AliasScheme, FrbrLevel, NormSource } from '@thearchitect/shared';
import { isNormKind, isJurisdiction } from '@thearchitect/shared';

/**
 * Norm — kanonische, quellenagnostische Entität für eine externe Vorgabe
 * (UC-CANON-001 / THE-390). Zielschema nach ADR-0004 (SLICE-1).
 *
 * WICHTIG (P1): Dieses Modell ist als **Zielschema** definiert. In P1 wird es
 * NICHT beschrieben — die `norm.service`-Facade projiziert die bestehenden
 * Welten (Standard-Upload, Regulation-Korpus) lesend auf `NormView`. Der
 * Schreibpfad + die Migration landen in P4; der Unique-Index/FK-Flip auf
 * `normId` ebenfalls (bewusst NICHT in THE-419 — gegen Doppel-Migration).
 */
export interface INormAlias {
  scheme: AliasScheme;
  value: string;
  language?: string;
  isPrimaryDisplay?: boolean;
}

export interface INormSection {
  eId: string;
  parentEId?: string;
  path?: string;
  heading: string;
  number?: string;
  text?: string;
  level: number;
}

/** Bitemporale Hülle (ADR-0004 E3) — Gültigkeits- + Erfassungs-Zeit, append-only. */
export interface IBitemporal {
  validFrom?: Date;
  validTo?: Date | null;
  recordedFrom?: Date;
  recordedTo?: Date | null;
}

export interface INorm extends Document {
  projectId: mongoose.Types.ObjectId;
  /** Interner opaker Stammschlüssel — nie ein Publikations-Key (ADR-0004 E1). */
  workId: string;
  aliases: INormAlias[];
  frbrLevel: FrbrLevel;
  expressionLanguage?: string;
  source: NormSource;
  title: string;
  version?: string;
  /** Ontologie-validierte Strings (ADR-0004 E6) — kein geschlossenes Enum am Kern. */
  jurisdiction?: string;
  kind?: string;
  /** Korpus-Referenz statt Kopie (ADR-0004 E3). */
  corpusRef?: {
    regulationKey: string;
    versionHash?: string;
    expression?: string;
  };
  sections: INormSection[];
  temporal?: IBitemporal;
  ontologyVersion?: string;
  createdAt: Date;
  updatedAt: Date;
}

const normAliasSchema = new Schema<INormAlias>(
  {
    scheme: { type: String, required: true },
    value: { type: String, required: true, trim: true },
    language: { type: String, trim: true },
    isPrimaryDisplay: { type: Boolean },
  },
  { _id: false },
);

const normSectionSchema = new Schema<INormSection>(
  {
    eId: { type: String, required: true, trim: true },
    parentEId: { type: String, trim: true },
    path: { type: String, trim: true },
    heading: { type: String, required: true },
    number: { type: String, trim: true },
    text: { type: String },
    level: { type: Number, default: 1 },
  },
  { _id: false },
);

const bitemporalSchema = new Schema<IBitemporal>(
  {
    validFrom: { type: Date },
    validTo: { type: Date, default: null },
    recordedFrom: { type: Date },
    recordedTo: { type: Date, default: null },
  },
  { _id: false },
);

const normSchema = new Schema<INorm>(
  {
    projectId: { type: Schema.Types.ObjectId, ref: 'Project', required: true },
    workId: { type: String, required: true, trim: true },
    aliases: { type: [normAliasSchema], default: [] },
    frbrLevel: { type: String, default: 'work' },
    expressionLanguage: { type: String, trim: true },
    source: { type: String, enum: ['upload', 'corpus'], required: true },
    title: { type: String, required: true, trim: true },
    version: { type: String, trim: true },
    jurisdiction: {
      type: String,
      trim: true,
      validate: {
        validator: (v: string | null | undefined) => v == null || isJurisdiction(v),
        message: (props: { value: string }) =>
          `jurisdiction '${props.value}' is not in the norm ontology`,
      },
    },
    kind: {
      type: String,
      trim: true,
      validate: {
        validator: (v: string | null | undefined) => v == null || isNormKind(v),
        message: (props: { value: string }) =>
          `kind '${props.value}' is not in the norm ontology (add a normKinds row in norm-ontology.v1.ts — THE-417)`,
      },
    },
    corpusRef: {
      type: new Schema(
        {
          regulationKey: { type: String, required: true, trim: true },
          versionHash: { type: String, trim: true },
          expression: { type: String, trim: true },
        },
        { _id: false },
      ),
    },
    sections: { type: [normSectionSchema], default: [] },
    temporal: { type: bitemporalSchema },
    ontologyVersion: { type: String, trim: true },
  },
  { timestamps: true },
);

// Eine Norm je Projekt+workId (Identität, ADR-0004 E1).
normSchema.index({ projectId: 1, workId: 1 }, { unique: true, name: 'unique_norm_workid' });

export const Norm = mongoose.model<INorm>('Norm', normSchema);
