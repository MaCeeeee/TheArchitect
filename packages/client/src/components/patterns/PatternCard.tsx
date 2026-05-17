import { useState } from 'react';
import { Info, CheckCircle2, AlertTriangle, Clock, XCircle, MinusCircle } from 'lucide-react';
import type { DecisionPattern, PatternLifecycleStatus } from '@thearchitect/shared';

interface Props {
  pattern: DecisionPattern;
  onAdopt?: (slug: string) => void;
  adopting?: boolean;
  showWhyThis?: boolean;
}

const riskColor: Record<DecisionPattern['riskLevel'], string> = {
  low: 'bg-green-500/15 text-green-300 border-green-500/30',
  medium: 'bg-yellow-500/15 text-yellow-300 border-yellow-500/30',
  high: 'bg-red-500/15 text-red-300 border-red-500/30',
};

const lifecycleColor: Record<PatternLifecycleStatus, string> = {
  approved: 'bg-green-500/15 text-green-300 border-green-500/30',
  conditional: 'bg-yellow-500/15 text-yellow-300 border-yellow-500/30',
  investigate: 'bg-orange-500/15 text-orange-300 border-orange-500/30',
  retiring: 'bg-red-500/15 text-red-300 border-red-500/30',
  unapproved: 'bg-slate-500/15 text-slate-400 border-slate-500/30',
};

const lifecycleIcon: Record<PatternLifecycleStatus, JSX.Element> = {
  approved: <CheckCircle2 className="w-3 h-3" />,
  conditional: <AlertTriangle className="w-3 h-3" />,
  investigate: <Clock className="w-3 h-3" />,
  retiring: <XCircle className="w-3 h-3" />,
  unapproved: <MinusCircle className="w-3 h-3" />,
};

function ComplianceBar({ label, value }: { label: string; value?: number }) {
  if (value === undefined) {
    return (
      <div className="flex items-center gap-1.5 text-[10px] text-slate-500">
        <span className="w-9">{label}</span>
        <span className="text-slate-600">—</span>
      </div>
    );
  }
  const color = value >= 80 ? '#22c55e' : value >= 60 ? '#eab308' : '#ef4444';
  return (
    <div className="flex items-center gap-1.5 text-[10px]">
      <span className="w-9 text-slate-400">{label}</span>
      <div className="flex-1 bg-slate-700/50 rounded h-1.5 overflow-hidden">
        <div
          className="h-full transition-all"
          style={{ width: `${value}%`, backgroundColor: color }}
        />
      </div>
      <span className="w-6 text-right text-slate-300 font-mono">{value}</span>
    </div>
  );
}

export function PatternCard({ pattern, onAdopt, adopting, showWhyThis = true }: Props) {
  const [whyOpen, setWhyOpen] = useState(false);
  const blocked = pattern.lifecycleStatus === 'retiring' || pattern.lifecycleStatus === 'unapproved';

  return (
    <div
      className="bg-[#1e293b] border border-[#334155] rounded-lg p-4 flex flex-col gap-3 hover:border-[#7c3aed] transition-colors"
      data-testid="pattern-card"
      data-slug={pattern.slug}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-semibold text-white truncate" title={pattern.name}>
            {pattern.name}
          </h3>
          <p className="text-xs text-slate-400 mt-0.5 capitalize">{pattern.category}</p>
        </div>
        <span
          className={`text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded border flex items-center gap-1 ${lifecycleColor[pattern.lifecycleStatus]}`}
        >
          {lifecycleIcon[pattern.lifecycleStatus]}
          {pattern.lifecycleStatus}
        </span>
      </div>

      <p className="text-xs text-slate-300 line-clamp-2" title={pattern.description}>
        {pattern.description}
      </p>

      <div className="space-y-1.5">
        <ComplianceBar label="TOGAF" value={pattern.complianceScore.togaf} />
        <ComplianceBar label="DORA" value={pattern.complianceScore.dora} />
        <ComplianceBar label="NIS2" value={pattern.complianceScore.nis2} />
      </div>

      <div className="flex items-center gap-2 text-[11px]">
        <span className="px-1.5 py-0.5 rounded bg-slate-700/50 text-slate-300 font-mono">
          {pattern.costRange}
        </span>
        <span
          className={`px-1.5 py-0.5 rounded border ${riskColor[pattern.riskLevel]} uppercase font-medium tracking-wide`}
        >
          risk: {pattern.riskLevel}
        </span>
        {pattern.tags.slice(0, 2).map((t) => (
          <span
            key={t}
            className="px-1.5 py-0.5 rounded bg-[#7c3aed]/15 text-[#a78bfa] text-[10px]"
          >
            {t}
          </span>
        ))}
      </div>

      {showWhyThis && (
        <div className="border-t border-[#334155] pt-2 -mx-1 px-1">
          <button
            type="button"
            onClick={() => setWhyOpen((v) => !v)}
            className="flex items-center gap-1.5 text-xs text-[#a78bfa] hover:text-[#c4b5fd]"
            data-testid="why-this-toggle"
          >
            <Info className="w-3.5 h-3.5" />
            Why this?
          </button>
          {whyOpen && (
            <div className="mt-1.5 text-xs text-slate-300 bg-[#0f172a] border border-[#334155] rounded p-2">
              <p>{pattern.whyThis}</p>
              {pattern.detectorRefs.length > 0 && (
                <p className="mt-1.5 text-[10px] text-slate-500">
                  Detectors:{' '}
                  {pattern.detectorRefs.map((r) => (
                    <code key={r} className="bg-slate-700/40 px-1 rounded mr-1">
                      {r}
                    </code>
                  ))}
                </p>
              )}
            </div>
          )}
        </div>
      )}

      {onAdopt && (
        <button
          type="button"
          onClick={() => onAdopt(pattern.slug)}
          disabled={adopting || blocked}
          className="mt-1 px-3 py-1.5 rounded bg-[#7c3aed] hover:bg-[#8b5cf6] disabled:bg-slate-600 disabled:cursor-not-allowed text-white text-xs font-medium transition-colors"
          data-testid="adopt-button"
          title={blocked ? `Cannot adopt: ${pattern.lifecycleStatus}` : undefined}
        >
          {adopting ? 'Applying…' : blocked ? `Blocked (${pattern.lifecycleStatus})` : 'Apply Pattern'}
        </button>
      )}
    </div>
  );
}

export default PatternCard;
