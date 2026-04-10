import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';
import { buildProjectContext } from './ai.service';
import type {
  AIVisionSuggestion,
  AIStakeholderSuggestion,
  AIPrincipleSuggestion,
  AIConflictInsight,
  AIReadinessAssessment,
  AIDocumentExtraction,
} from '@thearchitect/shared';

// ─── Provider Detection (mirrors ai.service.ts) ───

type Provider = 'openai' | 'anthropic' | 'none';

function detectProvider(): Provider {
  if (process.env.OPENAI_API_KEY) return 'openai';
  if (process.env.ANTHROPIC_API_KEY) return 'anthropic';
  return 'none';
}

// ─── LLM Call (mirrors blueprint.service.ts) ───

async function callLLM(systemPrompt: string, userMessage: string, maxTokens = 4096): Promise<string> {
  const provider = detectProvider();
  if (provider === 'none') throw new Error('No AI API key configured. Set OPENAI_API_KEY or ANTHROPIC_API_KEY.');

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
    return completion.choices[0]?.message?.content || '';
  }

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const message = await anthropic.messages.create({
    model: process.env.ANTHROPIC_MODEL || 'claude-haiku-4-5-20251001',
    system: systemPrompt,
    messages: [{ role: 'user', content: userMessage }],
    max_tokens: maxTokens,
  });
  return message.content[0]?.type === 'text' ? message.content[0].text : '';
}

