import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';
import {
  ARCHIMATE_STANDARD_TYPES,
  ARCHIMATE_STANDARD_CONNECTION_TYPES,
  LEGACY_TYPE_MAP,
  ARCHITECTURE_LAYERS,
  ELEMENT_TYPES,
} from '@thearchitect/shared';
import type {
  BlueprintInput,
  BlueprintGeneratedElement,
  BlueprintGeneratedConnection,
  BlueprintValidationResult,
  BlueprintResult,
  BlueprintStreamEvent,
} from '@thearchitect/shared';
import type { ArchitectureLayer, TOGAFDomain, ElementType, ConnectionType } from '@thearchitect/shared';

// ─── Provider Detection (mirrors ai.service.ts) ───

type Provider = 'openai' | 'anthropic' | 'none';

function detectProvider(): Provider {
  if (process.env.OPENAI_API_KEY) return 'openai';
  if (process.env.ANTHROPIC_API_KEY) return 'anthropic';
  return 'none';
}

// ─── Type Inference (mirrors csvParser.ts logic) ───

const TYPE_TO_DOMAIN = new Map<string, string>();
for (const et of ELEMENT_TYPES) {
  TYPE_TO_DOMAIN.set(et.type, et.domain);
}

const DOMAIN_TO_LAYER: Record<string, ArchitectureLayer> = {
  strategy: 'strategy',
  business: 'business',
  data: 'information',
  application: 'application',
  technology: 'technology',
  motivation: 'motivation',
  implementation: 'implementation_migration',
};

const STRATEGY_TYPES = new Set(['business_capability', 'value_stream', 'resource', 'course_of_action']);
const PHYSICAL_TYPES = new Set(['equipment', 'facility', 'distribution_network', 'material']);

function inferLayer(type: string): ArchitectureLayer {
  if (STRATEGY_TYPES.has(type)) return 'strategy';
  if (PHYSICAL_TYPES.has(type)) return 'physical';
  const domain = TYPE_TO_DOMAIN.get(type);
  if (domain && DOMAIN_TO_LAYER[domain]) return DOMAIN_TO_LAYER[domain];
  return 'application';
}

function inferDomain(type: string): TOGAFDomain {
  const domain = TYPE_TO_DOMAIN.get(type);
  return (domain as TOGAFDomain) || 'application';
}

// ─── Position3D Layout ───

const LAYER_Y = new Map<string, number>();
for (const l of ARCHITECTURE_LAYERS) {
  LAYER_Y.set(l.id, l.yPosition);
}

function calculatePositions(elements: BlueprintGeneratedElement[]): void {
  const layerCounts: Record<string, number> = {};
  const spacing = 3;
  const rowSize = 5;

  for (const el of elements) {
    layerCounts[el.layer] = layerCounts[el.layer] || 0;
    const col = layerCounts[el.layer]++;
    const x = (col % rowSize) * spacing - ((Math.min(rowSize, layerCounts[el.layer]) - 1) * spacing) / 2;
    const y = LAYER_Y.get(el.layer) ?? 0;
    const z = Math.floor(col / rowSize) * spacing;
    el.position3D = { x, y, z };
  }
}

// ─── ID Generation ───

function generateId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

// ─── Questionnaire → LLM Prompt Serialization ───

