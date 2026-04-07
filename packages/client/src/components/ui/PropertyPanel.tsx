import { useState, useRef, useCallback, useMemo, useEffect } from 'react';
import { X, Link, TrendingUp, Trash2, Bot, AlertCircle, CheckCircle2, AlertTriangle as WarnIcon, Sparkles, ArrowRightLeft, DollarSign, Layers, Zap, Shield } from 'lucide-react';
import toast from 'react-hot-toast';
import { useArchitectureStore } from '../../stores/architectureStore';
import { useUIStore } from '../../stores/uiStore';
import { useComplianceStore } from '../../stores/complianceStore';
import { useElementHealth, type HealthLevel } from '../../hooks/useElementHealth';
import { governanceAPI } from '../../services/api';
import type { PolicyViolationDTO } from '@thearchitect/shared';
import { CONNECTION_TYPES, ELEMENT_TYPES } from '@thearchitect/shared/src/constants/togaf.constants';
import { CATEGORY_BY_TYPE } from '@thearchitect/shared/src/constants/archimate-categories';
import { getValidRelationships, getDefaultRelationship, hasStrongRelationship, type StandardConnectionType } from '@thearchitect/shared/src/constants/archimate-rules';
import type { ElementType } from '@thearchitect/shared/src/types/architecture.types';

const RISK_COLORS: Record<string, string> = {
  low: '#22c55e',
  medium: '#eab308',
  high: '#f97316',
  critical: '#ef4444',
};

const STATUS_OPTIONS = ['current', 'target', 'transitional', 'retired'] as const;
const RISK_OPTIONS = ['low', 'medium', 'high', 'critical'] as const;
const PROVIDER_OPTIONS = ['openai', 'anthropic', 'google', 'azure', 'custom'] as const;
const AUTONOMY_OPTIONS = ['copilot', 'semi_autonomous', 'autonomous'] as const;

const AUTONOMY_COLORS: Record<string, string> = {
  copilot: '#22c55e',
  semi_autonomous: '#f59e0b',
  autonomous: '#ef4444',
};

