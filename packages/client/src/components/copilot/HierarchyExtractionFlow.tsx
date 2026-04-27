// UC-ADD-004 Generator C — Multi-Step UI: Upload → Phases → Tree-Preview → Apply
// Reuses Modal.tsx base + HierarchyTree.tsx

import { useEffect, useMemo, useState } from 'react';
import { Upload, Loader2, CheckCircle2, AlertTriangle, FileText, Sparkles } from 'lucide-react';
import Modal from '../../design-system/patterns/Modal';
import {
  useHierarchyGenerator,
  type AcceptState,
  type PhaseStatus,
  type HierarchyPhase,
  type ExtractedHierarchy,
} from '../../hooks/useHierarchyGenerator';
import HierarchyTree, { type TogglePath } from './HierarchyTree';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  projectId: string | null;
  onApplied?: () => void;
}

type Step = 'upload' | 'extracting' | 'preview';

export default function HierarchyExtractionFlow({ isOpen, onClose, projectId, onApplied }: Props) {
  const generator = useHierarchyGenerator(projectId);
  const [step, setStep] = useState<Step>('upload');
  const [file, setFile] = useState<File | null>(null);
  const [accept, setAccept] = useState<AcceptState>(EMPTY_ACCEPT);
  const [expanded, setExpanded] = useState<Set<string>>(new Set(['vision', 'stakeholders']));
  const [isApplying, setIsApplying] = useState(false);
  const [applyResult, setApplyResult] = useState<{ counts?: Record<string, number>; error?: string } | null>(null);

  // Auto-init accept-state as items stream in (default: everything accepted)
  useEffect(() => {
    setAccept((prev) => ({
      vision: prev.vision !== false,
      stakeholders: ensureLength(prev.stakeholders, generator.state.hierarchy.stakeholders.length, true),
      capabilities: ensureLength(prev.capabilities, generator.state.hierarchy.capabilities.length, true),
      processes: ensureLength(prev.processes, generator.state.hierarchy.processes.length, true),
      activities: ensureLength(prev.activities, generator.state.hierarchy.activities.length, true),
    }));
  }, [
    generator.state.hierarchy.stakeholders.length,
    generator.state.hierarchy.capabilities.length,
    generator.state.hierarchy.processes.length,
    generator.state.hierarchy.activities.length,
  ]);

  // Step transitions based on generator status
  useEffect(() => {
    if (generator.state.status === 'idle') return;
    if (['vision', 'stakeholders', 'capabilities', 'processes', 'activities', 'extracted'].includes(generator.state.status)) {
      setStep('extracting');
    }
    if (generator.state.status === 'done') setStep('preview');
  }, [generator.state.status]);

  // Reset on close
  useEffect(() => {
    if (!isOpen) {
      setStep('upload');
      setFile(null);
      setAccept(EMPTY_ACCEPT);
      setApplyResult(null);
      generator.reset();
    }
  }, [isOpen, generator]);

  const handleFilePicked = (f: File) => {
    setFile(f);
  };

  const handleStart = async () => {
    if (!file) return;
    setStep('extracting');
    await generator.generateFromFile(file);
  };

  const handleToggle = (path: TogglePath) => {
    const h = generator.state.hierarchy;
    setAccept((prev) => {
      switch (path.kind) {
        case 'vision':
          return { ...prev, vision: !prev.vision };
        case 'stakeholder': {
          const next = [...prev.stakeholders];
          next[path.index] = !next[path.index];
          return { ...prev, stakeholders: next };
        }
        case 'stakeholders-all': {
          const allAccepted = prev.stakeholders.every(Boolean);
          return { ...prev, stakeholders: prev.stakeholders.map(() => !allAccepted) };
        }
        case 'capability': {
          const next = [...prev.capabilities];
          next[path.index] = !next[path.index];
          return { ...prev, capabilities: next };
        }
        case 'capability-cascade': {
          const next = [...prev.capabilities];
          next[path.index] = !next[path.index];
          // Cascade: also flip all child processes (and their activities) of this capability
          const childProcessIdx = h.processes
            .map((p, i) => ({ p, i }))
            .filter((x) => x.p.parentCapability === path.capabilityName)
            .map((x) => x.i);
          const procFlag = next[path.index];
          const newProcesses = [...prev.processes];
          for (const idx of childProcessIdx) newProcesses[idx] = procFlag;
          // Cascade further to activities of those processes
          const processNames = childProcessIdx.map((idx) => h.processes[idx]?.name).filter(Boolean) as string[];
          const childActIdx = h.activities
            .map((a, i) => ({ a, i }))
            .filter((x) => processNames.includes(x.a.parentProcess))
            .map((x) => x.i);
          const newActivities = [...prev.activities];
          for (const idx of childActIdx) newActivities[idx] = procFlag;
          return { ...prev, capabilities: next, processes: newProcesses, activities: newActivities };
        }
        case 'process': {
          const next = [...prev.processes];
          next[path.index] = !next[path.index];
          return { ...prev, processes: next };
        }
        case 'process-cascade': {
          const next = [...prev.processes];
          next[path.index] = !next[path.index];
          const procFlag = next[path.index];
          const childActIdx = h.activities
            .map((a, i) => ({ a, i }))
            .filter((x) => x.a.parentProcess === path.processName)
            .map((x) => x.i);
          const newActivities = [...prev.activities];
          for (const idx of childActIdx) newActivities[idx] = procFlag;
          return { ...prev, processes: next, activities: newActivities };
        }
        case 'activity': {
          const next = [...prev.activities];
          next[path.index] = !next[path.index];
          return { ...prev, activities: next };
        }
        default:
          return prev;
      }
    });
  };

  const handleExpand = (key: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const totalsToApply = useMemo(
    () => ({
      vision: accept.vision ? 1 : 0,
      stakeholders: accept.stakeholders.filter(Boolean).length,
      capabilities: accept.capabilities.filter(Boolean).length,
      processes: accept.processes.filter(Boolean).length,
      activities: accept.activities.filter(Boolean).length,
    }),
    [accept],
  );

  const totalAccepted =
    totalsToApply.vision +
    totalsToApply.stakeholders +
    totalsToApply.capabilities +
    totalsToApply.processes +
    totalsToApply.activities;

  const handleApply = async () => {
    setIsApplying(true);
    setApplyResult(null);
    const result = await generator.applyHierarchy(generator.state.hierarchy, accept);
    setApplyResult({ counts: result.counts, error: result.error });
    setIsApplying(false);
    if (result.success) {
      onApplied?.();
      // Close after short delay so user sees the success-counts
      setTimeout(() => onClose(), 1500);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="AI · Generate Architecture from Document"
      size="lg"
      footer={
        step === 'upload' ? (
          <>
            <button onClick={onClose} className="rounded-md border border-[var(--border-subtle)] px-3 py-1.5 text-xs text-[var(--text-secondary)] hover:bg-[var(--surface-base)]">
              Cancel
            </button>
            <button
              onClick={handleStart}
              disabled={!file}
              className="flex items-center gap-1.5 rounded-md bg-[#00ff41] px-4 py-1.5 text-xs font-semibold text-[#0a0a0a] hover:bg-[#33ff66] disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Sparkles size={12} />
              Start Extraction
            </button>
          </>
        ) : step === 'preview' ? (
          <>
            <button onClick={onClose} disabled={isApplying} className="rounded-md border border-[var(--border-subtle)] px-3 py-1.5 text-xs text-[var(--text-secondary)] hover:bg-[var(--surface-base)] disabled:opacity-50">
              Cancel
            </button>
            <button
              onClick={handleApply}
              disabled={totalAccepted === 0 || isApplying}
              className="flex items-center gap-1.5 rounded-md bg-[#00ff41] px-4 py-1.5 text-xs font-semibold text-[#0a0a0a] hover:bg-[#33ff66] disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {isApplying ? <><Loader2 size={12} className="animate-spin" />Applying…</> : <><CheckCircle2 size={12} />Apply {totalAccepted} elements</>}
            </button>
          </>
        ) : (
          <button onClick={onClose} className="rounded-md border border-[var(--border-subtle)] px-3 py-1.5 text-xs text-[var(--text-secondary)] hover:bg-[var(--surface-base)]">
            Cancel
          </button>
        )
      }
    >
      {step === 'upload' && (
        <UploadStep file={file} onPick={handleFilePicked} />
      )}

      {step === 'extracting' && (
        <ExtractingStep
          phaseStatus={generator.state.phaseStatus}
          status={generator.state.status}
          hierarchy={generator.state.hierarchy}
          ragIngested={generator.state.ragIngested}
          documentChars={generator.state.documentChars}
          error={generator.state.error}
        />
      )}

      {step === 'preview' && (
        <PreviewStep
          hierarchy={generator.state.hierarchy}
          accept={accept}
          onToggle={handleToggle}
          expanded={expanded}
          onExpand={handleExpand}
          totalsToApply={totalsToApply}
          durationMs={generator.state.durationMs}
          tokenEstimate={generator.state.tokenEstimate}
          applyResult={applyResult}
        />
      )}
    </Modal>
  );
}

// ─── Step components ────────────────────────────────────────────────────────

function UploadStep({ file, onPick }: { file: File | null; onPick: (f: File) => void }) {
  return (
    <div className="space-y-3">
      <p className="text-xs text-[var(--text-secondary)]">
        Upload a regulatory document (PDF, DOCX, PPTX) — Claude extracts a complete architecture hierarchy:
        Mission, Vision, Stakeholders, Capabilities, Processes, and Activities.
      </p>
      <label
        htmlFor="hierarchy-upload"
        className="block cursor-pointer rounded-lg border-2 border-dashed border-[var(--border-subtle)] bg-[var(--surface-base)] px-6 py-8 text-center hover:border-[#00ff41] transition"
      >
        <Upload size={28} className="mx-auto text-[var(--text-tertiary)] mb-2" />
        {file ? (
          <>
            <div className="text-xs font-semibold text-[#33ff66]">{file.name}</div>
            <div className="text-[10px] text-[var(--text-tertiary)] mt-1">
              {(file.size / 1024 / 1024).toFixed(2)} MB · click to replace
            </div>
          </>
        ) : (
          <>
            <div className="text-xs text-[var(--text-secondary)]">Click to pick a document</div>
            <div className="text-[10px] text-[var(--text-tertiary)] mt-1">PDF, DOCX, PPTX · max 25 MB</div>
          </>
        )}
        <input
          id="hierarchy-upload"
          type="file"
          accept=".pdf,.docx,.pptx,application/pdf"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onPick(f);
          }}
        />
      </label>
      <div className="text-[10px] text-[var(--text-tertiary)]">
        ⓘ Document is also ingested into your project's RAG collection for future Activity-Generation queries.
      </div>
    </div>
  );
}

