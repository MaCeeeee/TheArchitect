import type {
  SimulationRun,
  EmergenceMetrics,
  EmergenceEvent,
  FatigueRating,
  ElementFatigueDetail,
} from '@thearchitect/shared/src/types/simulation.types';

export interface RunComparisonData {
  runA: { id: string; name: string; createdAt: string };
  runB: { id: string; name: string; createdAt: string };
  fatigue: {
    globalA: number;
    globalB: number;
    delta: number;
    ratingA: FatigueRating;
    ratingB: FatigueRating;
    delayA: number;
    delayB: number;
    delayDelta: number;
    budgetAtRiskA: number;
    budgetAtRiskB: number;
    budgetDelta: number;
    perAgent: Array<{
      agentId: string;
      name: string;
      indexA: number;
      indexB: number;
      delta: number;
    }>;
  };
  bottlenecks: {
    onlyA: ElementFatigueDetail[];
    onlyB: ElementFatigueDetail[];
    shared: Array<{
      elementId: string;
      name: string;
      delayDeltaMonths: number;
      conflictDelta: number;
    }>;
  };
  emergence: {
    metricsA: EmergenceMetrics;
    metricsB: EmergenceMetrics;
    eventsA: EmergenceEvent[];
    eventsB: EmergenceEvent[];
  };
  riskCost: {
    elements: Array<{
      elementId: string;
      name: string;
      riskA: number;
      riskB: number;
      riskDelta: number;
      costA: number;
      costB: number;
      costDelta: number;
    }>;
  };
  outcomeA: string;
  outcomeB: string;
}

const EMPTY_METRICS: EmergenceMetrics = {
  totalInteractions: 0,
  deadlockCount: 0,
  consensusScore: 0,
  fatigueIndex: 0,
  fatigueRating: 'green',
  avgRoundsToConsensus: 0,
  blockedHallucinations: 0,
  totalProjectedDelayMonths: 0,
  budgetAtRisk: 0,
};

export function computeRunComparison(
  runA: SimulationRun,
  runB: SimulationRun,
): RunComparisonData {
  const resultA = runA.result!;
  const resultB = runB.result!;
  const fatigueA = resultA.fatigue;
  const fatigueB = resultB.fatigue;

  // Per-agent fatigue comparison — match by agentId
  const agentMapA = new Map(fatigueA.perAgent.map((a) => [a.agentId, a]));
  const agentMapB = new Map(fatigueB.perAgent.map((a) => [a.agentId, a]));
  const allAgentIds = new Set([...agentMapA.keys(), ...agentMapB.keys()]);

  const perAgent = Array.from(allAgentIds).map((agentId) => {
    const a = agentMapA.get(agentId);
    const b = agentMapB.get(agentId);
    return {
      agentId,
      name: a?.agentName || b?.agentName || agentId,
      indexA: a?.fatigueIndex || 0,
      indexB: b?.fatigueIndex || 0,
      delta: (b?.fatigueIndex || 0) - (a?.fatigueIndex || 0),
    };
  });

  // Bottleneck comparison by elementId
  const elemMapA = new Map(fatigueA.perElement.map((e) => [e.elementId, e]));
  const elemMapB = new Map(fatigueB.perElement.map((e) => [e.elementId, e]));

  const onlyA: ElementFatigueDetail[] = [];
  const onlyB: ElementFatigueDetail[] = [];
  const shared: Array<{ elementId: string; name: string; delayDeltaMonths: number; conflictDelta: number }> = [];

  for (const [id, elem] of elemMapA) {
    const bElem = elemMapB.get(id);
    if (bElem) {
      shared.push({
        elementId: id,
        name: elem.elementName,
        delayDeltaMonths: bElem.projectedDelayMonths - elem.projectedDelayMonths,
        conflictDelta: bElem.conflictRounds - elem.conflictRounds,
      });
    } else {
      onlyA.push(elem);
    }
  }
  for (const [id, elem] of elemMapB) {
    if (!elemMapA.has(id)) {
      onlyB.push(elem);
    }
  }

  // Risk/Cost delta comparison
  const allElementIds = new Set([
    ...Object.keys(resultA.riskDelta || {}),
    ...Object.keys(resultB.riskDelta || {}),
    ...Object.keys(resultA.costDelta || {}),
    ...Object.keys(resultB.costDelta || {}),
  ]);

  const riskCostElements = Array.from(allElementIds).map((elementId) => {
    const riskA = (resultA.riskDelta || {})[elementId] || 0;
    const riskB = (resultB.riskDelta || {})[elementId] || 0;
    const costA = (resultA.costDelta || {})[elementId] || 0;
    const costB = (resultB.costDelta || {})[elementId] || 0;

    // Try to find element name from bottleneck data
    const nameFromA = elemMapA.get(elementId)?.elementName;
    const nameFromB = elemMapB.get(elementId)?.elementName;

    return {
      elementId,
      name: nameFromA || nameFromB || elementId.substring(0, 8),
      riskA,
      riskB,
      riskDelta: riskB - riskA,
      costA,
      costB,
      costDelta: costB - costA,
    };
  });

  // Emergence events from rounds
  const eventsA = runA.rounds?.flatMap((r) => r.emergenceEvents || []) || [];
  const eventsB = runB.rounds?.flatMap((r) => r.emergenceEvents || []) || [];

  return {
    runA: { id: runA.id, name: runA.name, createdAt: runA.createdAt },
    runB: { id: runB.id, name: runB.name, createdAt: runB.createdAt },
    outcomeA: resultA.outcome,
    outcomeB: resultB.outcome,
    fatigue: {
      globalA: fatigueA.globalIndex,
      globalB: fatigueB.globalIndex,
      delta: fatigueB.globalIndex - fatigueA.globalIndex,
      ratingA: fatigueA.rating,
      ratingB: fatigueB.rating,
      delayA: fatigueA.totalProjectedDelayMonths,
      delayB: fatigueB.totalProjectedDelayMonths,
      delayDelta: fatigueB.totalProjectedDelayMonths - fatigueA.totalProjectedDelayMonths,
      budgetAtRiskA: fatigueA.budgetAtRisk,
      budgetAtRiskB: fatigueB.budgetAtRisk,
      budgetDelta: fatigueB.budgetAtRisk - fatigueA.budgetAtRisk,
      perAgent,
    },
    bottlenecks: { onlyA, onlyB, shared },
    emergence: {
      metricsA: resultA.emergenceMetrics || EMPTY_METRICS,
      metricsB: resultB.emergenceMetrics || EMPTY_METRICS,
      eventsA,
      eventsB,
    },
    riskCost: { elements: riskCostElements },
  };
}

/** Returns CSS class for diff highlighting based on delta direction.
 *  For fatigue/delay/cost: negative delta = improvement (green), positive = degradation (red).
 *  For consensus: positive delta = improvement. */
export function diffColor(delta: number, invert = false): string {
  const threshold = 0.01;
  if (Math.abs(delta) < threshold) return 'text-[#7a8a7a]';
  const improved = invert ? delta > 0 : delta < 0;
  return improved ? 'text-green-400' : 'text-red-400';
}

export function diffBg(delta: number, invert = false): string {
  const threshold = 0.01;
  if (Math.abs(delta) < threshold) return '';
  const improved = invert ? delta > 0 : delta < 0;
  return improved ? 'bg-green-500/10' : 'bg-red-500/10';
}

export function formatDelta(delta: number, suffix = ''): string {
  if (Math.abs(delta) < 0.01) return '—';
  const sign = delta > 0 ? '+' : '';
  return `${sign}${delta.toFixed(1)}${suffix}`;
}
