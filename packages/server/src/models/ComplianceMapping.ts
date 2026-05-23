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
  regulationId: mongoose.Types.ObjectId;
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

export const ComplianceMapping = mongoose.model<IComplianceMapping>(
  'ComplianceMapping',
  complianceMappingSchema
);