function serializeInput(input: BlueprintInput): string {
  const q = input.rawQuestionnaire;
  const lines: string[] = [];

  lines.push('## THE BUSINESS');
  lines.push(q.businessDescription);
  lines.push(`Target users/customers: ${q.targetUsers}`);
  lines.push(`Problem being solved: ${q.problemSolved}`);
  if (q.urgencyDriver) lines.push(`Urgency: ${q.urgencyDriver}`);

  lines.push('\n## GOALS & VISION');
  q.goals.filter(Boolean).forEach((g, i) => lines.push(`${i + 1}. ${g}`));
  if (q.successVision) lines.push(`Success looks like: ${q.successVision}`);
  if (q.principles) lines.push(`Core principles: ${q.principles}`);

  lines.push('\n## CAPABILITIES & VALUE DELIVERY');
  lines.push(`Key capabilities: ${q.capabilities}`);
  if (q.customerJourney) lines.push(`Customer journey: ${q.customerJourney}`);

  lines.push('\n## TEAM & PROCESSES');
  if (q.teamDescription) {
    lines.push(`Team: ${q.teamDescription}`);
  } else if (q.teamSize) {
    lines.push(`Team size: ${q.teamSize} people`);
  }
  if (q.mainProcesses) lines.push(`Key processes: ${q.mainProcesses}`);

  lines.push('\n## TECHNOLOGY');
  if (q.productType) lines.push(`Product type: ${q.productType.replace(/_/g, ' ')}`);
  if (q.existingTools?.length) lines.push(`Tools/tech in use: ${q.existingTools.join(', ')}`);
  if (q.techDecisions) lines.push(`Tech decisions: ${q.techDecisions}`);

  lines.push('\n## CONSTRAINTS');
  if (q.constraints) lines.push(q.constraints);
  if (q.monthlyBudget) lines.push(`Monthly budget: €${q.monthlyBudget}`);
  if (q.regulations?.length) lines.push(`Compliance requirements: ${q.regulations.join(', ')}`);
  if (input.industryHint) lines.push(`Industry: ${input.industryHint}`);

  return lines.join('\n');
}

// ─── System Prompts ───

function buildElementSystemPrompt(): string {
  // Build type list grouped by layer
  const typesByLayer: Record<string, string[]> = {};
  for (const type of ARCHIMATE_STANDARD_TYPES) {
    const layer = inferLayer(type);
    if (!typesByLayer[layer]) typesByLayer[layer] = [];
    typesByLayer[layer].push(type);
  }

  const typeList = Object.entries(typesByLayer)
    .map(([layer, types]) => `- ${layer}: ${types.join(', ')}`)
    .join('\n');

  return `You are an Enterprise Architecture expert generating ArchiMate 3.2-compliant architectures for startups and new businesses.

IMPORTANT: The user is NOT an architect. They described their business in plain language.
Your job is to translate their description into a professional architecture model.

## ALLOWED ELEMENT TYPES (use ONLY these):
${typeList}

## LAYER VALUES:
${ARCHITECTURE_LAYERS.map((l) => l.id).join(', ')}

## GUIDELINES FOR STARTUP ARCHITECTURES:
- Even if the user didn't explicitly mention stakeholders, infer them from context (e.g., "2 developers" → business_actor)
- Map vague goals to concrete ArchiMate goal elements with measurable descriptions
- Infer technology layer from product type and tools mentioned
- If the user mentions "React" → create application_component, if "AWS" → create node + technology_service
- Create implementation_migration elements: at minimum a "Current State" plateau, "MVP" work_package, and "Target State" plateau
- For capabilities the user didn't mention but are implied (e.g., any business needs "User Management", "Payment Processing" if it's a marketplace), add them proactively
- Every element MUST have a description (1-2 sentences max)
- Use status "target" for things to be built, "current" for things that already exist

## OUTPUT FORMAT:
Output ONLY a valid JSON array. No markdown, no commentary, no code fences.
Each element: {"name":"...","type":"...","layer":"...","description":"...","status":"current|target"}`;
}

