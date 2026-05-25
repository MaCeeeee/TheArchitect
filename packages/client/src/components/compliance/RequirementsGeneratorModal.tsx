/**
 * RequirementsGeneratorModal — UC-REQGEN-001 "Anforderungen aus Regulation-Text"
 * (THE-304 Frontend)
 *
 * Demo-Akt für die Killer-Story:
 *   Architekt pastet einen Gesetzes-Paragraph rein,
 *   System ruft Anthropic Haiku 4.5 auf,
 *   zeigt strukturierte ComplianceRequirements (Title, Priority, LinkedElements, Confidence),
 *   User editiert/entfernt einzelne Items und persistiert mit "Übernehmen".
 *
 * Pattern: LiveMappingModal.tsx (UC-ICM-003.3 — Paste & See).
 * Unterschied: nicht Element-Mappings, sondern actionable Requirements.
 */
import { useState, useEffect, useCallback } from 'react';
import {
  X,
  Sparkles,
  ListChecks,
  ClipboardPaste,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Trash2,
  Link2,
} from 'lucide-react';
import toast from 'react-hot-toast';
import {
  requirementsAPI,
  regulationsAPI,
  type RequirementCandidate,
} from '../../services/api';
import { useArchitectureStore } from '../../stores/architectureStore';

type Priority = 'must' | 'should' | 'may';

interface EditableRequirement extends RequirementCandidate {
  _localId: string;  // stable React-key beim Re-Order/Delete
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
  { value: 'de', label: 'Deutsch' },
  { value: 'en', label: 'English' },
];

const SAMPLE_TEXT = `§ 6 LkSG — Präventionsmaßnahmen

Stellt das Unternehmen im Rahmen seiner Risikoanalyse nach § 5 ein Risiko fest, so hat es unverzüglich angemessene Präventionsmaßnahmen gegenüber dem Verursacher zu verankern. Angemessene Präventionsmaßnahmen gegenüber einem unmittelbaren Zulieferer sind insbesondere:
1. die Berücksichtigung menschenrechtlicher und umweltbezogener Erwartungen bei der Auswahl eines unmittelbaren Zulieferers;
2. die vertragliche Zusicherung eines unmittelbaren Zulieferers, dass dieser die vom Unternehmen verlangten Anforderungen einhält;
3. die Durchführung von Schulungen und Weiterbildungen zur Durchsetzung der vertraglichen Zusicherungen;
4. die Vereinbarung angemessener vertraglicher Kontrollmechanismen sowie deren risikobasierte Durchführung.`;

const PRIORITY_BADGE: Record<Priority, { label: string; bg: string; fg: string }> = {
  must:   { label: 'MUSS',   bg: '#dc2626', fg: '#fff' },
  should: { label: 'SOLLTE', bg: '#eab308', fg: '#0a0a0a' },
  may:    { label: 'KANN',   bg: '#3b82f6', fg: '#fff' },
};

