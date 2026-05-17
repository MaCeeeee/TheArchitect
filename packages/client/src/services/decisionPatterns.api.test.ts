/**
 * REQ-CHOICE-001 — decisionPatterns API client tests
 */

import { describe, test, expect, beforeEach, vi } from 'vitest';

const setTokens = vi.fn();
const logout = vi.fn();

vi.mock('../stores/authStore', () => ({
  useAuthStore: {
    getState: () => ({
      token: 'access-current',
      refreshToken: 'refresh-current',
      setTokens,
      logout,
    }),
  },
}));

const {
  fetchDecisionPatterns,
  fetchDecisionPattern,
  adoptPattern,
  fetchPatternStats,
} = await import('./decisionPatterns.api');

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn();
  globalThis.fetch = fetchMock as unknown as typeof fetch;
  setTokens.mockClear();
  logout.mockClear();
  if (typeof window !== 'undefined') {
    Object.defineProperty(window, 'location', {
      value: { href: '' },
      writable: true,
    });
  }
});

const okJson = (body: unknown) =>
  ({
    ok: true,
    status: 200,
    json: async () => body,
  }) as unknown as Response;

const errJson = (status: number, body: unknown) =>
  ({
    ok: false,
    status,
    json: async () => body,
  }) as unknown as Response;

describe('fetchDecisionPatterns', () => {
  test('builds URL without filter', async () => {
    fetchMock.mockResolvedValue(okJson({ patterns: [] }));
    await fetchDecisionPatterns();
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/decision-patterns',
      expect.objectContaining({ headers: expect.any(Object) }),
    );
  });

  test('builds URL with category filter', async () => {
    fetchMock.mockResolvedValue(okJson({ patterns: [] }));
    await fetchDecisionPatterns({ category: 'security' });
    const url = fetchMock.mock.calls[0][0] as string;
    expect(url).toBe('/api/decision-patterns?category=security');
  });

  test('builds URL with category + lifecycleStatus', async () => {
    fetchMock.mockResolvedValue(okJson({ patterns: [] }));
    await fetchDecisionPatterns({ category: 'data', lifecycleStatus: 'approved' });
    const url = fetchMock.mock.calls[0][0] as string;
    expect(url).toContain('category=data');
    expect(url).toContain('lifecycleStatus=approved');
  });

  test('returns patterns array', async () => {
    fetchMock.mockResolvedValue(okJson({ patterns: [{ slug: 'a' }, { slug: 'b' }] }));
    const result = await fetchDecisionPatterns();
    expect(result).toHaveLength(2);
    expect(result[0].slug).toBe('a');
  });

  test('throws on non-ok response', async () => {
    fetchMock.mockResolvedValue(errJson(500, { error: 'boom' }));
    await expect(fetchDecisionPatterns()).rejects.toThrow(/Fetch patterns failed/);
  });
});

describe('fetchDecisionPattern', () => {
  test('returns single pattern', async () => {
    fetchMock.mockResolvedValue(okJson({ slug: 'managed-message-queue' }));
    const result = await fetchDecisionPattern('managed-message-queue');
    expect(result.slug).toBe('managed-message-queue');
  });
});

describe('adoptPattern', () => {
  test('POSTs projectId in body', async () => {
    fetchMock.mockResolvedValue(
      okJson({ ok: true, adoptionId: 'a1', patternSlug: 'x', version: '1.0.0' }),
    );
    await adoptPattern('managed-message-queue', 'proj-123');
    const call = fetchMock.mock.calls[0];
    expect(call[0]).toBe('/api/decision-patterns/managed-message-queue/adopt');
    expect(call[1].method).toBe('POST');
    expect(JSON.parse(call[1].body)).toEqual({ projectId: 'proj-123' });
  });

  test('throws with server error message on failure', async () => {
    fetchMock.mockResolvedValue(errJson(409, { error: 'Pattern not available for adoption' }));
    await expect(adoptPattern('x', 'p')).rejects.toThrow('Pattern not available for adoption');
  });
});

describe('fetchPatternStats', () => {
  test('returns stats object', async () => {
    fetchMock.mockResolvedValue(
      okJson({ totalUses: 42, last30Days: 7, uniqueProjects: 3 }),
    );
    const stats = await fetchPatternStats('managed-message-queue');
    expect(stats).toEqual({ totalUses: 42, last30Days: 7, uniqueProjects: 3 });
  });
});
