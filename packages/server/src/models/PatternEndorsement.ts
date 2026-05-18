import { Schema, model, Document, Types } from 'mongoose';

export interface PatternEndorsementDoc extends Document {
  patternId: Types.ObjectId;
  userId: Types.ObjectId;
  reason: string;
  timestamp: Date;
}

const PatternEndorsementSchema = new Schema<PatternEndorsementDoc>(
  {
    patternId: {
      type: Schema.Types.ObjectId,
      ref: 'DecisionPattern',
      required: true,
      index: true,
    },
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    reason: {
      type: String,
      required: true,
      minlength: 30,
      maxlength: 500,
    },
    timestamp: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: false }
);

// Each user can only endorse a given pattern once
PatternEndorsementSchema.index({ patternId: 1, userId: 1 }, { unique: true });

export const PatternEndorsementModel = model<PatternEndorsementDoc>(
  'PatternEndorsement',
  PatternEndorsementSchema
);
