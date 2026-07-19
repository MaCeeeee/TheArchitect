import mongoose, { Schema, Document } from 'mongoose';
import type {
  ComplianceRequirementPriority,
  ComplianceRequirementStatus,
  ComplianceRequirementProvenance,
  Art30Criticality,
  TraceTarget,
} from '@thearchitect/shared';

/**
 * ComplianceRequirement — LLM-derived, actionable Anforderung aus einer
 * Regulation. Während `ComplianceMapping` sagt "Element X ist betroffen",
 * sagt `ComplianceRequirement`: "Element X MUSS folgendes tun: ...".
 *
 * Audit-tauglich, tracking-fähig (open → in_progress → done → waived).
 *
 * Inspired by CORA's "Anforderungen generieren" Workflow.
 *
 * Linear: THE-302 (REQ-REQGEN-001.1)
 */
export interface IComplianceRequirement extends Document {
  projectId: mongoose.Types.ObjectId;
  /**
   * Legacy-Anker (required + Teil des Idempotenz-Index). Für Norm-basierte
   * Requirements (THE-390 P3) trägt es den deterministischen Anchor aus
   * `derivePipelineAnchorId(normId)` — der echte Schlüssel ist dann `normId`.
   * Flippt in P4 auf corpusRef (ADR-0004 E5).
   */
  regulationId: mongoose.Types.ObjectId;
  /** Kanonische Norm-Identität (`corpus:<source>` | `upload:<standardId>`), THE-390 P3. */
  normId?: string;
  /** Section-/Paragraphen-Referenz innerhalb der Norm (@eId bzw. regulationKey). */
  sectionEId?: string;
  // THE-423 (Task 7) — corpus-read provenance link. Precedent: ComplianceMapping.ts:40/80.
  contextTraceId?: string;
  sourceParagraph: string;
  title: string;
  description: string;
  priority: ComplianceRequirementPriority;
  linkedElementIds: string[];
  status: ComplianceRequirementStatus;
  assigneeId?: mongoose.Types.ObjectId;
  dueDate?: Date;
  createdBy: ComplianceRequirementProvenance;
  // Explainability layer (audit-grade, UC-REQGEN-001)
  extractionConfidence?: number;  // "genuine obligation?" — required when createdBy='llm'
  extractionRationale?: string;   // why genuine + why this score
  mappingConfidence?: number;     // "how well do linked elements fit?" (0 if none)
  mappingRationale?: string;      // why these elements (or why none)
  // ─── WFCOMP (REQ-WFCOMP-001.1 / THE-352) ───
  criticality?: Art30Criticality; // Art.-30-Klasse (HART/BEDINGT/WEICH)
  traceTarget?: TraceTarget;      // erwarteter Graph-Pfad für Trace-Check (THE-355)
  createdAt: Date;
  updatedAt: Date;
}

const PRIORITY_ENUM: ComplianceRequirementPriority[] = ['must', 'should', 'may'];
const STATUS_ENUM: ComplianceRequirementStatus[] = ['open', 'in_progress', 'done', 'waived'];
const PROVENANCE_ENUM: ComplianceRequirementProvenance[] = ['llm', 'human'];

const complianceRequirementSchema = new Schema<IComplianceRequirement>(
  {
    projectId: { type: Schema.Types.ObjectId, ref: 'Project', required: true },
    regulationId: { type: Schema.Types.ObjectId, ref: 'Regulation', required: true },
    normId: { type: String, trim: true },
    sectionEId: { type: String, trim: true },
    contextTraceId: { type: String, trim: true },
    sourceParagraph: { type: String, default: '', maxlength: 5000 },
    title: {
      type: String,
      required: true,
      trim: true,
      minlength: 5,
      maxlength: 200,
    },
    description: {
      type: String,
      required: true,
      trim: true,
      minlength: 5,
      maxlength: 2000,
    },
    priority: {
      type: String,
      enum: PRIORITY_ENUM,
      required: true,
    },
    linkedElementIds: {
      type: [String],
      default: [],
      validate: {
        validator: (arr: string[]) => arr.every(s => typeof s === 'string' && s.length > 0),
        message: 'linkedElementIds must be non-empty strings',
      },
    },
    status: {
      type: String,
      enum: STATUS_ENUM,
      default: 'open',
    },
    assigneeId: { type: Schema.Types.ObjectId, ref: 'User' },
    dueDate: { type: Date },
    createdBy: {
      type: String,
      enum: PROVENANCE_ENUM,
      required: true,
    },
    // ─── Explainability layer (audit-grade) ───
    // extractionConfidence Pflicht wenn createdBy='llm'. Function-syntax weil
    // Mongoose `required:true` mit Funktion supportet (validator wird bei
    // undefined-Werten nicht aufgerufen, deshalb required statt validate).
    extractionConfidence: {
      type: Number,
      min: 0,
      max: 1,
      required: [
        function (this: IComplianceRequirement) {
          return this.createdBy === 'llm';
        },
        'extractionConfidence is required when createdBy=llm',
      ],
    },
    extractionRationale: {
      type: String,
      default: '',
      maxlength: 1000,
      required: [
        function (this: IComplianceRequirement) {
          return this.createdBy === 'llm';
        },
        'extractionRationale is required when createdBy=llm',
      ],
    },
    mappingConfidence: {
      type: Number,
      min: 0,
      max: 1,
      default: 0,
    },
    mappingRationale: {
      type: String,
      default: '',
      maxlength: 1000,
    },
    // ─── WFCOMP (REQ-WFCOMP-001.1 / THE-352) ───
    // criticality: Art.-30-Klasse. NICHT priority überladen — BEDINGT (lit. e)
    // hat keine saubere must/should/may-Entsprechung.
    criticality: {
      type: String,
      enum: ['HART', 'BEDINGT', 'WEICH'],
      required: false,
    },
    // traceTarget: maschinenlesbarer Pfad für den Trace-Check (THE-355). Mixed,
    // weil verschachtelt + quell-getrieben; Validierung erfolgt im Trace-Check.
    traceTarget: {
      type: Schema.Types.Mixed,
      required: false,
    },
  },
  { timestamps: true },
);

// Unique compound index: same regulation cannot have two requirements with same title
// (Upsert-Dedup für Re-Run-Idempotenz)
complianceRequirementSchema.index(
  { projectId: 1, regulationId: 1, title: 1 },
  { unique: true, name: 'unique_requirement_per_regulation' },
);

// Query indexes for Dashboard-Filter (status + priority)
complianceRequirementSchema.index(
  { projectId: 1, status: 1, priority: 1 },
  { name: 'by_status_priority_for_dashboard' },
);

// Query: alle Requirements einer Regulation
complianceRequirementSchema.index(
  { projectId: 1, regulationId: 1 },
  { name: 'by_regulation' },
);

// Multikey index for reverse-lookup (which requirements affect element X)
complianceRequirementSchema.index(
  { projectId: 1, linkedElementIds: 1 },
  { name: 'by_element_for_reverse_lookup' },
);

// THE-390 P3: alle Requirements einer Norm (kanonischer Zweit-Schlüssel; sparse,
// weil Bestands-Requirements kein normId tragen).
complianceRequirementSchema.index(
  { projectId: 1, normId: 1 },
  { sparse: true, name: 'by_norm' },
);

export const ComplianceRequirement = mongoose.model<IComplianceRequirement>(
  'ComplianceRequirement',
  complianceRequirementSchema,
);
