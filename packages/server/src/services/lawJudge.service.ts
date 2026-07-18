/**
 * UC-LAW-002 Slice-2 (THE-462) — Law-Applicability-Judge: bewertet PRO
 * Kandidaten-Gesetz (Slice-1-Retrieval-Treffer), ob es für die vorliegende
 * Architektur gilt.
 *
 * Struktur 1:1 aus complianceJudge.service.ts gespiegelt: Tool-Use-JSON,
 * Zod-Validierung, MAX_ATTEMPTS=2-Retry (Tool-Use bevorzugt, Text-JSON-
 * Fallback via `extractJudgeJson` — REUSE, keine Duplikate), Sanitizing
 * gegen halluzinierte families/elementIds, injizierbarer Anthropic-Client
 * (testbar ohne Netz), best-effort AiTrace.
 *
 * Kosten-Disziplin (THE-462 AC-2): in-process Cache je
 * (sha(profileText), family, corpusVersionHash, resolvedModel) — Modell MUSS
 * im Key, sonst überlebt ein Cache-Hit einen Modell-Wechsel unbemerkt. Dieser
 * Cache ist nur die ERSTE Ebene; die dauerhafte Disziplin über Redeploys
 * hinweg liegt in der persistierten Finding-Lookup (lawDiscoveryFinding
 * .service / discoverAndJudge, Task 6+8).
 *
 * Linear: THE-462 (REQ-LAW-002.3)
 */
import { createHash } from 'node:crypto';
import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import type { LawJudgeVerdict } from '@thearchitect/shared';
import { computeVersionHash } from '../utils/regulationVersion';
import { recordAiTrace } from './aiTrace.service';
import { extractJudgeJson, ComplianceJudgeError } from './complianceJudge.service';
import {
  LAW_JUDGE_SYSTEM_PROMPT,
  buildLawJudgeUserPrompt,
  type LawJudgeCandidate,
  type LawJudgeElement,
} from '../prompts/lawJudge.prompt';

export const LAW_JUDGE_PROMPT_VERSION_HASH = computeVersionHash(LAW_JUDGE_SYSTEM_PROMPT);

const DEFAULT_LAW_JUDGE_MODEL =
  process.env.LAW_DISCOVERY_JUDGE_MODEL || 'claude-haiku-4-5-20251001';
const MAX_TOKENS = 2048;

// ─── Schema ─────────────────────────────────────────────────────

const LawJudgeResponseSchema = z.object({
  family: z.string().min(1),
  applies: z.boolean(),
  // Bounds IM Schema (Spec-Fix 3, Muster complianceJudge `.max(400)`): out-of-
  // range löst den Retry aus statt still geklemmt zu werden — das nachgelagerte
  // Klemmen/Kürzen in sanitize bleibt als Belt-and-Suspenders.
  confidence: z.number().min(0).max(1),
  reasoning: z.string().max(500),
  elementIds: z.array(z.string()).default([]),
  keyParagraphs: z.array(z.string()).default([]),
});

type LawJudgeResponse = z.infer<typeof LawJudgeResponseSchema>;

/**
 * Tool-Schema erzwingt valides JSON (Muster complianceJudge JUDGE_TOOL) — statt
 * Freitext-JSON zu parsen, gibt das Modell ein tool_use-Objekt zurück, das die
 * API garantiert schema-konform serialisiert.
 */
const LAW_JUDGE_TOOL: Anthropic.Tool = {
  name: 'submit_law_verdicts',
  description: 'Submit the applicability verdict for the candidate law family.',
  input_schema: {
    type: 'object',
    properties: {
      family: { type: 'string' },
      applies: { type: 'boolean' },
      confidence: { type: 'number' },
      reasoning: { type: 'string' },
      elementIds: { type: 'array', items: { type: 'string' } },
      keyParagraphs: { type: 'array', items: { type: 'string' } },
    },
    required: ['family', 'applies', 'confidence', 'reasoning', 'elementIds', 'keyParagraphs'],
  },
};

