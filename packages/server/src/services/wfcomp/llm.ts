/**
 * LLM-Backend-Abstraktion (REQ-WFCOMP-001.10 / THE-366) — swappable Cloud↔lokal.
 *
 * - Cloud: Anthropic (Claude SDK) — Default.
 * - Lokal: OpenAI-kompatibler Endpoint (LM Studio / Ollama / vLLM) für die
 *   Privacy-Max-On-Prem-Stufe → kein Drittland-Export.
 *
 * Backend per env `LLM_BACKEND` (default 'anthropic'). Ein injizierter
 * `anthropicClient` (Tests / expliziter Cloud-Call) erzwingt das Anthropic-Backend.
 * Die Tier-A-Guards in `inference.ts` sind modell-agnostisch → Backends austauschbar.
 */
import Anthropic from '@anthropic-ai/sdk';

export interface LlmCallOpts {
  system: string;
  user: string;
  maxTokens: number;
  anthropicClient?: Anthropic;
}

export type LlmBackend = 'anthropic' | 'local';

const ANTHROPIC_MODEL = process.env.ANTHROPIC_MODEL || 'claude-haiku-4-5-20251001';
const LLM_TIMEOUT_MS = 30_000;

function getAnthropicClient(): Anthropic {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY is not configured');
  return new Anthropic({ apiKey });
}

/** Which backend handles this call. Injected client → always cloud. */
export function resolveBackend(opts: LlmCallOpts): LlmBackend {
  if (opts.anthropicClient) return 'anthropic';
  return process.env.LLM_BACKEND === 'local' ? 'local' : 'anthropic';
}

async function anthropicCall(opts: LlmCallOpts): Promise<string> {
  const client = opts.anthropicClient ?? getAnthropicClient();
  const resp = await client.messages.create({
    model: ANTHROPIC_MODEL,
    system: opts.system,
    messages: [{ role: 'user', content: opts.user }],
    max_tokens: opts.maxTokens,
  });
  const block = resp.content.find((b) => b.type === 'text');
  return block && block.type === 'text' ? block.text : '';
}

async function localOpenAiCall(opts: LlmCallOpts): Promise<string> {
  // SECURITY: `LLM_BASE_URL` is OPERATOR config, never user-supplied — this backend
  // only engages when an operator explicitly sets LLM_BACKEND=local AND LLM_BASE_URL,
  // so it is not a request-reachable SSRF vector. Operators must point it at a trusted
  // internal endpoint. Failures never echo the request payload (status only).
  const base = process.env.LLM_BASE_URL;
  if (!base) throw new Error('LLM_BASE_URL is not configured for the local backend');
  const resp = await fetch(`${base.replace(/\/$/, '')}/v1/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(process.env.LLM_API_KEY ? { Authorization: `Bearer ${process.env.LLM_API_KEY}` } : {}),
    },
    body: JSON.stringify({
      model: process.env.LLM_MODEL || 'qwen2.5',
      messages: [
        { role: 'system', content: opts.system },
        { role: 'user', content: opts.user },
      ],
      max_tokens: opts.maxTokens,
      temperature: 0,
    }),
    signal: AbortSignal.timeout(LLM_TIMEOUT_MS),
  });
  if (!resp.ok) throw new Error(`local LLM responded ${resp.status}`);
  const data = (await resp.json()) as { choices?: Array<{ message?: { content?: string } }> };
  return data.choices?.[0]?.message?.content ?? '';
}

/** Single entry point — dispatches to the configured backend. */
export async function callLLM(opts: LlmCallOpts): Promise<string> {
  return resolveBackend(opts) === 'local' ? localOpenAiCall(opts) : anthropicCall(opts);
}
