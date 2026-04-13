import mongoose, { Schema, Document } from 'mongoose';
import { encryptCredentials, decryptCredentials } from './Connection';

export interface IConnectorConfig extends Document {
  projectId: string;
  type: string;
  name: string;
  baseUrl: string;
  authMethod: string;
  credentials: string; // encrypted blob
  mappingRules: any[];
  syncIntervalMinutes: number;
  filters: Record<string, any>;
  enabled: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const connectorConfigSchema = new Schema<IConnectorConfig>(
  {
    projectId: { type: String, required: true, index: true },
    type: { type: String, required: true },
    name: { type: String, required: true, trim: true },
    baseUrl: { type: String, required: true },
    authMethod: { type: String, required: true, default: 'api_key' },
    credentials: { type: String, default: '' },
    mappingRules: [{ type: Schema.Types.Mixed }],
    syncIntervalMinutes: { type: Number, default: 0 },
    filters: { type: Schema.Types.Mixed, default: {} },
    enabled: { type: Boolean, default: true },
  },
  { timestamps: true },
);

connectorConfigSchema.index({ projectId: 1, name: 1 }, { unique: true });

export const ConnectorConfigModel = mongoose.model<IConnectorConfig>('ConnectorConfig', connectorConfigSchema);

/** Store credentials encrypted, return plain config for connector use. */
export function toConnectorConfig(doc: IConnectorConfig): any {
  return {
    type: doc.type,
    name: doc.name,
    baseUrl: doc.baseUrl,
    authMethod: doc.authMethod,
    credentials: decryptCredentials(doc.credentials),
    projectId: doc.projectId,
    mappingRules: doc.mappingRules || [],
    syncIntervalMinutes: doc.syncIntervalMinutes || 0,
    filters: (doc.filters || {}) as Record<string, string>,
    enabled: doc.enabled,
  };
}

export { encryptCredentials };
