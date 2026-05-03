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

  // 2b) Walk the spec chain UP from this process — realized Capabilities,
  // fulfilled Requirements (transitively, with source-standard cite), and
  // upstream/downstream Processes. Lets the LLM tie each Activity to a
  // concrete compliance anchor instead of staying generic.
  const specChain = await loadSpecChainContext(opts.projectId, opts.processId);

  // 3) RAG-query for compliance-context (best-effort, non-blocking)
  const ragChunks = await queryRagSafe(opts.projectId, proc);
  opts.onEvent({ type: 'context', ragChunks: ragChunks.length, processName: proc.name });

  // 4) Build prompt
  const systemPrompt = buildSystemPrompt();
  const userMessage = buildUserMessage(proc, projectContext, specChain, ragChunks);
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

interface SpecChainContext {
  realizedCapabilities: Array<{ name: string; description: string }>;
  fulfilledRequirements: Array<{
    name: string;
    description: string;
    sourceStandardName?: string;
    sourceSection?: string;
  }>;
  upstreamProcesses: string[];
  downstreamProcesses: string[];
}

/**
 * Walk the ArchiMate spec chain UPSTREAM from this Process, so the LLM can
 * generate Activities that explicitly reference what they fulfill instead of
 * staying generic. Three slices:
 *
 *   1. Realized Capabilities — Process --realization--> Capability
 *      (the business abilities this process implements)
 *   2. Fulfilled Requirements — transitively via Capability:
 *      Process -realization-> Capability -realization-> Requirement
 *      (so an ESRS-projected Requirement that the Capability covers
 *      gets surfaced; we also pull the source standard + section so
 *      the LLM can cite it in the Activity action)
 *   3. Upstream / downstream Processes via triggering / flow edges
 *      (BPMN context — what comes before/after THIS process)
 */
