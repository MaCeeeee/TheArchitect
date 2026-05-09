// UC-DATA-001 Generator D — Process → Data-Objects AI-Generator
// Closes the spec-chain gap between Business-Layer (Process/Activity/Capability)
// and Information-Layer (Data-Object/Data-Entity/Data-Model).
//
// Reuses the same Anthropic + RAG + Spec-Chain pattern as
// activityGenerator.service.ts (Generator A).

import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import { runCypher, serializeNeo4jProperties } from '../config/neo4j';
import { isConfigured as isRagConfigured, queryDocuments } from './dataServer.service';
import { log } from '../config/logger';

// ─── Schema for generated data-objects ──────────────────────────────────────

export const SensitivityEnum = z.enum(['PII', 'confidential', 'internal', 'public']);
export type Sensitivity = z.infer<typeof SensitivityEnum>;

export const DataClassEnum = z.enum(['transactional', 'master', 'reference', 'analytical', 'event', 'log']);
export type DataClass = z.infer<typeof DataClassEnum>;

// CRUD subset — combinations matter (e.g. "CR" = create + read).
// Validator below normalizes whitespace and uppercases.
const CrudPattern = /^[CRUD]+$/;

export const GeneratedDataObjectSchema = z.object({
  name: z.string().min(2).max(120),
  description: z.string().min(2).max(400),
  dataClass: DataClassEnum,
  sensitivity: SensitivityEnum,
  crudOperations: z.string().regex(CrudPattern, 'crudOperations must be C/R/U/D letters only'),
  archimateType: z
    .enum(['data_object', 'data_entity', 'data_model'])
    .optional()
    .default('data_object'),
});

export type GeneratedDataObject = z.infer<typeof GeneratedDataObjectSchema>;

// ─── SSE event types (mirrors activityGenerator) ────────────────────────────

export type DataObjectGeneratorEvent =
  | { type: 'context'; ragChunks: number; processName: string; existingDataObjectCount: number }
  | { type: 'thinking' }
  | { type: 'data_object'; index: number; dataObject: GeneratedDataObject }
  | { type: 'done'; total: number; durationMs: number; tokenEstimate?: number; rejectedCount: number }
  | { type: 'error'; message: string };

// ─── Public API ─────────────────────────────────────────────────────────────

interface ProcessRow {
  id: string;
  name: string;
  description?: string;
  layer?: string;
  type?: string;
}