function ExtractingStep({
  phaseStatus, status, hierarchy, ragIngested, documentChars, error,
}: {
  phaseStatus: PhaseStatus;
  status: HierarchyPhase;
  hierarchy: ExtractedHierarchy;
  ragIngested: boolean;
  documentChars: number;
  error: string | null;
}) {
  return (
    <div className="space-y-3">
      <div className="rounded-md bg-[var(--surface-base)] border border-[var(--border-subtle)] p-3">
        <div className="flex items-center gap-2 text-[11px] text-[var(--text-secondary)]">
          <FileText size={12} />
          <span>{(documentChars / 1000).toFixed(1)}k chars extracted</span>
          {ragIngested && (
            <span className="ml-auto rounded bg-[#00ff41]/10 px-1.5 py-0.5 text-[10px] text-[#33ff66]">
              RAG ingested
            </span>
          )}
        </div>
      </div>

      <div className="space-y-1.5">
        <PhaseRow name="Vision & Mission" state={phaseStatus.vision} count={hierarchy.vision ? 1 + hierarchy.vision.visionStatements.length : 0} />
        <PhaseRow name="Stakeholders" state={phaseStatus.stakeholders} count={hierarchy.stakeholders.length} />
        <PhaseRow name="Capabilities" state={phaseStatus.capabilities} count={hierarchy.capabilities.length} />
        <PhaseRow name="Processes" state={phaseStatus.processes} count={hierarchy.processes.length} />
        <PhaseRow name="Activities" state={phaseStatus.activities} count={hierarchy.activities.length} />
      </div>

      {status === 'error' && error && (
        <div className="rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-[11px] text-red-300 flex items-start gap-2">
          <AlertTriangle size={14} className="shrink-0 mt-0.5" />
          {error}
        </div>
      )}
    </div>
  );
}

