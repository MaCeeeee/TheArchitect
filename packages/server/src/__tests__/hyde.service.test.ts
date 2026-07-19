/**
 * hyde.service Tests — THE-514 Task 1.
 *
 * Extracts the HyDE (Hypothetical Document Embeddings) rewrite call, formerly
 * private to build-discovery-eval-vectors.ts, into a shared exported module
 * so both the offline eval-precompute script and prod discovery (later task)
 * use ONE prompt source. Injectable Anthropic client — no network in tests.
 *
 * Run: cd packages/server && npx jest src/__tests__/hyde.service.test.ts --verbose
 */
import { hydeRewrite } from '../services/hyde.service';

describe('hydeRewrite', () => {
  it('returns the trimmed hypothesis text AND calls the model with Haiku default + 400 tok', async () => {
    const create = jest.fn().mockResolvedValue({ content: [{ type: 'text', text: '  Hypothese.  ' }] });
    const client = { messages: { create } } as any;
    const out = await hydeRewrite('profil', { client });
    expect(out).toBe('Hypothese.');
    expect(create).toHaveBeenCalledWith(expect.objectContaining({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 400,
    }));
  });

  it('throws on empty response', async () => {
    const create = jest.fn().mockResolvedValue({ content: [] });
    await expect(hydeRewrite('p', { client: { messages: { create } } as any })).rejects.toThrow();
  });

  it('falls back to the Haiku default when LAW_DISCOVERY_JUDGE_MODEL is present but EMPTY (prod convention)', async () => {
    // Regression for the prod 400 "model: String should have at least 1 character":
    // the env var is set to '' to mean "use default"; the model default must NOT pass '' to the API.
    const prev = process.env.LAW_DISCOVERY_JUDGE_MODEL;
    process.env.LAW_DISCOVERY_JUDGE_MODEL = '';
    try {
      const create = jest.fn().mockResolvedValue({ content: [{ type: 'text', text: 'H.' }] });
      await hydeRewrite('profil', { client: { messages: { create } } as any });
      expect(create).toHaveBeenCalledWith(expect.objectContaining({ model: 'claude-haiku-4-5-20251001' }));
    } finally {
      if (prev === undefined) delete process.env.LAW_DISCOVERY_JUDGE_MODEL;
      else process.env.LAW_DISCOVERY_JUDGE_MODEL = prev;
    }
  });

  it('honors a non-empty LAW_DISCOVERY_JUDGE_MODEL override (shared knob)', async () => {
    const prev = process.env.LAW_DISCOVERY_JUDGE_MODEL;
    process.env.LAW_DISCOVERY_JUDGE_MODEL = 'claude-sonnet-5';
    try {
      const create = jest.fn().mockResolvedValue({ content: [{ type: 'text', text: 'H.' }] });
      await hydeRewrite('profil', { client: { messages: { create } } as any });
      expect(create).toHaveBeenCalledWith(expect.objectContaining({ model: 'claude-sonnet-5' }));
    } finally {
      if (prev === undefined) delete process.env.LAW_DISCOVERY_JUDGE_MODEL;
      else process.env.LAW_DISCOVERY_JUDGE_MODEL = prev;
    }
  });
});
