import type {
  AgentPersona,
  AgentPosition,
  AgentTurn,
  EmergenceEvent,
  EmergenceMetrics,
  FatigueReport,
  FatigueRating,
  AgentFatigueDetail,
  ElementFatigueDetail,
  ProposedAction,
  ValidationResult,
} from '@thearchitect/shared/src/types/simulation.types';

// ─── Internal Tracking State ───

interface AgentRoundRecord {
  round: number;
  agentId: string;
  position: AgentPosition;
  validatedActions: ProposedAction[];
  rejectedActions: ValidationResult[];
  persona: AgentPersona;
}

interface ElementConflict {
  elementId: string;
  elementName: string;
  rounds: Map<number, Map<string, AgentPosition>>; // round → agentId → position
}

// Fatigue weights
const W_CONCURRENCY = 0.35;
const W_NEGOTIATION = 0.35;
const W_CONSTRAINT = 0.30;

/**
 * EmergenceTracker: Detects emergent patterns (deadlock, consensus, fatigue, coalition)
 * across simulation rounds. Computes the 3-factor Fatigue Index for C-Level reporting.
 */
export class EmergenceTracker {
  private rounds: AgentRoundRecord[][] = [];
  private elementConflicts = new Map<string, ElementConflict>();
  private agentBudgetUsage = new Map<string, number>();
  private agentMaxRiskProposed = new Map<string, number>();
  private personas = new Map<string, AgentPersona>();
  private totalRoundsElapsed = 0;

  private static readonly RISK_LEVELS: Record<string, number> = {
    low: 1,
    medium: 2,
    high: 3,
    critical: 4,
  };

  /**
   * Record an agent's turn for emergence analysis.
   */
  recordTurn(
    round: number,
    agentId: string,
    turn: AgentTurn,
    persona: AgentPersona,
  ): void {
    this.personas.set(agentId, persona);
    this.totalRoundsElapsed = Math.max(this.totalRoundsElapsed, round + 1);

    // Ensure rounds array is large enough
    while (this.rounds.length <= round) {
      this.rounds.push([]);
    }

    const record: AgentRoundRecord = {
      round,
      agentId,
      position: turn.position,
      validatedActions: turn.validatedActions,
      rejectedActions: turn.rejectedActions,
      persona,
    };

    this.rounds[round].push(record);

    // Track per-element positions for negotiation drag
    for (const action of turn.validatedActions) {
      this.trackElementPosition(round, agentId, action.targetElementId, action.targetElementName, turn.position);
    }

    // Track cumulative budget usage
    const budgetActions = turn.validatedActions.filter(
      (a) => a.type === 'request_budget' || a.type === 'recommend_invest',
    );
    const budgetUsed = budgetActions.reduce((sum, a) => sum + (a.estimatedCostImpact || 0), 0);
    this.agentBudgetUsage.set(agentId, (this.agentBudgetUsage.get(agentId) || 0) + budgetUsed);

    // Track max risk proposed
    const riskActions = turn.validatedActions.filter((a) => a.changes?.riskLevel);
    for (const a of riskActions) {
      const level = EmergenceTracker.RISK_LEVELS[a.changes!.riskLevel!] || 0;
      const current = this.agentMaxRiskProposed.get(agentId) || 0;
      this.agentMaxRiskProposed.set(agentId, Math.max(current, level));
    }
  }

  private trackElementPosition(
    round: number,
    agentId: string,
    elementId: string,
    elementName: string,
    position: AgentPosition,
  ): void {
    if (!this.elementConflicts.has(elementId)) {
      this.elementConflicts.set(elementId, {
        elementId,
        elementName,
        rounds: new Map(),
      });
    }
    const conflict = this.elementConflicts.get(elementId)!;
    if (!conflict.rounds.has(round)) {
      conflict.rounds.set(round, new Map());
    }
    conflict.rounds.get(round)!.set(agentId, position);
  }

  /**
   * Analyze a completed round for emergence patterns.
   */
  analyzeRound(round: number): EmergenceEvent[] {
    const events: EmergenceEvent[] = [];
    const roundRecords = this.rounds[round] || [];

    if (roundRecords.length === 0) return events;

    // Detect CONSENSUS: all agents approve
    const allApprove = roundRecords.every((r) => r.position === 'approve');
    if (allApprove && roundRecords.length >= 2) {
      events.push({
        type: 'consensus',
        description: `All ${roundRecords.length} agents reached consensus in round ${round}.`,
        involvedAgents: roundRecords.map((r) => r.agentId),
        severity: 0.0,
        round,
      });
    }

    // Detect DEADLOCK: agents blocking each other on same elements
    const deadlocks = this.detectDeadlocks(round);
    events.push(...deadlocks);

    // Detect COALITION: 2+ agents propose same change
    const coalitions = this.detectCoalitions(round);
    events.push(...coalitions);

    // Detect FATIGUE: agent repeats exact same actions as previous round
    if (round > 0) {
      const fatigueEvents = this.detectFatigue(round);
      events.push(...fatigueEvents);
    }

    // Detect ESCALATION: risk-impact sum increasing monotonically
    if (round >= 2) {
      const escalation = this.detectEscalation(round);
      if (escalation) events.push(escalation);
    }

    return events;
  }

