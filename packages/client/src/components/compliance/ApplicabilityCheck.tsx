/**
 * ApplicabilityCheck (UC-LAW-001) — "Which laws apply to this architecture?"
 *
 * Deterministic applicability radar over the architecture elements (incl. the
 * AI-wizard/Blueprint-generated ones) and project context. Renders the ranked
 * assessments with evidence and lets the user push an applicable corpus law
 * straight into the compliance pipeline (same adapter as RegulationsPanel).
 * Decision support, not legal advice — the disclaimer is always visible.
 */
import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import {
  Radar,
  Loader2,
  PlusCircle,
  CheckCircle2,
  AlertCircle,
  ChevronDown,
  ChevronRight,
  RefreshCw,
  Sparkles,
  Scale,
  X,
} from 'lucide-react';
import toast from 'react-hot-toast';
import type {
  ApplicabilityReport,
  NormApplicabilityAssessment,
  ApplicabilityVerdict,
  DiscoveryAvailability,
  DiscoveryFinding,
} from '@thearchitect/shared';
import { normsAPI } from '../../services/api';
import { useComplianceStore } from '../../stores/complianceStore';

const VERDICT_META: Record<ApplicabilityVerdict, { label: string; badge: string; bar: string }> = {
  applicable: { label: 'Applies', badge: 'border-amber-500/40 bg-amber-500/10 text-amber-400', bar: '#f59e0b' },
  likely: { label: 'Likely applies', badge: 'border-sky-500/40 bg-sky-500/10 text-sky-400', bar: '#38bdf8' },
  possible: { label: 'Possible', badge: 'border-slate-500/40 bg-slate-500/10 text-slate-400', bar: '#94a3b8' },
  not_indicated: { label: 'No indication', badge: 'border-[var(--border-subtle)] bg-transparent text-[var(--text-tertiary)]', bar: '#475569' },
};

