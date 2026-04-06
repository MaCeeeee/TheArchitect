// ─── AI Scenario Generator: Oracle Verdict → Alternative Scenarios ───

import {
  detectProvider,
  callOpenAISync,
  callAnthropicSync,
  fetchAffectedElementDetails,
  type Provider,
  type AffectedElementDetail,
} from './oracle.service';
import { assessAcceptanceRisk } from './oracle.service';
import { createScenario } from './scenario.service';
import type {
  OracleProposal,
  OracleVerdict,
  AgentVerdict,
  ResistanceFactor,
  OracleFatigueForecast,
} from '@thearchitect/shared/src/types/oracle.types';
import type { ScenarioDelta } from '@thearchitect/shared/src/types/scenario.types';
import type {
  AlternativeSpec,
  AlternativeElementChange,
  GeneratorOptions,
  GeneratorResult,
  GeneratedAlternative,
  RequirementDiff,
  ScopeChange,
  AddressedBlocker,
  NumericDelta,
} from '@thearchitect/shared/src/types/scenario-generator.types';

// ─── Main Entry Point ───

export async function generateAlternatives(
  projectId: string,
  assessment: {
    _id: string;
    proposal: OracleProposal;
    verdict: OracleVerdict;
  },
  options: GeneratorOptions = {},
): Promise<GeneratorResult> {
  const start = Date.now();
  const provider = detectProvider();
  if (provider === 'none') throw new Error('NO_AI_KEY');

  const maxAlts = Math.min(options.maxAlternatives || 3, 5);
  const proposal = assessment.proposal;
  const verdict = assessment.verdict;

  // Fetch element details for enriched prompting
  const affectedDetails = await fetchAffectedElementDetails(
    projectId,
    proposal.affectedElementIds,
  );

  // Build prompt and call LLM
  const prompt = buildGenerationPrompt(proposal, verdict, affectedDetails, options, maxAlts);
  const userMessage = 'Generate the alternative architecture proposals as specified. Return ONLY the JSON array.';

  let raw = '';
  if (provider === 'openai') {
    raw = await callOpenAISync(prompt, userMessage, 2000);
  } else {
    raw = await callAnthropicSync(prompt, userMessage, 2000);
  }

  const llmDurationMs = Date.now() - start;

  // Parse LLM response
  const specs = parseAlternativeSpecs(raw, maxAlts);

  // Create scenarios and build requirement diffs in parallel
  const alternatives: GeneratedAlternative[] = await Promise.all(
    specs.map(async (spec) => {
      // Synthesize deltas from element changes
      const deltas = synthesizeDeltas(spec.elementChanges, affectedDetails);

      // Create scenario in DB (auto-computes cost profile)
      const scenarioName = `[Oracle Alt] ${spec.name}`;
      const scenarioDesc = `${spec.rationale}\n\nGenerated from Oracle assessment ${assessment._id}`;
      const scenario = await createScenario(projectId, scenarioName, scenarioDesc, deltas);

      // Build requirement diff
      const requirementDiff = buildRequirementDiff(
        proposal, verdict, spec, affectedDetails,
      );

      const alt: GeneratedAlternative = {
        scenarioId: String(scenario._id),
        name: spec.name,
        strategy: spec.strategy,
        addressedResistance: spec.addressedResistance,
        adjustedCost: spec.adjustedCost,
        adjustedDuration: spec.adjustedDuration,
        rationale: spec.rationale,
        requirementDiff,
      };

      // Auto-assess if requested
      if (options.autoAssess) {
        try {
          const altProposal: OracleProposal = {
            title: spec.name,
            description: `${spec.strategy}\n\n${spec.rationale}`,
            affectedElementIds: spec.elementChanges
              .filter((c) => c.action !== 'remove')
              .map((c) => c.elementId),
            changeType: spec.changeType,
            estimatedCost: spec.adjustedCost,
            estimatedDuration: spec.adjustedDuration,
            targetScenarioId: String(scenario._id),
          };

          const altVerdict = await assessAcceptanceRisk(projectId, altProposal);
          alt.oracleAssessment = {
            assessmentId: `auto-${Date.now()}`,
            acceptanceRiskScore: altVerdict.acceptanceRiskScore,
            riskLevel: altVerdict.riskLevel,
            overallPosition: altVerdict.overallPosition,
            deltaFromOriginal: verdict.acceptanceRiskScore - altVerdict.acceptanceRiskScore,
          };
        } catch {
          // Non-critical — alternative still valid without re-assessment
        }
      }

      return alt;
    }),
  );

  return {
    sourceAssessmentId: String(assessment._id),
    alternatives,
    generationTrace: {
      provider,
      model: provider === 'openai'
        ? (process.env.OPENAI_MODEL || 'gpt-4o-mini')
        : (process.env.ANTHROPIC_MODEL || 'claude-haiku-4-5-20251001'),
      durationMs: Date.now() - start,
    },
  };
}

