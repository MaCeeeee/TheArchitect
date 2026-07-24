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
import { isNormSource, isJurisdiction, isLanguage } from '@thearchitect/shared';
import type { Provenance } from '../sources/types';

/**
 * THE-432 (Slice T): 5-Achsen-Typing-VORSCHLAG auf dem Korpus-Paragraphen.
 * null = das Modell hat bewusst "na" (nicht anwendbar) gesagt — ein echtes
 * Label; abwesend = Achse offen (nie beantwortet oder OOV-verworfen).
 */
export interface IRegulationTyping {
  normKind?: string | null;
  bindingness?: string | null;
  obligationKind?: string | null;
  partyRole?: string | null;
  provisionKind?: string | null;
  /** Provenance (AC-1): wer hat wann mit welchem Prompt-/Ontologie-Stand vorgeschlagen. */
  modelId: string;
  promptVersion: string;
  ontologyVersion: string;
  /**
   * Review-Fix 1: Anker an die TEXT-Version (sha256 von fullText), die dieses
   * Label beschreibt. Die Crawl-Route aktualisiert Dokumente bei einer Novelle
   * IN PLACE mit neuem versionHash — typing überlebt das; ohne Anker sähe ein
   * Label zum alten Text danach wie "up-to-date" aus.
   */
  versionHash: string;
  typedAt: Date;
  /** 'suggested' schreibt der Batch; confirmed/rejected setzt NUR ein Mensch (AC-4). */
  status: 'suggested' | 'confirmed' | 'rejected';
  /** Telemetrie (AC-2): Achsen mit OOV-verworfenem Modell-Wert — nur wenn nicht leer. */
  droppedAxes?: string[];
}

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
  provenance?: Provenance;
  /** THE-417 AC-2: the NORM_ONTOLOGY version that validated this write. Optional — existing docs predate the stamp. */
  ontologyVersion?: string;
  /** THE-432 (Slice T): typing suggestion — absent on untyped docs. */
  typing?: IRegulationTyping;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * THE-432 (Slice T): typing-Subdokument.
 *
 * WARUM das Feld im Schema stehen MUSS: mongoose strict (Default) streicht
 * unbekannte Pfade bei $set kommentarlos — ohne Schema-Feld wäre jeder
 * Batch-Write ein stilles No-op.
 *
 * null-vs-fehlend-Semantik: null = bewusstes "nicht anwendbar" (echtes Label),
 * abwesend = Achse offen. Plain `type: String` genügt dafür: mongoose castet
 * null auf optionalen Pfaden NICHT (null umgeht Cast + Setter) und persistiert
 * es; `default: undefined` hält fehlende Achsen fehlend (kein Auto-null) —
 * Mixed ist nicht nötig. Beweis auf Dokument-Ebene in
 * src/__tests__/typingBatch.test.ts (die Crawler-Suite hat kein Live-Mongo).
 *
 * BEWUSST kein Ontologie-Validator auf den Achsen (anders als source/language
 * oben): die Werte sind beim Parsen bereits gegen E6 validiert
 * (parsePrelabelLabels, OOV → drop). Ein zweiter Validator hier wäre eine
 * zweite Quelle der Wahrheit, die nach einem Ontologie-Bump alte, korrekt
 * gestempelte Vorschläge unschreibbar machte — die ontologyVersion im Stempel
 * sagt, gegen welchen Stand validiert wurde.
 */
const typingSchema = new Schema<IRegulationTyping>(
  {
    normKind: { type: String, default: undefined },
    bindingness: { type: String, default: undefined },
    obligationKind: { type: String, default: undefined },
    partyRole: { type: String, default: undefined },
    provisionKind: { type: String, default: undefined },
    modelId: { type: String, required: true },
    promptVersion: { type: String, required: true },
    ontologyVersion: { type: String, required: true },
    // Review-Fix 1: Text-Anker ist Pflicht-Provenance — ein Label ohne
    // Aussage, WELCHEN Text es beschreibt, ist nicht interpretierbar.
    versionHash: { type: String, required: true },
    typedAt: { type: Date, required: true },
    status: { type: String, required: true, enum: ['suggested', 'confirmed', 'rejected'] },
    droppedAxes: { type: [String], default: undefined },
  },
  { _id: false }
);

const regulationSchema = new Schema<IRegulation>(
  {
    regulationKey: { type: String, required: true, trim: true },
    versionHash: { type: String, required: true, trim: true },
    projectId: { type: Schema.Types.ObjectId, ref: 'Project', required: false },
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
    typing: { type: typingSchema, required: false },
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
