import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';
import { createHash } from 'crypto';
import { getAllPresetPersonas } from './mirofish/personas';
import { buildAgentContext } from './mirofish/agentContextFilter';
import { runCypher, serializeNeo4jProperties } from '../config/neo4j';
import type { AgentPersona } from '@thearchitect/shared/src/types/simulation.types';
import type {
  OracleProposal,
  OracleVerdict,
  AgentVerdict,
  ResistanceFactor,
  OracleFatigueForecast,
  OracleRiskLevel,
  OraclePosition,
  AgentVerdictPosition,
  ResistanceSeverity,
  OracleModelParams,
  OracleCustomStakeholder,
} from '@thearchitect/shared/src/types/oracle.types';

// ─── Internal: Extended result from single agent assessment ───

interface AgentAssessmentResult extends AgentVerdict {
  _audit: {
    systemPrompt: string;
    rawResponse: string;
    architectureContext: string;
    modelParams: OracleModelParams;
  };
}

// ─── Affected Element Details ───

export interface AffectedElementDetail {
  id: string;
  name: string;
  type: string;
  layer: string;
  status: string;
  riskLevel: string;
  maturityLevel: number;
  annualCost: number;
  errorRatePercent: number;
  technicalFitness: number;
  functionalFitness: number;
  technicalDebtRatio: number;
  userCount: number;
  dependencyCount: number;
  dependentCount: number;
}

export async function fetchAffectedElementDetails(
  projectId: string,
  elementIds: string[],
): Promise<AffectedElementDetail[]> {
  if (elementIds.length === 0) return [];

  const records = await runCypher(
    `MATCH (e:ArchitectureElement {projectId: $projectId})
     WHERE e.id IN $ids
     OPTIONAL MATCH (e)-[out:CONNECTS_TO]->()
     OPTIONAL MATCH ()-[inc:CONNECTS_TO]->(e)
     RETURN e, count(DISTINCT out) as outDeps, count(DISTINCT inc) as inDeps`,
    { projectId, ids: elementIds },
  );

  return records.map((r) => {
    const props = serializeNeo4jProperties(r.get('e').properties);
    return {
      id: String(props.id || ''),
      name: String(props.name || ''),
      type: String(props.type || ''),
      layer: String(props.layer || ''),
      status: String(props.status || 'current'),
      riskLevel: String(props.riskLevel || 'low'),
      maturityLevel: Number(props.maturityLevel) || 3,
      annualCost: Number(props.annualCost) || 0,
      errorRatePercent: Number(props.errorRatePercent) || 0,
      technicalFitness: Number(props.technicalFitness) || 0,
      functionalFitness: Number(props.functionalFitness) || 0,
      technicalDebtRatio: Number(props.technicalDebtRatio) || 0,
      userCount: Number(props.userCount) || 0,
      dependencyCount: Number(r.get('outDeps')) || 0,
      dependentCount: Number(r.get('inDeps')) || 0,
    };
  });
}

// ─── Business Capability Mapping ───

interface BusinessCapabilityImpact {
  elementName: string;
  capabilities: string[]; // business processes / business objects connected to this element
}

async function fetchBusinessCapabilityMap(
  projectId: string,
  elementIds: string[],
): Promise<BusinessCapabilityImpact[]> {
  if (elementIds.length === 0) return [];
  try {
    const records = await runCypher(
      `MATCH (e:ArchitectureElement {projectId: $projectId})
       WHERE e.id IN $ids
       OPTIONAL MATCH (e)-[:CONNECTS_TO*1..2]-(bp:ArchitectureElement {projectId: $projectId})
       WHERE bp.layer IN ['business', 'strategy']
       RETURN e.name as elementName, collect(DISTINCT bp.name) as capabilities`,
      { projectId, ids: elementIds },
    );
    return records
      .map((r) => ({
        elementName: String(r.get('elementName') || ''),
        capabilities: (r.get('capabilities') as string[]).filter(Boolean),
      }))
      .filter((r) => r.capabilities.length > 0);
  } catch {
    return [];
  }
}

function formatBusinessCapabilities(impacts: BusinessCapabilityImpact[]): string {
  if (impacts.length === 0) return '';
  return '\n## Business Capabilities Affected by This Change\n' +
    impacts.map((i) =>
      `- "${i.elementName}" supports: ${i.capabilities.join(', ')}`,
    ).join('\n') +
    '\n\nConsider: Which of these capabilities does YOUR team use or depend on? How will losing or changing them affect YOUR work?\n';
}

function formatAffectedElements(details: AffectedElementDetail[]): string {
  if (details.length === 0) return '- No specific element details available';
  return details.map((d) => {
    const parts = [
      `"${d.name}" [${d.type}]`,
      `status=${d.status}, risk=${d.riskLevel}, maturity=${d.maturityLevel}/5`,
    ];
    if (d.annualCost > 0) parts.push(`annual_cost=$${d.annualCost.toLocaleString()}`);
    if (d.errorRatePercent > 0) parts.push(`error_rate=${d.errorRatePercent}%`);
    if (d.technicalFitness > 0) parts.push(`tech_fitness=${d.technicalFitness}/5`);
    if (d.functionalFitness > 0) parts.push(`func_fitness=${d.functionalFitness}/5`);
    if (d.technicalDebtRatio > 0) parts.push(`tech_debt=${(d.technicalDebtRatio * 100).toFixed(0)}%`);
    if (d.userCount > 0) parts.push(`users=${d.userCount}`);
    parts.push(`deps=${d.dependencyCount} out / ${d.dependentCount} in`);
    return `- ${parts.join(', ')}`;
  }).join('\n');
}

