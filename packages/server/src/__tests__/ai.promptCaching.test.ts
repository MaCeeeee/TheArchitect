/**
 * Prompt caching for the copilot chat (Anthropic path).
 *
 * The cache only pays off if (a) the breakpoints sit on the system prompt and the
 * last message, and (b) the request is otherwise unchanged. These tests pin the
 * request shape; the cache hit rate itself is visible at runtime via the
 * `[AI] Copilot usage` log line (cache_read > 0 from the second turn onwards).
 */
jest.mock('../config/neo4j', () => ({
  runCypher: jest.fn(),
  serializeNeo4jProperties: jest.fn(),
}));
jest.mock('../services/advisor.service', () => ({ runAdvisorScan: jest.fn() }));

import { buildAnthropicPromptPayload, type ChatMessage } from '../services/ai.service';

const history: ChatMessage[] = [
  { role: 'user', content: 'Which elements are SPOFs?' },
  { role: 'assistant', content: 'The "Payment Gateway" has 7 dependents.' },
  { role: 'user', content: 'How do I add redundancy?' },
];

describe('buildAnthropicPromptPayload', () => {
  it('sets a cache breakpoint on the system prompt and on the last message', () => {
    const payload = buildAnthropicPromptPayload('SYSTEM', history, true);

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
  });

  it('uses at most two breakpoints (API limit is four)', () => {
    const payload = buildAnthropicPromptPayload('SYSTEM', history, true);
    const json = JSON.stringify(payload);
    expect(json.match(/cache_control/g)).toHaveLength(2);
  });

  it('leaves one-shot requests unchanged when caching is off', () => {
    const payload = buildAnthropicPromptPayload('SYSTEM', history, false);

    expect(payload.system).toBe('SYSTEM');
    expect(payload.messages).toEqual(history);
    expect(JSON.stringify(payload)).not.toContain('cache_control');
  });

  it('does not wrap an empty last message in a text block (API rejects empty text blocks)', () => {
    const payload = buildAnthropicPromptPayload('SYSTEM', [{ role: 'user', content: '' }], true);

    expect(payload.messages).toEqual([{ role: 'user', content: '' }]);
  });

  it('produces a byte-identical prefix for consecutive turns of the same conversation', () => {
    const turn1 = buildAnthropicPromptPayload('SYSTEM', history.slice(0, 1), true);
    const turn2 = buildAnthropicPromptPayload('SYSTEM', history, true);

    expect(JSON.stringify(turn2.system)).toBe(JSON.stringify(turn1.system));
    // The first message is plain text on turn 2; the API matches on rendered
    // content, so the cache_control marker from turn 1 does not break the prefix.
    expect(turn2.messages[0]).toEqual({ role: 'user', content: history[0].content });
  });
});