function buildConnectionSystemPrompt(elements: BlueprintGeneratedElement[]): string {
  const elementList = elements
    .map((e) => `- id:"${e.id}" name:"${e.name}" type:${e.type} layer:${e.layer}`)
    .join('\n');

  const connTypes = Array.from(ARCHIMATE_STANDARD_CONNECTION_TYPES).join(', ');

  return `You are an Enterprise Architecture expert creating ArchiMate 3.2 relationships.

## GENERATED ELEMENTS (use these exact IDs):
${elementList}

## ALLOWED CONNECTION TYPES:
${connTypes}

## RULES:
- Every element MUST have at least 1 connection
- Create cross-layer connections:
  - motivation → strategy: use "influence"
  - strategy → business: use "realization"
  - business → application: use "serving" or "realization"
  - application → technology: use "serving"
  - business_actor → process: use "assignment"
  - requirement → application_component: use "realization"
- Target: 2-4 connections per element
- Use descriptive labels (e.g., "drives", "realized by", "hosted on")
- Connect tools/software to the capabilities they enable with "serving"

## OUTPUT FORMAT:
Output ONLY a valid JSON array. No markdown, no commentary, no code fences.
Each connection: {"sourceId":"...","targetId":"...","type":"...","label":"..."}`;
}

// ─── LLM Call ───

interface RawElement {
  name?: string;
  type?: string;
  layer?: string;
  description?: string;
  status?: string;
}

interface RawConnection {
  sourceId?: string;
  targetId?: string;
  type?: string;
  label?: string;
}

async function callLLM(systemPrompt: string, userMessage: string, maxTokens = 8192): Promise<string> {
  const provider = detectProvider();
  if (provider === 'none') throw new Error('No AI API key configured');

  let fullResponse = '';

  if (provider === 'openai') {
    const openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
      baseURL: process.env.OPENAI_BASE_URL || undefined,
    });

    const completion = await openai.chat.completions.create({
      model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage },
      ],
      max_tokens: maxTokens,
      temperature: 0.7,
    });

    fullResponse = completion.choices[0]?.message?.content || '';
  } else {
    const anthropic = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
    });

    const message = await anthropic.messages.create({
      model: process.env.ANTHROPIC_MODEL || 'claude-haiku-4-5-20251001',
      system: systemPrompt,
      messages: [{ role: 'user', content: userMessage }],
      max_tokens: maxTokens,
    });

    fullResponse = message.content[0]?.type === 'text' ? message.content[0].text : '';
  }

  return fullResponse;
}

async function callLLMWithFallback(systemPrompt: string, userMessage: string, maxTokens = 8192): Promise<string> {
  try {
    return await callLLM(systemPrompt, userMessage, maxTokens);
  } catch (err) {
    // Fallback: if OpenAI failed and Anthropic key exists
    if (process.env.OPENAI_API_KEY && process.env.ANTHROPIC_API_KEY) {
      console.warn('[Blueprint] Primary LLM failed, trying fallback:', (err as Error).message);
      const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
      const message = await anthropic.messages.create({
        model: process.env.ANTHROPIC_MODEL || 'claude-haiku-4-5-20251001',
        system: systemPrompt,
        messages: [{ role: 'user', content: userMessage }],
        max_tokens: maxTokens,
      });
      return message.content[0]?.type === 'text' ? message.content[0].text : '';
    }
    throw err;
  }
}

function extractJsonArray(text: string): unknown[] {
  const match = text.match(/\[[\s\S]*\]/);
  if (!match) throw new Error('No JSON array found in LLM response');
  return JSON.parse(match[0]);
}

// ─── Element Validation ───

