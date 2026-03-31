import mongoose, { Schema, Document } from 'mongoose';

export interface IHealthReport extends Document {
  reportId: string;
  uploadToken: string;
  tempProjectId: string;
  permanentProjectId?: string;
  healthScore: {
    total: number;
    trend: string;
    trendDelta: number;
    factors: Array<{ factor: string; weight: number; score: number; description: string }>;
  };
  insights: Array<{
    category: string;
    severity: string;
    title: string;
    description: string;
    affectedCount: number;
  }>;
  totalElements: number;
  scanDurationMs: number;
  elementStats: {
    byLayer: Record<string, number>;
    byStatus: Record<string, number>;
    byType: Record<string, number>;
  };
  expiresAt: Date;
  createdAt: Date;
}

const healthReportSchema = new Schema<IHealthReport>({
  reportId: { type: String, required: true, unique: true, index: true },
  uploadToken: { type: String, required: true, index: true },
  tempProjectId: { type: String, required: true },
  permanentProjectId: { type: String },
  healthScore: {
    total: { type: Number, required: true },
    trend: { type: String, default: 'stable' },
    trendDelta: { type: Number, default: 0 },
    factors: [{ factor: String, weight: Number, score: Number, description: String }],
  },
  insights: [{
    category: String,
    severity: String,
    title: String,
    description: String,
    affectedCount: Number,
  }],
  totalElements: { type: Number, required: true },
  scanDurationMs: { type: Number },
  elementStats: {
    byLayer: { type: Schema.Types.Mixed, default: {} },
    byStatus: { type: Schema.Types.Mixed, default: {} },
    byType: { type: Schema.Types.Mixed, default: {} },
  },
  expiresAt: { type: Date, required: true, index: { expireAfterSeconds: 0 } },
  createdAt: { type: Date, default: Date.now },
});

export const HealthReport = mongoose.model<IHealthReport>('HealthReport', healthReportSchema);
