import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';
import { buildAgentContext, type ProjectVisionContext } from './agentContextFilter';
import { validateActions } from './actionValidator';
import { EmergenceTracker } from './emergenceTracker';
import { Project } from '../../models/Project';
import type {
  AgentPersona,
  AgentTurn,
  ProposedAction,
  SimulationConfig,
  SimulationResult,
  SimulationRound,
  SimulationStreamEvent,
  ValidationResult,
  AgentPosition,
} from '@thearchitect/shared/src/types/simulation.types';

// ─── Provider Detection (mirrors ai.service.ts) ───

type Provider = 'openai' | 'anthropic' | 'none';

function detectProvider(): Provider {
  if (process.env.OPENAI_API_KEY) return 'openai';
  if (process.env.ANTHROPIC_API_KEY) return 'anthropic';
  return 'none';
}

// ─── LLM Response Schema ───

interface AgentLLMResponse {
  reasoning: string;
  actions: ProposedAction[];
  position: AgentPosition;
}

/**
 * MiroFishEngine: Orchestrates multi-agent simulation rounds.
 * Sequential rounds with broadcast — each agent sees the previous round's summary.
 */
export class MiroFishEngine {
  private cancelled = false;
  private totalTokensUsed = 0;
  private rounds: SimulationRound[] = [];

  cancel(): void {
    this.cancelled = true;
  }

  getRounds(): SimulationRound[] {
    return this.rounds;
  }

