import type {
  SimulationRound,
  AgentTurn,
  FatigueReport,
  NextStep,
  NextStepCategory,
  MiroFishResistanceFactor,
} from '@thearchitect/shared/src/types/simulation.types';
import { callOpenAISync, callAnthropicSync } from '../oracle.service';
import type { ProjectVisionContext } from './agentContextFilter';
import type { ParsedScenario } from './scenarioParser';

// ─── Provider Detection (mirrors engine.ts) ───

type Provider = 'openai' | 'anthropic' | 'none';

function detectProvider(): Provider {
  if (process.env.OPENAI_API_KEY) return 'openai';
  if (process.env.ANTHROPIC_API_KEY) return 'anthropic';
  return 'none';
}

// ─── Resistance-Factor Extraction ───

const SEVERITY_ORDER: Record<MiroFishResistanceFactor['severity'], number> = {
  high: 0,
  medium: 1,
  low: 2,
};

/**
 * Mirrors oracle.service.ts:792-819 (extractResistanceFactors) with the
 * MiroFish data shape: rounds[].agentTurns[].validatedActions[] with the
 * agent's overall position attached.
 *
 * For every REJECT/MODIFY action across all rounds, emit a factor entry
 * tagged with the action's reasoning, the agent name, and the affected
 * element. Sorted by severity (high → medium → low) and capped at 8.
 */
export function extractMiroFishResistanceFactors(
  rounds: SimulationRound[],
): MiroFishResistanceFactor[] {
  const factors: MiroFishResistanceFactor[] = [];

  for (const round of rounds) {
    for (const turn of round.agentTurns as AgentTurn[]) {
      if (turn.position === 'approve' || turn.position === 'abstain') continue;

      const severity: MiroFishResistanceFactor['severity'] =
        turn.position === 'reject' ? 'high' : 'medium';

      for (const action of turn.validatedActions || []) {
        const reasoning = (action.reasoning || turn.reasoning || '').trim();
        if (!reasoning) continue;
        factors.push({
          factor: reasoning.slice(0, 180),
          severity,
          source: turn.agentName,
          elementName: action.targetElementName,
        });
      }
    }
  }

  factors.sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);
  return factors.slice(0, 8);
}

// ─── LLM-Reasoned Next-Step Generation ───

const VALID_CATEGORIES: NextStepCategory[] = [
  'mitigation',
  'remediation',
  'phase_shift',
  'governance',
  'escalation',
];

interface BottleneckLite {
  elementName: string;
  conflictRounds: number;
  involvedAgents: string[];
  projectedDelayMonths: number;
}

/**
 * Builds the synthesizer prompt. Mirrors the structure of Oracle's
 * generateMitigations prompt (oracle.service.ts:823-870) but pulls from
 * a multi-round simulation rather than a single-shot verdict.
 */
