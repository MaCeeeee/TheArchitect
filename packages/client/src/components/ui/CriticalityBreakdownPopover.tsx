import { useEffect, useMemo, useRef } from 'react';
import { X, AlertTriangle, ArrowRight } from 'lucide-react';
import { FACTOR_LABELS } from '@thearchitect/shared';
import type { CriticalityFactor, CriticalityScoreEntry } from '@thearchitect/shared';
import { useCriticalityStore } from '../../stores/criticalityStore';

type ActionLayer = 'motivation' | 'strategy' | 'business' | 'tech';

const layerBucket = (layer: string): ActionLayer => {
  if (layer === 'motivation') return 'motivation';
  if (layer === 'strategy') return 'strategy';
  if (layer === 'business') return 'business';
  return 'tech'; // information / application / technology / physical / implementation_migration
};

const FACTOR_ACTION_MAP: Record<
  CriticalityFactor,
  Record<ActionLayer, { label: string; hint: string }>
> = {
  spof: {
    motivation: {
      label: 'Reduce downstream coupling',
      hint: 'This driver/goal is referenced by many elements. Add anti-corruption-layers in the realizing capabilities so future changes do not cascade.',
    },
    strategy: {
      label: 'Decompose Capability',
      hint: 'Split this capability into smaller, independently-owned sub-capabilities to reduce blast radius.',
    },
    business: {
      label: 'Add Process Redundancy',
      hint: 'Define a backup process or fallback workflow for this critical business step.',
    },
    tech: {
      label: 'Apply Redundancy-Pattern',
      hint: 'Use the Pattern Library to add redundancy for this single-point-of-failure (managed queue, multi-region, etc.).',
    },
  },
  riskConnectivity: {
    motivation: {
      label: 'Map driver to specific capabilities',
      hint: 'High-risk driver is connected too broadly. Map it to a narrower set of capabilities to reduce the change blast-radius.',
    },
    strategy: {
      label: 'Tighten Capability Boundaries',
      hint: 'Split this hub-capability and lower the riskLevel via explicit ownership.',
    },
    business: {
      label: 'Reduce Process Coupling',
      hint: 'Decouple this process via async events and clear handoffs.',
    },
    tech: {
      label: 'Reduce Risk-Exposure',
      hint: 'Either lower riskLevel through hardening, or split this hub into smaller services.',
    },
  },
  maturityFloor: {
    motivation: {
      label: 'Define acceptance criteria',
      hint: 'This driver is immature and has dependents. Write explicit, testable acceptance criteria.',
    },
    strategy: {
      label: 'Capability Maturity Workshop',
      hint: 'Run a maturity assessment workshop with the capability owner.',
    },
    business: {
      label: 'Process Standardization',
      hint: 'Document and standardize this process before more dependents form.',
    },
    tech: {
      label: 'Increase Maturity',
      hint: 'Adopt a Most-Used Pattern to harden this immature component.',
    },
  },
  complianceGap: {
    motivation: {
      label: 'Trace Driver → Realizer',
      hint: 'This regulatory driver has unrealized standard sections. Identify which elements should fulfill them.',
    },
    strategy: {
      label: 'Map Capability to Standard',
      hint: 'Open Gap-Analysis: which standard sections require this capability?',
    },
    business: {
      label: 'Compliance Process Audit',
      hint: 'Audit this process against the unrealized standard mappings.',
    },
    tech: {
      label: 'Open Gap-Analysis',
      hint: 'Map this element to the missing standard sections (UC-GAP).',
    },
  },
  costBurden: {
    motivation: {
      label: 'Driver Cost Justification',
      hint: 'A driver/goal dominates the wave cost — document the business case explicitly.',
    },
    strategy: {
      label: 'Capability Investment Review',
      hint: 'Is the capability investment proportional to its strategic value?',
    },
    business: {
      label: 'Process Cost-Optimization',
      hint: 'Review process efficiency; consider automation or outsourcing.',
    },
    tech: {
      label: 'Cost-Optimization (7Rs)',
      hint: 'Element dominates a wave’s cost — review the 7Rs strategy (Retire/Replace/Re-host/etc.).',
    },
  },
  stakeholderBottleneck: {
    motivation: {
      label: 'Driver-Sponsor Alignment',
      hint: 'Stakeholders disagree on this driver/goal — run an alignment workshop with the sponsor.',
    },
    strategy: {
      label: 'Capability Ownership Clarification',
      hint: 'Define a single capability owner to resolve stakeholder conflicts.',
    },
    business: {
      label: 'Process RACI Workshop',
      hint: 'Run a RACI workshop with all stakeholders for this process.',
    },
    tech: {
      label: 'Stakeholder-Alignment',
      hint: 'Stakeholders disagree on this element — run a MiroFish session.',
    },
  },
  cycleTangle: {
    motivation: {
      label: 'Add Explicit Realizers',
      hint: 'A driver/goal cannot truly cycle — the cycle is a modeling artifact. Insert explicit Realizer relationships to break the implicit loop.',
    },
    strategy: {
      label: 'Capability Hierarchy Refactor',
      hint: 'Re-model the capability hierarchy as a tree, not a graph. Cycles in strategy usually indicate a missing level of abstraction.',
    },
    business: {
      label: 'Process Decoupling',
      hint: 'Break the process cycle by introducing an event or hand-off step.',
    },
    tech: {
      label: 'Refactor Dependency-Cycle',
      hint: 'Break the cycle by introducing an event or message bus.',
    },
  },
};