  async runSimulation(
    projectId: string,
    config: SimulationConfig,
    onEvent: (event: SimulationStreamEvent) => void,
  ): Promise<SimulationResult> {
    const provider = detectProvider();
    if (provider === 'none') {
      throw new Error('No AI API key configured (OPENAI_API_KEY or ANTHROPIC_API_KEY required)');
    }

    const tracker = new EmergenceTracker();
    const rounds: SimulationRound[] = [];
    this.rounds = rounds;
    let previousRoundSummary: string | undefined;
    const startTime = Date.now();

    // Fetch project vision once — injected into every agent's context as
    // non-negotiable framing. Without this, agents only see scenario text
    // and default to APPROVE because they have no principle to defend.
    const projectVision = await loadProjectVision(projectId);

    for (let roundNum = 0; roundNum < config.maxRounds; roundNum++) {
      if (this.cancelled) break;

      onEvent({ type: 'round_start', round: roundNum });

      const agentTurns: AgentTurn[] = [];

      for (const persona of config.agents) {
        if (this.cancelled) break;

        onEvent({ type: 'agent_start', agentId: persona.id, agentName: persona.name });

        const turn = await this.executeAgentTurn(
          projectId,
          config,
          persona,
          provider,
          previousRoundSummary,
          roundNum,
          onEvent,
          projectVision,
        );

        agentTurns.push(turn);
        tracker.recordTurn(roundNum, persona.id, turn, persona);
      }

      // Analyze round for emergence patterns
      const emergenceEvents = tracker.analyzeRound(roundNum);
      if (emergenceEvents.length > 0) {
        onEvent({ type: 'emergence', events: emergenceEvents });
      }

      // Compute fatigue snapshot after this round
      const fatigueReport = tracker.computeFatigueReport(
        config.agents[0]?.roundToMonthFactor ?? 2,
      );

      onEvent({
        type: 'fatigue_update',
        globalIndex: fatigueReport.globalIndex,
        rating: fatigueReport.rating,
        perAgent: fatigueReport.perAgent.map((a) => ({
          agentId: a.agentId,
          fatigueIndex: a.fatigueIndex,
          concurrencyLoad: a.concurrencyLoad,
          negotiationDrag: a.negotiationDrag,
          constraintPressure: a.constraintPressure,
        })),
      });

      const round: SimulationRound = {
        roundNumber: roundNum,
        agentTurns,
        emergenceEvents,
        fatigueSnapshot: {
          globalIndex: fatigueReport.globalIndex,
          rating: fatigueReport.rating,
          perAgent: Object.fromEntries(
            fatigueReport.perAgent.map((a) => [a.agentId, a.fatigueIndex]),
          ),
        },
      };

      rounds.push(round);

      onEvent({
        type: 'round_end',
        round: roundNum,
        globalFatigue: fatigueReport.globalIndex,
        fatigueRating: fatigueReport.rating,
      });

      // Build summary for next round
      previousRoundSummary = buildRoundSummary(roundNum, agentTurns);

      // Check termination
      const termination = tracker.shouldTerminate(roundNum);
      if (termination.terminate) {
        break;
      }
    }

    // Compute final result
    const fatigueReport = tracker.computeFatigueReport(
      config.agents[0]?.roundToMonthFactor ?? 2,
    );
    const metrics = tracker.getMetrics();

    // Determine outcome
    const lastRound = rounds[rounds.length - 1];
    const allApprove = lastRound?.agentTurns.every((t) => t.position === 'approve');
    const hasDeadlock = metrics.deadlockCount > 0 && !allApprove;

    let outcome: SimulationResult['outcome'];
    if (allApprove) {
      outcome = 'consensus';
    } else if (hasDeadlock) {
      outcome = 'deadlock';
    } else if (metrics.consensusScore > 0.5) {
      outcome = 'partial_consensus';
    } else {
      outcome = 'timeout';
    }

    // Collect risk/cost deltas from all validated actions
    const riskDelta: Record<string, number> = {};
    const costDelta: Record<string, number> = {};
    const allActions: ProposedAction[] = [];

    for (const round of rounds) {
      for (const turn of round.agentTurns) {
        for (const action of turn.validatedActions) {
          if (action.estimatedRiskImpact) {
            riskDelta[action.targetElementId] =
              (riskDelta[action.targetElementId] || 0) + action.estimatedRiskImpact;
          }
          if (action.estimatedCostImpact) {
            costDelta[action.targetElementId] =
              (costDelta[action.targetElementId] || 0) + action.estimatedCostImpact;
          }
          allActions.push(action);
        }
      }
    }

    // Recommended actions: actions that appeared in the last round with approve position
    const recommendedActions = lastRound
      ? lastRound.agentTurns
          .filter((t) => t.position === 'approve')
          .flatMap((t) => t.validatedActions)
      : [];

    const summary = `Simulation completed after ${rounds.length} rounds. Outcome: ${outcome}. ` +
      `Fatigue Index: ${fatigueReport.globalIndex} (${fatigueReport.rating}). ` +
      `Projected delay: ${fatigueReport.totalProjectedDelayMonths} months. ` +
      `Budget at risk: $${fatigueReport.budgetAtRisk.toLocaleString()}.`;

    const result: SimulationResult = {
      outcome,
      summary,
      riskDelta,
      costDelta,
      recommendedActions,
      fatigue: fatigueReport,
      emergenceMetrics: metrics,
    };

    onEvent({ type: 'complete', result });

    return result;
  }

  getTotalTokensUsed(): number {
    return this.totalTokensUsed;
  }

  getDurationMs(startTime: number): number {
    return Date.now() - startTime;
  }

  // ─── Single Agent Turn ───