export class LawJudgeError extends Error {
  constructor(message: string, public readonly cause?: unknown) {
    super(message);
    this.name = 'LawJudgeError';
  }
}

// ─── Reine Helfer (testbar) ─────────────────────────────────────

/**
 * Sanitizing gegen Halluzination (THE-462 AC-5):
 * - `family` wird IMMER auf die Kandidaten-Family fixiert (Modell darf sie
 *   nie ändern/erfinden) — der Judge bewertet genau EINEN Kandidaten.
 * - `elementIds` ∩ tatsächliche Profil-Element-Ids.
 * - `keyParagraphs` ∩ tatsächliche Kandidaten-topHits-regulationKeys.
 * - `confidence` hart auf [0,1] geklemmt.
 * - `reasoning` hart auf 500 Zeichen gekürzt.
 */
export function sanitizeLawJudgeResponse(
  parsed: LawJudgeResponse,
  candidateFamily: string,
  validElementIds: string[],
  validKeyParagraphs: string[],
): LawJudgeVerdict {
  const elementSet = new Set(validElementIds);
  const paragraphSet = new Set(validKeyParagraphs);
  return {
    family: candidateFamily,
    applies: parsed.applies,
    confidence: Math.max(0, Math.min(1, parsed.confidence)),
    reasoning: parsed.reasoning.slice(0, 500),
    elementIds: parsed.elementIds.filter(id => elementSet.has(id)),
    keyParagraphs: parsed.keyParagraphs.filter(k => paragraphSet.has(k)),
  };
}

/**
 * AC-4 (Slice-2b Fix 1): Anzeige-Titel je keyParagraph aus den Kandidaten-
 * topHits ableiten (`title` ist dort vorhanden). Additiv — Fallback bleibt
 * der rohe regulationKey, falls ein Key wider Erwarten keinen Titel hat.
 */
export function buildKeyParagraphDetails(
  keyParagraphs: string[],
  topHits: Array<{ regulationKey: string; title: string }>,
): Array<{ regulationKey: string; title: string }> {
  const titleByKey = new Map(topHits.map(h => [h.regulationKey, h.title]));
  return keyParagraphs.map(k => ({ regulationKey: k, title: titleByKey.get(k) ?? k }));
}

// ─── Cache (in-process, THE-462 AC-2) ────────────────────────────

const judgeCache = new Map<string, LawJudgeVerdict>();
// Code-Review-Fix: FIFO-Cap gegen unbegrenztes Wachstum über Prozesslaufzeit —
// die DAUERHAFTE Dedup-Funktion liegt in der persistierten findExisting-Lookup
// (discoverAndJudge); dieser Cache fängt nur kurzfristige Doppel-Calls ab.
const JUDGE_CACHE_MAX = 500;

function cacheKey(profileText: string, family: string, corpusVersionHash: string, model: string): string {
  const profileHash = createHash('sha256').update(profileText, 'utf8').digest('hex');
  return `${profileHash}|${family}|${corpusVersionHash}|${model}`;
}

/** Test-only: Cache zwischen Tests zurücksetzen. */
export function __resetJudgeCache(): void {
  judgeCache.clear();
}

// ─── LLM-Call ───────────────────────────────────────────────────

export interface JudgeCandidateArgs {
  profileText: string;
  profileElements: LawJudgeElement[];
  candidate: LawJudgeCandidate;
  projectId: string;
  corpusVersionHash: string;
  model?: string;
  anthropicClient?: Anthropic;
}

