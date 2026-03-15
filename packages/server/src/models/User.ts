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
  bio: string;
  avatarUrl: string;
  role: 'chief_architect' | 'enterprise_architect' | 'data_architect' | 'business_architect' | 'viewer';
  permissions: string[];
  mfaEnabled: boolean;
  mfaSecret?: string;
  oauthProviders: IOAuthProvider[];
  preferences: {
    theme: string;
    language: string;
    timezone: string;
    notifications: {
      emailOnApproval: boolean;
      emailOnMention: boolean;
      emailOnProjectUpdate: boolean;
      inAppOnApproval: boolean;
      inAppOnMention: boolean;
      inAppOnProjectUpdate: boolean;
    };
    accessibility: {
      fontSize: string;
      reduceMotion: boolean;
      highContrast: boolean;
    };
  };
  createdAt: Date;
  updatedAt: Date;
}

const userSchema = new Schema<IUser>(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String },
    name: { type: String, required: true, trim: true },
    bio: { type: String, default: '' },
    avatarUrl: { type: String, default: '' },
    role: {
      type: String,
      enum: ['chief_architect', 'enterprise_architect', 'solution_architect', 'data_architect', 'business_architect', 'analyst', 'viewer'],
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
      notifications: {
        emailOnApproval: { type: Boolean, default: true },
        emailOnMention: { type: Boolean, default: true },
        emailOnProjectUpdate: { type: Boolean, default: false },
        inAppOnApproval: { type: Boolean, default: true },
        inAppOnMention: { type: Boolean, default: true },
        inAppOnProjectUpdate: { type: Boolean, default: true },
      },
      accessibility: {
        fontSize: { type: String, default: 'medium' },
        reduceMotion: { type: Boolean, default: false },
        highContrast: { type: Boolean, default: false },
      },
    },
  },
  { timestamps: true }
);

export const User = mongoose.model<IUser>('User', userSchema);
