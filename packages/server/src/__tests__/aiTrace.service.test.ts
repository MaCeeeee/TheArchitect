/**
 * AiTrace-Service Tests — Observability (THE-384 / UC-EVAL-001)
 *
 * Rein: kein DB-Zugriff. isTracingEnabled() ist false ohne offene Mongo-
 * Verbindung, daher schreibt recordAiTrace() nichts und wirft nie.
 *
 * Run: cd packages/server && npx jest src/__tests__/aiTrace.service.test.ts
 */
import {
  computeCostUsd,
  isTracingEnabled,
  recordAiTrace,
} from '../services/aiTrace.service';

describe('computeCostUsd()', () => {
  it('prices Haiku 4.5 at $1 in / $5 out per MTok', () => {
    // 1M in + 1M out = $1 + $5 = $6
    expect(computeCostUsd('claude-haiku-4-5-20251001', 1_000_000, 1_000_000)).toBeCloseTo(6, 6);
    // small call: 100 in, 200 out
    expect(computeCostUsd('claude-haiku-4-5', 100, 200)).toBeCloseTo(0.0011, 6);
  });

  it('returns undefined for unknown model or missing token counts', () => {
    expect(computeCostUsd('some-unknown-model', 100, 200)).toBeUndefined();
    expect(computeCostUsd('claude-haiku-4-5', undefined, 200)).toBeUndefined();
    expect(computeCostUsd('claude-haiku-4-5', 100, undefined)).toBeUndefined();
  });

  it('scales output-heavy calls correctly (Sonnet 5)', () => {
    // 2M in ($3/M) + 1M out ($15/M) = 6 + 15 = 21
    expect(computeCostUsd('claude-sonnet-5', 2_000_000, 1_000_000)).toBeCloseTo(21, 6);
  });
});

describe('isTracingEnabled()', () => {
  const original = process.env.AI_TRACING_ENABLED;
  afterEach(() => {
    if (original === undefined) delete process.env.AI_TRACING_ENABLED;
    else process.env.AI_TRACING_ENABLED = original;
  });

  it('is false when explicitly disabled', () => {
    process.env.AI_TRACING_ENABLED = 'false';
    expect(isTracingEnabled()).toBe(false);
  });

  it('is false without an open mongo connection (readyState !== 1)', () => {
    delete process.env.AI_TRACING_ENABLED;
    // No DB connected in this unit test → readyState 0.
    expect(isTracingEnabled()).toBe(false);
  });
});

describe('recordAiTrace()', () => {
  it('never throws and returns a requestId even when tracing is off', async () => {
    const id = await recordAiTrace({
      operation: 'mapping',
      model: 'claude-haiku-4-5',
      promptVersionHash: 'abc',
      candidateElementIds: ['e1', 'e2'],
      predictions: [{ elementId: 'e1', confidence: 0.9 }],
      latencyMs: 12,
    });
    expect(typeof id).toBe('string');
    expect(id).toHaveLength(36); // uuid v4
  });

  it('honours a caller-supplied requestId', async () => {
    const id = await recordAiTrace({
      requestId: 'fixed-id',
      operation: 'mapping-live',
      model: 'claude-haiku-4-5',
      promptVersionHash: 'abc',
      candidateElementIds: [],
      predictions: [],
      latencyMs: 1,
    });
    expect(id).toBe('fixed-id');
  });
});
