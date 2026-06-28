/**
 * UC-ICM-002 — LLM-driven Compliance Mapping Service
 *
 * Pipeline (Option C — no Qdrant Stage 1, suitable for ~10-50 element projects
 * like BSH-Demo). The service is pure: caller provides regulation + candidate
 * elements, service calls LLM, returns ComplianceMappingCandidate[].
 *
 * For larger projects (>~50 elements), the caller should pre-filter via Qdrant
 * semantic-recall (UC-SIM-001 pattern) and pass only top-N candidates here.
 *
 * Linear: THE-279 (REQ-ICM-002.2)
 */
import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import mongoose from 'mongoose';
import { ComplianceMapping, IComplianceMapping } from '../models/ComplianceMapping';
import { IRegulation } from '../models/Regulation';
import type {
  ComplianceMappingElementType,
  ComplianceMappingDTO,
} from '@thearchitect/shared';
import { buildRegulationKey } from '@thearchitect/shared';
import { computeVersionHash } from '../utils/regulationVersion';
import { log } from '../config/logger';
import {
  SYSTEM_PROMPT,
  buildUserPrompt,
  type PromptCandidateElement,
} from '../prompts/complianceMapping.prompt';

// ─── Configuration ──────────────────────────────────────────────

const DEFAULT_MODEL = 'claude-haiku-4-5-20251001';
const MAX_TOKENS = 2048;
const CONFIDENCE_THRESHOLD = 0.5;
const MAX_MAPPINGS_PER_REGULATION = 5;
const DEFAULT_BATCH_CONCURRENCY = 5;
const BATCH_CONCURRENCY_MAX = 10;

// ─── Zod Schema (validates LLM output) ──────────────────────────

const ELEMENT_TYPE_VALUES = [
  'capability',
  'application',
  'data_object',
  'business_process',
  'business_actor',
  'business_service',
  'application_service',
  'business_function',
  'business_object',
  'business_role',
  'technology_service',
  'node',
  'custom',
] as const;

export const ComplianceMappingResponseSchema = z.object({
  mappings: z
    .array(
      z.object({
        elementId: z.string().min(1),
        elementType: z.enum(ELEMENT_TYPE_VALUES),
        confidence: z.number().min(0).max(1),
        reasoning: z.string().max(500),
      })
    )
    .max(MAX_MAPPINGS_PER_REGULATION + 5), // tolerate slight LLM overrun, we cap below
});

export type ComplianceMappingResponse = z.infer<typeof ComplianceMappingResponseSchema>;

// ─── Public types ───────────────────────────────────────────────

/** Minimal element-info needed for the LLM prompt. */
export interface CandidateElement {
  id: string;
  name: string;
  type: ComplianceMappingElementType;
  layer?: string;
  description?: string;
}

/** A single LLM-derived mapping candidate (pre-persistence). */
export interface ComplianceMappingCandidate {
  elementId: string;
  elementType: ComplianceMappingElementType;
  confidence: number;
  reasoning: string;
}

export class ComplianceMappingError extends Error {
  constructor(message: string, public readonly cause?: unknown) {
    super(message);
    this.name = 'ComplianceMappingError';
  }
}

// ─── Public API ─────────────────────────────────────────────────

/**
 * Map a stored Regulation to candidate ArchiMate elements via LLM.
 * Persists results to MongoDB (upsert via compound index).
 *
 * AC-3 (idempotent), AC-2 (confidence + reasoning), AC-4 (threshold), AC-6 (upsert).
 */
export async function mapRegulationToElements(args: {
  regulation: IRegulation;
  candidateElements: CandidateElement[];
  projectId: string;
  anthropicClient?: Anthropic;
}): Promise<IComplianceMapping[]> {
  if (args.candidateElements.length === 0) {
    log.warn({ regulationId: args.regulation._id }, '[mapping] no candidate elements — skip');
    return [];
  }

  const candidates = await callLLM({
    regulation: args.regulation,
    candidateElements: args.candidateElements,
    anthropicClient: args.anthropicClient,
  });

  // Post-Validation: drop hallucinated elementIds (not in candidate list)
  const validIds = new Set(args.candidateElements.map(c => c.id));
  const sanitized = candidates.filter(c => {
    if (!validIds.has(c.elementId)) {
      log.warn(
        { regulationId: args.regulation._id, hallucinated: c.elementId },
        '[mapping] LLM hallucinated elementId — dropped'
      );
      return false;
    }
    return true;
  });

  const persisted = await persistMappings({
    candidates: sanitized,
    regulationId: args.regulation._id?.toString() ?? '',
    projectId: args.projectId,
    // Corpus reference (ADR-0001 / THE-306): pin the canonical key + the exact text version.
    regulationKey: buildRegulationKey(args.regulation.source, args.regulation.paragraphNumber),
    regulationVersionHash: computeVersionHash(args.regulation.fullText),
  });

  return persisted;
}