function buildSynthesizerPrompt(input: {
  scenarioDescription: string;
  parsedScenario?: ParsedScenario;
  projectVision?: ProjectVisionContext;
  rounds: SimulationRound[];
  fatigueReport: FatigueReport;
  resistanceFactors: MiroFishResistanceFactor[];
  bottlenecks: BottleneckLite[];
  ownerCandidates: string[];
}): string {
  const { scenarioDescription, parsedScenario, projectVision, rounds, fatigueReport, resistanceFactors, bottlenecks, ownerCandidates } = input;

  // Per-agent final position + action count (read from last round)
  const lastRound = rounds[rounds.length - 1];
  const finalPositions = (lastRound?.agentTurns as AgentTurn[] | undefined)?.map((t) => {
    const actions = t.validatedActions?.length || 0;
    return `- ${t.agentName} (${t.position}, ${actions} action${actions === 1 ? '' : 's'})`;
  }).join('\n') || '(no agent turns)';

  // Top resistance factors (already capped at 8)
  const resistanceLines = resistanceFactors.slice(0, 6).map((f) => {
    const elName = f.elementName ? ` on "${f.elementName}"` : '';
    return `- [${f.severity}] ${f.factor}${elName} (source: ${f.source})`;
  }).join('\n') || '(no resistance signals)';

  // Top bottlenecks
  const bottleneckLines = bottlenecks.slice(0, 5).map((b) => {
    const agentList = b.involvedAgents.slice(0, 3).join(', ');
    return `- "${b.elementName}" (${b.conflictRounds} conflict rounds, +${b.projectedDelayMonths}mo delay): ${agentList}${b.involvedAgents.length > 3 ? ` +${b.involvedAgents.length - 3} more` : ''}`;
  }).join('\n') || '(no bottlenecks)';

  const principleLines = (projectVision?.principles || []).slice(0, 6).map((p) => `- ${p}`).join('\n');
  const principleSection = principleLines
    ? `## Non-negotiable Principles (any next step violating these is invalid)\n${principleLines}\n`
    : '';

  const parsedSection = parsedScenario
    ? `## Parsed Scenario Constraints\n${parsedScenario.proposedChange ? `- Proposed change: ${parsedScenario.proposedChange}\n` : ''}${parsedScenario.hardDeadline ? `- Hard deadline: ${parsedScenario.hardDeadline}\n` : ''}${parsedScenario.decisionCriteria.length > 0 ? `- Decision criteria: ${parsedScenario.decisionCriteria.join('; ')}\n` : ''}`
    : '';

  return `You are an Enterprise Architecture advisor. A multi-stakeholder MiroFish simulation has just completed. Generate 3-5 concrete, actionable next steps the organization should take to resolve the disagreements and unblock the scenario.

## Scenario
${scenarioDescription || '(no scenario provided)'}

${parsedSection}## Stakeholder Final Positions
${finalPositions}

## Top Bottleneck Elements (where stakeholders disagree)
${bottleneckLines}

## Top Resistance Factors (REJECT/MODIFY rationales, sorted by severity)
${resistanceLines}

## Fatigue Signal
- Global fatigue: ${Math.round(fatigueReport.globalIndex * 100)}% (${fatigueReport.rating})
- Projected delay: +${fatigueReport.totalProjectedDelayMonths || 0} months
- Budget at risk: $${(fatigueReport.budgetAtRisk || 0).toLocaleString()}

${principleSection}## Owner Candidates (use ONE or COMBINATION of these for ownerHint)
${ownerCandidates.map((n) => `- ${n}`).join('\n')}

## Your Task
Produce 3-5 next steps. Each step MUST:
- Address one of the top bottlenecks or resistance factors above
- Name a concrete owner from the candidate list (or a combination, e.g. "CFO + HR Director")
- Estimate a cost range and timeline (use "0 EUR" / "free" if no budget needed)
- Cite the rationale tying it back to the resistance/bottleneck

Categorize each step:
- mitigation: addresses resistance, negotiates compromise between stakeholders
- remediation: invests in a missing capability or fixes a bottleneck
- phase_shift: re-times an existing roadmap initiative
- governance: changes a process, oversight, or audit-trail rule
- escalation: requires a higher decision-maker to break a deadlock

## Output Format (STRICT JSON ARRAY — no markdown, no explanation outside JSON)
[
  {
    "category": "mitigation",
    "action": "1-2 sentences, specific and actionable",
    "ownerHint": "CFO + HR Director",
    "costEstimateRange": "~80k EUR",
    "timelineHint": "Q2 2026",
    "rationale": "1 sentence: why this addresses the resistance"
  }
]

Each "action" must be SPECIFIC to this scenario — generic phrases like "conduct a workshop" are unacceptable unless they name what to discuss, who attends, and what decision is expected.`;
}

function parseNextStepResponse(raw: string): NextStep[] {
  const match = raw.match(/\[[\s\S]*\]/);
  if (!match) return [];
  try {
    const parsed = JSON.parse(match[0]);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((item: Record<string, unknown>): NextStep | null => {
        if (!item || typeof item !== 'object') return null;
        const action = String(item.action || '').trim();
        if (!action) return null;
        const rawCategory = String(item.category || 'mitigation').toLowerCase() as NextStepCategory;
        const category = VALID_CATEGORIES.includes(rawCategory) ? rawCategory : 'mitigation';
        return {
          category,
          action,
          ownerHint: item.ownerHint ? String(item.ownerHint).trim() : undefined,
          costEstimateRange: item.costEstimateRange ? String(item.costEstimateRange).trim() : undefined,
          timelineHint: item.timelineHint ? String(item.timelineHint).trim() : undefined,
          rationale: item.rationale ? String(item.rationale).trim() : undefined,
        };
      })
      .filter((s): s is NextStep => s !== null)
      .slice(0, 5);
  } catch {
    return [];
  }
}

