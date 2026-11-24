/**
 * Judge-Backends für den Law-Judge-Modellvergleich (Spike, UC-LAW-002).
 *
 * Ziel: denselben Prod-Judge (`judgeCandidate`, lawJudge.service.ts) gegen
 * verschiedene Modelle laufen lassen — Claude (Anthropic) als Referenz und
 * beliebige lokal betriebene Modelle hinter einem OpenAI-kompatiblen Endpoint
 * (vLLM / Ollama / llama.cpp-server / LM Studio), z. B. ein deutsches
 * Rechts-Finetune von Hugging Face.
 *
 * Kein Prod-Code wird geändert: `judgeCandidate` nimmt bereits einen
 * injizierbaren `anthropicClient` und hat einen Text-JSON-Fallback
 * (`extractJudgeJson`) für Modelle ohne Tool-Use. Der Shim hier übersetzt den
 * Anthropic-`messages.create`-Aufruf in einen `/v1/chat/completions`-Call und
 * liefert die Antwort als Text-Block zurück — Prompt, Zod-Validierung,
 * Feedback-Retry und Sanitizing laufen damit 1:1 wie in Prod.
 *
 * Zusätzlich instrumentiert `instrumentClient` jeden Client (Calls inkl.
 * Retries, Tokens), damit der Vergleich auch Kosten/Effizienz ausweist.
 */
import Anthropic from '@anthropic-ai/sdk';

export type JudgeBackendKind = 'anthropic' | 'openai-compat';
export type JsonMode = 'json_object' | 'none';

export interface JudgeBackendSpec {
  /** Kurzlabel im Report (z. B. "haiku", "gemma-law"). */
  id: string;
  kind: JudgeBackendKind;
  model: string;
  /** Nur openai-compat: Basis-URL ohne `/v1`, z. B. http://localhost:8000 */
  baseUrl?: string;
}

const ID_PATTERN = /^[a-z0-9][a-z0-9._-]{0,40}$/i;

/**
 * Parst eine CLI-Backend-Angabe:
 *   [label=]anthropic:<model>
 *   [label=]local:<model>@<baseUrl>
 * Das Modell darf `:` enthalten (Ollama-Tags wie `gemma3:12b`); die URL wird
 * am LETZTEN `@` abgetrennt.
 */
