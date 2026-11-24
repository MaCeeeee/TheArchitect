/**
 * judgeBackends Tests — Spike Judge-Compare (UC-LAW-002).
 * Spec-Parsing, Anthropic→OpenAI-Übersetzung, Shim, Instrumentierung und ein
 * End-to-End-Lauf des PROD-Judges (`judgeCandidate`) über den Shim gegen
 * einen gefälschten OpenAI-kompatiblen Endpoint (kein Netz).
 *
 * Run: cd packages/server && npx jest judgeBackends --verbose
 */
import type Anthropic from '@anthropic-ai/sdk';
import {
  parseBackendSpec,
  toOpenAiRequest,
  toolsToJsonInstruction,
  createOpenAiCompatShim,
  instrumentClient,
  emptyUsage,
} from '../evals/judgeBackends';
import { judgeCandidate, __resetJudgeCache } from '../services/lawJudge.service';

function fakeFetch(responses: Array<{ status?: number; content?: string; usage?: { prompt_tokens: number; completion_tokens: number } }>) {
  const calls: Array<{ url: string; body: Record<string, unknown> }> = [];
  let i = 0;
  const impl = (async (url: string, init: { body: string }) => {
    calls.push({ url, body: JSON.parse(init.body) });
    const r = responses[Math.min(i++, responses.length - 1)];
    const status = r.status ?? 200;
    return {
      ok: status >= 200 && status < 300,
      status,
      json: async () => ({ choices: [{ message: { content: r.content ?? '' }, finish_reason: 'stop' }], usage: r.usage }),
    };
  }) as unknown as typeof fetch;
  return { impl, calls };
}

describe('parseBackendSpec', () => {
  it('parses an anthropic spec with label', () => {
    expect(parseBackendSpec('haiku=anthropic:claude-haiku-4-5-20251001')).toEqual({
      id: 'haiku',
      kind: 'anthropic',
      model: 'claude-haiku-4-5-20251001',
    });
  });

  it('defaults the anthropic label to the model id', () => {
    expect(parseBackendSpec('anthropic:claude-haiku-4-5-20251001').id).toBe('claude-haiku-4-5-20251001');
  });

  it('parses a local spec, keeps ":" in the model (Ollama tags) and strips /v1 + trailing slash', () => {
    expect(parseBackendSpec('g=local:gemma3:12b@http://localhost:11434/v1/')).toEqual({
      id: 'g',
      kind: 'openai-compat',
      model: 'gemma3:12b',
      baseUrl: 'http://localhost:11434',
    });
  });

  it('derives the local label from the last path segment of an HF model id', () => {
    const spec = parseBackendSpec('local:DomainLLM/gemma-3-12b-it-german-law-finetuned@http://gpu-box:8000');
    expect(spec.id).toBe('gemma-3-12b-it-german-law-finetuned');
    expect(spec.model).toBe('DomainLLM/gemma-3-12b-it-german-law-finetuned');
  });

  it.each([
    ['nonsense', /expected anthropic/],
    ['openai:gpt', /unknown kind/],
    ['local:model-without-url', /local:<model>@<baseUrl>/],
    ['local:m@ftp://x', /http\(s\)/],
    ['anthropic:', /missing model/],
    ['bad label!=anthropic:m', /invalid backend label/],
  ])('rejects %s', (raw, msg) => {
    expect(() => parseBackendSpec(raw)).toThrow(msg);
  });
});

describe('toOpenAiRequest', () => {
  const tool: Anthropic.Tool = {
    name: 'submit_law_verdicts',
    description: 'x',
    input_schema: { type: 'object', properties: { applies: { type: 'boolean' } }, required: ['applies'] },
  };

  it('moves system into a system message, appends the tool schema and sets json mode', () => {
    const req = toOpenAiRequest(
      {
        model: 'ignored',
        system: 'SYS',
        messages: [{ role: 'user', content: 'hello' }],
        max_tokens: 100,
        tools: [tool],
        tool_choice: { type: 'tool', name: tool.name },
      },
      'local-model',
      'json_object',
    );
    expect(req.model).toBe('local-model');
    expect(req.temperature).toBe(0);
    expect(req.max_tokens).toBe(100);
    expect(req.response_format).toEqual({ type: 'json_object' });
    expect(req.messages[0].role).toBe('system');
    expect(req.messages[0].content.startsWith('SYS')).toBe(true);
    expect(req.messages[0].content).toContain('"applies"');
    expect(req.messages[1]).toEqual({ role: 'user', content: 'hello' });
  });

  it('omits response_format with json mode "none" and flattens text blocks', () => {
    const req = toOpenAiRequest(
      { model: 'x', messages: [{ role: 'user', content: [{ type: 'text', text: 'a' }, { type: 'text', text: 'b' }] }], max_tokens: 5 },
      'm',
      'none',
    );
    expect(req.response_format).toBeUndefined();
    expect(req.messages).toEqual([{ role: 'user', content: 'a\nb' }]);
  });

  it('toolsToJsonInstruction is empty without tools', () => {
    expect(toolsToJsonInstruction(undefined)).toBe('');
  });
});

