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
import { useState, useEffect, useCallback, useRef, useLayoutEffect } from 'react';
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
  Info,
  ScanSearch,
  Network,
} from 'lucide-react';
import toast from 'react-hot-toast';
import {
  requirementsAPI,
  regulationsAPI,
  architectureAPI,
  type RequirementCandidate,
} from '../../services/api';
import { useArchitectureStore } from '../../stores/architectureStore';

type Priority = 'must' | 'should' | 'may';

interface EditableRequirement extends RequirementCandidate {
  _localId: string;   // stable React-key beim Re-Order/Delete
  _selected: boolean; // checkbox — only selected requirements get persisted
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
  must:   { label: 'MUST',   bg: '#dc2626', fg: '#fff' },
  should: { label: 'SHOULD', bg: '#eab308', fg: '#0a0a0a' },
  may:    { label: 'MAY',    bg: '#3b82f6', fg: '#fff' },
};

function scoreColor(v: number): string {
  return v >= 0.9 ? '#22c55e' : v >= 0.7 ? '#eab308' : v >= 0.5 ? '#f97316' : '#ef4444';
}

/** Labeled confidence pill — one of the two explainability axes. */
function ScorePill({ label, value, tip }: { label: string; value: number; tip: string }) {
  const color = scoreColor(value);
  return (
    <span
      className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 bg-[rgba(255,255,255,0.04)] cursor-help"
      title={tip}
    >
      <span className="text-[10px] uppercase tracking-wider text-[var(--text-tertiary)]">{label}</span>
      <span className="text-[11px] font-mono font-semibold" style={{ color }}>{value.toFixed(2)}</span>
    </span>
  );
}

/** Auto-growing textarea — height tracks content so long text is never clipped. */
function AutoTextarea({
  value,
  onChange,
  placeholder,
  className,
  minRows = 2,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  className?: string;
  minRows?: number;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, [value]);
  return (
    <textarea
      ref={ref}
      value={value}
      rows={minRows}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className={className}
      style={{ resize: 'none', overflow: 'hidden' }}
    />
  );
}

/** Editable rationale row with an icon + label. The audit "why". */
function RationaleField({
  icon,
  label,
  value,
  onChange,
  placeholder,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
}) {
  return (
    <div className="flex items-start gap-1.5">
      <span className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-[var(--text-tertiary)] shrink-0 mt-1 w-[92px]">
        {icon}
        {label}
      </span>
      <AutoTextarea
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        minRows={1}
        className="flex-1 rounded border border-transparent hover:border-[var(--border-subtle)] focus:border-[#7c3aed] bg-transparent px-1 py-0.5 text-[12px] text-[var(--text-secondary)] outline-none leading-snug italic"
      />
    </div>
  );
}

