/**
 * inferLegalFields (.3 / REQ-WFCOMP-001.3, THE-354) — LLM-Vorschläge für b + c.
 *
 * Reuse des requirementGenerator-Musters (Haiku, injizierbarer Client, Zod).
 * Tier-A-Guards (deterministisch, hart): Abstain (Confidence), Conciseness-Bound,
 * Grounding, Vacuous-Filter. Ein Vorschlag, der einen Guard reißt, wird VERWORFEN
 * → Feld bleibt 'ask' (nie ein erzwungener schlechter Vorschlag).
 *
 * G7-Invariante: ein Vorschlag macht ein Feld NIE 'present' (das macht nur die
 * Attestierung). Hier wird nur vorgeschlagen.
 */
import type Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import type { SanitizedWorkflow, FieldSuggestion } from './types';
import { callLLM } from './llm';
import {
  WFCOMP_INFERENCE_SYSTEM_PROMPT,
  buildWfcompInferenceUserPrompt,
} from '../../prompts/wfcompInference.prompt';

const MAX_TOKENS = 1024;
const CONFIDENCE_THRESHOLD = 0.5;
const MAX_VALUE_CHARS = 140;

const InferenceResponseSchema = z.object({
  suggestions: z
    .array(
      z.object({
        litera: z.enum(['b', 'c']),
        value: z.string().min(1).max(400), // harte Kürze erzwingt der Bound-Guard, nicht Zod
        confidence: z.number().min(0).max(1),
        rationale: z.string().max(1000).default(''),
      }),
    )
    .max(8),
});

export class WfcompInferenceError extends Error {}

// ─── Tier-A Guards (deterministisch) ───

/** Conciseness: ≤ MAX_VALUE_CHARS und höchstens ein Satz. */
export function isConcise(value: string): boolean {
  if (value.length > MAX_VALUE_CHARS) return false;
  const sentences = (value.match(/[.!?]/g) || []).length;
  return sentences <= 1;
}

const VACUOUS = [
  'data processing',
  'datenverarbeitung',
  'processing of data',
  'various purposes',
  'general purpose',
  'business purposes',
  'automation',
  'workflow',
];
export function isVacuous(value: string): boolean {
  const v = value.toLowerCase().trim().replace(/[.!?]+$/, '');
  return VACUOUS.includes(v) || v.length < 4;
}

const SYNONYMS: Record<string, string[]> = {
  email: ['newsletter', 'marketing', 'mail', 'contact'],
  subscriber: ['subscription', 'subscriptions', 'signup'],
  webhook: ['form', 'signup', 'registration', 'intake'],
};

function conceptTokens(s: SanitizedWorkflow): Set<string> {
  const toks = new Set<string>();
  const add = (str: string) =>
    str
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((w) => w.length >= 4)
      .forEach((w) => toks.add(w));
  add(s.name);
  for (const n of s.nodes) {
    add(n.name);
    add(n.type.split('.').pop() || '');
    n.paramKeys.forEach(add);
    n.targetDomains.forEach(add);
  }
  for (const [k, vs] of Object.entries(SYNONYMS)) {
    if ([...toks].some((t) => t.startsWith(k.slice(0, 4)))) vs.forEach((v) => toks.add(v));
  }
  return toks;
}

/** Grounding: der Vorschlag teilt einen Stamm mit einem realen Workflow-Konzept. */
export function isGrounded(value: string, s: SanitizedWorkflow): boolean {
  const concepts = conceptTokens(s);
  const words = value
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length >= 4);
  return words.some((w) =>
    [...concepts].some((c) => c.startsWith(w.slice(0, 4)) || w.startsWith(c.slice(0, 4))),
  );
}

function passesGuards(value: string, confidence: number, s: SanitizedWorkflow): boolean {
  return (
    confidence >= CONFIDENCE_THRESHOLD &&
    isConcise(value) &&
    !isVacuous(value) &&
    isGrounded(value, s)
  );
}

// ─── LLM helpers ───

function extractJson(text: string): string {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenced) return fenced[1].trim();
  const first = text.indexOf('{');
  const last = text.lastIndexOf('}');
  return first === -1 || last === -1 || last < first ? text : text.slice(first, last + 1);
}

/** Parse + alle Tier-A-Guards anwenden. Exportiert für Tests. */
export function parseAndGuard(rawText: string, sanitized: SanitizedWorkflow): FieldSuggestion[] {
  let parsed: z.infer<typeof InferenceResponseSchema>;
  try {
    parsed = InferenceResponseSchema.parse(JSON.parse(extractJson(rawText)));
  } catch (err) {
    throw new WfcompInferenceError(`LLM output failed schema validation: ${(err as Error).message}`);
  }
  const seen = new Set<string>();
  const out: FieldSuggestion[] = [];
  for (const s of parsed.suggestions) {
    if (seen.has(s.litera)) continue; // ein Vorschlag pro Feld
    if (!passesGuards(s.value, s.confidence, sanitized)) continue; // Guard gerissen → abstain
    seen.add(s.litera);
    out.push({
      litera: s.litera,
      value: s.value.trim(),
      confidence: s.confidence,
      rationale: s.rationale,
      provenance: 'ai_generated',
    });
  }
  return out;
}

export async function inferLegalFields(
  sanitized: SanitizedWorkflow,
  opts?: { anthropicClient?: Anthropic },
): Promise<FieldSuggestion[]> {
  const text = await callLLM({
    system: WFCOMP_INFERENCE_SYSTEM_PROMPT,
    user: buildWfcompInferenceUserPrompt(sanitized),
    maxTokens: MAX_TOKENS,
    anthropicClient: opts?.anthropicClient,
  });
  if (!text) throw new WfcompInferenceError('LLM returned an empty response');
  return parseAndGuard(text, sanitized);
}

export const __testExports = { CONFIDENCE_THRESHOLD, MAX_VALUE_CHARS };