  private detectDeadlocks(round: number): EmergenceEvent[] {
    const events: EmergenceEvent[] = [];

    for (const [elementId, conflict] of this.elementConflicts) {
      const roundPositions = conflict.rounds.get(round);
      if (!roundPositions || roundPositions.size < 2) continue;

      const positions = [...roundPositions.values()];
      const hasBlocker = positions.includes('reject');
      const hasApprover = positions.includes('approve');

      if (hasBlocker && hasApprover) {
        const blockers = [...roundPositions.entries()]
          .filter(([, pos]) => pos === 'reject')
          .map(([id]) => id);
        const approvers = [...roundPositions.entries()]
          .filter(([, pos]) => pos === 'approve')
          .map(([id]) => id);

        events.push({
          type: 'deadlock',
          description: `Deadlock on "${conflict.elementName}": ${blockers.join(', ')} blocking vs ${approvers.join(', ')} approving.`,
          involvedAgents: [...blockers, ...approvers],
          severity: 0.7,
          round,
        });
      }
    }

    return events;
  }

  private detectCoalitions(round: number): EmergenceEvent[] {
    const events: EmergenceEvent[] = [];
    const roundRecords = this.rounds[round] || [];

    // Group actions by targetElementId + action type
    const actionGroups = new Map<string, string[]>();
    for (const record of roundRecords) {
      for (const action of record.validatedActions) {
        const key = `${action.targetElementId}:${action.type}`;
        if (!actionGroups.has(key)) actionGroups.set(key, []);
        actionGroups.get(key)!.push(record.agentId);
      }
    }

    for (const [key, agents] of actionGroups) {
      if (agents.length >= 2) {
        const [elementId, actionType] = key.split(':');
        const elementName = this.elementConflicts.get(elementId)?.elementName || elementId;
        events.push({
          type: 'coalition',
          description: `Coalition: ${agents.join(', ')} independently proposed "${actionType}" on "${elementName}".`,
          involvedAgents: agents,
          severity: 0.2,
          round,
        });
      }
    }

    return events;
  }

  private detectFatigue(round: number): EmergenceEvent[] {
    const events: EmergenceEvent[] = [];
    const currentRecords = this.rounds[round] || [];
    const prevRecords = this.rounds[round - 1] || [];

    for (const current of currentRecords) {
      const prev = prevRecords.find((r) => r.agentId === current.agentId);
      if (!prev) continue;

      // Check if agent repeated exact same actions
      const currentKeys = new Set(
        current.validatedActions.map((a) => `${a.targetElementId}:${a.type}`),
      );
      const prevKeys = new Set(
        prev.validatedActions.map((a) => `${a.targetElementId}:${a.type}`),
      );

      if (currentKeys.size > 0 && setsEqual(currentKeys, prevKeys) && current.position === prev.position) {
        events.push({
          type: 'fatigue',
          description: `Agent "${current.agentId}" repeated identical actions from previous round — no new arguments.`,
          involvedAgents: [current.agentId],
          severity: 0.5,
          round,
        });
      }
    }

    return events;
  }

  private detectEscalation(round: number): EmergenceEvent | null {
    // Check if total risk impact is increasing over last 3 rounds
    const riskSums: number[] = [];
    for (let r = Math.max(0, round - 2); r <= round; r++) {
      const records = this.rounds[r] || [];
      const sum = records.reduce((total, rec) => {
        return total + rec.validatedActions.reduce((s, a) => s + (a.estimatedRiskImpact || 0), 0);
      }, 0);
      riskSums.push(sum);
    }

    if (riskSums.length >= 3 && riskSums[0] < riskSums[1] && riskSums[1] < riskSums[2]) {
      return {
        type: 'escalation',
        description: `Risk escalation detected: risk impact increasing over last 3 rounds (${riskSums.map((s) => s.toFixed(1)).join(' → ')}).`,
        involvedAgents: (this.rounds[round] || []).map((r) => r.agentId),
        severity: 0.6,
        round,
      };
    }

    return null;
  }

