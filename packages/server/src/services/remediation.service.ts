import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';
import { runCypher, serializeNeo4jProperties } from '../config/neo4j';
import { Standard } from '../models/Standard';
import { StandardMapping } from '../models/StandardMapping';
import { RemediationProposal, IRemediationProposal } from '../models/RemediationProposal';
import { buildProjectContext, buildStandardContext } from './ai.service';
import { runAdvisorScan } from './advisor.service';
import { validateProposal } from './remediation-validator.service';
import {
  ARCHIMATE_STANDARD_TYPES,
  ARCHIMATE_STANDARD_CONNECTION_TYPES,
  ELEMENT_TYPES,
} from '@thearchitect/shared';
import type {
  RemediationContext,
  RemediationStreamEvent,
  ProposalElement,
  ProposalConnection,
} from '@thearchitect/shared';

// ─── Provider Detection (same pattern as ai.service) ───

type Provider = 'openai' | 'anthropic' | 'none';

function detectProvider(): Provider {
  if (process.env.OPENAI_API_KEY) return 'openai';
  if (process.env.ANTHROPIC_API_KEY) return 'anthropic';
  return 'none';
}

// ─── Concurrency Limiter ───

let activeLLMCalls = 0;
const MAX_CONCURRENT = 5;

// ─── Main Entry Point ───

export async function generateRemediation(
  projectId: string,
  userId: string,
  context: RemediationContext,
  onEvent: (event: RemediationStreamEvent) => void,
): Promise<IRemediationProposal> {
  const provider = detectProvider();
  if (provider === 'none') {
    throw new Error('No AI API key configured (OPENAI_API_KEY or ANTHROPIC_API_KEY)');
  }

  if (activeLLMCalls >= MAX_CONCURRENT) {
    throw new Error('Too many concurrent remediation generations. Please try again shortly.');
  }

  // Create draft proposal in MongoDB
  const proposal = await RemediationProposal.create({
    projectId,
    source: context.source,
    sourceRef: buildSourceRef(context),
    title: 'Generating...',
    description: '',
    elements: [],
    connections: [],
    status: 'draft',
    confidence: 0,
    createdBy: userId,
  });

  onEvent({ type: 'generation_start', proposalId: proposal._id.toString() });
  onEvent({ type: 'progress', message: 'Building architecture context...', percent: 10 });

  // Build contexts
  const architectureContext = await buildProjectContext(projectId);
  onEvent({ type: 'progress', message: 'Building gap context...', percent: 20 });

  const gapContext = await buildGapContext(projectId, context);
  onEvent({ type: 'progress', message: 'Generating remediation proposals...', percent: 30 });

  const systemPrompt = buildRemediationSystemPrompt(architectureContext, gapContext);

  // Call LLM
  activeLLMCalls++;
  let fullResponse = '';

  try {
    const collect = (text: string) => { fullResponse += text; };
    const noop = () => {};

    if (provider === 'openai') {
      await streamOpenAI(systemPrompt, collect, noop);
    } else {
      await streamAnthropic(systemPrompt, collect, noop);
    }
  } catch (err) {
    // Fallback
    if (provider === 'openai' && process.env.ANTHROPIC_API_KEY) {
      fullResponse = '';
      await streamAnthropic(systemPrompt, (t) => { fullResponse += t; }, () => {});
    } else {
      proposal.status = 'rejected';
      await proposal.save();
      throw err;
    }
  } finally {
    activeLLMCalls--;
  }

  onEvent({ type: 'progress', message: 'Parsing LLM response...', percent: 70 });

  // Parse JSON from LLM response
  const parsed = parseProposalJSON(fullResponse);
  if (!parsed) {
    proposal.status = 'rejected';
    proposal.description = 'Failed to parse LLM response';
    await proposal.save();
    onEvent({ type: 'error', message: 'Failed to parse AI response. Please try again.' });
    throw new Error('Failed to parse remediation proposal from LLM response');
  }

  // Update proposal with parsed data
  proposal.title = parsed.title || 'Remediation Proposal';
  proposal.description = parsed.description || '';
  proposal.elements = parsed.elements;
  proposal.connections = parsed.connections;
  proposal.confidence = calculateAggregateConfidence(parsed.elements, parsed.connections);

  // Validate
  onEvent({ type: 'validation_start' });
  onEvent({ type: 'progress', message: 'Validating proposals...', percent: 80 });

  const validation = await validateProposal(projectId, {
    elements: parsed.elements,
    connections: parsed.connections,
  }, context.source === 'compliance' && 'standardId' in context ? context.standardId : undefined);

  proposal.validation = validation as any;
  proposal.status = validation.overallValid ? 'validated' : 'draft';

  // Filter out invalid elements/connections
  if (!validation.overallValid) {
    const validElementTempIds = new Set(
      validation.elementResults.filter((r) => r.valid).map((r) => r.tempId),
    );
    const validConnectionTempIds = new Set(
      validation.connectionResults.filter((r) => r.valid).map((r) => r.tempId),
    );
    // Keep only valid items
    proposal.elements = parsed.elements.filter((e) => validElementTempIds.has(e.tempId));
    proposal.connections = parsed.connections.filter((c) => validConnectionTempIds.has(c.tempId));
    proposal.confidence = calculateAggregateConfidence(proposal.elements as any, proposal.connections as any);
    // If anything remained, mark as validated
    if (proposal.elements.length > 0) {
      proposal.status = 'validated';
    }
  }

  await proposal.save();

  onEvent({ type: 'validation_result', result: validation });
  onEvent({ type: 'progress', message: 'Done!', percent: 100 });
  onEvent({
    type: 'complete',
    proposal: {
      id: proposal._id.toString(),
      projectId: proposal.projectId.toString(),
      source: proposal.source,
      sourceRef: proposal.sourceRef as any,
      title: proposal.title,
      description: proposal.description,
      elements: proposal.elements as any,
      connections: proposal.connections as any,
      validation,
      status: proposal.status,
      confidence: proposal.confidence,
      createdBy: proposal.createdBy.toString(),
      appliedElementIds: proposal.appliedElementIds,
      appliedConnectionIds: proposal.appliedConnectionIds,
      createdAt: proposal.createdAt.toISOString(),
      updatedAt: proposal.updatedAt.toISOString(),
    },
  });

  return proposal;
}

