import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';
import { runCypher, serializeNeo4jProperties } from '../config/neo4j';
import { Standard } from '../models/Standard';
import { StandardMapping } from '../models/StandardMapping';
import { Policy } from '../models/Policy';
import { runAdvisorScan } from './advisor.service';
import type { PolicyDraft, AdvisorInsight } from '@thearchitect/shared';

// ─── Provider Detection ───

type Provider = 'openai' | 'anthropic' | 'none';

function detectProvider(): Provider {
  if (process.env.OPENAI_API_KEY) return 'openai';
  if (process.env.ANTHROPIC_API_KEY) return 'anthropic';
  return 'none';
}

// ─── Context Builder ───

interface ElementSummary {
  name: string;
  type: string;
  layer: string;
  status: string;
  riskLevel: string;
  maturityLevel: number;
  description: string;
}

interface ConnectionSummary {
  sourceName: string;
  targetName: string;
  type: string;
  label: string;
}

export async function buildProjectContext(projectId: string): Promise<string> {
  // Query elements
  const elementRecords = await runCypher(
    `MATCH (e:ArchitectureElement {projectId: $projectId})
     RETURN e.id as id, e.name as name, e.type as type, e.layer as layer,
            e.status as status, e.riskLevel as riskLevel,
            e.maturityLevel as maturityLevel, e.description as description
     ORDER BY e.layer, e.name
     LIMIT 150`,
    { projectId },
  );

  const elements: ElementSummary[] = elementRecords.map((r) => {
    const props = serializeNeo4jProperties(r.toObject());
    return {
      name: String(props.name || ''),
      type: String(props.type || ''),
      layer: String(props.layer || ''),
      status: String(props.status || ''),
      riskLevel: String(props.riskLevel || ''),
      maturityLevel: Number(props.maturityLevel) || 0,
      description: String(props.description || '').slice(0, 80),
    };
  });

  // Query connections with resolved names
  const connRecords = await runCypher(
    `MATCH (a:ArchitectureElement {projectId: $projectId})-[r:CONNECTS_TO]->(b:ArchitectureElement {projectId: $projectId})
     RETURN a.name as sourceName, b.name as targetName, r.type as type, r.label as label
     LIMIT 200`,
    { projectId },
  );

  const connections: ConnectionSummary[] = connRecords.map((r) => {
    const props = serializeNeo4jProperties(r.toObject());
    return {
      sourceName: String(props.sourceName || ''),
      targetName: String(props.targetName || ''),
      type: String(props.type || ''),
      label: String(props.label || ''),
    };
  });

  // Group elements by layer
  const byLayer: Record<string, ElementSummary[]> = {};
  for (const el of elements) {
    const layer = el.layer || 'unknown';
    if (!byLayer[layer]) byLayer[layer] = [];
    byLayer[layer].push(el);
  }

  // Build text
  const lines: string[] = [];
  lines.push(`## Architecture Elements (${elements.length} total)`);

  const layerOrder = ['motivation', 'strategy', 'business', 'information', 'application', 'technology', 'physical', 'implementation_migration'];
  for (const layer of layerOrder) {
    const layerEls = byLayer[layer];
    if (!layerEls || layerEls.length === 0) continue;
    lines.push(`### ${layer.charAt(0).toUpperCase() + layer.slice(1)} Layer (${layerEls.length})`);
    for (const el of layerEls) {
      lines.push(`- "${el.name}" [${el.type}] status=${el.status}, risk=${el.riskLevel}, maturity=${el.maturityLevel}${el.description ? ` — ${el.description}` : ''}`);
    }
  }

  if (connections.length > 0) {
    lines.push(`\n## Connections (${connections.length} total)`);
    for (const c of connections) {
      lines.push(`- "${c.sourceName}" --[${c.type}]--> "${c.targetName}"${c.label ? ` (${c.label})` : ''}`);
    }
  }

  // Statistics
  const stats: string[] = [];
  const layerCounts = layerOrder.map((l) => `${l}=${byLayer[l]?.length || 0}`).join(', ');
  stats.push(`Elements by layer: ${layerCounts}`);

  const connectedIds = new Set<string>();
  // Get connected element names for orphan detection
  for (const c of connections) {
    connectedIds.add(c.sourceName);
    connectedIds.add(c.targetName);
  }
  const orphaned = elements.filter((e) => !connectedIds.has(e.name)).length;
  if (orphaned > 0) stats.push(`Isolated elements (no connections): ${orphaned}`);

  const highRisk = elements.filter((e) => e.riskLevel === 'high' || e.riskLevel === 'critical').length;
  if (highRisk > 0) stats.push(`High/critical risk elements: ${highRisk}`);

  const lowMaturity = elements.filter((e) => e.maturityLevel <= 2 && e.maturityLevel > 0).length;
  if (lowMaturity > 0) stats.push(`Low maturity elements (≤2): ${lowMaturity}`);

  if (stats.length > 0) {
    lines.push(`\n## Statistics`);
    lines.push(stats.join('\n'));
  }

  if (elements.length === 0) {
    lines.push('\n## Note: This project is empty — no architecture elements exist yet.');
  }

  return lines.join('\n');
}

