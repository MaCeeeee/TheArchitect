import { useState, useMemo } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { useSimulationStore } from '../../stores/simulationStore';
import type { EmergenceEvent, EmergenceEventType, AgentPosition } from '@thearchitect/shared/src/types/simulation.types';

const EVENT_COLORS: Record<EmergenceEventType, string> = {
  consensus: '#22c55e',
  deadlock: '#ef4444',
  coalition: '#3b82f6',
  fatigue: '#f97316',
  escalation: '#eab308',
  compromise: '#a855f7',
};

const EVENT_LABELS: Record<EmergenceEventType, string> = {
  consensus: 'Consensus',
  deadlock: 'Deadlock',
  coalition: 'Coalition',
  fatigue: 'Fatigue',
  escalation: 'Escalation',
  compromise: 'Compromise',
};

const POSITION_COLORS: Record<AgentPosition, string> = {
  approve: '#22c55e',
  reject: '#ef4444',
  modify: '#eab308',
  abstain: '#4a5a4a',
};

export default function EmergenceDashboard() {
  const activeRun = useSimulationStore((s) => s.activeRun);
  const [selectedEvent, setSelectedEvent] = useState<EmergenceEvent | null>(null);
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    timeline: true,
    heatmap: true,
    positions: true,
  });

  const rounds = activeRun?.rounds || [];
  const agents = activeRun?.config?.agents || [];

  // Compute conflict matrix: agentId x agentId → conflict count
  const conflictMatrix = useMemo(() => {
    const matrix = new Map<string, Map<string, number>>();
    for (const agent of agents) {
      matrix.set(agent.id, new Map(agents.map((a) => [a.id, 0])));
    }

    for (const round of rounds) {
      // Group actions by targetElementId
      const elementActions = new Map<string, Array<{ agentId: string; position: AgentPosition }>>();

      for (const turn of round.agentTurns) {
        // Track element-level positions from actions
        for (const action of turn.validatedActions || []) {
          const entries = elementActions.get(action.targetElementId) || [];
          entries.push({ agentId: turn.agentPersonaId, position: turn.position });
          elementActions.set(action.targetElementId, entries);
        }
      }

      // Find conflicting pairs on same elements
      for (const entries of elementActions.values()) {
        for (let i = 0; i < entries.length; i++) {
          for (let j = i + 1; j < entries.length; j++) {
            const a = entries[i];
            const b = entries[j];
            const isConflict =
              (a.position === 'approve' && b.position === 'reject') ||
              (a.position === 'reject' && b.position === 'approve') ||
              (a.position === 'modify' && b.position === 'reject') ||
              (a.position === 'reject' && b.position === 'modify');

            if (isConflict) {
              const rowA = matrix.get(a.agentId);
              const rowB = matrix.get(b.agentId);
              if (rowA) rowA.set(b.agentId, (rowA.get(b.agentId) || 0) + 1);
              if (rowB) rowB.set(a.agentId, (rowB.get(a.agentId) || 0) + 1);
            }
          }
        }
      }
    }

    return matrix;
  }, [rounds, agents]);

  const maxConflicts = useMemo(() => {
    let max = 0;
    for (const row of conflictMatrix.values()) {
      for (const count of row.values()) {
        if (count > max) max = count;
      }
    }
    return max;
  }, [conflictMatrix]);

  const toggleSection = (key: string) => {
    setExpandedSections((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  if (!activeRun || rounds.length === 0) {
    return (
      <div className="text-xs text-gray-400 p-4 text-center">
        No simulation data. Run a simulation first.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* ─── Section 1: Emergence Timeline ─── */}
      <SectionHeader
        title="Emergence Timeline"
        expanded={expandedSections.timeline}
        onToggle={() => toggleSection('timeline')}
      />
      {expandedSections.timeline && (
        <div className="space-y-2">
          {/* Legend */}
          <div className="flex flex-wrap gap-2">
            {(Object.keys(EVENT_COLORS) as EmergenceEventType[]).map((type) => (
              <div key={type} className="flex items-center gap-1">
                <div
                  className="w-2 h-2 rounded-full"
                  style={{ backgroundColor: EVENT_COLORS[type] }}
                />
                <span className="text-[10px] text-gray-500">{EVENT_LABELS[type]}</span>
              </div>
            ))}
          </div>

          {/* Timeline grid */}
          <div className="overflow-x-auto">
            <div
              className="grid gap-px min-w-fit"
              style={{ gridTemplateColumns: `repeat(${rounds.length}, 36px)` }}
            >
              {/* Round headers */}
              {rounds.map((r) => (
                <div key={`h-${r.roundNumber}`} className="text-center text-[10px] text-gray-500 pb-1">
                  R{r.roundNumber + 1}
                </div>
              ))}

              {/* Event dots */}
              {rounds.map((r) => (
                <div key={`e-${r.roundNumber}`} className="flex flex-col items-center gap-1 min-h-[24px]">
                  {r.emergenceEvents.length === 0 ? (
                    <div className="w-1.5 h-1.5 rounded-full bg-[#1a2a1a]" />
                  ) : (
                    r.emergenceEvents.map((event, idx) => (
                      <button
                        key={idx}
                        onClick={() => setSelectedEvent(selectedEvent === event ? null : event)}
                        className="rounded-full transition-transform hover:scale-125"
                        style={{
                          width: `${6 + event.severity * 8}px`,
                          height: `${6 + event.severity * 8}px`,
                          backgroundColor: EVENT_COLORS[event.type],
                          boxShadow: selectedEvent === event
                            ? `0 0 8px ${EVENT_COLORS[event.type]}`
                            : 'none',
                        }}
                        title={`${EVENT_LABELS[event.type]}: ${event.description}`}
                      />
                    ))
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Event detail */}
          {selectedEvent && (
            <div
              className="rounded p-2 text-xs border"
              style={{
                backgroundColor: `${EVENT_COLORS[selectedEvent.type]}10`,
                borderColor: `${EVENT_COLORS[selectedEvent.type]}40`,
              }}
            >
              <div className="flex items-center gap-2 mb-1">
                <div
                  className="w-2.5 h-2.5 rounded-full"
                  style={{ backgroundColor: EVENT_COLORS[selectedEvent.type] }}
                />
                <span className="font-medium text-gray-200">
                  {EVENT_LABELS[selectedEvent.type]}
                </span>
                <span className="text-gray-500 ml-auto">
                  Round {selectedEvent.round + 1} · Severity {(selectedEvent.severity * 100).toFixed(0)}%
                </span>
              </div>
              <p className="text-gray-400">{selectedEvent.description}</p>
              {selectedEvent.involvedAgents.length > 0 && (
                <p className="text-gray-500 mt-1">
                  Agents: {selectedEvent.involvedAgents.join(', ')}
                </p>
              )}
            </div>
          )}
        </div>
      )}

      {/* ─── Section 2: Agent-vs-Agent Conflict Heatmap ─── */}
      <SectionHeader
        title="Conflict Heatmap"
        expanded={expandedSections.heatmap}
        onToggle={() => toggleSection('heatmap')}
      />
      {expandedSections.heatmap && (
        <div className="overflow-x-auto">
          <div
            className="grid gap-px min-w-fit"
            style={{
              gridTemplateColumns: `48px repeat(${agents.length}, 1fr)`,
            }}
          >
            {/* Header row: empty corner + agent names */}
            <div />
            {agents.map((agent) => (
              <div
                key={`ch-${agent.id}`}
                className="text-[9px] text-gray-500 text-center truncate px-0.5"
                title={agent.name}
              >
                {agent.name.split(' ')[0]}
              </div>
            ))}

            {/* Data rows */}
            {agents.map((rowAgent) => (
              <>
                <div
                  key={`rl-${rowAgent.id}`}
                  className="text-[9px] text-gray-500 flex items-center truncate"
                  title={rowAgent.name}
                >
                  {rowAgent.name.split(' ')[0]}
                </div>
                {agents.map((colAgent) => {
                  const count = conflictMatrix.get(rowAgent.id)?.get(colAgent.id) || 0;
                  const isDiagonal = rowAgent.id === colAgent.id;
                  return (
                    <div
                      key={`c-${rowAgent.id}-${colAgent.id}`}
                      className="aspect-square rounded-sm flex items-center justify-center text-[9px]"
                      style={{
                        backgroundColor: isDiagonal
                          ? '#0a0a0a'
                          : count === 0
                            ? '#111111'
                            : maxConflicts > 0
                              ? `rgba(${count >= 5 ? '239,68,68' : count >= 3 ? '249,115,22' : '26,42,26'}, ${0.3 + (count / Math.max(maxConflicts, 1)) * 0.7})`
                              : '#111111',
                      }}
                      title={isDiagonal ? '' : `${rowAgent.name} vs ${colAgent.name}: ${count} conflicts`}
                    >
                      {!isDiagonal && count > 0 && (
                        <span className="text-gray-300">{count}</span>
                      )}
                    </div>
                  );
                })}
              </>
            ))}
          </div>

          {maxConflicts === 0 && (
            <div className="text-[10px] text-gray-500 text-center mt-1">
              No element-level conflicts detected
            </div>
          )}
        </div>
      )}

      {/* ─── Section 3: Agent Position Timeline ─── */}
      <SectionHeader
        title="Position Timeline"
        expanded={expandedSections.positions}
        onToggle={() => toggleSection('positions')}
      />
      {expandedSections.positions && (
        <div className="space-y-2">
          {/* Legend */}
          <div className="flex gap-3">
            {(Object.keys(POSITION_COLORS) as AgentPosition[]).map((pos) => (
              <div key={pos} className="flex items-center gap-1">
                <div
                  className="w-2 h-2 rounded-full"
                  style={{ backgroundColor: POSITION_COLORS[pos] }}
                />
                <span className="text-[10px] text-gray-500 capitalize">{pos}</span>
              </div>
            ))}
          </div>

          <div className="overflow-x-auto">
            <div
              className="grid gap-px min-w-fit"
              style={{
                gridTemplateColumns: `48px repeat(${rounds.length}, 36px)`,
              }}
            >
              {/* Header: empty + round numbers */}
              <div />
              {rounds.map((r) => (
                <div key={`ph-${r.roundNumber}`} className="text-center text-[10px] text-gray-500">
                  R{r.roundNumber + 1}
                </div>
              ))}

              {/* Per-agent rows */}
              {agents.map((agent) => (
                <>
                  <div
                    key={`pl-${agent.id}`}
                    className="text-[9px] text-gray-500 flex items-center truncate"
                    title={agent.name}
                  >
                    {agent.name.split(' ')[0]}
                  </div>
                  {rounds.map((r) => {
                    const turn = r.agentTurns.find((t) => t.agentPersonaId === agent.id);
                    const position = turn?.position || 'abstain';
                    return (
                      <div
                        key={`p-${agent.id}-${r.roundNumber}`}
                        className="flex items-center justify-center"
                      >
                        <div
                          className="w-3 h-3 rounded-full"
                          style={{
                            backgroundColor: POSITION_COLORS[position],
                            boxShadow: position !== 'abstain'
                              ? `0 0 4px ${POSITION_COLORS[position]}40`
                              : 'none',
                          }}
                          title={`${agent.name}: ${position} (Round ${r.roundNumber + 1})`}
                        />
                      </div>
                    );
                  })}
                </>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Collapsible Section Header ───

function SectionHeader({
  title,
  expanded,
  onToggle,
}: {
  title: string;
  expanded: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      onClick={onToggle}
      className="flex items-center gap-1.5 w-full text-xs font-medium text-gray-300 hover:text-[#00ff41] transition-colors"
    >
      {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
      {title}
    </button>
  );
}