// ─── Source Reference Builder ───

function buildSourceRef(context: RemediationContext) {
  switch (context.source) {
    case 'compliance':
      return { standardId: context.standardId, sectionIds: context.gapSectionIds };
    case 'advisor':
      return { insightIds: context.insightIds };
    case 'manual':
      return {};
  }
}

// ─── Gap Context Builders ───

async function buildGapContext(projectId: string, context: RemediationContext): Promise<string> {
  switch (context.source) {
    case 'compliance':
      return buildComplianceGapContext(projectId, context.standardId, context.gapSectionIds);
    case 'advisor':
      return buildAdvisorGapContext(projectId, context.insightIds);
    case 'manual':
      return `## Manual Request\n${context.prompt}`;
  }
}

async function buildComplianceGapContext(
  projectId: string,
  standardId: string,
  gapSectionIds: string[],
): Promise<string> {
  const standard = await Standard.findById(standardId);
  if (!standard) return '## No standard found';

  // Get gap mappings for specified sections
  const gapMappings = await StandardMapping.find({
    projectId,
    standardId,
    sectionId: { $in: gapSectionIds },
    status: 'gap',
  });

  const lines: string[] = [];
  lines.push(`## Compliance Gaps from: ${standard.name} (${standard.version})`);
  lines.push(`Total gap sections to remediate: ${gapSectionIds.length}`);

  for (const sectionId of gapSectionIds) {
    const section = standard.sections.find((s) => s.id === sectionId);
    if (!section) continue;

    const sectionMappings = gapMappings.filter((m) => m.sectionId === sectionId);
    lines.push(`\n### Gap: ${section.number} ${section.title}`);
    lines.push(`Content: ${section.content.slice(0, 500)}`);

    if (sectionMappings.length > 0) {
      for (const m of sectionMappings) {
        if (m.suggestedNewElement) {
          lines.push(`  Existing suggestion: "${m.suggestedNewElement.name}" (${m.suggestedNewElement.type}, ${m.suggestedNewElement.layer})`);
        }
        if (m.notes) {
          lines.push(`  Notes: ${m.notes}`);
        }
      }
    }
  }

  return lines.join('\n');
}

