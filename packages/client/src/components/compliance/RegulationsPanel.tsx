/**
 * RegulationsPanel (UC-CANON-001 / THE-390 P4b) — corpus laws in the norm view.
 *
 * Lists the crawled regulations this project references (source: 'corpus') and
 * lets the user add one to the compliance pipeline ("Add regulation to
 * pipeline" adapter, P2). Upload standards keep living in StandardsManager —
 * this panel renders alongside it, additive by design (no manager refactor).
 */
import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { Scale, Loader2, PlusCircle, CheckCircle2, AlertCircle } from 'lucide-react';
import toast from 'react-hot-toast';
import { normsAPI } from '../../services/api';
import { useComplianceStore } from '../../stores/complianceStore';

interface NormListItem {
  identity: { workId: string };
  source: 'upload' | 'corpus';
  title: string;
  jurisdiction?: string;
  kind?: string;
  sectionCount: number;
}

export default function RegulationsPanel() {
  const { projectId } = useParams();
  const loadPipelineStatus = useComplianceStore((s) => s.loadPipelineStatus);
  const pipelineStates = useComplianceStore((s) => s.pipelineStates);
  const [norms, setNorms] = useState<NormListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [addingId, setAddingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!projectId) return;
    setLoading(true);
    setError(null);
    try {
      const { data } = await normsAPI.list(projectId);
      const items: NormListItem[] = (data?.data ?? []).filter(
        (n: NormListItem) => n.source === 'corpus',
      );
      setNorms(items);
    } catch {
      setError('Failed to load regulations');
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    void load();
  }, [load]);

  const inPipeline = useCallback(
    (workId: string) =>
      pipelineStates.some((s: { standardId: string }) => s.standardId === workId),
    [pipelineStates],
  );

  const addToPipeline = async (workId: string, title: string) => {
    if (!projectId) return;
    setAddingId(workId);
    try {
      await normsAPI.addToPipeline(projectId, workId);
      toast.success(`${title} added to pipeline`);
      await loadPipelineStatus(projectId);
    } catch {
      toast.error(`Failed to add ${title} to pipeline`);
    } finally {
      setAddingId(null);
    }
  };

  return (
    <div
      data-testid="regulations-panel"
      className="mt-8 rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-raised)] p-4"
    >
      <div className="mb-1 flex items-center gap-2">
        <Scale size={16} className="text-[#7c3aed]" />
        <h3 className="text-sm font-semibold text-[var(--text-primary)]">Regulations (corpus)</h3>
      </div>
      <p className="mb-4 text-xs text-[var(--text-tertiary)]">
        Crawled laws referenced by this project. Add one to run it through the
        compliance pipeline like an uploaded standard.
      </p>

      {loading && (
        <div className="flex items-center gap-2 py-6 text-xs text-[var(--text-tertiary)]">
          <Loader2 size={14} className="animate-spin" /> Loading regulations…
        </div>
      )}

      {!loading && error && (
        <div className="flex items-center gap-2 py-4 text-xs text-red-400">
          <AlertCircle size={14} /> {error}
        </div>
      )}

      {!loading && !error && norms.length === 0 && (
        <p className="py-4 text-xs text-[var(--text-tertiary)]">
          No corpus regulations referenced yet — map a regulation to an element
          first (Live Mapping), or check the corpus connection.
        </p>
      )}

      {!loading && !error && norms.length > 0 && (
        <ul className="divide-y divide-[var(--border-subtle)]">
          {norms.map((n) => {
            const added = inPipeline(n.identity.workId);
            return (
              <li key={n.identity.workId} className="flex items-center justify-between gap-3 py-2.5">
                <div className="min-w-0">
                  <div className="truncate text-sm text-[var(--text-primary)]">{n.title}</div>
                  <div className="text-[10px] uppercase tracking-wider text-[var(--text-tertiary)]">
                    {n.kind ?? 'legislation'}
                    {n.jurisdiction ? ` · ${n.jurisdiction}` : ''} · {n.sectionCount} sections
                  </div>
                </div>
                {added ? (
                  <span className="flex shrink-0 items-center gap-1 text-xs text-emerald-400">
                    <CheckCircle2 size={14} /> In pipeline
                  </span>
                ) : (
                  <button
                    onClick={() => void addToPipeline(n.identity.workId, n.title)}
                    disabled={addingId === n.identity.workId}
                    className="flex shrink-0 items-center gap-1.5 rounded border border-[#7c3aed] px-2.5 py-1 text-xs text-[#7c3aed] transition hover:bg-[#7c3aed] hover:text-white disabled:opacity-50"
                  >
                    {addingId === n.identity.workId ? (
                      <Loader2 size={13} className="animate-spin" />
                    ) : (
                      <PlusCircle size={13} />
                    )}
                    Add to pipeline
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