/**
 * Batch-Mapping mit Concurrency-Limit — D4 Performance-Tuning.
 *
 * Mappt eine Liste von Regulations gegen denselben Candidate-Element-Pool
 * parallel mit begrenzter Concurrency (default 5). Failed regulations
 * werden gesammelt, einzelne Failures killen den Batch NICHT.
 *
 * Performance-Ziel: < 90s für 50 Regs × 10 Elements (Haiku 4.5).
 * Empirisch (D4-Benchmark): ~3.2s/Reg sequential, ~32s @ concurrency=5.
 *
 * Rate-Limit-Safe: Anthropic Tier 2 ist 1000 RPM — Concurrency=5 mit
 * 3.2s/Call ≈ 95 RPM, weit unter Limit.
 */
export async function mapRegulationsBatch(args: {
  regulations: IRegulation[];
  candidateElements: CandidateElement[];
  projectId: string;
  concurrency?: number;
  anthropicClient?: Anthropic;
}): Promise<{
  totalRegulations: number;
  totalMapped: number;
  errors: Array<{ regulationId: string; error: string }>;
  durationMs: number;
}> {
  const start = Date.now();

  if (args.regulations.length === 0 || args.candidateElements.length === 0) {
    return {
      totalRegulations: args.regulations.length,
      totalMapped: 0,
      errors: [],
      durationMs: Date.now() - start,
    };
  }

  const concurrency = Math.max(
    1,
    Math.min(args.concurrency ?? DEFAULT_BATCH_CONCURRENCY, BATCH_CONCURRENCY_MAX),
  );

  const errors: Array<{ regulationId: string; error: string }> = [];
  let totalMapped = 0;

  const results = await runWithConcurrency(args.regulations, concurrency, async reg => {
    try {
      const persisted = await mapRegulationToElements({
        regulation: reg,
        candidateElements: args.candidateElements,
        projectId: args.projectId,
        anthropicClient: args.anthropicClient,
      });
      return { ok: true as const, count: persisted.length };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      log.warn(
        { regulationId: reg._id, err: msg },
        '[mapping.batch] regulation failed',
      );
      return {
        ok: false as const,
        regulationId: reg._id?.toString() ?? '',
        error: msg,
      };
    }
  });

  for (const r of results) {
    if (r.ok) totalMapped += r.count;
    else errors.push({ regulationId: r.regulationId, error: r.error });
  }

  return {
    totalRegulations: args.regulations.length,
    totalMapped,
    errors,
    durationMs: Date.now() - start,
  };
}

/**
 * Live-Mapping variant for UC-ICM-003.3 "Paste & See":
 * caller pastes arbitrary text, gets candidate mappings WITHOUT persisting.
 * The downstream /confirm endpoint persists if user accepts.
 */
export async function mapTextToElements(args: {
  text: string;
  source: string;
  paragraphNumber: string;
  language: 'de' | 'en';
  jurisdiction: string;
  candidateElements: CandidateElement[];
  anthropicClient?: Anthropic;
}): Promise<{ candidates: ComplianceMappingCandidate[] }> {
  if (args.candidateElements.length === 0) {
    return { candidates: [] };
  }

  // Build a synthetic Regulation context for the prompt
  const syntheticReg = {
    _id: new mongoose.Types.ObjectId(),
    source: args.source,
    paragraphNumber: args.paragraphNumber,
    title: `${args.source} ${args.paragraphNumber}`,
    fullText: args.text,
    language: args.language,
    jurisdiction: args.jurisdiction,
    effectiveFrom: new Date(),
  } as unknown as IRegulation;

  const candidates = await callLLM({
    regulation: syntheticReg,
    candidateElements: args.candidateElements,
    anthropicClient: args.anthropicClient,
  });

  const validIds = new Set(args.candidateElements.map(c => c.id));
  const sanitized = candidates.filter(c => validIds.has(c.elementId));

  return { candidates: sanitized };
}

// ─── Internal helpers ───────────────────────────────────────────