export default function ApplicabilityCheck() {
  const { projectId } = useParams();
  const loadPipelineStatus = useComplianceStore((s) => s.loadPipelineStatus);
  const [report, setReport] = useState<ApplicabilityReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [showNotIndicated, setShowNotIndicated] = useState(false);
  const [addingId, setAddingId] = useState<string | null>(null);

  // UC-LAW-002 Slice-2b (THE-464) — "Discover from corpus" additive state.
  const [discovery, setDiscovery] = useState<DiscoveryAvailability | null>(null);
  const [discovering, setDiscovering] = useState(false);
  const [decidingKey, setDecidingKey] = useState<string | null>(null);
  const [showRejected, setShowRejected] = useState(false);
  const [rejectedFindings, setRejectedFindings] = useState<DiscoveryFinding[] | null>(null);
  const [loadingRejected, setLoadingRejected] = useState(false);

  const load = useCallback(async () => {
    if (!projectId) return;
    setLoading(true);
    setError(null);
    try {
      const { data } = await normsAPI.applicability(projectId);
      setReport(data?.data ?? null);
      setDiscovery(data?.discovery ?? null);
    } catch {
      setError('Failed to assess applicability');
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    void load();
  }, [load]);

  const discoverFromCorpus = async () => {
    if (!projectId) return;
    setDiscovering(true);
    try {
      const { data } = await normsAPI.discover(projectId);
      setReport(data?.data ?? null);
      toast.success('Corpus discovery complete');
    } catch {
      toast.error('Failed to discover from corpus');
    } finally {
      setDiscovering(false);
    }
  };

  const decisionKey = (a: NormApplicabilityAssessment) => `${a.ruleId}:${a.corpus?.corpusVersionHash ?? ''}`;

  const decideFinding = async (a: NormApplicabilityAssessment, action: 'confirm' | 'reject') => {
    if (!projectId || !a.corpus) return;
    const key = decisionKey(a);
    setDecidingKey(key);
    try {
      if (action === 'confirm') {
        await normsAPI.confirmFinding(projectId, a.ruleId, a.corpus.corpusVersionHash);
        setReport(prev =>
          prev
            ? {
                ...prev,
                assessments: prev.assessments.map(x =>
                  x.ruleId === a.ruleId && x.corpus ? { ...x, corpus: { ...x.corpus, status: 'confirmed' } } : x,
                ),
              }
            : prev,
        );
        toast.success(`${a.label} confirmed`);
      } else {
        await normsAPI.rejectFinding(projectId, a.ruleId, a.corpus.corpusVersionHash);
        setReport(prev => {
          if (!prev) return prev;
          if (a.provenance === 'corpus') {
            // The assessment exists ONLY because of this judge finding — drop it entirely.
            return { ...prev, assessments: prev.assessments.filter(x => x.ruleId !== a.ruleId) };
          }
          // provenance 'both' — the authoritative Stage-A verdict stays; only the corpus block goes.
          return {
            ...prev,
            assessments: prev.assessments.map(x =>
              x.ruleId === a.ruleId ? { ...x, provenance: 'rules' as const, corpus: undefined } : x,
            ),
          };
        });
        toast.success(`${a.label} rejected`);
      }
    } catch {
      toast.error(`Failed to ${action} ${a.label}`);
    } finally {
      setDecidingKey(null);
    }
  };

  const toggleRejected = async () => {
    const next = !showRejected;
    setShowRejected(next);
    if (next && rejectedFindings === null && projectId) {
      setLoadingRejected(true);
      try {
        const { data } = await normsAPI.discoveryFindings(projectId);
        const all = (data?.data ?? []) as DiscoveryFinding[];
        setRejectedFindings(all.filter(f => f.status === 'rejected'));
      } catch {
        setRejectedFindings([]);
      } finally {
        setLoadingRejected(false);
      }
    }
  };

  const addToPipeline = async (a: NormApplicabilityAssessment) => {
    if (!projectId || !a.workId) return;
    setAddingId(a.ruleId);
    try {
      await normsAPI.addToPipeline(projectId, a.workId);
      toast.success(`${a.label} added to pipeline`);
      await Promise.all([loadPipelineStatus(projectId), load()]);
    } catch {
      toast.error(`Failed to add ${a.label} to pipeline`);
    } finally {
      setAddingId(null);
    }
  };

  const signalById = new Map((report?.signals ?? []).map((s) => [s.id, s]));
  const indicated = (report?.assessments ?? []).filter((a) => a.verdict !== 'not_indicated');
  const notIndicated = (report?.assessments ?? []).filter((a) => a.verdict === 'not_indicated');

  const renderAssessment = (a: NormApplicabilityAssessment) => {
    const meta = VERDICT_META[a.verdict];
    const expanded = expandedId === a.ruleId;
    const canAdd = Boolean(a.workId) && !a.inPipeline && a.availableInCorpus;
    return (
      <li key={a.ruleId} className="py-3">
        <div className="flex items-start justify-between gap-3">
          <button
            onClick={() => setExpandedId(expanded ? null : a.ruleId)}
            className="flex min-w-0 flex-1 items-start gap-2 text-left"
            aria-expanded={expanded}
          >
            {expanded ? (
              <ChevronDown size={14} className="mt-0.5 shrink-0 text-[var(--text-tertiary)]" />
            ) : (
              <ChevronRight size={14} className="mt-0.5 shrink-0 text-[var(--text-tertiary)]" />
            )}
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="truncate text-sm text-[var(--text-primary)]">{a.label}</span>
                <span className={`shrink-0 rounded border px-1.5 py-0.5 text-[10px] font-medium ${meta.badge}`}>
                  {meta.label}
                </span>
                {a.referenced && (
                  <span className="shrink-0 text-[10px] text-emerald-400">referenced</span>
                )}
                {(a.provenance === 'both' || a.provenance === 'corpus') && (
                  <span className="shrink-0 rounded border border-[#7c3aed]/40 bg-[#7c3aed]/10 px-1.5 py-0.5 text-[10px] font-medium text-[#7c3aed]">
                    {a.provenance === 'both' ? 'rules+corpus' : 'corpus'}
                  </span>
                )}
                {a.corpus?.status === 'auto' && (
                  <span className="shrink-0 rounded border border-amber-500/40 bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-medium text-amber-400">
                    auto — needs review
                  </span>
                )}
                {a.corpus?.status === 'confirmed' && (
                  <span className="shrink-0 rounded border border-emerald-500/40 bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-medium text-emerald-400">
                    confirmed
                  </span>
                )}
                {a.corpus?.stale && (
                  <span
                    title="The corpus paragraphs behind this finding changed since it was judged — re-run discovery."
                    className="shrink-0 rounded border border-slate-500/40 bg-slate-500/10 px-1.5 py-0.5 text-[10px] font-medium text-slate-400"
                  >
                    stale evidence
                  </span>
                )}
              </div>
              <div className="mt-0.5 text-[10px] uppercase tracking-wider text-[var(--text-tertiary)]">
                {a.kind.replace(/_/g, ' ')} · {a.jurisdiction} · {a.bindingness.replace(/-/g, ' ')}
              </div>
              {/* Score bar */}
              <div className="mt-1.5 h-1 w-36 overflow-hidden rounded bg-[var(--border-subtle)]">
                <div
                  className="h-full rounded transition-all"
                  style={{ width: `${Math.round(a.score * 100)}%`, backgroundColor: meta.bar }}
                />
              </div>
            </div>
          </button>

          {a.inPipeline ? (
            <span className="flex shrink-0 items-center gap-1 text-xs text-emerald-400">
              <CheckCircle2 size={14} /> In pipeline
            </span>
          ) : canAdd ? (
            <button
              onClick={() => void addToPipeline(a)}
              disabled={addingId === a.ruleId}
              className="flex shrink-0 items-center gap-1.5 rounded border border-[#7c3aed] px-2.5 py-1 text-xs text-[#7c3aed] transition hover:bg-[#7c3aed] hover:text-white disabled:opacity-50"
            >
              {addingId === a.ruleId ? (
                <Loader2 size={13} className="animate-spin" />
              ) : (
                <PlusCircle size={13} />
              )}
              Add to pipeline
            </button>
          ) : null}
        </div>

        {expanded && (
          <div className="ml-6 mt-2 space-y-2">
            <p className="text-xs text-[var(--text-secondary)]">{a.rationale}</p>
            {a.contributions.map((c) => {
              const signal = signalById.get(c.signalId);
              return (
                <div key={c.signalId} className="rounded border border-[var(--border-subtle)] p-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[11px] font-medium text-[var(--text-secondary)]">
                      {c.signalLabel}
                    </span>
                    <span className="text-[10px] text-[var(--text-tertiary)]">
                      weight {Math.round(c.weight * 100)}%
                      {signal ? ` · ${signal.matchCount} match${signal.matchCount === 1 ? '' : 'es'}` : ''}
                    </span>
                  </div>
                  {signal && signal.evidence.length > 0 && (
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      {signal.evidence.map((e, i) => (
                        <span
                          key={`${e.elementId ?? e.name}-${i}`}
                          title={e.detail}
                          className="flex items-center gap-1 rounded bg-[var(--surface-base)] px-1.5 py-0.5 text-[10px] text-[var(--text-secondary)]"
                        >
                          {e.fromWizard && <Sparkles size={9} className="text-[#7c3aed]" />}
                          {e.name}
                        </span>
                      ))}
                      {signal.matchCount > signal.evidence.length && (
                        <span className="text-[10px] text-[var(--text-tertiary)]">
                          +{signal.matchCount - signal.evidence.length} more
                        </span>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
            {a.corpus && (
              <div className="rounded border border-[#7c3aed]/30 bg-[#7c3aed]/5 p-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11px] font-medium text-[#7c3aed]">Corpus evidence</span>
                  <span className="text-[10px] text-[var(--text-tertiary)]">
                    AI judge confidence: {Math.round(a.corpus.confidence * 100)}% — separate from the deterministic score
                  </span>
                </div>
                <p className="mt-1 text-xs text-[var(--text-secondary)]">{a.corpus.reasoning}</p>
                {a.corpus.keyParagraphs.length > 0 && (
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {a.corpus.keyParagraphs.map(k => (
                      <span
                        key={k}
                        title={k}
                        className="rounded bg-[var(--surface-base)] px-1.5 py-0.5 text-[10px] text-[var(--text-secondary)]"
                      >
                        {k}
                      </span>
                    ))}
                  </div>
                )}
                {a.corpus.elementIds.length > 0 && (
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {a.corpus.elementIds.map(id => (
                      <span
                        key={id}
                        className="rounded bg-[var(--surface-base)] px-1.5 py-0.5 text-[10px] text-[var(--text-secondary)]"
                      >
                        {id}
                      </span>
                    ))}
                  </div>
                )}
                <p className="mt-1.5 text-[10px] text-[var(--text-tertiary)]">
                  Sources: {a.corpus.sources.join(', ')}
                </p>
                {a.corpus.status === 'auto' && (
                  <div className="mt-2 flex gap-2">
                    <button
                      onClick={() => void decideFinding(a, 'confirm')}
                      disabled={decidingKey === decisionKey(a)}
                      className="flex items-center gap-1 rounded border border-emerald-500/40 px-2 py-1 text-[10px] text-emerald-400 transition hover:bg-emerald-500/10 disabled:opacity-50"
                    >
                      <CheckCircle2 size={11} /> Confirm
                    </button>
                    <button
                      onClick={() => void decideFinding(a, 'reject')}
                      disabled={decidingKey === decisionKey(a)}
                      className="flex items-center gap-1 rounded border border-red-500/40 px-2 py-1 text-[10px] text-red-400 transition hover:bg-red-500/10 disabled:opacity-50"
                    >
                      <X size={11} /> Reject
                    </button>
                  </div>
                )}
              </div>
            )}
            {a.baselineNote && (
              <p className="text-[10px] italic text-[var(--text-tertiary)]">{a.baselineNote}</p>
            )}
          </div>
        )}
      </li>
    );
  };

  return (
    <div
      data-testid="applicability-check"
      className="mt-8 rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-raised)] p-4"
    >
      <div className="mb-1 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Radar size={16} className="text-[#7c3aed]" />
          <h3 className="text-sm font-semibold text-[var(--text-primary)]">
            Which laws apply to this architecture?
          </h3>
        </div>
        <div className="flex items-center gap-2">
          {discovery?.enabled && (
            <button
              onClick={() => void discoverFromCorpus()}
              disabled={discovering || !discovery.corpusConfigured || !discovery.providerConfigured}
              title={
                !discovery.corpusConfigured
                  ? 'Corpus not connected'
                  : !discovery.providerConfigured
                    ? 'No AI provider key configured'
                    : 'Runs an LLM analysis over the law corpus — provider costs apply.'
              }
              className="flex items-center gap-1 rounded border border-[#7c3aed]/40 px-2 py-1 text-[10px] text-[#7c3aed] transition hover:bg-[#7c3aed]/10 disabled:opacity-50"
            >
              {discovering ? <Loader2 size={11} className="animate-spin" /> : <Sparkles size={11} />}
              Discover from corpus
            </button>
          )}
          <button
            onClick={() => void load()}
            disabled={loading}
            title="Re-run check"
            className="flex items-center gap-1 rounded border border-[var(--border-subtle)] px-2 py-1 text-[10px] text-[var(--text-tertiary)] transition hover:text-[var(--text-primary)] disabled:opacity-50"
          >
            <RefreshCw size={11} className={loading ? 'animate-spin' : ''} /> Re-check
          </button>
        </div>
      </div>
      <p className={discovery?.enabled ? 'mb-1 text-xs text-[var(--text-tertiary)]' : 'mb-4 text-xs text-[var(--text-tertiary)]'}>
        Deterministic check over your architecture elements (including the ones generated by the
        AI wizard) and project context — each verdict carries its evidence.
      </p>
      {discovery?.enabled && (
        <p className="mb-4 text-[10px] text-[var(--text-tertiary)]">
          Runs an LLM analysis over the law corpus — provider costs apply.
        </p>
      )}

      {loading && (
        <div className="flex items-center gap-2 py-6 text-xs text-[var(--text-tertiary)]">
          <Loader2 size={14} className="animate-spin" /> Analyzing architecture…
        </div>
      )}

      {!loading && error && (
        <div className="flex items-center gap-2 py-4 text-xs text-red-400">
          <AlertCircle size={14} /> {error}
        </div>
      )}

      {!loading && !error && report && (
        <>
          {report.elementCount === 0 && (
            <p className="py-2 text-xs text-[var(--text-tertiary)]">
              No architecture elements yet — run the AI wizard (Blueprint) or model elements
              first, then re-check.
            </p>
          )}

          {indicated.length > 0 && (
            <ul className="divide-y divide-[var(--border-subtle)]">
              {indicated.map(renderAssessment)}
            </ul>
          )}

          {report.elementCount > 0 && indicated.length === 0 && (
            <p className="py-2 text-xs text-[var(--text-tertiary)]">
              No applicability signals detected in the current model.
            </p>
          )}

          {notIndicated.length > 0 && (
            <div className="mt-3">
              <button
                onClick={() => setShowNotIndicated(!showNotIndicated)}
                className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]"
              >
                {showNotIndicated ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
                No indication ({notIndicated.length})
              </button>
              {showNotIndicated && (
                <ul className="divide-y divide-[var(--border-subtle)]">
                  {notIndicated.map(renderAssessment)}
                </ul>
              )}
            </div>
          )}

          {discovery?.enabled && (
            <div className="mt-3">
              <button
                onClick={() => void toggleRejected()}
                className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]"
              >
                {showRejected ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
                Show rejected corpus findings{rejectedFindings ? ` (${rejectedFindings.length})` : ''}
              </button>
              {showRejected && (
                <>
                  {loadingRejected && (
                    <div className="flex items-center gap-2 py-2 text-[10px] text-[var(--text-tertiary)]">
                      <Loader2 size={11} className="animate-spin" /> Loading…
                    </div>
                  )}
                  {!loadingRejected && (rejectedFindings ?? []).length === 0 && (
                    <p className="py-2 text-[10px] text-[var(--text-tertiary)]">No rejected findings.</p>
                  )}
                  {!loadingRejected && (rejectedFindings ?? []).length > 0 && (
                    <ul className="mt-1 divide-y divide-[var(--border-subtle)] opacity-60">
                      {(rejectedFindings ?? []).map(f => (
                        <li key={`${f.family}-${f.corpusVersionHash}`} className="py-2">
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-[var(--text-secondary)]">{f.family}</span>
                            <span className="rounded border border-red-500/40 bg-red-500/10 px-1.5 py-0.5 text-[10px] text-red-400">
                              rejected
                            </span>
                          </div>
                          <p className="mt-0.5 text-[10px] text-[var(--text-tertiary)]">{f.reasoning}</p>
                        </li>
                      ))}
                    </ul>
                  )}
                </>
              )}
            </div>
          )}

          <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-[var(--border-subtle)] pt-3 text-[10px] text-[var(--text-tertiary)]">
            <span>
              {report.elementCount} elements analyzed
              {report.wizardElementCount > 0 && (
                <>
                  {' · '}
                  <Sparkles size={9} className="mb-0.5 inline text-[#7c3aed]" />{' '}
                  {report.wizardElementCount} from AI wizard
                </>
              )}
            </span>
            <span>Assumed jurisdictions: {report.assumedJurisdictions.join(', ')}</span>
          </div>
          {report.coverage && (
            <p className="mt-1 text-[10px] text-[var(--text-tertiary)]">
              Stage A: {report.coverage.stageARuleCount} rules · Stage B: {report.coverage.stageBCorpusCount} corpus laws
              {report.coverage.corpusVersion ? ` · corpus state ${report.coverage.corpusVersion.slice(0, 8)}` : ''}
            </p>
          )}
          <p className="mt-2 flex items-start gap-1.5 text-[10px] text-[var(--text-tertiary)]">
            <Scale size={11} className="mt-0.5 shrink-0" />
            {report.disclaimer}
          </p>
        </>
      )}
    </div>
  );
}
