import mongoose, { Schema, Document } from 'mongoose';

export interface ColumnMapping {
  sourceColumn: string;
  targetField: string;         // e.g. 'name', 'type', 'layer', 'description', 'status', 'riskLevel'
  transformRule?: string;       // optional: 'lowercase', 'uppercase', 'trim', 'map:key=value,...'
}

export interface IImportProfile extends Document {
  projectId: string;
  userId: string;
  name: string;
  description: string;
  sourceFormat: string;         // 'csv' | 'excel' | 'leanix' | 'archimate-xml' | 'json'
  columnMappings: ColumnMapping[];
  defaultValues: Record<string, string>;  // e.g. { status: 'current', riskLevel: 'low' }
  skipRows: number;             // number of header rows to skip (beyond first)
  sheetName?: string;           // for Excel: which sheet to use
  isDefault: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const columnMappingSchema = new Schema<ColumnMapping>({
  sourceColumn: { type: String, required: true },
  targetField: { type: String, required: true },
  transformRule: { type: String },
}, { _id: false });

const importProfileSchema = new Schema<IImportProfile>({
  projectId: { type: String, required: true, index: true },
  userId: { type: String, required: true },
  name: { type: String, required: true },
  description: { type: String, default: '' },
  sourceFormat: { type: String, required: true },
  columnMappings: [columnMappingSchema],
  defaultValues: { type: Schema.Types.Mixed, default: {} },
  skipRows: { type: Number, default: 0 },
  sheetName: { type: String },
  isDefault: { type: Boolean, default: false },
}, { timestamps: true });

// Compound index: one default profile per project+format
importProfileSchema.index({ projectId: 1, sourceFormat: 1 });

export const ImportProfile = mongoose.model<IImportProfile>('ImportProfile', importProfileSchema);
