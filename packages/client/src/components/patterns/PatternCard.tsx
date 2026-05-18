import { useState } from 'react';
import {
  Info,
  CheckCircle2,
  AlertTriangle,
  Clock,
  XCircle,
  MinusCircle,
  Trophy,
  TrendingUp,
  Star,
  Sparkles,
  Users,
  ArrowRight,
} from 'lucide-react';
import type {
  DecisionPattern,
  EnrichedDecisionPattern,
  PatternBadgeKind,
  PatternLifecycleStatus,
} from '@thearchitect/shared';

interface Props {
  pattern: DecisionPattern | EnrichedDecisionPattern;
  onAdopt?: (slug: string) => void;
  adopting?: boolean;
  showWhyThis?: boolean;
  canEndorse?: boolean;
  onEndorseClick?: (slug: string) => void;
  onUnendorse?: (slug: string) => void;
  onNavigateToSuccessor?: (successorSlug: string) => void;
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

const badgeStyle: Record<PatternBadgeKind, { className: string; icon: JSX.Element }> = {
  'most-used': {
    className:
      'bg-gradient-to-r from-amber-500/20 to-yellow-500/20 text-amber-200 border border-amber-400/40',
    icon: <Trophy className="w-3 h-3" />,
  },
  trending: {
    className: 'bg-indigo-500/20 text-indigo-200 border border-indigo-400/40',
    icon: <TrendingUp className="w-3 h-3" />,
  },
  'architects-choice': {
    className: 'bg-purple-500/20 text-purple-200 border border-purple-400/40',
    icon: <Star className="w-3 h-3" />,
  },
  new: {
    className: 'bg-emerald-500/15 text-emerald-200 border border-emerald-400/40',
    icon: <Sparkles className="w-3 h-3" />,
  },
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

const isEnriched = (
  p: DecisionPattern | EnrichedDecisionPattern,
): p is EnrichedDecisionPattern => 'stats' in p && p.stats !== undefined;

export function PatternCard({
  pattern,
  onAdopt,
  adopting,
  showWhyThis = true,
  canEndorse = false,
  onEndorseClick,
  onUnendorse,
  onNavigateToSuccessor,
}: Props) {
  const [whyOpen, setWhyOpen] = useState(false);
  const enriched = isEnriched(pattern) ? pattern : null;
  const stats = enriched?.stats;
  const isDeprecated = stats?.isDeprecated ?? false;
  const blocked =
    pattern.lifecycleStatus === 'retiring' || pattern.lifecycleStatus === 'unapproved';
  const hasMyEndorsement = stats?.endorsements?.hasMyEndorsement ?? false;
  const endorsementCount = stats?.endorsements?.count ?? 0;

  return (
    <div
      className={`bg-[#1e293b] border rounded-lg p-4 flex flex-col gap-3 transition-colors ${
        isDeprecated
          ? 'border-red-500/40 hover:border-red-400'
          : 'border-[#334155] hover:border-[#7c3aed]'
      }`}
      data-testid="pattern-card"
      data-slug={pattern.slug}
    >
      {stats && stats.badges.length > 0 && (
        <div className="flex gap-1 flex-wrap">
          {stats.badges.map((b) => (
            <span
              key={b.kind}
              className={`text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded font-semibold flex items-center gap-1 ${badgeStyle[b.kind].className}`}
              data-testid={`badge-${b.kind}`}
            >
              {badgeStyle[b.kind].icon}
              {b.label}
            </span>
          ))}
        </div>
      )}

      {isDeprecated && (
        <div
          className="bg-red-500/15 border border-red-500/40 rounded p-2 text-xs"
          data-testid="deprecated-banner"
        >
          <div className="text-red-300 font-semibold flex items-center gap-1">
            <XCircle className="w-3.5 h-3.5" />
            DEPRECATED
          </div>
          {stats?.successorSlug && (
            <button
              type="button"
              onClick={() => onNavigateToSuccessor?.(stats.successorSlug!)}
              className="text-red-200 underline mt-1 flex items-center gap-1 hover:text-red-100"
              data-testid="successor-link"
            >
              Use successor: {stats.successorName ?? stats.successorSlug}
              <ArrowRight className="w-3 h-3" />
            </button>
          )}
        </div>
      )}

      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-semibold text-white truncate" title={pattern.name}>
            {pattern.name}
          </h3>
          <p className="text-xs text-slate-400 mt-0.5 capitalize">
            {pattern.category} · v{pattern.version}
          </p>
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

      {stats && (
        <div
          className="flex items-center gap-2 text-[10px] text-slate-400"
          data-testid="adoption-counter"
        >
          <Users className="w-3 h-3" />
          {stats.totalUses} adoption{stats.totalUses === 1 ? '' : 's'}
          {stats.last30Days > 0 && <span>· {stats.last30Days} this month</span>}
          {stats.uniqueProjects > 0 && (
            <span>
              · {stats.uniqueProjects} project{stats.uniqueProjects === 1 ? '' : 's'}
            </span>
          )}
        </div>
      )}

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
              {stats && stats.endorsements.topReasons.length > 0 && (
                <div className="mt-2 pt-2 border-t border-slate-700/50">
                  <p className="text-[10px] text-purple-300 font-semibold mb-1">
                    Architect endorsements:
                  </p>
                  {stats.endorsements.topReasons.map((e) => (
                    <p
                      key={e.userId + e.timestamp}
                      className="text-[10px] text-slate-400 italic line-clamp-2"
                    >
                      "{e.reason}"
                    </p>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      <div className="flex items-center gap-2">
        {onAdopt && (
          <button
            type="button"
            onClick={() => onAdopt(pattern.slug)}
            disabled={adopting || blocked}
            className="flex-1 px-3 py-1.5 rounded bg-[#7c3aed] hover:bg-[#8b5cf6] disabled:bg-slate-600 disabled:cursor-not-allowed text-white text-xs font-medium transition-colors"
            data-testid="adopt-button"
            title={blocked ? `Cannot adopt: ${pattern.lifecycleStatus}` : undefined}
          >
            {adopting
              ? 'Applying…'
              : blocked
                ? `Blocked (${pattern.lifecycleStatus})`
                : 'Apply Pattern'}
          </button>
        )}
        {canEndorse && (
          <button
            type="button"
            onClick={() =>
              hasMyEndorsement
                ? onUnendorse?.(pattern.slug)
                : onEndorseClick?.(pattern.slug)
            }
            className={`px-2 py-1.5 rounded text-xs font-medium transition-colors flex items-center gap-1 ${
              hasMyEndorsement
                ? 'bg-purple-500/30 text-purple-100 hover:bg-purple-500/40'
                : 'bg-slate-700/50 text-slate-300 hover:bg-slate-700'
            }`}
            data-testid="endorse-button"
            title={
              hasMyEndorsement
                ? 'Click to remove your endorsement'
                : 'Endorse this pattern as architect'
            }
          >
            <Star
              className={`w-3 h-3 ${hasMyEndorsement ? 'fill-current' : ''}`}
            />
            {hasMyEndorsement ? 'Endorsed' : `Endorse${endorsementCount > 0 ? ` (${endorsementCount})` : ''}`}
          </button>
        )}
      </div>
    </div>
  );
}

export default PatternCard;