export async function generateDataObjectsForProcess(opts: {
  projectId: string;
  processId: string;
  onEvent: (event: DataObjectGeneratorEvent) => void;
}): Promise<{
  dataObjects: GeneratedDataObject[];
  rejectedCount: number;
  durationMs: number;
  tokenEstimate: number;
}> {
  const start = Date.now();

  // 1) Load process from Neo4j
  const proc = await loadProcess(opts.projectId, opts.processId);
  if (!proc) {
    throw new Error(`Process ${opts.processId} not found in project ${opts.projectId}`);
  }

  // 2) Load existing project Data-Objects so the LLM knows what's already
  // there and (in V1) can suggest reuse-by-name. V2 will use embedding-
  // similarity for true semantic reuse — see strategy doc.
  const existingDataObjects = await loadExistingDataObjects(opts.projectId);

  // 3) Walk spec chain UP — what capabilities / requirements does this
  // process realize? Lets the LLM tie data needs to compliance anchors.
  const specChain = await loadSpecChainForProcess(opts.projectId, opts.processId);

  // 4) Connected applications (systems that this process uses) — informs
  // which application-layer data backing might exist.
  const connectedApps = await loadConnectedApplications(opts.projectId, opts.processId);

  // 5) RAG context (best-effort)
  const ragChunks = await queryRagSafe(opts.projectId, proc);
  opts.onEvent({
    type: 'context',
    ragChunks: ragChunks.length,
    processName: proc.name,
    existingDataObjectCount: existingDataObjects.length,
  });

  // 6) Build prompt
  const systemPrompt = buildSystemPrompt();
  const userMessage = buildUserMessage(proc, existingDataObjects, specChain, connectedApps, ragChunks);
  opts.onEvent({ type: 'thinking' });

  // 7) Anthropic call
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

  // 8) Parse + validate (REQ-DATA-002 schema-validation lives in parseAndValidate)
  const { valid: dataObjects, rejectedCount } = parseAndValidate(fullText);

  // 9) Stagger emit per data-object for progressive UX
  for (let i = 0; i < dataObjects.length; i++) {
    opts.onEvent({ type: 'data_object', index: i, dataObject: dataObjects[i] });
    await sleep(60);
  }

  const durationMs = Date.now() - start;
  opts.onEvent({ type: 'done', total: dataObjects.length, durationMs, tokenEstimate, rejectedCount });

  log.info(
    {
      projectId: opts.projectId,
      processId: opts.processId,
      generated: dataObjects.length,
      rejected: rejectedCount,
      durationMs,
      tokenEstimate,
    },
    '[DataObjectGenerator] generation complete',
  );

  return { dataObjects, rejectedCount, durationMs, tokenEstimate };
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

interface ExistingDataObject {
  name: string;
  description: string;
}

async function loadExistingDataObjects(projectId: string): Promise<ExistingDataObject[]> {
  const records = await runCypher(
    `MATCH (e:ArchitectureElement {projectId: $projectId})
     WHERE e.type IN ['data_object', 'data_entity', 'data_model']
     RETURN e.name AS name, e.description AS description
     ORDER BY e.name
     LIMIT 60`,
    { projectId },
  );
  return records
    .map((r) => ({
      name: (r.get('name') as string) ?? '',
      description: (r.get('description') as string) ?? '',
    }))
    .filter((d) => d.name.length > 0);
}

interface SpecChainContext {
  realizedCapabilities: Array<{ name: string; description: string }>;
  fulfilledRequirements: Array<{
    name: string;
    sourceStandardName?: string;
    sourceSection?: string;
  }>;
}

async function loadSpecChainForProcess(
  projectId: string,
  processId: string,
): Promise<SpecChainContext> {
  const ctx: SpecChainContext = { realizedCapabilities: [], fulfilledRequirements: [] };

  // Process --realization--> Capability
  const capRecords = await runCypher(
    `MATCH (p:ArchitectureElement {id: $processId, projectId: $projectId})
       -[r:CONNECTS_TO]->(cap:ArchitectureElement)
     WHERE r.type IN ['realization', 'realisation']
       AND cap.type IN ['business_capability', 'capability']
       AND cap.projectId = $projectId
     RETURN cap.id AS id, cap.name AS name, cap.description AS description
     LIMIT 8`,
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

  // Capability --realization--> Requirement (transitive compliance anchor)
  if (capabilityIds.length > 0) {
    const reqRecords = await runCypher(
      `MATCH (cap:ArchitectureElement {projectId: $projectId})
         -[r:CONNECTS_TO]->(req:ArchitectureElement {type: 'requirement', projectId: $projectId})
       WHERE cap.id IN $capabilityIds
         AND r.type IN ['realization', 'realisation']
       RETURN DISTINCT req.name AS name,
              req.sourceStandardName AS sourceStandardName,
              req.sourceSection AS sourceSection
       LIMIT 12`,
      { projectId, capabilityIds },
    );
    for (const r of reqRecords) {
      const name = r.get('name') as string;
      if (!name) continue;
      ctx.fulfilledRequirements.push({
        name,
        sourceStandardName: (r.get('sourceStandardName') as string) ?? undefined,
        sourceSection: (r.get('sourceSection') as string) ?? undefined,
      });
    }
  }

  return ctx;
}

async function loadConnectedApplications(
  projectId: string,
  processId: string,
): Promise<string[]> {
  const records = await runCypher(
    `MATCH (p:ArchitectureElement {id: $processId, projectId: $projectId})
     OPTIONAL MATCH (p)-[r1:CONNECTS_TO]->(app1:ArchitectureElement)
     WHERE app1.type IN ['application_component', 'application', 'application_service']
       AND app1.projectId = $projectId
     OPTIONAL MATCH (app2:ArchitectureElement)-[r2:CONNECTS_TO]->(p)
     WHERE app2.type IN ['application_component', 'application', 'application_service']
       AND app2.projectId = $projectId
     RETURN collect(DISTINCT app1.name) + collect(DISTINCT app2.name) AS apps`,
    { projectId, processId },
  );
  if (records.length === 0) return [];
  const apps = records[0].get('apps') as (string | null)[];
  return Array.from(new Set(apps.filter((n): n is string => !!n))).slice(0, 8);
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
    log.warn(
      { err: (err as Error).message },
      '[DataObjectGenerator] RAG query failed, continuing without context',
    );
    return [];
  }
}

function buildSystemPrompt(): string {
  return `You are an enterprise architecture assistant specialized in extracting Data-Object requirements from Business Processes for ArchiMate Information-Layer modeling.

Your job: given a Business Process, generate a list of 3-10 Data-Objects that this process produces or consumes.

Each Data-Object must include these structured fields (no nulls, no empty strings):
- name: concise data-object name in noun form (e.g. "Emissions-Record", "Supplier-Master")
- description: one-sentence description of what this data represents
- dataClass: one of "transactional" | "master" | "reference" | "analytical" | "event" | "log"
- sensitivity: one of "PII" | "confidential" | "internal" | "public"
  * PII = personally identifiable information about employees, customers, suppliers (names, emails, IDs that map to a person)
  * confidential = business secrets, contracts, financials, compliance findings
  * internal = operational data, not secret but not for external publication
  * public = published reports, marketing material, standardized references
- crudOperations: subset of "C", "R", "U", "D" letters representing what this process does to the data
  * Examples: "R" (read-only), "CRU" (creates, reads, updates), "CRUD" (full lifecycle)
- archimateType: one of "data_object" | "data_entity" | "data_model" (default "data_object")

Constraints:
- Prefer reusing names from the "Existing project Data-Objects" list when the LLM identifies the same logical data — do not invent variants like "EmissionsRecord-v2" when "Emissions-Record" already exists
- For German/EU regulated processes (LkSG, CSRD, ESRS, DSGVO), classify employee + supplier records as PII
- For audit-trail / log data: dataClass="log", sensitivity at least "internal"
- For ESG metrics (emissions, water, energy): dataClass="transactional" or "analytical" depending on aggregation level
- Capability + Requirement context tells you the COMPLIANCE PURPOSE — the data choices should support evidencing those requirements
- Connected applications hint at the SYSTEMS that materialize this data — name data-objects in the language those systems would use

Output format: a single JSON array of data-object objects. NO prose, NO markdown fences, just the array.`;
}

function buildUserMessage(
  proc: ProcessRow,
  existing: ExistingDataObject[],
  spec: SpecChainContext,
  apps: string[],
  ragChunks: string[],
): string {
  const lines: string[] = [];
  lines.push(`# Process to analyze`);
  lines.push(`Name: ${proc.name}`);
  if (proc.description) lines.push(`Description: ${proc.description}`);
  lines.push('');

  if (spec.realizedCapabilities.length > 0) {
    lines.push(`# Realized Capabilities (compliance-purpose anchors)`);
    for (const c of spec.realizedCapabilities) {
      lines.push(`- ${c.name}${c.description ? ': ' + c.description : ''}`);
    }
    lines.push('');
  }

  if (spec.fulfilledRequirements.length > 0) {
    lines.push(`# Compliance Requirements that the data should evidence`);
    for (const r of spec.fulfilledRequirements) {
      const cite = [r.sourceStandardName, r.sourceSection].filter(Boolean).join(' ');
      lines.push(`- ${r.name}${cite ? ` [${cite}]` : ''}`);
    }
    lines.push('');
  }

  if (apps.length > 0) {
    lines.push(`# Connected Applications (data backing systems)`);
    lines.push(apps.map((a) => `- ${a}`).join('\n'));
    lines.push('');
  }

  if (existing.length > 0) {
    lines.push(`# Existing project Data-Objects (prefer reusing these names when applicable)`);
    for (const d of existing.slice(0, 30)) {
      lines.push(`- ${d.name}${d.description ? ': ' + d.description.slice(0, 80) : ''}`);
    }
    lines.push('');
  }

  if (ragChunks.length > 0) {
    lines.push(`# Compliance-Document Context (top-${ragChunks.length} relevant chunks)`);
    for (const c of ragChunks) {
      lines.push(`---`);
      lines.push(c.slice(0, 600));
    }
    lines.push('');
  }

  lines.push(`# Task`);
  lines.push(
    `Generate 3-10 Data-Objects this process produces or consumes. Output ONLY a JSON array. No markdown, no prose.`,
  );

  return lines.join('\n');
}

// ─── Parse + Validate (REQ-DATA-002 lives here) ────────────────────────────

interface ParseResult {
  valid: GeneratedDataObject[];
  rejectedCount: number;
}

function parseAndValidate(rawText: string): ParseResult {
  // Strip Anthropic Haiku's frequent ```json``` wrapping
  const cleaned = rawText
    .replace(/^\s*```(?:json|JSON)?\s*\n?/m, '')
    .replace(/\n?\s*```\s*$/m, '')
    .trim();

  // Locate the JSON array
  const arrayMatch = cleaned.match(/\[[\s\S]*\]/);
  if (!arrayMatch) {
    log.warn(
      { snippet: cleaned.slice(0, 200) },
      '[DataObjectGenerator] no JSON array found in LLM response',
    );
    return { valid: [], rejectedCount: 0 };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(arrayMatch[0]);
  } catch (err) {
    log.warn(
      { err: (err as Error).message },
      '[DataObjectGenerator] JSON.parse failed on LLM response',
    );
    return { valid: [], rejectedCount: 0 };
  }

  if (!Array.isArray(parsed)) {
    log.warn('[DataObjectGenerator] LLM did not return an array');
    return { valid: [], rejectedCount: 0 };
  }

  const valid: GeneratedDataObject[] = [];
  let rejectedCount = 0;

  for (const item of parsed) {
    // Normalize crudOperations before zod check (strip whitespace, uppercase)
    if (item && typeof item === 'object' && 'crudOperations' in item) {
      const co = (item as Record<string, unknown>).crudOperations;
      if (typeof co === 'string') {
        (item as Record<string, unknown>).crudOperations = co.replace(/[^a-zA-Z]/g, '').toUpperCase();
      }
    }
    const result = GeneratedDataObjectSchema.safeParse(item);
    if (result.success) {
      valid.push(result.data);
    } else {
      rejectedCount++;
      log.warn(
        { errors: result.error.issues, item },
        '[DataObjectGenerator] dropped invalid suggestion',
      );
    }
  }

  return { valid, rejectedCount };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
