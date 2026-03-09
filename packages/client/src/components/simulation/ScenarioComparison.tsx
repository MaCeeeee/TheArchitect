import { useState, useMemo } from 'react';
import { GitCompare, Plus, Trash2, ArrowRight } from 'lucide-react';
import { useArchitectureStore, ArchitectureElement } from '../../stores/architectureStore';

interface Scenario {
  id: string;
  name: string;
  elements: ArchitectureElement[];
  description: string;
}

export default function ScenarioComparison() {
  const elements = useArchitectureStore((s) => s.elements);
  const connections = useArchitectureStore((s) => s.connections);
  const [scenarios, setScenarios] = useState<Scenario[]>([]);
  const [selectedPair, setSelectedPair] = useState<[string, string] | null>(null);

  const currentScenario: Scenario = useMemo(() => ({
    id: 'current',
    name: 'Current State',
    elements: [...elements],
    description: 'Live architecture state',
  }), [elements]);

  const createScenario = () => {
    const scenario: Scenario = {
      id: `sc-${Date.now()}`,
      name: `Scenario ${scenarios.length + 1}`,
      elements: elements.map((el) => ({ ...el })),
      description: 'Snapshot of current state',
    };
    setScenarios((prev) => [...prev, scenario]);
  };

  const deleteScenario = (id: string) => {
    setScenarios((prev) => prev.filter((s) => s.id !== id));
    if (selectedPair && selectedPair.includes(id)) setSelectedPair(null);
  };

  const allScenarios = [currentScenario, ...scenarios];

  const diff = useMemo(() => {
    if (!selectedPair) return null;
    const [aId, bId] = selectedPair;
    const a = allScenarios.find((s) => s.id === aId);
    const b = allScenarios.find((s) => s.id === bId);
    if (!a || !b) return null;

    const aIds = new Set(a.elements.map((e) => e.id));
    const bIds = new Set(b.elements.map((e) => e.id));

    const added = b.elements.filter((e) => !aIds.has(e.id));
    const removed = a.elements.filter((e) => !bIds.has(e.id));
    const changed = b.elements.filter((e) => {
      if (!aIds.has(e.id)) return false;
      const orig = a.elements.find((ae) => ae.id === e.id);
      if (!orig) return false;
      return orig.status !== e.status || orig.riskLevel !== e.riskLevel || orig.maturityLevel !== e.maturityLevel;
    });

    return { added, removed, changed, aName: a.name, bName: b.name };
  }, [selectedPair, allScenarios]);

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      <div className="p-3 border-b border-[#334155]">
        <h3 className="text-xs font-semibold text-white flex items-center gap-1.5">
          <GitCompare size={14} className="text-[#06b6d4]" />
          Scenario Comparison
        </h3>
        <p className="text-[10px] text-[#64748b] mt-1">Compare architecture states</p>
      </div>

      {/* Create scenario */}
      <div className="p-3">
        <button
          onClick={createScenario}
          disabled={elements.length === 0}
          className="w-full rounded-md bg-[#06b6d4] px-3 py-1.5 text-[10px] font-medium text-white hover:bg-[#0891b2] disabled:opacity-30 transition flex items-center justify-center gap-1"
        >
          <Plus size={10} /> Snapshot Current State
        </button>
      </div>

      {/* Scenario list */}
      <div className="px-3 pb-3">
        <h4 className="text-[10px] font-semibold uppercase text-[#64748b] mb-1">Scenarios ({allScenarios.length})</h4>
        <div className="space-y-1">
          {allScenarios.map((sc) => (
            <div key={sc.id} className="flex items-center gap-2 rounded-md border border-[#334155] bg-[#0f172a] px-2 py-1.5">
              <div className="flex-1 min-w-0">
                <div className="text-[10px] text-white truncate">{sc.name}</div>
                <div className="text-[9px] text-[#475569]">{sc.elements.length} elements</div>
              </div>
              {sc.id !== 'current' && (
                <button onClick={() => deleteScenario(sc.id)} className="text-[#475569] hover:text-[#ef4444]">
                  <Trash2 size={10} />
                </button>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Compare selector */}
      {allScenarios.length >= 2 && (
        <div className="px-3 pb-3 border-t border-[#334155] pt-3">
          <h4 className="text-[10px] font-semibold uppercase text-[#64748b] mb-2">Compare</h4>
          <div className="flex items-center gap-1">
            <select
              className="flex-1 bg-[#0f172a] border border-[#334155] rounded px-1.5 py-1 text-[10px] text-white outline-none"
              value={selectedPair?.[0] || ''}
              onChange={(e) => setSelectedPair([e.target.value, selectedPair?.[1] || allScenarios[1]?.id || ''])}
            >
              {allScenarios.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
            <ArrowRight size={12} className="text-[#475569] shrink-0" />
            <select
              className="flex-1 bg-[#0f172a] border border-[#334155] rounded px-1.5 py-1 text-[10px] text-white outline-none"
              value={selectedPair?.[1] || ''}
              onChange={(e) => setSelectedPair([selectedPair?.[0] || 'current', e.target.value])}
            >
              {allScenarios.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>

          <button
            onClick={() => setSelectedPair([allScenarios[0].id, allScenarios[allScenarios.length > 1 ? 1 : 0].id])}
            className="mt-2 w-full rounded-md bg-[#334155] px-3 py-1.5 text-[10px] font-medium text-white hover:bg-[#475569] transition"
          >
            Compare
          </button>
        </div>
      )}

      {/* Diff results */}
      {diff && (
        <div className="px-3 pb-3 border-t border-[#334155] pt-3 space-y-2">
          <h4 className="text-[10px] font-semibold text-white">{diff.aName} vs {diff.bName}</h4>
          <div className="grid grid-cols-3 gap-1">
            <div className="rounded-md border border-[#334155] bg-[#0f172a] p-1.5 text-center">
              <div className="text-xs font-bold text-[#22c55e]">{diff.added.length}</div>
              <div className="text-[9px] text-[#64748b]">Added</div>
            </div>
            <div className="rounded-md border border-[#334155] bg-[#0f172a] p-1.5 text-center">
              <div className="text-xs font-bold text-[#eab308]">{diff.changed.length}</div>
              <div className="text-[9px] text-[#64748b]">Changed</div>
            </div>
            <div className="rounded-md border border-[#334155] bg-[#0f172a] p-1.5 text-center">
              <div className="text-xs font-bold text-[#ef4444]">{diff.removed.length}</div>
              <div className="text-[9px] text-[#64748b]">Removed</div>
            </div>
          </div>

          {diff.added.length > 0 && (
            <div>
              <span className="text-[9px] text-[#22c55e] font-semibold">+ Added</span>
              {diff.added.slice(0, 5).map((el) => (
                <div key={el.id} className="text-[9px] text-[#94a3b8] ml-2 truncate">{el.name}</div>
              ))}
            </div>
          )}
          {diff.removed.length > 0 && (
            <div>
              <span className="text-[9px] text-[#ef4444] font-semibold">- Removed</span>
              {diff.removed.slice(0, 5).map((el) => (
                <div key={el.id} className="text-[9px] text-[#94a3b8] ml-2 truncate">{el.name}</div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