function validateElements(raw: RawElement[]): {
  elements: BlueprintGeneratedElement[];
  warnings: string[];
  errors: string[];
  typeFixups: number;
} {
  const elements: BlueprintGeneratedElement[] = [];
  const warnings: string[] = [];
  const errors: string[] = [];
  let typeFixups = 0;
  const seenNames = new Set<string>();

  for (const r of raw) {
    if (!r.name || !r.type) {
      warnings.push(`Skipped element with missing name or type`);
      continue;
    }

    let type = r.type as ElementType;

    // Check standard whitelist
    if (!ARCHIMATE_STANDARD_TYPES.has(type)) {
      // Try legacy mapping
      const mapped = LEGACY_TYPE_MAP[type];
      if (mapped) {
        type = mapped;
        typeFixups++;
      } else {
        warnings.push(`Unknown type "${r.type}" for "${r.name}", skipped`);
        continue;
      }
    }

    // Deduplicate names
    let name = r.name;
    if (seenNames.has(name.toLowerCase())) {
      let suffix = 2;
      while (seenNames.has(`${name.toLowerCase()} (${suffix})`)) suffix++;
      name = `${name} (${suffix})`;
      warnings.push(`Duplicate name "${r.name}" renamed to "${name}"`);
    }
    seenNames.add(name.toLowerCase());

    const layer = r.layer && ARCHITECTURE_LAYERS.some((l) => l.id === r.layer)
      ? (r.layer as ArchitectureLayer)
      : inferLayer(type);
    const togafDomain = inferDomain(type);
    const status = (r.status === 'target' || r.status === 'transitional' || r.status === 'retired') ? r.status : 'current';

    elements.push({
      id: generateId('bp'),
      name,
      type,
      layer,
      togafDomain,
      description: (r.description || '').slice(0, 200),
      status: status as BlueprintGeneratedElement['status'],
      riskLevel: 'low',
      maturityLevel: status === 'target' ? 2 : 3,
      position3D: { x: 0, y: 0, z: 0 },
    });
  }

  if (elements.length === 0) {
    errors.push('No valid elements were generated');
  }

  return { elements, warnings, errors, typeFixups };
}

// ─── Connection Validation ───

function validateConnections(
  raw: RawConnection[],
  elements: BlueprintGeneratedElement[],
): {
  connections: BlueprintGeneratedConnection[];
  warnings: string[];
} {
  const connections: BlueprintGeneratedConnection[] = [];
  const warnings: string[] = [];
  const elementMap = new Map(elements.map((e) => [e.id, e]));

  for (const r of raw) {
    if (!r.sourceId || !r.targetId) {
      warnings.push('Skipped connection with missing source or target');
      continue;
    }

    const source = elementMap.get(r.sourceId);
    const target = elementMap.get(r.targetId);
    if (!source || !target) {
      warnings.push(`Connection ${r.sourceId} → ${r.targetId}: invalid element reference, skipped`);
      continue;
    }

    let type = (r.type || 'association') as ConnectionType;
    if (!ARCHIMATE_STANDARD_CONNECTION_TYPES.has(type)) {
      type = 'association' as ConnectionType;
      warnings.push(`Non-standard connection type "${r.type}" mapped to "association"`);
    }

    connections.push({
      id: generateId('bc'),
      sourceId: r.sourceId,
      targetId: r.targetId,
      sourceName: source.name,
      targetName: target.name,
      type,
      label: r.label || '',
    });
  }

  return { connections, warnings };
}

// ─── Layer Coverage Check ───

function checkLayerCoverage(elements: BlueprintGeneratedElement[]): Partial<Record<ArchitectureLayer, number>> {
  const coverage: Partial<Record<ArchitectureLayer, number>> = {};
  for (const el of elements) {
    coverage[el.layer] = (coverage[el.layer] || 0) + 1;
  }
  return coverage;
}

// ─── Orphan Detection ───

function findOrphanedElements(
  elements: BlueprintGeneratedElement[],
  connections: BlueprintGeneratedConnection[],
): string[] {
  const connected = new Set<string>();
  for (const c of connections) {
    connected.add(c.sourceId);
    connected.add(c.targetId);
  }
  return elements.filter((e) => !connected.has(e.id)).map((e) => e.name);
}

// ─── Complexity → Target Count ───

function getTargetCount(complexity?: string): number {
  switch (complexity) {
    case 'minimal': return 35;
    case 'comprehensive': return 75;
    default: return 55;
  }
}

// ─── Main Generator ───