  // ─── 3-Factor Fatigue Model ───

  /**
   * Compute the full Fatigue Report with per-agent and per-element breakdowns.
   */
  computeFatigueReport(roundToMonthFactor: number = 2): FatigueReport {
    const perAgent = this.computePerAgentFatigue(roundToMonthFactor);
    const perElement = this.computePerElementFatigue(roundToMonthFactor);

    // Global index: weighted average by agent's element count (responsibility scope)
    let weightedSum = 0;
    let weightTotal = 0;
    for (const agent of perAgent) {
      const scope = this.getAgentElementCount(agent.agentId);
      weightedSum += agent.fatigueIndex * scope;
      weightTotal += scope;
    }
    const globalIndex = weightTotal > 0 ? Math.min(1, weightedSum / weightTotal) : 0;
    const rating = indexToRating(globalIndex);

    // Budget at risk: sum of estimated costs for elements in fatigue-red zones
    const budgetAtRisk = perElement
      .filter((e) => e.negotiationDrag > 0.6)
      .reduce((sum, e) => {
        // Estimate cost based on conflict rounds × average budget per round
        return sum + e.conflictRounds * 20_000;
      }, 0);

    const totalProjectedDelayMonths = perAgent.length > 0
      ? Math.max(...perAgent.map((a) => a.projectedDelayMonths))
      : 0;

    return {
      globalIndex: round2(globalIndex),
      rating,
      perAgent,
      perElement,
      totalProjectedDelayMonths: Math.round(totalProjectedDelayMonths),
      budgetAtRisk: Math.round(budgetAtRisk),
      recommendation: this.generateRecommendation(globalIndex, perAgent, perElement),
    };
  }

  private computePerAgentFatigue(roundToMonthFactor: number): AgentFatigueDetail[] {
    const result: AgentFatigueDetail[] = [];

    for (const [agentId, persona] of this.personas) {
      // Factor 1: Concurrency Load
      const concurrencyLoad = this.computeConcurrencyLoad(agentId, persona);

      // Factor 2: Negotiation Drag (average across elements this agent touched)
      const negotiationDrag = this.computeAgentNegotiationDrag(agentId);

      // Factor 3: Constraint Pressure
      const constraintPressure = this.computeConstraintPressure(agentId, persona);

      // Composite
      const fatigueIndex = Math.min(1,
        W_CONCURRENCY * sigmoid(concurrencyLoad) +
        W_NEGOTIATION * sigmoid(negotiationDrag) +
        W_CONSTRAINT * sigmoid(constraintPressure),
      );

      // Bottleneck elements: elements where this agent has high concurrency
      const bottleneckElements = this.getBottleneckElements(agentId);

      // Projected delay
      const projectedDelayMonths = negotiationDrag * this.totalRoundsElapsed * roundToMonthFactor;

      result.push({
        agentId,
        agentName: persona.name,
        fatigueIndex: round2(fatigueIndex),
        concurrencyLoad: round2(concurrencyLoad),
        negotiationDrag: round2(negotiationDrag),
        constraintPressure: round2(constraintPressure),
        bottleneckElements,
        projectedDelayMonths: Math.round(projectedDelayMonths * 10) / 10,
      });
    }

    return result.sort((a, b) => b.fatigueIndex - a.fatigueIndex);
  }

  /**
   * Factor 1: Concurrency Load
   * How many elements does the agent need to evaluate vs. their capacity?
   */
  private computeConcurrencyLoad(agentId: string, persona: AgentPersona): number {
    if (this.rounds.length === 0) return 0;

    let maxLoad = 0;
    for (const round of this.rounds) {
      const record = round.find((r) => r.agentId === agentId);
      if (!record) continue;

      const actionsCount = record.validatedActions.length + record.rejectedActions.length;
      const load = actionsCount / persona.expectedCapacity;
      maxLoad = Math.max(maxLoad, load);
    }

    return maxLoad;
  }

  /**
   * Factor 2: Negotiation Drag (per agent)
   * Average ratio of conflict rounds across elements this agent touched.
   */
  private computeAgentNegotiationDrag(agentId: string): number {
    let totalDrag = 0;
    let touchedElements = 0;

    for (const [, conflict] of this.elementConflicts) {
      // Check if this agent was involved
      let involved = false;
      for (const [, positions] of conflict.rounds) {
        if (positions.has(agentId)) {
          involved = true;
          break;
        }
      }
      if (!involved) continue;

      touchedElements++;
      const conflictRounds = this.countConflictRounds(conflict);
      const drag = this.totalRoundsElapsed > 0
        ? conflictRounds / this.totalRoundsElapsed
        : 0;
      totalDrag += drag;
    }

    return touchedElements > 0 ? totalDrag / touchedElements : 0;
  }

