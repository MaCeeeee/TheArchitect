// ─── UC-REQGEN-001 (THE-305 Fläche A) ──────────────────────────────────────
// Actionable compliance requirements linked to the selected element.
// Reverse-lookup view shown in the PropertyPanel Compliance tab, beneath the
// Regulations block. Extracted from PropertyPanel for isolated testability.
import { useState, useEffect, useCallback, useMemo } from 'react';
import { Sparkles } from 'lucide-react';
import toast from 'react-hot-toast';
import { requirementsAPI, traceAPI, type TraceBackwardRequirement, type RequirementDoc } from '../../services/api';
import RequirementGatesBadge from './RequirementGatesBadge';
import EvidencePanel from './EvidencePanel';

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h4 className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-tertiary)] mb-2">{title}</h4>
      {children}
    </div>
  );
}

const REQ_PRIORITY_BADGE: Record<RequirementDoc['priority'], { label: string; bg: string; fg: string }> = {
  must:   { label: 'MUST',   bg: '#dc2626', fg: '#fff' },
  should: { label: 'SHOULD', bg: '#eab308', fg: '#0a0a0a' },
  may:    { label: 'MAY',    bg: '#3b82f6', fg: '#fff' },
};

const REQ_STATUS_OPTIONS: Array<{ value: RequirementDoc['status']; label: string }> = [
  { value: 'open', label: 'Open' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'done', label: 'Done' },
  { value: 'waived', label: 'Waived' },
];

const REQ_STATUS_COLOR: Record<RequirementDoc['status'], string> = {
  open: '#94a3b8',
  in_progress: '#3b82f6',
  done: '#22c55e',
  waived: '#64748b',
};

// Display order: severity-first (must › should › may), then open work before
// closed (open › in_progress › done › waived). The backend sorts priority
// alphabetically (may < must < should), which is NOT severity order — so the
// authoritative display sort lives here.
const REQ_PRIORITY_RANK: Record<RequirementDoc['priority'], number> = { must: 0, should: 1, may: 2 };
const REQ_STATUS_RANK: Record<RequirementDoc['status'], number> = { open: 0, in_progress: 1, done: 2, waived: 3 };

export function sortRequirementsForDisplay<
  T extends { priority: RequirementDoc['priority']; status: RequirementDoc['status'] },
>(reqs: T[]): T[] {
  return [...reqs].sort(
    (a, b) =>
      REQ_PRIORITY_RANK[a.priority] - REQ_PRIORITY_RANK[b.priority] ||
      REQ_STATUS_RANK[a.status] - REQ_STATUS_RANK[b.status],
  );
}

/** Labeled confidence pill for the PropertyPanel requirements (one of two axes). */
function ReqScorePill({ label, value, tip }: { label: string; value: number; tip: string }) {
  const color = value >= 0.9 ? '#22c55e' : value >= 0.7 ? '#eab308' : value >= 0.5 ? '#f97316' : '#ef4444';
  return (
    <span
      className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 bg-[rgba(255,255,255,0.04)] cursor-help"
      title={tip}
    >
      <span className="text-[7px] uppercase tracking-wider text-[var(--text-tertiary)]">{label}</span>
      <span className="text-[9px] font-mono font-semibold" style={{ color }}>{value.toFixed(2)}</span>
    </span>
  );
}