// ─── Provider Detection (mirrors engine.ts) ───

export type Provider = 'openai' | 'anthropic' | 'none';

export function detectProvider(): Provider {
  if (process.env.OPENAI_API_KEY) return 'openai';
  if (process.env.ANTHROPIC_API_KEY) return 'anthropic';
  return 'none';
}

// ─── Stakeholder Weights for Score Aggregation ───

const STAKEHOLDER_WEIGHTS: Record<string, number> = {
  c_level: 0.30,
  business_unit: 0.25,
  it_ops: 0.20,
  data_team: 0.15,
  external: 0.10,
};

const CUSTOM_WEIGHT_VALUES: Record<string, number> = {
  voting: 0.15,
  advisory: 0.05,
};

function customStakeholderToPersona(cs: OracleCustomStakeholder): AgentPersona {
  return {
    id: `custom_${cs.stakeholderType}_${cs.name.toLowerCase().replace(/[^a-z0-9]/g, '_')}`,
    name: cs.name,
    stakeholderType: cs.stakeholderType as AgentPersona['stakeholderType'],
    visibleLayers: cs.visibleLayers as AgentPersona['visibleLayers'],
    visibleDomains: cs.visibleLayers as AgentPersona['visibleDomains'],
    maxGraphDepth: 3,
    budgetConstraint: 0,
    riskThreshold: cs.riskThreshold,
    expectedCapacity: 3,
    roundToMonthFactor: 2,
    priorities: cs.priorities,
    systemPromptSuffix: cs.context
      ? `You are "${cs.name}" (${cs.role}). ${cs.context}`
      : `You are "${cs.name}", a ${cs.role}. You evaluate this change from your specialized domain perspective. Your priorities are: ${cs.priorities.join(', ')}.`,
  };
}

function buildDynamicWeights(
  presetPersonas: AgentPersona[],
  customStakeholders: OracleCustomStakeholder[],
): Map<string, number> {
  const weights = new Map<string, number>();

  // Preset weights
  for (const p of presetPersonas) {
    weights.set(p.id, STAKEHOLDER_WEIGHTS[p.stakeholderType] || 0.10);
  }

  // Custom weights
  for (const cs of customStakeholders) {
    const persona = customStakeholderToPersona(cs);
    weights.set(persona.id, CUSTOM_WEIGHT_VALUES[cs.weight] || 0.05);
  }

  // Normalize to sum = 1.0
  const total = Array.from(weights.values()).reduce((s, w) => s + w, 0);
  if (total > 0) {
    for (const [k, v] of weights) {
      weights.set(k, v / total);
    }
  }

  return weights;
}

// ─── Fatigue Weights (from EmergenceTracker) ───

const W_CONCURRENCY = 0.35;
const W_NEGOTIATION = 0.35;
const W_CONSTRAINT = 0.30;

function sigmoid(x: number): number {
  return 1 / (1 + Math.exp(-2 * (x - 0.5)));
}

// ─── Main Oracle Function ───

export interface OracleUserContext {
  userId: string;
  userName: string;
  userEmail: string;
  authMethod: 'api_key' | 'jwt' | 'oauth';
  apiKeyPrefix?: string; // first 8 chars of hashed key for traceability
}

