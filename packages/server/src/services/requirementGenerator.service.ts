/**
 * UC-REQGEN-001 — Compliance Requirements Generator Service.
 *
 * Extracts actionable, structured Anforderungen aus einem Regulation-Paragraph
 * via Anthropic Haiku 4.5 + Zod-Schema.
 *
 * Pipeline:
 *   text + source + paragraphNumber [+ candidateElements]
 *     → Anthropic LLM with structured prompt
 *     → Zod-validated ComplianceRequirementCandidate[]
 *     → optional persist via persistRequirements()
 *
 * Pattern: complianceMapping.service.ts + dataObjectGenerator.service.ts
 *
 * Linear: THE-303 (REQ-REQGEN-001.2)
 */
import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import mongoose from 'mongoose';
import {
  ComplianceRequirement,
  IComplianceRequirement,
} from '../models/ComplianceRequirement';
import type { IRegulation } from '../models/Regulation';
import type {
  ComplianceRequirementPriority,
  ComplianceRequirementProvenance,
} from '@thearchitect/shared';
import { log } from '../config/logger';
import {
  SYSTEM_PROMPT,
  buildUserPrompt,
  type PromptCandidateElement,
} from '../prompts/requirementGenerator.prompt';

// ─── Configuration ──────────────────────────────────────────────

const DEFAULT_MODEL = 'claude-haiku-4-5-20251001';
// 8192: the explainability layer (2 rationales/req) roughly doubled output size.
// 4096 truncated the JSON mid-array for paragraphs that yield 8-10 requirements.
const MAX_TOKENS = 8192;
const CONFIDENCE_THRESHOLD = 0.5;
const MAX_REQUIREMENTS_PER_PARAGRAPH = 10;

// ─── Zod Schema (validates LLM output) ──────────────────────────

const PRIORITY_VALUES = ['must', 'should', 'may'] as const;

export const RequirementGeneratorResponseSchema = z.object({
  requirements: z
    .array(
      z.object({
        title: z.string().min(5).max(200),
        description: z.string().min(5).max(2000),
        priority: z.enum(PRIORITY_VALUES),
        linkedElementIds: z.array(z.string().min(1)).default([]),
        // Explainability layer: two distinct axes + their rationales.
        extractionConfidence: z.number().min(0).max(1),
        extractionRationale: z.string().min(1).max(1000),  // mandatory — the audit "why score"
        mappingConfidence: z.number().min(0).max(1).default(0),
        mappingRationale: z.string().max(1000).default(''), // may be '' when no element matched
      }),
    )
    .max(MAX_REQUIREMENTS_PER_PARAGRAPH + 5),
});

export type RequirementGeneratorResponse = z.infer<typeof RequirementGeneratorResponseSchema>;

// ─── Public types ───────────────────────────────────────────────

export interface CandidateElement {
  id: string;
  name: string;
  type: string;
  layer?: string;
  description?: string;
}

export interface ComplianceRequirementCandidate {
  title: string;
  description: string;
  priority: ComplianceRequirementPriority;
  linkedElementIds: string[];
  // Explainability layer (audit-grade)
  extractionConfidence: number;   // "is this a genuine obligation?" (anti-hallucination)
  extractionRationale: string;    // why genuine + why this score
  mappingConfidence: number;      // "how well do the linked elements fit?" (0 if none)
  mappingRationale: string;       // why these elements (or why none)
}

export class RequirementGeneratorError extends Error {
  constructor(message: string, public readonly cause?: unknown) {
    super(message);
    this.name = 'RequirementGeneratorError';
  }
}

// ─── Public API ─────────────────────────────────────────────────

/**
 * Generate ComplianceRequirements from a regulation paragraph text.
 *
 * Two modes:
 *   - PREVIEW (no persist): omit `persist=true`. Returns candidates only.
 *   - PERSIST: pass `persist=true` + projectId + regulationId. Upserts into DB.
 *
 * Hallucination-Filter: if candidateElements provided, linkedElementIds are
 * filtered to only contain ids from that list.
 */
export async function generateRequirementsFromText(args: {
  text: string;
  source: string;
  paragraphNumber: string;
  language: 'de' | 'en';
  jurisdiction: string;
  candidateElements?: CandidateElement[];
  // Persist options
  persist?: boolean;
  projectId?: string;
  regulationId?: string;
  anthropicClient?: Anthropic;
}): Promise<{
  candidates: ComplianceRequirementCandidate[];
  persisted?: IComplianceRequirement[];
}> {
  if (args.text.trim().length < 20) {
    throw new RequirementGeneratorError('text must be ≥ 20 chars');
  }
  if (args.text.length > 12_000) {
    throw new RequirementGeneratorError('text too long (max 12000)');
  }

  const candidates = await callLLM({
    text: args.text,
    source: args.source,
    paragraphNumber: args.paragraphNumber,
    language: args.language,
    jurisdiction: args.jurisdiction,
    candidateElements: args.candidateElements ?? [],
    anthropicClient: args.anthropicClient,
  });

  // Post-validation: drop hallucinated elementIds
  const validIds = new Set((args.candidateElements ?? []).map(c => c.id));
  const sanitized = candidates.map(c => ({
    ...c,
    linkedElementIds:
      args.candidateElements && args.candidateElements.length > 0
        ? c.linkedElementIds.filter(id => {
            if (!validIds.has(id)) {
              log.warn(
                { paragraph: args.paragraphNumber, hallucinated: id },
                '[requirementGen] LLM hallucinated elementId — dropped',
              );
              return false;
            }
            return true;
          })
        : c.linkedElementIds,
  }));

  // Persist if requested
  let persisted: IComplianceRequirement[] | undefined;
  if (args.persist) {
    if (!args.projectId || !args.regulationId) {
      throw new RequirementGeneratorError(
        'persist=true requires projectId + regulationId',
      );
    }
    persisted = await persistRequirements({
      candidates: sanitized,
      projectId: args.projectId,
      regulationId: args.regulationId,
      sourceParagraph: args.text.slice(0, 5000),
    });
  }

  return { candidates: sanitized, persisted };
}

