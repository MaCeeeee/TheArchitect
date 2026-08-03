/**
 * SharedMeasuresPanel (THE-569) — the harmonization proposal surface.
 *
 * DIE ZWEI REGELN DER FLÄCHE:
 *   1. Der Vorschlag läuft NUR auf Klick (der Judge kostet — pairsJudged
 *      steht sichtbar in der Antwort), nie implizit.
 *   2. Das System schlägt die GRUPPE vor — das geteilte Element wählt der
 *      MENSCH, aus den bereits verlinkten Elementen der Mitglieder
 *      (THE-551: die Ebene ist eine Landschafts-Entscheidung). Der
 *      Fehlerrest-Satz steht in der Fläche, nicht in einer Fußnote.
 */
import { useState, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { Loader2, GitMerge, ShieldOff } from 'lucide-react';
import {
  harmonizationAPI,
  type HarmonizationProposeResult,
} from '../../services/api';

export default function SharedMeasuresPanel() {
  const { projectId } = useParams<{ projectId: string }>();
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<HarmonizationProposeResult | null>(null);
  const [selectedElement, setSelectedElement] = useState<Record<string, string>>({});
  const [confirming, setConfirming] = useState<string | null>(null);

  const propose = useCallback(async () => {
    if (!projectId) return;
    setIsLoading(true);
    setResult(null);
    try {
      const res = await harmonizationAPI.propose(projectId, {});
      setResult(res.data.data);
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { error?: string } } };
      toast.error(axiosErr.response?.data?.error ?? 'Proposal failed');
    } finally {
      setIsLoading(false);
    }
  }, [projectId]);

  const confirm = useCallback(
    async (measureId: string, memberIds: string[]) => {
      if (!projectId) return;
      const elementId = selectedElement[measureId];
      if (!elementId) return;
      setConfirming(measureId);
      try {
        const res = await harmonizationAPI.confirm(projectId, {
          systemRequirementIds: memberIds,
          elementId,
        });
        toast.success(`Shared element linked to ${res.data.data.linkedRequirements} requirements`);
      } catch (err: unknown) {
        const axiosErr = err as { response?: { data?: { error?: string } } };
        toast.error(axiosErr.response?.data?.error ?? 'Confirm failed');
      } finally {
        setConfirming(null);
      }
    },
    [projectId, selectedElement],
  );

  const detailFor = (id: string) => result?.memberDetails.find((d) => d.systemRequirementId === id);

  return (
    <div className="rounded-lg border border-[#334155] bg-[#0f172a] p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <GitMerge className="h-4 w-4 text-[#7c3aed]" />
          <h3 className="text-sm font-medium text-white">Shared measures (proposal)</h3>
        </div>
        <button
          type="button"
          onClick={propose}
          disabled={isLoading}
          className="rounded bg-[#7c3aed] px-3 py-1.5 text-xs font-medium text-white transition hover:bg-[#6d28d9] disabled:opacity-50"
        >
          {isLoading ? (
            <span className="flex items-center gap-1.5"><Loader2 className="h-3 w-3 animate-spin" /> Judging pairs…</span>
          ) : (
            'Propose shared measures'
          )}
        </button>
      </div>

      <p className="mt-2 text-[11px] text-slate-400">
        Explicit run — the judge costs tokens; counts are reported below. In about 1 of 3 cases the
        chain merges what an architect would build separately (measured: 68.8% agreement). Review
        before confirming.
      </p>

      {result && (
        <div className="mt-3 space-y-3">
          <div className="text-[10px] text-slate-500" data-testid="harmonization-stats">
            {result.stats.total} chain requirements · {result.stats.pairsJudged} pairs judged ·{' '}
            {result.grouping.cappedPairs} capped · {result.stats.unmappedAddressee} unmapped addressee ·{' '}
            {result.stats.unclassified} unclassified
          </div>

          {result.grouping.excludedByDisplacement.length > 0 && (
            <div className="rounded border border-amber-900/60 bg-amber-950/30 p-2" data-testid="displacement-info">
              <div className="flex items-center gap-1.5 text-[11px] font-medium text-amber-300">
                <ShieldOff className="h-3 w-3" /> Mutually exclusive regimes (never judged)
              </div>
              {result.grouping.excludedByDisplacement.map((ex, i) => (
                <p key={i} className="mt-1 text-[10px] text-amber-200/80">
                  {ex.prevailing.toUpperCase()} displaces {ex.displaced.toUpperCase()} for this addressee —{' '}
                  {ex.citations[0]}
                </p>
              ))}
            </div>
          )}

          {result.grouping.measures.length === 0 ? (
            <p className="text-[11px] italic text-slate-400">
              No shared-measure candidates in this run. That is a valid result.
            </p>
          ) : (
            result.grouping.measures.map((m) => {
              const linkable = [
                ...new Set(m.memberIds.flatMap((id) => detailFor(id)?.linkedElementIds ?? [])),
              ];
              return (
                <div key={m.id} className="rounded border border-[#334155] bg-[#1e293b] p-3" data-testid="measure-candidate">
                  <div className="text-xs font-medium text-white">
                    {m.memberIds.length} requirements from {m.laws.map((l) => l.toUpperCase()).join(' + ')} could share one
                    realizing element
                  </div>
                  <ul className="mt-1 list-inside list-disc text-[11px] text-slate-300">
                    {m.memberIds.map((id) => (
                      <li key={id}>{detailFor(id)?.title ?? `System requirement ${id.slice(-6)}`}</li>
                    ))}
                  </ul>
                  <p className="mt-1 text-[10px] text-slate-500">
                    Each requirement keeps its own deadline, legal basis and evidence — only the realizing element is shared.
                  </p>
                  {linkable.length === 0 ? (
                    <p className="mt-2 text-[11px] text-amber-300" data-testid="link-first-hint">
                      Link an element to one member first (via remediation or mapping) — the system proposes the group, you pick the element.
                    </p>
                  ) : (
                    <div className="mt-2 flex items-center gap-2">
                      <select
                        aria-label="Shared element"
                        value={selectedElement[m.id] ?? ''}
                        onChange={(e) => setSelectedElement((s) => ({ ...s, [m.id]: e.target.value }))}
                        className="rounded border border-[#334155] bg-[#0f172a] px-2 py-1 text-[11px] text-white"
                      >
                        <option value="">Select shared element…</option>
                        {linkable.map((el) => (
                          <option key={el} value={el}>{el}</option>
                        ))}
                      </select>
                      <button
                        type="button"
                        disabled={!selectedElement[m.id] || confirming === m.id}
                        onClick={() => confirm(m.id, m.memberIds)}
                        className="rounded bg-emerald-700 px-2.5 py-1 text-[11px] font-medium text-white transition hover:bg-emerald-600 disabled:opacity-40"
                      >
                        {confirming === m.id ? 'Linking…' : 'Confirm sharing'}
                      </button>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