export default function PropertyPanel() {
  const selectedElementId = useArchitectureStore((s) => s.selectedElementId);
  const elements = useArchitectureStore((s) => s.elements);
  const connections = useArchitectureStore((s) => s.connections);
  const updateElement = useArchitectureStore((s) => s.updateElement);
  const removeElement = useArchitectureStore((s) => s.removeElement);
  const pushHistory = useArchitectureStore((s) => s.pushHistory);
  const selectElement = useArchitectureStore((s) => s.selectElement);
  const togglePropertyPanel = useUIStore((s) => s.togglePropertyPanel);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const element = elements.find((el) => el.id === selectedElementId);
  // Must call hooks unconditionally (before any early return)
  const health = useElementHealth(selectedElementId ?? null);
  const violationsByElement = useComplianceStore((s) => s.violationsByElement);
  const violations = useComplianceStore((s) => s.violations);

  if (!element) {
    return (
      <aside className="w-72 border-l border-[var(--border-subtle)] bg-[var(--surface-raised)] p-4">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-white">Properties</h3>
          <button onClick={togglePropertyPanel} className="text-[var(--text-secondary)] hover:text-white">
            <X size={16} />
          </button>
        </div>
        <p className="text-xs text-[var(--text-tertiary)]">Select an element to view its properties.</p>
      </aside>
    );
  }

  const relatedConnections = connections.filter(
    (c) => c.sourceId === element.id || c.targetId === element.id
  );

  const handleFieldChange = (field: string, value: unknown) => {
    pushHistory();
    updateElement(element.id, { [field]: value });
  };

  const elementMeta = (element as typeof element & { metadata?: Record<string, unknown> }).metadata;
  const isPolicyNode = !!(elementMeta?.isPolicyNode);
  const elementViolationCount = violationsByElement.get(element.id) ?? 0;
  const elementViolations = violations.filter((v) => v.elementId === element.id);

  // Policy node: show specialized view
  if (isPolicyNode) {
    return (
      <PolicyPropertyView
        element={element}
        metadata={elementMeta!}
        violations={violations.filter((v) => v.policyId === (elementMeta?.policyId as string))}
        onClose={togglePropertyPanel}
        onSelectElement={selectElement}
      />
    );
  }

  return (
    <aside className="w-72 border-l border-[var(--border-subtle)] bg-[var(--surface-raised)] overflow-y-auto h-full">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-[var(--border-subtle)] p-4">
        <div className="flex items-center gap-2 min-w-0">
          {health && <HealthDot level={health.level} />}
          <h3 className="text-sm font-semibold text-white truncate">{element.name}</h3>
        </div>
        <button onClick={togglePropertyPanel} className="text-[var(--text-secondary)] hover:text-white shrink-0">
          <X size={16} />
        </button>
      </div>

      <div className="p-4 space-y-4">
        {/* Policy Violations Section — between Health and General */}
        {elementViolationCount > 0 && (
          <div className="rounded-lg border border-red-500/20 bg-red-500/5 p-2.5 space-y-1.5">
            <div className="flex items-center gap-1.5">
              <Shield size={11} className="text-red-400" />
              <span className="text-[10px] font-semibold uppercase tracking-wider text-red-400">
                Policy Violations ({elementViolationCount})
              </span>
            </div>
            {elementViolations.map((v, i) => (
              <button
                key={i}
                onClick={() => {
                  // Navigate to the policy node
                  const policyNodeId = `policy-${v.policyId}`;
                  const policyEl = elements.find((el) => el.id === policyNodeId);
                  if (policyEl) selectElement(policyEl.id);
                }}
                className="flex items-start gap-1.5 text-[10px] w-full text-left hover:bg-white/5 rounded px-1 py-0.5 transition"
              >
                <span className="mt-0.5 shrink-0 text-red-400">
                  {v.severity === 'error' ? '!' : v.severity === 'warning' ? '\u25CB' : 'i'}
                </span>
                <div>
                  <span className="text-[var(--text-secondary)]">{v.policyName || 'Policy'}</span>
                  <p className="text-[var(--text-disabled)] mt-0.5">{v.message}</p>
                </div>
              </button>
            ))}
          </div>
        )}

        {/* Health Section — only show if issues exist */}
        {health && health.issues.length > 0 && (
          <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-base)] p-2.5 space-y-1.5">
            <div className="flex items-center gap-1.5">
              <HealthIcon level={health.level} />
              <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-tertiary)]">
                Health {health.score}%
              </span>
            </div>
            {health.issues.map((issue, i) => (
              <div key={i} className="flex items-start gap-1.5 text-[10px]">
                <span className={`mt-0.5 shrink-0 ${
                  issue.level === 'bad' ? 'text-red-400' : 'text-amber-400'
                }`}>{issue.level === 'bad' ? '!' : '\u25CB'}</span>
                <div>
                  <span className="text-[var(--text-secondary)]">{issue.message}</span>
                  {issue.action && (
                    <p className="text-[var(--text-disabled)] mt-0.5">{issue.action}</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Editable name */}
        <Section title="General">
          <EditableField label="Name" value={element.name} onChange={(v) => handleFieldChange('name', v)} />
          <Field label="Type" value={element.type.replace(/_/g, ' ')} />
          <Field label="Layer" value={element.layer} />
          <Field label="TOGAF Domain" value={element.togafDomain} />
          <SelectField label="Status" value={element.status} options={STATUS_OPTIONS} onChange={(v) => handleFieldChange('status', v)} />
        </Section>

        {/* Risk & Maturity */}
        <Section title="Assessment">
          <SelectField label="Risk Level" value={element.riskLevel} options={RISK_OPTIONS} onChange={(v) => handleFieldChange('riskLevel', v)} colorMap={RISK_COLORS} />
          <div className="flex items-center gap-2 text-xs mt-2">
            <TrendingUp size={12} className="text-[#3b82f6]" />
            <span className="text-[var(--text-secondary)]">Maturity:</span>
            <div className="flex gap-0.5 ml-1">
              {[1, 2, 3, 4, 5].map((level) => (
                <button
                  key={level}
                  onClick={() => handleFieldChange('maturityLevel', level)}
                  className={`h-3 w-5 rounded-sm transition ${level <= element.maturityLevel ? 'bg-[#3b82f6] hover:bg-[#60a5fa]' : 'bg-[#1a2a1a] hover:bg-[#3a4a3a]'}`}
                />
              ))}
            </div>
            <span className="text-white text-[10px] ml-1">{element.maturityLevel}/5</span>
          </div>
        </Section>

        {/* Cost Input (Tier 1) */}
        <CostInputSection element={element} onChange={handleFieldChange} />

        {/* AI Agent fields — only for ai_agent type */}
        {element.type === 'ai_agent' && (
          <Section title="AI Agent">
            <SelectField
              label="Provider"
              value={element.agentProvider || 'custom'}
              options={PROVIDER_OPTIONS}
              onChange={(v) => handleFieldChange('agentProvider', v)}
            />
            <EditableField
              label="Model"
              value={element.agentModel || ''}
              onChange={(v) => handleFieldChange('agentModel', v)}
            />
            <SelectField
              label="Autonomy"
              value={element.autonomyLevel || 'copilot'}
              options={AUTONOMY_OPTIONS}
              onChange={(v) => handleFieldChange('autonomyLevel', v)}
              colorMap={AUTONOMY_COLORS}
            />
            <EditableField
              label="Purpose"
              value={element.agentPurpose || ''}
              onChange={(v) => handleFieldChange('agentPurpose', v)}
            />
            <div className="flex items-center justify-between text-xs py-0.5">
              <span className="text-[var(--text-secondary)]">Cost/mo</span>
              <input
                type="number"
                value={element.costPerMonth ?? 0}
                onChange={(e) => handleFieldChange('costPerMonth', parseFloat(e.target.value) || 0)}
                className="w-20 rounded border border-[var(--border-subtle)] bg-[var(--surface-base)] px-1.5 py-0.5 text-xs text-white outline-none focus:border-[#00ff41] text-right"
                placeholder="$0"
              />
            </div>
          </Section>
        )}

        {/* Description */}
        <Section title="Description">
          <DebouncedTextarea
            value={element.description}
            onChange={(v) => handleFieldChange('description', v)}
          />
        </Section>

        {/* Connections */}
        <Section title={`Connections (${relatedConnections.length})`}>
          {relatedConnections.length === 0 ? (
            <div className="space-y-1.5">
              <p className="text-xs text-[var(--text-tertiary)]">No connections</p>
              <button
                onClick={() => {
                  const ui = useUIStore.getState();
                  ui.enterConnectionMode();
                  ui.setConnectionSource(element.id);
                }}
                className="flex items-center gap-1.5 text-[10px] text-[var(--accent-text)] hover:text-white transition"
              >
                <Link size={10} />
                Connect from here (C)
              </button>
            </div>
          ) : (
            <div className="space-y-1 max-h-48 overflow-y-auto pr-1">
              {relatedConnections.map((conn) => {
                const isSource = conn.sourceId === element.id;
                const otherId = isSource ? conn.targetId : conn.sourceId;
                const other = elements.find((el) => el.id === otherId);
                const connDef = CONNECTION_TYPES.find(c => c.type === conn.type);
                return (
                  <button
                    key={conn.id}
                    onClick={() => selectElement(otherId)}
                    className="flex w-full items-center gap-1.5 text-xs rounded px-1 py-0.5 hover:bg-[var(--surface-base)] transition"
                  >
                    <div
                      className="h-1.5 w-1.5 rounded-full shrink-0"
                      style={{ backgroundColor: connDef?.color || '#64748b' }}
                    />
                    <span className="text-[var(--text-tertiary)] text-[10px] shrink-0">{isSource ? '\u2192' : '\u2190'}</span>
                    <span className="text-[var(--text-secondary)] truncate hover:text-white">{other?.name || otherId}</span>
                    <span className="text-[9px] text-[var(--text-disabled)] ml-auto shrink-0">{connDef?.label || conn.type}</span>
                  </button>
                );
              })}
            </div>
          )}
        </Section>

        {/* Connection Suggestions */}
        <ConnectionSuggestions element={element} elements={elements} connections={connections} />

        {/* Legacy Type Migration */}
        <LegacyTypeMigration element={element} onMigrate={(newType) => handleFieldChange('type', newType)} />

        {/* Position */}
        <Section title="3D Position">
          <div className="grid grid-cols-3 gap-2">
            <PosField label="X" value={element.position3D.x} onChange={(v) => handleFieldChange('position3D', { ...element.position3D, x: v })} />
            <PosField label="Y" value={element.position3D.y} onChange={(v) => handleFieldChange('position3D', { ...element.position3D, y: v })} />
            <PosField label="Z" value={element.position3D.z} onChange={(v) => handleFieldChange('position3D', { ...element.position3D, z: v })} />
          </div>
        </Section>

        {/* Actions */}
        <div className="pt-2 border-t border-[var(--border-subtle)]">
          {confirmDelete ? (
            <div className="rounded-md border border-red-500/30 bg-red-500/5 p-3 space-y-2">
              <p className="text-xs text-red-300">Delete "{element.name}"? This cannot be undone.</p>
              <div className="flex gap-2">
                <button
                  onClick={() => { removeElement(element.id); toast.success('Element deleted'); setConfirmDelete(false); }}
                  className="flex-1 rounded-md bg-red-600 px-3 py-1.5 text-xs text-white hover:bg-red-700 transition"
                >
                  Delete
                </button>
                <button
                  onClick={() => setConfirmDelete(false)}
                  className="flex-1 rounded-md border border-[var(--border-subtle)] px-3 py-1.5 text-xs text-[var(--text-secondary)] hover:text-white transition"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setConfirmDelete(true)}
              className="flex w-full items-center justify-center gap-2 rounded-md border border-red-500/30 px-3 py-2 text-xs text-red-400 hover:bg-red-500/10 transition"
            >
              <Trash2 size={14} />
              Delete Element
            </button>
          )}
        </div>
      </div>
    </aside>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h4 className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-tertiary)] mb-2">{title}</h4>
      {children}
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between text-xs py-0.5">
      <span className="text-[var(--text-secondary)]">{label}</span>
      <span className="text-white capitalize">{value}</span>
    </div>
  );
}