// ─── Advisor Context Builder ───

async function buildAdvisorContext(projectId: string): Promise<string> {
  try {
    const scan = await runAdvisorScan(projectId);
    if (scan.insights.length === 0 && scan.totalElements === 0) return '';

    const lines: string[] = [];
    lines.push(`## Automated Architecture Analysis (${scan.totalElements} elements scanned)`);

    // Health Score
    const hs = scan.healthScore;
    lines.push(`\n### Health Score: ${hs.total}/100 (trend: ${hs.trend})`);
    for (const f of hs.factors) {
      lines.push(`- ${f.factor} (${Math.round(f.weight * 100)}%): ${f.score}/100 — ${f.description}`);
    }

    // Insights grouped by severity
    if (scan.insights.length > 0) {
      lines.push(`\n### Detected Issues (${scan.insights.length} findings)`);

      const bySeverity: Record<string, AdvisorInsight[]> = {};
      for (const insight of scan.insights) {
        if (!bySeverity[insight.severity]) bySeverity[insight.severity] = [];
        bySeverity[insight.severity].push(insight);
      }

      for (const severity of ['critical', 'high', 'warning', 'info'] as const) {
        const group = bySeverity[severity];
        if (!group || group.length === 0) continue;
        lines.push(`\n#### ${severity.toUpperCase()} (${group.length})`);
        for (const insight of group) {
          lines.push(`- **[${insight.category}] ${insight.title}**`);
          lines.push(`  ${insight.description}`);
          if (insight.affectedElements.length > 0) {
            const names = insight.affectedElements.slice(0, 5).map((e) => `"${e.name}" (${e.type || e.layer})`).join(', ');
            lines.push(`  Affected: ${names}`);
          }
          if (insight.effort || insight.impact) {
            lines.push(`  Effort: ${insight.effort || '?'} | Impact: ${insight.impact || '?'}`);
          }
        }
      }
    }

    return lines.join('\n');
  } catch (err) {
    console.warn('[AI] Advisor scan failed, continuing without insights:', (err as Error).message);
    return '';
  }
}

// ─── System Prompt ───