async function buildAdvisorGapContext(
  projectId: string,
  insightIds: string[],
): Promise<string> {
  const scan = await runAdvisorScan(projectId);
  const insights = scan.insights.filter((i) => insightIds.includes(i.id));

  if (insights.length === 0) {
    return '## No matching advisor insights found';
  }

  const lines: string[] = [];
  lines.push(`## Advisor Insights to Remediate`);
  lines.push(`Health Score: ${scan.healthScore.total}/100`);

  for (const insight of insights) {
    lines.push(`\n### [${insight.severity.toUpperCase()}] ${insight.title}`);
    lines.push(`Category: ${insight.category}`);
    lines.push(`Description: ${insight.description}`);
    if (insight.affectedElements.length > 0) {
      lines.push(`Affected elements:`);
      for (const el of insight.affectedElements) {
        lines.push(`  - "${el.name}" (${el.type}, ${el.layer})`);
      }
    }
    if (insight.recommendation) {
      lines.push(`Recommendation: ${insight.recommendation}`);
    }
    if (insight.steps && insight.steps.length > 0) {
      lines.push(`Steps: ${insight.steps.join(' → ')}`);
    }
  }

  return lines.join('\n');
}

// ─── System Prompt with Whitelist Injection ───

function buildRemediationSystemPrompt(architectureContext: string, gapContext: string): string {
  // Build whitelist strings
  const validElementTypes = [...ARCHIMATE_STANDARD_TYPES].join(', ');
  const validConnectionTypes = [...ARCHIMATE_STANDARD_CONNECTION_TYPES].join(', ');

  // Build element type to layer/domain mapping for LLM guidance
  const typeGuidance = ELEMENT_TYPES
    .filter((et) => ARCHIMATE_STANDARD_TYPES.has(et.type))
    .map((et) => `  "${et.type}" → domain: ${et.domain}`)
    .join('\n');

  return `You are TheArchitect Remediation Engine. Your job is to generate concrete, ArchiMate 3.2-compliant architecture proposals to close detected gaps.

## CRITICAL RULES
1. You MUST only use element types from this WHITELIST:
   [${validElementTypes}]
   ANY other type will be rejected by the validation layer.

2. You MUST only use connection types from this WHITELIST:
   [${validConnectionTypes}]
   ANY other type will be rejected.

3. Every proposed element MUST include:
   - A unique tempId (format: "temp-001", "temp-002", etc.)
   - A descriptive name following enterprise naming conventions
   - The correct ArchiMate type from the whitelist
   - The correct layer (motivation|strategy|business|information|application|technology|physical|implementation_migration)
   - A togafDomain (business|data|application|technology|motivation|implementation|strategy)
   - A confidence score (0.0-1.0) indicating how certain you are this element is needed
   - A sectionReference if derived from a standard (e.g., "§6.4.2")
   - A brief reasoning explaining WHY this element is needed

4. Every proposed connection MUST include:
   - A unique tempId (format: "conn-001", "conn-002", etc.)
   - sourceTempId and targetTempId (referencing proposal tempIds OR existing element names prefixed with "existing:")
   - A valid ArchiMate connection type from the whitelist
   - A confidence score and reasoning

5. Maximum 25 elements and 30 connections per proposal.

## Type-to-Domain Mapping
${typeGuidance}

## Layer Hierarchy (top to bottom)
motivation (Y=16) → strategy (Y=12) → business (Y=8) → information (Y=4) → application (Y=0) → technology (Y=-4) → physical (Y=-8) → implementation_migration (Y=-12)

## Connection Rules
- "serving": lower layer serves upper layer (technology→application, application→business)
- "realization": lower layer realizes upper layer
- "composition"/"aggregation": within same layer only
- "flow": data/control flow, typically within same or adjacent layers
- "triggering": event-driven, typically within same layer
- "assignment": active structure to behavioral element
- "association": general, any direction

--- CURRENT PROJECT ARCHITECTURE ---
${architectureContext}
--- END ARCHITECTURE ---

--- GAPS TO REMEDIATE ---
${gapContext}
--- END GAPS ---

## Output Format
Respond with ONLY a JSON object (no markdown, no explanation, no code blocks). Structure:
{
  "title": "Brief title for this remediation (e.g., 'ISO 27001 Security Controls')",
  "description": "1-2 sentence summary of what this remediation addresses",
  "elements": [
    {
      "tempId": "temp-001",
      "name": "Element Name",
      "type": "application_component",
      "layer": "application",
      "togafDomain": "application",
      "description": "What this element does",
      "status": "target",
      "riskLevel": "low",
      "maturityLevel": 1,
      "confidence": 0.85,
      "sectionReference": "§6.4.2",
      "reasoning": "Why this element is needed"
    }
  ],
  "connections": [
    {
      "tempId": "conn-001",
      "sourceTempId": "temp-001",
      "targetTempId": "existing:Customer Data Store",
      "type": "serving",
      "label": "provides data classification",
      "confidence": 0.8,
      "reasoning": "Why this connection is needed"
    }
  ]
}

Generate proposals that directly close the identified gaps. Be specific and actionable.`;
}

