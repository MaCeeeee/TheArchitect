import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { Boxes, Loader2, AlertCircle } from 'lucide-react';
import { useArchitectureStore } from '../../stores/architectureStore';
import { useUIStore } from '../../stores/uiStore';
import { useExecutiveSummary } from '../../hooks/useExecutiveSummary';
import ExecTabStrip, { type Persona } from './exec/ExecTabStrip';
import CeoView from './exec/CeoView';
import CioView from './exec/CioView';
import CfoView from './exec/CfoView';

export default function AnalyzeDashboard() {
  const { projectId } = useParams<{ projectId: string }>();
  const elements = useArchitectureStore((s) => s.elements);
  const [tab, setTab] = useState<Persona>('cio');

  const { data, loading, error, reload } = useExecutiveSummary(projectId ?? null);

  if (elements.length === 0) {
    return (
      <div>
        <h2 className="text-lg font-semibold text-white mb-1">Executive Dashboard</h2>
        <p className="text-sm text-[var(--text-tertiary)] mb-6">
          Persona-driven overview of cost, risk, compliance and transformation.
        </p>
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <Boxes size={32} className="text-[var(--border-strong)] mb-3" />
          <p className="text-sm font-medium text-[var(--text-secondary)]">
            No architecture elements yet
          </p>
          <p className="text-xs text-[var(--text-tertiary)] mt-1 max-w-xs">
            Start by modeling your architecture — add elements and connections in the 3D canvas.
          </p>
          <span className="inline-flex items-center gap-1.5 mt-2 px-2 py-0.5 rounded-full bg-[var(--status-purple)]/10 text-[9px] font-medium text-[var(--status-purple)]">
            Phases B-D: Architecture Definition
          </span>
          <button
            onClick={() => useUIStore.getState().setSidebarPanel('explorer')}
            className="mt-3 text-xs font-medium text-[var(--accent-default)] hover:text-[var(--accent-hover)] transition"
          >
            Open Explorer →
          </button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <h2 className="text-lg font-semibold text-white mb-1">Executive Dashboard</h2>
      <p className="text-sm text-[var(--text-tertiary)] mb-4">
        Persona-driven overview of cost, risk, compliance and transformation.
      </p>

      <ExecTabStrip active={tab} onChange={setTab} onReload={reload} loading={loading} />

      {loading && !data && (
        <div className="flex items-center justify-center py-16 gap-2 text-[var(--text-tertiary)]">
          <Loader2 size={16} className="animate-spin" />
          <span className="text-sm">Computing executive summary…</span>
        </div>
      )}

      {error && (
        <div className="flex items-start gap-2 text-sm text-red-300 bg-red-500/10 border border-red-500/30 rounded p-3 mb-4">
          <AlertCircle size={16} className="flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-medium">{error}</p>
            <button
              type="button"
              onClick={reload}
              className="text-xs underline mt-1 hover:text-red-200"
            >
              Retry
            </button>
          </div>
        </div>
      )}

      {data && tab === 'ceo' && <CeoView data={data.ceo} />}
      {data && tab === 'cio' && <CioView data={data.cio} />}
      {data && tab === 'cfo' && <CfoView data={data.cfo} />}
    </div>
  );
}