export async function assessAcceptanceRisk(
  projectId: string,
  proposal: OracleProposal,
  userContext?: OracleUserContext,
): Promise<OracleVerdict> {
  const start = Date.now();

  const provider = detectProvider();
  if (provider === 'none') {
    throw new Error('NO_AI_KEY');
  }

  const presetPersonas = getAllPresetPersonas();
  const customPersonas = (proposal.customStakeholders || []).map(customStakeholderToPersona);
  const personas = [...presetPersonas, ...customPersonas];
  const dynamicWeights = buildDynamicWeights(presetPersonas, proposal.customStakeholders || []);

  // Fetch affected element details + business capability map for enriched prompts
  const [affectedDetails, capabilityMap] = await Promise.all([
    fetchAffectedElementDetails(projectId, proposal.affectedElementIds),
    fetchBusinessCapabilityMap(projectId, proposal.affectedElementIds),
  ]);

  // Run all persona assessments in parallel (preset + custom)
  const verdictPromises = personas.map((persona) =>
    assessSingleAgent(projectId, persona, proposal, provider, affectedDetails, capabilityMap),
  );

  const results = await Promise.allSettled(verdictPromises);

  // Collect successful results (with audit traces) and plain verdicts
  const assessmentResults: AgentAssessmentResult[] = [];
  const agentVerdicts: AgentVerdict[] = [];

  for (let i = 0; i < results.length; i++) {
    const result = results[i];
    if (result.status === 'fulfilled') {
      assessmentResults.push(result.value);
      // Strip _audit for the plain verdict
      const { _audit, ...verdict } = result.value;
      agentVerdicts.push(verdict);
    } else {
      // Create fallback verdict for failed agents
      const fallback: AgentVerdict = {
        personaId: personas[i].id,
        personaName: personas[i].name,
        stakeholderType: personas[i].stakeholderType,
        position: 'abstain',
        reasoning: 'Assessment could not be completed due to a technical issue.',
        concerns: ['Agent assessment failed — result should be verified manually'],
        acceptanceScore: 50, // neutral
      };
      agentVerdicts.push(fallback);
      assessmentResults.push({
        ...fallback,
        _audit: {
          systemPrompt: '[agent failed before prompt delivery]',
          rawResponse: `[error: ${result.reason}]`,
          architectureContext: '[not available]',
          modelParams: { provider, model: 'unknown', temperature: 0, maxTokens: 0, fallbackUsed: false },
        },
      });
    }
  }

  // Compute weighted acceptance risk score
  const acceptanceRiskScore = computeWeightedRiskScore(agentVerdicts, dynamicWeights);

  // Derive risk level
  const riskLevel = deriveRiskLevel(acceptanceRiskScore);

  // Derive overall position
  const overallPosition = deriveOverallPosition(acceptanceRiskScore);

  // Extract resistance factors from agent verdicts
  const resistanceFactors = extractResistanceFactors(agentVerdicts);

  // Generate mitigation suggestions via second LLM call
  const mitigationSuggestions = await generateMitigations(
    proposal,
    agentVerdicts,
    resistanceFactors,
    provider,
  );

  // Compute fatigue forecast
  const fatigueForecast = computeFatigueForecast(
    personas,
    proposal,
    agentVerdicts,
  );

  // ─── Build Context Snapshot (Jasper: "context version Z at timestamp T") ───
  const contextTimestamp = new Date().toISOString();
  const allContexts = assessmentResults.map((r) => r._audit.architectureContext).join('|||');
  const contextHash = createHash('sha256').update(allContexts).digest('hex').slice(0, 16);

  // Count total elements/connections in project for snapshot
  let totalElements = 0;
  let totalConnections = 0;
  try {
    const countResult = await runCypher(
      `MATCH (e:ArchitectureElement {projectId: $projectId})
       OPTIONAL MATCH (e)-[r:CONNECTS_TO]->()
       RETURN count(DISTINCT e) as elCount, count(DISTINCT r) as connCount`,
      { projectId },
    );
    if (countResult.length > 0) {
      totalElements = Number(countResult[0].get('elCount')) || 0;
      totalConnections = Number(countResult[0].get('connCount')) || 0;
    }
  } catch { /* non-critical */ }

  // ─── Build Compliance Audit Report (EU AI Act + Jasper compliant) ───
  const auditReport = {
    assessmentId: `oracle-${Date.now()}`,
    timestamp: contextTimestamp,
    provider,
    model: provider === 'openai'
      ? (process.env.OPENAI_MODEL || 'gpt-4o-mini')
      : (process.env.ANTHROPIC_MODEL || 'claude-haiku-4-5-20251001'),

    // EU AI Act Art. 6-7: System Risk Classification
    systemRiskClassification: {
      euAiActLevel: 'limited' as const,
      justification: 'AI-assisted decision support for architecture change assessment. '
        + 'System provides recommendations to human decision-makers, does not take autonomous actions. '
        + 'Classified as limited risk per EU AI Act Art. 6 — transparency obligations apply (Art. 52).',
      humanOversightRequired: true,
      articleReference: 'EU AI Act 2024/1689, Art. 6(2), Art. 52(1), Annex IV',
    },

    // EU AI Act Art. 14: Human Oversight
    humanOversight: {
      status: 'pending_review' as const,
    },

    // EU AI Act Art. 12: Initiator Identity (DSGVO Art. 6(1)(c) — legal obligation)
    initiator: userContext ? {
      userId: userContext.userId,
      userName: userContext.userName,
      userEmail: userContext.userEmail,
      authMethod: userContext.authMethod,
      apiKeyPrefix: userContext.apiKeyPrefix,
    } : undefined,

    // Jasper: Context version at timestamp T
    contextSnapshot: {
      id: contextHash,
      timestamp: contextTimestamp,
      elementCount: totalElements,
      connectionCount: totalConnections,
      affectedElementCount: affectedDetails.length,
    },

    proposal: {
      ...proposal,
      affectedElements: affectedDetails.map((d) => ({
        id: d.id,
        name: d.name,
        type: d.type,
        layer: d.layer,
        annualCost: d.annualCost,
        maturityLevel: d.maturityLevel,
        riskLevel: d.riskLevel,
        errorRatePercent: d.errorRatePercent,
        technicalDebtRatio: d.technicalDebtRatio,
        userCount: d.userCount,
        dependencyCount: d.dependencyCount,
        dependentCount: d.dependentCount,
      })),
    },

    // EU AI Act Art. 13-14: Full agent decision traces
    agentReports: assessmentResults.map((r) => {
      const persona = personas.find((p) => p.id === r.personaId);
      return {
        personaId: r.personaId,
        personaName: r.personaName,
        stakeholderType: r.stakeholderType,
        riskThreshold: persona?.riskThreshold || 'unknown',
        budgetConstraint: persona?.budgetConstraint || 0,
        expectedCapacity: persona?.expectedCapacity || 0,
        priorities: persona?.priorities || [],
        visibleLayers: persona?.visibleLayers || [],
        position: r.position,
        acceptanceScore: r.acceptanceScore,
        reasoning: r.reasoning,
        concerns: r.concerns,
        weight: dynamicWeights.get(r.personaId) ?? STAKEHOLDER_WEIGHTS[r.stakeholderType] ?? 0.10,
        weightedRiskContribution: Math.round(
          (100 - r.acceptanceScore) * (dynamicWeights.get(r.personaId) ?? STAKEHOLDER_WEIGHTS[r.stakeholderType] ?? 0.10),
        ),
        // ─── Full Decision Trace (Art. 13-14) ───
        systemPrompt: r._audit.systemPrompt,
        rawResponse: r._audit.rawResponse,
        architectureContext: r._audit.architectureContext,
        modelParams: r._audit.modelParams,
      };
    }),

    scoring: {
      method: 'weighted_stakeholder_average',
      weights: Object.fromEntries(dynamicWeights),
      rawScore: acceptanceRiskScore,
      roundedScore: Math.round(acceptanceRiskScore),
      riskLevel,
      overallPosition,
    },
  };

  return {
    acceptanceRiskScore: Math.round(acceptanceRiskScore),
    riskLevel,
    overallPosition,
    agentVerdicts,
    resistanceFactors,
    mitigationSuggestions,
    fatigueForecast,
    auditReport,
    timestamp: new Date().toISOString(),
    durationMs: Date.now() - start,
  };
}