export async function generateBlueprint(
  input: BlueprintInput,
  onEvent: (event: BlueprintStreamEvent) => void,
): Promise<BlueprintResult> {
  const provider = detectProvider();
  if (provider === 'none') {
    throw new Error('No AI API key configured. Set OPENAI_API_KEY or ANTHROPIC_API_KEY.');
  }

  const targetCount = getTargetCount(input.complexityHint);
  const userMessage = `I am building an enterprise architecture for the following startup:\n\n${serializeInput(input)}\n\nGenerate exactly ${targetCount} ArchiMate 3.2 elements covering ALL mandatory layers (motivation, strategy, business, information, application, technology). Include implementation_migration elements (plateaus, work_packages).`;

  // ── Phase 1: Generate Elements ──
  onEvent({ type: 'progress', phase: 'elements', message: 'Generating architecture elements...', percent: 10 });

  let rawElements: RawElement[];
  try {
    const response = await callLLMWithFallback(buildElementSystemPrompt(), userMessage);
    rawElements = extractJsonArray(response) as RawElement[];
  } catch (err) {
    // Retry once with lower temperature hint
    console.warn('[Blueprint] First element generation failed, retrying:', (err as Error).message);
    try {
      const response = await callLLMWithFallback(
        buildElementSystemPrompt() + '\n\nCRITICAL: Output MUST be valid JSON. Start with [ and end with ].',
        userMessage,
      );
      rawElements = extractJsonArray(response) as RawElement[];
    } catch (retryErr) {
      throw new Error(`Element generation failed: ${(retryErr as Error).message}`);
    }
  }

  onEvent({ type: 'progress', phase: 'elements', message: 'Validating elements...', percent: 40 });

  const { elements, warnings: elementWarnings, errors: elementErrors, typeFixups } = validateElements(rawElements);

  if (elementErrors.length > 0) {
    throw new Error(`Element validation failed: ${elementErrors.join('; ')}`);
  }

  // Calculate positions
  calculatePositions(elements);

  onEvent({ type: 'elements_ready', count: elements.length });

  // ── Phase 2: Generate Connections ──
  onEvent({ type: 'progress', phase: 'connections', message: 'Generating relationships...', percent: 55 });

  let rawConnections: RawConnection[];
  try {
    const connResponse = await callLLMWithFallback(
      buildConnectionSystemPrompt(elements),
      'Generate ArchiMate 3.2 relationships for all elements. Ensure every element has at least 1 connection. Focus on cross-layer relationships.',
    );
    rawConnections = extractJsonArray(connResponse) as RawConnection[];
  } catch (err) {
    console.warn('[Blueprint] Connection generation failed, retrying:', (err as Error).message);
    try {
      const connResponse = await callLLMWithFallback(
        buildConnectionSystemPrompt(elements) + '\n\nCRITICAL: Output MUST be valid JSON. Start with [ and end with ].',
        'Generate relationships. Output only a JSON array.',
      );
      rawConnections = extractJsonArray(connResponse) as RawConnection[];
    } catch (retryErr) {
      // Fall back to empty connections rather than failing entirely
      console.error('[Blueprint] Connection generation failed completely:', (retryErr as Error).message);
      rawConnections = [];
    }
  }

  onEvent({ type: 'progress', phase: 'connections', message: 'Validating relationships...', percent: 80 });

  const { connections, warnings: connectionWarnings } = validateConnections(rawConnections, elements);

  onEvent({ type: 'connections_ready', count: connections.length });

  // ── Phase 3: Validation ──
  onEvent({ type: 'progress', phase: 'validation', message: 'Running final validation...', percent: 90 });

  const layerCoverage = checkLayerCoverage(elements);
  const orphanedElements = findOrphanedElements(elements, connections);
  const allWarnings = [...elementWarnings, ...connectionWarnings];

  // Layer coverage warnings
  const mandatoryLayers: ArchitectureLayer[] = ['motivation', 'strategy', 'business', 'application', 'technology'];
  for (const layer of mandatoryLayers) {
    if (!layerCoverage[layer]) {
      allWarnings.push(`Missing elements in ${layer} layer`);
    }
  }

  if (orphanedElements.length > 0) {
    allWarnings.push(`${orphanedElements.length} element(s) have no connections: ${orphanedElements.slice(0, 5).join(', ')}${orphanedElements.length > 5 ? '...' : ''}`);
  }

  const validation: BlueprintValidationResult = {
    isValid: elementErrors.length === 0 && elements.length > 0,
    elementCount: elements.length,
    connectionCount: connections.length,
    layerCoverage,
    warnings: allWarnings,
    errors: elementErrors,
    typeFixups,
    orphanedElements,
  };

  const result: BlueprintResult = {
    elements,
    connections,
    validation,
    input,
    generatedAt: new Date().toISOString(),
  };

  onEvent({ type: 'complete', result });

  return result;
}