function buildSystemPrompt(context: string, advisorContext: string): string {
  const advisorSection = advisorContext
    ? `
## Automated Analysis Results
The following findings come from TheArchitect's graph-based analysis engine. These are computed facts, not guesses.
Use them as primary evidence in your review. Reference specific findings, affected elements, and severity levels.

${advisorContext}

## How to Use These Findings
- CRITICAL and HIGH severity issues should be your top recommendations
- Single Points of Failure (SPOF): elements with many dependents and no redundancy — these are more impactful than orphaned elements
- Circular Dependencies: tight coupling that makes changes risky — always mention if detected
- Cascade Risk: Bayesian-computed probability of failure spreading through the dependency graph — the most sophisticated analysis available
- Stale Transitions: elements stuck in "transitional" status >90 days — governance red flags
- Architecture Drift: statistical tests showing the architecture is diverging from its baseline
- Risk Concentration: layers where >60% of elements are high/critical risk
- Cost Hotspots: elements with high optimization potential
- Missing Compliance: standard sections with no mapped architecture elements
- Always prioritize findings by severity (critical > high > warning > info) and impact
`
    : '';

  return `You are TheArchitect, an AI Architecture Copilot embedded in an Enterprise Architecture management tool.
You help architects — including those completely new to TOGAF and EA — understand, build, and improve their architecture.

## Your Personality
- Friendly, encouraging, plain-language. Explain TOGAF concepts when you mention them.
- Be specific: reference the user's actual elements by name.
- Give concrete recommendations: which element types to add, which connections are missing, which risks to address.
- Use bullet points and short paragraphs. No walls of text.
- If the user writes in German, respond in German. If English, respond in English.
- When the project is empty, guide the user step by step to start with business capabilities.

## TOGAF Reference
ADM Phases: Preliminary → A (Vision) → B (Business Architecture) → C (Information Systems) → D (Technology) → E (Opportunities & Solutions) → F (Migration Planning) → G (Implementation Governance) → H (Change Management)

Architecture Layers (top to bottom): Strategy > Business > Information/Data > Application > Technology

Element Types:
- Business: business_capability, process, value_stream, business_service
- Application: application, application_component, application_service
- Data: data_entity, data_model
- Technology: technology_component, infrastructure, platform_service

Connection Types: depends_on, connects_to, belongs_to, implements, data_flow, triggers
ArchiMate 3.2: composition, aggregation, assignment, realization, serving, access, influence, triggering, flow, specialization, association
${advisorSection}
## Best Practices to Recommend
- Every element should have a description
- Business layer should map to application layer (implements relationships)
- Data entities should connect to applications that use them (data_flow)
- Avoid orphaned elements — everything should connect to something
- Critical: identify Single Points of Failure (high inDegree) and recommend redundancy
- Flag circular dependencies — they create tight coupling and cascade risk
- Set risk levels and maturity levels for governance
- Higher layers (business) should drive lower layers (technology)
- Transitional elements should not stay in that status indefinitely

--- CURRENT PROJECT ARCHITECTURE ---
${context}
--- END ARCHITECTURE ---

Answer questions about this specific architecture. Be helpful and actionable.
When analysis findings are available, lead with the most critical computed insights rather than repeating what the user can already see.`;
}

// ─── Streaming Chat ───

export type OnChunk = (text: string) => void;
export type OnDone = () => void;
export type OnError = (err: Error) => void;

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export async function streamChat(
  projectId: string,
  messages: ChatMessage[],
  onChunk: OnChunk,
  onDone: OnDone,
  onError: OnError,
  standardId?: string,
  sectionIds?: string[],
): Promise<void> {
  const provider = detectProvider();
  if (provider === 'none') {
    onError(new Error('No AI API key configured'));
    return;
  }

  const [context, advisorContext] = await Promise.all([
    buildProjectContext(projectId),
    buildAdvisorContext(projectId),
  ]);
  let systemPrompt: string;

  if (standardId) {
    const standardContext = await buildStandardContext(standardId, sectionIds);
    systemPrompt = buildStandardAnalysisPrompt(context, standardContext);
  } else {
    systemPrompt = buildSystemPrompt(context, advisorContext);
  }

  const recentMessages = messages.slice(-20);

  try {
    if (provider === 'openai') {
      await streamOpenAI(systemPrompt, recentMessages, onChunk, onDone);
    } else {
      await streamAnthropic(systemPrompt, recentMessages, onChunk, onDone);
    }
  } catch (err) {
    // Fallback: if OpenAI fails and Anthropic key exists, try Anthropic
    if (provider === 'openai' && process.env.ANTHROPIC_API_KEY) {
      console.warn('[AI] OpenAI failed, falling back to Anthropic:', (err as Error).message);
      try {
        await streamAnthropic(systemPrompt, recentMessages, onChunk, onDone);
        return;
      } catch (fallbackErr) {
        onError(fallbackErr instanceof Error ? fallbackErr : new Error(String(fallbackErr)));
        return;
      }
    }
    onError(err instanceof Error ? err : new Error(String(err)));
  }
}

