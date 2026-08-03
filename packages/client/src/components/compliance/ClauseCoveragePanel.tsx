/**
 * ClauseCoveragePanel (THE-565) — vorwärts: „Was verlangt die Norm, Klausel
 * für Klausel — und wo steht es?"
 *
 * Die Coverage-Lücke (Klausel ohne verlinkte Elemente) ist der Punkt der
 * Ansicht. Legacy-Requirements ohne Klausel-Anker erscheinen als eigener,
 * ehrlicher Hinweis — nie eingerechnet. Der Drift-Check läuft nur auf Klick
 * und meldet seinen Report sichtbar.
 */
import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { Loader2, ListTree, RefreshCw } from 'lucide-react';
import { traceAPI, type TraceForwardResult } from '../../services/api';

export default function ClauseCoveragePanel() {
  const { projectId } = useParams<{ projectId: string }>();
  const [data, setData] = useState<TraceForwardResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isDrifting, setIsDrifting] = useState(false);

  const load = useCallback(async () => {
    if (!projectId) return;
    setIsLoading(true);
    try {
      const res = await traceAPI.forward(projectId);
      setData(res.data.data);
    } catch {
      setData(null);
    } finally {
      setIsLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    void load();
  }, [load]);

  const driftCheck = useCallback(async () => {
    if (!projectId) return;
    setIsDrifting(true);
    try {
      const res = await traceAPI.driftCheck(projectId);
      const r = res.data.data;
      // THE-575: `unanchored` steht NEBEN `checked`, nicht in einer Fußnote.
      // Ohne diese Zahl las sich der Bericht wie „alles geprüft" — am echten
      // Bestand waren 13 von 15 Anforderungen nie im Blick.
      const notCheckable =
        r.unanchored > 0 ? ` · ${r.unanchored} not checkable (no corpus anchor)` : '';
      toast.success(
        `Drift check: ${r.checked} checked · ${r.staled} staled · ${r.skipped} skipped${notCheckable} · ${r.attestedReset} attestations reset`,
        { duration: 8000 },
      );
      await load();
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { error?: string } } };
      toast.error(axiosErr.response?.data?.error ?? 'Drift check failed');
    } finally {
      setIsDrifting(false);
    }
  }, [projectId, load]);

  return (
    <div className="rounded-lg border border-[#334155] bg-[#0f172a] p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ListTree className="h-4 w-4 text-[#7c3aed]" />
          <h3 className="text-sm font-medium text-white">Clause coverage (forward trace)</h3>
        </div>
        <button
          type="button"
          onClick={driftCheck}
          disabled={isDrifting}
          className="flex items-center gap-1.5 rounded border border-[#334155] px-2.5 py-1 text-[11px] text-slate-300 transition hover:bg-[#1e293b] disabled:opacity-50"
          title="Re-segment current norm texts and stale only clauses that changed"
        >
          {isDrifting ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
          Drift check
        </button>
      </div>

      {isLoading ? (
        <div className="mt-3 flex items-center gap-2 text-[11px] text-slate-400">
          <Loader2 className="h-3 w-3 animate-spin" /> Loading clause coverage…
        </div>
      ) : !data || data.norms.length === 0 ? (
        <p className="mt-3 text-[11px] italic text-slate-400">
          No chain requirements yet — generate requirements with the ISO chain engine to see per-clause coverage.
        </p>
      ) : (
        <div className="mt-3 space-y-3">
          {data.norms.map((norm) => (
            <div key={norm.regulationKey} data-testid="norm-block">
              <div className="text-xs font-medium text-white">{norm.regulationKey}</div>
              <div className="mt-1 space-y-1">
                {norm.clauses.map((clause) => (
                  <div
                    key={clause.contentId}
                    className="rounded border border-[#334155] bg-[#1e293b] px-2 py-1.5"
                    data-testid="clause-row"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[11px] text-slate-300">
                        {clause.clausePath ?? clause.contentId.slice(0, 8)} ·{' '}
                        {clause.requirements.length} requirement{clause.requirements.length === 1 ? '' : 's'}
                      </span>
                      {clause.linkedElementIds.length === 0 ? (
                        <span className="rounded bg-red-950/40 px-1.5 py-0.5 text-[9px] font-medium text-red-300">
                          uncovered
                        </span>
                      ) : (
                        <span className="rounded bg-emerald-950/40 px-1.5 py-0.5 text-[9px] font-medium text-emerald-300">
                          {clause.linkedElementIds.length} element{clause.linkedElementIds.length === 1 ? '' : 's'}
                        </span>
                      )}
                    </div>
                    {clause.clauseText && (
                      <p className="mt-0.5 truncate text-[10px] text-slate-500" title={clause.clauseText}>
                        {clause.clauseText}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
          {data.withoutClauseAnchor.count > 0 && (
            <p className="text-[10px] text-slate-500" data-testid="without-anchor-hint">
              {data.withoutClauseAnchor.count} legacy requirement{data.withoutClauseAnchor.count === 1 ? '' : 's'} without
              clause anchor (pre-chain) — shown nowhere above, never guessed.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