function EditableField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [tempValue, setTempValue] = useState(value);

  if (editing) {
    return (
      <div className="flex items-center gap-1 py-0.5">
        <span className="text-xs text-[var(--text-secondary)] min-w-[50px]">{label}</span>
        <input
          autoFocus
          value={tempValue}
          onChange={(e) => setTempValue(e.target.value)}
          onBlur={() => { onChange(tempValue); setEditing(false); }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') { onChange(tempValue); setEditing(false); }
            if (e.key === 'Escape') { setTempValue(value); setEditing(false); }
          }}
          className="flex-1 rounded border border-[#00ff41] bg-[var(--surface-base)] px-1.5 py-0.5 text-xs text-white outline-none"
        />
      </div>
    );
  }

  return (
    <div
      className="flex items-center justify-between text-xs py-0.5 cursor-pointer hover:bg-[var(--surface-base)] rounded px-1 -mx-1"
      onClick={() => { setTempValue(value); setEditing(true); }}
    >
      <span className="text-[var(--text-secondary)]">{label}</span>
      <span className="text-white">{value}</span>
    </div>
  );
}

function SelectField({ label, value, options, onChange, colorMap }: {
  label: string; value: string; options: readonly string[]; onChange: (v: string) => void; colorMap?: Record<string, string>;
}) {
  return (
    <div className="flex items-center justify-between text-xs py-0.5">
      <span className="text-[var(--text-secondary)]">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="rounded border border-[var(--border-subtle)] bg-[var(--surface-base)] px-1.5 py-0.5 text-xs text-white outline-none focus:border-[#00ff41] capitalize cursor-pointer"
        style={colorMap ? { color: colorMap[value] } : undefined}
      >
        {options.map((opt) => (<option key={opt} value={opt}>{opt}</option>))}
      </select>
    </div>
  );
}

function DebouncedTextarea({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [local, setLocal] = useState(value);
  const timerRef = useRef<ReturnType<typeof setTimeout>>();
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  // Reset local when element changes
  const prevValue = useRef(value);
  if (prevValue.current !== value) {
    prevValue.current = value;
    setLocal(value);
  }

  const handleChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const v = e.target.value;
    setLocal(v);
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => onChangeRef.current(v), 300);
  }, []);

  return (
    <textarea
      value={local}
      onChange={handleChange}
      className="w-full rounded-md border border-[var(--border-subtle)] bg-[var(--surface-base)] px-2 py-1.5 text-xs text-white outline-none focus:border-[#00ff41] resize-none transition"
      rows={3}
      placeholder="Add description..."
    />
  );
}

function PosField({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <div className="text-center">
      <div className="text-[10px] text-[var(--text-tertiary)]">{label}</div>
      <input
        type="number"
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
        step={0.5}
        className="w-full rounded border border-[var(--border-subtle)] bg-[var(--surface-base)] px-1 py-0.5 text-center text-xs text-white outline-none focus:border-[#00ff41]"
      />
    </div>
  );
}