async function streamOpenAI(
  systemPrompt: string,
  messages: ChatMessage[],
  onChunk: OnChunk,
  onDone: OnDone,
  maxTokens = 2500,
): Promise<void> {
  const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
    baseURL: process.env.OPENAI_BASE_URL || undefined,
  });

  const stream = await openai.chat.completions.create({
    model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
    messages: [
      { role: 'system', content: systemPrompt },
      ...messages,
    ],
    stream: true,
    max_tokens: maxTokens,
    temperature: 0.7,
  });

  for await (const chunk of stream) {
    const text = chunk.choices[0]?.delta?.content;
    if (text) onChunk(text);
  }
  onDone();
}

async function streamAnthropic(
  systemPrompt: string,
  messages: ChatMessage[],
  onChunk: OnChunk,
  onDone: OnDone,
  maxTokens = 2500,
): Promise<void> {
  const anthropic = new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY,
  });

  const stream = anthropic.messages.stream({
    model: process.env.ANTHROPIC_MODEL || 'claude-haiku-4-5-20251001',
    system: systemPrompt,
    messages: messages.map((m) => ({ role: m.role, content: m.content })),
    max_tokens: maxTokens,
  });

  for await (const event of stream) {
    if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
      onChunk(event.delta.text);
    }
  }
  onDone();
}

// ─── Standard Context ───

export async function buildStandardContext(standardId: string, sectionIds?: string[]): Promise<string> {
  const standard = await Standard.findById(standardId);
  if (!standard) return '## No standard found';

  let sections = standard.sections;
  if (sectionIds && sectionIds.length > 0) {
    sections = sections.filter((s) => sectionIds.includes(s.id));
  }

  const lines: string[] = [];
  lines.push(`## Standard: ${standard.name} (${standard.version})`);
  lines.push(`Type: ${standard.type} | Pages: ${standard.pageCount} | Sections: ${sections.length}`);

  let charCount = 0;
  const maxChars = 8000;

  for (const section of sections) {
    if (charCount >= maxChars) {
      lines.push(`\n... (${sections.length - lines.length + 2} more sections truncated)`);
      break;
    }
    const content = section.content.slice(0, Math.min(section.content.length, maxChars - charCount));
    lines.push(`\n### §${section.number} ${section.title}`);
    lines.push(content);
    charCount += content.length;
  }

  return lines.join('\n');
}

function buildStandardAnalysisPrompt(architectureContext: string, standardContext: string): string {
  return `You are TheArchitect, an AI Architecture Copilot with deep expertise in ISO standards, ASPICE, and enterprise architecture compliance.

## Your Task
Compare the user's architecture against the provided standard. Identify gaps, compliance issues, and give actionable recommendations.

## Your Personality
- Friendly, encouraging, plain-language. Explain standard requirements when you mention them.
- Be specific: reference the user's actual elements by name AND the standard section numbers.
- Give concrete recommendations: which elements need changes, which are missing, what to add.
- Use bullet points and short paragraphs. No walls of text.
- If the user writes in German, respond in German. If English, respond in English.

## How to Analyze
1. Map standard requirements to architecture elements
2. Identify which requirements are covered (compliant), partially covered, or missing (gap)
3. For each gap, suggest specific elements, connections, or properties to add
4. Reference standard sections using §-notation (e.g. "Gemäß §6.4.2...")
5. Prioritize findings: critical gaps first, then improvements

## Rating Scale
- **Compliant**: Architecture fully addresses this requirement
- **Partial**: Some coverage but incomplete
- **Gap**: Requirement not addressed at all
- **N/A**: Requirement not applicable to this architecture

--- CURRENT PROJECT ARCHITECTURE ---
${architectureContext}
--- END ARCHITECTURE ---

--- STANDARD BEING CHECKED ---
${standardContext}
--- END STANDARD ---

Analyze the architecture against this standard. Be helpful and actionable.`;
}