export default function RequirementsGeneratorModal({ isOpen, onClose }: Props) {
  const projectId = useArchitectureStore((s) => s.projectId);
  const elements = useArchitectureStore((s) => s.elements);

  const [text, setText] = useState<string>('');
  const [source, setSource] = useState<string>('lksg');
  const [paragraphNumber, setParagraphNumber] = useState<string>('');
  const [language, setLanguage] = useState<'de' | 'en'>('de');
  const [jurisdiction, setJurisdiction] = useState<string>('DE');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<EditableRequirement[] | null>(null);
  const [durationMs, setDurationMs] = useState<number | null>(null);
  const [isPersisting, setIsPersisting] = useState(false);

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
      setIsPersisting(false);
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
    if (text.trim().length < 20) {
      setError('Mindestens 20 Zeichen Text einfügen');
      return;
    }

    setIsLoading(true);
    setError(null);
    setPreview(null);
    const t0 = performance.now();

    try {
      const res = await requirementsAPI.generate(projectId, {
        text: text.trim(),
        source,
        paragraphNumber: paragraphNumber.trim() || 'preview',
        language,
        jurisdiction: jurisdiction.trim() || 'EU',
      });
      const data = res.data?.data;
      const reqs: RequirementCandidate[] = data?.requirements ?? [];
      const editable: EditableRequirement[] = reqs.map((r, i) => ({
        ...r,
        _localId: `${Date.now()}-${i}`,
      }));
      setPreview(editable);
      setDurationMs(Math.round(performance.now() - t0));
      if (editable.length === 0) {
        toast('Keine actionable Requirements identifiziert', { icon: 'ℹ️' });
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
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

  const updateField = useCallback(
    <K extends keyof EditableRequirement>(localId: string, field: K, value: EditableRequirement[K]) => {
      setPreview((prev) =>
        prev?.map((r) => (r._localId === localId ? { ...r, [field]: value } : r)) ?? null,
      );
    },
    [],
  );

  const removeOne = useCallback((localId: string) => {
    setPreview((prev) => prev?.filter((r) => r._localId !== localId) ?? null);
  }, []);

  const handleAccept = useCallback(async () => {
    if (!preview || preview.length === 0 || !projectId) {
      onClose();
      return;
    }

    // Client-side validation before round-trip
    for (const r of preview) {
      if (r.title.trim().length < 5) {
        toast.error(`Titel zu kurz: "${r.title}"`);
        return;
      }
      if (r.description.trim().length < 5) {
        toast.error(`Beschreibung zu kurz für "${r.title}"`);
        return;
      }
    }

    setIsPersisting(true);
    try {
      // 1) Erzeuge die Regulation in DB (sofern noch nicht persistiert)
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

      // 2) Persistiere die kuratierten Requirements
      await requirementsAPI.confirm(projectId, {
        regulationId,
        sourceParagraph: text.trim().slice(0, 5000),
        requirements: preview.map((r) => ({
          title: r.title.trim(),
          description: r.description.trim(),
          priority: r.priority,
          linkedElementIds: r.linkedElementIds,
        })),
      });

      toast.success(
        `✓ ${preview.length} Anforderung${preview.length === 1 ? '' : 'en'} zu ${source.toUpperCase()} ${paragraphNumber || ''} gespeichert`,
      );
      onClose();
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { error?: string } } };
      const msg = axiosErr.response?.data?.error || (err instanceof Error ? err.message : 'persist failed');
      toast.error(`Persistieren fehlgeschlagen: ${msg}`);
    } finally {
      setIsPersisting(false);
    }
  }, [preview, projectId, source, paragraphNumber, text, language, jurisdiction, onClose]);

  if (!isOpen) return null;

  const mustCount = preview?.filter((r) => r.priority === 'must').length ?? 0;
  const shouldCount = preview?.filter((r) => r.priority === 'should').length ?? 0;
  const mayCount = preview?.filter((r) => r.priority === 'may').length ?? 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-3xl max-h-[92vh] overflow-hidden flex flex-col rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-raised)] shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-[var(--border-subtle)]">
          <div className="flex items-center gap-2">
            <ListChecks size={18} className="text-[#7c3aed]" />
            <h2 className="text-sm font-semibold text-white">
              Anforderungen aus Regulation generieren{' '}
              <span className="text-[var(--text-tertiary)]">— UC-REQGEN-001</span>
            </h2>
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
              <label className="block text-[10px] uppercase tracking-wider text-[var(--text-tertiary)] mb-1">Quelle</label>
              <select
                value={source}
                onChange={(e) => setSource(e.target.value)}
                className="w-full rounded border border-[var(--border-subtle)] bg-[var(--surface-base)] px-2 py-1 text-xs text-white outline-none focus:border-[#7c3aed]"
                disabled={isLoading || !!preview}
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
                className="w-full rounded border border-[var(--border-subtle)] bg-[var(--surface-base)] px-2 py-1 text-xs text-white outline-none focus:border-[#7c3aed]"
                disabled={isLoading || !!preview}
              />
            </div>
            <div>
              <label className="block text-[10px] uppercase tracking-wider text-[var(--text-tertiary)] mb-1">Sprache</label>
              <select
                value={language}
                onChange={(e) => setLanguage(e.target.value as 'de' | 'en')}
                className="w-full rounded border border-[var(--border-subtle)] bg-[var(--surface-base)] px-2 py-1 text-xs text-white outline-none focus:border-[#7c3aed]"
                disabled={isLoading || !!preview}
              >
                {LANGUAGE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Text-Paste-Area */}
          {!preview && (
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-[10px] uppercase tracking-wider text-[var(--text-tertiary)]">
                  Regulation-Paragraph einfügen
                </label>
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleClipboardPaste}
                    className="flex items-center gap-1 text-[10px] text-[var(--accent-text)] hover:text-white transition"
                    disabled={isLoading}
                    type="button"
                  >
                    <ClipboardPaste size={11} />
                    Einfügen
                  </button>
                  <button
                    onClick={() => setText(SAMPLE_TEXT)}
                    className="text-[10px] text-[var(--text-tertiary)] hover:text-white transition"
                    disabled={isLoading}
                    type="button"
                  >
                    Demo-Text laden
                  </button>
                </div>
              </div>
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="Paste den vollen Gesetzestext hier rein (min. 20, max. 12.000 Zeichen)..."
                rows={8}
                className="w-full rounded border border-[var(--border-subtle)] bg-[var(--surface-base)] px-3 py-2 text-xs text-white outline-none focus:border-[#7c3aed] font-mono leading-relaxed"
                disabled={isLoading}
              />
              <div className="flex justify-between text-[10px] text-[var(--text-tertiary)] mt-1">
                <span>{text.length} chars</span>
                {text.length > 12000 && <span className="text-red-400">zu lang — max. 12.000</span>}
              </div>
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="rounded border border-red-500/30 bg-red-500/10 p-2 flex items-start gap-2">
              <AlertCircle size={12} className="text-red-400 mt-0.5 shrink-0" />
              <span className="text-[11px] text-red-300">{error}</span>
            </div>
          )}

          {/* Preview Results */}
          {preview && (
            <div className="rounded border border-[#7c3aed]/30 bg-[#7c3aed]/5 p-3 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <CheckCircle2 size={14} className="text-[#7c3aed]" />
                  <span className="text-xs font-semibold text-white">
                    {preview.length} actionable Anforderung{preview.length === 1 ? '' : 'en'} extrahiert
                  </span>
                  <span className="text-[10px] text-[var(--text-tertiary)]">
                    ({mustCount} MUSS · {shouldCount} SOLLTE · {mayCount} KANN)
                  </span>
                </div>
                {durationMs !== null && (
                  <span className="text-[10px] text-[var(--text-tertiary)]">{(durationMs / 1000).toFixed(1)}s</span>
                )}
              </div>

              {preview.length === 0 ? (
                <div className="text-[11px] text-[var(--text-secondary)] italic py-2">
                  Keine actionable Anforderung in diesem Paragraph erkannt. Das ist ein gültiges Ergebnis — nicht jeder Text enthält konkrete Pflichten.
                </div>
              ) : (
                <div className="space-y-2">
                  {preview.map((req) => {
                    const badge = PRIORITY_BADGE[req.priority];
                    return (
                      <div
                        key={req._localId}
                        className="rounded border border-[var(--border-subtle)] bg-[var(--surface-base)] p-2.5 space-y-2"
                      >
                        {/* Title + Priority + Confidence + Delete */}
                        <div className="flex items-start gap-2">
                          <select
                            value={req.priority}
                            onChange={(e) => updateField(req._localId, 'priority', e.target.value as Priority)}
                            className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded border-none outline-none cursor-pointer shrink-0"
                            style={{ backgroundColor: badge.bg, color: badge.fg }}
                            title="Priorität ändern"
                          >
                            <option value="must">MUSS</option>
                            <option value="should">SOLLTE</option>
                            <option value="may">KANN</option>
                          </select>
                          <input
                            type="text"
                            value={req.title}
                            onChange={(e) => updateField(req._localId, 'title', e.target.value)}
                            className="flex-1 rounded border border-transparent hover:border-[var(--border-subtle)] focus:border-[#7c3aed] bg-transparent px-1.5 py-0.5 text-[12px] font-semibold text-white outline-none"
                            placeholder="Imperativer Titel (5-200 Zeichen)"
                          />
                          <span
                            className="text-[10px] font-mono shrink-0 px-1.5 py-0.5 rounded"
                            style={{
                              color:
                                req.confidence >= 0.9 ? '#22c55e' :
                                req.confidence >= 0.7 ? '#eab308' :
                                req.confidence >= 0.5 ? '#f97316' :
                                                        '#ef4444',
                              backgroundColor: 'rgba(255,255,255,0.04)',
                            }}
                            title={`LLM confidence: ${req.confidence.toFixed(2)}`}
                          >
                            {req.confidence.toFixed(2)}
                          </span>
                          <button
                            onClick={() => removeOne(req._localId)}
                            className="text-[var(--text-tertiary)] hover:text-red-400 transition shrink-0 mt-0.5"
                            title="Entfernen"
                          >
                            <Trash2 size={12} />
                          </button>
                        </div>

                        {/* Description */}
                        <textarea
                          value={req.description}
                          onChange={(e) => updateField(req._localId, 'description', e.target.value)}
                          rows={2}
                          className="w-full rounded border border-transparent hover:border-[var(--border-subtle)] focus:border-[#7c3aed] bg-transparent px-1.5 py-1 text-[11px] text-[var(--text-secondary)] outline-none leading-relaxed resize-none"
                          placeholder="Konkrete Maßnahme: WAS muss WIE umgesetzt werden?"
                        />

                        {/* Linked Elements */}
                        {req.linkedElementIds.length > 0 && (
                          <div className="flex items-center gap-1.5 flex-wrap pt-1 border-t border-[var(--border-subtle)]/40">
                            <Link2 size={10} className="text-[var(--text-tertiary)]" />
                            {req.linkedElementIds.map((id) => {
                              const el = elementById(id);
                              return (
                                <span
                                  key={id}
                                  className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-[#7c3aed]/15 text-[#a78bfa] border border-[#7c3aed]/30"
                                  title={el ? `${el.type} — ${el.name}` : id}
                                >
                                  {el?.name ?? id}
                                  <button
                                    onClick={() =>
                                      updateField(
                                        req._localId,
                                        'linkedElementIds',
                                        req.linkedElementIds.filter((x) => x !== id),
                                      )
                                    }
                                    className="text-[#a78bfa]/60 hover:text-red-400"
                                    title="Verknüpfung entfernen"
                                  >
                                    <X size={9} />
                                  </button>
                                </span>
                              );
                            })}
                          </div>
                        )}
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
              <Loader2 size={20} className="text-[#7c3aed] animate-spin" />
              <span className="text-xs text-[var(--text-secondary)]">Claude extrahiert Anforderungen...</span>
              <span className="text-[10px] text-[var(--text-tertiary)]">
                ~9 Sekunden — Haiku 4.5 analysiert gegen {elements.length} Architektur-Elements
              </span>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between p-4 border-t border-[var(--border-subtle)] bg-[var(--surface-base)]">
          <div className="text-[10px] text-[var(--text-tertiary)]">
            Architektur-Kontext: {elements.length} Elements im Projekt
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="rounded-md border border-[var(--border-subtle)] px-3 py-1.5 text-xs text-[var(--text-secondary)] hover:text-white transition"
              disabled={isLoading || isPersisting}
            >
              Abbrechen
            </button>
            {!preview ? (
              <button
                onClick={handlePreview}
                disabled={isLoading || text.trim().length < 20 || text.length > 12000}
                className="flex items-center gap-1.5 rounded-md px-4 py-1.5 text-xs font-semibold transition disabled:opacity-50"
                style={{
                  background: 'linear-gradient(135deg, #7c3aed 0%, #a78bfa 100%)',
                  color: '#fff',
                  boxShadow: '0 0 12px rgba(124,58,237,0.35)',
                }}
              >
                <Sparkles size={12} />
                {isLoading ? 'Analysiere...' : 'Anforderungen extrahieren'}
              </button>
            ) : (
              <>
                <button
                  onClick={() => { setPreview(null); setDurationMs(null); }}
                  disabled={isPersisting}
                  className="text-xs text-[var(--text-tertiary)] hover:text-white transition"
                >
                  Zurück
                </button>
                <button
                  onClick={handleAccept}
                  disabled={isPersisting || preview.length === 0}
                  className="flex items-center gap-1.5 rounded-md px-4 py-1.5 text-xs font-semibold transition disabled:opacity-60"
                  style={{
                    background: 'linear-gradient(135deg, #7c3aed 0%, #a78bfa 100%)',
                    color: '#fff',
                    boxShadow: '0 0 12px rgba(124,58,237,0.35)',
                  }}
                >
                  {isPersisting ? <Loader2 size={12} className="animate-spin" /> : <CheckCircle2 size={12} />}
                  {isPersisting
                    ? 'Persistiere...'
                    : `${preview.length} Anforderung${preview.length === 1 ? '' : 'en'} übernehmen`}
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