export function parseBackendSpec(raw: string): JudgeBackendSpec {
  const trimmed = raw.trim();
  let label: string | undefined;
  let rest = trimmed;
  const eq = trimmed.indexOf('=');
  if (eq > 0 && !trimmed.slice(0, eq).includes(':')) {
    label = trimmed.slice(0, eq);
    rest = trimmed.slice(eq + 1);
  }
  const colon = rest.indexOf(':');
  if (colon <= 0) throw new Error(`invalid backend spec "${raw}" — expected anthropic:<model> or local:<model>@<url>`);
  const kindRaw = rest.slice(0, colon);
  const body = rest.slice(colon + 1);

  let spec: JudgeBackendSpec;
  if (kindRaw === 'anthropic') {
    if (!body) throw new Error(`invalid backend spec "${raw}" — missing model`);
    spec = { id: label ?? body, kind: 'anthropic', model: body };
  } else if (kindRaw === 'local') {
    const at = body.lastIndexOf('@');
    if (at <= 0 || at === body.length - 1) {
      throw new Error(`invalid backend spec "${raw}" — expected local:<model>@<baseUrl>`);
    }
    const model = body.slice(0, at);
    const baseUrl = body.slice(at + 1).replace(/\/+$/, '').replace(/\/v1$/, '');
    if (!/^https?:\/\//.test(baseUrl)) throw new Error(`invalid backend spec "${raw}" — baseUrl must start with http(s)://`);
    spec = { id: label ?? model.split('/').pop()!, kind: 'openai-compat', model, baseUrl };
  } else {
    throw new Error(`invalid backend spec "${raw}" — unknown kind "${kindRaw}" (anthropic | local)`);
  }
  if (!ID_PATTERN.test(spec.id)) {
    throw new Error(`invalid backend label "${spec.id}" — use [a-z0-9._-], max 41 chars (prefix the spec with "label=")`);
  }
  return spec;
}

// ─── OpenAI-kompatibler Shim ──────────────────────────────────────

export interface OpenAiCompatShimOptions {
  baseUrl: string;
  model: string;
  apiKey?: string;
  /** `json_object` setzt response_format (vLLM, Ollama, llama.cpp unterstützen das). */
  jsonMode?: JsonMode;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}

type TextLike = string | Array<{ type: string; text?: string }>;

function flattenText(content: TextLike | undefined): string {
  if (!content) return '';
  if (typeof content === 'string') return content;
  return content
    .filter(b => b.type === 'text' && typeof b.text === 'string')
    .map(b => b.text)
    .join('\n');
}

/**
 * Tool-Use gibt es im OpenAI-kompatiblen Pfad nicht verlässlich (je Server
 * unterschiedlich) — statt der Tool-Definition bekommt das Modell das
 * Input-Schema als JSON-Anweisung im System-Prompt.
 */
export function toolsToJsonInstruction(tools: Anthropic.Tool[] | undefined): string {
  if (!tools || tools.length === 0) return '';
  const tool = tools[0];
  return (
    `\n\nNo tool calling is available in this environment. Respond with ONE JSON object only ` +
    `(no markdown, no prose) that matches this JSON schema for "${tool.name}":\n` +
    JSON.stringify(tool.input_schema)
  );
}

export interface OpenAiChatRequest {
  model: string;
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>;
  max_tokens: number;
  temperature: number;
  response_format?: { type: 'json_object' };
}

/** PURE: Anthropic-Request → OpenAI-Chat-Request. */
export function toOpenAiRequest(
  params: Anthropic.MessageCreateParamsNonStreaming,
  model: string,
  jsonMode: JsonMode,
): OpenAiChatRequest {
  const system = flattenText(params.system as TextLike | undefined) + toolsToJsonInstruction(params.tools as Anthropic.Tool[] | undefined);
  const messages: OpenAiChatRequest['messages'] = [];
  if (system) messages.push({ role: 'system', content: system });
  for (const m of params.messages) {
    messages.push({ role: m.role, content: flattenText(m.content as TextLike) });
  }
  return {
    model,
    messages,
    max_tokens: params.max_tokens,
    temperature: 0,
    ...(jsonMode === 'json_object' ? { response_format: { type: 'json_object' as const } } : {}),
  };
}

interface OpenAiChatResponse {
  choices?: Array<{ message?: { content?: string | null }; finish_reason?: string }>;
  usage?: { prompt_tokens?: number; completion_tokens?: number };
}

/**
 * Baut ein Objekt, das sich für `judgeCandidate` wie ein Anthropic-Client
 * verhält (nur `messages.create` wird benutzt). SECURITY: `baseUrl` ist
 * Operator-Konfiguration (CLI), nie User-Input; Fehler geben nur den Status
 * zurück, nie den Request-Body.
 */
export function createOpenAiCompatShim(opts: OpenAiCompatShimOptions): Anthropic {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const timeoutMs = opts.timeoutMs ?? 120_000;
  const jsonMode = opts.jsonMode ?? 'json_object';
  const url = `${opts.baseUrl.replace(/\/+$/, '')}/v1/chat/completions`;

  const create = async (params: Anthropic.MessageCreateParamsNonStreaming): Promise<Anthropic.Message> => {
    const body = toOpenAiRequest(params, opts.model, jsonMode);
    const resp = await fetchImpl(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(opts.apiKey ? { Authorization: `Bearer ${opts.apiKey}` } : {}),
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!resp.ok) throw new Error(`openai-compat backend responded ${resp.status}`);
    const data = (await resp.json()) as OpenAiChatResponse;
    const text = data.choices?.[0]?.message?.content ?? '';
    const message = {
      id: `shim-${Date.now()}`,
      type: 'message',
      role: 'assistant',
      model: opts.model,
      content: [{ type: 'text', text, citations: null }],
      stop_reason: data.choices?.[0]?.finish_reason === 'length' ? 'max_tokens' : 'end_turn',
      stop_sequence: null,
      usage: {
        input_tokens: data.usage?.prompt_tokens ?? 0,
        output_tokens: data.usage?.completion_tokens ?? 0,
      },
    };
    return message as unknown as Anthropic.Message;
  };

  return { messages: { create } } as unknown as Anthropic;
}

// ─── Instrumentierung (Calls inkl. Retries, Tokens) ──────────────

export interface UsageStats {
  /** Roh-API-Calls inkl. Feedback-Retries von judgeCandidate. */
  apiCalls: number;
  inputTokens: number;
  outputTokens: number;
}

export function emptyUsage(): UsageStats {
  return { apiCalls: 0, inputTokens: 0, outputTokens: 0 };
}

/** Wickelt `messages.create` und zählt in `sink` mit — Verhalten sonst unverändert. */
export function instrumentClient(client: Anthropic, sink: UsageStats): Anthropic {
  const inner = client.messages.create.bind(client.messages) as (
    p: Anthropic.MessageCreateParamsNonStreaming,
  ) => Promise<Anthropic.Message>;
  const create = async (params: Anthropic.MessageCreateParamsNonStreaming): Promise<Anthropic.Message> => {
    sink.apiCalls++;
    const res = await inner(params);
    sink.inputTokens += res.usage?.input_tokens ?? 0;
    sink.outputTokens += res.usage?.output_tokens ?? 0;
    return res;
  };
  return { messages: { create } } as unknown as Anthropic;
}

export interface CreateBackendClientOptions {
  jsonMode?: JsonMode;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}

/** Erzeugt den (noch nicht instrumentierten) Client für eine Backend-Spec. */
export function createBackendClient(spec: JudgeBackendSpec, opts: CreateBackendClientOptions = {}): Anthropic {
  if (spec.kind === 'anthropic') {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new Error(`backend "${spec.id}" needs ANTHROPIC_API_KEY`);
    return new Anthropic({ apiKey });
  }
  return createOpenAiCompatShim({
    baseUrl: spec.baseUrl!,
    model: spec.model,
    apiKey: process.env.LOCAL_LLM_API_KEY,
    jsonMode: opts.jsonMode,
    timeoutMs: opts.timeoutMs,
    fetchImpl: opts.fetchImpl,
  });
}