// ─── LLM Streaming (from ai.service pattern) ───

type OnChunk = (text: string) => void;
type OnDone = () => void;

async function streamOpenAI(
  systemPrompt: string,
  onChunk: OnChunk,
  onDone: OnDone,
): Promise<void> {
  const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
    baseURL: process.env.OPENAI_BASE_URL || undefined,
  });

  const stream = await openai.chat.completions.create({
    model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: 'Generate the remediation proposal as JSON.' },
    ],
    stream: true,
    max_tokens: 4096,
    temperature: 0.4,
  });

  for await (const chunk of stream) {
    const text = chunk.choices[0]?.delta?.content;
    if (text) onChunk(text);
  }
  onDone();
}

async function streamAnthropic(
  systemPrompt: string,
  onChunk: OnChunk,
  onDone: OnDone,
): Promise<void> {
  const anthropic = new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY,
  });

  const stream = anthropic.messages.stream({
    model: process.env.ANTHROPIC_MODEL || 'claude-haiku-4-5-20251001',
    system: systemPrompt,
    messages: [{ role: 'user', content: 'Generate the remediation proposal as JSON.' }],
    max_tokens: 4096,
  });

  for await (const event of stream) {
    if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
      onChunk(event.delta.text);
    }
  }
  onDone();
}

// ─── JSON Parsing ───

interface ParsedProposal {
  title: string;
  description: string;
  elements: ProposalElement[];
  connections: ProposalConnection[];
}

function parseProposalJSON(response: string): ParsedProposal | null {
  try {
    // Clean markdown code blocks if present
    const cleaned = response.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();

    // Try to extract JSON object
    const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;

    const parsed = JSON.parse(jsonMatch[0]);

    if (!parsed.elements || !Array.isArray(parsed.elements)) return null;

    // Normalize elements
    const elements: ProposalElement[] = parsed.elements.slice(0, 25).map((e: any, i: number) => ({
      tempId: e.tempId || `temp-${String(i + 1).padStart(3, '0')}`,
      name: String(e.name || '').trim(),
      type: String(e.type || '').trim(),
      layer: String(e.layer || 'application').trim(),
      togafDomain: String(e.togafDomain || e.domain || 'application').trim(),
      description: String(e.description || '').trim(),
      status: e.status || 'target',
      riskLevel: e.riskLevel || 'low',
      maturityLevel: Number(e.maturityLevel) || 1,
      confidence: Math.max(0, Math.min(1, Number(e.confidence) || 0.5)),
      sectionReference: e.sectionReference || undefined,
      reasoning: String(e.reasoning || '').trim(),
    }));

    // Normalize connections
    const connections: ProposalConnection[] = (parsed.connections || []).slice(0, 30).map((c: any, i: number) => ({
      tempId: c.tempId || `conn-${String(i + 1).padStart(3, '0')}`,
      sourceTempId: String(c.sourceTempId || '').trim(),
      targetTempId: String(c.targetTempId || '').trim(),
      type: String(c.type || 'association').trim(),
      label: c.label || undefined,
      confidence: Math.max(0, Math.min(1, Number(c.confidence) || 0.5)),
      reasoning: String(c.reasoning || '').trim(),
    }));

    return {
      title: String(parsed.title || 'Remediation Proposal').trim(),
      description: String(parsed.description || '').trim(),
      elements,
      connections,
    };
  } catch (err) {
    console.warn('[Remediation] Failed to parse LLM response:', (err as Error).message);
    return null;
  }
}

// ─── Helpers ───

function calculateAggregateConfidence(
  elements: ProposalElement[],
  connections: ProposalConnection[],
): number {
  const allConfidences = [
    ...elements.map((e) => e.confidence),
    ...connections.map((c) => c.confidence),
  ];
  if (allConfidences.length === 0) return 0;
  const avg = allConfidences.reduce((sum, c) => sum + c, 0) / allConfidences.length;
  return Math.round(avg * 100) / 100;
}
