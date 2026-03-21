import mongoose, { Schema, Document } from 'mongoose';
import type { AgentPersona } from '@thearchitect/shared/src/types/simulation.types';

export interface ICustomPersona extends Document {
  scope: 'project' | 'user';
  basedOnPresetId: string;
  projectId?: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  name: string;
  stakeholderType: string;
  visibleLayers: string[];
  visibleDomains: string[];
  maxGraphDepth: number;
  budgetConstraint?: number;
  riskThreshold?: string;
  expectedCapacity: number;
  roundToMonthFactor?: number;
  priorities: string[];
  systemPromptSuffix: string;
  description?: string;
  createdAt: Date;
  updatedAt: Date;
}

const CustomPersonaSchema = new Schema<ICustomPersona>(
  {
    scope: {
      type: String,
      enum: ['project', 'user'],
      required: true,
    },
    basedOnPresetId: { type: String, required: true },
    projectId: { type: Schema.Types.ObjectId, ref: 'Project' },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    name: { type: String, required: true, maxlength: 100 },
    stakeholderType: {
      type: String,
      enum: ['c_level', 'business_unit', 'it_ops', 'data_team', 'external'],
      required: true,
    },
    visibleLayers: [{ type: String }],
    visibleDomains: [{ type: String }],
    maxGraphDepth: { type: Number, default: 5, min: 1, max: 10 },
    budgetConstraint: { type: Number },
    riskThreshold: {
      type: String,
      enum: ['low', 'medium', 'high', 'critical'],
    },
    expectedCapacity: { type: Number, required: true, min: 1, max: 20 },
    roundToMonthFactor: { type: Number, min: 0.5, max: 6 },
    priorities: [{ type: String }],
    systemPromptSuffix: { type: String, default: '' },
    description: { type: String, maxlength: 500 },
  },
  {
    timestamps: true,
  },
);

CustomPersonaSchema.index({ userId: 1, scope: 1 });
CustomPersonaSchema.index({ projectId: 1, scope: 1 });

/**
 * Convert a CustomPersona document to an AgentPersona for use in simulations.
 * Uses `custom_<_id>` as the id to avoid collision with preset persona IDs.
 */
export function toAgentPersona(doc: ICustomPersona | Record<string, unknown>): AgentPersona {
  const d = doc as Record<string, unknown>;
  return {
    id: `custom_${d._id}`,
    name: d.name as string,
    stakeholderType: d.stakeholderType as AgentPersona['stakeholderType'],
    visibleLayers: d.visibleLayers as AgentPersona['visibleLayers'],
    visibleDomains: d.visibleDomains as AgentPersona['visibleDomains'],
    maxGraphDepth: (d.maxGraphDepth as number) || 5,
    budgetConstraint: d.budgetConstraint as number | undefined,
    riskThreshold: d.riskThreshold as AgentPersona['riskThreshold'],
    expectedCapacity: (d.expectedCapacity as number) || 5,
    roundToMonthFactor: d.roundToMonthFactor as number | undefined,
    priorities: d.priorities as string[],
    systemPromptSuffix: (d.systemPromptSuffix as string) || '',
  };
}

export const CustomPersona = mongoose.model<ICustomPersona>('CustomPersona', CustomPersonaSchema);