describe('createOpenAiCompatShim', () => {
  it('posts to /v1/chat/completions and returns an Anthropic-shaped text message with usage', async () => {
    const { impl, calls } = fakeFetch([{ content: '{"a":1}', usage: { prompt_tokens: 11, completion_tokens: 3 } }]);
    const client = createOpenAiCompatShim({ baseUrl: 'http://h:8000/', model: 'm', fetchImpl: impl });
    const res = await client.messages.create({ model: 'x', messages: [{ role: 'user', content: 'q' }], max_tokens: 10 });
    expect(calls[0].url).toBe('http://h:8000/v1/chat/completions');
    expect(res.content[0]).toMatchObject({ type: 'text', text: '{"a":1}' });
    expect(res.usage).toMatchObject({ input_tokens: 11, output_tokens: 3 });
  });

  it('throws with the status only (never the payload) on a non-OK response', async () => {
    const { impl } = fakeFetch([{ status: 503 }]);
    const client = createOpenAiCompatShim({ baseUrl: 'http://h', model: 'm', fetchImpl: impl });
    await expect(
      client.messages.create({ model: 'x', messages: [{ role: 'user', content: 'SECRET-PROFILE' }], max_tokens: 10 }),
    ).rejects.toThrow(/^openai-compat backend responded 503$/);
  });
});

describe('instrumentClient', () => {
  it('counts calls and tokens without changing the response', async () => {
    const { impl } = fakeFetch([{ content: 'x', usage: { prompt_tokens: 5, completion_tokens: 2 } }]);
    const usage = emptyUsage();
    const client = instrumentClient(createOpenAiCompatShim({ baseUrl: 'http://h', model: 'm', fetchImpl: impl }), usage);
    await client.messages.create({ model: 'x', messages: [{ role: 'user', content: 'q' }], max_tokens: 10 });
    await client.messages.create({ model: 'x', messages: [{ role: 'user', content: 'q' }], max_tokens: 10 });
    expect(usage).toEqual({ apiCalls: 2, inputTokens: 10, outputTokens: 4 });
  });
});

describe('prod judgeCandidate through the shim (no prod-code change needed)', () => {
  const candidate = {
    family: 'dsgvo',
    sources: ['dsgvo'],
    jurisdiction: 'EU',
    topHits: [{ regulationKey: 'dsgvo:art-6', title: 'Rechtmäßigkeit der Verarbeitung' }],
    retrievalScore: 0.71,
  };

  beforeEach(() => __resetJudgeCache());

  it('parses a text-JSON verdict and sanitizes hallucinated keys', async () => {
    const verdict = JSON.stringify({
      family: 'WRONG-FAMILY',
      applies: true,
      confidence: 0.92,
      reasoning: 'PII customer ledger processed - Art. 6 lawful basis needed.',
      elementIds: ['invented'],
      keyParagraphs: ['dsgvo:art-6', 'dsgvo:art-999'],
    });
    const { impl, calls } = fakeFetch([{ content: '```json\n' + verdict + '\n```' }]);
    const client = createOpenAiCompatShim({ baseUrl: 'http://h', model: 'gemma', fetchImpl: impl });
    const res = await judgeCandidate({
      profileText: 'Retail bank with PII customer ledger',
      profileElements: [],
      candidate,
      projectId: 'eval:x',
      corpusVersionHash: 'eval:x:dsgvo',
      model: 'local:gemma@http://h',
      anthropicClient: client,
    });
    expect(calls).toHaveLength(1);
    expect(res).toMatchObject({ family: 'dsgvo', applies: true, confidence: 0.92, elementIds: [], keyParagraphs: ['dsgvo:art-6'] });
  });

  it('uses the prod feedback retry when the first answer breaks the schema', async () => {
    const good = JSON.stringify({ family: 'dsgvo', applies: false, confidence: 0.2, reasoning: 'no PII', elementIds: [], keyParagraphs: [] });
    const { impl, calls } = fakeFetch([{ content: 'Sure! Here is my answer without JSON.' }, { content: good }]);
    const usage = emptyUsage();
    const client = instrumentClient(createOpenAiCompatShim({ baseUrl: 'http://h', model: 'gemma', fetchImpl: impl }), usage);
    const res = await judgeCandidate({
      profileText: 'Static marketing website',
      profileElements: [],
      candidate,
      projectId: 'eval:y',
      corpusVersionHash: 'eval:y:dsgvo',
      model: 'local:gemma@http://h',
      anthropicClient: client,
    });
    expect(res.applies).toBe(false);
    expect(usage.apiCalls).toBe(2);
    expect(String(calls[1].body.messages && JSON.stringify(calls[1].body.messages))).toContain('VALIDATION FEEDBACK');
  });
});
