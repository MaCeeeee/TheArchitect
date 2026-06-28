/**
 * LLM-backend dispatch (REQ-WFCOMP-001.10 / THE-366).
 */
import { resolveBackend } from '../services/wfcomp/llm';
import type Anthropic from '@anthropic-ai/sdk';

const base = { system: 's', user: 'u', maxTokens: 10 };
const origBackend = process.env.LLM_BACKEND;

afterEach(() => {
  if (origBackend === undefined) delete process.env.LLM_BACKEND;
  else process.env.LLM_BACKEND = origBackend;
});

describe('resolveBackend', () => {
  it('defaults to anthropic', () => {
    delete process.env.LLM_BACKEND;
    expect(resolveBackend(base)).toBe('anthropic');
  });

  it('selects local when LLM_BACKEND=local', () => {
    process.env.LLM_BACKEND = 'local';
    expect(resolveBackend(base)).toBe('local');
  });

  it('an injected anthropicClient forces anthropic even if LLM_BACKEND=local', () => {
    process.env.LLM_BACKEND = 'local';
    expect(resolveBackend({ ...base, anthropicClient: {} as unknown as Anthropic })).toBe('anthropic');
  });

  it('unknown backend value falls back to anthropic', () => {
    process.env.LLM_BACKEND = 'banana';
    expect(resolveBackend(base)).toBe('anthropic');
  });
});