  /**
   * Factor 3: Constraint Pressure
   * How close is the agent to their hard limits?
   */
  private computeConstraintPressure(agentId: string, persona: AgentPersona): number {
    let budgetUtil = 0;
    let riskUtil = 0;

    if (persona.budgetConstraint && persona.budgetConstraint > 0) {
      const used = this.agentBudgetUsage.get(agentId) || 0;
      budgetUtil = used / persona.budgetConstraint;
    }

    if (persona.riskThreshold) {
      const maxProposed = this.agentMaxRiskProposed.get(agentId) || 0;
      const threshold = EmergenceTracker.RISK_LEVELS[persona.riskThreshold] || 2;
      riskUtil = threshold > 0 ? maxProposed / threshold : 0;
    }

    return Math.max(budgetUtil, riskUtil);
  }

  private computePerElementFatigue(roundToMonthFactor: number): ElementFatigueDetail[] {
    const result: ElementFatigueDetail[] = [];

    for (const [elementId, conflict] of this.elementConflicts) {
      const conflictRounds = this.countConflictRounds(conflict);
      const negotiationDrag = this.totalRoundsElapsed > 0
        ? conflictRounds / this.totalRoundsElapsed
        : 0;

      const involvedAgentIds = new Set<string>();
      for (const [, positions] of conflict.rounds) {
        for (const agentId of positions.keys()) {
          involvedAgentIds.add(agentId);
        }
      }
      // Resolve IDs to readable persona names
      const involvedAgents = new Set<string>();
      for (const id of involvedAgentIds) {
        const persona = this.personas.get(id);
        involvedAgents.add(persona?.name || id);
      }

      const projectedDelayMonths = negotiationDrag * this.totalRoundsElapsed * roundToMonthFactor;

      result.push({
        elementId,
        elementName: conflict.elementName,
        negotiationDrag: round2(negotiationDrag),
        involvedAgents: [...involvedAgents],
        conflictRounds,
        projectedDelayMonths: Math.round(projectedDelayMonths * 10) / 10,
      });
    }

    return result
      .filter((e) => e.involvedAgents.length >= 2) // Only elements with multi-agent interaction
      .sort((a, b) => b.negotiationDrag - a.negotiationDrag);
  }

  private countConflictRounds(conflict: ElementConflict): number {
    let count = 0;
    for (const [, positions] of conflict.rounds) {
      const values = [...positions.values()];
      const hasConflict = values.includes('reject') && (values.includes('approve') || values.includes('modify'));
      if (hasConflict) count++;
    }
    return count;
  }

  private getBottleneckElements(agentId: string): string[] {
    const elementActionCounts = new Map<string, number>();

    for (const round of this.rounds) {
      const record = round.find((r) => r.agentId === agentId);
      if (!record) continue;

      for (const action of record.validatedActions) {
        const count = elementActionCounts.get(action.targetElementId) || 0;
        elementActionCounts.set(action.targetElementId, count + 1);
      }
    }

    return [...elementActionCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([id]) => id);
  }

  private getAgentElementCount(agentId: string): number {
    const elements = new Set<string>();
    for (const round of this.rounds) {
      const record = round.find((r) => r.agentId === agentId);
      if (!record) continue;
      for (const action of record.validatedActions) {
        elements.add(action.targetElementId);
      }
    }
    return Math.max(1, elements.size);
  }

  private generateRecommendation(
    globalIndex: number,
    perAgent: AgentFatigueDetail[],
    perElement: ElementFatigueDetail[],
  ): string {
    if (globalIndex < 0.3) {
      return 'Transformation is feasible within the planned timeframe. All stakeholders have sufficient capacity.';
    }

    const bottleneckAgent = perAgent[0]; // Sorted by fatigue desc
    const bottleneckElement = perElement[0]; // Sorted by negotiation drag desc

    const parts: string[] = [];

    if (globalIndex >= 0.8) {
      parts.push('CRITICAL: Transformation will likely fail in its current form.');
    } else if (globalIndex >= 0.6) {
      parts.push('WARNING: High probability of bottlenecks and delays.');
    } else {
      parts.push('CAUTION: Moderate risk of delays.');
    }

    if (bottleneckAgent) {
      if (bottleneckAgent.concurrencyLoad > 0.7) {
        parts.push(`${bottleneckAgent.agentName} is overloaded with ${Math.round(bottleneckAgent.concurrencyLoad * 100)}% concurrent changes — consider phasing work.`);
      }
      if (bottleneckAgent.constraintPressure > 0.8) {
        parts.push(`${bottleneckAgent.agentName} is at ${Math.round(bottleneckAgent.constraintPressure * 100)}% of resource limits — budget/capacity relief needed.`);
      }
    }

    if (bottleneckElement && bottleneckElement.negotiationDrag > 0.5) {
      parts.push(`"${bottleneckElement.elementName}" has prolonged stakeholder conflict (${bottleneckElement.conflictRounds} rounds) — projected +${bottleneckElement.projectedDelayMonths} months delay.`);
    }

    return parts.join(' ');
  }