// ─── Single Agent Assessment ───

async function assessSingleAgent(
  projectId: string,
  persona: AgentPersona,
  proposal: OracleProposal,
  provider: Provider,
  affectedDetails?: AffectedElementDetail[],
  capabilityMap?: BusinessCapabilityImpact[],
): Promise<AgentAssessmentResult> {
  // Build filtered architecture context for this persona
  const context = await buildAgentContext(projectId, persona);

  const systemPrompt = buildOraclePrompt(persona, proposal, context, affectedDetails, capabilityMap);

  let rawResponse = '';
  let fallbackUsed = false;
  let actualProvider = provider;

  const modelForProvider = (p: Provider) => p === 'openai'
    ? (process.env.OPENAI_MODEL || 'gpt-4o-mini')
    : (process.env.ANTHROPIC_MODEL || 'claude-haiku-4-5-20251001');

  try {
    if (provider === 'openai') {
      rawResponse = await callOpenAISync(systemPrompt);
    } else {
      rawResponse = await callAnthropicSync(systemPrompt);
    }
  } catch (err) {
    // Fallback provider
    if (provider === 'openai' && process.env.ANTHROPIC_API_KEY) {
      rawResponse = await callAnthropicSync(systemPrompt);
      fallbackUsed = true;
      actualProvider = 'anthropic';
    } else if (provider === 'anthropic' && process.env.OPENAI_API_KEY) {
      rawResponse = await callOpenAISync(systemPrompt);
      fallbackUsed = true;
      actualProvider = 'openai';
    } else {
      throw err;
    }
  }

  const verdict = parseAgentVerdict(rawResponse, persona);

  return {
    ...verdict,
    _audit: {
      systemPrompt,
      rawResponse,
      architectureContext: context,
      modelParams: {
        provider,
        model: modelForProvider(actualProvider as Provider),
        temperature: actualProvider === 'openai' ? 0.7 : 1.0,
        maxTokens: 800,
        fallbackUsed,
        actualProvider: fallbackUsed ? actualProvider : undefined,
      },
    },
  };
}

// ─── Oracle-Specific Prompt ───

