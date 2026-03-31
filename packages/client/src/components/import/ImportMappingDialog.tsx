import { useState, useCallback, useEffect } from 'react';
import {
  X, Upload, ArrowRight, Check, Loader2, AlertTriangle,
  FileSpreadsheet, ChevronDown, Save, Trash2, Zap,
} from 'lucide-react';
import api from '../../services/api';

interface ColumnMapping {
  sourceColumn: string;
  targetField: string;
  confidence: number;
}

interface PreviewData {
  format: string;
  filename: string;
  totalElements: number;
  totalConnections: number;
  warnings: string[];
  detectedColumns: string[];
  suggestedMappings: ColumnMapping[];
  previewElements: Array<Record<string, unknown>>;
  previewConnections: Array<Record<string, unknown>>;
}

interface ImportResult {
  uploadToken: string;
  tempProjectId: string;
  targetProjectId: string;
  elementCount: number;
  connectionCount: number;
  warnings: string[];
  format: string;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  projectId: string;
  onImportComplete: (result: ImportResult) => void;
}

const TARGET_FIELDS = [
  { value: '', label: '— Skip —' },
  { value: 'name', label: 'Name', required: true },
  { value: 'type', label: 'Type' },
  { value: 'layer', label: 'Layer' },
  { value: 'description', label: 'Description' },
  { value: 'status', label: 'Status' },
  { value: 'riskLevel', label: 'Risk Level' },
  { value: 'maturityLevel', label: 'Maturity Level' },
  { value: 'lifecyclePhase', label: 'Lifecycle Phase' },
  { value: 'businessOwner', label: 'Business Owner' },
  { value: 'technicalOwner', label: 'Technical Owner' },
  { value: 'annualCost', label: 'Annual Cost' },
  { value: 'userCount', label: 'User Count' },
  { value: 'goLiveDate', label: 'Go-Live Date' },
  { value: 'endOfLifeDate', label: 'End of Life Date' },
];

const STATUS_OPTIONS = ['current', 'target', 'transitional', 'retired'];
const RISK_OPTIONS = ['low', 'medium', 'high', 'critical'];

type Step = 'upload' | 'mapping' | 'preview' | 'importing' | 'done';