// ─── Prompt Construction ───

function buildGenerationPrompt(
  proposal: OracleProposal,
  verdict: OracleVerdict,
  affectedDetails: AffectedElementDetail[],
  options: GeneratorOptions,
  maxAlts: number,
): string {
  const verdicts = verdict.agentVerdicts;
  const factors = verdict.resistanceFactors;
  const fatigue = verdict.fatigueForecast;
  const mitigations = verdict.mitigationSuggestions;

  const positionContext = verdict.overallPosition === 'likely_accepted'
    ? 'The original proposal was ACCEPTED. Generate alternatives that OPTIMIZE further — reduce cost, shorten timeline, or reduce scope while maintaining the strategic benefit.'
    : verdict.overallPosition === 'likely_rejected'
      ? 'The original proposal was REJECTED. Generate alternatives that fundamentally restructure the approach to overcome stakeholder resistance.'
      : 'The original proposal is CONTESTED. Generate alternatives that specifically address the strongest blockers while preserving the core intent.';

  const focusFilter = options.focusStakeholders?.length
    ? `\nFOCUS: Only address concerns from these stakeholders: ${options.focusStakeholders.join(', ')}`
    : '';

  const changeTypeConstraint = options.preserveChangeType
    ? `\nCONSTRAINT: All alternatives MUST use changeType "${proposal.changeType}".`
    : '\nAlternatives MAY use a different changeType if strategically justified.';

  return `You are an Enterprise Architecture strategist. Given an Oracle Acceptance Risk Assessment verdict, generate ${maxAlts} alternative architecture proposals that address stakeholder resistance.

## Original Proposal
- **Title:** ${proposal.title}
- **Change Type:** ${proposal.changeType}
- **Description:** ${proposal.description}
- **Estimated Cost:** $${(proposal.estimatedCost || 0).toLocaleString()}
- **Estimated Duration:** ${proposal.estimatedDuration || 'unknown'} months
- **Affected Elements:** ${proposal.affectedElementIds.length}

## Oracle Verdict
- **Acceptance Risk Score:** ${verdict.acceptanceRiskScore}/100
- **Risk Level:** ${verdict.riskLevel}
- **Overall Position:** ${verdict.overallPosition}

${positionContext}

## Stakeholder Verdicts
${verdicts.map((v) =>
    `- **${v.personaName}** (${v.stakeholderType}): ${v.position} — score ${v.acceptanceScore}/100
  Reasoning: ${v.reasoning}
  Concerns: ${v.concerns.join('; ')}`,
  ).join('\n')}

## Top Resistance Factors
${factors.map((f) => `- [${f.severity}] ${f.factor} (from ${f.source}): ${f.description}`).join('\n')}

## Fatigue Forecast
- Projected delay: ${fatigue.projectedDelayMonths} months
- Budget at risk: $${fatigue.budgetAtRisk.toLocaleString()}
- Overloaded stakeholders: ${fatigue.overloadedStakeholders.join(', ') || 'none'}

## Already-Suggested Mitigations (avoid duplicating these)
${mitigations.map((m) => `- ${m}`).join('\n')}

## Affected Element Details
${affectedDetails.map((d) =>
    `- ID="${d.id}" name="${d.name}" [${d.type}, ${d.layer}] — cost=$${d.annualCost.toLocaleString()}, maturity=${d.maturityLevel}/5, risk=${d.riskLevel}, deps=${d.dependencyCount}↗${d.dependentCount}↙, users=${d.userCount}`,
  ).join('\n')}
${focusFilter}${changeTypeConstraint}

## Instructions

Generate exactly ${maxAlts} DISTINCT alternatives. Each alternative must:
1. **Address** at least 1-2 of the top resistance factors
2. **Preserve** the core strategic intent of the original proposal
3. **Specify** which elements to remove, phase out, retain, or modify
4. **State** adjusted cost and duration estimates
5. **List** concrete trade-offs (what is lost or weakened)
6. Use the EXACT full element IDs from the affected elements list above — copy-paste them character-for-character (e.g. "csv-1775415356867-ci0vkpy"). NEVER abbreviate or shorten IDs.

## Output Format (STRICT JSON — no markdown, no explanation)
[
  {
    "name": "Short descriptive name (max 60 chars)",
    "strategy": "1-2 sentence strategic summary",
    "changeType": "retire|migrate|consolidate|introduce|modify",
    "addressedResistance": ["factor text 1", "factor text 2"],
    "elementChanges": [
      { "elementId": "csv-1775415356867-ci0vkpy", "action": "remove|phase_out|retain|modify|add", "field": "status|transformationStrategy", "newValue": "current|transitional|target|retired|retain|rehost|replatform|refactor", "reason": "why this change" }
    ],
    "adjustedCost": 85000,
    "adjustedDuration": 3,
    "rationale": "2-3 sentences: why this alternative is better for the blocking stakeholders",
    "tradeOffs": ["trade-off 1", "trade-off 2"]
  }
]`;
}

