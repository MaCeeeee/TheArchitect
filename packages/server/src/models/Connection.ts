import mongoose, { Schema, Document } from 'mongoose';
import crypto from 'crypto';

const ENCRYPTION_KEY = process.env.CREDENTIAL_ENCRYPTION_KEY
  || '0'.repeat(64); // dev fallback — 32 bytes hex

if (!process.env.CREDENTIAL_ENCRYPTION_KEY) {
  console.warn('[Connection] CREDENTIAL_ENCRYPTION_KEY not set — using insecure dev key');
}

export interface IConnection extends Document {
  userId: mongoose.Types.ObjectId;
  name: string;
  type: string;
  baseUrl: string;
  authMethod: string;
  credentials: string; // encrypted blob
  lastTestedAt?: Date;
  lastTestResult?: { success: boolean; message: string };
  createdAt: Date;
  updatedAt: Date;
}

const connectionSchema = new Schema<IConnection>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    name: { type: String, required: true, trim: true },
    type: { type: String, required: true, enum: ['jira', 'github', 'gitlab', 'confluence', 'servicenow', 'azure_devops'] },
    baseUrl: { type: String, required: true },
    authMethod: { type: String, required: true, enum: ['api_key', 'oauth2', 'personal_token', 'basic'] },
    credentials: { type: String, default: '' },
    lastTestedAt: { type: Date },
    lastTestResult: { type: Schema.Types.Mixed },
  },
  { timestamps: true },
);

connectionSchema.index({ userId: 1, name: 1 }, { unique: true });

export const Connection = mongoose.model<IConnection>('Connection', connectionSchema);

// ─── Credential Encryption ───

export function encryptCredentials(plain: Record<string, string>): string {
  const key = Buffer.from(ENCRYPTION_KEY, 'hex');
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const json = JSON.stringify(plain);
  const encrypted = Buffer.concat([cipher.update(json, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted.toString('hex')}`;
}

export function decryptCredentials(blob: string): Record<string, string> {
  if (!blob) return {};
  try {
    const [ivHex, authTagHex, encryptedHex] = blob.split(':');
    const key = Buffer.from(ENCRYPTION_KEY, 'hex');
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(ivHex, 'hex'));
    decipher.setAuthTag(Buffer.from(authTagHex, 'hex'));
    const decrypted = Buffer.concat([decipher.update(Buffer.from(encryptedHex, 'hex')), decipher.final()]);
    return JSON.parse(decrypted.toString('utf8'));
  } catch {
    return {};
  }
}
