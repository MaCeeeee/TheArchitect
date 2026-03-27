import { useState } from 'react';
import { Trash2, Save, ArrowRight, AlertTriangle } from 'lucide-react';
import { useBlueprintStore } from '../../stores/blueprintStore';
import { ARCHITECTURE_LAYERS } from '@thearchitect/shared/src/constants/togaf.constants';

export default function BlueprintEditor() {
  const editedElements = useBlueprintStore((s) => s.editedElements);
  const editedConnections = useBlueprintStore((s) => s.editedConnections);
  const removeElement = useBlueprintStore((s) => s.removeElement);
  const updateElement = useBlueprintStore((s) => s.updateElement);
  const removeConnection = useBlueprintStore((s) => s.removeConnection);
  const setStep = useBlueprintStore((s) => s.setStep);
  const [tab, setTab] = useState<'elements' | 'connections'>('elements');

  // Find orphaned elements
  const connected = new Set<string>();
  for (const c of editedConnections) {
    connected.add(c.sourceId);
    connected.add(c.targetId);
  }
  const orphans = editedElements.filter((e) => !connected.has(e.id));

  // Group elements by layer
  const byLayer: Record<string, typeof editedElements> = {};
  for (const el of editedElements) {
    if (!byLayer[el.layer]) byLayer[el.layer] = [];
    byLayer[el.layer].push(el);
  }

  const removeOrphans = () => {
    for (const o of orphans) removeElement(o.id);
  };

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-white">Customize Architecture</h2>
        <p className="text-sm text-[var(--text-secondary)] mt-1">
          Remove or edit elements and connections before importing.
        </p>
      </div>

      {/* Orphan warning */}
      {orphans.length > 0 && (
        <div className="flex items-center justify-between rounded-lg bg-[#f59e0b]/5 border border-[#f59e0b]/20 p-3">
          <div className="flex items-center gap-2">
            <AlertTriangle size={14} className="text-[#f59e0b]" />
            <span className="text-xs text-[var(--text-secondary)]">{orphans.length} elements without connections</span>
          </div>
          <button
            onClick={removeOrphans}
            className="text-xs text-[#f59e0b] hover:text-[#fbbf24] transition font-medium"
          >
            Remove All
          </button>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 p-1 bg-[var(--surface-base)] rounded-lg">
        <button
          onClick={() => setTab('elements')}
          className={`flex-1 py-1.5 text-xs font-medium rounded-md transition ${
            tab === 'elements' ? 'bg-[var(--surface-raised)] text-white' : 'text-[var(--text-tertiary)] hover:text-white'
          }`}
        >
          Elements ({editedElements.length})
        </button>
        <button
          onClick={() => setTab('connections')}
          className={`flex-1 py-1.5 text-xs font-medium rounded-md transition ${
            tab === 'connections' ? 'bg-[var(--surface-raised)] text-white' : 'text-[var(--text-tertiary)] hover:text-white'
          }`}
        >
          Connections ({editedConnections.length})
        </button>
      </div>

      {/* Elements Tab */}
      {tab === 'elements' && (
        <div className="space-y-3 max-h-[500px] overflow-y-auto">
          {ARCHITECTURE_LAYERS.map((layer) => {
            const elements = byLayer[layer.id];
            if (!elements || elements.length === 0) return null;
            return (
              <div key={layer.id}>
                <div className="flex items-center gap-2 mb-1.5 sticky top-0 bg-[var(--surface-base)] py-1 z-10">
                  <div className="w-2 h-2 rounded-full" style={{ backgroundColor: layer.color }} />
                  <span className="text-xs font-semibold text-white">{layer.label}</span>
                  <span className="text-[10px] text-[var(--text-disabled)]">({elements.length})</span>
                </div>
                <div className="space-y-1">
                  {elements.map((el) => (
                    <div key={el.id} className="flex items-center gap-2 rounded-md bg-[var(--surface-raised)] border border-[var(--border-subtle)] px-3 py-2">
                      <input
                        value={el.name}
                        onChange={(e) => updateElement(el.id, { name: e.target.value })}
                        className="flex-1 text-xs text-white bg-transparent outline-none border-b border-transparent focus:border-[#7c3aed] transition"
                      />
                      <span className="text-[10px] text-[var(--text-disabled)] bg-[var(--surface-base)] px-1.5 py-0.5 rounded shrink-0">
                        {el.type}
                      </span>
                      {!connected.has(el.id) && (
                        <span title="No connections"><AlertTriangle size={12} className="text-[#f59e0b] shrink-0" /></span>
                      )}
                      <button
                        onClick={() => removeElement(el.id)}
                        className="p-1 text-[var(--text-disabled)] hover:text-[#ef4444] transition shrink-0"
                        title="Remove element"
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Connections Tab */}
      {tab === 'connections' && (
        <div className="space-y-1 max-h-[500px] overflow-y-auto">
          {editedConnections.map((conn) => (
            <div key={conn.id} className="flex items-center gap-2 rounded-md bg-[var(--surface-raised)] border border-[var(--border-subtle)] px-3 py-2">
              <span className="text-xs text-white truncate flex-1">{conn.sourceName}</span>
              <span className="text-[10px] text-[var(--text-disabled)] bg-[var(--surface-base)] px-1.5 py-0.5 rounded shrink-0">{conn.type}</span>
              <ArrowRight size={10} className="text-[var(--text-disabled)] shrink-0" />
              <span className="text-xs text-white truncate flex-1">{conn.targetName}</span>
              <button
                onClick={() => removeConnection(conn.id)}
                className="p-1 text-[var(--text-disabled)] hover:text-[#ef4444] transition shrink-0"
                title="Remove connection"
              >
                <Trash2 size={12} />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-3 pt-2">
        <button
          onClick={() => setStep(2)}
          className="flex-1 py-2.5 rounded-lg text-sm font-medium border border-[var(--border-subtle)] text-[var(--text-secondary)] hover:bg-[var(--surface-raised)] transition"
        >
          Back to Preview
        </button>
        <button
          onClick={() => setStep(4)}
          className="flex-1 py-2.5 rounded-lg text-sm font-bold bg-[#7c3aed] hover:bg-[#6d28d9] text-white transition flex items-center justify-center gap-2"
        >
          Import <Save size={14} />
        </button>
      </div>
    </div>
  );
}
