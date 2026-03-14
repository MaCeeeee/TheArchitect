import mongoose, { Schema, Document } from 'mongoose';

export interface IApiKey extends Document {
  userId: mongoose.Types.ObjectId;
  name: string;
  keyHash: string;
  prefix: string;
  permissions: string[];
  lastUsedAt: Date | null;
  expiresAt: Date | null;
  createdAt: Date;
}

const apiKeySchema = new Schema<IApiKey>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    name: { type: String, required: true, trim: true },
    keyHash: { type: String, required: true },
    prefix: { type: String, required: true },
    permissions: [{ type: String }],
    lastUsedAt: { type: Date, default: null },
    expiresAt: { type: Date, default: null },
  },
  { timestamps: true }
);

export const ApiKey = mongoose.model<IApiKey>('ApiKey', apiKeySchema);
