// UC-ADD-004 Generator A — Process → Activities AI-Generator
// Reuses Anthropic SDK pattern from blueprint.service.ts and RAG-query from dataServer.service.ts.

import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import { runCypher, serializeNeo4jProperties } from '../config/neo4j';
import { isConfigured as isRagConfigured, queryDocuments } from './dataServer.service';
import { log } from '../config/logger';

// ─── Schema for generated activities ────────────────────────────────────────

export const GeneratedActivitySchema = z.object({
  name: z.string().min(2).max(120),
  owner: z.string().min(2).max(160),
  action: z.string().min(2).max(400),
  system: z.string().min(2).max(160),
  when: z.string().min(2).max(160),
  output: z.string().min(2).max(240),
  enables: z.string().min(0).max(240).optional().default(''),
});

export type GeneratedActivity = z.infer<typeof GeneratedActivitySchema>;

// ─── SSE event types ────────────────────────────────────────────────────────

export type GeneratorEvent =
  | { type: 'context'; ragChunks: number; processName: string }
  | { type: 'thinking' }
  | { type: 'activity'; index: number; activity: GeneratedActivity }
  | { type: 'done'; total: number; durationMs: number; tokenEstimate?: number }
  | { type: 'error'; message: string };

// ─── Public API ─────────────────────────────────────────────────────────────

interface ProcessRow {
  id: string;
  name: string;
  description?: string;
  layer?: string;
  type?: string;
}

export async function generateActivitiesForProcess(opts: {
  projectId: string;
  processId: string;
  onEvent: (event: GeneratorEvent) => void;
}): Promise<{ activities: GeneratedActivity[]; durationMs: number; tokenEstimate: number }> {
  const start = Date.now();

  // 1) Load process from Neo4j
  const proc = await loadProcess(opts.projectId, opts.processId);
  if (!proc) {
    throw new Error(`Process ${opts.processId} not found in project ${opts.projectId}`);
  }

  // 2) Load existing roles + applications as anti-hallucination hint
  const projectContext = await loadProjectContext(opts.projectId);

  // 3) RAG-query for compliance-context (best-effort, non-blocking)
  const ragChunks = await queryRagSafe(opts.projectId, proc);
  opts.onEvent({ type: 'context', ragChunks: ragChunks.length, processName: proc.name });

  // 4) Build prompt
  const systemPrompt = buildSystemPrompt();
  const userMessage = buildUserMessage(proc, projectContext, ragChunks);
  opts.onEvent({ type: 'thinking' });

  // 5) Claude call (bulk, then stream-emit per activity)
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY not configured');
  }
  const anthropic = new Anthropic({ apiKey });
  const message = await anthropic.messages.create({
    model: process.env.ANTHROPIC_MODEL || 'claude-haiku-4-5-20251001',
    system: systemPrompt,
    messages: [{ role: 'user', content: userMessage }],
    max_tokens: 4096,
  });

  const fullText = message.content[0]?.type === 'text' ? message.content[0].text : '';
  const tokenEstimate = (message.usage?.input_tokens ?? 0) + (message.usage?.output_tokens ?? 0);

  // 6) Parse + validate
  const activities = parseAndValidate(fullText);

  // 7) Emit per-activity events with small staggered delay → progressive UX
  for (let i = 0; i < activities.length; i++) {
    opts.onEvent({ type: 'activity', index: i, activity: activities[i] });
    await sleep(60); // visual rhythm without true token-streaming
  }

  const durationMs = Date.now() - start;
  opts.onEvent({ type: 'done', total: activities.length, durationMs, tokenEstimate });

  log.info(
    { projectId: opts.projectId, processId: opts.processId, activities: activities.length, durationMs, tokenEstimate },
    '[ActivityGenerator] generation complete'
  );

  return { activities, durationMs, tokenEstimate };
}

// ─── Helpers ────────────────────────────────────────────────────────────────

async function loadProcess(projectId: string, processId: string): Promise<ProcessRow | null> {
  const records = await runCypher(
    `MATCH (e:ArchitectureElement {id: $processId, projectId: $projectId})
     RETURN e LIMIT 1`,
    { processId, projectId },
  );
  if (records.length === 0) return null;
  const props = serializeNeo4jProperties(records[0].get('e').properties);
  return {
    id: props.id as string,
    name: props.name as string,
    description: (props.description as string) ?? '',
    layer: props.layer as string,
    type: props.type as string,
  };
}

interface ProjectContext {
  businessRoles: string[];
  applications: string[];
  capabilities: string[];
}

async function loadProjectContext(projectId: string): Promise<ProjectContext> {
  const records = await runCypher(
    `MATCH (e:ArchitectureElement {projectId: $projectId})
     WHERE e.type IN ['business_role', 'business_actor', 'application_component', 'application',
                       'business_capability', 'capability']
     RETURN e.type as type, e.name as name LIMIT 100`,
    { projectId },
  );
  const ctx: ProjectContext = { businessRoles: [], applications: [], capabilities: [] };
  for (const r of records) {
    const type = r.get('type') as string;
    const name = r.get('name') as string;
    if (!name) continue;
    if (type === 'business_role' || type === 'business_actor') ctx.businessRoles.push(name);
    else if (type === 'application_component' || type === 'application') ctx.applications.push(name);
    else if (type === 'business_capability' || type === 'capability') ctx.capabilities.push(name);
  }
  return ctx;
}