  private async executeAgentTurn(
    projectId: string,
    config: SimulationConfig,
    persona: AgentPersona,
    provider: Provider,
    previousRoundSummary: string | undefined,
    roundNum: number,
    onEvent: (event: SimulationStreamEvent) => void,
    projectVision?: ProjectVisionContext,
  ): Promise<AgentTurn> {
    const turnStart = Date.now();

    // Build filtered context
    const context = await buildAgentContext(projectId, persona, previousRoundSummary, projectVision);

    // Build system prompt
    const systemPrompt = buildAgentSystemPrompt(persona, config, context);

    // Call LLM
    let fullResponse = '';
    let tokensUsed = 0;

    const onChunk = (text: string) => {
      fullResponse += text;
      onEvent({ type: 'reasoning_chunk', text });
    };

    try {
      if (provider === 'openai') {
        tokensUsed = await callOpenAI(systemPrompt, onChunk);
      } else {
        tokensUsed = await callAnthropic(systemPrompt, onChunk);
      }
    } catch (err) {
      // Fallback provider
      if (provider === 'openai' && process.env.ANTHROPIC_API_KEY) {
        console.warn(`[MiroFish] OpenAI failed for ${persona.id}, falling back to Anthropic`);
        fullResponse = '';
        tokensUsed = await callAnthropic(systemPrompt, onChunk);
      } else {
        throw err;
      }
    }

    this.totalTokensUsed += tokensUsed;

    // Parse structured response
    const parsed = parseAgentResponse(fullResponse);

    // Validate actions
    const validationResults = await validateActions(projectId, persona, parsed.actions);
    const validatedActions = validationResults.filter((r) => r.valid).map((r) => r.action);
    const rejectedActions = validationResults.filter((r) => !r.valid);

    onEvent({
      type: 'actions',
      validated: validatedActions,
      rejected: rejectedActions,
    });

    onEvent({
      type: 'agent_turn_complete',
      agentId: persona.id,
      agentName: persona.name,
      round: roundNum,
      reasoning: parsed.reasoning,
      position: parsed.position,
      validatedActions,
      rejectedCount: rejectedActions.length,
    });

    return {
      agentPersonaId: persona.id,
      agentName: persona.name,
      reasoning: parsed.reasoning,
      position: parsed.position,
      proposedActions: parsed.actions,
      validatedActions,
      rejectedActions,
      llmTokensUsed: tokensUsed,
      durationMs: Date.now() - turnStart,
    };
  }
}

// ─── Prompt Construction ───

function buildAgentSystemPrompt(
  persona: AgentPersona,
  config: SimulationConfig,
  filteredContext: string,
): string {
  return `You are "${persona.name}", a ${persona.stakeholderType.replace('_', ' ')} stakeholder in an Enterprise Architecture transformation review.

${persona.systemPromptSuffix}

## Scenario
${config.scenarioDescription}

## Your Priorities
${persona.priorities.map((p) => `- ${p.replace('_', ' ')}`).join('\n')}

${filteredContext}

## Your Task
1. Read the Enterprise Vision, Principles, and Your Personal Concerns above — those are the elements you OWN. Any action that violates a principle MUST be rejected, regardless of scenario pressure.
2. **Find disagreements** — if previous rounds showed other agents approving actions that conflict with your hard constraint or degrade your personal stakes, you MUST oppose them. Reference the disagreement explicitly in your reasoning.
3. **Take a real position** — APPROVE only if all your hard constraints pass AND no element from your personal stakes is degraded. Otherwise MODIFY (with concrete conditions) or REJECT (with concrete blockers). Default to MODIFY when evidence is incomplete; APPROVE requires positive proof.
4. Reference specific elements from "Your Personal Concerns" by name in your reasoning. If your concerns aren't affected, state that explicitly so the next agent knows.
5. State your overall position: approve, reject, modify, or abstain.

## Anti-Rubber-Stamp Rule
A response with position="approve" and 0 conflicts identified is INVALID for high-tension scenarios — re-examine the scenario for tensions you missed (cost vs. compliance, speed vs. audit, in-house vs. outsource, etc.) before submitting. If the scenario truly has no tension and all your hard constraints pass, you may APPROVE — but state explicitly which tensions you ruled out.

## Output Format (STRICT JSON — no markdown, no explanation outside JSON)
Respond with ONLY this JSON structure:
{
  "reasoning": "Your analysis in 2-4 sentences. Reference specific elements by name.",
  "actions": [
    {
      "type": "modify_status|modify_risk|recommend_retire|recommend_invest|flag_dependency|request_budget|block_change|approve_change",
      "targetElementId": "exact ID from the list above",
      "targetElementName": "element name",
      "changes": {"status": "target"} or {"riskLevel": "high"} (optional, depends on type),
      "reasoning": "why this specific action",
      "estimatedCostImpact": 50000 (optional, in dollars),
      "estimatedRiskImpact": 3 (optional, -10 to +10)
    }
  ],
  "position": "approve|reject|modify|abstain"
}

IMPORTANT:
- Use ONLY element IDs from the [ID:...] markers in the architecture listing above
- Do NOT invent elements or IDs that don't exist
- Keep actions realistic — you have limited capacity (${persona.expectedCapacity} parallel changes max)
- Respect your constraints (budget, risk threshold)`;
}