// ──────────────────────────────────────────────────────────
// Connection Suggestions — shows unconnected element types
// that commonly relate to the selected element type
// ──────────────────────────────────────────────────────────
function ConnectionSuggestions({ element, elements, connections }: {
  element: { id: string; type: string; name: string };
  elements: { id: string; type: string; name: string }[];
  connections: { sourceId: string; targetId: string; type: string }[];
}) {
  const suggestions = useMemo(() => {
    const elType = element.type as ElementType;
    const connectedIds = new Set(
      connections
        .filter(c => c.sourceId === element.id || c.targetId === element.id)
        .flatMap(c => [c.sourceId, c.targetId])
    );
    connectedIds.delete(element.id);

    // Find unconnected elements that have strong relationships with this type
    return elements
      .filter(el => el.id !== element.id && !connectedIds.has(el.id))
      .filter(el => hasStrongRelationship(elType, el.type as ElementType))
      .slice(0, 4)
      .map(el => {
        const rel = getDefaultRelationship(elType, el.type as ElementType);
        const connDef = CONNECTION_TYPES.find(c => c.type === rel);
        return { element: el, relationship: rel, label: connDef?.label || rel };
      });
  }, [element, elements, connections]);

  if (suggestions.length === 0) return null;

  const handleConnect = (targetEl: { id: string }, relType: StandardConnectionType) => {
    const ui = useUIStore.getState();
    const store = useArchitectureStore.getState();
    const connId = `conn-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    store.addConnection({
      id: connId,
      sourceId: element.id,
      targetId: targetEl.id,
      type: relType,
    });
    toast.success('Connection created');
  };

  return (
    <Section title="Suggested Connections">
      <div className="space-y-1">
        {suggestions.map(s => (
          <button
            key={s.element.id}
            onClick={() => handleConnect(s.element, s.relationship)}
            className="flex w-full items-center gap-1.5 rounded px-1.5 py-1 text-left hover:bg-[var(--surface-base)] transition group"
          >
            <Sparkles size={10} className="text-[var(--accent-text)] shrink-0" />
            <span className="text-[11px] text-[var(--text-secondary)] group-hover:text-white truncate flex-1">
              {s.element.name}
            </span>
            <span className="text-[9px] text-[var(--text-disabled)] shrink-0">{s.label}</span>
          </button>
        ))}
      </div>
    </Section>
  );
}

// ──────────────────────────────────────────────────────────
// Legacy Type Migration — prompt to migrate non-standard types
// ──────────────────────────────────────────────────────────
const LEGACY_MIGRATION_MAP: Partial<Record<string, { target: ElementType; label: string }>> = {
  depends_on: { target: 'application_component' as ElementType, label: 'Application Component' },
  custom: { target: 'application_component' as ElementType, label: 'Application Component' },
};

function LegacyTypeMigration({ element, onMigrate }: {
  element: { type: string; name: string };
  onMigrate: (newType: string) => void;
}) {
  const catInfo = CATEGORY_BY_TYPE.get(element.type as ElementType);
  // Only show if the type is non-standard
  if (!catInfo || catInfo.standard) return null;

  // Find potential standard equivalents in the same layer/aspect
  const alternatives = [...CATEGORY_BY_TYPE.values()]
    .filter(c => c.standard && c.layer === catInfo.layer && c.aspect === catInfo.aspect)
    .slice(0, 3);

  if (alternatives.length === 0) return null;

  return (
    <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-2.5 space-y-1.5">
      <div className="flex items-center gap-1.5">
        <ArrowRightLeft size={11} className="text-amber-400" />
        <span className="text-[10px] font-semibold text-amber-300">Non-Standard Type</span>
      </div>
      <p className="text-[10px] text-[var(--text-tertiary)] leading-relaxed">
        "{element.type.replace(/_/g, ' ')}" is not an ArchiMate standard type. Migrate to:
      </p>
      <div className="flex flex-wrap gap-1">
        {alternatives.map(alt => {
          const label = ELEMENT_TYPES.find(et => et.type === alt.type)?.label || alt.type.replace(/_/g, ' ');
          return (
            <button
              key={alt.type}
              onClick={() => { onMigrate(alt.type); toast.success(`Migrated to ${label}`); }}
              className="rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium text-amber-300 hover:bg-amber-500/20 transition"
            >
              {label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────
// Cost Input Section — Tier 1 progressive disclosure
// ──────────────────────────────────────────────────────────
const STRATEGY_OPTIONS = ['retain', 'retire', 'rehost', 'relocate', 'replatform', 'repurchase', 'refactor'] as const;
const STRATEGY_LABELS: Record<string, string> = {
  retain: 'Retain (keep)',
  retire: 'Retire (decommission)',
  rehost: 'Rehost (lift & shift)',
  relocate: 'Relocate (move)',
  replatform: 'Replatform (PaaS)',
  repurchase: 'Repurchase (SaaS)',
  refactor: 'Refactor (re-architect)',
};

const TIER_BADGE_COLORS: Record<number, string> = {
  0: '#6b7280',
  1: '#f59e0b',
  2: '#3b82f6',
  3: '#22c55e',
};

// ─── Tooltip descriptions for cost fields ───
const COST_TOOLTIPS: Record<string, string> = {
  annualCost: 'Annual operating cost of this component (licenses, maintenance, staff)',
  strategy: 'Migration strategy based on Gartner 7Rs — determines effort and risk',
  employees: 'Number of employees affected by this component',
  records: 'Number of data records that need to be migrated',
  ksloc: 'Thousands of source lines of code — measure of codebase complexity (1 KSLOC = 1,000 lines)',
  techFitness: 'Technical maturity: 1 = outdated/unstable, 5 = modern/stable',
  funcFitness: 'Business coverage: 1 = barely meets requirements, 5 = fully covers all needs',
  errorRate: 'Current defect rate in percent (bugs, incidents per release)',
  hourlyRate: 'Hourly rate for developers/consultants — default: 85 €/h (DACH market)',
  infraMonth: 'Monthly infrastructure cost (cloud, hosting, licenses)',
  tdr: 'Technical Debt Ratio — share of codebase that needs rework (industry avg: 15%)',
  optimistic: 'Best-case cost — if everything goes optimally (used as P10)',
  mostLikely: 'Most likely cost value — basis for Monte Carlo simulation',
  pessimistic: 'Worst-case cost — with maximum risks and delays (used as P90)',
  pSuccess: 'Probability that the transformation will be completed successfully',
  codWeek: 'Cost of Delay — lost value per week of postponement (used for WSJF prioritization)',
};

// ─── Auto-fill defaults by element type ───
const AUTO_FILL_DEFAULTS: Record<string, Record<string, number | string>> = {
  ApplicationComponent: { annualCost: 120000, ksloc: 50, userCount: 80, recordCount: 500000, technicalDebtRatio: 0.15, errorRatePercent: 5, monthlyInfraCost: 3000, transformationStrategy: 'replatform' },
  ApplicationService: { annualCost: 80000, ksloc: 20, userCount: 50, recordCount: 200000, technicalDebtRatio: 0.10, errorRatePercent: 3, monthlyInfraCost: 1500, transformationStrategy: 'rehost' },
  DataObject: { annualCost: 30000, ksloc: 5, userCount: 20, recordCount: 1000000, technicalDebtRatio: 0.08, transformationStrategy: 'relocate' },
  Node: { annualCost: 60000, userCount: 10, monthlyInfraCost: 5000, transformationStrategy: 'rehost' },
  BusinessProcess: { annualCost: 50000, userCount: 100, transformationStrategy: 'refactor' },
  BusinessService: { annualCost: 40000, userCount: 150, transformationStrategy: 'retain' },
};
const DEFAULT_GENERIC: Record<string, number | string> = { annualCost: 50000, userCount: 30, recordCount: 100000, technicalDebtRatio: 0.15, transformationStrategy: 'rehost' };

function CostInputSection({ element, onChange }: {
  element: {
    type?: string;
    annualCost?: number; userCount?: number; recordCount?: number; transformationStrategy?: string;
    ksloc?: number; technicalFitness?: number; functionalFitness?: number; errorRatePercent?: number;
    hourlyRate?: number; monthlyInfraCost?: number; technicalDebtRatio?: number;
    costEstimateOptimistic?: number; costEstimateMostLikely?: number; costEstimatePessimistic?: number;
    successProbability?: number; costOfDelayPerWeek?: number;
  };
  onChange: (field: string, value: unknown) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [showProbabilistic, setShowProbabilistic] = useState(false);

  // Determine current tier based on filled fields
  const tier1Filled = [
    element.annualCost && element.annualCost > 0,
    element.transformationStrategy,
    element.userCount && element.userCount > 0,
    element.recordCount && element.recordCount > 0,
  ].filter(Boolean).length;

  const tier2Filled = [
    element.ksloc && element.ksloc > 0,
    element.technicalFitness != null,
    element.functionalFitness != null,
    element.errorRatePercent != null,
    element.hourlyRate && element.hourlyRate > 0,
    element.monthlyInfraCost != null,
    element.technicalDebtRatio != null,
  ].filter(Boolean).length;

  const tier3Filled = [
    element.costEstimateOptimistic != null && element.costEstimateOptimistic > 0,
    element.costEstimateMostLikely != null && element.costEstimateMostLikely > 0,
    element.costEstimatePessimistic != null && element.costEstimatePessimistic > 0,
    element.successProbability != null,
    element.costOfDelayPerWeek != null && element.costOfDelayPerWeek > 0,
  ].filter(Boolean).length;

  // O/M/P are the minimum for Tier 3
  const hasOMP = element.costEstimateOptimistic != null && element.costEstimateOptimistic > 0
    && element.costEstimateMostLikely != null && element.costEstimateMostLikely > 0
    && element.costEstimatePessimistic != null && element.costEstimatePessimistic > 0;

  const tier = hasOMP ? 3 : tier1Filled > 0 && tier2Filled > 0 ? 2 : tier1Filled > 0 ? 1 : 0;
  const tierColor = TIER_BADGE_COLORS[tier];

  return (
    <div>
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center justify-between mb-2 group"
      >
        <h4 className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-tertiary)] flex items-center gap-1.5">
          <DollarSign size={10} className="text-[#22c55e]" />
          Cost Input
        </h4>
        <div className="flex items-center gap-1.5">
          <span
            className="inline-flex items-center gap-0.5 px-1 py-0.5 rounded text-[8px] font-mono font-medium"
            style={{ backgroundColor: `${tierColor}20`, color: tierColor, border: `1px solid ${tierColor}40` }}
          >
            <Layers size={8} />
            T{tier}
          </span>
          <span className="text-[10px] text-[var(--text-disabled)] group-hover:text-white transition">
            {expanded ? '−' : '+'}
          </span>
        </div>
      </button>

      {expanded && (
        <div data-cost-section className="space-y-2 rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-base)] p-2.5">
          {/* ── UX #3: Auto-Fill Button ── */}
          {tier1Filled === 0 && (
            <button
              onClick={() => {
                const defaults = AUTO_FILL_DEFAULTS[element.type || ''] || DEFAULT_GENERIC;
                for (const [field, value] of Object.entries(defaults)) onChange(field, value);
              }}
              className="flex w-full items-center justify-center gap-1.5 rounded-md border border-dashed border-[#22c55e]/40 bg-[#22c55e]/5 px-2 py-1.5 text-[10px] text-[#22c55e] hover:bg-[#22c55e]/10 transition"
            >
              <Zap size={10} />
              Load industry defaults ({element.type ? element.type.replace(/([A-Z])/g, ' $1').trim() : 'Generic'})
            </button>
          )}

          {/* Annual Cost */}
          <CostNumberField label="Annual Cost" value={element.annualCost} suffix="EUR"
            tooltip={COST_TOOLTIPS.annualCost} placeholder="e.g. 120,000"
            onChange={(v) => onChange('annualCost', v)} width="w-24" />

          {/* Transformation Strategy */}
          <div className="flex items-center justify-between text-xs">
            <span className="text-[var(--text-secondary)] cursor-help border-b border-dotted border-[var(--text-disabled)]" title={COST_TOOLTIPS.strategy}>Strategy (7Rs)</span>
            <select
              data-cost-field
              value={element.transformationStrategy || ''}
              onChange={(e) => onChange('transformationStrategy', e.target.value || undefined)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); focusNextCostField(e.currentTarget); } }}
              className="rounded border border-[var(--border-subtle)] bg-[var(--surface-raised)] px-1.5 py-0.5 text-xs text-white outline-none focus:border-[#22c55e] cursor-pointer"
            >
              <option value="">— select —</option>
              {STRATEGY_OPTIONS.map((s) => (
                <option key={s} value={s}>{STRATEGY_LABELS[s]}</option>
              ))}
            </select>
          </div>

          {/* Employee Count */}
          <CostNumberField label="Affected Users" value={element.userCount} integer
            tooltip={COST_TOOLTIPS.employees} placeholder="e.g. 85"
            onChange={(v) => onChange('userCount', v)} />

          {/* Record Count */}
          <CostNumberField label="Data Records" value={element.recordCount} integer
            tooltip={COST_TOOLTIPS.records} placeholder="e.g. 500,000"
            onChange={(v) => onChange('recordCount', v)} />

          {/* Advanced toggle — visible when at least one Tier 1 field is set */}
          {tier1Filled > 0 && (
            <>
              <button
                onClick={() => setShowAdvanced(!showAdvanced)}
                className="flex w-full items-center justify-between pt-1 border-t border-[var(--border-subtle)] group"
              >
                <span className="text-[9px] font-semibold uppercase tracking-wider text-[var(--text-disabled)] group-hover:text-[var(--text-secondary)] transition">
                  Detailed Estimate (Tier 2)
                </span>
                <span className="text-[10px] text-[var(--text-disabled)] group-hover:text-white transition">
                  {showAdvanced ? '−' : '+'}
                </span>
              </button>

              {showAdvanced && (
                <div className="space-y-2 pt-1">
                  {/* UX #4: Inline help for Tier 2 */}
                  <p className="text-[9px] text-[var(--text-disabled)] leading-relaxed">
                    Detail fields improve accuracy to ±15-30%. Unknown values can be left blank.
                  </p>

                  <CostNumberField label="Codebase (KSLOC)" value={element.ksloc}
                    tooltip={COST_TOOLTIPS.ksloc} placeholder="e.g. 50"
                    onChange={(v) => onChange('ksloc', v)} step={0.1} />

                  {/* Technical Fitness 1-5 */}
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-[var(--text-secondary)] cursor-help border-b border-dotted border-[var(--text-disabled)]" title={COST_TOOLTIPS.techFitness}>Tech Maturity</span>
                    <div className="flex items-center gap-1">
                      <div className="flex gap-0.5">
                        {[1, 2, 3, 4, 5].map((level) => (
                          <button key={level}
                            onClick={() => onChange('technicalFitness', level)}
                            title={['outdated', 'unstable', 'functional', 'modern', 'state-of-the-art'][level - 1]}
                            className={`h-3 w-5 rounded-sm transition ${level <= (element.technicalFitness ?? 0) ? 'bg-[#22c55e] hover:bg-[#4ade80]' : 'bg-[#1a2a1a] hover:bg-[#3a4a3a]'}`}
                          />
                        ))}
                      </div>
                      <span className="text-white text-[10px] w-6 text-right">{element.technicalFitness ?? '—'}</span>
                    </div>
                  </div>

                  {/* Functional Fitness 1-5 */}
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-[var(--text-secondary)] cursor-help border-b border-dotted border-[var(--text-disabled)]" title={COST_TOOLTIPS.funcFitness}>Business Fit</span>
                    <div className="flex items-center gap-1">
                      <div className="flex gap-0.5">
                        {[1, 2, 3, 4, 5].map((level) => (
                          <button key={level}
                            onClick={() => onChange('functionalFitness', level)}
                            title={['barely usable', 'gaps', 'adequate', 'good', 'full coverage'][level - 1]}
                            className={`h-3 w-5 rounded-sm transition ${level <= (element.functionalFitness ?? 0) ? 'bg-[#3b82f6] hover:bg-[#60a5fa]' : 'bg-[#1a2a1a] hover:bg-[#3a4a3a]'}`}
                          />
                        ))}
                      </div>
                      <span className="text-white text-[10px] w-6 text-right">{element.functionalFitness ?? '—'}</span>
                    </div>
                  </div>

                  {/* Error Rate */}
                  <CostNumberField label="Defect Rate" value={element.errorRatePercent} suffix="%"
                    tooltip={COST_TOOLTIPS.errorRate} placeholder="e.g. 5"
                    onChange={(v) => onChange('errorRatePercent', v)} step={1} />

                  {/* Hourly Rate Override */}
                  <CostNumberField label="Hourly Rate" value={element.hourlyRate} suffix="EUR/h"
                    tooltip={COST_TOOLTIPS.hourlyRate} placeholder="85"
                    onChange={(v) => onChange('hourlyRate', v)} />

                  {/* Monthly Infra Cost */}
                  <CostNumberField label="Infra/Month" value={element.monthlyInfraCost} suffix="EUR"
                    tooltip={COST_TOOLTIPS.infraMonth} placeholder="e.g. 3,000"
                    onChange={(v) => onChange('monthlyInfraCost', v)} width="w-24" />

                  {/* Technical Debt Ratio */}
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-[var(--text-secondary)] cursor-help border-b border-dotted border-[var(--text-disabled)]" title={COST_TOOLTIPS.tdr}>Tech Debt</span>
                    <div className="flex items-center gap-1">
                      <input
                        type="range" min="0" max="100" step="1"
                        data-cost-field
                        value={Math.round((element.technicalDebtRatio ?? 0.15) * 100)}
                        onChange={(e) => onChange('technicalDebtRatio', parseInt(e.target.value) / 100)}
                        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); focusNextCostField(e.currentTarget); } }}
                        className="w-16 h-1 accent-[#f59e0b]"
                      />
                      <span className="text-white text-[10px] font-mono w-10 text-right">
                        {Math.round((element.technicalDebtRatio ?? 0.15) * 100)}%
                      </span>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}

          {/* Probabilistic toggle — visible when Tier 1+ */}
          {tier1Filled > 0 && (
            <>
              <button
                onClick={() => setShowProbabilistic(!showProbabilistic)}
                className="flex w-full items-center justify-between pt-1 border-t border-[var(--border-subtle)] group"
              >
                <span className="text-[9px] font-semibold uppercase tracking-wider text-[var(--text-disabled)] group-hover:text-[var(--text-secondary)] transition">
                  Three-Point Estimate (Tier 3)
                </span>
                <span className="text-[10px] text-[var(--text-disabled)] group-hover:text-white transition">
                  {showProbabilistic ? '−' : '+'}
                </span>
              </button>

              {showProbabilistic && (
                <div className="space-y-2 pt-1">
                  {/* UX #4: Inline help for Tier 3 */}
                  <p className="text-[9px] text-[var(--text-disabled)] leading-relaxed">
                    Enter best/worst case to run a Monte Carlo simulation with 10,000 iterations.
                  </p>
                  <CostNumberField label="Best Case (O)" value={element.costEstimateOptimistic} suffix="EUR"
                    tooltip={COST_TOOLTIPS.optimistic} placeholder="e.g. 80,000"
                    onChange={(v) => onChange('costEstimateOptimistic', v)} width="w-24" />
                  <CostNumberField label="Most Likely (M)" value={element.costEstimateMostLikely} suffix="EUR"
                    tooltip={COST_TOOLTIPS.mostLikely} placeholder="e.g. 120,000"
                    onChange={(v) => onChange('costEstimateMostLikely', v)} width="w-24" />
                  <CostNumberField label="Worst Case (P)" value={element.costEstimatePessimistic} suffix="EUR"
                    tooltip={COST_TOOLTIPS.pessimistic} placeholder="e.g. 200,000"
                    onChange={(v) => onChange('costEstimatePessimistic', v)} width="w-24" />

                  {/* Success Probability slider */}
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-[var(--text-secondary)] cursor-help border-b border-dotted border-[var(--text-disabled)]" title={COST_TOOLTIPS.pSuccess}>Success Prob.</span>
                    <div className="flex items-center gap-1">
                      <input
                        type="range" min="0" max="100" step="5"
                        data-cost-field
                        value={Math.round((element.successProbability ?? 1) * 100)}
                        onChange={(e) => onChange('successProbability', parseInt(e.target.value) / 100)}
                        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); focusNextCostField(e.currentTarget); } }}
                        className="w-16 h-1 accent-[#8b5cf6]"
                      />
                      <span className="text-white text-[10px] font-mono w-10 text-right">
                        {Math.round((element.successProbability ?? 1) * 100)}%
                      </span>
                    </div>
                  </div>

                  {/* Cost of Delay */}
                  <CostNumberField label="Cost of Delay" value={element.costOfDelayPerWeek} suffix="EUR/wk"
                    tooltip={COST_TOOLTIPS.codWeek} placeholder="e.g. 5,000"
                    onChange={(v) => onChange('costOfDelayPerWeek', v)} width="w-24" />
                </div>
              )}
            </>
          )}

          {/* Tier progress hint */}
          <div className="text-[9px] text-[var(--text-disabled)] pt-1 border-t border-[var(--border-subtle)]">
            {tier === 0 && 'Fill fields to unlock Tier 1 estimates (±30-50%)'}
            {tier === 1 && `${tier1Filled}/4 basic fields — expand Detailed Estimate for Tier 2 (±15-30%)`}
            {tier === 2 && `Tier 2 active — ${tier1Filled + tier2Filled}/11 fields (±15-30%)`}
            {tier === 3 && `Tier 3 — ${tier3Filled}/5 fields — Monte Carlo simulation active`}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Policy Property View ───

const SEVERITY_COLORS: Record<string, string> = {
  error: '#ef4444',
  warning: '#eab308',
  info: '#3b82f6',
};

interface PolicyPropertyViewProps {
  element: { id: string; name: string };
  metadata: Record<string, unknown>;
  violations: PolicyViolationDTO[];
  onClose: () => void;
  onSelectElement: (id: string) => void;
}

function PolicyPropertyView({ element, metadata, violations, onClose, onSelectElement }: PolicyPropertyViewProps) {
  const [policyDetails, setPolicyDetails] = useState<Record<string, unknown> | null>(null);
  const projectId = useArchitectureStore((s) => s.projectId);

  useEffect(() => {
    const policyId = metadata.policyId as string;
    if (!projectId || !policyId) return;
    governanceAPI.getPolicies(projectId).then(({ data }) => {
      const policies = data.data || [];
      const match = policies.find((p: { _id: string }) => p._id === policyId);
      if (match) setPolicyDetails(match);
    }).catch(() => {});
  }, [projectId, metadata.policyId]);

  const violationCount = violations.length;
  const hasViolations = violationCount > 0;
  const severity = (metadata.severity as string) || 'warning';
  const source = ((metadata.source as string) || 'custom').toUpperCase();
  const category = (metadata.category as string) || 'compliance';
  const version = (metadata.version as number) || 1;

  return (
    <aside className="w-72 border-l border-[var(--border-subtle)] bg-[var(--surface-raised)] overflow-y-auto h-full">
      <div className="flex items-center justify-between border-b border-[var(--border-subtle)] p-4">
        <div className="flex items-center gap-2 min-w-0">
          <div className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: hasViolations ? '#ef4444' : '#22c55e' }} />
          <h3 className="text-sm font-semibold text-white truncate">{element.name}</h3>
        </div>
        <button onClick={onClose} className="text-[var(--text-secondary)] hover:text-white shrink-0">
          <X size={16} />
        </button>
      </div>

      <div className="p-4 space-y-4">
        <Section title="Policy Details">
          <div className="flex items-center justify-between text-xs">
            <span className="text-[var(--text-secondary)]">Source</span>
            <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-[#1a2a1a] text-[#00ff41]">{source}</span>
          </div>
          <div className="flex items-center justify-between text-xs">
            <span className="text-[var(--text-secondary)]">Category</span>
            <span className="text-white">{category}</span>
          </div>
          <div className="flex items-center justify-between text-xs">
            <span className="text-[var(--text-secondary)]">Severity</span>
            <span className="flex items-center gap-1">
              <div className="h-2 w-2 rounded-full" style={{ backgroundColor: SEVERITY_COLORS[severity] || '#eab308' }} />
              <span className="text-white">{severity}</span>
            </span>
          </div>
          <div className="flex items-center justify-between text-xs">
            <span className="text-[var(--text-secondary)]">Version</span>
            <span className="text-white">{version}</span>
          </div>
          {policyDetails && (
            <div className="flex items-center justify-between text-xs">
              <span className="text-[var(--text-secondary)]">Status</span>
              <span className="text-white">{(policyDetails.status as string) || 'active'}</span>
            </div>
          )}
        </Section>

        {/* Scope */}
        {!!policyDetails?.scope && (
          <Section title="Scope">
            {(() => {
              const scope = policyDetails.scope as { layers?: string[]; elementTypes?: string[]; domains?: string[] };
              return (
                <div className="space-y-1.5">
                  {scope.layers && scope.layers.length > 0 && (
                    <div className="text-xs">
                      <span className="text-[var(--text-secondary)]">Layers: </span>
                      <span className="text-white">{scope.layers.join(', ')}</span>
                    </div>
                  )}
                  {scope.elementTypes && scope.elementTypes.length > 0 && (
                    <div className="text-xs">
                      <span className="text-[var(--text-secondary)]">Types: </span>
                      <span className="text-white">{scope.elementTypes.join(', ')}</span>
                    </div>
                  )}
                  {(!scope.layers?.length && !scope.elementTypes?.length && !scope.domains?.length) && (
                    <div className="text-xs text-[var(--text-tertiary)]">All elements</div>
                  )}
                </div>
              );
            })()}
          </Section>
        )}

        {/* Rules */}
        {!!policyDetails?.rules && (
          <Section title={`Rules (${(policyDetails.rules as unknown[]).length})`}>
            {(policyDetails.rules as Array<{ field: string; operator: string; value: unknown; message: string }>).map((rule, i) => (
              <div key={i} className="rounded border border-[var(--border-subtle)] bg-[var(--surface-base)] p-2 text-[10px] space-y-0.5">
                <div className="text-white font-mono">{rule.field} {rule.operator} {JSON.stringify(rule.value)}</div>
                <div className="text-[var(--text-tertiary)]">{rule.message}</div>
              </div>
            ))}
          </Section>
        )}

        {/* Violations */}
        <Section title={`Violations (${violationCount} open)`}>
          {violationCount === 0 ? (
            <div className="flex items-center gap-1.5 text-[10px] text-green-400">
              <CheckCircle2 size={11} /> All elements compliant
            </div>
          ) : (
            violations.map((v, i) => (
              <button
                key={i}
                onClick={() => onSelectElement(v.elementId)}
                className="flex items-start gap-1.5 text-[10px] w-full text-left hover:bg-white/5 rounded px-1 py-0.5 transition"
              >
                <span className="mt-0.5 shrink-0" style={{ color: SEVERITY_COLORS[v.severity] || '#eab308' }}>
                  {v.severity === 'error' ? '!' : '\u25CB'}
                </span>
                <div>
                  <span className="text-[var(--text-secondary)]">{v.elementName || v.elementId}</span>
                  <p className="text-[var(--text-disabled)] mt-0.5">{v.message}</p>
                </div>
              </button>
            ))
          )}
        </Section>
      </div>
    </aside>
  );
}

function focusNextCostField(current: HTMLElement) {
  const container = current.closest('[data-cost-section]');
  if (!container) return;
  const fields = Array.from(container.querySelectorAll<HTMLElement>('input[data-cost-field], select[data-cost-field]'));
  const idx = fields.indexOf(current);
  if (idx >= 0 && idx < fields.length - 1) {
    fields[idx + 1].focus();
  }
}

function CostNumberField({ label, value, suffix, onChange, width = 'w-20', integer = false, step, tooltip, placeholder }: {
  label: string; value?: number; suffix?: string; onChange: (v: number | undefined) => void;
  width?: string; integer?: boolean; step?: number; tooltip?: string; placeholder?: string;
}) {
  return (
    <div className="flex items-center justify-between text-xs">
      <span className={`text-[var(--text-secondary)] ${tooltip ? 'cursor-help border-b border-dotted border-[var(--text-disabled)]' : ''}`} title={tooltip}>{label}</span>
      <div className="flex items-center gap-1">
        <input
          type="number"
          data-cost-field
          value={value ?? ''}
          onChange={(e) => onChange(e.target.value ? (integer ? parseInt(e.target.value) : parseFloat(e.target.value)) : undefined)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); focusNextCostField(e.currentTarget); } }}
          step={step}
          className={`${width} rounded border border-[var(--border-subtle)] bg-[var(--surface-raised)] px-1.5 py-0.5 text-xs text-white outline-none focus:border-[#22c55e] text-right`}
          placeholder={placeholder || '0'}
        />
        {suffix && <span className="text-[9px] text-[var(--text-disabled)]">{suffix}</span>}
      </div>
    </div>
  );
}

const HEALTH_COLORS: Record<HealthLevel, string> = {
  good: '#22c55e',
  warn: '#f59e0b',
  bad: '#ef4444',
};

function HealthDot({ level }: { level: HealthLevel }) {
  return <div className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: HEALTH_COLORS[level] }} />;
}

function HealthIcon({ level }: { level: HealthLevel }) {
  if (level === 'good') return <CheckCircle2 size={11} className="text-green-400" />;
  if (level === 'warn') return <WarnIcon size={11} className="text-amber-400" />;
  return <AlertCircle size={11} className="text-red-400" />;
}