export async function judgeCandidate(args: JudgeCandidateArgs): Promise<LawJudgeVerdict> {
  const model = args.model || DEFAULT_LAW_JUDGE_MODEL;
  const key = cacheKey(args.profileText, args.candidate.family, args.corpusVersionHash, model);
  const cached = judgeCache.get(key);
  if (cached) return cached;

  const client =
    args.anthropicClient ??
    (() => {
      const apiKey = process.env.ANTHROPIC_API_KEY;
      if (!apiKey) throw new LawJudgeError('ANTHROPIC_API_KEY is not configured');
      return new Anthropic({ apiKey });
    })();

  const userMessage = buildLawJudgeUserPrompt({
    profileText: args.profileText,
    profileElements: args.profileElements,
    candidate: args.candidate,
  });
  const startedAt = Date.now();

  // Retry: auch mit erzwungenem Tool-Use kann das input-Objekt selten
  // schema-fremde Werte tragen — zweiter Anlauf meist sauber. Netzwerkfehler
  // werden NICHT wiederholt (throw).
  const MAX_ATTEMPTS = 2;
  let rawText = '';
  let response: Awaited<ReturnType<typeof client.messages.create>> | undefined;
  let parsed: ReturnType<typeof LawJudgeResponseSchema.safeParse> | undefined;
  let lastErr = '';
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      response = await client.messages.create({
        model,
        system: LAW_JUDGE_SYSTEM_PROMPT,
        messages: [{ role: 'user', content: userMessage }],
        max_tokens: MAX_TOKENS,
        tools: [LAW_JUDGE_TOOL],
        tool_choice: { type: 'tool', name: LAW_JUDGE_TOOL.name },
      });
    } catch (err) {
      throw new LawJudgeError(`Anthropic law-judge request failed: ${(err as Error).message}`, err);
    }
    const toolBlock = response.content.find(b => b.type === 'tool_use');
    if (toolBlock && toolBlock.type === 'tool_use') {
      rawText = JSON.stringify(toolBlock.input);
      const candidate = LawJudgeResponseSchema.safeParse(toolBlock.input);
      if (candidate.success) {
        parsed = candidate;
        break;
      }
      lastErr = candidate.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join('; ');
    } else {
      // Fallback: manche Modelle antworten trotz tool_choice mit Text-JSON.
      const textBlock = response.content.find(b => b.type === 'text');
      rawText = textBlock && textBlock.type === 'text' ? textBlock.text : '';
      try {
        const candidate = LawJudgeResponseSchema.safeParse(extractJudgeJson(rawText));
        if (candidate.success) {
          parsed = candidate;
          break;
        }
        lastErr = candidate.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join('; ');
      } catch (err) {
        lastErr = err instanceof ComplianceJudgeError ? err.message : String(err);
      }
    }
  }
  const latencyMs = Date.now() - startedAt;

  if (!parsed || !parsed.success) {
    throw new LawJudgeError(`law-judge output invalid after ${MAX_ATTEMPTS} attempts: ${lastErr}`);
  }

  const sanitized = sanitizeLawJudgeResponse(
    parsed.data,
    args.candidate.family,
    args.profileElements.map(e => e.id),
    args.candidate.topHits.map(h => h.regulationKey),
  );
  // AC-4 (Slice-2b Fix 1): Titel je keyParagraph für die UI mitliefern.
  sanitized.keyParagraphDetails = buildKeyParagraphDetails(sanitized.keyParagraphs, args.candidate.topHits);

  const usage = (response as { usage?: { input_tokens?: number; output_tokens?: number } }).usage;

  // Observability (THE-462 AC-3) — best-effort, blockiert nie.
  await recordAiTrace({
    operation: 'discovery-judge',
    model,
    promptVersionHash: LAW_JUDGE_PROMPT_VERSION_HASH,
    projectId: args.projectId,
    regulationKey: args.candidate.family,
    candidateElementIds: args.profileElements.map(e => e.id),
    predictions: sanitized.elementIds.map(id => ({
      elementId: id,
      elementType: 'custom',
      confidence: sanitized.confidence,
    })),
    rawResponse: rawText,
    latencyMs,
    inputTokens: usage?.input_tokens,
    outputTokens: usage?.output_tokens,
  });

  judgeCache.set(key, sanitized);
  if (judgeCache.size > JUDGE_CACHE_MAX) {
    const oldest = judgeCache.keys().next().value;
    if (oldest !== undefined) judgeCache.delete(oldest);
  }
  return sanitized;
}
