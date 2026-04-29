// UC-ADD-004 Generator B — Capability → Processes AI-Generator
// Mirrors activityGenerator.service.ts; reuses Anthropic + RAG patterns.
//
// Decomposes a Business Capability into 3-7 Business Processes (BPMN-style
// "Verb + Object" names) that realize the capability.

import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import { runCypher, serializeNeo4jProperties } from '../config/neo4j';
import { isConfigured as isRagConfigured, queryDocuments } from './dataServer.service';
import { log } from '../config/logger';

// ─── Schema for generated processes ─────────────────────────────────────────

export const GeneratedProcessSchema = z.object({
  name: z.string().min(2).max(120),
  description: z.string().min(10).max(500),
});

export type GeneratedProcess = z.infer<typeof GeneratedProcessSchema>;

// ─── SSE event types ────────────────────────────────────────────────────────

export type ProcessGeneratorEvent =
  | { type: 'context'; ragChunks: number; capabilityName: string }
  | { type: 'thinking' }
  | { type: 'process'; index: number; process: GeneratedProcess }
  | { type: 'done'; total: number; durationMs: number; tokenEstimate?: number }
  | { type: 'error'; message: string };

// ─── Public API ─────────────────────────────────────────────────────────────

interface CapabilityRow {
  id: string;
  name: string;
  description?: string;
  layer?: string;
  type?: string;
}

export async function generateProcessesForCapability(opts: {
  projectId: string;
  capabilityId: string;
  onEvent: (event: ProcessGeneratorEvent) => void;
}): Promise<{ processes: GeneratedProcess[]; durationMs: number; tokenEstimate: number }> {
  const start = Date.now();

  // 1) Load capability from Neo4j
  const cap = await loadCapability(opts.projectId, opts.capabilityId);
  if (!cap) {
    throw new Error(`Capability ${opts.capabilityId} not found in project ${opts.projectId}`);
  }

  // 2) Load existing processes + roles as anti-hallucination + style hint
  const projectContext = await loadProjectContext(opts.projectId);

  // 3) RAG-query for compliance-context (best-effort, non-blocking)
  const ragChunks = await queryRagSafe(opts.projectId, cap);
  opts.onEvent({ type: 'context', ragChunks: ragChunks.length, capabilityName: cap.name });

  // 4) Build prompt
  const systemPrompt = buildSystemPrompt();
  const userMessage = buildUserMessage(cap, projectContext, ragChunks);
  opts.onEvent({ type: 'thinking' });

  // 5) Claude call
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY not configured');
  const anthropic = new Anthropic({ apiKey });
  const message = await anthropic.messages.create({
    model: process.env.ANTHROPIC_MODEL || 'claude-haiku-4-5-20251001',
    system: systemPrompt,
    messages: [{ role: 'user', content: userMessage }],
    max_tokens: 2400,
  });

  const fullText = message.content[0]?.type === 'text' ? message.content[0].text : '';
  const tokenEstimate = (message.usage?.input_tokens ?? 0) + (message.usage?.output_tokens ?? 0);

  // 6) Parse + validate
  const processes = parseAndValidate(fullText);

  // 7) Stream-emit per process for progressive UX
  for (let i = 0; i < processes.length; i++) {
    opts.onEvent({ type: 'process', index: i, process: processes[i] });
    await sleep(60);
  }

  const durationMs = Date.now() - start;
  opts.onEvent({ type: 'done', total: processes.length, durationMs, tokenEstimate });

  log.info(
    { projectId: opts.projectId, capabilityId: opts.capabilityId, processes: processes.length, durationMs, tokenEstimate },
    '[ProcessGenerator] generation complete'
  );

  return { processes, durationMs, tokenEstimate };
}

// ─── Helpers ────────────────────────────────────────────────────────────────