function buildOraclePrompt(
  persona: AgentPersona,
  proposal: OracleProposal,
  architectureContext: string,
  affectedDetails?: AffectedElementDetail[],
  capabilityMap?: BusinessCapabilityImpact[],
): string {
  const costStr = proposal.estimatedCost
    ? `\n- Estimated cost: $${proposal.estimatedCost.toLocaleString()}`
    : '';
  const durationStr = proposal.estimatedDuration
    ? `\n- Estimated duration: ${proposal.estimatedDuration} months`
    : '';

  const scopeHint = proposal.affectedElementIds.length <= 3
    ? 'This is a narrow-scope change affecting few components.'
    : proposal.affectedElementIds.length <= 6
    ? 'This is a moderate-scope change.'
    : 'This is a wide-scope change affecting many components.';

  const typeHint: Record<string, string> = {
    modify: 'This is an incremental change to existing systems — not a new introduction or major migration.',
    introduce: 'This introduces a new component into the architecture.',
    retire: 'This REMOVES/DECOMMISSIONS an existing system. Everything this system provides will be GONE.',
    migrate: 'This moves functionality from one platform/technology to another. Transition risks apply.',
    consolidate: 'This merges multiple systems into fewer ones. Some specific capabilities may be lost.',
  };

  // Risk-threshold-specific scoring guidance
  const riskThresholdScoring: Record<string, string> = {
    high: `Your risk threshold is HIGH — you are comfortable with significant change and uncertainty.
Cost savings, strategic improvements, and vendor independence strongly appeal to you.
For changes with mixed trade-offs, score in the 65-80 range. Only score below 40 when the change directly threatens core strategic assets or creates unacceptable technical risk. A "modify" position at 50 is too cautious for your profile — either the benefits outweigh the risks (approve, 65+) or they don't (reject, <35).`,
    medium: `Your risk threshold is MEDIUM — you carefully weigh costs vs benefits.
Score 50-70 for changes where benefits are clear but risks exist. Score below 35 only when risks clearly outweigh benefits for your domain. Avoid the "safe middle" — take a clear position based on net impact.`,
    low: `Your risk threshold is LOW — you are very cautious about changes that introduce NEW complexity or risk.
KEY DISTINCTION: Does this change ADD risk or REMOVE risk?
- If it ADDS new components, dependencies, or complexity → score 20-40 (you oppose adding risk)
- If it REDUCES risk (security patches, EOL remediation, standard upgrades, removing deprecated systems) → score 60-80 (removing risk is exactly what you want)
- The question is: do our systems become MORE or LESS stable/secure after this change?
You are the voice of caution — but caution means SUPPORTING changes that reduce risk, not blocking everything.`,
  };

  // Domain-specific evaluation lens per stakeholder type
  const domainLens: Record<string, string> = {
    c_level: `As a C-level executive, evaluate the STRATEGIC impact:
- Does this change strengthen or weaken the platform's competitive position?
- Does it advance or undermine long-term technology strategy?
- What capabilities will the organization LOSE vs GAIN?
- Will this decision be defensible to the board and investors?`,
    business_unit: `As the Business Unit Lead, evaluate the BUSINESS IMPACT on your team:
- What business capabilities will you LOSE access to? (Read the proposal description carefully!)
- What tools/features that your team USES will disappear or degrade?
- Will your team's ability to make decisions, forecast, or plan be affected?
- Does cost savings justify losing capabilities your team depends on?
- WARNING: Do not approve cost savings if they remove tools your team actively uses for decision-making.`,
    it_ops: `As IT Operations Manager, evaluate the OPERATIONAL impact:
- Will this change REDUCE your operational burden (less to maintain/monitor)?
- Or will it INCREASE complexity (new dependencies, migration risk)?
- Consider BOTH sides: removing a complex system means less maintenance, but breaking dependencies means outages.
- A retire/remove that eliminates Ops workload can be POSITIVE for you even if others oppose it.
- Focus on: uptime risk, monitoring gaps, capacity impact, runbook changes.`,
    data_team: `As Head of Data & Analytics, evaluate the DATA impact:
- Will data pipelines, integrations, or analytics capabilities break?
- Is there data loss risk (historical records, simulation data, audit trails)?
- Will data quality or compliance posture be affected?
- Consider: Does this change affect data you ACTUALLY use, or data owned by other teams?`,
    external: `As an external advisor, evaluate with an independent perspective:
- What would a neutral industry analyst say about this change?
- Does it follow industry best practices or go against them?
- What would competitors do in this situation?`,
  };

  const capabilitySection = capabilityMap ? formatBusinessCapabilities(capabilityMap) : '';

  return `You are "${persona.name}", a ${persona.stakeholderType.replace(/_/g, ' ')} stakeholder reviewing an architecture change proposal.

${persona.systemPromptSuffix}

## Your Priorities
${persona.priorities.map((p) => `- ${p.replace(/_/g, ' ')}`).join('\n')}

## Your Risk Threshold: ${persona.riskThreshold}
${riskThresholdScoring[persona.riskThreshold || 'medium'] || riskThresholdScoring.medium}

## Your Domain Lens
${domainLens[persona.stakeholderType] || domainLens.external}

## Your Visibility
You can see: ${persona.visibleLayers.join(', ')} layers.
You CANNOT see: ${['strategy', 'business', 'information', 'application', 'technology'].filter((l) => !(persona.visibleLayers as string[]).includes(l)).join(', ') || 'nothing — you have full visibility'}.
IMPORTANT: Even if you cannot see a layer, you MUST evaluate impacts described in the proposal text. The proposal tells you what will happen — assess how that affects YOUR domain.

${architectureContext}

## Proposed Change
- Title: ${proposal.title}
- Type: ${proposal.changeType}
- Description: ${proposal.description}
- Affected elements: ${proposal.affectedElementIds.length} element(s)${costStr}${durationStr}
- Scope: ${scopeHint}
- Context: ${typeHint[proposal.changeType] || ''}

## Affected Element Details (factual data)
${affectedDetails ? formatAffectedElements(affectedDetails) : '- No element details available'}
${capabilitySection}
## Your Evaluation Task
Answer these questions FROM YOUR PERSPECTIVE before scoring:
1. What do I LOSE if this change happens? (capabilities, tools, data, insights)
2. What do I GAIN? (simplicity, cost savings, reduced burden, better alternatives)
3. NET IMPACT: Does my team come out better or worse?
4. Are there conditions under which I'd accept this? (phasing, alternatives, guarantees)

## Score Calibration
- 85-100: Clear win for my domain — aligns with my goals, low/no risk to my area
- 65-84: Net positive with manageable trade-offs
- 40-64: Mixed — real trade-offs, I'd want conditions or phasing
- 15-39: Net negative — I lose more than I gain, threatens my core priorities
- 0-14: Unacceptable — removes something I fundamentally depend on

CRITICAL RULES:
- Score based on YOUR domain impact. A change can be good for Ops but bad for Strategy, or vice versa.
- Do NOT default to round numbers. Think carefully: is this a 22 or a 38? A 67 or a 78?
- If a "retire" removes something your team maintains but doesn't use, that's POSITIVE (less work).
- If a "retire" removes something your team depends on, that's NEGATIVE (capability loss).
- If the change has NO impact on your domain, score 70-80 (neutral-positive, not your problem).
- Only raise concerns that are SPECIFIC to this proposal. No generic change-management worries.

## Output Format (STRICT JSON — no markdown, no text outside JSON)
{
  "domainImpact": "1-2 sentences: what I lose vs what I gain",
  "position": "approve|reject|modify|abstain",
  "reasoning": "2-4 sentences explaining your position from YOUR domain perspective.",
  "concerns": ["specific concern 1", "specific concern 2"],
  "acceptanceScore": <number>
}

Match your position to your score: approve if >= 60, modify if 35-59, reject if < 35.`;
}