// ─── AI Mapping Suggestions ───

/**
 * Validate and adjust AI confidence based on layer/type consistency.
 * REQ-CDTP-005: post-validate AI confidence scores.
 */
export function validateConfidence(
  suggestion: { confidence?: number; layer?: string; elementType?: string; elementId?: string },
  elements: Array<{ id: string; layer?: string; type?: string }>
): number {
  let confidence = suggestion.confidence || 0.5;
  if (suggestion.elementId && suggestion.elementId !== '__COVERAGE_GAP__') {
    const element = elements.find((e) => e.id === suggestion.elementId);
    if (element) {
      if (suggestion.layer && element.layer !== suggestion.layer) {
        confidence *= 0.7;
      }
      if (suggestion.elementType && element.type !== suggestion.elementType) {
        confidence *= 0.8;
      }
    }
  }
  return Math.round(confidence * 100) / 100;
}

interface MappingSuggestion {
  sectionId: string;
  sectionNumber: string;
  elementId: string;
  elementName: string;
  elementLayer: string;
  status: 'compliant' | 'partial' | 'gap' | 'not_applicable';
  notes: string;
  confidence: number;
}

export async function generateMappingSuggestions(
  projectId: string,
  standardId: string,
  sectionIds: string[] | undefined,
  onChunk: OnChunk,
  onDone: (suggestions: MappingSuggestion[]) => void | Promise<void>,
  onError: OnError,
): Promise<void> {
  const provider = detectProvider();
  if (provider === 'none') {
    onError(new Error('No AI API key configured'));
    return;
  }

  const architectureContext = await buildProjectContext(projectId);
  const standardContext = await buildStandardContext(standardId, sectionIds);

  const standard = await Standard.findById(standardId);
  if (!standard) {
    onError(new Error('Standard not found'));
    return;
  }

  let sections = standard.sections;
  if (sectionIds && sectionIds.length > 0) {
    sections = sections.filter((s) => sectionIds.includes(s.id));
  }

  // Get elements with IDs for mapping
  const elementRecords = await runCypher(
    `MATCH (e:ArchitectureElement {projectId: $projectId})
     RETURN e.id as id, e.name as name, e.layer as layer, e.type as type
     ORDER BY e.layer, e.name
     LIMIT 150`,
    { projectId },
  );

  const elements = elementRecords.map((r) => {
    const props = serializeNeo4jProperties(r.toObject());
    return {
      id: String(props.id || ''),
      name: String(props.name || ''),
      layer: String(props.layer || ''),
      type: String(props.type || ''),
    };
  });

  if (elements.length === 0) {
    onDone([]);
    return;
  }

  const sectionList = sections.map((s) => `- sectionId: "${s.id}", number: "${s.number}", title: "${s.title}"`).join('\n');
  const elementList = elements.map((e) => `- elementId: "${e.id}", name: "${e.name}", layer: "${e.layer}", type: "${e.type}"`).join('\n');

  const systemPrompt = `You are an ISO/ASPICE compliance mapping expert. Analyze the architecture elements against the standard sections and suggest mappings.

--- ARCHITECTURE ---
${architectureContext}
--- END ARCHITECTURE ---

--- STANDARD ---
${standardContext}
--- END STANDARD ---

## Available Sections (use these exact IDs):
${sectionList}

## Available Elements (use these exact IDs):
${elementList}

## Instructions
For each relevant section-element pair, determine the compliance status.
Respond with ONLY a JSON array. No other text. Each entry:
{"sectionId":"...","sectionNumber":"...","elementId":"...","elementName":"...","elementLayer":"...","status":"compliant|partial|gap","notes":"brief explanation","confidence":0.0-1.0}

Only include meaningful mappings where the element is relevant to the section. Skip irrelevant pairs.

Additionally, for any standard section that has NO suitable matching architecture element,
include an entry with:
- sectionId: the section's UUID
- sectionNumber: the section's number (e.g. "4.2.1")
- elementId: "__COVERAGE_GAP__"
- elementName: "Coverage Gap"
- coverageGap: true
- suggestedElementName: a descriptive name for the missing element
- suggestedElementType: appropriate ArchiMate element type
- suggestedElementLayer: "business", "application", or "technology"
- confidence: your confidence that this section needs a new element (0.0-1.0)`;

  let fullResponse = '';

  const collectChunk = (text: string) => {
    fullResponse += text;
    onChunk(text);
  };

  const parseAndFinish = async () => {
    try {
      // Extract JSON array from response
      const jsonMatch = fullResponse.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        const suggestions: MappingSuggestion[] = JSON.parse(jsonMatch[0]);
        await onDone(suggestions);
      } else {
        await onDone([]);
      }
    } catch {
      console.warn('[AI] Failed to parse mapping suggestions, returning empty');
      await onDone([]);
    }
  };

  try {
    if (provider === 'openai') {
      await streamOpenAI(systemPrompt, [{ role: 'user', content: 'Generate the compliance mapping suggestions as JSON.' }], collectChunk, () => {});
    } else {
      await streamAnthropic(systemPrompt, [{ role: 'user', content: 'Generate the compliance mapping suggestions as JSON.' }], collectChunk, () => {});
    }
    await parseAndFinish();
  } catch (err) {
    // Fallback
    if (provider === 'openai' && process.env.ANTHROPIC_API_KEY) {
      try {
        fullResponse = '';
        await streamAnthropic(systemPrompt, [{ role: 'user', content: 'Generate the compliance mapping suggestions as JSON.' }], collectChunk, () => {});
        await parseAndFinish();
        return;
      } catch (fallbackErr) {
        onError(fallbackErr instanceof Error ? fallbackErr : new Error(String(fallbackErr)));
        return;
      }
    }
    onError(err instanceof Error ? err : new Error(String(err)));
  }
}