// ─── Parse LLM Response ───

function parseAlternativeSpecs(raw: string, maxAlts: number): AlternativeSpec[] {
  const match = raw.match(/\[[\s\S]*\]/);
  if (!match) return [];

  try {
    const parsed = JSON.parse(match[0]);
    if (!Array.isArray(parsed)) return [];

    return parsed.slice(0, maxAlts).map((item: Record<string, unknown>) => ({
      name: String(item.name || 'Unnamed Alternative').slice(0, 60),
      strategy: String(item.strategy || ''),
      changeType: validateChangeType(String(item.changeType || 'modify')),
      addressedResistance: Array.isArray(item.addressedResistance)
        ? item.addressedResistance.map(String)
        : [],
      elementChanges: parseElementChanges(item.elementChanges),
      adjustedCost: Math.max(0, Number(item.adjustedCost) || 0),
      adjustedDuration: Math.max(1, Number(item.adjustedDuration) || 1),
      rationale: String(item.rationale || ''),
      tradeOffs: Array.isArray(item.tradeOffs)
        ? item.tradeOffs.map(String)
        : [],
    }));
  } catch {
    return [];
  }
}

function validateChangeType(ct: string): OracleProposal['changeType'] {
  const valid = ['retire', 'migrate', 'consolidate', 'introduce', 'modify'] as const;
  return valid.includes(ct as typeof valid[number]) ? ct as typeof valid[number] : 'modify';
}

function parseElementChanges(raw: unknown): AlternativeElementChange[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((c): c is Record<string, unknown> => typeof c === 'object' && c !== null)
    .map((c) => ({
      elementId: String(c.elementId || ''),
      action: validateAction(String(c.action || 'retain')),
      field: c.field ? String(c.field) : undefined,
      newValue: c.newValue ? String(c.newValue) : undefined,
      reason: String(c.reason || ''),
    }))
    .filter((c) => c.elementId.length > 0);
}

function validateAction(a: string): AlternativeElementChange['action'] {
  const valid = ['remove', 'phase_out', 'retain', 'modify', 'add'] as const;
  return valid.includes(a as typeof valid[number]) ? a as typeof valid[number] : 'retain';
}

// ─── Synthesize ScenarioDeltas from element changes ───