export default function RequirementsGeneratorModal({ isOpen, onClose }: Props) {
  const projectId = useArchitectureStore((s) => s.projectId);
  const elements = useArchitectureStore((s) => s.elements);
  const setElements = useArchitectureStore((s) => s.setElements);
  const setConnections = useArchitectureStore((s) => s.setConnections);

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
  const [savedIds, setSavedIds] = useState<string[] | null>(null);  // post-save state → enables projection
  const [savedCount, setSavedCount] = useState(0);
  const [isProjecting, setIsProjecting] = useState(false);

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
      setSavedIds(null);
      setSavedCount(0);
      setIsProjecting(false);
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
      setError('Paste at least 20 characters');
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
        _selected: true,
      }));
      setPreview(editable);
      setDurationMs(Math.round(performance.now() - t0));
      if (editable.length === 0) {
        toast('No actionable requirements identified', { icon: 'ℹ️' });
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
        toast.success('Pasted from clipboard');
      }
    } catch {
      toast.error('Clipboard access denied');
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

  const toggleSelect = useCallback((localId: string) => {
    setPreview((prev) =>
      prev?.map((r) => (r._localId === localId ? { ...r, _selected: !r._selected } : r)) ?? null,
    );
  }, []);

  const toggleSelectAll = useCallback(() => {
    setPreview((prev) => {
      if (!prev) return null;
      const allSelected = prev.every((r) => r._selected);
      return prev.map((r) => ({ ...r, _selected: !allSelected }));
    });
  }, []);

  const handleAccept = useCallback(async () => {
    const chosen = preview?.filter((r) => r._selected) ?? [];
    if (chosen.length === 0 || !projectId) {
      onClose();
      return;
    }

    // Client-side validation before round-trip (only selected ones)
    for (const r of chosen) {
      if (r.title.trim().length < 5) {
        toast.error(`Title too short: "${r.title}"`);
        return;
      }
      if (r.description.trim().length < 5) {
        toast.error(`Description too short for "${r.title}"`);
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

      // 2) Persist only the SELECTED requirements
      const confirmRes = await requirementsAPI.confirm(projectId, {
        regulationId,
        sourceParagraph: text.trim().slice(0, 5000),
        requirements: chosen.map((r) => ({
          title: r.title.trim(),
          description: r.description.trim(),
          priority: r.priority,
          linkedElementIds: r.linkedElementIds,
          // Preserve the audit trail through human curation
          extractionConfidence: r.extractionConfidence,
          extractionRationale: r.extractionRationale,
          mappingConfidence: r.mappingConfidence,
          mappingRationale: r.mappingRationale,
        })),
      });

      const persisted = (confirmRes.data?.data ?? []) as Array<{ _id: string }>;
      toast.success(
        `✓ ${chosen.length} requirement${chosen.length === 1 ? '' : 's'} saved to ${source.toUpperCase()} ${paragraphNumber || ''}`,
      );
      // Move to the post-save state instead of closing → offer projection into the model
      setSavedCount(chosen.length);
      setSavedIds(persisted.map((p) => String(p._id)));
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { error?: string } } };
      const msg = axiosErr.response?.data?.error || (err instanceof Error ? err.message : 'persist failed');
      toast.error(`Save failed: ${msg}`);
    } finally {
      setIsPersisting(false);
    }
  }, [preview, projectId, source, paragraphNumber, text, language, jurisdiction, onClose]);

  const handleProjectToModel = useCallback(async () => {
    if (!projectId || !savedIds || savedIds.length === 0) {
      onClose();
      return;
    }
    setIsProjecting(true);
    try {
      const res = await requirementsAPI.projectToModel(projectId, savedIds);
      const s = res.data?.data;
      const total = (s?.requirementsProjected ?? 0) + (s?.constraintsProjected ?? 0);

      // Reload the architecture so the new motivation elements + edges appear live in the 3D graph
      try {
        const [elemRes, connRes] = await Promise.all([
          architectureAPI.getElements(projectId),
          architectureAPI.getConnections(projectId),
        ]);
        setElements(elemRes.data?.data ?? []);
        setConnections(connRes.data?.data ?? []);
      } catch {
        // non-fatal — a page refresh will pick them up
      }

      toast.success(
        `✓ ${total} element${total === 1 ? '' : 's'} added to the motivation layer` +
          (s?.realizationEdges ? ` · ${s.realizationEdges} realization link${s.realizationEdges === 1 ? '' : 's'}` : '') +
          (s?.floatingGaps ? ` · ${s.floatingGaps} open gap${s.floatingGaps === 1 ? '' : 's'}` : ''),
      );
      onClose();
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { error?: string } } };
      const msg = axiosErr.response?.data?.error || (err instanceof Error ? err.message : 'projection failed');
      toast.error(`Add to model failed: ${msg}`);
    } finally {
      setIsProjecting(false);
    }
  }, [projectId, savedIds, onClose, setElements, setConnections]);

  if (!isOpen) return null;

  const mustCount = preview?.filter((r) => r.priority === 'must').length ?? 0;
  const shouldCount = preview?.filter((r) => r.priority === 'should').length ?? 0;
  const mayCount = preview?.filter((r) => r.priority === 'may').length ?? 0;
  const selectedCount = preview?.filter((r) => r._selected).length ?? 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-3xl max-h-[92vh] overflow-hidden flex flex-col rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-raised)] shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-[var(--border-subtle)]">
          <div className="flex items-center gap-2">
            <ListChecks size={18} className="text-[#7c3aed]" />
            <h2 className="text-sm font-semibold text-white">
              Generate Requirements from Regulation{' '}
              <span className="text-[var(--text-tertiary)]">— UC-REQGEN-001</span>
            </h2>
          </div>
          <button onClick={onClose} className="text-[var(--text-secondary)] hover:text-white" aria-label="Close">
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {/* Post-save state — offer projection into the architecture model */}
          {savedIds !== null ? (
            <div className="flex flex-col items-center justify-center text-center py-6 px-4 gap-3">
              <div className="flex items-center justify-center w-12 h-12 rounded-full bg-[#7c3aed]/15 border border-[#7c3aed]/40">
                <CheckCircle2 size={24} className="text-[#7c3aed]" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-white">
                  {savedCount} requirement{savedCount === 1 ? '' : 's'} saved
                </h3>
                <p className="text-[11px] text-[var(--text-secondary)] mt-1 max-w-md leading-relaxed">
                  They are tracked in the compliance backlog. Optionally project them into the
                  architecture model as ArchiMate <span className="text-[#a78bfa]">requirement</span> /
                  <span className="text-[#a78bfa]"> constraint</span> elements on the motivation layer —
                  linked to a regulatory <span className="text-[#a78bfa]">driver</span> and realized by the
                  affected elements. Unmatched obligations appear as visible gaps.
                </p>
              </div>
            </div>
          ) : (
          <>
          {/* Source + Paragraph + Language Row */}
          <div className="grid grid-cols-3 gap-2">
            <div>
              <label className="block text-[10px] uppercase tracking-wider text-[var(--text-tertiary)] mb-1">Source</label>
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
              <label className="block text-[10px] uppercase tracking-wider text-[var(--text-tertiary)] mb-1">Language</label>
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
                  Paste regulation paragraph
                </label>
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
                placeholder="Paste the full regulation text here (min. 20, max. 12,000 characters)..."
                rows={8}
                className="w-full rounded border border-[var(--border-subtle)] bg-[var(--surface-base)] px-3 py-2 text-xs text-white outline-none focus:border-[#7c3aed] font-mono leading-relaxed"
                disabled={isLoading}
              />
              <div className="flex justify-between text-[10px] text-[var(--text-tertiary)] mt-1">
                <span>{text.length} chars</span>
                {text.length > 12000 && <span className="text-red-400">too long — max. 12,000</span>}
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
                    {selectedCount} of {preview.length} selected
                  </span>
                  <span className="text-[11px] text-[var(--text-tertiary)]">
                    ({mustCount} MUST · {shouldCount} SHOULD · {mayCount} MAY)
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  {preview.length > 0 && (
                    <button
                      onClick={toggleSelectAll}
                      className="text-[11px] text-[var(--accent-text)] hover:text-white transition"
                      type="button"
                    >
                      {selectedCount === preview.length ? 'Deselect all' : 'Select all'}
                    </button>
                  )}
                  {durationMs !== null && (
                    <span className="text-[10px] text-[var(--text-tertiary)]">{(durationMs / 1000).toFixed(1)}s</span>
                  )}
                </div>
              </div>

              {preview.length === 0 ? (
                <div className="text-[11px] text-[var(--text-secondary)] italic py-2">
                  No actionable requirement detected in this paragraph. That's a valid result — not every text contains concrete obligations.
                </div>
              ) : (
                <div className="space-y-2">
                  {preview.map((req) => {
                    const badge = PRIORITY_BADGE[req.priority];
                    return (
                      <div
                        key={req._localId}
                        className={`rounded border bg-[var(--surface-base)] p-2.5 space-y-2 transition-opacity ${
                          req._selected
                            ? 'border-[#7c3aed]/40'
                            : 'border-[var(--border-subtle)] opacity-45'
                        }`}
                      >
                        {/* Checkbox + Priority + Title + Delete */}
                        <div className="flex items-start gap-2">
                          <input
                            type="checkbox"
                            checked={req._selected}
                            onChange={() => toggleSelect(req._localId)}
                            className="mt-1 shrink-0 w-3.5 h-3.5 accent-[#7c3aed] cursor-pointer"
                            title={req._selected ? 'Deselect — will not be saved' : 'Select for saving'}
                          />
                          <select
                            value={req.priority}
                            onChange={(e) => updateField(req._localId, 'priority', e.target.value as Priority)}
                            className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded border-none outline-none cursor-pointer shrink-0"
                            style={{ backgroundColor: badge.bg, color: badge.fg }}
                            title="Change priority"
                          >
                            <option value="must">MUST</option>
                            <option value="should">SHOULD</option>
                            <option value="may">MAY</option>
                          </select>
                          <input
                            type="text"
                            value={req.title}
                            onChange={(e) => updateField(req._localId, 'title', e.target.value)}
                            className="flex-1 rounded border border-transparent hover:border-[var(--border-subtle)] focus:border-[#7c3aed] bg-transparent px-1.5 py-0.5 text-[13px] font-semibold text-white outline-none"
                            placeholder="Imperative title (5-200 chars)"
                          />
                          <button
                            onClick={() => removeOne(req._localId)}
                            className="text-[var(--text-tertiary)] hover:text-red-400 transition shrink-0 mt-0.5"
                            title="Remove"
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>

                        {/* Description — auto-growing, never clipped */}
                        <AutoTextarea
                          value={req.description}
                          onChange={(v) => updateField(req._localId, 'description', v)}
                          minRows={2}
                          className="w-full rounded border border-transparent hover:border-[var(--border-subtle)] focus:border-[#7c3aed] bg-transparent px-1.5 py-1 text-[12px] text-[var(--text-secondary)] outline-none leading-relaxed"
                          placeholder="Concrete action: WHAT must be done HOW?"
                        />

                        {/* Two explainability scores */}
                        <div className="flex items-center gap-2">
                          <ScorePill
                            label="Extraction"
                            value={req.extractionConfidence ?? 0}
                            tip="How certain the AI is that this is a genuine legal obligation stated in the text (anti-hallucination)."
                          />
                          <ScorePill
                            label="Mapping"
                            value={req.mappingConfidence ?? 0}
                            tip="How well the linked architecture elements actually implement this obligation. 0 = no element matched."
                          />
                        </div>

                        {/* Linked Elements */}
                        {req.linkedElementIds.length > 0 && (
                          <div className="flex items-center gap-1.5 flex-wrap pt-1 border-t border-[var(--border-subtle)]/40">
                            <Link2 size={11} className="text-[var(--text-tertiary)]" />
                            {req.linkedElementIds.map((id) => {
                              const el = elementById(id);
                              return (
                                <span
                                  key={id}
                                  className="inline-flex items-center gap-1 text-[11px] px-1.5 py-0.5 rounded bg-[#7c3aed]/15 text-[#a78bfa] border border-[#7c3aed]/30"
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
                                    title="Remove link"
                                  >
                                    <X size={9} />
                                  </button>
                                </span>
                              );
                            })}
                          </div>
                        )}

                        {/* Audit rationales — the "why" behind score + element choice */}
                        <div className="space-y-1 rounded bg-black/20 p-1.5 border border-[var(--border-subtle)]/40">
                          <RationaleField
                            icon={<Info size={11} />}
                            label="Why score"
                            value={req.extractionRationale ?? ''}
                            onChange={(v) => updateField(req._localId, 'extractionRationale', v)}
                            placeholder="Why is this a genuine obligation from the text?"
                          />
                          <RationaleField
                            icon={<ScanSearch size={11} />}
                            label="Why elements"
                            value={req.mappingRationale ?? ''}
                            onChange={(v) => updateField(req._localId, 'mappingRationale', v)}
                            placeholder="Why exactly these elements must implement it?"
                          />
                        </div>
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
              <span className="text-xs text-[var(--text-secondary)]">Claude is extracting requirements…</span>
              <span className="text-[10px] text-[var(--text-tertiary)]">
                {elements.length > 60 ? '~20–40 seconds' : '~10 seconds'} — Haiku 4.5 analyzes against {elements.length} architecture elements + writes its reasoning
              </span>
            </div>
          )}
          </>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between p-4 border-t border-[var(--border-subtle)] bg-[var(--surface-base)]">
          <div className="text-[10px] text-[var(--text-tertiary)]">
            Architecture context: {elements.length} elements in project
          </div>
          <div className="flex items-center gap-2">
            {savedIds !== null ? (
              <>
                <button
                  onClick={onClose}
                  disabled={isProjecting}
                  className="rounded-md border border-[var(--border-subtle)] px-3 py-1.5 text-xs text-[var(--text-secondary)] hover:text-white transition disabled:opacity-50"
                >
                  Done
                </button>
                <button
                  onClick={handleProjectToModel}
                  disabled={isProjecting}
                  className="flex items-center gap-1.5 rounded-md px-4 py-1.5 text-xs font-semibold transition disabled:opacity-60"
                  style={{
                    background: 'linear-gradient(135deg, #7c3aed 0%, #a78bfa 100%)',
                    color: '#fff',
                    boxShadow: '0 0 12px rgba(124,58,237,0.35)',
                  }}
                >
                  {isProjecting ? <Loader2 size={12} className="animate-spin" /> : <Network size={12} />}
                  {isProjecting ? 'Adding…' : 'Add to architecture model'}
                </button>
              </>
            ) : (
            <>
            <button
              onClick={onClose}
              className="rounded-md border border-[var(--border-subtle)] px-3 py-1.5 text-xs text-[var(--text-secondary)] hover:text-white transition"
              disabled={isLoading || isPersisting}
            >
              Cancel
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
                {isLoading ? 'Analyzing…' : 'Generate Requirements'}
              </button>
            ) : (
              <>
                <button
                  onClick={() => { setPreview(null); setDurationMs(null); }}
                  disabled={isPersisting}
                  className="text-xs text-[var(--text-tertiary)] hover:text-white transition"
                >
                  Back
                </button>
                <button
                  onClick={handleAccept}
                  disabled={isPersisting || selectedCount === 0}
                  className="flex items-center gap-1.5 rounded-md px-4 py-1.5 text-xs font-semibold transition disabled:opacity-60"
                  style={{
                    background: 'linear-gradient(135deg, #7c3aed 0%, #a78bfa 100%)',
                    color: '#fff',
                    boxShadow: '0 0 12px rgba(124,58,237,0.35)',
                  }}
                >
                  {isPersisting ? <Loader2 size={12} className="animate-spin" /> : <CheckCircle2 size={12} />}
                  {isPersisting
                    ? 'Saving…'
                    : `Save ${selectedCount} requirement${selectedCount === 1 ? '' : 's'}`}
                </button>
              </>
            )}
            </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