// ─── AI Policy Generation from Standard (REQ-CDTP-006) ───

export async function generatePoliciesFromStandard(
  projectId: string,
  standardId: string,
  onChunk: OnChunk,
  onDone: (drafts: PolicyDraft[]) => void | Promise<void>,
  onError: OnError,
): Promise<void> {
  const provider = detectProvider();
  if (provider === 'none') {
    onError(new Error('No AI API key configured'));
    return;
  }

  const architectureContext = await buildProjectContext(projectId);
  const standard = await Standard.findById(standardId);
  if (!standard) {
    onError(new Error('Standard not found'));
    return;
  }

  if (!standard.sections || standard.sections.length === 0) {
    onError(new Error('Standard has no parsed sections — the PDF may not have been processed correctly. Try re-uploading.'));
    return;
  }

  // Build section context with full content for policy extraction
  let charCount = 0;
  const maxChars = 80000;
  const sectionLines: string[] = [];
  for (const section of standard.sections) {
    if (charCount >= maxChars) break;
    const content = section.content.slice(0, Math.min(section.content.length, maxChars - charCount));
    sectionLines.push(`### §${section.number} ${section.title}\n${content}`);
    charCount += content.length;
  }

  const systemPrompt = `You are a compliance policy extraction expert. You analyze standard documents and extract machine-evaluable policy rules for an Enterprise Architecture platform.

The platform evaluates policies against architecture elements with these properties:
- name, type, layer, status, riskLevel, maturityLevel, description
- layer values: "strategy", "business", "information", "application", "technology"
- type values: "business_capability", "process", "value_stream", "business_service", "application", "application_component", "application_service", "data_entity", "data_model", "technology_component", "infrastructure", "platform_service"
- status values: "current", "target", "planned", "retired", "deprecated"
- riskLevel values: "low", "medium", "high", "critical"
- maturityLevel: 1-5

Available operators: equals, not_equals, contains, gt, lt, gte, lte, exists, regex

--- ARCHITECTURE CONTEXT ---
${architectureContext}
--- END ARCHITECTURE ---

--- STANDARD: ${standard.name} (${standard.version}) ---
${sectionLines.join('\n\n')}
--- END STANDARD ---

## Instructions
For each standard section that contains a checkable requirement, extract one or more policy rules.
Each policy should be a concrete, machine-evaluable rule — NOT a vague recommendation.

Good examples:
- "Technology elements must have maturityLevel >= 3" → field: "maturityLevel", operator: "gte", value: 3
- "All applications must have a description" → field: "description", operator: "exists", value: true
- "No elements should be in retired status" → field: "status", operator: "not_equals", value: "retired"

Skip sections that are purely informational with no checkable requirement.

Respond with ONLY a JSON array. No other text. Each entry:
{"name":"...","description":"...","severity":"error|warning|info","scope":{"domains":[],"elementTypes":[],"layers":[]},"rules":[{"field":"...","operator":"...","value":...,"message":"..."}],"sourceSection":"...","sourceSectionTitle":"...","confidence":0.0-1.0}

Set confidence based on how clearly the standard section maps to a concrete, evaluable rule.
Set severity: "error" for SHALL/MUST requirements, "warning" for SHOULD, "info" for MAY/recommendations.`;

  let fullResponse = '';

  const collectChunk = (text: string) => {
    fullResponse += text;
    onChunk(text);
  };

  const POLICY_MAX_TOKENS = 4096;

  const parseAndFinish = async () => {
    if (!fullResponse.trim()) {
      console.warn('[AI] Policy generation returned empty response');
      onError(new Error('AI returned an empty response — please try again'));
      return;
    }

    try {
      // Try to extract JSON array — handle markdown code blocks too
      const cleaned = fullResponse.replace(/```json\s*/g, '').replace(/```\s*/g, '');
      const jsonMatch = cleaned.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        const drafts: PolicyDraft[] = JSON.parse(jsonMatch[0]);
        console.log(`[AI] Extracted ${drafts.length} policy drafts`);
        await onDone(drafts);
      } else {
        console.warn(`[AI] No JSON array found in response (${fullResponse.length} chars)`);
        onError(new Error('AI response did not contain valid policy rules — the standard may lack concrete requirements'));
      }
    } catch (parseErr) {
      console.warn(`[AI] Failed to parse policy drafts (${fullResponse.length} chars):`, (parseErr as Error).message);
      onError(new Error('Failed to parse AI response — the output may have been truncated. Try again.'));
    }
  };

  const userMessage = 'Extract policy rules from the standard sections as JSON.';

  try {
    if (provider === 'openai') {
      await streamOpenAI(systemPrompt, [{ role: 'user', content: userMessage }], collectChunk, () => {}, POLICY_MAX_TOKENS);
    } else {
      await streamAnthropic(systemPrompt, [{ role: 'user', content: userMessage }], collectChunk, () => {}, POLICY_MAX_TOKENS);
    }
    await parseAndFinish();
  } catch (err) {
    if (provider === 'openai' && process.env.ANTHROPIC_API_KEY) {
      try {
        fullResponse = '';
        await streamAnthropic(systemPrompt, [{ role: 'user', content: userMessage }], collectChunk, () => {}, POLICY_MAX_TOKENS);
        await parseAndFinish();
        return;
      } catch (fallbackErr) {
        onError(fallbackErr instanceof Error ? fallbackErr : new Error(String(fallbackErr)));
        return;
      }
    }
    onError(err instanceof Error ? err : new Error(String(err)));
  }
}