  // ─── Aggregate Metrics ───

  getMetrics(): EmergenceMetrics {
    const fatigueReport = this.computeFatigueReport();

    // Consensus score: ratio of elements with consensus
    let consensusCount = 0;
    let totalElements = 0;
    for (const [, conflict] of this.elementConflicts) {
      if (conflict.rounds.size === 0) continue;
      totalElements++;
      const lastRound = Math.max(...conflict.rounds.keys());
      const positions = [...(conflict.rounds.get(lastRound)?.values() || [])];
      if (positions.length > 0 && positions.every((p) => p === 'approve')) {
        consensusCount++;
      }
    }

    // Average rounds to consensus
    let totalRoundsToConsensus = 0;
    let elementsWithConsensus = 0;
    for (const [, conflict] of this.elementConflicts) {
      const sortedRounds = [...conflict.rounds.keys()].sort((a, b) => a - b);
      for (const round of sortedRounds) {
        const positions = [...(conflict.rounds.get(round)?.values() || [])];
        if (positions.length >= 2 && positions.every((p) => p === 'approve')) {
          totalRoundsToConsensus += round;
          elementsWithConsensus++;
          break;
        }
      }
    }

    // Total blocked hallucinations
    let blockedHallucinations = 0;
    for (const round of this.rounds) {
      for (const record of round) {
        blockedHallucinations += record.rejectedActions.length;
      }
    }

    // Total interactions
    let totalInteractions = 0;
    for (const round of this.rounds) {
      for (const record of round) {
        totalInteractions += record.validatedActions.length;
      }
    }

    // Deadlock count
    let deadlockCount = 0;
    for (let r = 0; r < this.rounds.length; r++) {
      const events = this.analyzeRound(r);
      deadlockCount += events.filter((e) => e.type === 'deadlock').length;
    }

    return {
      totalInteractions,
      deadlockCount,
      consensusScore: totalElements > 0 ? round2(consensusCount / totalElements) : 0,
      fatigueIndex: fatigueReport.globalIndex,
      fatigueRating: fatigueReport.rating,
      avgRoundsToConsensus: elementsWithConsensus > 0
        ? round2(totalRoundsToConsensus / elementsWithConsensus)
        : 0,
      blockedHallucinations,
      totalProjectedDelayMonths: fatigueReport.totalProjectedDelayMonths,
      budgetAtRisk: fatigueReport.budgetAtRisk,
    };
  }

  /**
   * Check if simulation should terminate early.
   */
  shouldTerminate(round: number): { terminate: boolean; reason?: string } {
    if (round < 1) return { terminate: false };

    const currentRecords = this.rounds[round] || [];
    const prevRecords = this.rounds[round - 1] || [];

    // All agents reached consensus
    if (currentRecords.length >= 2 && currentRecords.every((r) => r.position === 'approve')) {
      return { terminate: true, reason: 'All agents reached consensus.' };
    }

    // Deadlock: same positions 2 consecutive rounds
    if (prevRecords.length > 0 && currentRecords.length > 0) {
      const prevPositions = new Map(prevRecords.map((r) => [r.agentId, r.position]));
      const allSame = currentRecords.every((r) => prevPositions.get(r.agentId) === r.position);
      if (allSame) {
        return { terminate: true, reason: 'Deadlock detected — agents repeated identical positions.' };
      }
    }

    return { terminate: false };
  }
}

// ─── Utility Functions ───

function sigmoid(x: number): number {
  // Maps any positive value to 0-1 range, with 1.0 mapping to ~0.73
  return 1 / (1 + Math.exp(-2 * (x - 0.5)));
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function indexToRating(index: number): FatigueRating {
  if (index < 0.3) return 'green';
  if (index < 0.6) return 'yellow';
  if (index < 0.8) return 'orange';
  return 'red';
}

function setsEqual(a: Set<string>, b: Set<string>): boolean {
  if (a.size !== b.size) return false;
  for (const item of a) {
    if (!b.has(item)) return false;
  }
  return true;
}
