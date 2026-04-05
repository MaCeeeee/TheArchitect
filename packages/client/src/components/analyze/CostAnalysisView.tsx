import { useMemo, useState, useCallback, useEffect, useRef, Fragment } from 'react';
import {
  DollarSign, TrendingDown, PieChart, BarChart3, Layers, ChevronDown, ChevronRight,
  ArrowUpDown, Save, Info,
} from 'lucide-react';
import { useArchitectureStore } from '../../stores/architectureStore';
import { useXRayStore } from '../../stores/xrayStore';
import {
  BASE_COSTS_BY_TYPE, STATUS_COST_MULTIPLIERS,
} from '@thearchitect/shared';
import type { CostTier, SevenRsStrategy } from '@thearchitect/shared';
import CostBreakdown from '../analytics/CostBreakdown';
import ProbabilisticCost from '../analytics/ProbabilisticCost';

// ─── Constants ───

const TIER_COLORS: Record<CostTier, string> = { 0: '#6b7280', 1: '#f59e0b', 2: '#3b82f6', 3: '#22c55e' };
const TIER_LABELS: Record<CostTier, string> = { 0: 'Relative', 1: '±30-50%', 2: '±15-30%', 3: 'P10/P50/P90' };

const STRATEGY_OPTIONS: SevenRsStrategy[] = [
  'retain', 'retire', 'rehost', 'replatform', 'refactor', 'repurchase', 'relocate',
];

const formatCost = (n: number) => {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return n.toString();
};

// Tooltips for all cost fields
const FIELD_TOOLTIPS: Record<string, string> = {
  annualCost: 'Total annual operating cost for this component (licenses, hosting, maintenance). Drives all cost calculations.',
  strategy: 'Migration strategy from the 7Rs framework: Retain, Retire, Rehost, Replatform, Refactor, Repurchase, Relocate.',
  userCount: 'Number of active users affected by transformation. Used for training cost and change management calculations.',
  recordCount: 'Number of data records to be migrated. Drives the 1-10-100 data migration cost model.',
  ksloc: 'Thousands of source lines of code (KSLOC). Used in COCOMO II effort estimation and SQALE technical debt calculation.',
  technicalFitness: 'Technical fitness score (1=poor, 5=excellent). Used in the TIME matrix for investment decisions.',
  functionalFitness: 'Functional/business fit score (1=poor, 5=excellent). Used in the TIME matrix for investment decisions.',
  errorRatePercent: 'Defect rate as percentage (0-100%). Feeds into Cost of Poor Quality (COPQ) calculation.',
  hourlyRate: 'Blended hourly rate for personnel. Default: 85 EUR (DACH market). Used across all labor-dependent models.',
  monthlyInfraCost: 'Monthly infrastructure cost (hosting, cloud resources, licenses). Annualized in TCO calculation.',
  technicalDebtRatio: 'SQALE Technical Debt Ratio (0-1). E.g. 0.15 = 15% of development effort goes to debt servicing.',
  costEstimateOptimistic: 'Best-case total cost (O). Used in PERT: mean = (O + 4M + P) / 6. The lower bound of the triangle.',
  costEstimateMostLikely: 'Most likely total cost (M). The peak of the PERT distribution. Used for P50 estimates.',
  costEstimatePessimistic: 'Worst-case total cost (P). The upper bound. With O and M, enables Monte Carlo simulation (10K iterations).',
  successProbability: 'Probability of transformation success (0-1). Used in risk-adjusted NPV: rNPV = NPV × cumulative P(success).',
  costOfDelayPerWeek: 'Weekly cost when transformation is delayed. Used in WSJF prioritization and opportunity cost calculation.',
};