export default function ImportMappingDialog({ isOpen, onClose, projectId, onImportComplete }: Props) {
  const [step, setStep] = useState<Step>('upload');
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<PreviewData | null>(null);
  const [mappings, setMappings] = useState<ColumnMapping[]>([]);
  const [defaults, setDefaults] = useState<Record<string, string>>({ status: 'current', riskLevel: 'low' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);

  // Reset on open
  useEffect(() => {
    if (isOpen) {
      setStep('upload');
      setFile(null);
      setPreview(null);
      setMappings([]);
      setDefaults({ status: 'current', riskLevel: 'low' });
      setError(null);
      setResult(null);
    }
  }, [isOpen]);

  const handleFileSelect = useCallback((selectedFile: File) => {
    setFile(selectedFile);
    setError(null);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const droppedFile = e.dataTransfer.files[0];
    if (droppedFile) handleFileSelect(droppedFile);
  }, [handleFileSelect]);

  // Step 1 → 2: Upload and preview
  const handlePreview = async () => {
    if (!file) return;
    setLoading(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const { data } = await api.post(`/projects/${projectId}/import/preview`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setPreview(data.data);
      setMappings(data.data.suggestedMappings || []);
      setStep('mapping');
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to parse file');
    } finally {
      setLoading(false);
    }
  };

  // Update a mapping
  const updateMapping = (sourceColumn: string, targetField: string) => {
    setMappings(prev => {
      const existing = prev.find(m => m.sourceColumn === sourceColumn);
      if (existing) {
        if (!targetField) return prev.filter(m => m.sourceColumn !== sourceColumn);
        return prev.map(m => m.sourceColumn === sourceColumn ? { ...m, targetField, confidence: 1 } : m);
      }
      if (!targetField) return prev;
      return [...prev, { sourceColumn, targetField, confidence: 1 }];
    });
  };

  // Step 2 → 3: Show preview
  const handleShowPreview = () => setStep('preview');

  // Step 3 → Execute import
  const handleExecute = async () => {
    if (!file) return;
    setStep('importing');
    setError(null);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('mappings', JSON.stringify(mappings));
      formData.append('defaults', JSON.stringify(defaults));
      const { data } = await api.post(`/projects/${projectId}/import/execute`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setResult(data.data);
      setStep('done');
      onImportComplete(data.data);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Import failed');
      setStep('preview');
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="w-full max-w-3xl max-h-[85vh] flex flex-col rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-raised)] shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[var(--border-subtle)] px-6 py-4">
          <div className="flex items-center gap-3">
            <FileSpreadsheet size={20} className="text-[#00ff41]" />
            <div>
              <h2 className="text-sm font-semibold text-white">Import Architecture Data</h2>
              <p className="text-[10px] text-[var(--text-tertiary)]">
                {step === 'upload' && 'Upload CSV, Excel, ArchiMate XML, LeanIX, or JSON'}
                {step === 'mapping' && 'Map columns to architecture fields'}
                {step === 'preview' && 'Review data before importing'}
                {step === 'importing' && 'Importing data...'}
                {step === 'done' && 'Import complete'}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="rounded p-1 text-[var(--text-secondary)] hover:text-white transition">
            <X size={18} />
          </button>
        </div>

        {/* Steps indicator */}
        <div className="flex items-center gap-1 px-6 py-2 border-b border-[var(--border-subtle)] bg-[var(--surface-base)]">
          {['upload', 'mapping', 'preview', 'done'].map((s, i) => (
            <div key={s} className="flex items-center gap-1">
              <div className={`h-5 w-5 rounded-full flex items-center justify-center text-[9px] font-bold ${
                step === s ? 'bg-[#00ff41] text-black' :
                ['upload', 'mapping', 'preview', 'done'].indexOf(step) > i ? 'bg-[#00ff41]/20 text-[#00ff41]' :
                'bg-[var(--surface-raised)] text-[var(--text-disabled)]'
              }`}>
                {['upload', 'mapping', 'preview', 'done'].indexOf(step) > i ? <Check size={10} /> : i + 1}
              </div>
              <span className="text-[10px] text-[var(--text-tertiary)] capitalize">{s}</span>
              {i < 3 && <ArrowRight size={10} className="text-[var(--text-disabled)] mx-1" />}
            </div>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {error && (
            <div className="mb-4 rounded-lg bg-red-500/10 border border-red-500/20 p-3 flex items-start gap-2">
              <AlertTriangle size={14} className="text-red-400 mt-0.5 flex-shrink-0" />
              <p className="text-xs text-red-300">{error}</p>
            </div>
          )}

          {/* Step 1: Upload */}
          {step === 'upload' && (
            <div
              onDrop={handleDrop}
              onDragOver={(e) => e.preventDefault()}
              className="border-2 border-dashed border-[var(--border-subtle)] rounded-xl p-12 text-center hover:border-[#00ff41]/30 transition cursor-pointer"
              onClick={() => document.getElementById('import-file-input')?.click()}
            >
              <Upload size={32} className="mx-auto text-[var(--text-tertiary)] mb-3" />
              <p className="text-sm text-white font-medium">
                {file ? file.name : 'Drop file here or click to browse'}
              </p>
              <p className="text-[10px] text-[var(--text-tertiary)] mt-1">
                CSV, Excel (.xlsx), ArchiMate XML (.xml/.archimate), LeanIX export, JSON
              </p>
              {file && (
                <p className="text-[10px] text-[#00ff41] mt-2">
                  {(file.size / 1024).toFixed(0)} KB — Ready to preview
                </p>
              )}
              <input
                id="import-file-input"
                type="file"
                accept=".csv,.xlsx,.xls,.xml,.archimate,.json"
                className="hidden"
                onChange={(e) => e.target.files?.[0] && handleFileSelect(e.target.files[0])}
              />
            </div>
          )}

          {/* Step 2: Column Mapping */}
          {step === 'mapping' && preview && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-white font-medium">
                    Detected format: <span className="text-[#00ff41]">{preview.format}</span>
                  </p>
                  <p className="text-[10px] text-[var(--text-tertiary)]">
                    {preview.totalElements} elements, {preview.totalConnections} connections
                  </p>
                </div>
                <button
                  onClick={() => setMappings(preview.suggestedMappings)}
                  className="flex items-center gap-1 rounded px-2 py-1 text-[10px] text-[#00ff41] hover:bg-[#00ff41]/10 transition"
                >
                  <Zap size={10} /> Auto-detect
                </button>
              </div>

              {/* Column mapping table */}
              <div className="rounded-lg border border-[var(--border-subtle)] overflow-hidden">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-[var(--surface-base)]">
                      <th className="px-3 py-2 text-left text-[var(--text-tertiary)] font-medium">Source Column</th>
                      <th className="px-3 py-2 text-center text-[var(--text-tertiary)]"><ArrowRight size={12} /></th>
                      <th className="px-3 py-2 text-left text-[var(--text-tertiary)] font-medium">Target Field</th>
                      <th className="px-3 py-2 text-left text-[var(--text-tertiary)] font-medium">Confidence</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.detectedColumns.map((col) => {
                      const mapping = mappings.find(m => m.sourceColumn === col);
                      return (
                        <tr key={col} className="border-t border-[var(--border-subtle)]/50">
                          <td className="px-3 py-2 text-white font-mono">{col}</td>
                          <td className="px-3 py-2 text-center text-[var(--text-disabled)]"><ArrowRight size={10} /></td>
                          <td className="px-3 py-2">
                            <select
                              value={mapping?.targetField || ''}
                              onChange={(e) => updateMapping(col, e.target.value)}
                              className="w-full rounded bg-[var(--surface-base)] border border-[var(--border-subtle)] px-2 py-1 text-xs text-white outline-none"
                            >
                              {TARGET_FIELDS.map(f => (
                                <option key={f.value} value={f.value}>{f.label}</option>
                              ))}
                            </select>
                          </td>
                          <td className="px-3 py-2">
                            {mapping && (
                              <span className={`text-[10px] ${mapping.confidence >= 0.9 ? 'text-green-400' : mapping.confidence >= 0.7 ? 'text-amber-400' : 'text-[var(--text-tertiary)]'}`}>
                                {Math.round(mapping.confidence * 100)}%
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Default values */}
              <div className="space-y-2">
                <p className="text-[10px] font-medium text-[var(--text-tertiary)] uppercase tracking-wider">Default Values</p>
                <div className="flex gap-3">
                  <label className="flex items-center gap-2 text-xs text-[var(--text-secondary)]">
                    Status:
                    <select
                      value={defaults.status}
                      onChange={(e) => setDefaults(d => ({ ...d, status: e.target.value }))}
                      className="rounded bg-[var(--surface-base)] border border-[var(--border-subtle)] px-2 py-1 text-xs text-white outline-none"
                    >
                      {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </label>
                  <label className="flex items-center gap-2 text-xs text-[var(--text-secondary)]">
                    Risk:
                    <select
                      value={defaults.riskLevel}
                      onChange={(e) => setDefaults(d => ({ ...d, riskLevel: e.target.value }))}
                      className="rounded bg-[var(--surface-base)] border border-[var(--border-subtle)] px-2 py-1 text-xs text-white outline-none"
                    >
                      {RISK_OPTIONS.map(r => <option key={r} value={r}>{r}</option>)}
                    </select>
                  </label>
                </div>
              </div>

              {/* Warnings */}
              {preview.warnings.length > 0 && (
                <div className="rounded-lg bg-amber-500/10 border border-amber-500/20 p-3">
                  <p className="text-[10px] font-medium text-amber-400 mb-1">{preview.warnings.length} Warning(s)</p>
                  <div className="max-h-20 overflow-y-auto space-y-0.5">
                    {preview.warnings.slice(0, 10).map((w, i) => (
                      <p key={i} className="text-[10px] text-amber-300/80">{w}</p>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Step 3: Preview */}
          {step === 'preview' && preview && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-xs text-white font-medium">
                  Preview: {preview.totalElements} elements, {preview.totalConnections} connections
                </p>
                <p className="text-[10px] text-[var(--text-tertiary)]">Showing first 20 elements</p>
              </div>

              <div className="rounded-lg border border-[var(--border-subtle)] overflow-hidden max-h-64 overflow-y-auto">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-[var(--surface-base)]">
                    <tr>
                      <th className="px-3 py-2 text-left text-[var(--text-tertiary)] font-medium">Name</th>
                      <th className="px-3 py-2 text-left text-[var(--text-tertiary)] font-medium">Type</th>
                      <th className="px-3 py-2 text-left text-[var(--text-tertiary)] font-medium">Layer</th>
                      <th className="px-3 py-2 text-left text-[var(--text-tertiary)] font-medium">Status</th>
                      <th className="px-3 py-2 text-left text-[var(--text-tertiary)] font-medium">Risk</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.previewElements.map((el, i) => (
                      <tr key={i} className="border-t border-[var(--border-subtle)]/50">
                        <td className="px-3 py-1.5 text-white truncate max-w-[180px]">{String(el.name)}</td>
                        <td className="px-3 py-1.5 text-[var(--text-secondary)]">{String(el.type)}</td>
                        <td className="px-3 py-1.5 text-[var(--text-secondary)]">{String(el.layer)}</td>
                        <td className="px-3 py-1.5 text-[var(--text-secondary)]">{String(el.status)}</td>
                        <td className="px-3 py-1.5 text-[var(--text-secondary)]">{String(el.riskLevel)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Step 4: Importing */}
          {step === 'importing' && (
            <div className="flex flex-col items-center justify-center py-12">
              <Loader2 size={32} className="animate-spin text-[#00ff41] mb-3" />
              <p className="text-sm text-white">Importing data...</p>
              <p className="text-[10px] text-[var(--text-tertiary)] mt-1">Creating elements and connections in Neo4j</p>
            </div>
          )}

          {/* Step 5: Done */}
          {step === 'done' && result && (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <div className="h-12 w-12 rounded-full bg-[#00ff41]/10 flex items-center justify-center mb-4">
                <Check size={24} className="text-[#00ff41]" />
              </div>
              <h3 className="text-sm font-semibold text-white mb-1">Import Successful</h3>
              <p className="text-xs text-[var(--text-secondary)]">
                {result.elementCount} elements and {result.connectionCount} connections imported
              </p>
              <p className="text-[10px] text-[var(--text-tertiary)] mt-1">Format: {result.format}</p>
              {result.warnings.length > 0 && (
                <p className="text-[10px] text-amber-400 mt-2">{result.warnings.length} warning(s) during import</p>
              )}
            </div>
          )}
        </div>

        {/* Footer actions */}
        <div className="flex items-center justify-between border-t border-[var(--border-subtle)] px-6 py-3 bg-[var(--surface-base)]">
          <button
            onClick={step === 'upload' ? onClose : () => setStep(step === 'preview' ? 'mapping' : step === 'mapping' ? 'upload' : 'upload')}
            className="rounded-md px-4 py-2 text-xs text-[var(--text-secondary)] hover:text-white transition"
            disabled={step === 'importing'}
          >
            {step === 'upload' ? 'Cancel' : 'Back'}
          </button>

          <div className="flex gap-2">
            {step === 'upload' && (
              <button
                onClick={handlePreview}
                disabled={!file || loading}
                className="flex items-center gap-1.5 rounded-md bg-[#00ff41] px-4 py-2 text-xs font-medium text-black hover:bg-[#00cc33] transition disabled:opacity-50"
              >
                {loading ? <Loader2 size={14} className="animate-spin" /> : <ArrowRight size={14} />}
                Preview
              </button>
            )}
            {step === 'mapping' && (
              <button
                onClick={handleShowPreview}
                className="flex items-center gap-1.5 rounded-md bg-[#00ff41] px-4 py-2 text-xs font-medium text-black hover:bg-[#00cc33] transition"
              >
                <ArrowRight size={14} /> Review
              </button>
            )}
            {step === 'preview' && (
              <button
                onClick={handleExecute}
                className="flex items-center gap-1.5 rounded-md bg-[#00ff41] px-4 py-2 text-xs font-medium text-black hover:bg-[#00cc33] transition"
              >
                <Upload size={14} /> Import
              </button>
            )}
            {step === 'done' && (
              <button
                onClick={onClose}
                className="flex items-center gap-1.5 rounded-md bg-[#00ff41] px-4 py-2 text-xs font-medium text-black hover:bg-[#00cc33] transition"
              >
                <Check size={14} /> Done
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
