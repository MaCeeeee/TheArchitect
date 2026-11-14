/**
 * Prompt caching for the copilot chat and the per-section compliance mapping
 * (Anthropic path).
 *
 * The cache only pays off if the breakpoints sit in the right place and the
 * cached prefix is byte-identical between requests. These tests pin the request
 * shape; the hit rate itself is visible at runtime via the `[AI] … usage` log
 * lines (cache_read > 0 from the second request onwards).
 */
jest.mock('../config/neo4j', () => ({
  runCypher: jest.fn(),
  serializeNeo4jProperties: jest.fn((props: unknown) => props),
}));
jest.mock('../services/advisor.service', () => ({ runAdvisorScan: jest.fn() }));
jest.mock('../models/Standard', () => ({ Standard: { findOne: jest.fn() } }));

interface StreamCall {
  params: { system: unknown; messages: unknown[] };
  startedAt: number;
  endedAt?: number;
}
const streamCalls: StreamCall[] = [];
let clock = 0;

jest.mock('@anthropic-ai/sdk', () =>
  jest.fn().mockImplementation(() => ({
    messages: {
      stream: (params: StreamCall['params']) => {
        const call: StreamCall = { params, startedAt: ++clock };
        streamCalls.push(call);
        return {
          async *[Symbol.asyncIterator]() {
            await new Promise((resolve) => setImmediate(resolve));
            yield { type: 'content_block_delta', delta: { type: 'text_delta', text: '[]' } };
            call.endedAt = ++clock;
          },
          finalMessage: async () => ({
            usage: {
              input_tokens: 50,
              cache_read_input_tokens: streamCalls.length > 1 ? 9000 : 0,
              cache_creation_input_tokens: streamCalls.length > 1 ? 0 : 9000,
              output_tokens: 10,
            },
          }),
        };
      },
    },
  })),
);

import {
  buildAnthropicPromptPayload,
  buildMappingElementContext,
  buildMappingSectionMessage,
  generateMappingSuggestions,
  type ChatMessage,
} from '../services/ai.service';
import { runCypher } from '../config/neo4j';
import { Standard } from '../models/Standard';

const history: ChatMessage[] = [
  { role: 'user', content: 'Which elements are SPOFs?' },
  { role: 'assistant', content: 'The "Payment Gateway" has 7 dependents.' },
  { role: 'user', content: 'How do I add redundancy?' },
];

const countBreakpoints = (payload: unknown): number =>
  (JSON.stringify(payload).match(/cache_control/g) ?? []).length;

describe('buildAnthropicPromptPayload — copilot chat', () => {
  it('sets a cache breakpoint on the system prompt and on the last message', () => {
    const payload = buildAnthropicPromptPayload('SYSTEM', history, { system: true, history: true });

    expect(payload.system).toEqual([
      { type: 'text', text: 'SYSTEM', cache_control: { type: 'ephemeral' } },
    ]);
    expect(payload.messages).toEqual([
      { role: 'user', content: 'Which elements are SPOFs?' },
      { role: 'assistant', content: 'The "Payment Gateway" has 7 dependents.' },
      {
        role: 'user',
        content: [{ type: 'text', text: 'How do I add redundancy?', cache_control: { type: 'ephemeral' } }],
      },
    ]);
    expect(countBreakpoints(payload)).toBe(2); // API limit is four
  });

  it('leaves one-shot requests unchanged when caching is off', () => {
    const payload = buildAnthropicPromptPayload('SYSTEM', history);

    expect(payload.system).toBe('SYSTEM');
    expect(payload.messages).toEqual(history);
    expect(countBreakpoints(payload)).toBe(0);
  });

  it('does not wrap an empty last message in a text block (API rejects empty text blocks)', () => {
    const payload = buildAnthropicPromptPayload('SYSTEM', [{ role: 'user', content: '' }], { history: true });

    expect(payload.messages).toEqual([{ role: 'user', content: '' }]);
  });

  it('keeps the system prefix byte-identical across turns of a conversation', () => {
    const turn1 = buildAnthropicPromptPayload('SYSTEM', history.slice(0, 1), { system: true, history: true });
    const turn2 = buildAnthropicPromptPayload('SYSTEM', history, { system: true, history: true });

    expect(JSON.stringify(turn2.system)).toBe(JSON.stringify(turn1.system));
    expect(turn2.messages[0]).toEqual({ role: 'user', content: history[0].content });
  });
});