// All editable fields in order for Tab/Enter navigation
const EDIT_FIELDS = [
  // Tier 1
  { key: 'annualCost', label: 'Annual Cost', placeholder: 'e.g. 50000', suffix: 'EUR', tier: 1, isSelect: false },
  { key: 'strategy', label: 'Strategy (7Rs)', placeholder: '', suffix: '', tier: 1, isSelect: true },
  { key: 'userCount', label: 'Affected Users', placeholder: 'e.g. 200', suffix: '', tier: 1, isSelect: false },
  { key: 'recordCount', label: 'Data Records', placeholder: 'e.g. 100000', suffix: '', tier: 1, isSelect: false },
  // Tier 2
  { key: 'ksloc', label: 'Codebase (KSLOC)', placeholder: 'e.g. 150', suffix: '', tier: 2, isSelect: false },
  { key: 'technicalFitness', label: 'Tech Fitness', placeholder: '1-5', suffix: '', tier: 2, isSelect: false },
  { key: 'functionalFitness', label: 'Business Fit', placeholder: '1-5', suffix: '', tier: 2, isSelect: false },
  { key: 'errorRatePercent', label: 'Defect Rate', placeholder: '0-100', suffix: '%', tier: 2, isSelect: false },
  { key: 'hourlyRate', label: 'Hourly Rate', placeholder: '85', suffix: 'EUR', tier: 2, isSelect: false },
  { key: 'monthlyInfraCost', label: 'Infra/Month', placeholder: 'e.g. 500', suffix: 'EUR', tier: 2, isSelect: false },
  { key: 'technicalDebtRatio', label: 'Tech Debt Ratio', placeholder: '0-1', suffix: '', tier: 2, isSelect: false },
  // Tier 3
  { key: 'costEstimateOptimistic', label: 'Best Case (O)', placeholder: 'e.g. 30000', suffix: 'EUR', tier: 3, isSelect: false },
  { key: 'costEstimateMostLikely', label: 'Most Likely (M)', placeholder: 'e.g. 50000', suffix: 'EUR', tier: 3, isSelect: false },
  { key: 'costEstimatePessimistic', label: 'Worst Case (P)', placeholder: 'e.g. 90000', suffix: 'EUR', tier: 3, isSelect: false },
  { key: 'successProbability', label: 'Success Prob.', placeholder: '0-1', suffix: '', tier: 3, isSelect: false },
  { key: 'costOfDelayPerWeek', label: 'Cost of Delay', placeholder: 'e.g. 5000', suffix: 'EUR/wk', tier: 3, isSelect: false },
] as const;

type SortKey = 'name' | 'type' | 'annualCost' | 'estimated' | 'optimization' | 'tier' | 'domain';

// Per-row edit state
interface RowEditState {
  values: Record<string, string>;
  dirty: boolean;
}

function loadValuesFromElement(el: { annualCost?: number; transformationStrategy?: string; userCount?: number; recordCount?: number; ksloc?: number; technicalFitness?: number; functionalFitness?: number; errorRatePercent?: number; hourlyRate?: number; monthlyInfraCost?: number; technicalDebtRatio?: number; costEstimateOptimistic?: number; costEstimateMostLikely?: number; costEstimatePessimistic?: number; successProbability?: number; costOfDelayPerWeek?: number }): Record<string, string> {
  return {
    annualCost: el.annualCost?.toString() || '',
    strategy: el.transformationStrategy || '',
    userCount: el.userCount?.toString() || '',
    recordCount: el.recordCount?.toString() || '',
    ksloc: el.ksloc?.toString() || '',
    technicalFitness: el.technicalFitness?.toString() || '',
    functionalFitness: el.functionalFitness?.toString() || '',
    errorRatePercent: el.errorRatePercent?.toString() || '',
    hourlyRate: el.hourlyRate?.toString() || '',
    monthlyInfraCost: el.monthlyInfraCost?.toString() || '',
    technicalDebtRatio: el.technicalDebtRatio?.toString() || '',
    costEstimateOptimistic: el.costEstimateOptimistic?.toString() || '',
    costEstimateMostLikely: el.costEstimateMostLikely?.toString() || '',
    costEstimatePessimistic: el.costEstimatePessimistic?.toString() || '',
    successProbability: el.successProbability?.toString() || '',
    costOfDelayPerWeek: el.costOfDelayPerWeek?.toString() || '',
  };
}

