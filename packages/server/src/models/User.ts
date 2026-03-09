import mongoose, { Schema, Document } from 'mongoose';

export interface IOAuthProvider {
  provider: 'google' | 'github' | 'microsoft';
  providerId: string;
  email: string;
  linkedAt: Date;
}

export interface IUser extends Document {
  email: string;
  passwordHash?: string;
  name: string;
  role: 'chief_architect' | 'enterprise_architect' | 'data_architect' | 'business_architect' | 'viewer';
  permissions: string[];
  mfaEnabled: boolean;
  mfaSecret?: string;
  oauthProviders: IOAuthProvider[];
  preferences: {
    theme: string;
    language: string;
    timezone: string;
  };
  createdAt: Date;
  updatedAt: Date;
}

const userSchema = new Schema<IUser>(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String },
    name: { type: String, required: true, trim: true },
    role: {
      type: String,
      enum: ['chief_architect', 'enterprise_architect', 'data_architect', 'business_architect', 'viewer'],
      default: 'viewer',
    },
    permissions: [{ type: String }],
    mfaEnabled: { type: Boolean, default: false },
    mfaSecret: { type: String },
    oauthProviders: [
      {
        provider: { type: String, enum: ['google', 'github', 'microsoft'], required: true },
        providerId: { type: String, required: true },
        email: { type: String },
        linkedAt: { type: Date, default: Date.now },
      },
    ],
    preferences: {
      theme: { type: String, default: 'dark' },
      language: { type: String, default: 'de' },
      timezone: { type: String, default: 'Europe/Berlin' },
    },
  },
  { timestamps: true }
);

export const User = mongoose.model<IUser>('User', userSchema);