async function queryRagSafe(projectId: string, proc: ProcessRow): Promise<string[]> {
  if (!isRagConfigured()) return [];
  try {
    const queryText = [proc.name, proc.description].filter(Boolean).join(' — ');
    const res = await queryDocuments({ projectId, text: queryText, topK: 5 });
    return (res.chunks || [])
      .filter((c) => c.score >= 0.55)
      .map((c) => c.text)
      .slice(0, 5);
  } catch (err) {
    log.warn({ err: (err as Error).message }, '[ActivityGenerator] RAG query failed, continuing without context');
    return [];
  }
}

function buildSystemPrompt(): string {
  return `You are an enterprise architecture assistant specialized in BPMN-style process decomposition for compliance use cases.

Your job: given a Business Process, generate a sequential list of 5-12 Activities that compose it.

Each Activity must include these structured fields (no nulls, no empty strings):
- name: short BPMN-style activity name (Verb + Object), e.g. "Notify Authority"
- owner: the role/team executing it (use existing project roles when available, else realistic role names like "DPO", "Procurement-Compliance")
- action: one-sentence description of WHAT happens (verb + object + optional context)
- system: which system/tool/platform is used (real-world tools: SAP S/4, ServiceNow, BfDI-Portal, Microsoft Forms, etc.)
- when: deadline or timing pattern (e.g. "within 24h", "until 30.04.", "annually")
- output: the deliverable (a document, status, dataset, sign-off)
- enables: name of the next activity in the BPMN flow (or "Audit-Closure" / "Final Report" for the last one)

Constraints:
- BPMN-sequential order: Activity[i].enables MUST be Activity[i+1].name (or a final terminal state for the last one)
- Use German Compliance-Realität when the process domain is German/EU regulation (DPO, BfDI, BAuA, LkSG, CSRD, ESRS)
- Prefer concrete real-world systems over generic terms ("SAP Ariba" not "Procurement System")

Output format: a single JSON array of activity objects. NO prose, NO markdown fences, just the array.`;
}

function buildUserMessage(
  proc: ProcessRow,
  ctx: ProjectContext,
  ragChunks: string[],
): string {
  const lines: string[] = [];
  lines.push(`# Process to decompose`);
  lines.push(`Name: ${proc.name}`);
  if (proc.description) lines.push(`Description: ${proc.description}`);
  lines.push('');

  if (ctx.businessRoles.length > 0) {
    lines.push(`# Existing project roles (prefer these as Owner)`);
    lines.push(ctx.businessRoles.slice(0, 20).join(', '));
    lines.push('');
  }
  if (ctx.applications.length > 0) {
    lines.push(`# Existing applications (prefer these as System)`);
    lines.push(ctx.applications.slice(0, 20).join(', '));
    lines.push('');
  }
  if (ctx.capabilities.length > 0) {
    lines.push(`# Project capabilities (broader context)`);
    lines.push(ctx.capabilities.slice(0, 10).join(', '));
    lines.push('');
  }
  if (ragChunks.length > 0) {
    lines.push(`# Relevant compliance excerpts (from project standards)`);
    ragChunks.forEach((c, i) => lines.push(`[${i + 1}] ${c.slice(0, 600)}`));
    lines.push('');
  }

  lines.push(`# Task`);
  lines.push(`Generate 5-12 BPMN-sequential Activities for the process above.`);
  lines.push(`Output a JSON array of objects with the structured fields described in the system prompt.`);

  return lines.join('\n');
}

function parseAndValidate(text: string): GeneratedActivity[] {
  // Strip markdown fences if present
  const cleaned = text.replace(/^```(?:json)?\s*/, '').replace(/```\s*$/, '').trim();
  // Find first JSON array
  const match = cleaned.match(/\[[\s\S]*\]/);
  if (!match) {
    throw new Error('LLM response did not contain a JSON array');
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(match[0]);
  } catch (err) {
    throw new Error(`LLM returned invalid JSON: ${(err as Error).message}`);
  }
  if (!Array.isArray(parsed)) {
    throw new Error('LLM response is not an array');
  }
  const out: GeneratedActivity[] = [];
  for (let i = 0; i < parsed.length; i++) {
    const result = GeneratedActivitySchema.safeParse(parsed[i]);
    if (result.success) {
      out.push(result.data);
    } else {
      log.warn({ index: i, errors: result.error.flatten() }, '[ActivityGenerator] activity validation failed, skipping');
    }
  }
  if (out.length === 0) {
    throw new Error('No valid activities in LLM response after validation');
  }
  // Auto-fix Activity[i].enables to point to Activity[i+1].name
  for (let i = 0; i < out.length - 1; i++) {
    if (!out[i].enables) out[i].enables = out[i + 1].name;
  }
  if (!out[out.length - 1].enables) out[out.length - 1].enables = '—';
  return out;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