async function loadCapability(projectId: string, capabilityId: string): Promise<CapabilityRow | null> {
  const records = await runCypher(
    `MATCH (e:ArchitectureElement {id: $capabilityId, projectId: $projectId})
     RETURN e LIMIT 1`,
    { capabilityId, projectId },
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
  existingProcesses: string[];
  siblingCapabilities: string[];
}

async function loadProjectContext(projectId: string): Promise<ProjectContext> {
  const records = await runCypher(
    `MATCH (e:ArchitectureElement {projectId: $projectId})
     WHERE e.type IN ['business_role', 'business_actor', 'business_process', 'process',
                       'business_capability', 'capability']
     RETURN e.type as type, e.name as name LIMIT 200`,
    { projectId },
  );
  const ctx: ProjectContext = { businessRoles: [], existingProcesses: [], siblingCapabilities: [] };
  for (const r of records) {
    const type = r.get('type') as string;
    const name = r.get('name') as string;
    if (!name) continue;
    if (type === 'business_role' || type === 'business_actor') ctx.businessRoles.push(name);
    else if (type === 'business_process' || type === 'process') ctx.existingProcesses.push(name);
    else if (type === 'business_capability' || type === 'capability') ctx.siblingCapabilities.push(name);
  }
  return ctx;
}

async function queryRagSafe(projectId: string, cap: CapabilityRow): Promise<string[]> {
  if (!isRagConfigured()) return [];
  try {
    const queryText = [cap.name, cap.description].filter(Boolean).join(' — ');
    const res = await queryDocuments({ projectId, text: queryText, topK: 5 });
    return (res.chunks || [])
      .filter((c) => c.score >= 0.55)
      .map((c) => c.text)
      .slice(0, 5);
  } catch (err) {
    log.warn({ err: (err as Error).message }, '[ProcessGenerator] RAG query failed, continuing without context');
    return [];
  }
}

function buildSystemPrompt(): string {
  return `You are an enterprise architecture assistant specialized in TOGAF/ArchiMate process modeling for compliance use cases.

Your job: given a Business Capability, decompose it into 3-7 Business Processes that realize the capability.

A Capability answers WHAT the organization must be able to do.
A Process answers HOW it gets done — concrete, BPMN-style, repeatable workflows.

Each Process must include:
- name: BPMN-style "Verb + Object" name, e.g. "Conduct Risk Assessment", "Generate Compliance Report", "Onboard Supplier"
- description: ONE sentence describing what the process does and what triggers it

Constraints:
- 3-7 processes total — fewer when the capability is narrow, more when it's broad
- Each process must be MECE-disjoint from the others (no overlap)
- Together they should cover the capability end-to-end
- Use German compliance terminology when the domain is German/EU regulation (DPO-Notification, LkSG-Risikoanalyse, ESRS-Datenpunkt-Erfassung)
- AVOID duplicating processes already listed under "Existing processes" — those exist already

Output format: a single JSON array of process objects. NO prose, NO markdown fences, just the array.`;
}

function buildUserMessage(
  cap: CapabilityRow,
  ctx: ProjectContext,
  ragChunks: string[],
): string {
  const lines: string[] = [];
  lines.push(`# Capability to decompose`);
  lines.push(`Name: ${cap.name}`);
  if (cap.description) lines.push(`Description: ${cap.description}`);
  lines.push('');

  if (ctx.siblingCapabilities.length > 0) {
    lines.push(`# Sibling capabilities (for boundary awareness — do NOT duplicate their scope)`);
    lines.push(ctx.siblingCapabilities.filter((n) => n !== cap.name).slice(0, 12).join(', '));
    lines.push('');
  }
  if (ctx.existingProcesses.length > 0) {
    lines.push(`# Existing processes in project (do NOT propose duplicates)`);
    lines.push(ctx.existingProcesses.slice(0, 30).join(', '));
    lines.push('');
  }
  if (ctx.businessRoles.length > 0) {
    lines.push(`# Existing project roles (style hint for descriptions)`);
    lines.push(ctx.businessRoles.slice(0, 20).join(', '));
    lines.push('');
  }
  if (ragChunks.length > 0) {
    lines.push(`# Relevant compliance excerpts (from project standards)`);
    ragChunks.forEach((c, i) => lines.push(`[${i + 1}] ${c.slice(0, 600)}`));
    lines.push('');
  }

  lines.push(`# Task`);
  lines.push(`Decompose the capability into 3-7 BPMN-style Business Processes.`);
  lines.push(`Output a JSON array of objects with the structured fields described in the system prompt.`);

  return lines.join('\n');
}

function parseAndValidate(text: string): GeneratedProcess[] {
  const cleaned = text.replace(/^```(?:json)?\s*/, '').replace(/```\s*$/, '').trim();
  const match = cleaned.match(/\[[\s\S]*\]/);
  if (!match) throw new Error('LLM response did not contain a JSON array');
  let parsed: unknown;
  try {
    parsed = JSON.parse(match[0]);
  } catch (err) {
    throw new Error(`LLM returned invalid JSON: ${(err as Error).message}`);
  }
  if (!Array.isArray(parsed)) throw new Error('LLM response is not an array');
  const out: GeneratedProcess[] = [];
  for (let i = 0; i < parsed.length; i++) {
    const result = GeneratedProcessSchema.safeParse(parsed[i]);
    if (result.success) {
      out.push(result.data);
    } else {
      log.warn({ index: i, errors: result.error.flatten() }, '[ProcessGenerator] process validation failed, skipping');
    }
  }
  if (out.length === 0) {
    throw new Error('No valid processes in LLM response after validation');
  }
  return out;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