// ─── LLM Calls ───

async function callOpenAI(systemPrompt: string, onChunk: (text: string) => void): Promise<number> {
  const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
    baseURL: process.env.OPENAI_BASE_URL || undefined,
  });

  const stream = await openai.chat.completions.create({
    model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: 'Analyze the scenario and provide your structured response.' },
    ],
    stream: true,
    max_tokens: 2000,
    temperature: 0.8,
  });

  let tokens = 0;
  for await (const chunk of stream) {
    const text = chunk.choices[0]?.delta?.content;
    if (text) onChunk(text);
    tokens += 1; // Approximate — exact count from usage not available in streaming
  }

  return tokens;
}

async function callAnthropic(systemPrompt: string, onChunk: (text: string) => void): Promise<number> {
  const anthropic = new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY,
  });

  const stream = anthropic.messages.stream({
    model: process.env.ANTHROPIC_MODEL || 'claude-haiku-4-5-20251001',
    system: systemPrompt,
    messages: [
      { role: 'user', content: 'Analyze the scenario and provide your structured response.' },
    ],
    max_tokens: 2000,
  });

  let tokens = 0;
  for await (const event of stream) {
    if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
      onChunk(event.delta.text);
      tokens += 1;
    }
  }

  return tokens;
}

// ─── Response Parsing ───

function parseAgentResponse(raw: string): AgentLLMResponse {
  try {
    // Extract JSON from response (may have markdown wrapping)
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return { reasoning: raw, actions: [], position: 'abstain' };
    }

    const parsed = JSON.parse(jsonMatch[0]);

    return {
      reasoning: String(parsed.reasoning || ''),
      actions: Array.isArray(parsed.actions) ? parsed.actions.map(sanitizeAction) : [],
      position: validatePosition(parsed.position),
    };
  } catch {
    console.warn('[MiroFish] Failed to parse agent response, treating as abstain');
    return { reasoning: raw.slice(0, 500), actions: [], position: 'abstain' };
  }
}

function sanitizeAction(raw: Record<string, unknown>): ProposedAction {
  return {
    type: String(raw.type || 'approve_change') as ProposedAction['type'],
    targetElementId: String(raw.targetElementId || ''),
    targetElementName: String(raw.targetElementName || ''),
    changes: raw.changes as Record<string, string> | undefined,
    reasoning: String(raw.reasoning || ''),
    estimatedCostImpact: typeof raw.estimatedCostImpact === 'number' ? raw.estimatedCostImpact : undefined,
    estimatedRiskImpact: typeof raw.estimatedRiskImpact === 'number'
      ? Math.max(-10, Math.min(10, raw.estimatedRiskImpact))
      : undefined,
  };
}

function validatePosition(raw: unknown): AgentPosition {
  const valid: AgentPosition[] = ['approve', 'reject', 'modify', 'abstain'];
  const str = String(raw || 'abstain').toLowerCase() as AgentPosition;
  return valid.includes(str) ? str : 'abstain';
}

// ─── Project Vision Loader ───