function fallbackNextSteps(input: {
  bottlenecks: BottleneckLite[];
  resistanceFactors: MiroFishResistanceFactor[];
  ownerCandidates: string[];
  fatigueReport: FatigueReport;
}): NextStep[] {
  const steps: NextStep[] = [];
  const ownerHint = input.ownerCandidates.slice(0, 2).join(' + ') || 'Enterprise Architect';

  const topBottleneck = input.bottlenecks[0];
  if (topBottleneck && topBottleneck.conflictRounds > 0) {
    steps.push({
      category: 'mitigation',
      action: `Schedule a stakeholder workshop on "${topBottleneck.elementName}" with ${topBottleneck.involvedAgents.slice(0, 3).join(', ')} to resolve the ${topBottleneck.conflictRounds}-round disagreement before progressing.`,
      ownerHint,
      costEstimateRange: 'free (internal)',
      timelineHint: 'within 2 weeks',
      rationale: `This element shows ${topBottleneck.conflictRounds} conflict rounds and projects +${topBottleneck.projectedDelayMonths} months delay if unresolved.`,
    });
  }

  if (input.resistanceFactors.length >= 3) {
    steps.push({
      category: 'governance',
      action: `Document each REJECT/MODIFY rationale from the simulation in a project decision log; assign a change champion to draft a written response to each before the next architecture board.`,
      ownerHint,
      costEstimateRange: 'free (internal)',
      timelineHint: 'within 30 days',
      rationale: `${input.resistanceFactors.length} resistance signals were captured — un-tracked, they will resurface as escalations.`,
    });
  }

  if (input.fatigueReport.totalProjectedDelayMonths >= 3) {
    steps.push({
      category: 'phase_shift',
      action: `Re-baseline the affected initiatives by +${input.fatigueReport.totalProjectedDelayMonths} months and communicate the revised timeline to executive sponsors.`,
      ownerHint: input.ownerCandidates[0] || 'Program Office',
      costEstimateRange: '0 EUR',
      timelineHint: 'this quarter',
      rationale: `The simulation projects +${input.fatigueReport.totalProjectedDelayMonths} months delay from organizational fatigue — denial creates a worse surprise later.`,
    });
  }

  return steps;
}

/**
 * Generates 3-5 actionable next-step recommendations based on a completed
 * simulation. Mirrors Oracle's generateMitigations pattern (single LLM
 * call with full context, structured JSON output, fallback on parse fail).
 *
 * Caller should wrap in try/catch — failure here must not crash the
 * simulation (next steps enrich the result, they are not critical).
 */
export async function generateNextSteps(input: {
  scenarioDescription: string;
  parsedScenario?: ParsedScenario;
  projectVision?: ProjectVisionContext;
  rounds: SimulationRound[];
  fatigueReport: FatigueReport;
  resistanceFactors: MiroFishResistanceFactor[];
}): Promise<NextStep[]> {
  // Owner candidates: pull from the last round's agent names
  const lastRound = input.rounds[input.rounds.length - 1];
  const ownerCandidates = (lastRound?.agentTurns as AgentTurn[] | undefined)?.map((t) => t.agentName) || [];

  // Bottlenecks: pull from fatigueReport.perElement, sorted by conflictRounds desc
  const perElement = input.fatigueReport.perElement || [];
  const bottlenecks: BottleneckLite[] = [...perElement]
    .sort((a, b) => (b.conflictRounds || 0) - (a.conflictRounds || 0))
    .slice(0, 5)
    .map((e) => ({
      elementName: e.elementName,
      conflictRounds: e.conflictRounds || 0,
      involvedAgents: e.involvedAgents || [],
      projectedDelayMonths: e.projectedDelayMonths || 0,
    }));

  // No signal → return fallback heuristic steps without burning a token
  if (bottlenecks.length === 0 && input.resistanceFactors.length === 0) {
    return fallbackNextSteps({ bottlenecks, resistanceFactors: input.resistanceFactors, ownerCandidates, fatigueReport: input.fatigueReport });
  }

  const provider = detectProvider();
  if (provider === 'none') {
    return fallbackNextSteps({ bottlenecks, resistanceFactors: input.resistanceFactors, ownerCandidates, fatigueReport: input.fatigueReport });
  }

  const prompt = buildSynthesizerPrompt({ ...input, bottlenecks, ownerCandidates });

  let raw = '';
  try {
    if (provider === 'openai') {
      raw = await callOpenAISync(prompt, 'Generate the next steps as a JSON array.', 1200);
    } else {
      raw = await callAnthropicSync(prompt, 'Generate the next steps as a JSON array.', 1200);
    }
  } catch (err) {
    console.warn('[MiroFish] Next-step synthesizer LLM call failed, using fallback:', err);
    return fallbackNextSteps({ bottlenecks, resistanceFactors: input.resistanceFactors, ownerCandidates, fatigueReport: input.fatigueReport });
  }

  const parsed = parseNextStepResponse(raw);
  if (parsed.length === 0) {
    return fallbackNextSteps({ bottlenecks, resistanceFactors: input.resistanceFactors, ownerCandidates, fatigueReport: input.fatigueReport });
  }

  return parsed;
}
