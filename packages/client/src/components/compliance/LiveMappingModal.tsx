/**
 * LiveMappingModal — UC-ICM-003.3 "Paste & See" (THE-283)
 *
 * Demo-Akt 3: Architekt pastet einen Gesetzes-Paragraph rein,
 * System ruft Anthropic auf, zeigt Top-5 Element-Mappings live an.
 *
 * Optional: User klickt "Übernehmen" → speichert als Regulation +
 * Compliance-Mappings im Projekt.
 *
 * Pattern: CSVImportDialog Modal (Header + Body + Footer).
 */
import { useState, useEffect, useCallback } from 'react';
import { X, Sparkles, Shield, ClipboardPaste, Loader2, CheckCircle2, AlertCircle } from 'lucide-react';
import toast from 'react-hot-toast';
import { complianceMappingAPI, regulationsAPI } from '../../services/api';
import { useComplianceStore } from '../../stores/complianceStore';
import { useArchitectureStore } from '../../stores/architectureStore';

interface PreviewMapping {
  elementId: string;
  elementType: string;
  confidence: number;
  reasoning: string;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

const SOURCE_OPTIONS: Array<{ value: string; label: string }> = [
  { value: 'lksg', label: 'LkSG (DE)' },
  { value: 'nis2', label: 'NIS2 (EU)' },
  { value: 'dsgvo', label: 'DSGVO (EU)' },
  { value: 'dora', label: 'DORA (EU)' },
  { value: 'iso27001', label: 'ISO 27001' },
  { value: 'custom', label: 'Custom' },
];

const LANGUAGE_OPTIONS: Array<{ value: 'de' | 'en'; label: string }> = [
  { value: 'de', label: 'German' },
  { value: 'en', label: 'English' },
];

const SAMPLE_TEXT = `§ 6 LkSG — Präventionsmaßnahmen

Stellt das Unternehmen im Rahmen seiner Risikoanalyse nach § 5 ein Risiko fest, so hat es unverzüglich angemessene Präventionsmaßnahmen gegenüber dem Verursacher zu verankern. Angemessene Präventionsmaßnahmen gegenüber einem unmittelbaren Zulieferer sind insbesondere die Berücksichtigung menschenrechtlicher und umweltbezogener Erwartungen bei der Auswahl eines unmittelbaren Zulieferers.`;

export default function LiveMappingModal({ isOpen, onClose }: Props) {
  const projectId = useArchitectureStore((s) => s.projectId);
  const elements = useArchitectureStore((s) => s.elements);
  const invalidate = useComplianceStore((s) => s.invalidateMappingsForElement);

  const [text, setText] = useState<string>('');
  const [source, setSource] = useState<string>('lksg');
  const [paragraphNumber, setParagraphNumber] = useState<string>('');
  const [language, setLanguage] = useState<'de' | 'en'>('de');
  const [jurisdiction, setJurisdiction] = useState<string>('DE');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<PreviewMapping[] | null>(null);
  const [durationMs, setDurationMs] = useState<number | null>(null);

  // Reset on close
  useEffect(() => {
    if (!isOpen) {
      setText('');
      setSource('lksg');
      setParagraphNumber('');
      setLanguage('de');
      setJurisdiction('DE');
      setIsLoading(false);
      setError(null);
      setPreview(null);
      setDurationMs(null);
    }
  }, [isOpen]);

  // Auto-detect source → adjust jurisdiction default
  useEffect(() => {
    if (source === 'lksg') setJurisdiction('DE');
    else if (source === 'nis2' || source === 'dsgvo' || source === 'dora') setJurisdiction('EU');
  }, [source]);

  const elementById = useCallback(
    (id: string) => elements.find((el) => el.id === id),
    [elements],
  );

  const handlePreview = useCallback(async () => {
    if (!projectId) {
      setError('No project context');
      return;
    }
    if (text.trim().length < 50) {
      setError('Please paste at least 50 characters of regulation text');
      return;
    }

    setIsLoading(true);
    setError(null);
    setPreview(null);
    const t0 = performance.now();

    try {
      const res = await complianceMappingAPI.preview(projectId, {
        text: text.trim(),
        source,
        paragraphNumber: paragraphNumber.trim() || 'preview',
        language,
        jurisdiction: jurisdiction.trim() || 'EU',
      });
      const data = res.data?.data;
      const mappings = (data?.mappings || []) as PreviewMapping[];
      setPreview(mappings);
      setDurationMs(Math.round(performance.now() - t0));
      if (mappings.length === 0) {
        toast('Keine relevanten Elements gefunden', { icon: 'ℹ️' });
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      // Try to extract better error from axios
      const axiosErr = err as { response?: { data?: { error?: string } } };
      setError(axiosErr.response?.data?.error || msg);
    } finally {
      setIsLoading(false);
    }
  }, [projectId, text, source, paragraphNumber, language, jurisdiction]);

  const handleClipboardPaste = useCallback(async () => {
    try {
      const clip = await navigator.clipboard.readText();
      if (clip) {
        setText(clip);
        toast.success('Aus Zwischenablage eingefügt');
      }
    } catch {
      toast.error('Clipboard-Zugriff verweigert');
    }
  }, []);

  const loadAllMappings = useComplianceStore((s) => s.loadAllMappings);
  const [isPersisting, setIsPersisting] = useState(false);

  const handleAccept = useCallback(async () => {
    if (!preview || preview.length === 0 || !projectId) {
      onClose();
      return;
    }
    setIsPersisting(true);
    try {
      // 1) Erzeuge die Regulation in DB
      const regRes = await regulationsAPI.create(projectId, {
        source,
        paragraphNumber: paragraphNumber.trim() || 'live-paste',
        title: `${source.toUpperCase()} ${paragraphNumber.trim() || 'Live'}`,
        fullText: text.trim(),
        language,
        jurisdiction: jurisdiction.trim() || (source === 'lksg' ? 'DE' : 'EU'),
        sourceUrl: 'user-pasted',
      });
      const regulationId = regRes.data?.data?._id;
      if (!regulationId) {
        throw new Error('Regulation create failed: missing _id in response');
      }

      // 2) Persistiere die User-akzeptierten Mappings
      await complianceMappingAPI.confirm(projectId, {
        regulationId,
        mappings: preview.map((m) => ({
          elementId: m.elementId,
          elementType: m.elementType,
          confidence: m.confidence,
          reasoning: m.reasoning,
        })),
      });

      // 3) Caches invalidieren — PropertyPanel + Heat-Map sollen neu laden
      for (const m of preview) {
        invalidate(m.elementId);
      }
      void loadAllMappings(projectId);

      toast.success(`✓ ${source.toUpperCase()} ${paragraphNumber} saved — ${preview.length} mapping${preview.length === 1 ? '' : 's'} added`);
      onClose();
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { error?: string } } };
      const msg = axiosErr.response?.data?.error || (err instanceof Error ? err.message : 'persist failed');
      toast.error(`Save failed: ${msg}`);
    } finally {
      setIsPersisting(false);
    }
  }, [preview, projectId, source, paragraphNumber, text, language, jurisdiction, invalidate, loadAllMappings, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/85 backdrop-blur-md">
      <div className="w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-raised)] shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-[var(--border-subtle)]">
          <div className="flex items-center gap-2">
            <Sparkles size={18} className="text-[#00ff41]" />
            <h2 className="text-sm font-semibold text-white">Live Compliance-Mapping <span className="text-[var(--text-tertiary)]">— Paste & See</span></h2>
          </div>
          <button onClick={onClose} className="text-[var(--text-secondary)] hover:text-white" aria-label="Close">
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {/* Source + Paragraph + Language Row */}
          <div className="grid grid-cols-3 gap-2">
            <div>
              <label className="block text-[10px] uppercase tracking-wider text-[var(--text-tertiary)] mb-1">Source</label>
              <select
                value={source}
                onChange={(e) => setSource(e.target.value)}
                className="w-full rounded border border-[var(--border-subtle)] bg-[var(--surface-base)] px-2 py-1 text-xs text-white outline-none focus:border-[#00ff41]"
                disabled={isLoading}
              >
                {SOURCE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-[10px] uppercase tracking-wider text-[var(--text-tertiary)] mb-1">Paragraph</label>
              <input
                type="text"
                value={paragraphNumber}
                onChange={(e) => setParagraphNumber(e.target.value)}
                placeholder="§ 6 / Art. 21"
                className="w-full rounded border border-[var(--border-subtle)] bg-[var(--surface-base)] px-2 py-1 text-xs text-white outline-none focus:border-[#00ff41]"
                disabled={isLoading}
              />
            </div>
            <div>
              <label className="block text-[10px] uppercase tracking-wider text-[var(--text-tertiary)] mb-1">Language</label>
              <select
                value={language}
                onChange={(e) => setLanguage(e.target.value as 'de' | 'en')}
                className="w-full rounded border border-[var(--border-subtle)] bg-[var(--surface-base)] px-2 py-1 text-xs text-white outline-none focus:border-[#00ff41]"
                disabled={isLoading}
              >
                {LANGUAGE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Text-Paste-Area */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-[10px] uppercase tracking-wider text-[var(--text-tertiary)]">Paste regulation text</label>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleClipboardPaste}
                  className="flex items-center gap-1 text-[10px] text-[var(--accent-text)] hover:text-white transition"
                  disabled={isLoading}
                  type="button"
                >
                  <ClipboardPaste size={11} />
                  Paste
                </button>
                <button
                  onClick={() => setText(SAMPLE_TEXT)}
                  className="text-[10px] text-[var(--text-tertiary)] hover:text-white transition"
                  disabled={isLoading}
                  type="button"
                >
                  Load demo text
                </button>
              </div>
            </div>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Paste the full regulation text here (min. 50, max. 12,000 characters)..."
              rows={8}
              className="w-full rounded border border-[var(--border-subtle)] bg-[var(--surface-base)] px-3 py-2 text-xs text-white outline-none focus:border-[#00ff41] font-mono leading-relaxed"
              disabled={isLoading}
            />
            <div className="flex justify-between text-[10px] text-[var(--text-tertiary)] mt-1">
              <span>{text.length} chars</span>
              {text.length > 12000 && <span className="text-red-400">too long — max 12,000</span>}
            </div>
          </div>

          {/* Error */}
          {error && (
            <div className="rounded border border-red-500/30 bg-red-500/10 p-2 flex items-start gap-2">
              <AlertCircle size={12} className="text-red-400 mt-0.5 shrink-0" />
              <span className="text-[11px] text-red-300">{error}</span>
            </div>
          )}

          {/* Preview Results */}
          {preview && (
            <div className="rounded border border-[#00ff41]/30 bg-[#00ff41]/5 p-3 space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <CheckCircle2 size={14} className="text-[#00ff41]" />
                  <span className="text-xs font-semibold text-white">
                    {preview.length} relevant {preview.length === 1 ? 'element' : 'elements'} identified
                  </span>
                </div>
                {durationMs !== null && (
                  <span className="text-[10px] text-[var(--text-tertiary)]">{(durationMs / 1000).toFixed(1)}s</span>
                )}
              </div>

              {preview.length === 0 ? (
                <div className="text-[11px] text-[var(--text-secondary)] italic py-2">
                  No element in this project is materially affected by this text. That is a valid outcome — not every regulation maps to every architecture.
                </div>
              ) : (
                <div className="space-y-1.5">
                  {preview.map((m, i) => {
                    const el = elementById(m.elementId);
                    const color =
                      m.confidence >= 0.9 ? '#22c55e' :
                      m.confidence >= 0.7 ? '#eab308' :
                      m.confidence >= 0.5 ? '#f97316' :
                                            '#ef4444';
                    return (
                      <div key={i} className="rounded border border-[var(--border-subtle)] bg-[var(--surface-base)] p-2 space-y-1">
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-1.5 flex-1 min-w-0">
                            <Shield size={11} className="shrink-0" style={{ color }} />
                            <span className="text-[11px] font-semibold text-white truncate">{el?.name || m.elementId}</span>
                            <span className="text-[9px] text-[var(--text-tertiary)] capitalize ml-1">{m.elementType.replace(/_/g, ' ')}</span>
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0">
                            <div className="h-1.5 w-16 rounded-full bg-[var(--surface-raised)] overflow-hidden">
                              <div className="h-full" style={{ width: `${m.confidence * 100}%`, backgroundColor: color }} />
                            </div>
                            <span className="text-[10px] font-mono" style={{ color }}>{m.confidence.toFixed(2)}</span>
                          </div>
                        </div>
                        <p className="text-[10px] text-[var(--text-secondary)] leading-snug" title={m.reasoning}>
                          {m.reasoning}
                        </p>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Loading State */}
          {isLoading && (
            <div className="rounded border border-[var(--border-subtle)] bg-[var(--surface-base)] p-4 flex flex-col items-center justify-center gap-2">
              <Loader2 size={20} className="text-[#00ff41] animate-spin" />
              <span className="text-xs text-[var(--text-secondary)]">Claude is analyzing the paragraph…</span>
              <span className="text-[10px] text-[var(--text-tertiary)]">~3 seconds — comparing against {elements.length} elements</span>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between p-4 border-t border-[var(--border-subtle)] bg-[var(--surface-base)]">
          <div className="text-[10px] text-[var(--text-tertiary)]">
            Architecture context: {elements.length} elements in project
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="rounded-md border border-[var(--border-subtle)] px-3 py-1.5 text-xs text-[var(--text-secondary)] hover:text-white transition"
              disabled={isLoading}
            >
              Cancel
            </button>
            {!preview ? (
              <button
                onClick={handlePreview}
                disabled={isLoading || text.trim().length < 50 || text.length > 12000}
                className="flex items-center gap-1.5 rounded-md px-4 py-1.5 text-xs font-semibold transition disabled:opacity-50"
                style={{
                  background: 'linear-gradient(135deg, #00ff41 0%, #33ff66 100%)',
                  color: '#0a0a0a',
                  boxShadow: '0 0 12px rgba(0,255,65,0.25)',
                }}
              >
                <Sparkles size={12} />
                {isLoading ? 'Analyzing…' : 'Start Live Mapping'}
              </button>
            ) : (
              <>
                <button
                  onClick={() => { setPreview(null); setDurationMs(null); }}
                  className="text-xs text-[var(--text-tertiary)] hover:text-white transition"
                >
                  Reset
                </button>
                <button
                  onClick={handleAccept}
                  disabled={isPersisting}
                  className="flex items-center gap-1.5 rounded-md px-4 py-1.5 text-xs font-semibold transition disabled:opacity-60"
                  style={{
                    background: 'linear-gradient(135deg, #00ff41 0%, #33ff66 100%)',
                    color: '#0a0a0a',
                    boxShadow: '0 0 12px rgba(0,255,65,0.25)',
                  }}
                >
                  {isPersisting ? <Loader2 size={12} className="animate-spin" /> : <CheckCircle2 size={12} />}
                  {isPersisting ? 'Saving…' : 'Apply & Save'}
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