async function callLLM(args: {
  regulation: IRegulation;
  candidateElements: CandidateElement[];
  anthropicClient?: Anthropic;
}): Promise<ComplianceMappingCandidate[]> {
  const client = args.anthropicClient ?? getAnthropicClient();

  const promptCandidates: PromptCandidateElement[] = args.candidateElements.map(c => ({
    id: c.id,
    name: c.name,
    type: c.type,
    layer: c.layer,
    description: c.description,
  }));

  const userMessage = buildUserPrompt(
    {
      source: args.regulation.source,
      paragraphNumber: args.regulation.paragraphNumber,
      title: args.regulation.title,
      fullText: args.regulation.fullText,
      language: args.regulation.language,
      jurisdiction: args.regulation.jurisdiction,
      effectiveFrom: args.regulation.effectiveFrom?.toISOString().slice(0, 10),
    },
    promptCandidates
  );

  const model = process.env.ANTHROPIC_MODEL || DEFAULT_MODEL;

  let response;
  try {
    response = await client.messages.create({
      model,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userMessage }],
      max_tokens: MAX_TOKENS,
    });
  } catch (err) {
    throw new ComplianceMappingError(
      `Anthropic request failed: ${(err as Error).message}`,
      err
    );
  }

  const textBlock = response.content.find(b => b.type === 'text');
  const text = textBlock && textBlock.type === 'text' ? textBlock.text : '';
  if (!text) {
    throw new ComplianceMappingError('Anthropic returned empty text response');
  }

  return parseAndFilter(text);
}

function getAnthropicClient(): Anthropic {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new ComplianceMappingError('ANTHROPIC_API_KEY is not configured');
  }
  return new Anthropic({ apiKey });
}

/**
 * Parse LLM text → JSON → Zod-validate → filter by confidence threshold
 * → cap at MAX_MAPPINGS_PER_REGULATION (top-N by confidence).
 *
 * Exported for tests.
 */
export function parseAndFilter(rawText: string): ComplianceMappingCandidate[] {
  // Tolerate accidental markdown fences (```json ... ```)
  const jsonText = extractJson(rawText);

  let parsed: ComplianceMappingResponse;
  try {
    const json = JSON.parse(jsonText);
    parsed = ComplianceMappingResponseSchema.parse(json);
  } catch (err) {
    throw new ComplianceMappingError(
      `LLM output failed schema validation: ${(err as Error).message}`,
      err
    );
  }

  return parsed.mappings
    .filter(m => m.confidence >= CONFIDENCE_THRESHOLD)
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, MAX_MAPPINGS_PER_REGULATION);
}

function extractJson(text: string): string {
  // Strip markdown fences if any
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenced) return fenced[1].trim();
  // Otherwise: find first { and last }
  const first = text.indexOf('{');
  const last = text.lastIndexOf('}');
  if (first === -1 || last === -1 || last < first) return text;
  return text.slice(first, last + 1);
}

async function persistMappings(args: {
  candidates: ComplianceMappingCandidate[];
  regulationId: string;
  projectId: string;
  regulationKey?: string;
  regulationVersionHash?: string;
}): Promise<IComplianceMapping[]> {
  if (args.candidates.length === 0) return [];

  const projectObjectId = new mongoose.Types.ObjectId(args.projectId);
  const regulationObjectId = new mongoose.Types.ObjectId(args.regulationId);

  const operations = args.candidates.map(c => ({
    updateOne: {
      filter: {
        projectId: projectObjectId,
        regulationId: regulationObjectId,
        elementId: c.elementId,
      },
      update: {
        $set: {
          projectId: projectObjectId,
          regulationId: regulationObjectId,
          regulationKey: args.regulationKey,
          regulationVersionHash: args.regulationVersionHash,
          elementId: c.elementId,
          elementType: c.elementType,
          confidence: c.confidence,
          reasoning: c.reasoning,
          status: 'auto' as const,
          createdBy: 'llm' as const,
        },
      },
      upsert: true,
    },
  }));

  await ComplianceMapping.bulkWrite(operations, { ordered: false });

  // Return the persisted docs (re-query so we have full Mongoose objects with timestamps)
  return ComplianceMapping.find({
    projectId: projectObjectId,
    regulationId: regulationObjectId,
    elementId: { $in: args.candidates.map(c => c.elementId) },
  });
}

/**
 * Minimal concurrency limiter — runs `worker(item)` for each item with at most
 * `limit` concurrent invocations. Returns results in the SAME order as input.
 *
 * Sauberer als eine externe `p-limit`-Dependency und vollständig testbar.
 */
async function runWithConcurrency<T, R>(
  items: T[],
  limit: number,
  worker: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let nextIndex = 0;

  async function consumer(): Promise<void> {
    while (true) {
      const i = nextIndex++;
      if (i >= items.length) return;
      results[i] = await worker(items[i], i);
    }
  }

  const workers = Array.from({ length: Math.min(limit, items.length) }, () =>
    consumer(),
  );
  await Promise.all(workers);
  return results;
}

// Exported for testing internals
export const __testExports = {
  extractJson,
  parseAndFilter,
  runWithConcurrency,
  CONFIDENCE_THRESHOLD,
  MAX_MAPPINGS_PER_REGULATION,
  DEFAULT_BATCH_CONCURRENCY,
  BATCH_CONCURRENCY_MAX,
};
