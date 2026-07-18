import mongoose, { Schema, Document } from 'mongoose';
import type { FindingStatus } from '@thearchitect/shared';

/**
 * LawDiscoveryFinding — persisted Korpus-Befund (family-Level) aus dem
 * LLM-Applicability-Judge (UC-LAW-002 Slice-2 / THE-462/463).
 *
 * Muster ComplianceMapping.ts (Status-Enum, reasoning-Validator,
 * Dedup-Unique-Index): Lifecycle `auto → confirmed|rejected`, nie
 * "Auto-Grün" (THE-462 AC-4 — der Judge liefert immer `status: 'auto'`,
 * erst ein Mensch kann `confirmed`/`rejected` setzen).
 *
 * Dedup-Achse: (projectId, family, corpusVersionHash). `corpusVersionHash`
 * ist ein ABGELEITETER Evidence-Set-Hash über die Slice-1-topHits des
 * Kandidaten (s. law-discovery.types.ts) — ändert sich die gesehene Evidenz,
 * ändert sich der Hash → neuer Befund statt eines stillen Overwrites.
 *
 * Linear: THE-463 (REQ-LAW-002.4)
 */
export interface ILawDiscoveryFinding extends Document {
  projectId: mongoose.Types.ObjectId;
  family: string;
  sources: string[];
  jurisdiction: string;
  status: FindingStatus;
  applies: boolean;
  confidence: number;
  reasoning: string;
  elementIds: string[];
  keyParagraphs: string[];
  /** Titel je keyParagraph (additiv, AC-4/Fix 1) — Alt-Docs ohne das Feld bleiben gültig. */
  keyParagraphDetails?: Array<{ regulationKey: string; title: string }>;
  retrievalScore: number;
  corpusVersionHash: string;
  judgeModel: string;
  createdBy: 'llm' | 'human';
  createdAt: Date;
  updatedAt: Date;
}

const STATUS_ENUM: FindingStatus[] = ['auto', 'confirmed', 'rejected'];
const CREATED_BY_ENUM: Array<'llm' | 'human'> = ['llm', 'human'];

const lawDiscoveryFindingSchema = new Schema<ILawDiscoveryFinding>(
  {
    projectId: { type: Schema.Types.ObjectId, ref: 'Project', required: true },
    family: { type: String, required: true, trim: true },
    sources: { type: [String], default: [] },
    jurisdiction: { type: String, required: true, trim: true },
    status: {
      type: String,
      enum: STATUS_ENUM,
      default: 'auto',
    },
    applies: { type: Boolean, required: true },
    confidence: {
      type: Number,
      required: true,
      min: 0,
      max: 1,
    },
    reasoning: {
      type: String,
      default: '',
      maxlength: 500,
      validate: {
        validator: function (this: ILawDiscoveryFinding, v: string) {
          // AC (Muster ComplianceMapping AC-7): reasoning Pflicht wenn createdBy='llm'
          if (this.createdBy === 'llm') {
            return typeof v === 'string' && v.length > 0;
          }
          return true;
        },
        message: 'reasoning is required when createdBy=llm',
      },
    },
    elementIds: { type: [String], default: [] },
    keyParagraphs: { type: [String], default: [] },
    // Additiv (AC-4/Fix 1): Anzeige-Titel je keyParagraph. Kein Migrationszwang —
    // Alt-Docs ohne das Feld bleiben gültig (UI-Fallback: roher Key). `_id:false`,
    // reine Wert-Objekte.
    keyParagraphDetails: {
      type: [new Schema({ regulationKey: { type: String, required: true }, title: { type: String, required: true } }, { _id: false })],
      default: undefined,
    },
    retrievalScore: {
      type: Number,
      required: true,
      min: 0,
      max: 1,
    },
    corpusVersionHash: { type: String, required: true, trim: true },
    judgeModel: { type: String, required: true, trim: true },
    createdBy: {
      type: String,
      enum: CREATED_BY_ENUM,
      required: true,
    },
  },
  { timestamps: true },
);

// AC-3: Dedup — ein Befund pro (Projekt, Familie, gesehene Evidenz-Version).
lawDiscoveryFindingSchema.index(
  { projectId: 1, family: 1, corpusVersionHash: 1 },
  { unique: true, name: 'unique_finding' },
);

// Merge-Lookup (Task 7/8): alle applies&&!rejected Findings eines Projekts.
lawDiscoveryFindingSchema.index({ projectId: 1, status: 1 }, { name: 'by_project_status' });

export const LawDiscoveryFinding = mongoose.model<ILawDiscoveryFinding>(
  'LawDiscoveryFinding',
  lawDiscoveryFindingSchema,
);