async function callLLMWithFallback(systemPrompt: string, userMessage: string, maxTokens = 4096): Promise<string> {
  try {
    return await callLLM(systemPrompt, userMessage, maxTokens);
  } catch (err) {
    if (process.env.OPENAI_API_KEY && process.env.ANTHROPIC_API_KEY) {
      console.warn('[EnvisionAI] Primary LLM failed, trying fallback:', (err as Error).message);
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

// ─── Feature 1: AI Vision Generator ───

const VISION_SYSTEM_PROMPT = `You are TheArchitect, an AI Architecture Copilot specializing in TOGAF ADM Phase A — Architecture Vision.

Given a brief project description, generate a complete Architecture Vision with:
1. **scope**: 2-3 sentences defining what the architecture covers (systems, boundaries, timeframe)
2. **visionStatement**: 1-2 sentences describing the target state and measurable success criteria
3. **principles**: 4-6 non-negotiable architecture principles (e.g., "Cloud-First", "Security by Design", "API-First")
4. **drivers**: 3-5 business or technology drivers motivating this project (e.g., "Regulatory Compliance", "Cost Reduction")
5. **goals**: 3-5 SMART goals — Specific, Measurable, Achievable, Relevant, Time-bound

Respond with ONLY a valid JSON object matching this schema:
{"scope":"...","visionStatement":"...","principles":["..."],"drivers":["..."],"goals":["..."]}

Make suggestions specific to the described project, not generic. Reference industry best practices where relevant.
Always respond in English, regardless of input language.`;

export async function generateVision(
  projectDescription: string,
  projectId?: string,
): Promise<AIVisionSuggestion> {
  let context = '';
  if (projectId) {
    try {
      context = await buildProjectContext(projectId);
    } catch { /* no context available yet, that's fine */ }
  }

  const userMessage = context
    ? `Project description: ${projectDescription}\n\nExisting architecture context:\n${context}`
    : `Project description: ${projectDescription}`;

  const response = await callLLMWithFallback(VISION_SYSTEM_PROMPT, userMessage, 4096);
  const jsonMatch = response.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('Could not extract vision data from AI response');

  const parsed = JSON.parse(jsonMatch[0]) as AIVisionSuggestion;

  // Ensure arrays
  if (!Array.isArray(parsed.principles)) parsed.principles = [];
  if (!Array.isArray(parsed.drivers)) parsed.drivers = [];
  if (!Array.isArray(parsed.goals)) parsed.goals = [];

  return parsed;
}

// ─── Feature 2: AI Stakeholder Suggestions ───

const STAKEHOLDER_SYSTEM_PROMPT = `You are TheArchitect, an expert in TOGAF stakeholder analysis and enterprise architecture governance.

Given the project scope and vision, suggest 5-8 relevant stakeholders that should be involved.

For each stakeholder provide:
- name: A role-based template name (e.g., "CTO / Head of IT", "CISO / Security Lead", "Head of Finance")
- role: Their specific responsibility in this project
- stakeholderType: one of "c_level", "business_unit", "it_ops", "data_team", "external"
- interests: 2-4 specific interests relevant to THIS project (not generic)
- influence: "high", "medium", or "low" — based on their organizational power over this initiative
- attitude: "champion", "supporter", "neutral", or "critic" — based on how this project likely affects them
- rationale: 1 sentence explaining why they should be included

Ensure diversity: include at least 3 different stakeholderTypes. Include at least one potential critic (they provide valuable perspective).

Respond with ONLY a valid JSON array of stakeholder objects.
Always respond in English, regardless of input language.`;

export async function suggestStakeholders(
  scope: string,
  visionStatement: string,
): Promise<AIStakeholderSuggestion[]> {
  const userMessage = `Project scope: ${scope}\n\nVision statement: ${visionStatement}`;
  const response = await callLLMWithFallback(STAKEHOLDER_SYSTEM_PROMPT, userMessage, 4096);

  const jsonMatch = response.match(/\[[\s\S]*\]/);
  if (!jsonMatch) throw new Error('Could not extract stakeholder suggestions from AI response');

  return JSON.parse(jsonMatch[0]) as AIStakeholderSuggestion[];
}

// ─── Feature 3: AI Principle Scaffolding ───

const PRINCIPLES_SYSTEM_PROMPT = `You are TheArchitect with deep knowledge of TOGAF architecture principles and industry best practices.

Given the project scope, suggest 6-10 architecture principles that should guide this project.

TOGAF standard principles to consider:
- Technology Independence, Ease of Use, Common Use Applications
- Data is an Asset, Data is Shared, Data Trustee/Steward
- Service Orientation, Compliance with Law, IT Responsibility

Also consider domain-specific principles: Cloud-First, Security by Design, API-First, Data as Asset, Zero Trust, Privacy by Design, Automation First, etc.

For each principle provide:
- name: Short principle name (2-4 words)
- description: 1 sentence explaining the principle and why it matters

Exclude any principles already in the existing list.

Respond with ONLY a valid JSON array: [{"name":"...","description":"..."},...]
Always respond in English, regardless of input language.`;

export async function suggestPrinciples(
  scope: string,
  existingPrinciples: string[],
): Promise<AIPrincipleSuggestion[]> {
  const userMessage = `Project scope: ${scope}\n\nAlready established principles (exclude these): ${existingPrinciples.join(', ') || 'none yet'}`;
  const response = await callLLMWithFallback(PRINCIPLES_SYSTEM_PROMPT, userMessage, 2048);

  const jsonMatch = response.match(/\[[\s\S]*\]/);
  if (!jsonMatch) throw new Error('Could not extract principle suggestions from AI response');

  return JSON.parse(jsonMatch[0]) as AIPrincipleSuggestion[];
}

// ─── Feature 4: AI Conflict Detection ───

const CONFLICT_SYSTEM_PROMPT = `You are TheArchitect, an expert in stakeholder analysis and organizational dynamics.

Analyze the stakeholder matrix and detect:
1. **interest_conflict**: Stakeholders with opposing interests (e.g., CTO wants innovation vs CFO wants cost reduction)
2. **missing_type**: Important stakeholder types not represented for this kind of project
3. **influence_imbalance**: All stakeholders have the same influence, or critics have disproportionate influence vs champions
4. **coverage_gap**: Important domains or concerns not represented by any stakeholder

For each finding provide:
- stakeholderNames: array of involved stakeholder names (use ["N/A"] for gaps/missing types)
- conflictType: one of "interest_conflict", "missing_type", "influence_imbalance", "coverage_gap"
- severity: "high", "medium", or "low"
- description: What the issue is (1-2 sentences)
- recommendation: Specific actionable advice to resolve it (1-2 sentences)

If no issues found, return an empty array.

Respond with ONLY a valid JSON array.
Always respond in English, regardless of input language.`;

export async function detectConflicts(
  stakeholders: Array<{ name: string; role: string; stakeholderType: string; interests: string[]; influence: string; attitude: string }>,
): Promise<AIConflictInsight[]> {
  const stakeholderSummary = stakeholders.map(s =>
    `- ${s.name} (${s.role}): type=${s.stakeholderType}, influence=${s.influence}, attitude=${s.attitude}, interests=[${s.interests.join(', ')}]`
  ).join('\n');

  const userMessage = `Stakeholder matrix:\n${stakeholderSummary}`;
  const response = await callLLMWithFallback(CONFLICT_SYSTEM_PROMPT, userMessage, 2048);

  const jsonMatch = response.match(/\[[\s\S]*\]/);
  if (!jsonMatch) return [];

  return JSON.parse(jsonMatch[0]) as AIConflictInsight[];
}

// ─── Feature 5: AI Readiness Assessment ───

const READINESS_SYSTEM_PROMPT = `You are TheArchitect, a TOGAF Phase A quality assessor.

Evaluate the completeness and quality of this Architecture Vision. Score each category 0-100:

1. **Scope Quality**: Is it specific? Does it define boundaries, systems covered, timeframe?
2. **Vision Clarity**: Is it measurable? Does it describe a concrete target state with success criteria?
3. **Principles Strength**: Are they actionable? Do they guide real decisions and trade-offs?
4. **Drivers Completeness**: Do they cover business, technology, and regulatory aspects?
5. **Goals SMARTness**: Are goals Specific, Measurable, Achievable, Relevant, Time-bound?
6. **Stakeholder Coverage**: Are key types represented? Is influence/attitude diverse enough?

Provide:
- overallScore: weighted average (0-100)
- categories: array of {name, score, feedback, suggestions[]}
  - feedback: 1-2 sentences evaluating this category
  - suggestions: 1-3 specific actionable improvements
- topImprovements: the 3 most impactful things to improve right now

Be constructive but honest. If something is missing, say so clearly with a specific suggestion.

Respond with ONLY a valid JSON object.
Always respond in English, regardless of input language.`;

export async function assessReadiness(
  vision: { scope: string; visionStatement: string; principles: string[]; drivers: string[]; goals: string[] },
  stakeholders: Array<{ name: string; role: string; stakeholderType: string; interests: string[]; influence: string; attitude: string }>,
): Promise<AIReadinessAssessment> {
  const stakeholderSummary = stakeholders.length > 0
    ? stakeholders.map(s => `- ${s.name} (${s.role}): type=${s.stakeholderType}, influence=${s.influence}, attitude=${s.attitude}`).join('\n')
    : 'No stakeholders identified yet.';

  const userMessage = `Architecture Vision:
Scope: ${vision.scope || '(not defined)'}
Vision Statement: ${vision.visionStatement || '(not defined)'}
Principles: ${vision.principles.length > 0 ? vision.principles.join(', ') : '(none)'}
Drivers: ${vision.drivers.length > 0 ? vision.drivers.join(', ') : '(none)'}
Goals: ${vision.goals.length > 0 ? vision.goals.join(', ') : '(none)'}

Stakeholders (${stakeholders.length}):
${stakeholderSummary}`;

  const response = await callLLMWithFallback(READINESS_SYSTEM_PROMPT, userMessage, 4096);

  const jsonMatch = response.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('Could not extract readiness assessment from AI response');

  return JSON.parse(jsonMatch[0]) as AIReadinessAssessment;
}

// ─── Feature 6: AI Interest Suggestions ───

const INTERESTS_SYSTEM_PROMPT = `You are TheArchitect. Given a stakeholder type and project scope, suggest 6-8 relevant interests/concerns this stakeholder would have.

Respond with ONLY a JSON array of strings. Example: ["Cost Reduction","Data Security","Time-to-Market"]
Always respond in English, regardless of input language.`;

export async function suggestInterests(
  stakeholderType: string,
  scope: string,
): Promise<string[]> {
  const userMessage = `Stakeholder type: ${stakeholderType}\nProject scope: ${scope}`;
  const response = await callLLMWithFallback(INTERESTS_SYSTEM_PROMPT, userMessage, 1024);

  const jsonMatch = response.match(/\[[\s\S]*\]/);
  if (!jsonMatch) return [];

  return JSON.parse(jsonMatch[0]) as string[];
}

// ─── Feature 7: AI Document Extraction ───

const DOCUMENT_EXTRACTION_PROMPT = `You are TheArchitect, an expert at extracting TOGAF Phase A Architecture Vision data from documents.

Analyze this document and extract:
1. A "vision" object with: scope, visionStatement, principles[], drivers[], goals[]
2. A "stakeholders" array — identify any people, roles, or organizational units mentioned

For stakeholders, infer:
- name: The person/role name mentioned in the document
- role: Their responsibility
- stakeholderType: one of "c_level", "business_unit", "it_ops", "data_team", "external"
- interests: Infer 2-3 interests based on their role and context
- influence: "high", "medium", or "low"
- attitude: "champion", "supporter", "neutral", or "critic"
- rationale: Why they appear relevant

Only include data that the document clearly supports. Leave empty strings for fields with no data.

Respond with ONLY a valid JSON object:
{"vision":{"scope":"...","visionStatement":"...","principles":[],"drivers":[],"goals":[]},"stakeholders":[...]}
Always respond in English, regardless of document language.`;

export async function extractVisionFromDocument(
  documentText: string,
): Promise<AIDocumentExtraction> {
  const maxChars = 15000;
  const truncated = documentText.length > maxChars
    ? documentText.slice(0, maxChars) + '\n\n[... document truncated ...]'
    : documentText;

  const userMessage = `Extract TOGAF Phase A data from this document:\n\n${truncated}`;
  const response = await callLLMWithFallback(DOCUMENT_EXTRACTION_PROMPT, userMessage, 4096);

  const jsonMatch = response.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('Could not extract vision data from document');

  const parsed = JSON.parse(jsonMatch[0]) as AIDocumentExtraction;

  // Ensure structure
  if (!parsed.vision) parsed.vision = { scope: '', visionStatement: '', principles: [], drivers: [], goals: [] };
  if (!Array.isArray(parsed.stakeholders)) parsed.stakeholders = [];

  return parsed;
}
