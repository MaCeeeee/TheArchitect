import { Schema, model, Document, Types } from 'mongoose';

export interface DecisionPatternDoc extends Document {
  slug: string;
  name: string;
  description: string;
  category: 'integration' | 'data' | 'security' | 'observability' | 'compute' | 'messaging';
  decisionContext: string;
  complianceScore: {
    togaf?: number;
    dora?: number;
    nis2?: number;
  };
  costRange: '€' | '€€' | '€€€';
  riskLevel: 'low' | 'medium' | 'high';
  lifecycleStatus: 'approved' | 'conditional' | 'investigate' | 'retiring' | 'unapproved';
  whyThis: string;
  detectorRefs: string[];
  tags: string[];
  version: string;
  deprecatedAt: Date | null;
  successorId: Types.ObjectId | null;
  createdAt: Date;
  updatedAt: Date;
}

const DecisionPatternSchema = new Schema<DecisionPatternDoc>(
  {
    slug: { type: String, required: true, unique: true, index: true },
    name: { type: String, required: true },
    description: { type: String, required: true },
    category: {
      type: String,
      enum: ['integration', 'data', 'security', 'observability', 'compute', 'messaging'],
      required: true,
      index: true,
    },
    decisionContext: { type: String, required: true },
    complianceScore: {
      togaf: { type: Number, min: 0, max: 100 },
      dora: { type: Number, min: 0, max: 100 },
      nis2: { type: Number, min: 0, max: 100 },
    },
    costRange: { type: String, enum: ['€', '€€', '€€€'], required: true },
    riskLevel: { type: String, enum: ['low', 'medium', 'high'], required: true },
    lifecycleStatus: {
      type: String,
      enum: ['approved', 'conditional', 'investigate', 'retiring', 'unapproved'],
      required: true,
      index: true,
    },
    whyThis: { type: String, required: true },
    detectorRefs: { type: [String], default: [] },
    tags: { type: [String], default: [] },
    version: { type: String, default: '1.0.0' },
    deprecatedAt: { type: Date, default: null },
    successorId: { type: Schema.Types.ObjectId, ref: 'DecisionPattern', default: null },
  },
  { timestamps: true }
);

export const DecisionPatternModel = model<DecisionPatternDoc>(
  'DecisionPattern',
  DecisionPatternSchema
);
