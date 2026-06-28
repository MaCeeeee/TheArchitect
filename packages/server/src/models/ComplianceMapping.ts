import mongoose, { Schema, Document } from 'mongoose';
import type {
  ComplianceMappingElementType,
  ComplianceMappingStatus,
  ComplianceMappingProvenance,
} from '@thearchitect/shared';

/**
 * ComplianceMapping — persisted LLM-derived link between a Regulation paragraph
 * and an ArchiMate element. Foundation for UC-ICM-003 Reverse-Lookup + Heat-Map.
 *
 * Linear: THE-278 (REQ-ICM-002.1)
 */
export interface IComplianceMapping extends Document {
  projectId: mongoose.Types.ObjectId;
  /** Local pointer (legacy / per-project). Retained until the corpus read-path (THE-368). */
  regulationId: mongoose.Types.ObjectId;
  /**
   * Canonical corpus reference (ADR-0001 / THE-306): the project-independent
   * `regulationKey` (e.g. "dsgvo:art-30") + the `versionHash` of the exact text this
   * mapping was made against. Pins the version and later lets us detect drift against
   * the live corpus (mismatch-detection lands with THE-368). Optional until existing
   * mappings are migrated (scripts/migrate-mapping-references.ts).
   */
  regulationKey?: string;
  regulationVersionHash?: string;
  elementId: string;
  elementType: ComplianceMappingElementType;
  confidence: number;
  reasoning: string;
  status: ComplianceMappingStatus;
  createdBy: ComplianceMappingProvenance;
  createdAt: Date;
  updatedAt: Date;
}

const ELEMENT_TYPE_ENUM: ComplianceMappingElementType[] = [
  'capability',
  'application',
  'data_object',
  'business_process',
  'business_actor',
  'business_service',
  'application_service',
  'business_function',
  'business_object',
  'business_role',
  'technology_service',
  'node',
  'custom',
];

const STATUS_ENUM: ComplianceMappingStatus[] = ['auto', 'confirmed', 'rejected'];

const PROVENANCE_ENUM: ComplianceMappingProvenance[] = ['llm', 'human', 'live-mapping'];

const complianceMappingSchema = new Schema<IComplianceMapping>(
  {
    projectId: { type: Schema.Types.ObjectId, ref: 'Project', required: true },
    regulationId: { type: Schema.Types.ObjectId, ref: 'Regulation', required: true },
    // Corpus reference (ADR-0001 / THE-306) — optional until migration backfills existing mappings.
    regulationKey: { type: String, trim: true },
    regulationVersionHash: { type: String, trim: true },
    elementId: { type: String, required: true, trim: true },
    elementType: {
      type: String,
      enum: ELEMENT_TYPE_ENUM,
      required: true,
    },
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
        validator: function (this: IComplianceMapping, v: string) {
          // AC-7: reasoning Pflicht wenn createdBy='llm'
          if (this.createdBy === 'llm') {
            return typeof v === 'string' && v.length > 0;
          }
          return true;
        },
        message: 'reasoning is required when createdBy=llm',
      },
    },
    status: {
      type: String,
      enum: STATUS_ENUM,
      default: 'auto',
    },
    createdBy: {
      type: String,
      enum: PROVENANCE_ENUM,
      required: true,
    },
  },
  { timestamps: true }
);

// AC-3: Unique compound index for Upsert-Dedup
// A given (project, regulation, element) triple has at most ONE mapping.
complianceMappingSchema.index(
  { projectId: 1, regulationId: 1, elementId: 1 },
  { unique: true, name: 'unique_mapping' }
);

// AC-4: Reverse-Lookup query (element → all relevant regulations, sorted by confidence)
// Used by UC-ICM-003.2 PropertyPanel Compliance Tab
complianceMappingSchema.index(
  { projectId: 1, elementId: 1, confidence: -1 },
  { name: 'by_element_for_reverse_lookup' }
);

// AC-5: Forward-Lookup query (regulation → all affected elements)
// Used by UC-ICM-003.1 Heat-Map coverage computation
complianceMappingSchema.index(
  { projectId: 1, regulationId: 1 },
  { name: 'by_regulation_for_heatmap' }
);

// THE-306: corpus reference lookup (regulationKey → mappings) for drift-detection / re-map (THE-368).
complianceMappingSchema.index(
  { regulationKey: 1, regulationVersionHash: 1 },
  { name: 'by_corpus_reference' }
);

export const ComplianceMapping = mongoose.model<IComplianceMapping>(
  'ComplianceMapping',
  complianceMappingSchema
);