// ─── Suggest Missing Elements (REQ-CDTP-024) ───

export interface SuggestedElement {
  name: string;
  type: string;
  layer: string;
  description: string;
  sectionNumber: string;
  sectionTitle: string;
  priority: 'high' | 'medium' | 'low';
  connections: Array<{ targetName: string; type: string }>;
}

export async function suggestMissingElements(
  projectId: string,
  standardId: string,
): Promise<SuggestedElement[]> {
  const provider = detectProvider();
  if (provider === 'none') return [];

  // Get coverage gap mappings
  const gapMappings = await StandardMapping.find({
    projectId,
    standardId,
    elementId: '__COVERAGE_GAP__',
  });

  // Also get non-compliant mappings (gap status with real elements) + approved policies
  const nonCompliantMappings = await StandardMapping.find({
    projectId,
    standardId,
    status: 'gap',
    elementId: { $ne: '__COVERAGE_GAP__' },
  });

  const policies = await Policy.find({ projectId, standardId, enabled: true });

  if (gapMappings.length === 0 && nonCompliantMappings.length === 0 && policies.length === 0) return [];

  const standard = await Standard.findById(standardId);
  if (!standard) return [];

  // Build gap context
  const gapLines = gapMappings.map((m) => {
    const section = standard.sections.find((s) => s.id === m.sectionId);
    const suggested = m.suggestedNewElement;
    return `- §${m.sectionNumber} "${section?.title || 'Unknown'}": suggested "${suggested?.name || 'Unknown'}" (${suggested?.type || 'unknown'}, ${suggested?.layer || 'unknown'})`;
  });

  // Build non-compliant element context
  const nonCompliantLines = nonCompliantMappings.map((m) => {
    const section = standard.sections.find((s) => s.id === m.sectionId);
    return `- §${m.sectionNumber} "${section?.title || 'Unknown'}": element "${m.elementName}" (${m.elementLayer}) has GAP status — needs modification or replacement`;
  });

  // Build policy context
  const policyLines = policies.map((p) => {
    return `- Policy "${p.name}" (${p.severity}): ${p.description}${p.rules?.length ? ` | Rules: ${p.rules.map((r: any) => `${r.field} ${r.operator} ${JSON.stringify(r.value)}`).join(', ')}` : ''}`;
  });

  const architectureContext = await buildProjectContext(projectId);

  const systemPrompt = `You are an Enterprise Architecture expert. Analyze compliance gaps, non-compliant elements, and active policies to suggest architecture changes needed for compliance.

--- CURRENT ARCHITECTURE ---
${architectureContext}
--- END ARCHITECTURE ---

--- STANDARD: ${standard.name} ---
${gapLines.length > 0 ? `COVERAGE GAPS (missing elements):\n${gapLines.join('\n')}` : ''}
${nonCompliantLines.length > 0 ? `\nNON-COMPLIANT ELEMENTS (need changes):\n${nonCompliantLines.join('\n')}` : ''}
${policyLines.length > 0 ? `\nACTIVE POLICIES (must be fulfilled):\n${policyLines.join('\n')}` : ''}
--- END COMPLIANCE CONTEXT ---

For each issue, suggest a concrete architecture change:
- For coverage gaps: suggest a NEW element to add
- For non-compliant elements: suggest MODIFICATIONS to existing elements (add properties, change status, add connections)
- For policies: suggest elements or changes needed to satisfy each policy rule

For each suggestion provide:
- A clear name following ArchiMate conventions
- The correct element type and layer
- A description explaining what to do and WHY (referencing the policy/gap)
- Priority: "high" for SHALL/MUST or Error-severity policies, "medium" for SHOULD/Warning, "low" for MAY/Info
- Proposed connections to existing architecture elements (by name)

Respond with ONLY a JSON array:
[{"name":"...","type":"...","layer":"...","description":"...","sectionNumber":"...","sectionTitle":"...","priority":"high|medium|low","connections":[{"targetName":"...","type":"depends_on|implements|data_flow"}]}]`;

  let fullResponse = '';
  const collect = (text: string) => { fullResponse += text; };

  try {
    if (provider === 'openai') {
      await streamOpenAI(systemPrompt, [{ role: 'user', content: 'Generate detailed element suggestions for the coverage gaps.' }], collect, () => {});
    } else {
      await streamAnthropic(systemPrompt, [{ role: 'user', content: 'Generate detailed element suggestions for the coverage gaps.' }], collect, () => {});
    }

    const jsonMatch = fullResponse.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]) as SuggestedElement[];
    }
    return [];
  } catch {
    return [];
  }
}