// ─── LLM Calls (Non-Streaming for Speed) ───

export async function callOpenAISync(systemPrompt: string, userMessage?: string, maxTokens?: number): Promise<string> {
  const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
    baseURL: process.env.OPENAI_BASE_URL || undefined,
  });

  const response = await openai.chat.completions.create({
    model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userMessage || 'Evaluate this architecture proposal and provide your structured assessment.' },
    ],
    max_tokens: maxTokens || 800,
    temperature: 0.7,
  });

  return response.choices[0]?.message?.content || '';
}

export async function callAnthropicSync(systemPrompt: string, userMessage?: string, maxTokens?: number): Promise<string> {
  const anthropic = new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY,
  });

  const response = await anthropic.messages.create({
    model: process.env.ANTHROPIC_MODEL || 'claude-haiku-4-5-20251001',
    system: systemPrompt,
    messages: [
      { role: 'user', content: userMessage || 'Evaluate this architecture proposal and provide your structured assessment.' },
    ],
    max_tokens: maxTokens || 800,
  });

  const block = response.content[0];
  return block.type === 'text' ? block.text : '';
}

// ─── Response Parsing ───

function parseAgentVerdict(raw: string, persona: AgentPersona): AgentVerdict {
  try {
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return fallbackVerdict(persona, raw);
    }

    const parsed = JSON.parse(jsonMatch[0]);

    const validPositions: AgentVerdictPosition[] = ['approve', 'reject', 'modify', 'abstain'];
    const position = validPositions.includes(parsed.position) ? parsed.position : 'abstain';

    const score = typeof parsed.acceptanceScore === 'number'
      ? Math.max(0, Math.min(100, Math.round(parsed.acceptanceScore)))
      : 50;

    // Prepend domainImpact to reasoning for richer audit trail
    const domainImpact = parsed.domainImpact ? `[Domain Impact: ${String(parsed.domainImpact).slice(0, 200)}] ` : '';
    const reasoning = domainImpact + String(parsed.reasoning || '');

    return {
      personaId: persona.id,
      personaName: persona.name,
      stakeholderType: persona.stakeholderType,
      position,
      reasoning: reasoning.slice(0, 1200),
      concerns: Array.isArray(parsed.concerns)
        ? parsed.concerns.map((c: unknown) => String(c)).slice(0, 5)
        : [],
      acceptanceScore: score,
    };
  } catch {
    return fallbackVerdict(persona, raw);
  }
}

function fallbackVerdict(persona: AgentPersona, raw: string): AgentVerdict {
  return {
    personaId: persona.id,
    personaName: persona.name,
    stakeholderType: persona.stakeholderType,
    position: 'abstain',
    reasoning: raw.slice(0, 300) || 'Could not parse structured response.',
    concerns: ['Response parsing failed — manual review recommended'],
    acceptanceScore: 50,
  };
}

// ─── Score Computation ───

function computeWeightedRiskScore(verdicts: AgentVerdict[], weights?: Map<string, number>): number {
  let weightedSum = 0;
  let totalWeight = 0;

  for (const verdict of verdicts) {
    const w = weights?.get(verdict.personaId) ?? STAKEHOLDER_WEIGHTS[verdict.stakeholderType] ?? 0.10;
    weightedSum += (100 - verdict.acceptanceScore) * w;
    totalWeight += w;
  }

  if (totalWeight === 0) return 50;
  return Math.max(0, Math.min(100, weightedSum / totalWeight));
}

function deriveRiskLevel(score: number): OracleRiskLevel {
  if (score < 30) return 'low';
  if (score < 60) return 'medium';
  if (score < 80) return 'high';
  return 'critical';
}

function deriveOverallPosition(score: number): OraclePosition {
  if (score < 35) return 'likely_accepted';
  if (score < 65) return 'contested';
  return 'likely_rejected';
}

// ─── Resistance Factor Extraction ───

