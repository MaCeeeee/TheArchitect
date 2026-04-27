// UC-ADD-004 Generator C — PDF → Full Architecture-Hierarchy
// 5-Phase pipeline: Vision → Stakeholders → Capabilities → Processes → Activities
//
// Reuses Anthropic SDK and Claude prompt patterns from blueprint.service.ts.
// Reuses extractText() from document-parser.service.ts.
// Reuses ingestDocument() (best-effort RAG-ingest, fire-and-forget).

import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import { ingestDocument, isConfigured as isRagConfigured } from './dataServer.service';
import { log } from '../config/logger';

// ─── Schemas (Zod-validated AI output) ──────────────────────────────────────

export const VisionPhaseSchema = z.object({
  mission: z.string().min(20).max(600),
  visionStatements: z.array(z.string().min(10).max(400)).min(1).max(5),
  drivers: z.array(z.string().min(5).max(200)).max(8).default([]),
  principles: z.array(z.string().min(5).max(240)).max(10).default([]),
  goals: z.array(z.string().min(5).max(240)).max(8).default([]),
});

export const StakeholderSchema = z.object({
  name: z.string().min(2).max(120),
  role: z.string().min(2).max(160),
  stakeholderType: z.enum([
    'internal', 'external', 'regulator', 'customer',
    'supplier', 'employee', 'partner', 'investor', 'other',
  ]),
  influence: z.enum(['low', 'medium', 'high']),
  attitude: z.enum(['supportive', 'neutral', 'skeptical', 'blocker']),
  interests: z.array(z.string().max(160)).max(5).default([]),
});

export const CapabilitySchema = z.object({
  name: z.string().min(2).max(120),
  description: z.string().min(10).max(500),
  level: z.number().int().min(1).max(3).default(1),
});

export const ProcessSchema = z.object({
  parentCapability: z.string().min(2).max(120),
  name: z.string().min(2).max(120),
  description: z.string().min(10).max(500),
});

export const ActivitySchema = z.object({
  parentProcess: z.string().min(2).max(120),
  name: z.string().min(2).max(120),
  owner: z.string().min(2).max(160),
  action: z.string().min(2).max(400),
  system: z.string().min(2).max(160),
  when: z.string().min(2).max(160),
  output: z.string().min(2).max(240),
  enables: z.string().max(240).default(''),
});

export type VisionPhase = z.infer<typeof VisionPhaseSchema>;
export type Stakeholder = z.infer<typeof StakeholderSchema>;
export type Capability = z.infer<typeof CapabilitySchema>;
export type Process = z.infer<typeof ProcessSchema>;
export type Activity = z.infer<typeof ActivitySchema>;

export interface ExtractedHierarchy {
  vision: VisionPhase;
  stakeholders: Stakeholder[];
  capabilities: Capability[];
  processes: Process[];
  activities: Activity[];
}

// ─── SSE event types ────────────────────────────────────────────────────────

export type HierarchyEvent =
  | { type: 'extracted'; chars: number; ragIngested: boolean }
  | { type: 'phase-start'; phase: PhaseName }
  | { type: 'phase-done'; phase: PhaseName; count: number; durationMs: number }
  | { type: 'vision'; data: VisionPhase }
  | { type: 'stakeholder'; index: number; data: Stakeholder }
  | { type: 'capability'; index: number; data: Capability }
  | { type: 'process'; index: number; data: Process }
  | { type: 'activity'; index: number; data: Activity }
  | { type: 'done'; durationMs: number; tokenEstimate: number; counts: PhaseCounts }
  | { type: 'error'; phase?: PhaseName; message: string };

type PhaseName = 'vision' | 'stakeholders' | 'capabilities' | 'processes' | 'activities';

interface PhaseCounts {
  visionStatements: number;
  stakeholders: number;
  capabilities: number;
  processes: number;
  activities: number;
}

// ─── Public API ─────────────────────────────────────────────────────────────

