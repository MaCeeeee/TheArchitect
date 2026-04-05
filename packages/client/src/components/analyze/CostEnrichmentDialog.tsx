import { useState, useCallback, useMemo } from 'react';
import {
  X, Upload, FileSpreadsheet, Plug, ArrowRight, CheckCircle2, AlertTriangle,
  Loader2, ChevronDown, ChevronRight, Zap,
} from 'lucide-react';
import { enrichmentAPI, integrationAPI, architectureAPI } from '../../services/api';
import { useArchitectureStore } from '../../stores/architectureStore';
import type {
  EnrichmentPreview, EnrichmentMatch, ConflictStrategy, CostFields,
} from '@thearchitect/shared';
import { COST_FIELD_LABELS } from '@thearchitect/shared';

type Step = 'source' | 'upload' | 'connector' | 'preview' | 'applying' | 'done';

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

export default function CostEnrichmentDialog({ isOpen, onClose }: Props) {
  const projectId = useArchitectureStore((s) => s.projectId);
  const setElements = useArchitectureStore((s) => s.setElements);

  const [step, setStep] = useState<Step>('source');
  const [preview, setPreview] = useState<EnrichmentPreview | null>(null);
  const [conflictStrategy, setConflictStrategy] = useState<ConflictStrategy>('overwrite');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ updated: number; skipped: number; errors: string[] } | null>(null);

  // CSV state
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [matchColumn, setMatchColumn] = useState('');
  const [csvHeaders, setCsvHeaders] = useState<string[]>([]);
  const [csvRows, setCsvRows] = useState<Record<string, string>[]>([]);

  // Connector state
  const [connections, setConnections] = useState<Array<{ id: string; name: string; type: string }>>([]);
  const [selectedConnectionId, setSelectedConnectionId] = useState('');

  const reset = useCallback(() => {
    setStep('source');
    setPreview(null);
    setSelectedIds(new Set());
    setExpandedIds(new Set());
    setError('');
    setResult(null);
    setCsvFile(null);
    setMatchColumn('');
    setCsvHeaders([]);
    setCsvRows([]);
  }, []);

  const handleClose = () => { reset(); onClose(); };

  // ─── CSV Parsing ───

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setCsvFile(file);
    setError('');

    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      const lines = text.split(/\r?\n/).filter(Boolean);
      if (lines.length < 2) { setError('CSV must have a header row and at least one data row'); return; }

      const headers = parseCSVLine(lines[0]);
      setCsvHeaders(headers);
      setMatchColumn(headers[0] || '');

      const rows: Record<string, string>[] = [];
      for (let i = 1; i < lines.length; i++) {
        const values = parseCSVLine(lines[i]);
        const row: Record<string, string> = {};
        headers.forEach((h, idx) => { row[h] = values[idx] || ''; });
        rows.push(row);
      }
      setCsvRows(rows);
    };
    reader.readAsText(file);
  };

  // ─── CSV Column → Cost Field Mapping ───

  const FIELD_ALIASES: Record<string, keyof CostFields> = useMemo(() => ({
    'annualcost': 'annualCost', 'annual_cost': 'annualCost', 'annual cost': 'annualCost', 'cost': 'annualCost',
    'strategy': 'transformationStrategy', 'transformationstrategy': 'transformationStrategy', '7rs': 'transformationStrategy',
    'usercount': 'userCount', 'user_count': 'userCount', 'users': 'userCount', 'employees': 'userCount',
    'recordcount': 'recordCount', 'record_count': 'recordCount', 'records': 'recordCount',
    'ksloc': 'ksloc', 'kloc': 'ksloc', 'loc': 'ksloc',
    'technicalfitness': 'technicalFitness', 'technical_fitness': 'technicalFitness', 'techfitness': 'technicalFitness',
    'functionalfitness': 'functionalFitness', 'functional_fitness': 'functionalFitness', 'businessfit': 'functionalFitness',
    'errorratepercent': 'errorRatePercent', 'error_rate': 'errorRatePercent', 'errorrate': 'errorRatePercent', 'defectrate': 'errorRatePercent',
    'hourlyrate': 'hourlyRate', 'hourly_rate': 'hourlyRate',
    'monthlyinfracost': 'monthlyInfraCost', 'monthly_infra_cost': 'monthlyInfraCost', 'infracost': 'monthlyInfraCost',
    'technicaldebtratio': 'technicalDebtRatio', 'technical_debt_ratio': 'technicalDebtRatio', 'tdr': 'technicalDebtRatio',
    'costestimateoptimistic': 'costEstimateOptimistic', 'optimistic': 'costEstimateOptimistic', 'bestcase': 'costEstimateOptimistic',
    'costestimatemostlikely': 'costEstimateMostLikely', 'mostlikely': 'costEstimateMostLikely',
    'costestimatepessimistic': 'costEstimatePessimistic', 'pessimistic': 'costEstimatePessimistic', 'worstcase': 'costEstimatePessimistic',
    'successprobability': 'successProbability', 'success_probability': 'successProbability',
    'costofdelayperweek': 'costOfDelayPerWeek', 'cost_of_delay': 'costOfDelayPerWeek', 'cod': 'costOfDelayPerWeek',
  }), []);

  const mapRowToFields = useCallback((row: Record<string, string>): Partial<CostFields> => {
    const fields: Record<string, unknown> = {};
    for (const [header, value] of Object.entries(row)) {
      if (!value || header === matchColumn) continue;
      const normalized = header.toLowerCase().replace(/[\s-]+/g, '');
      const fieldKey = FIELD_ALIASES[normalized];
      if (!fieldKey) continue;

      if (fieldKey === 'transformationStrategy') {
        fields[fieldKey] = value.toLowerCase().trim();
      } else {
        const num = parseFloat(value.replace(/[^\d.-]/g, ''));
        if (!isNaN(num)) fields[fieldKey] = num;
      }
    }
    return fields as Partial<CostFields>;
  }, [matchColumn, FIELD_ALIASES]);

  // ─── CSV Preview ───

  const handleCSVPreview = async () => {
    if (!projectId || csvRows.length === 0 || !matchColumn) return;
    setLoading(true);
    setError('');
    try {
      const rows = csvRows.map(row => ({
        matchColumn: row[matchColumn] || '',
        fields: mapRowToFields(row),
      })).filter(r => r.matchColumn && Object.keys(r.fields).length > 0);

      if (rows.length === 0) {
        setError('No cost data columns recognized. Use headers like: annualCost, ksloc, tdr, errorRate, etc.');
        setLoading(false);
        return;
      }

      const { data } = await enrichmentAPI.csvPreview(projectId, rows);
      setPreview(data.data);
      setSelectedIds(new Set(data.data.matches.map((m: EnrichmentMatch) => m.elementId)));
      setStep('preview');
    } catch (err: any) {
      setError(err.response?.data?.error || 'Preview failed');
    }
    setLoading(false);
  };

  // ─── Connector Preview ───

  const handleLoadConnections = async () => {
    if (!projectId) return;
    setLoading(true);
    try {
      const { data } = await integrationAPI.listConnections(projectId);
      const enrichable = (data.data || []).filter((c: any) => c.type === 'sonarqube');
      setConnections(enrichable);
      if (enrichable.length > 0) setSelectedConnectionId(enrichable[0].id);
    } catch {}
    setLoading(false);
  };

  const handleConnectorPreview = async () => {
    if (!projectId || !selectedConnectionId) return;
    setLoading(true);
    setError('');
    try {
      const { data } = await enrichmentAPI.connectorPreview(projectId, selectedConnectionId);
      setPreview(data.data);
      setSelectedIds(new Set(data.data.matches.map((m: EnrichmentMatch) => m.elementId)));
      setStep('preview');
    } catch (err: any) {
      setError(err.response?.data?.error || 'Preview failed');
    }
    setLoading(false);
  };

  // ─── Apply ───

  const handleApply = async () => {
    if (!projectId || !preview) return;
    setStep('applying');
    setError('');
    try {
      const matches = preview.matches
        .filter(m => selectedIds.has(m.elementId))
        .map(m => ({
          elementId: m.elementId,
          fields: m.enrichment.fields,
          conflictStrategy: conflictStrategy,
        }));

      const { data } = await enrichmentAPI.apply(projectId, matches);
      setResult(data.data);

      // Refresh elements in store
      if (data.data.updated > 0 && projectId) {
        const res = await architectureAPI.getElements(projectId);
        setElements(res.data.data);
      }
      setStep('done');
    } catch (err: any) {
      setError(err.response?.data?.error || 'Apply failed');
      setStep('preview');
    }
  };

  // ─── Toggle helpers ───

  const toggleMatch = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleExpand = (id: string) => {
    setExpandedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="relative w-[720px] max-h-[85vh] rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-raised)] shadow-2xl flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[var(--border-subtle)] px-6 py-4">
          <div>
            <h2 className="text-lg font-semibold text-[var(--text-primary)]">
              {step === 'source' && 'Enrich Cost Data'}
              {step === 'upload' && 'CSV Cost Import'}
              {step === 'connector' && 'SonarQube Enrichment'}
              {step === 'preview' && 'Match Preview'}
              {step === 'applying' && 'Applying...'}
              {step === 'done' && 'Enrichment Complete'}
            </h2>
            <p className="text-xs text-[var(--text-tertiary)] mt-0.5">
              {step === 'source' && 'Import cost data from external sources'}
              {step === 'upload' && 'Upload a CSV with element names and cost fields'}
              {step === 'connector' && 'Fetch code quality metrics from SonarQube'}
              {step === 'preview' && `${preview?.matches.length || 0} matched, ${preview?.unmatched.length || 0} unmatched`}
              {step === 'done' && `${result?.updated || 0} elements updated`}
            </p>
          </div>
          <button onClick={handleClose} className="rounded p-1 hover:bg-[var(--surface-overlay)] transition">
            <X size={18} className="text-[var(--text-tertiary)]" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          {error && (
            <div className="flex items-center gap-2 rounded-md bg-red-500/10 border border-red-500/20 px-3 py-2 text-xs text-red-400">
              <AlertTriangle size={14} /> {error}
            </div>
          )}

          {/* Step: Source Selection */}
          {step === 'source' && (
            <div className="grid grid-cols-2 gap-4">
              <button
                onClick={() => setStep('upload')}
                className="flex flex-col items-center gap-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-base)] p-6 hover:border-[#7c3aed]/50 hover:bg-[#7c3aed]/5 transition group"
              >
                <FileSpreadsheet size={32} className="text-[var(--text-tertiary)] group-hover:text-[#a78bfa]" />
                <span className="text-sm font-medium text-[var(--text-primary)]">CSV / Excel</span>
                <span className="text-[10px] text-[var(--text-tertiary)] text-center">
                  Upload a spreadsheet with element names and cost fields (all 16 fields supported)
                </span>
              </button>
              <button
                onClick={() => { setStep('connector'); handleLoadConnections(); }}
                className="flex flex-col items-center gap-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-base)] p-6 hover:border-[#4E9BCD]/50 hover:bg-[#4E9BCD]/5 transition group"
              >
                <Plug size={32} className="text-[var(--text-tertiary)] group-hover:text-[#4E9BCD]" />
                <span className="text-sm font-medium text-[var(--text-primary)]">SonarQube</span>
                <span className="text-[10px] text-[var(--text-tertiary)] text-center">
                  Auto-fetch KSLOC, tech debt ratio, error rate, tech fitness from code analysis
                </span>
              </button>
            </div>
          )}

          {/* Step: CSV Upload */}
          {step === 'upload' && (
            <div className="space-y-4">
              <div className="rounded-lg border border-dashed border-[var(--border-subtle)] bg-[var(--surface-base)] p-6 text-center">
                <input type="file" accept=".csv,.tsv,.txt" onChange={handleFileChange} className="hidden" id="csv-upload" />
                <label htmlFor="csv-upload" className="cursor-pointer">
                  <Upload size={24} className="mx-auto text-[var(--text-disabled)] mb-2" />
                  <p className="text-sm text-[var(--text-secondary)]">
                    {csvFile ? csvFile.name : 'Click to select CSV file'}
                  </p>
                  <p className="text-[10px] text-[var(--text-disabled)] mt-1">
                    Headers: element name + any cost fields (annualCost, ksloc, tdr, errorRate, etc.)
                  </p>
                </label>
              </div>

              {csvHeaders.length > 0 && (
                <>
                  <label className="space-y-1">
                    <span className="text-[10px] text-[var(--text-tertiary)]">Match column (element name)</span>
                    <select
                      value={matchColumn}
                      onChange={(e) => setMatchColumn(e.target.value)}
                      className="w-full rounded bg-[var(--surface-base)] border border-[var(--border-subtle)] px-2 py-1.5 text-xs text-white outline-none"
                    >
                      {csvHeaders.map(h => <option key={h} value={h}>{h}</option>)}
                    </select>
                  </label>

                  <div className="rounded-md border border-[var(--border-subtle)] bg-[var(--surface-base)] p-3">
                    <p className="text-[10px] text-[var(--text-tertiary)] mb-2">
                      Detected columns: {csvHeaders.filter(h => h !== matchColumn).join(', ')} &middot; {csvRows.length} rows
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {csvHeaders.filter(h => h !== matchColumn).map(h => {
                        const normalized = h.toLowerCase().replace(/[\s-]+/g, '');
                        const mapped = FIELD_ALIASES[normalized];
                        return (
                          <span
                            key={h}
                            className={`rounded px-2 py-0.5 text-[10px] ${mapped ? 'bg-green-500/20 text-green-400' : 'bg-yellow-500/10 text-yellow-500/70'}`}
                          >
                            {h} {mapped ? `→ ${mapped}` : '(unmapped)'}
                          </span>
                        );
                      })}
                    </div>
                  </div>
                </>
              )}
            </div>
          )}

          {/* Step: Connector Selection */}
          {step === 'connector' && (
            <div className="space-y-4">
              {loading ? (
                <div className="flex items-center gap-2 text-[var(--text-tertiary)] py-6 justify-center">
                  <Loader2 size={14} className="animate-spin" /> Loading connections...
                </div>
              ) : connections.length === 0 ? (
                <div className="text-center py-8">
                  <Plug size={28} className="mx-auto text-[var(--text-disabled)] mb-3" />
                  <p className="text-sm text-[var(--text-tertiary)]">No SonarQube connections found</p>
                  <p className="text-[10px] text-[var(--text-disabled)] mt-1">
                    Add a SonarQube connection in Settings → Connections first
                  </p>
                </div>
              ) : (
                <label className="space-y-1">
                  <span className="text-[10px] text-[var(--text-tertiary)]">SonarQube Connection</span>
                  <select
                    value={selectedConnectionId}
                    onChange={(e) => setSelectedConnectionId(e.target.value)}
                    className="w-full rounded bg-[var(--surface-base)] border border-[var(--border-subtle)] px-2 py-1.5 text-xs text-white outline-none"
                  >
                    {connections.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </label>
              )}
            </div>
          )}

          {/* Step: Preview */}
          {step === 'preview' && preview && (
            <div className="space-y-3">
              {/* Conflict strategy */}
              <div className="flex items-center gap-4">
                <span className="text-[10px] text-[var(--text-tertiary)]">When field already has a value:</span>
                {(['overwrite', 'skip', 'higher_wins'] as ConflictStrategy[]).map(s => (
                  <label key={s} className="flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="radio" name="conflict" value={s}
                      checked={conflictStrategy === s}
                      onChange={() => setConflictStrategy(s)}
                      className="accent-[#7c3aed]"
                    />
                    <span className="text-xs text-[var(--text-secondary)]">
                      {s === 'overwrite' ? 'Overwrite' : s === 'skip' ? 'Skip' : 'Higher wins'}
                    </span>
                  </label>
                ))}
              </div>

              {/* Select all / none */}
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setSelectedIds(new Set(preview.matches.map(m => m.elementId)))}
                  className="text-[10px] text-[#a78bfa] hover:text-[#c4b5fd]"
                >All</button>
                <span className="text-[var(--text-disabled)]">|</span>
                <button
                  onClick={() => setSelectedIds(new Set())}
                  className="text-[10px] text-[#a78bfa] hover:text-[#c4b5fd]"
                >None</button>
                <span className="ml-auto text-[10px] text-[var(--text-tertiary)]">
                  {selectedIds.size} / {preview.matches.length} selected
                </span>
              </div>

              {/* Matched items */}
              <div className="space-y-1.5 max-h-[40vh] overflow-y-auto">
                {preview.matches.map((match) => (
                  <div
                    key={match.elementId}
                    className={`rounded-lg border p-3 transition ${
                      selectedIds.has(match.elementId)
                        ? 'border-[#7c3aed]/40 bg-[#7c3aed]/5'
                        : 'border-[var(--border-subtle)] bg-[var(--surface-base)]'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <input
                        type="checkbox"
                        checked={selectedIds.has(match.elementId)}
                        onChange={() => toggleMatch(match.elementId)}
                        className="accent-[#7c3aed]"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-medium text-[var(--text-primary)] truncate">
                            {match.enrichment.sourceName}
                          </span>
                          <ArrowRight size={12} className="text-[var(--text-disabled)] shrink-0" />
                          <span className="text-xs text-[#a78bfa] truncate">{match.elementName}</span>
                        </div>
                        <div className="flex items-center gap-2 mt-1">
                          <ConfidenceBadge value={match.confidence} />
                          <span className={`rounded px-1.5 py-0.5 text-[9px] ${
                            match.matchMethod === 'exact' ? 'bg-green-500/20 text-green-400' :
                            match.matchMethod === 'fuzzy' ? 'bg-blue-500/20 text-blue-400' :
                            'bg-yellow-500/20 text-yellow-400'
                          }`}>
                            {match.matchMethod}
                          </span>
                          <span className="text-[9px] text-[var(--text-disabled)]">
                            {Object.keys(match.enrichment.fields).length} fields
                          </span>
                        </div>
                      </div>
                      <button
                        onClick={() => toggleExpand(match.elementId)}
                        className="p-1 text-[var(--text-disabled)] hover:text-[var(--text-secondary)]"
                      >
                        {expandedIds.has(match.elementId) ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                      </button>
                    </div>

                    {expandedIds.has(match.elementId) && (
                      <div className="mt-2 ml-8 grid grid-cols-2 gap-x-4 gap-y-1">
                        {Object.entries(match.enrichment.fields).map(([key, value]) => (
                          <div key={key} className="flex items-center justify-between">
                            <span className="text-[10px] text-[var(--text-tertiary)]">
                              {COST_FIELD_LABELS[key as keyof typeof COST_FIELD_LABELS] || key}
                            </span>
                            <span className="text-[10px] text-[var(--text-primary)] font-mono">
                              {typeof value === 'number' ? value.toLocaleString() : String(value)}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {/* Unmatched items */}
              {preview.unmatched.length > 0 && (
                <div className="rounded-lg border border-yellow-500/20 bg-yellow-500/5 p-3">
                  <p className="text-[10px] font-medium text-yellow-400 mb-1">
                    {preview.unmatched.length} items could not be matched to elements:
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {preview.unmatched.map((u, i) => (
                      <span key={i} className="rounded bg-yellow-500/10 px-2 py-0.5 text-[10px] text-yellow-400/80">
                        {u.sourceName}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Step: Applying */}
          {step === 'applying' && (
            <div className="flex flex-col items-center justify-center py-12 gap-3">
              <Loader2 size={28} className="animate-spin text-[#7c3aed]" />
              <p className="text-sm text-[var(--text-secondary)]">Applying enrichment to {selectedIds.size} elements...</p>
            </div>
          )}

          {/* Step: Done */}
          {step === 'done' && result && (
            <div className="flex flex-col items-center justify-center py-8 gap-4">
              <CheckCircle2 size={40} className="text-green-400" />
              <div className="text-center">
                <p className="text-lg font-semibold text-[var(--text-primary)]">{result.updated} elements enriched</p>
                {result.skipped > 0 && (
                  <p className="text-xs text-[var(--text-tertiary)] mt-1">{result.skipped} skipped (no new data)</p>
                )}
              </div>
              {result.errors.length > 0 && (
                <div className="rounded-md bg-red-500/10 border border-red-500/20 px-3 py-2 text-xs text-red-400 max-w-full">
                  {result.errors.map((e, i) => <p key={i}>{e}</p>)}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-[var(--border-subtle)] px-6 py-3 flex items-center justify-between">
          <button
            onClick={step === 'source' ? handleClose : () => {
              if (step === 'preview') setStep(preview?.source === 'csv' ? 'upload' : 'connector');
              else if (step === 'upload' || step === 'connector') setStep('source');
              else if (step === 'done') reset();
            }}
            className="text-xs text-[var(--text-secondary)] hover:text-white transition"
          >
            {step === 'done' ? 'Start Over' : step === 'source' ? 'Cancel' : '← Back'}
          </button>

          <div className="flex items-center gap-2">
            {step === 'upload' && csvRows.length > 0 && (
              <button
                onClick={handleCSVPreview}
                disabled={loading}
                className="flex items-center gap-1.5 rounded-md bg-[#7c3aed] px-4 py-1.5 text-xs font-medium text-white hover:bg-[#6d28d9] transition disabled:opacity-50"
              >
                {loading ? <Loader2 size={12} className="animate-spin" /> : <Zap size={12} />}
                Match & Preview
              </button>
            )}

            {step === 'connector' && connections.length > 0 && (
              <button
                onClick={handleConnectorPreview}
                disabled={loading || !selectedConnectionId}
                className="flex items-center gap-1.5 rounded-md bg-[#4E9BCD] px-4 py-1.5 text-xs font-medium text-white hover:bg-[#3d8ab9] transition disabled:opacity-50"
              >
                {loading ? <Loader2 size={12} className="animate-spin" /> : <Zap size={12} />}
                Fetch & Match
              </button>
            )}

            {step === 'preview' && selectedIds.size > 0 && (
              <button
                onClick={handleApply}
                className="flex items-center gap-1.5 rounded-md bg-[#00ff41] px-4 py-1.5 text-xs font-medium text-black hover:bg-[#00cc33] transition"
              >
                <CheckCircle2 size={12} />
                Apply {selectedIds.size} Updates
              </button>
            )}

            {step === 'done' && (
              <button
                onClick={handleClose}
                className="rounded-md bg-[var(--surface-overlay)] px-4 py-1.5 text-xs font-medium text-white hover:bg-[var(--surface-base)] transition"
              >
                Close
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Helpers ───

function ConfidenceBadge({ value }: { value: number }) {
  const pct = Math.round(value * 100);
  const color = pct >= 80 ? 'text-green-400' : pct >= 50 ? 'text-yellow-400' : 'text-red-400';
  return <span className={`text-[9px] font-mono ${color}`}>{pct}%</span>;
}

function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') { current += '"'; i++; }
      else { inQuotes = !inQuotes; }
    } else if ((ch === ',' || ch === ';' || ch === '\t') && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  result.push(current.trim());
  return result;
}
