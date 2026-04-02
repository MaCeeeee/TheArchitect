import { useState, useRef, useCallback, useMemo } from 'react';
import { X, Link, TrendingUp, Trash2, Bot, AlertCircle, CheckCircle2, AlertTriangle as WarnIcon, Sparkles, ArrowRightLeft } from 'lucide-react';
import toast from 'react-hot-toast';
import { useArchitectureStore } from '../../stores/architectureStore';
import { useUIStore } from '../../stores/uiStore';
import { useElementHealth, type HealthLevel } from '../../hooks/useElementHealth';
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