function extractResistanceFactors(verdicts: AgentVerdict[]): ResistanceFactor[] {
  const factors: ResistanceFactor[] = [];

  for (const verdict of verdicts) {
    if (verdict.position === 'approve') continue;

    for (const concern of verdict.concerns) {
      if (!concern || concern.includes('parsing failed')) continue;

      const severity: ResistanceSeverity =
        verdict.position === 'reject' ? 'high' :
        verdict.position === 'modify' ? 'medium' : 'low';

      factors.push({
        factor: concern.slice(0, 100),
        severity,
        source: verdict.personaName,
        description: `${verdict.personaName} (${verdict.stakeholderType.replace(/_/g, ' ')}): ${concern}`,
      });
    }
  }

  // Sort by severity and limit to 5
  const severityOrder: Record<string, number> = { high: 0, medium: 1, low: 2 };
  factors.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);

  return factors.slice(0, 5);
}

// ─── Mitigation Generation ───

async function generateMitigations(
  proposal: OracleProposal,
  verdicts: AgentVerdict[],
  factors: ResistanceFactor[],
  provider: Provider,
): Promise<string[]> {
  if (factors.length === 0) {
    return ['No significant resistance detected — proceed with standard change management.'];
  }

  const prompt = `You are an Enterprise Architecture advisor. Based on the following stakeholder feedback on a proposed "${proposal.changeType}" change titled "${proposal.title}", generate 3-5 concrete, actionable mitigation strategies to reduce resistance and increase acceptance.

## Stakeholder Feedback
${verdicts.map((v) => `- ${v.personaName} (${v.position}, score ${v.acceptanceScore}/100): ${v.reasoning}`).join('\n')}

## Top Resistance Factors
${factors.map((f) => `- [${f.severity}] ${f.factor} (source: ${f.source})`).join('\n')}

## Output Format (STRICT JSON — no markdown)
["mitigation suggestion 1", "mitigation suggestion 2", "mitigation suggestion 3"]

Each suggestion should be 1-2 sentences, specific, and actionable.`;

  try {
    let raw = '';
    if (provider === 'openai') {
      raw = await callOpenAISync(prompt);
    } else {
      raw = await callAnthropicSync(prompt);
    }

    const match = raw.match(/\[[\s\S]*\]/);
    if (match) {
      const parsed = JSON.parse(match[0]);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed.map((s: unknown) => String(s)).slice(0, 5);
      }
    }
  } catch {
    // Fallback to generic suggestions
  }

  return [
    'Conduct stakeholder workshops before implementation to address concerns.',
    'Consider a phased rollout to reduce organizational resistance.',
    'Assign change champions in each affected department.',
  ];
}

// ─── Fatigue Forecast ───

function computeFatigueForecast(
  personas: AgentPersona[],
  proposal: OracleProposal,
  verdicts: AgentVerdict[],
): OracleFatigueForecast {
  const overloadedStakeholders: string[] = [];
  let maxDelay = 0;

  for (const verdict of verdicts) {
    const persona = personas.find((p) => p.id === verdict.personaId);
    if (!persona) continue;

    // Concurrency load: affected elements vs capacity
    const concurrencyLoad = proposal.affectedElementIds.length / persona.expectedCapacity;

    // Constraint pressure: budget utilization
    let constraintPressure = 0;
    if (persona.budgetConstraint && proposal.estimatedCost) {
      constraintPressure = proposal.estimatedCost / persona.budgetConstraint;
    }

    // Negotiation drag: rejection / modification = higher drag
    const negotiationDrag = verdict.position === 'reject' ? 0.8
      : verdict.position === 'modify' ? 0.5
      : verdict.position === 'abstain' ? 0.3
      : 0.1;

    const fatigueIndex = Math.min(1.0,
      W_CONCURRENCY * sigmoid(concurrencyLoad) +
      W_NEGOTIATION * sigmoid(negotiationDrag) +
      W_CONSTRAINT * sigmoid(constraintPressure),
    );

    // Projected delay based on fatigue
    const roundToMonth = persona.roundToMonthFactor || 2;
    const delayMonths = fatigueIndex > 0.5 ? fatigueIndex * roundToMonth * 2 : 0;

    if (fatigueIndex > 0.6) {
      overloadedStakeholders.push(verdict.personaName);
    }

    maxDelay = Math.max(maxDelay, delayMonths);
  }

  // Budget at risk: estimate based on delay and cost
  const budgetAtRisk = proposal.estimatedCost
    ? Math.round(proposal.estimatedCost * (maxDelay / Math.max(proposal.estimatedDuration || 12, 1)) * 0.3)
    : 0;

  return {
    projectedDelayMonths: Math.round(maxDelay * 10) / 10,
    budgetAtRisk: Math.max(0, budgetAtRisk),
    overloadedStakeholders,
  };
}

// ─── System Suitability Assessment ───

export interface SuitabilityAlternative {
  name: string;
  type: string;
  rationale: string;
  migrationEffort: 'low' | 'medium' | 'high';
  estimatedCostDelta: string;
}

export interface SuitabilityAssessment {
  elementId: string;
  elementName: string;
  elementType: string;
  suitabilityScore: number; // 1-5
  verdict: 'suitable' | 'adequate' | 'at_risk' | 'unsuitable';
  strengths: string[];
  weaknesses: string[];
  alternatives: SuitabilityAlternative[];
  recommendation: string;
  durationMs: number;
}

