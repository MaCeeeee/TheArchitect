import { useState } from 'react';
import {
  ChevronDown,
  ChevronRight,
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
  canEndorse?: boolean;
  onEndorseClick?: (slug: string) => void;
  onUnendorse?: (slug: string) => void;
  onNavigateToSuccessor?: (successorSlug: string) => void;
  defaultExpanded?: boolean;
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
      <div className="flex items-center gap-2 text-xs text-slate-500">
        <span className="w-12">{label}</span>
        <span className="text-slate-600">—</span>
      </div>
    );
  }
  const color = value >= 80 ? '#22c55e' : value >= 60 ? '#eab308' : '#ef4444';
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="w-12 text-slate-400">{label}</span>
      <div className="flex-1 bg-slate-700/50 rounded h-2 overflow-hidden">
        <div
          className="h-full transition-all"
          style={{ width: `${value}%`, backgroundColor: color }}
        />
      </div>
      <span className="w-8 text-right text-slate-300 font-mono">{value}</span>
    </div>
  );
}

const isEnriched = (
  p: DecisionPattern | EnrichedDecisionPattern,
): p is EnrichedDecisionPattern => 'stats' in p && p.stats !== undefined;

export function PatternRow({
  pattern,
  onAdopt,
  adopting,
  canEndorse = false,
  onEndorseClick,
  onUnendorse,
  onNavigateToSuccessor,
  defaultExpanded = false,
}: Props) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const enriched = isEnriched(pattern) ? pattern : null;
  const stats = enriched?.stats;
  const isDeprecated = stats?.isDeprecated ?? false;
  const blocked =
    pattern.lifecycleStatus === 'retiring' || pattern.lifecycleStatus === 'unapproved';
  const hasMyEndorsement = stats?.endorsements?.hasMyEndorsement ?? false;
  const endorsementCount = stats?.endorsements?.count ?? 0;

  return (
    <div
      className={`bg-[#1e293b] border rounded-lg overflow-hidden transition-colors ${
        isDeprecated
          ? 'border-red-500/40'
          : expanded
            ? 'border-[#7c3aed]/60'
            : 'border-[#334155] hover:border-[#475569]'
      }`}
      data-testid="pattern-card"
      data-slug={pattern.slug}
    >
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="w-full px-4 py-3 flex items-center gap-3 text-left hover:bg-[#293548] transition-colors"
        data-testid="pattern-row-toggle"
      >
        <div className="text-slate-400 flex-shrink-0">
          {expanded ? (
            <ChevronDown className="w-4 h-4" />
          ) : (
            <ChevronRight className="w-4 h-4" />
          )}
        </div>

        <div className="flex-1 min-w-0 flex items-center gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-sm font-semibold text-white" title={pattern.name}>
                {pattern.name}
              </h3>
              <span className="text-[10px] text-slate-500 font-mono">v{pattern.version}</span>
              <span className="text-[10px] text-slate-400 capitalize px-1.5 py-0.5 rounded bg-slate-700/40">
                {pattern.category}
              </span>
              {stats?.badges.map((b) => (
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
          </div>

          <div className="hidden md:flex items-center gap-3 flex-shrink-0 text-xs">
            {stats && (
              <span
                className="flex items-center gap-1 text-slate-400"
                data-testid="adoption-counter"
              >
                <Users className="w-3 h-3" />
                {stats.totalUses}
              </span>
            )}
            <span className="px-1.5 py-0.5 rounded bg-slate-700/50 text-slate-300 font-mono">
              {pattern.costRange}
            </span>
            <span
              className={`px-1.5 py-0.5 rounded border ${riskColor[pattern.riskLevel]} uppercase tracking-wide`}
            >
              {pattern.riskLevel}
            </span>
            <span
              className={`px-1.5 py-0.5 rounded border flex items-center gap-1 ${lifecycleColor[pattern.lifecycleStatus]}`}
            >
              {lifecycleIcon[pattern.lifecycleStatus]}
              <span className="hidden lg:inline capitalize">{pattern.lifecycleStatus}</span>
            </span>
          </div>
        </div>
      </button>

      {expanded && (
        <div className="border-t border-[#334155] px-4 py-4 space-y-4 bg-[#0f172a]/40">
          {isDeprecated && (
            <div
              className="bg-red-500/15 border border-red-500/40 rounded p-3 text-sm"
              data-testid="deprecated-banner"
            >
              <div className="text-red-300 font-semibold flex items-center gap-1.5 mb-1">
                <XCircle className="w-4 h-4" />
                DEPRECATED — do not use for new projects
              </div>
              {stats?.successorSlug && (
                <button
                  type="button"
                  onClick={() => onNavigateToSuccessor?.(stats.successorSlug!)}
                  className="text-red-200 underline flex items-center gap-1 hover:text-red-100 text-sm"
                  data-testid="successor-link"
                >
                  Use successor: {stats.successorName ?? stats.successorSlug}
                  <ArrowRight className="w-3 h-3" />
                </button>
              )}
            </div>
          )}

          <div>
            <p className="text-sm text-slate-300 leading-relaxed">{pattern.description}</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <h4 className="text-[10px] uppercase tracking-wide text-slate-500 mb-2">
                Decision Context
              </h4>
              <p className="text-sm text-slate-300 italic">{pattern.decisionContext}</p>
            </div>
            <div>
              <h4 className="text-[10px] uppercase tracking-wide text-slate-500 mb-2">
                Compliance Score
              </h4>
              <div className="space-y-1.5">
                <ComplianceBar label="TOGAF" value={pattern.complianceScore.togaf} />
                <ComplianceBar label="DORA" value={pattern.complianceScore.dora} />
                <ComplianceBar label="NIS2" value={pattern.complianceScore.nis2} />
              </div>
            </div>
          </div>

          <div>
            <h4 className="text-[10px] uppercase tracking-wide text-slate-500 mb-2 flex items-center gap-1.5">
              <Info className="w-3 h-3" />
              Why this pattern?
            </h4>
            <p className="text-sm text-slate-300 leading-relaxed">{pattern.whyThis}</p>
            {pattern.detectorRefs.length > 0 && (
              <p className="mt-2 text-[10px] text-slate-500">
                Detectors:{' '}
                {pattern.detectorRefs.map((r) => (
                  <code key={r} className="bg-slate-700/40 px-1.5 py-0.5 rounded mr-1">
                    {r}
                  </code>
                ))}
              </p>
            )}
          </div>

          {pattern.tags.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[10px] uppercase tracking-wide text-slate-500">Tags:</span>
              {pattern.tags.map((t) => (
                <span
                  key={t}
                  className="text-[10px] px-1.5 py-0.5 rounded bg-[#7c3aed]/15 text-[#a78bfa]"
                >
                  {t}
                </span>
              ))}
            </div>
          )}

          {stats && (
            <div className="grid grid-cols-3 gap-2 text-center bg-slate-800/30 rounded p-3">
              <div>
                <div className="text-lg font-bold text-white">{stats.totalUses}</div>
                <div className="text-[10px] text-slate-500 uppercase tracking-wide">
                  Total Adoptions
                </div>
              </div>
              <div>
                <div className="text-lg font-bold text-white">{stats.last30Days}</div>
                <div className="text-[10px] text-slate-500 uppercase tracking-wide">
                  Last 30 Days
                </div>
              </div>
              <div>
                <div className="text-lg font-bold text-white">{stats.uniqueProjects}</div>
                <div className="text-[10px] text-slate-500 uppercase tracking-wide">
                  Unique Projects
                </div>
              </div>
            </div>
          )}

          {stats && stats.endorsements.topReasons.length > 0 && (
            <div>
              <h4 className="text-[10px] uppercase tracking-wide text-purple-300 mb-2 flex items-center gap-1.5">
                <Star className="w-3 h-3" />
                Architect Endorsements ({stats.endorsements.count})
              </h4>
              <div className="space-y-1.5">
                {stats.endorsements.topReasons.map((e) => (
                  <p
                    key={e.userId + e.timestamp}
                    className="text-xs text-slate-300 italic bg-purple-500/5 border border-purple-500/20 rounded px-2 py-1.5"
                  >
                    "{e.reason}"
                  </p>
                ))}
              </div>
            </div>
          )}

          <div className="flex items-center gap-2 pt-2 border-t border-[#334155]/50">
            {onAdopt && (
              <button
                type="button"
                onClick={() => onAdopt(pattern.slug)}
                disabled={adopting || blocked}
                className="px-4 py-1.5 rounded bg-[#7c3aed] hover:bg-[#8b5cf6] disabled:bg-slate-600 disabled:cursor-not-allowed text-white text-sm font-medium transition-colors"
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
                className={`px-3 py-1.5 rounded text-sm font-medium transition-colors flex items-center gap-1.5 ${
                  hasMyEndorsement
                    ? 'bg-purple-500/30 text-purple-100 hover:bg-purple-500/40'
                    : 'bg-slate-700/50 text-slate-300 hover:bg-slate-700'
                }`}
                data-testid="endorse-button"
              >
                <Star
                  className={`w-3.5 h-3.5 ${hasMyEndorsement ? 'fill-current' : ''}`}
                />
                {hasMyEndorsement
                  ? 'Endorsed'
                  : `Endorse${endorsementCount > 0 ? ` (${endorsementCount})` : ''}`}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default PatternRow;