async function loadProjectVision(projectId: string): Promise<ProjectVisionContext | undefined> {
  try {
    const doc = await Project.findById(projectId).select('vision').lean();
    if (!doc?.vision) return undefined;
    const v = doc.vision;
    return {
      visionStatement: String(v.visionStatement || ''),
      principles: Array.isArray(v.principles) ? v.principles.map(String) : [],
      drivers: Array.isArray(v.drivers) ? v.drivers.map(String) : [],
      goals: Array.isArray(v.goals) ? v.goals.map(String) : [],
    };
  } catch (err) {
    // Vision is enriching context, not critical — degrade gracefully if MongoDB
    // is slow/unavailable so the simulation can still run.
    console.warn('[MiroFish] Failed to load project vision:', err);
    return undefined;
  }
}

// ─── Round Summary Builder ───

interface DisagreementEntry {
  elementName: string;
  positions: Array<{ agentName: string; position: AgentPosition; actionReasoning: string }>;
}

/**
 * Surfaces elements where multiple agents took DIFFERENT positions or proposed
 * conflicting action types. Without this, the next round's agents only see a
 * narrative summary that flattens disagreement into per-agent paragraphs and
 * the LLM has to infer conflicts itself — which it usually doesn't.
 */
function findDisagreements(turns: AgentTurn[]): DisagreementEntry[] {
  // Map element name → agent positions that touched it
  const byElement = new Map<string, Map<string, { position: AgentPosition; actionReasoning: string }>>();

  for (const turn of turns) {
    for (const action of turn.validatedActions) {
      const elName = action.targetElementName || '(unknown element)';
      if (!byElement.has(elName)) byElement.set(elName, new Map());
      // If same agent touches the same element multiple times, keep the first
      // (action reasoning is more specific than overall position).
      const elMap = byElement.get(elName)!;
      if (!elMap.has(turn.agentName)) {
        elMap.set(turn.agentName, {
          position: turn.position,
          actionReasoning: action.reasoning || turn.reasoning,
        });
      }
    }
  }

  const disagreements: DisagreementEntry[] = [];
  for (const [elementName, agentMap] of byElement) {
    if (agentMap.size < 2) continue; // single agent → no conflict to surface
    const positions = Array.from(agentMap.entries()).map(([agentName, p]) => ({
      agentName,
      position: p.position,
      actionReasoning: p.actionReasoning,
    }));
    const distinctPositions = new Set(positions.map((p) => p.position));
    if (distinctPositions.size < 2) continue; // all same position → not a disagreement
    disagreements.push({ elementName, positions });
  }

  return disagreements;
}

function buildRoundSummary(roundNum: number, turns: AgentTurn[]): string {
  const lines: string[] = [`## Round ${roundNum} Results`];

  // Surface disagreements first — this is what the next round must react to.
  const disagreements = findDisagreements(turns);
  if (disagreements.length > 0) {
    lines.push(`\n### Disagreements in Round ${roundNum} (resolve these next round)`);
    for (const d of disagreements) {
      lines.push(`- On "${d.elementName}":`);
      for (const p of d.positions) {
        const reason = p.actionReasoning ? p.actionReasoning.slice(0, 220) : '(no reasoning)';
        lines.push(`    - ${p.agentName} (${p.position.toUpperCase()}): ${reason}`);
      }
    }
  } else {
    lines.push(`\n### All agents aligned this round — actively look for blind spots, missed constraints, or stakeholders whose concerns were overlooked.`);
  }

  for (const turn of turns) {
    lines.push(`\n### ${turn.agentName} (Position: ${turn.position})`);
    lines.push(turn.reasoning);

    if (turn.validatedActions.length > 0) {
      lines.push('Approved actions:');
      for (const a of turn.validatedActions) {
        lines.push(`- ${a.type} on "${a.targetElementName}": ${a.reasoning}`);
      }
    }

    if (turn.rejectedActions.length > 0) {
      lines.push(`(${turn.rejectedActions.length} actions were blocked by validation)`);
    }
  }

  return lines.join('\n');
}