export async function assessSystemSuitability(
  projectId: string,
  elementId: string,
): Promise<SuitabilityAssessment> {
  const start = Date.now();

  const provider = detectProvider();
  if (provider === 'none') throw new Error('NO_AI_KEY');

  // Fetch the target element details + its business capability connections
  const [details, capabilityMap] = await Promise.all([
    fetchAffectedElementDetails(projectId, [elementId]),
    fetchBusinessCapabilityMap(projectId, [elementId]),
  ]);

  if (details.length === 0) throw new Error('Element not found');

  const el = details[0];
  const capabilities = capabilityMap.length > 0
    ? capabilityMap[0].capabilities.join(', ')
    : 'No linked business capabilities';

  const prompt = `You are an Enterprise Architecture Analyst specializing in IT system assessment.

Evaluate the following IT system/application component for suitability within its enterprise architecture context.

## System Under Assessment
- Name: "${el.name}"
- Type: ${el.type}
- Layer: ${el.layer}
- Status: ${el.status}
- Maturity Level: ${el.maturityLevel}/5
- Technical Fitness: ${el.technicalFitness || 'unknown'}/5
- Functional Fitness: ${el.functionalFitness || 'unknown'}/5
- Technical Debt Ratio: ${el.technicalDebtRatio ? `${(el.technicalDebtRatio * 100).toFixed(0)}%` : 'unknown'}
- Annual Cost: ${el.annualCost ? `€${el.annualCost.toLocaleString()}` : 'unknown'}
- Error Rate: ${el.errorRatePercent ? `${el.errorRatePercent}%` : 'unknown'}
- User Count: ${el.userCount || 'unknown'}
- Dependencies (outgoing): ${el.dependencyCount}
- Dependencies (incoming): ${el.dependentCount}
- Risk Level: ${el.riskLevel}

## Business Context
This system supports: ${capabilities}

## Your Task
1. Assess whether this system is suitable for its current role.
2. Identify 2-3 concrete strengths and 2-3 concrete weaknesses.
3. Suggest 2-3 alternative systems/technologies that could serve the same purpose better (with realistic names — e.g., if it's a CRM, suggest Salesforce, HubSpot, etc.; if it's a MES, suggest Siemens Opcenter, SAP ME, etc.).
4. Give a clear recommendation.

Respond ONLY with a JSON object (no markdown, no code fences):
{
  "suitabilityScore": <1-5, where 1=unsuitable, 5=excellent>,
  "verdict": "<suitable|adequate|at_risk|unsuitable>",
  "strengths": ["...", "...", "..."],
  "weaknesses": ["...", "...", "..."],
  "alternatives": [
    {
      "name": "<specific product/technology name>",
      "type": "<e.g. SaaS CRM, On-Premise ERP, Cloud-Native MES>",
      "rationale": "<why this is a better fit>",
      "migrationEffort": "<low|medium|high>",
      "estimatedCostDelta": "<e.g. +20%, -15%, comparable>"
    }
  ],
  "recommendation": "<1-2 sentence actionable recommendation>"
}`;

  let raw = '';
  try {
    if (provider === 'openai') {
      raw = await callOpenAISync(prompt, 'Assess this system and provide your structured evaluation.', 1200);
    } else {
      raw = await callAnthropicSync(prompt, 'Assess this system and provide your structured evaluation.', 1200);
    }
  } catch (err) {
    // Fallback provider
    if (provider === 'openai' && process.env.ANTHROPIC_API_KEY) {
      raw = await callAnthropicSync(prompt, 'Assess this system and provide your structured evaluation.', 1200);
    } else if (provider === 'anthropic' && process.env.OPENAI_API_KEY) {
      raw = await callOpenAISync(prompt, 'Assess this system and provide your structured evaluation.', 1200);
    } else {
      throw err;
    }
  }

  // Parse response
  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error('Failed to parse AI response for suitability assessment');
  }

  const parsed = JSON.parse(jsonMatch[0]);
  const validVerdicts = ['suitable', 'adequate', 'at_risk', 'unsuitable'] as const;

  return {
    elementId: el.id,
    elementName: el.name,
    elementType: el.type,
    suitabilityScore: Math.min(5, Math.max(1, Number(parsed.suitabilityScore) || 3)),
    verdict: validVerdicts.includes(parsed.verdict) ? parsed.verdict : 'adequate',
    strengths: Array.isArray(parsed.strengths) ? parsed.strengths.map(String).slice(0, 5) : [],
    weaknesses: Array.isArray(parsed.weaknesses) ? parsed.weaknesses.map(String).slice(0, 5) : [],
    alternatives: Array.isArray(parsed.alternatives)
      ? parsed.alternatives.slice(0, 3).map((a: any) => ({
          name: String(a.name || ''),
          type: String(a.type || ''),
          rationale: String(a.rationale || ''),
          migrationEffort: ['low', 'medium', 'high'].includes(a.migrationEffort) ? a.migrationEffort : 'medium',
          estimatedCostDelta: String(a.estimatedCostDelta || 'unknown'),
        }))
      : [],
    recommendation: String(parsed.recommendation || ''),
    durationMs: Date.now() - start,
  };
}