// ─── Internal helpers ───────────────────────────────────────────

async function callLLM(args: {
  text: string;
  source: string;
  paragraphNumber: string;
  language: 'de' | 'en';
  jurisdiction: string;
  candidateElements: CandidateElement[];
  anthropicClient?: Anthropic;
}): Promise<ComplianceRequirementCandidate[]> {
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
      source: args.source,
      paragraphNumber: args.paragraphNumber,
      fullText: args.text,
      language: args.language,
      jurisdiction: args.jurisdiction,
    },
    promptCandidates,
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
    throw new RequirementGeneratorError(
      `Anthropic request failed: ${(err as Error).message}`,
      err,
    );
  }

  const textBlock = response.content.find(b => b.type === 'text');
  const text = textBlock && textBlock.type === 'text' ? textBlock.text : '';
  if (!text) {
    throw new RequirementGeneratorError('Anthropic returned empty text response');
  }

  return parseAndFilter(text);
}

function getAnthropicClient(): Anthropic {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new RequirementGeneratorError('ANTHROPIC_API_KEY is not configured');
  }
  return new Anthropic({ apiKey });
}

/**
 * Parse LLM text → JSON → Zod-validate → confidence-filter → cap.
 * Exported for tests.
 */
export function parseAndFilter(rawText: string): ComplianceRequirementCandidate[] {
  const jsonText = extractJson(rawText);

  let parsed: RequirementGeneratorResponse;
  try {
    const json = JSON.parse(jsonText);
    parsed = RequirementGeneratorResponseSchema.parse(json);
  } catch (err) {
    throw new RequirementGeneratorError(
      `LLM output failed schema validation: ${(err as Error).message}`,
      err,
    );
  }

  return parsed.requirements
    .filter(r => r.extractionConfidence >= CONFIDENCE_THRESHOLD)
    .sort((a, b) => {
      // priority order: must > should > may, then extractionConfidence desc
      const pa = priorityRank(a.priority);
      const pb = priorityRank(b.priority);
      if (pa !== pb) return pa - pb;
      return b.extractionConfidence - a.extractionConfidence;
    })
    .slice(0, MAX_REQUIREMENTS_PER_PARAGRAPH);
}

function priorityRank(p: ComplianceRequirementPriority): number {
  return p === 'must' ? 0 : p === 'should' ? 1 : 2;
}

function extractJson(text: string): string {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenced) return fenced[1].trim();
  const first = text.indexOf('{');
  const last = text.lastIndexOf('}');
  if (first === -1 || last === -1 || last < first) return text;
  return text.slice(first, last + 1);
}

async function persistRequirements(args: {
  candidates: ComplianceRequirementCandidate[];
  projectId: string;
  regulationId: string;
  sourceParagraph: string;
}): Promise<IComplianceRequirement[]> {
  if (args.candidates.length === 0) return [];

  const projectObjectId = new mongoose.Types.ObjectId(args.projectId);
  const regulationObjectId = new mongoose.Types.ObjectId(args.regulationId);

  const operations = args.candidates.map(c => ({
    updateOne: {
      filter: {
        projectId: projectObjectId,
        regulationId: regulationObjectId,
        title: c.title,
      },
      update: {
        $set: {
          projectId: projectObjectId,
          regulationId: regulationObjectId,
          sourceParagraph: args.sourceParagraph,
          title: c.title,
          description: c.description,
          priority: c.priority,
          linkedElementIds: c.linkedElementIds,
          status: 'open' as const,
          createdBy: 'llm' as ComplianceRequirementProvenance,
          extractionConfidence: c.extractionConfidence,
          extractionRationale: c.extractionRationale,
          mappingConfidence: c.mappingConfidence,
          mappingRationale: c.mappingRationale,
        },
      },
      upsert: true,
    },
  }));

  await ComplianceRequirement.bulkWrite(operations, { ordered: false });

  // Return persisted docs (re-query)
  return ComplianceRequirement.find({
    projectId: projectObjectId,
    regulationId: regulationObjectId,
    title: { $in: args.candidates.map(c => c.title) },
  });
}

// Exported for testing
export const __testExports = {
  extractJson,
  parseAndFilter,
  priorityRank,
  CONFIDENCE_THRESHOLD,
  MAX_REQUIREMENTS_PER_PARAGRAPH,
};
