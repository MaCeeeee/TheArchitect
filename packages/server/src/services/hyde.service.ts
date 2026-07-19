/**
 * UC-LAW-002 — shared HyDE (Hypothetical Document Embeddings) rewrite.
 *
 * Extracted from the offline eval-precompute script
 * (build-discovery-eval-vectors.ts, defaultGenerateHyde) so both the
 * offline eval path AND prod discovery (later task, THE-514) use ONE
 * prompt source — prompt drift between the two would silently invalidate
 * the golden eval baseline (AC-8 depends on prompt stability).
 *
 * `HYDE_INSTRUCTION` is byte-identical to the script's current string —
 * do NOT reword.
 *
 * Linear: THE-514 (Task 1)
 */
import Anthropic from '@anthropic-ai/sdk';

// HyDE-Prompt (Muster THE-434): das Modell schreibt den hypothetischen
// Pflichten-/Rechtstext, der auf die Architektur zutreffen würde — dessen
// Embedding wird als Query genutzt (Retrieval-Vergleichslauf, AC-8), NICHT
// im Prod-Pfad.
export const HYDE_INSTRUCTION =
  'Schreibe den hypothetischen Pflichten-/Rechtstext (2-4 Sätze), der auf diese Architektur zutreffen würde. ' +
  'Antworte NUR mit dem Text selbst, ohne Einleitung oder Meta-Kommentar.';

export const HYDE_MAX_TOKENS = 400;

// Mirrors the literal used by lawDiscovery.service#defaultJudgeModel() /
// lawJudge.service#DEFAULT_LAW_JUDGE_MODEL — neither is exported, so the
// literal is duplicated here rather than imported.
const HYDE_MODEL_DEFAULT = 'claude-haiku-4-5-20251001';

export class HydeRewriteError extends Error {
  constructor(message: string, public readonly cause?: unknown) {
    super(message);
    this.name = 'HydeRewriteError';
  }
}

export interface HydeRewriteOptions {
  model?: string;
  client?: Anthropic;
  maxTokens?: number;
}

/**
 * Rewrites an architecture profile into a hypothetical legal-flavored
 * hypothesis text (HyDE) via Anthropic. Injectable client for tests; falls
 * back to `new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })` when no
 * client is supplied and throws a clear error if neither is available (the
 * caller is expected to handle the fallback, e.g. skip HyDE).
 */
export async function hydeRewrite(profileText: string, opts?: HydeRewriteOptions): Promise<string> {
  const client = opts?.client ?? (process.env.ANTHROPIC_API_KEY
    ? new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
    : undefined);
  if (!client) {
    throw new HydeRewriteError('hydeRewrite: no Anthropic client provided and ANTHROPIC_API_KEY is not configured');
  }
  // DD-4: share the discovery model knob with the judge (LAW_DISCOVERY_JUDGE_MODEL),
  // so an operator override moves HyDE too; Haiku default otherwise.
  const model = opts?.model ?? process.env.LAW_DISCOVERY_JUDGE_MODEL ?? HYDE_MODEL_DEFAULT;
  const res = await client.messages.create({
    model,
    max_tokens: opts?.maxTokens ?? HYDE_MAX_TOKENS,
    messages: [{ role: 'user', content: `${HYDE_INSTRUCTION}\n\nArchitektur-Profil:\n${profileText}` }],
  });
  const block = res.content.find(b => b.type === 'text');
  const text = block && block.type === 'text' ? block.text.trim() : '';
  if (!text) throw new HydeRewriteError('HyDE generation returned empty text');
  return text;
}