describe('buildAnthropicPromptPayload — multi-part system prompt', () => {
  it('sends parts as separate blocks and caches only after the last one', () => {
    const payload = buildAnthropicPromptPayload(['INSTRUCTIONS', 'ELEMENTS'], [{ role: 'user', content: 'Q' }], {
      system: true,
    });

    expect(payload.system).toEqual([
      { type: 'text', text: 'INSTRUCTIONS' },
      { type: 'text', text: 'ELEMENTS', cache_control: { type: 'ephemeral' } },
    ]);
    // No history breakpoint: the per-section message is sent only once.
    expect(payload.messages).toEqual([{ role: 'user', content: 'Q' }]);
  });
});

describe('compliance mapping prompt split', () => {
  const elements = [
    { id: 'e1', name: 'CRM', layer: 'application', type: 'application', description: 'Customer "master" data' },
    { id: 'e2', name: 'Order Process', layer: 'business', type: 'process', description: '' },
  ];

  it('puts all elements into the cacheable context, not into the per-section message', () => {
    const context = buildMappingElementContext(elements);
    const message = buildMappingSectionMessage({ id: 's1', number: '6.4.2', title: 'Access control' });

    expect(context).toContain('# Available architecture elements (2 total)');
    expect(context).toContain(`- e1 | CRM | layer=application | type=application | desc="Customer 'master' data"`);
    expect(context).toContain('- e2 | Order Process | layer=business | type=process');
    expect(message).toContain('sectionNumber: 6.4.2');
    expect(message).not.toContain('CRM');
  });
});

describe('generateMappingSuggestions — cache warm-up', () => {
  const OLD_ENV = process.env;

  beforeEach(() => {
    streamCalls.length = 0;
    clock = 0;
    process.env = { ...OLD_ENV, ANTHROPIC_API_KEY: 'test-key' };
    delete process.env.OPENAI_API_KEY;

    const sections = Array.from({ length: 6 }, (_, i) => ({
      id: `s${i}`,
      number: `${i + 1}`,
      title: `Section ${i + 1}`,
    }));
    (Standard.findOne as jest.Mock).mockResolvedValue({ sections });
    (runCypher as jest.Mock).mockResolvedValue([
      { toObject: () => ({ id: 'e1', name: 'CRM', layer: 'application', type: 'application', description: '' }) },
    ]);
  });

  afterAll(() => {
    process.env = OLD_ENV;
  });

  it('finishes the first section before the parallel workers start, with an identical cached prefix', async () => {
    const info = jest.spyOn(console, 'info').mockImplementation(() => {});
    const onDone = jest.fn();
    const onError = jest.fn();

    await generateMappingSuggestions('p1', 'std1', undefined, () => {}, onDone, onError);

    expect(onError).not.toHaveBeenCalled();
    expect(onDone).toHaveBeenCalledWith([]);
    expect(streamCalls).toHaveLength(6);

    // Warm-up: request 1 has completed before any other request starts.
    const [first, ...rest] = streamCalls;
    for (const call of rest) expect(call.startedAt).toBeGreaterThan(first.endedAt!);
    // …and the remaining sections still run in parallel.
    expect(rest[1].startedAt).toBeLessThan(rest[0].endedAt!);

    // Every request sends the same system blocks → one cache entry, reused.
    const systems = streamCalls.map((c) => JSON.stringify(c.params.system));
    expect(new Set(systems).size).toBe(1);
    expect(countBreakpoints(first.params.system)).toBe(1);

    expect(info).toHaveBeenCalledWith(
      '[AI] Mapping (6 sections) usage: input=300 cache_read=45000 cache_write=9000 output=60',
    );
    info.mockRestore();
  });
});