function PhaseRow({ name, state, count }: { name: string; state: 'pending' | 'active' | 'done'; count: number }) {
  return (
    <div className="flex items-center gap-2 text-[11px]">
      <span className="w-4 shrink-0">
        {state === 'done' ? (
          <CheckCircle2 size={14} className="text-[#33ff66]" />
        ) : state === 'active' ? (
          <Loader2 size={14} className="animate-spin text-[#00ff41]" />
        ) : (
          <span className="block h-2 w-2 rounded-full bg-[var(--border-subtle)] ml-1" />
        )}
      </span>
      <span className={state === 'pending' ? 'text-[var(--text-tertiary)]' : 'text-[var(--text-secondary)]'}>
        {name}
      </span>
      {count > 0 && (
        <span className="ml-auto rounded bg-[var(--surface-base)] px-1.5 py-0.5 font-mono text-[10px] text-[#33ff66]">
          {count}
        </span>
      )}
    </div>
  );
}

function PreviewStep({
  hierarchy, accept, onToggle, expanded, onExpand, totalsToApply, durationMs, tokenEstimate, applyResult,
}: {
  hierarchy: ExtractedHierarchy;
  accept: AcceptState;
  onToggle: (p: TogglePath) => void;
  expanded: Set<string>;
  onExpand: (key: string) => void;
  totalsToApply: Record<string, number>;
  durationMs: number | null;
  tokenEstimate: number;
  applyResult: { counts?: Record<string, number>; error?: string } | null;
}) {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 rounded-md border border-[var(--border-subtle)] bg-[var(--surface-base)] px-3 py-2 text-[10px]">
        <CheckCircle2 size={12} className="text-[#33ff66]" />
        <span className="text-[var(--text-secondary)]">
          Extraction complete in {durationMs !== null ? `${(durationMs / 1000).toFixed(1)}s` : '—'} · {tokenEstimate.toLocaleString()} tokens
        </span>
        <span className="ml-auto text-[var(--text-tertiary)]">
          Applying: V {totalsToApply.vision} · S {totalsToApply.stakeholders} · C {totalsToApply.capabilities} · P {totalsToApply.processes} · A {totalsToApply.activities}
        </span>
      </div>

      <div className="max-h-[440px] overflow-y-auto pr-1">
        <HierarchyTree
          hierarchy={hierarchy}
          accept={accept}
          onToggle={onToggle}
          expanded={expanded}
          onExpand={onExpand}
        />
      </div>

      {applyResult && applyResult.error && (
        <div className="rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-[11px] text-red-300 flex items-start gap-2">
          <AlertTriangle size={14} className="shrink-0 mt-0.5" />
          {applyResult.error}
        </div>
      )}
      {applyResult && applyResult.counts && (
        <div className="rounded-md border border-[#00ff41]/40 bg-[#00ff41]/10 px-3 py-2 text-[11px] text-[#33ff66]">
          ✓ Applied {Object.entries(applyResult.counts).map(([k, v]) => `${v} ${k}`).join(' · ')}
        </div>
      )}
    </div>
  );
}

// ─── Helpers ────────────────────────────────────────────────────────────────

const EMPTY_ACCEPT: AcceptState = {
  vision: true,
  stakeholders: [],
  capabilities: [],
  processes: [],
  activities: [],
};

function ensureLength(arr: boolean[], length: number, fillWith: boolean): boolean[] {
  if (arr.length === length) return arr;
  if (arr.length > length) return arr.slice(0, length);
  return [...arr, ...Array(length - arr.length).fill(fillWith)];
}