export async function extractArchitectureFromDocument(opts: {
  projectId: string;
  fileBuffer: Buffer;
  fileName: string;
  mimeType: string;
  documentText: string;        // already extracted via extractText()
  onEvent: (e: HierarchyEvent) => void;
}): Promise<{ hierarchy: ExtractedHierarchy; durationMs: number; tokenEstimate: number }> {
  const start = Date.now();
  let totalTokens = 0;

  // 0) Truncate document text if too large (~ 60k chars budget for context across phases)
  const docText = truncateText(opts.documentText, 60_000);

  opts.onEvent({
    type: 'extracted',
    chars: docText.length,
    ragIngested: false,
  });

  // 0a) Fire-and-forget RAG ingest so future Generator-A calls have richer context
  if (isRagConfigured()) {
    ingestDocument({
      projectId: opts.projectId,
      source: 'user-upload',
      filename: opts.fileName,
      mimeType: opts.mimeType,
      content: docText,
      metadata: { language: detectLang(docText), tags: ['ai-extraction-source'] },
    })
      .then((res) => {
        opts.onEvent({ type: 'extracted', chars: docText.length, ragIngested: true });
        log.info({ projectId: opts.projectId, documentId: res.documentId, chunkCount: res.chunkCount }, '[Gen-C] RAG-ingest complete');
      })
      .catch((err) => {
        log.warn({ err: (err as Error).message }, '[Gen-C] RAG-ingest failed (non-blocking)');
      });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY not configured');
  const anthropic = new Anthropic({ apiKey });

  // ── Phase 1: Vision ─────────────────────────────────────────────────────
  opts.onEvent({ type: 'phase-start', phase: 'vision' });
  const tVision = Date.now();
  const vision = await callPhase(anthropic, buildVisionPrompt(docText), VisionPhaseSchema, 'vision');
  totalTokens += vision.tokens;
  opts.onEvent({ type: 'vision', data: vision.data });
  opts.onEvent({ type: 'phase-done', phase: 'vision', count: 1, durationMs: Date.now() - tVision });

  // ── Phase 2: Stakeholders ───────────────────────────────────────────────
  opts.onEvent({ type: 'phase-start', phase: 'stakeholders' });
  const tSh = Date.now();
  const stakeholders = await callPhaseArray(anthropic, buildStakeholderPrompt(docText, vision.data), StakeholderSchema, 'stakeholders');
  totalTokens += stakeholders.tokens;
  for (let i = 0; i < stakeholders.data.length; i++) {
    opts.onEvent({ type: 'stakeholder', index: i, data: stakeholders.data[i] });
    await sleep(40);
  }
  opts.onEvent({ type: 'phase-done', phase: 'stakeholders', count: stakeholders.data.length, durationMs: Date.now() - tSh });

  // ── Phase 3: Capabilities ───────────────────────────────────────────────
  opts.onEvent({ type: 'phase-start', phase: 'capabilities' });
  const tCap = Date.now();
  const capabilities = await callPhaseArray(anthropic, buildCapabilityPrompt(docText, vision.data, stakeholders.data), CapabilitySchema, 'capabilities');
  totalTokens += capabilities.tokens;
  for (let i = 0; i < capabilities.data.length; i++) {
    opts.onEvent({ type: 'capability', index: i, data: capabilities.data[i] });
    await sleep(40);
  }
  opts.onEvent({ type: 'phase-done', phase: 'capabilities', count: capabilities.data.length, durationMs: Date.now() - tCap });

  // ── Phase 4: Processes (per capability batch) ───────────────────────────
  opts.onEvent({ type: 'phase-start', phase: 'processes' });
  const tProc = Date.now();
  const processes = await callPhaseArray(anthropic, buildProcessPrompt(docText, capabilities.data), ProcessSchema, 'processes');
  totalTokens += processes.tokens;
  for (let i = 0; i < processes.data.length; i++) {
    opts.onEvent({ type: 'process', index: i, data: processes.data[i] });
    await sleep(40);
  }
  opts.onEvent({ type: 'phase-done', phase: 'processes', count: processes.data.length, durationMs: Date.now() - tProc });

  // ── Phase 5: Activities (per process, batched) ──────────────────────────
  opts.onEvent({ type: 'phase-start', phase: 'activities' });
  const tAct = Date.now();
  // Limit to top-N processes to control token usage on huge hierarchies
  const TOP_N_PROCESSES = 8;
  const processesForActivities = processes.data.slice(0, TOP_N_PROCESSES);
  const activities = await callPhaseArray(anthropic, buildActivityPrompt(processesForActivities), ActivitySchema, 'activities');
  totalTokens += activities.tokens;
  for (let i = 0; i < activities.data.length; i++) {
    opts.onEvent({ type: 'activity', index: i, data: activities.data[i] });
    await sleep(30);
  }
  opts.onEvent({ type: 'phase-done', phase: 'activities', count: activities.data.length, durationMs: Date.now() - tAct });

  const durationMs = Date.now() - start;
  const counts: PhaseCounts = {
    visionStatements: vision.data.visionStatements.length,
    stakeholders: stakeholders.data.length,
    capabilities: capabilities.data.length,
    processes: processes.data.length,
    activities: activities.data.length,
  };
  opts.onEvent({ type: 'done', durationMs, tokenEstimate: totalTokens, counts });

  log.info(
    { projectId: opts.projectId, durationMs, totalTokens, ...counts },
    '[Gen-C] hierarchy extraction complete',
  );

  return {
    hierarchy: {
      vision: vision.data,
      stakeholders: stakeholders.data,
      capabilities: capabilities.data,
      processes: processes.data,
      activities: activities.data,
    },
    durationMs,
    tokenEstimate: totalTokens,
  };
}

// ─── Phase callers ──────────────────────────────────────────────────────────

interface PhaseCallResult<T> { data: T; tokens: number; }
interface PhaseCallArrayResult<T> { data: T[]; tokens: number; }

async function callPhase<T>(
  anthropic: Anthropic,
  prompt: PhaseInput,
  schema: z.ZodType<T, z.ZodTypeDef, unknown>,
  phaseName: PhaseName,
): Promise<PhaseCallResult<T>> {
  const message = await anthropic.messages.create({
    model: process.env.ANTHROPIC_MODEL || 'claude-haiku-4-5-20251001',
    system: prompt.system,
    messages: [{ role: 'user', content: prompt.user }],
    max_tokens: prompt.maxTokens ?? 2048,
  });
  const text = message.content[0]?.type === 'text' ? message.content[0].text : '';
  const tokens = (message.usage?.input_tokens ?? 0) + (message.usage?.output_tokens ?? 0);
  const obj = parseJsonObject(text);
  const result = schema.safeParse(obj);
  if (!result.success) {
    log.warn({ phase: phaseName, errors: result.error.flatten() }, '[Gen-C] phase output validation failed');
    throw new Error(`${phaseName}-phase output failed validation: ${JSON.stringify(result.error.flatten())}`);
  }
  return { data: result.data, tokens };
}

async function callPhaseArray<T>(
  anthropic: Anthropic,
  prompt: PhaseInput,
  schema: z.ZodType<T, z.ZodTypeDef, unknown>,
  phaseName: PhaseName,
): Promise<PhaseCallArrayResult<T>> {
  const message = await anthropic.messages.create({
    model: process.env.ANTHROPIC_MODEL || 'claude-haiku-4-5-20251001',
    system: prompt.system,
    messages: [{ role: 'user', content: prompt.user }],
    max_tokens: prompt.maxTokens ?? 4096,
  });
  const text = message.content[0]?.type === 'text' ? message.content[0].text : '';
  const tokens = (message.usage?.input_tokens ?? 0) + (message.usage?.output_tokens ?? 0);
  const arr = parseJsonArray(text);
  const out: T[] = [];
  for (let i = 0; i < arr.length; i++) {
    const result = schema.safeParse(arr[i]);
    if (result.success) out.push(result.data);
    else log.warn({ phase: phaseName, index: i, errors: result.error.flatten() }, '[Gen-C] item validation failed, skipping');
  }
  if (out.length === 0) {
    throw new Error(`${phaseName}-phase produced no valid items`);
  }
  return { data: out, tokens };
}

// ─── Prompt builders ────────────────────────────────────────────────────────

interface PhaseInput { system: string; user: string; maxTokens?: number; }

function buildVisionPrompt(docText: string): PhaseInput {
  return {
    system: `You are an enterprise architect extracting strategic intent from a regulatory or business document.

Output a SINGLE JSON object (no array) with these fields:
- mission: one-sentence corporate mission implied by the document (or stated explicitly)
- visionStatements: 1-5 forward-looking outcome statements
- drivers: 2-8 short driver labels (regulations, market forces, technology shifts that PUSH the org)
- principles: 3-8 architectural / reporting / governance principles the document advocates (e.g. "Double Materiality", "Faithful Representation", "Comparability", "Cloud-First", "Audit-by-Design"). These are non-negotiable rules the architecture must follow.
- goals: 2-6 measurable strategic goals derived from the document (e.g. "Achieve auditable CSRD-compliance by Q1 2026", "Reduce Scope-1+2 emissions 50% by 2030")

Drivers vs Principles vs Goals:
- DRIVER = external force (regulation, market, technology) — answers WHY the change is needed
- PRINCIPLE = internal rule the org commits to — answers HOW we'll behave
- GOAL = measurable target — answers WHAT we'll achieve and BY WHEN

Output: ONLY the JSON object. NO prose, NO markdown fences.`,
    user: `# Document\n${docText.slice(0, 30_000)}\n\n# Task\nExtract mission + visionStatements + drivers + principles + goals. Be explicit and substantive — don't conflate categories.`,
    maxTokens: 2400,
  };
}

function buildStakeholderPrompt(docText: string, vision: VisionPhase): PhaseInput {
  return {
    system: `You are an enterprise architect identifying stakeholders relevant to a transformation initiative.

For each stakeholder, output: name (concrete role-name like "DPO" or "Board of Directors"), role, stakeholderType (one of: internal/external/regulator/customer/supplier/employee/partner/investor/other), influence (low/medium/high), attitude (supportive/neutral/skeptical/blocker), interests (1-3 concerns).

Generate 5-12 stakeholders. Be specific (no generic "Management"). Mix internal & external.

Output: ONLY a JSON array of stakeholder objects. NO prose, NO markdown fences.`,
    user: `# Mission\n${vision.mission}\n\n# Vision\n${vision.visionStatements.join('\n- ')}\n\n# Document excerpt\n${docText.slice(0, 12_000)}\n\n# Task\nDerive stakeholders.`,
    maxTokens: 3000,
  };
}

function buildCapabilityPrompt(docText: string, vision: VisionPhase, stakeholders: Stakeholder[]): PhaseInput {
  return {
    system: `You are an enterprise architect deriving Business Capabilities (ArchiMate Strategy Layer).

A capability = WHAT the organization must be able to do, not HOW. Capability names are noun phrases (e.g. "Greenhouse Gas Accounting", "Supplier Due Diligence"), level 1 = strategic (max 8-12).

For each: name, description (one sentence), level (1=strategic).

Output: ONLY a JSON array. NO prose, NO markdown fences.`,
    user: `# Mission\n${vision.mission}\n\n# Stakeholders to satisfy\n${stakeholders.slice(0, 10).map((s) => `- ${s.name} (${s.role})`).join('\n')}\n\n# Document excerpt\n${docText.slice(0, 12_000)}\n\n# Task\nDerive 6-12 strategic Business Capabilities.`,
    maxTokens: 2500,
  };
}

function buildProcessPrompt(docText: string, capabilities: Capability[]): PhaseInput {
  return {
    system: `You are an enterprise architect deriving Business Processes that realize Business Capabilities (ArchiMate Business Layer).

For each process: parentCapability (must EXACTLY match a capability name from the list provided), name (Verb + Object, BPMN-style: "Conduct Risk Assessment", "Generate Compliance Report"), description (one sentence).

For each capability provide 2-5 processes. Aim for 12-30 total processes.

Output: ONLY a JSON array. NO prose, NO markdown fences.`,
    user: `# Capabilities (use these exact names as parentCapability)\n${capabilities.map((c) => `- ${c.name}: ${c.description}`).join('\n')}\n\n# Document excerpt\n${docText.slice(0, 10_000)}\n\n# Task\nDerive 12-30 Business Processes, 2-5 per capability.`,
    maxTokens: 4000,
  };
}

function buildActivityPrompt(processes: Process[]): PhaseInput {
  return {
    system: `You are an enterprise architect decomposing Business Processes into BPMN-sequential Activities (ArchiMate sub-processes).

For each activity: parentProcess (EXACTLY matches a process name), name (Verb + Object), owner (role/team — concrete like "DPO", "Procurement-Compliance"), action (one-sentence what), system (real-world tool: SAP, ServiceNow, BfDI-Portal, etc.), when (timing/deadline), output (deliverable), enables (next-activity name in BPMN flow).

For each process generate 4-8 activities in sequential order. Last activity's "enables" can be empty or "—".

Output: ONLY a JSON array. NO prose, NO markdown fences.`,
    user: `# Processes (use these exact names as parentProcess)\n${processes.map((p) => `- ${p.name}: ${p.description}`).join('\n')}\n\n# Task\nDerive 4-8 BPMN-sequential Activities for EACH process. Total ~${processes.length * 6} activities.`,
    maxTokens: 8000,
  };
}

// ─── JSON parsing helpers ───────────────────────────────────────────────────

function parseJsonObject(text: string): unknown {
  const cleaned = text.replace(/^```(?:json)?\s*/, '').replace(/```\s*$/, '').trim();
  const match = cleaned.match(/\{[\s\S]*\}/);
  if (!match) throw new Error('No JSON object found in response');
  try {
    return JSON.parse(match[0]);
  } catch (err) {
    throw new Error(`Invalid JSON: ${(err as Error).message}`);
  }
}

function parseJsonArray(text: string): unknown[] {
  const cleaned = text.replace(/^```(?:json)?\s*/, '').replace(/```\s*$/, '').trim();
  const match = cleaned.match(/\[[\s\S]*\]/);
  if (!match) throw new Error('No JSON array found in response');
  try {
    const parsed = JSON.parse(match[0]);
    if (!Array.isArray(parsed)) throw new Error('Not an array');
    return parsed;
  } catch (err) {
    throw new Error(`Invalid JSON array: ${(err as Error).message}`);
  }
}

function truncateText(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  // Cut at a sentence boundary near the limit
  const cutoff = text.lastIndexOf('. ', maxChars);
  return text.slice(0, cutoff > 0 ? cutoff + 1 : maxChars) + '\n\n[…document truncated for context budget]';
}

function detectLang(text: string): string {
  // Crude heuristic: count German vs English stopwords
  const sample = text.slice(0, 2000).toLowerCase();
  let de = 0, en = 0;
  for (const w of [' der ', ' die ', ' und ', ' nicht ', ' werden ', ' eines ', ' von ']) if (sample.includes(w)) de++;
  for (const w of [' the ', ' and ', ' of ', ' to ', ' that ', ' in ', ' is ']) if (sample.includes(w)) en++;
  return de > en ? 'de' : 'en';
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
