/**
 * REQ-CERT-001.2 — certificationAPI client tests (Trust-Spine UC-CERT-001).
 *
 * Verifies the Notar-Queue API layer hits the right certification endpoints
 * and forwards the certify payload (IDs vs. { all: true }) unchanged. The
 * axios instance is mocked so no network/interceptor logic runs.
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

const { certificationAPI } = await import('./api');

beforeEach(() => {
  get.mockReset();
  post.mockReset();
});

describe('certificationAPI.getPending', () => {
  test('GETs the project-scoped pending endpoint', async () => {
    get.mockResolvedValue({ data: { success: true, data: { elements: [], connections: [], total: 0 } } });
    await certificationAPI.getPending('proj-1');
    expect(get).toHaveBeenCalledWith('/projects/proj-1/certification/pending');
  });

  test('returns the axios response body unchanged', async () => {
    const body = {
      data: { success: true, data: { elements: [{ id: 'e1' }], connections: [], total: 1 } },
    };
    get.mockResolvedValue(body);
    const res = await certificationAPI.getPending('p');
    expect(res.data.data.total).toBe(1);
    expect(res.data.data.elements[0].id).toBe('e1');
  });
});

describe('certificationAPI.certify', () => {
  test('POSTs elementIds + connectionIds in the body', async () => {
    post.mockResolvedValue({ data: { success: true, data: { elementsCertified: 2, connectionsCertified: 1 } } });
    await certificationAPI.certify('proj-1', { elementIds: ['e1', 'e2'], connectionIds: ['c1'] });
    expect(post).toHaveBeenCalledWith('/projects/proj-1/certification/certify', {
      elementIds: ['e1', 'e2'],
      connectionIds: ['c1'],
    });
  });

  test('POSTs { all: true } for certify-all', async () => {
    post.mockResolvedValue({ data: { success: true, data: { elementsCertified: 5, connectionsCertified: 3 } } });
    await certificationAPI.certify('p', { all: true });
    expect(post).toHaveBeenCalledWith('/projects/p/certification/certify', { all: true });
  });

  test('returns certified counts from the response', async () => {
    post.mockResolvedValue({ data: { success: true, data: { elementsCertified: 5, connectionsCertified: 3 } } });
    const res = await certificationAPI.certify('p', { all: true });
    expect(res.data.data.elementsCertified).toBe(5);
    expect(res.data.data.connectionsCertified).toBe(3);
  });
});