function synthesizeDeltas(
  changes: AlternativeElementChange[],
  affectedDetails: AffectedElementDetail[],
): ScenarioDelta[] {
  const detailMap = new Map(affectedDetails.map((d) => [d.id, d]));
  const deltas: ScenarioDelta[] = [];

  for (const change of changes) {
    const detail = detailMap.get(change.elementId);
    if (!detail) continue;

    switch (change.action) {
      case 'remove':
        deltas.push({
          elementId: change.elementId,
          field: 'status',
          baselineValue: detail.status,
          scenarioValue: 'retired',
        });
        break;
      case 'phase_out':
        deltas.push({
          elementId: change.elementId,
          field: 'status',
          baselineValue: detail.status,
          scenarioValue: 'transitional',
        });
        break;
      case 'modify':
        if (change.field && change.newValue) {
          deltas.push({
            elementId: change.elementId,
            field: change.field,
            baselineValue: (detail as unknown as Record<string, unknown>)[change.field] ?? detail.status,
            scenarioValue: change.newValue,
          });
        }
        break;
      case 'retain':
        // No delta needed — element stays as-is
        break;
      case 'add':
        deltas.push({
          elementId: change.elementId,
          field: 'status',
          baselineValue: 'none',
          scenarioValue: 'target',
        });
        break;
    }
  }

  return deltas;
}

// ─── Build RequirementDiff ───

function buildRequirementDiff(
  original: OracleProposal,
  verdict: OracleVerdict,
  spec: AlternativeSpec,
  affectedDetails: AffectedElementDetail[],
): RequirementDiff {
  const detailMap = new Map(affectedDetails.map((d) => [d.id, d]));

  // Scope changes
  const originalIds = new Set(original.affectedElementIds);
  const altIds = new Set(spec.elementChanges.map((c) => c.elementId));

  const scopeChanges: ScopeChange[] = [];

  for (const change of spec.elementChanges) {
    const detail = detailMap.get(change.elementId);
    const name = detail?.name || change.elementId;

    if (change.action === 'remove') {
      scopeChanges.push({
        type: 'removed',
        description: `${name} removed from scope`,
        elementId: change.elementId,
        elementName: name,
        reason: change.reason,
      });
    } else if (change.action === 'phase_out') {
      scopeChanges.push({
        type: 'phased',
        description: `${name} deferred to later phase`,
        elementId: change.elementId,
        elementName: name,
        reason: change.reason,
      });
    } else if (change.action === 'retain') {
      scopeChanges.push({
        type: 'retained',
        description: `${name} kept as-is`,
        elementId: change.elementId,
        elementName: name,
        reason: change.reason,
      });
    } else if (change.action === 'modify') {
      scopeChanges.push({
        type: 'modified',
        description: `${name}: ${change.field} → ${change.newValue}`,
        elementId: change.elementId,
        elementName: name,
        reason: change.reason,
      });
    } else if (change.action === 'add' && !originalIds.has(change.elementId)) {
      scopeChanges.push({
        type: 'added',
        description: `${name} added to scope`,
        elementId: change.elementId,
        elementName: name,
        reason: change.reason,
      });
    }
  }

  // Numeric deltas
  const origCost = original.estimatedCost || 0;
  const origDuration = original.estimatedDuration || 0;

  const costDelta: NumericDelta = {
    original: origCost,
    alternative: spec.adjustedCost,
    delta: spec.adjustedCost - origCost,
    deltaPercent: origCost > 0 ? Math.round(((spec.adjustedCost - origCost) / origCost) * 100) : 0,
  };

  const durationDelta: NumericDelta = {
    original: origDuration,
    alternative: spec.adjustedDuration,
    delta: spec.adjustedDuration - origDuration,
    deltaPercent: origDuration > 0 ? Math.round(((spec.adjustedDuration - origDuration) / origDuration) * 100) : 0,
  };

  // Addressed blockers
  const addressedBlockers: AddressedBlocker[] = [];
  for (const factor of verdict.resistanceFactors) {
    const isAddressed = spec.addressedResistance.some((ar) =>
      factor.factor.toLowerCase().includes(ar.toLowerCase()) ||
      ar.toLowerCase().includes(factor.factor.toLowerCase()),
    );
    if (isAddressed) {
      const agentVerdict = verdict.agentVerdicts.find((v) => v.personaName === factor.source);
      addressedBlockers.push({
        stakeholder: factor.source,
        originalScore: agentVerdict?.acceptanceScore || 0,
        originalPosition: agentVerdict?.position || 'abstain',
        resistanceFactor: factor.factor,
        mitigation: spec.rationale,
      });
    }
  }

  return {
    scopeChanges,
    costDelta,
    durationDelta,
    changeTypeDelta: {
      original: original.changeType,
      alternative: spec.changeType,
      changed: original.changeType !== spec.changeType,
    },
    addressedBlockers,
    tradeOffs: spec.tradeOffs,
  };
}