interface Props {
  projectId: string | null;
}

const scoreColor = (score: number): string => {
  if (score >= 90) return 'text-red-300';
  if (score >= 70) return 'text-orange-300';
  if (score >= 50) return 'text-yellow-300';
  return 'text-slate-300';
};

const barColor = (factor: CriticalityFactor): string => {
  switch (factor) {
    case 'spof':
      return 'bg-red-400';
    case 'riskConnectivity':
      return 'bg-orange-400';
    case 'maturityFloor':
      return 'bg-yellow-400';
    case 'complianceGap':
      return 'bg-purple-400';
    case 'costBurden':
      return 'bg-blue-400';
    case 'stakeholderBottleneck':
      return 'bg-cyan-400';
    case 'cycleTangle':
      return 'bg-rose-400';
  }
};

export function CriticalityBreakdownPopover({ projectId }: Props) {
  const breakdownId = useCriticalityStore((s) => s.breakdownPopoverId);
  const scores = useCriticalityStore((s) => s.scores);
  const close = () => useCriticalityStore.getState().openBreakdownPopover(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!breakdownId) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [breakdownId]);

  const entry = useMemo<CriticalityScoreEntry | null>(() => {
    if (!breakdownId) return null;
    return scores.find((s) => s.elementId === breakdownId) ?? null;
  }, [breakdownId, scores]);

  if (!breakdownId || !entry || !projectId) return null;

  const factorEntries = (Object.keys(entry.factors) as CriticalityFactor[])
    .map((k) => ({
      key: k,
      label: FACTOR_LABELS[k],
      ...entry.factors[k],
      points: Math.round(entry.factors[k].weighted * 1000) / 10,
    }))
    .sort((a, b) => b.weighted - a.weighted);

  const dominant = entry.dominantFactor;
  const dominantAction = dominant
    ? FACTOR_ACTION_MAP[dominant][layerBucket(entry.layer)]
    : null;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center pointer-events-none"
      onClick={close}
    >
      <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px] pointer-events-auto" />
      <div
        ref={containerRef}
        className="relative pointer-events-auto bg-[#1e293b] border border-[#7c3aed]/40 rounded-lg shadow-xl w-full max-w-md p-4 m-4"
        onClick={(e) => e.stopPropagation()}
        data-testid="criticality-breakdown-popover"
      >
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wide text-slate-400">
              <AlertTriangle className="w-3 h-3 text-orange-400" />
              Why is this critical?
            </div>
            <h2 className="text-sm font-semibold text-white truncate mt-0.5" title={entry.name}>
              {entry.name}
            </h2>
            <p className="text-[10px] text-slate-500 capitalize">
              {entry.type} · {entry.layer}
            </p>
          </div>
          <div className="flex items-start gap-2">
            <div className={`text-2xl font-bold font-mono ${scoreColor(entry.totalScore)}`}>
              {entry.totalScore}
            </div>
            <button
              type="button"
              onClick={close}
              className="text-slate-400 hover:text-white"
              aria-label="Close"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="space-y-1.5">
          {factorEntries.map((f) => (
            <div key={f.key} className="flex items-center gap-2 text-xs">
              <span
                className={`w-36 truncate ${f.weighted >= 0.1 ? 'text-white font-medium' : 'text-slate-500'}`}
                title={f.label}
              >
                {f.label}
              </span>
              <div className="flex-1 bg-slate-700/40 rounded h-2 overflow-hidden">
                <div
                  className={`h-full ${barColor(f.key)} transition-all`}
                  style={{ width: `${Math.min(100, f.normalized * 100)}%` }}
                />
              </div>
              <span className="w-10 text-right font-mono text-slate-400">
                {f.weighted > 0 ? f.points.toFixed(1) : '—'}
              </span>
            </div>
          ))}
        </div>

        {dominantAction && (
          <div className="mt-4 pt-3 border-t border-[#334155]">
            <p className="text-[10px] uppercase tracking-wide text-slate-500 mb-1.5 flex items-center gap-1">
              <ArrowRight className="w-3 h-3" />
              Suggested Action
            </p>
            <div className="bg-[#7c3aed]/10 border border-[#7c3aed]/30 rounded p-2">
              <p className="text-sm text-white font-medium">{dominantAction.label}</p>
              <p className="text-xs text-slate-300 mt-1">{dominantAction.hint}</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default CriticalityBreakdownPopover;
