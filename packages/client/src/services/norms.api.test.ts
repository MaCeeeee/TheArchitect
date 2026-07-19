/**
 * THE-423 Task 13 — normsAPI ContextTrace client tests.
 *
 * Verifies the client-surfacing API layer hits the right endpoints for the
 * two THE-423 client-visible reads: a single ContextTrace by id (which
 * paragraphs/versions an AI call consumed) and the regulation-impact
 * reverse-lookup. The axios instance is mocked so no network/interceptor
 * logic runs (mirrors certification.api.test.ts).
 */
import { describe, test, expect, beforeEach, vi } from 'vitest';

const get = vi.fn();
const post = vi.fn();

vi.mock('axios', () => {
  const instance = {
    get,
    post,
    put: vi.fn(),
    delete: vi.fn(),
    interceptors: {
      request: { use: vi.fn() },
      response: { use: vi.fn() },
    },
  };
  return {
    default: { create: () => instance, isAxiosError: () => false },
    AxiosError: class AxiosError {},
  };
});

const { normsAPI } = await import('./api');

beforeEach(() => {
  get.mockReset();
  post.mockReset();
});

describe('normsAPI.getContextTrace', () => {
  test('GETs the project-scoped contexttrace endpoint by id', async () => {
    get.mockResolvedValue({ data: { success: true, data: { requestId: 'trace-A' } } });
    await normsAPI.getContextTrace('proj-1', 'trace-A');
    expect(get).toHaveBeenCalledWith('/projects/proj-1/contexttrace/trace-A');
  });

  test('encodes a traceId containing special characters', async () => {
    get.mockResolvedValue({ data: { success: true, data: {} } });
    await normsAPI.getContextTrace('proj-1', 'trace/with?chars');
    expect(get).toHaveBeenCalledWith(
      `/projects/proj-1/contexttrace/${encodeURIComponent('trace/with?chars')}`,
    );
  });

  test('returns the axios response body unchanged', async () => {
    const body = { data: { success: true, data: { requestId: 'trace-A', feature: 'discovery' } } };
    get.mockResolvedValue(body);
    const res = await normsAPI.getContextTrace('proj-1', 'trace-A');
    expect(res.data.data.requestId).toBe('trace-A');
    expect(res.data.data.feature).toBe('discovery');
  });
});

describe('normsAPI.getRegulationImpact', () => {
  test('GETs the regulations/impact endpoint with query params', async () => {
    get.mockResolvedValue({ data: { success: true, data: { affected: {}, traceIds: [] } } });
    await normsAPI.getRegulationImpact('proj-1', 'dsgvo:art-30', 'v-hash-1');
    expect(get).toHaveBeenCalledWith('/projects/proj-1/regulations/impact', {
      params: { regulationKey: 'dsgvo:art-30', versionHash: 'v-hash-1' },
    });
  });

  test('returns the axios response body unchanged', async () => {
    const body = { data: { success: true, data: { affected: { mappings: [] }, traceIds: ['t1'] } } };
    get.mockResolvedValue(body);
    const res = await normsAPI.getRegulationImpact('proj-1', 'dsgvo:art-30', 'v-hash-1');
    expect(res.data.data.traceIds).toEqual(['t1']);
  });
});