export default function CostAnalysisView() {
  const elements = useArchitectureStore((s) => s.elements);
  const updateElement = useArchitectureStore((s) => s.updateElement);
  const projectId = useArchitectureStore((s) => s.projectId);
  const graphCostProfiles = useXRayStore((s) => s.graphCostProfiles);
  const fetchGraphCost = useXRayStore((s) => s.fetchGraphCost);
  const recompute = useXRayStore((s) => s.recompute);

  const [sortKey, setSortKey] = useState<SortKey>('estimated');
  const [sortAsc, setSortAsc] = useState(false);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [editStates, setEditStates] = useState<Map<string, RowEditState>>(new Map());

  // ─── Fetch graph cost data on mount ───
  useEffect(() => {
    if (projectId) {
      recompute();
      fetchGraphCost(projectId);
    }
  }, [projectId]); // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Computed data ───
  const profileMap = useMemo(
    () => new Map(graphCostProfiles.map((p) => [p.elementId, p])),
    [graphCostProfiles],
  );

  const dominantTier = useMemo((): CostTier => {
    if (graphCostProfiles.length === 0) return 0;
    const tc = [0, 0, 0, 0];
    for (const p of graphCostProfiles) tc[p.tier]++;
    for (let t = 3; t >= 0; t--) if (tc[t] > 0) return t as CostTier;
    return 0;
  }, [graphCostProfiles]);

  const rows = useMemo(() => {
    return elements.filter((el) => el && el.id).map((el) => {
      const profile = profileMap.get(el.id);
      const baseCost = (el.annualCost && el.annualCost > 0) ? el.annualCost : (BASE_COSTS_BY_TYPE?.[el.type] ?? 10_000);
      const statusMul = STATUS_COST_MULTIPLIERS?.[el.status || 'current'] ?? 1.0;
      const estimated = profile?.totalEstimated || Math.round(baseCost * statusMul);
      const maturity = el.maturityLevel ?? 3;
      const optimization = el.status === 'retired' ? estimated * 0.9
        : maturity <= 2 ? estimated * 0.3
        : el.status === 'transitional' ? estimated * 0.4 : 0;
      const tier: CostTier = profile?.tier ?? 0;
      return {
        ...el,
        estimated,
        optimization: Math.round(optimization),
        tier,
        domain: el.togafDomain || 'technology',
      };
    });
  }, [elements, graphCostProfiles, profileMap]);

  const sortedRows = useMemo(() => {
    const sorted = [...rows].sort((a, b) => {
      let cmp = 0;
      switch (sortKey) {
        case 'name': cmp = a.name.localeCompare(b.name); break;
        case 'type': cmp = a.type.localeCompare(b.type); break;
        case 'annualCost': cmp = (a.annualCost || 0) - (b.annualCost || 0); break;
        case 'estimated': cmp = a.estimated - b.estimated; break;
        case 'optimization': cmp = a.optimization - b.optimization; break;
        case 'tier': cmp = a.tier - b.tier; break;
        case 'domain': cmp = a.domain.localeCompare(b.domain); break;
      }
      return sortAsc ? cmp : -cmp;
    });
    return sorted;
  }, [rows, sortKey, sortAsc]);

  const totalCost = useMemo(() => rows.reduce((s, r) => s + r.estimated, 0), [rows]);
  const totalOptimization = useMemo(() => rows.reduce((s, r) => s + r.optimization, 0), [rows]);

  const byDomain = useMemo(() => {
    const m: Record<string, number> = {};
    for (const r of rows) m[r.domain] = (m[r.domain] || 0) + r.estimated;
    return Object.entries(m).sort((a, b) => b[1] - a[1]);
  }, [rows]);

  const byStatus = useMemo(() => {
    const m: Record<string, number> = {};
    for (const r of rows) {
      const st = r.status || 'current';
      m[st] = (m[st] || 0) + r.estimated;
    }
    return Object.entries(m).sort((a, b) => b[1] - a[1]);
  }, [rows]);

  // ─── Edit helpers ───
  const saveRow = useCallback((id: string) => {
    const state = editStates.get(id);
    if (!state || !state.dirty) return;
    const v = state.values;
    const numOrUndef = (s: string) => { const n = parseFloat(s); return isNaN(n) ? undefined : n; };
    updateElement(id, {
      annualCost: numOrUndef(v.annualCost),
      transformationStrategy: (v.strategy || undefined) as SevenRsStrategy | undefined,
      userCount: numOrUndef(v.userCount),
      recordCount: numOrUndef(v.recordCount),
      ksloc: numOrUndef(v.ksloc),
      technicalFitness: numOrUndef(v.technicalFitness),
      functionalFitness: numOrUndef(v.functionalFitness),
      errorRatePercent: numOrUndef(v.errorRatePercent),
      hourlyRate: numOrUndef(v.hourlyRate),
      monthlyInfraCost: numOrUndef(v.monthlyInfraCost),
      technicalDebtRatio: numOrUndef(v.technicalDebtRatio),
      costEstimateOptimistic: numOrUndef(v.costEstimateOptimistic),
      costEstimateMostLikely: numOrUndef(v.costEstimateMostLikely),
      costEstimatePessimistic: numOrUndef(v.costEstimatePessimistic),
      successProbability: numOrUndef(v.successProbability),
      costOfDelayPerWeek: numOrUndef(v.costOfDelayPerWeek),
    });
    setEditStates((prev) => {
      const next = new Map(prev);
      next.set(id, { ...state, dirty: false });
      return next;
    });
    if (projectId) setTimeout(() => fetchGraphCost(projectId), 500);
  }, [editStates, updateElement, projectId, fetchGraphCost]);

  const toggleRow = useCallback((id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        // Collapsing — auto-save
        saveRow(id);
        next.delete(id);
      } else {
        // Expanding — load values
        const el = elements.find((e) => e.id === id);
        if (el) {
          setEditStates((p) => {
            const n = new Map(p);
            n.set(id, { values: loadValuesFromElement(el), dirty: false });
            return n;
          });
        }
        next.add(id);
      }
      return next;
    });
  }, [elements, saveRow]);

  const updateFieldValue = useCallback((id: string, field: string, value: string) => {
    setEditStates((prev) => {
      const next = new Map(prev);
      const state = next.get(id);
      if (state) {
        next.set(id, { values: { ...state.values, [field]: value }, dirty: true });
      }
      return next;
    });
  }, []);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) setSortAsc(!sortAsc);
    else { setSortKey(key); setSortAsc(false); }
  };

  const SortHeader = ({ label, sKey }: { label: string; sKey: SortKey }) => (
    <button onClick={() => handleSort(sKey)}
      className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-[var(--text-tertiary)] hover:text-white transition">
      {label}
      {sortKey === sKey && <ArrowUpDown size={10} className="text-[#a78bfa]" />}
    </button>
  );

  const domainColors: Record<string, string> = {
    business: '#22c55e', data: '#3b82f6', application: '#f97316', technology: '#00ff41',
    strategy: '#a78bfa', motivation: '#ec4899', implementation: '#06b6d4',
  };
  const statusColors: Record<string, string> = {
    current: '#22c55e', target: '#06b6d4', transitional: '#eab308', retired: '#ef4444', phase_out: '#ef4444',
  };

  // ─── Inline Edit Panel (rendered per row) ───
  const EditPanel = ({ rowId }: { rowId: string }) => {
    const state = editStates.get(rowId);
    if (!state) return null;
    const panelRef = useRef<HTMLDivElement>(null);

    const focusNextField = (currentIndex: number) => {
      if (!panelRef.current) return;
      const fields = panelRef.current.querySelectorAll<HTMLInputElement | HTMLSelectElement>('[data-field-index]');
      for (const field of fields) {
        const idx = parseInt(field.getAttribute('data-field-index') || '-1');
        if (idx > currentIndex) { field.focus(); return; }
      }
    };

    const onKeyDown = (e: React.KeyboardEvent, fieldIndex: number) => {
      if (e.key === 'Enter') { e.preventDefault(); focusNextField(fieldIndex); }
      else if (e.key === 'Escape') {
        e.preventDefault();
        const el = elements.find((x) => x.id === rowId);
        if (el) setEditStates((p) => { const n = new Map(p); n.set(rowId, { values: loadValuesFromElement(el), dirty: false }); return n; });
      }
    };

    const renderField = (f: typeof EDIT_FIELDS[number], globalIdx: number) => (
      <div key={f.key} className="flex items-center gap-2 mb-1.5">
        <label
          className="text-[10px] text-[var(--text-tertiary)] w-24 shrink-0 border-b border-dotted border-[var(--text-disabled)] cursor-help"
          title={FIELD_TOOLTIPS[f.key]}>
          {f.label}
        </label>
        {f.isSelect ? (
          <select
            data-field-index={globalIdx}
            value={state.values[f.key] || ''}
            onChange={(e) => updateFieldValue(rowId, f.key, e.target.value)}
            onKeyDown={(e) => onKeyDown(e, globalIdx)}
            className="flex-1 rounded border border-[var(--border-subtle)] bg-[var(--surface-raised)] px-2 py-1.5 text-xs text-white focus:border-[#7c3aed] focus:outline-none">
            <option value="">–</option>
            {STRATEGY_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        ) : (
          <div className="flex items-center gap-1 flex-1">
            <input
              data-field-index={globalIdx}
              value={state.values[f.key] || ''}
              onChange={(e) => updateFieldValue(rowId, f.key, e.target.value)}
              onKeyDown={(e) => onKeyDown(e, globalIdx)}
              placeholder={f.placeholder}
              className="flex-1 rounded border border-[var(--border-subtle)] bg-[var(--surface-raised)] px-2 py-1.5 text-xs text-white placeholder:text-[var(--text-disabled)] focus:border-[#7c3aed] focus:outline-none"
            />
            {f.suffix && <span className="text-[10px] text-[var(--text-disabled)]">{f.suffix}</span>}
          </div>
        )}
      </div>
    );

    return (
      <tr>
        <td colSpan={7} className="p-0">
          <div ref={panelRef}
            className="border-l-2 border-l-[#7c3aed] bg-[var(--surface-base)] px-6 py-3"
            onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Info size={12} className="text-[var(--text-disabled)]" />
                <span className="text-[10px] text-[var(--text-tertiary)]">
                  Hover labels for field explanations &middot; Enter = next field &middot; Esc = reset
                </span>
              </div>
              <div className="flex items-center gap-2">
                {state.dirty && (
                  <span className="text-[9px] text-[#f59e0b] animate-pulse">unsaved</span>
                )}
                <button onClick={() => saveRow(rowId)}
                  className={`flex items-center gap-1.5 px-3 py-1 rounded text-xs transition ${
                    state.dirty
                      ? 'bg-[#7c3aed] text-white hover:bg-[#6d28d9]'
                      : 'bg-[var(--surface-overlay)] text-[var(--text-disabled)] cursor-default'
                  }`}
                  disabled={!state.dirty}>
                  <Save size={11} /> Save
                </button>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-x-8 gap-y-0">
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-[#f59e0b]/20 text-[#f59e0b] border border-[#f59e0b]/40">T1</span>
                  <span className="text-[10px] font-semibold uppercase text-[var(--text-tertiary)]">Basic</span>
                </div>
                {EDIT_FIELDS.filter((f) => f.tier === 1).map((f) => renderField(f, EDIT_FIELDS.indexOf(f)))}
              </div>
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-[#3b82f6]/20 text-[#3b82f6] border border-[#3b82f6]/40">T2</span>
                  <span className="text-[10px] font-semibold uppercase text-[var(--text-tertiary)]">Detailed (±15-30%)</span>
                </div>
                {EDIT_FIELDS.filter((f) => f.tier === 2).map((f) => renderField(f, EDIT_FIELDS.indexOf(f)))}
              </div>
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-[#22c55e]/20 text-[#22c55e] border border-[#22c55e]/40">T3</span>
                  <span className="text-[10px] font-semibold uppercase text-[var(--text-tertiary)]">Probabilistic (P10/P50/P90)</span>
                </div>
                {EDIT_FIELDS.filter((f) => f.tier === 3).map((f) => renderField(f, EDIT_FIELDS.indexOf(f)))}
              </div>
            </div>
          </div>
        </td>
      </tr>
    );
  };

  return (
    <div className="space-y-6">
      {/* ─── Summary Row ─── */}
      <div className="grid grid-cols-4 gap-4">
        <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-raised)] p-4">
          <div className="flex items-center gap-1.5 mb-1">
            <PieChart size={14} className="text-[#3b82f6]" />
            <span className="text-[10px] text-[var(--text-tertiary)]">Total TCO</span>
          </div>
          <div className="text-2xl font-bold text-white">${formatCost(totalCost)}</div>
          <div className="text-[10px] text-[var(--text-tertiary)] mt-0.5">{rows.length} elements</div>
        </div>
        <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-raised)] p-4">
          <div className="flex items-center gap-1.5 mb-1">
            <TrendingDown size={14} className="text-[#22c55e]" />
            <span className="text-[10px] text-[var(--text-tertiary)]">Save Potential</span>
          </div>
          <div className="text-2xl font-bold text-[#22c55e]">${formatCost(totalOptimization)}</div>
          <div className="text-[10px] text-[var(--text-tertiary)] mt-0.5">
            {totalCost > 0 ? `${Math.round((totalOptimization / totalCost) * 100)}% of TCO` : '–'}
          </div>
        </div>
        <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-raised)] p-4">
          <div className="flex items-center gap-1.5 mb-1">
            <Layers size={14} style={{ color: TIER_COLORS[dominantTier] }} />
            <span className="text-[10px] text-[var(--text-tertiary)]">Data Quality</span>
          </div>
          <div className="text-2xl font-bold" style={{ color: TIER_COLORS[dominantTier] }}>
            Tier {dominantTier}
          </div>
          <div className="text-[10px] text-[var(--text-tertiary)] mt-0.5">{TIER_LABELS[dominantTier]}</div>
        </div>
        <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-raised)] p-4">
          <div className="flex items-center gap-1.5 mb-1">
            <DollarSign size={14} className="text-[#f59e0b]" />
            <span className="text-[10px] text-[var(--text-tertiary)]">Avg. per Element</span>
          </div>
          <div className="text-2xl font-bold text-white">
            ${rows.length > 0 ? formatCost(Math.round(totalCost / rows.length)) : '0'}
          </div>
          <div className="text-[10px] text-[var(--text-tertiary)] mt-0.5">estimated annual</div>
        </div>
      </div>

      {/* ─── Domain + Status side by side ─── */}
      <div className="grid grid-cols-2 gap-6">
        <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-raised)] p-4">
          <h4 className="text-xs font-semibold text-white flex items-center gap-1.5 mb-3">
            <BarChart3 size={12} /> By Domain
          </h4>
          <div className="space-y-2">
            {byDomain.map(([domain, cost]) => (
              <div key={domain} className="flex items-center gap-3">
                <span className="text-xs text-[var(--text-secondary)] w-24 capitalize">{domain}</span>
                <div className="flex-1 h-4 rounded-full bg-[var(--surface-base)]">
                  <div className="h-full rounded-full transition-all"
                    style={{ width: `${(cost / totalCost) * 100}%`, backgroundColor: domainColors[domain] || '#4a5a4a' }} />
                </div>
                <span className="text-xs text-white font-mono w-16 text-right">${formatCost(cost)}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-raised)] p-4">
          <h4 className="text-xs font-semibold text-white mb-3">By Lifecycle Status</h4>
          <div className="grid grid-cols-2 gap-2">
            {byStatus.map(([status, cost]) => (
              <div key={status} className="rounded-md border border-[var(--border-subtle)] bg-[var(--surface-base)] p-3"
                style={{ borderLeftColor: statusColors[status] || '#4a5a4a', borderLeftWidth: 3 }}>
                <span className="text-xs capitalize" style={{ color: statusColors[status] }}>{status.replace('_', ' ')}</span>
                <div className="text-sm font-bold text-white mt-1">${formatCost(cost)}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ─── Element Cost Table ─── */}
      <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-raised)]">
        <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border-subtle)]">
          <h4 className="text-xs font-semibold text-white flex items-center gap-1.5">
            <DollarSign size={14} className="text-[#22c55e]" />
            Element Cost Details
          </h4>
          <span className="text-[10px] text-[var(--text-tertiary)]">
            Click row to expand &middot; Multiple rows can be open for comparison
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-[var(--border-subtle)]">
                <th className="px-4 py-2 text-left"><SortHeader label="Name" sKey="name" /></th>
                <th className="px-3 py-2 text-left"><SortHeader label="Domain" sKey="domain" /></th>
                <th className="px-3 py-2 text-right"><SortHeader label="Annual Cost" sKey="annualCost" /></th>
                <th className="px-3 py-2 text-center">Strategy</th>
                <th className="px-3 py-2 text-right"><SortHeader label="Estimated" sKey="estimated" /></th>
                <th className="px-3 py-2 text-right"><SortHeader label="Savings" sKey="optimization" /></th>
                <th className="px-3 py-2 text-center"><SortHeader label="Tier" sKey="tier" /></th>
              </tr>
            </thead>
            <tbody>
              {sortedRows.map((row) => {
                const isExpanded = expandedIds.has(row.id);
                const tierColor = TIER_COLORS[row.tier];

                return (
                  <Fragment key={row.id}>
                    <tr
                      onClick={() => toggleRow(row.id)}
                      className={`border-b border-[var(--border-subtle)] cursor-pointer transition ${
                        isExpanded
                          ? 'bg-[#7c3aed]/10'
                          : 'hover:bg-[var(--surface-base)]/50'
                      }`}>
                      <td className="px-4 py-2.5">
                        <div className="flex items-center gap-1.5">
                          {isExpanded
                            ? <ChevronDown size={12} className="text-[#a78bfa] shrink-0" />
                            : <ChevronRight size={12} className="text-[var(--text-disabled)] shrink-0" />}
                          <span className="text-white truncate max-w-[200px]">{row.name}</span>
                          <span className="text-[10px] text-[var(--text-disabled)] ml-1">
                            {row.type.replace(/_/g, ' ')}
                          </span>
                        </div>
                      </td>
                      <td className="px-3 py-2.5">
                        <span className="capitalize text-[var(--text-secondary)]">{row.domain}</span>
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono">
                        <span className={row.annualCost ? 'text-white' : 'text-[var(--text-disabled)]'}>
                          {row.annualCost ? `$${formatCost(row.annualCost)}` : '–'}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-center">
                        <span className={row.transformationStrategy ? 'text-[#a78bfa] capitalize' : 'text-[var(--text-disabled)]'}>
                          {row.transformationStrategy || '–'}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono text-white">${formatCost(row.estimated)}</td>
                      <td className="px-3 py-2.5 text-right font-mono">
                        {row.optimization > 0
                          ? <span className="text-[#22c55e]">-${formatCost(row.optimization)}</span>
                          : <span className="text-[var(--text-disabled)]">–</span>}
                      </td>
                      <td className="px-3 py-2.5 text-center">
                        <span className="inline-flex px-1.5 py-0.5 rounded text-[9px] font-mono font-medium"
                          style={{ backgroundColor: `${tierColor}20`, color: tierColor, border: `1px solid ${tierColor}40` }}>
                          T{row.tier}
                        </span>
                      </td>
                    </tr>
                    {isExpanded && <EditPanel rowId={row.id} />}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* ─── 7-Dimension Breakdown + Probabilistic side by side ─── */}
      <div className="grid grid-cols-2 gap-6">
        <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-raised)] overflow-hidden">
          <CostBreakdown />
        </div>
        <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-raised)] overflow-hidden">
          <ProbabilisticCost />
        </div>
      </div>
    </div>
  );
}