// ─── Document Auto-Fill ───

const AUTOFILL_SYSTEM_PROMPT = `You are an assistant that extracts business information from documents and maps it to a structured questionnaire.

Given text extracted from a business document (pitch deck, business plan, strategy paper, etc.), extract the following fields. Return a JSON object with ONLY the fields you can confidently extract. Omit fields where the document provides no relevant information.

JSON structure:
{
  "businessDescription": "one-sentence summary of what the business does",
  "targetUsers": "who the main users/customers are",
  "problemSolved": "what problem the business solves",
  "urgencyDriver": "why now, what drives urgency",
  "goals": ["goal 1", "goal 2", "goal 3"],
  "successVision": "what success looks like",
  "principles": "core principles or values",
  "capabilities": "comma-separated list of key business capabilities",
  "customerJourney": "typical customer journey description",
  "teamDescription": "team composition and roles",
  "mainProcesses": "key business processes",
  "existingTools": ["tool1", "tool2"],
  "productType": "one of: web_app, mobile_app, api_platform, marketplace, saas, hardware_software, other",
  "techDecisions": "technology decisions already made",
  "constraints": "business constraints and limitations",
  "teamSize": "one of: 1-2, 3-5, 6-15, 16-50, 50+",
  "monthlyBudget": "one of: <500, 500-2K, 2K-10K, 10K-50K, 50+",
  "regulations": ["gdpr", "soc2", "iso27001", "pci_dss", "hipaa"],
  "industryHint": "detected industry"
}

RULES:
- goals MUST be an array of exactly 3 strings (use empty string "" if fewer than 3 found)
- existingTools MUST be an array of strings
- regulations MUST be an array of strings, only from the allowed values above
- productType MUST be one of the allowed enum values
- teamSize and monthlyBudget MUST be one of the allowed enum values
- Only include fields where the document provides clear information
- Output ONLY the JSON object, no markdown or explanation`;

export async function autofillFromDocument(documentText: string): Promise<Record<string, unknown>> {
  const provider = detectProvider();
  if (provider === 'none') {
    throw new Error('No AI API key configured. Set OPENAI_API_KEY or ANTHROPIC_API_KEY.');
  }

  // Truncate very long documents to avoid token limits
  const maxChars = 15000;
  const truncated = documentText.length > maxChars
    ? documentText.slice(0, maxChars) + '\n\n[... document truncated ...]'
    : documentText;

  const userMessage = `Extract business questionnaire data from this document:\n\n${truncated}`;

  const response = await callLLMWithFallback(AUTOFILL_SYSTEM_PROMPT, userMessage, 4096);

  // Extract JSON object from response
  const jsonMatch = response.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('Could not extract structured data from document');

  const parsed = JSON.parse(jsonMatch[0]);

  // Ensure goals is always a 3-tuple
  if (parsed.goals) {
    while (parsed.goals.length < 3) parsed.goals.push('');
    parsed.goals = parsed.goals.slice(0, 3);
  }

  return parsed;
}