async function loadSpecChainContext(
  projectId: string,
  processId: string,
): Promise<SpecChainContext> {
  const ctx: SpecChainContext = {
    realizedCapabilities: [],
    fulfilledRequirements: [],
    upstreamProcesses: [],
    downstreamProcesses: [],
  };

  // 1) Realized Capabilities (Process --realization--> Capability)
  const capRecords = await runCypher(
    `MATCH (p:ArchitectureElement {id: $processId, projectId: $projectId})
       -[r:CONNECTS_TO]->(cap:ArchitectureElement)
     WHERE r.type IN ['realization', 'realisation']
       AND cap.type IN ['business_capability', 'capability']
       AND cap.projectId = $projectId
     RETURN cap.id AS id, cap.name AS name, cap.description AS description
     LIMIT 10`,
    { projectId, processId },
  );
  const capabilityIds: string[] = [];
  for (const r of capRecords) {
    const id = r.get('id') as string;
    const name = r.get('name') as string;
    if (!id || !name) continue;
    capabilityIds.push(id);
    ctx.realizedCapabilities.push({
      name,
      description: (r.get('description') as string) ?? '',
    });
  }

  // 2) Fulfilled Requirements (Capability -realization-> Requirement)
  if (capabilityIds.length > 0) {
    const reqRecords = await runCypher(
      `MATCH (cap:ArchitectureElement {projectId: $projectId})
         -[r:CONNECTS_TO]->(req:ArchitectureElement {type: 'requirement', projectId: $projectId})
       WHERE cap.id IN $capabilityIds
         AND r.type IN ['realization', 'realisation']
       RETURN DISTINCT req.name AS name, req.description AS description,
              req.sourceStandardName AS sourceStandardName,
              req.sourceSection AS sourceSection
       LIMIT 15`,
      { projectId, capabilityIds },
    );
    for (const r of reqRecords) {
      const name = r.get('name') as string;
      if (!name) continue;
      ctx.fulfilledRequirements.push({
        name,
        description: (r.get('description') as string) ?? '',
        sourceStandardName: (r.get('sourceStandardName') as string) ?? undefined,
        sourceSection: (r.get('sourceSection') as string) ?? undefined,
      });
    }
  }

  // 3) Upstream + downstream Processes (BPMN flow context)
  const flowRecords = await runCypher(
    `MATCH (p:ArchitectureElement {id: $processId, projectId: $projectId})
     OPTIONAL MATCH (upstream:ArchitectureElement {projectId: $projectId})
       -[ru:CONNECTS_TO]->(p)
     WHERE ru.type IN ['triggering', 'flow']
       AND upstream.type IN ['process', 'business_process']
     OPTIONAL MATCH (p)-[rd:CONNECTS_TO]->(downstream:ArchitectureElement {projectId: $projectId})
     WHERE rd.type IN ['triggering', 'flow']
       AND downstream.type IN ['process', 'business_process']
     RETURN collect(DISTINCT upstream.name) AS upstream,
            collect(DISTINCT downstream.name) AS downstream`,
    { projectId, processId },
  );
  if (flowRecords.length > 0) {
    const r = flowRecords[0];
    ctx.upstreamProcesses = (r.get('upstream') as (string | null)[]).filter((n): n is string => !!n).slice(0, 8);
    ctx.downstreamProcesses = (r.get('downstream') as (string | null)[]).filter((n): n is string => !!n).slice(0, 8);
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
- When the user message lists Business Capabilities this process realizes, the Activities together MUST advance those capabilities (don't drift into unrelated work)
- When the user message lists Compliance Requirements, anchor the Activities that produce evidence for them by name-citing the requirement (and §section if given) in the action or output field. NEVER invent regulation citations that aren't in the listed requirements.
- When upstream/downstream processes are listed, the FIRST activity should pick up where upstream leaves off, and the LAST activity's "enables" should hand off to the first downstream process

Output format: a single JSON array of activity objects. NO prose, NO markdown fences, just the array.`;
}

function buildUserMessage(
  proc: ProcessRow,
  ctx: ProjectContext,
  spec: SpecChainContext,
  ragChunks: string[],
): string {
  const lines: string[] = [];
  lines.push(`# Process to decompose`);
  lines.push(`Name: ${proc.name}`);
  if (proc.description) lines.push(`Description: ${proc.description}`);
  lines.push('');

  // ─── Spec-chain anchors (NEW — most important context) ───
  if (spec.realizedCapabilities.length > 0) {
    lines.push(`# Business Capabilities this process realizes`);
    lines.push(`(Activities should advance these capabilities — name them in the action when appropriate)`);
    for (const c of spec.realizedCapabilities) {
      lines.push(`- ${c.name}${c.description ? `: ${c.description.slice(0, 240)}` : ''}`);
    }
    lines.push('');
  }
  if (spec.fulfilledRequirements.length > 0) {
    lines.push(`# Compliance Requirements fulfilled (via the realized Capabilities)`);
    lines.push(`(When an Activity directly satisfies one of these, mention the requirement by name in the action and the source section in the output.)`);
    for (const r of spec.fulfilledRequirements) {
      const cite = [r.sourceStandardName, r.sourceSection].filter(Boolean).join(' §');
      const head = cite ? `${r.name} (${cite})` : r.name;
      lines.push(`- ${head}${r.description ? `: ${r.description.slice(0, 280)}` : ''}`);
    }
    lines.push('');
  }
  if (spec.upstreamProcesses.length > 0 || spec.downstreamProcesses.length > 0) {
    lines.push(`# BPMN flow context`);
    if (spec.upstreamProcesses.length > 0) {
      lines.push(`Triggered by: ${spec.upstreamProcesses.join(', ')}`);
    }
    if (spec.downstreamProcesses.length > 0) {
      lines.push(`Triggers: ${spec.downstreamProcesses.join(', ')}`);
      lines.push(`(The LAST activity should hand off cleanly to the first downstream process.)`);
    }
    lines.push('');
  }

  // ─── Project-wide actor/system pools (anti-hallucination) ───
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
    lines.push(`# Other project capabilities (broader context)`);
    lines.push(ctx.capabilities.slice(0, 10).join(', '));
    lines.push('');
  }
  if (ragChunks.length > 0) {
    lines.push(`# Relevant compliance excerpts (from project standards via RAG)`);
    ragChunks.forEach((c, i) => lines.push(`[${i + 1}] ${c.slice(0, 600)}`));
    lines.push('');
  }

  lines.push(`# Task`);
  lines.push(`Generate 5-12 BPMN-sequential Activities for the process above.`);
  if (spec.fulfilledRequirements.length > 0) {
    lines.push(`Where an Activity directly produces evidence for one of the listed Compliance Requirements, cite the requirement name (and §section if present) in the action OR output field. Do NOT cite requirements that aren't listed.`);
  }
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
