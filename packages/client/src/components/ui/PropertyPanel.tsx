import { useState, useRef, useCallback } from 'react';
import { X, Link, TrendingUp, Trash2 } from 'lucide-react';
import { useArchitectureStore } from '../../stores/architectureStore';
import { useUIStore } from '../../stores/uiStore';

const RISK_COLORS: Record<string, string> = {
  low: '#22c55e',
  medium: '#eab308',
  high: '#f97316',
  critical: '#ef4444',
};

const STATUS_OPTIONS = ['current', 'target', 'transitional', 'retired'] as const;
const RISK_OPTIONS = ['low', 'medium', 'high', 'critical'] as const;

export default function PropertyPanel() {
  const selectedElementId = useArchitectureStore((s) => s.selectedElementId);
  const elements = useArchitectureStore((s) => s.elements);
  const connections = useArchitectureStore((s) => s.connections);
  const updateElement = useArchitectureStore((s) => s.updateElement);
  const removeElement = useArchitectureStore((s) => s.removeElement);
  const pushHistory = useArchitectureStore((s) => s.pushHistory);
  const selectElement = useArchitectureStore((s) => s.selectElement);
  const togglePropertyPanel = useUIStore((s) => s.togglePropertyPanel);

  const element = elements.find((el) => el.id === selectedElementId);

  if (!element) {
    return (
      <aside className="w-72 border-l border-[#334155] bg-[#1e293b] p-4">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-white">Properties</h3>
          <button onClick={togglePropertyPanel} className="text-[#94a3b8] hover:text-white">
            <X size={16} />
          </button>
        </div>
        <p className="text-xs text-[#64748b]">Select an element to view its properties.</p>
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
    <aside className="w-72 border-l border-[#334155] bg-[#1e293b] overflow-y-auto h-full">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-[#334155] p-4">
        <h3 className="text-sm font-semibold text-white truncate">{element.name}</h3>
        <button onClick={togglePropertyPanel} className="text-[#94a3b8] hover:text-white">
          <X size={16} />
        </button>
      </div>

      <div className="p-4 space-y-4">
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
            <span className="text-[#94a3b8]">Maturity:</span>
            <div className="flex gap-0.5 ml-1">
              {[1, 2, 3, 4, 5].map((level) => (
                <button
                  key={level}
                  onClick={() => handleFieldChange('maturityLevel', level)}
                  className={`h-3 w-5 rounded-sm transition ${level <= element.maturityLevel ? 'bg-[#3b82f6] hover:bg-[#60a5fa]' : 'bg-[#334155] hover:bg-[#475569]'}`}
                />
              ))}
            </div>
            <span className="text-white text-[10px] ml-1">{element.maturityLevel}/5</span>
          </div>
        </Section>

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
            <p className="text-xs text-[#64748b]">No connections</p>
          ) : (
            <div className="space-y-1 max-h-48 overflow-y-auto pr-1">
              {relatedConnections.map((conn) => {
                const isSource = conn.sourceId === element.id;
                const otherId = isSource ? conn.targetId : conn.sourceId;
                const other = elements.find((el) => el.id === otherId);
                return (
                  <button
                    key={conn.id}
                    onClick={() => selectElement(otherId)}
                    className="flex w-full items-center gap-2 text-xs rounded px-1 py-0.5 hover:bg-[#0f172a] transition"
                  >
                    <Link size={10} className="text-[#64748b]" />
                    <span className="text-[#64748b]">{isSource ? '->' : '<-'}</span>
                    <span className="text-[#94a3b8] truncate hover:text-white">{other?.name || otherId}</span>
                    <span className="text-[10px] text-[#475569] ml-auto">{conn.type}</span>
                  </button>
                );
              })}
            </div>
          )}
        </Section>

        {/* Position */}
        <Section title="3D Position">
          <div className="grid grid-cols-3 gap-2">
            <PosField label="X" value={element.position3D.x} onChange={(v) => handleFieldChange('position3D', { ...element.position3D, x: v })} />
            <PosField label="Y" value={element.position3D.y} onChange={(v) => handleFieldChange('position3D', { ...element.position3D, y: v })} />
            <PosField label="Z" value={element.position3D.z} onChange={(v) => handleFieldChange('position3D', { ...element.position3D, z: v })} />
          </div>
        </Section>

        {/* Actions */}
        <div className="pt-2 border-t border-[#334155]">
          <button
            onClick={() => removeElement(element.id)}
            className="flex w-full items-center justify-center gap-2 rounded-md border border-red-500/30 px-3 py-2 text-xs text-red-400 hover:bg-red-500/10 transition"
          >
            <Trash2 size={14} />
            Delete Element
          </button>
        </div>
      </div>
    </aside>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h4 className="text-[10px] font-semibold uppercase tracking-wider text-[#64748b] mb-2">{title}</h4>
      {children}
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between text-xs py-0.5">
      <span className="text-[#94a3b8]">{label}</span>
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
        <span className="text-xs text-[#94a3b8] min-w-[50px]">{label}</span>
        <input
          autoFocus
          value={tempValue}
          onChange={(e) => setTempValue(e.target.value)}
          onBlur={() => { onChange(tempValue); setEditing(false); }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') { onChange(tempValue); setEditing(false); }
            if (e.key === 'Escape') { setTempValue(value); setEditing(false); }
          }}
          className="flex-1 rounded border border-[#7c3aed] bg-[#0f172a] px-1.5 py-0.5 text-xs text-white outline-none"
        />
      </div>
    );
  }

  return (
    <div
      className="flex items-center justify-between text-xs py-0.5 cursor-pointer hover:bg-[#0f172a] rounded px-1 -mx-1"
      onClick={() => { setTempValue(value); setEditing(true); }}
    >
      <span className="text-[#94a3b8]">{label}</span>
      <span className="text-white">{value}</span>
    </div>
  );
}

function SelectField({ label, value, options, onChange, colorMap }: {
  label: string; value: string; options: readonly string[]; onChange: (v: string) => void; colorMap?: Record<string, string>;
}) {
  return (
    <div className="flex items-center justify-between text-xs py-0.5">
      <span className="text-[#94a3b8]">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="rounded border border-[#334155] bg-[#0f172a] px-1.5 py-0.5 text-xs text-white outline-none focus:border-[#7c3aed] capitalize cursor-pointer"
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
      className="w-full rounded-md border border-[#334155] bg-[#0f172a] px-2 py-1.5 text-xs text-white outline-none focus:border-[#7c3aed] resize-none transition"
      rows={3}
      placeholder="Add description..."
    />
  );
}

function PosField({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <div className="text-center">
      <div className="text-[10px] text-[#64748b]">{label}</div>
      <input
        type="number"
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
        step={0.5}
        className="w-full rounded border border-[#334155] bg-[#0f172a] px-1 py-0.5 text-center text-xs text-white outline-none focus:border-[#7c3aed]"
      />
    </div>
  );
}