export function RequirementsForElementSection({
  projectId,
  elementId,
}: {
  projectId: string;
  elementId: string;
}) {
  const [requirements, setRequirements] = useState<RequirementDoc[] | null>(null);
  // THE-565: Anreicherung aus der trace-Route — Frist, Rechtsgrundlage,
  // Ausmustern-Impact. Optional: bei Fehler bleibt das heutige Verhalten.
  const [trace, setTrace] = useState<Map<string, TraceBackwardRequirement> | null>(null);
  const [impact, setImpact] = useState<{ wouldLoseCoverage: number; laws: string[] } | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);

  useEffect(() => {
    if (!projectId || !elementId) return;
    let cancelled = false;
    setIsLoading(true);
    void requirementsAPI
      .byElement(projectId, elementId)
      .then((res) => {
        if (cancelled) return;
        setRequirements((res.data?.data ?? []) as RequirementDoc[]);
      })
      .catch(() => {
        if (!cancelled) setRequirements([]);
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    void traceAPI
      .byElement(projectId, elementId)
      .then((res) => {
        if (cancelled) return;
        const data = res.data?.data;
        if (!data) return;
        setTrace(new Map(data.requirements.map((r) => [r.id, r])));
        setImpact(data.impact);
      })
      .catch(() => {
        /* Anreicherung optional — Grundfunktion bleibt (THE-305 byte-gleich). */
      });
    return () => {
      cancelled = true;
    };
  }, [projectId, elementId]);

  const handleStatusChange = useCallback(
    async (id: string, status: RequirementDoc['status']) => {
      // Optimistic update
      setRequirements((prev) =>
        prev?.map((r) => (r._id === id ? { ...r, status } : r)) ?? null,
      );
      setSavingId(id);
      try {
        await requirementsAPI.update(projectId, id, { status });
      } catch {
        toast.error('Status update failed');
      } finally {
        setSavingId(null);
      }
    },
    [projectId],
  );

  // THE-557: Notar-Akt — optimistisches Update, Server ist die Wahrheit.
  const setGate = useCallback(
    async (id: string, gate: 'enforced' | 'attested', state: 'yes' | 'no', reason: string) => {
      try {
        const { data } = await requirementsAPI.setGate(projectId, id, { gate, state, reason });
        setRequirements((prev) => prev?.map((r) => (r._id === id ? { ...r, gates: data.data?.gates ?? r.gates } : r)) ?? null);
        toast.success(`${gate} recorded`);
      } catch (err) {
        // THE-558: die Server-Begruendung ist die Botschaft — z. B. "attested
        // requires at least one fresh (non-stale) evidence record".
        const msg =
          (err as { response?: { data?: { error?: string } } })?.response?.data?.error ??
          'Failed to set gate';
        toast.error(msg);
      }
    },
    [projectId],
  );

  const sorted = useMemo(
    () => (requirements ? sortRequirementsForDisplay(requirements) : null),
    [requirements],
  );

  return (
    <Section title="Generated Requirements">
      {isLoading && (
        <div className="text-[10px] text-[var(--text-tertiary)] italic px-1">
          Loading requirements…
        </div>
      )}

      {!isLoading && sorted && sorted.length === 0 && (
        <div className="rounded border border-dashed border-[var(--border-subtle)] bg-[var(--surface-base)] p-2 text-[10px] text-[var(--text-tertiary)]">
          No requirements generated for this element yet.
        </div>
      )}

      {!isLoading && sorted && sorted.length > 0 && (() => {
        // UC-GAP-001 (THE-307) AC-3: per-element gap KPI — open work at a glance
        const openReqs = sorted.filter((r) => r.status === 'open' || r.status === 'in_progress');
        const openMust = openReqs.filter((r) => r.priority === 'must').length;
        return (
        <div className="space-y-1.5">
          {impact && impact.wouldLoseCoverage > 0 && (
            <div
              className="rounded border border-red-900/60 bg-red-950/30 px-2 py-1 text-[10px] text-red-300"
              data-testid="retirement-warning"
            >
              Retiring this element breaks {impact.wouldLoseCoverage} law{impact.wouldLoseCoverage === 1 ? '' : 's'} (
              {impact.laws.map((l) => l.toUpperCase()).join(', ')}) — it is the only linked measure there.
            </div>
          )}
          <div className="text-[9px] uppercase tracking-wider text-[var(--text-tertiary)] px-1" data-testid="req-element-kpi">
            {sorted.length} requirement{sorted.length === 1 ? '' : 's'} ·{' '}
            <span style={{ color: openReqs.length > 0 ? '#ef4444' : '#22c55e' }}>
              {openReqs.length} open
            </span>
            {openMust > 0 && (
              <span className="font-bold" style={{ color: '#dc2626' }}> ({openMust} MUST)</span>
            )}
          </div>
          {sorted.map((req) => {
            const badge = REQ_PRIORITY_BADGE[req.priority];
            return (
              <div
                key={req._id}
                className="rounded border border-[var(--border-subtle)] bg-[var(--surface-base)] p-2 space-y-1.5"
              >
                <div className="flex items-start gap-1.5">
                  <span
                    className="text-[8px] font-bold uppercase tracking-wider px-1 py-0.5 rounded shrink-0 mt-0.5"
                    style={{ backgroundColor: badge.bg, color: badge.fg }}
                  >
                    {badge.label}
                  </span>
                  <span className="text-[11px] font-semibold text-white leading-snug flex-1">
                    {req.title}
                  </span>
                </div>
                <p className="text-[10px] text-[var(--text-secondary)] leading-snug" title={req.description}>
                  {req.description}
                </p>
                {(() => {
                  const t = trace?.get(req._id);
                  if (!t) return null;
                  return (
                    <div className="flex flex-wrap items-center gap-1.5" data-testid="trace-chips">
                      <span className="rounded bg-[rgba(255,255,255,0.05)] px-1.5 py-0.5 text-[8px] uppercase tracking-wider text-[var(--text-tertiary)]">
                        {t.legalBasis}
                      </span>
                      {t.deadline && (
                        <span className="rounded bg-amber-950/40 px-1.5 py-0.5 text-[8px] font-medium text-amber-300">
                          {t.deadline.dauer.wert}{t.deadline.dauer.einheit} from {t.deadline.bezugspunkt}
                        </span>
                      )}
                      {t.soleCoverage && (
                        <span className="rounded bg-red-950/40 px-1.5 py-0.5 text-[8px] font-medium text-red-300">
                          sole coverage
                        </span>
                      )}
                    </div>
                  );
                })()}

                {/* Two explainability scores + their rationales (audit-grade) */}
                {(typeof req.extractionConfidence === 'number' || typeof req.mappingConfidence === 'number') && (
                  <div className="flex items-center gap-2">
                    {typeof req.extractionConfidence === 'number' && (
                      <ReqScorePill label="Extraction" value={req.extractionConfidence}
                        tip="AI certainty this is a genuine legal obligation (anti-hallucination)." />
                    )}
                    {typeof req.mappingConfidence === 'number' && (
                      <ReqScorePill label="Mapping" value={req.mappingConfidence}
                        tip="How well this element implements the obligation." />
                    )}
                  </div>
                )}
                {req.extractionRationale && (
                  <p className="text-[9px] text-[var(--text-tertiary)] leading-snug italic flex gap-1">
                    <span className="uppercase tracking-wider shrink-0 not-italic">Why score:</span>
                    <span>{req.extractionRationale}</span>
                  </p>
                )}
                {req.mappingRationale && (
                  <p className="text-[9px] text-[var(--text-tertiary)] leading-snug italic flex gap-1">
                    <span className="uppercase tracking-wider shrink-0 not-italic">Why here:</span>
                    <span>{req.mappingRationale}</span>
                  </p>
                )}
                <div className="flex items-center justify-between gap-2 pt-0.5">
                  <select
                    value={req.status}
                    onChange={(e) => handleStatusChange(req._id, e.target.value as RequirementDoc['status'])}
                    disabled={savingId === req._id}
                    aria-label={`Status: ${req.title}`}
                    className="text-[9px] rounded border border-[var(--border-subtle)] bg-[var(--surface-raised)] px-1.5 py-0.5 outline-none cursor-pointer disabled:opacity-50"
                    style={{ color: REQ_STATUS_COLOR[req.status] }}
                  >
                    {REQ_STATUS_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                  {req.createdBy === 'llm' && (
                    <span className="text-[8px] uppercase tracking-wider text-[var(--text-tertiary)] flex items-center gap-0.5">
                      <Sparkles size={8} /> AI
                    </span>
                  )}
                  {/* THE-557: Drei-Tore-Tripel — neben dem Status, nicht statt seiner */}
                  <RequirementGatesBadge
                    gates={req.gates}
                    onSet={(gate, state, reason) => void setGate(req._id, gate, state, reason)}
                  />
                </div>
                {/* THE-576: Belegen gehört neben das Attestieren. Das Bauteil
                    setzt selbst KEIN Tor — es zeigt nur, ob das Attest gedeckt
                    ist, und lässt Nachweise anhängen. */}
                {projectId && (
                  <EvidencePanel
                    projectId={projectId}
                    requirementId={req._id}
                    attested={req.gates?.attested?.state === 'yes'}
                  />
                )}
              </div>
            );
          })}
        </div>
        );
      })()}
    </Section>
  );
}
