/**
 * Sprint-3 — authFetch refresh-token flow unit tests
 */

import { describe, test, expect, beforeEach, vi } from 'vitest';

// Mock the auth-store before importing authFetch
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

const { authFetch } = await import('./authFetch');

// Stub fetch — each test arranges its own sequence of responses
const originalFetch = global.fetch;
let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  setTokens.mockClear();
  logout.mockClear();
  fetchMock = vi.fn();
  global.fetch = fetchMock as unknown as typeof fetch;
  // Prevent jsdom location.href navigation crashes in failHard()
  if (typeof window !== 'undefined') {
    Object.defineProperty(window, 'location', {
      value: { href: '' },
      writable: true,
    });
  }
});

afterAll(() => {
  global.fetch = originalFetch;
});

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('authFetch', () => {
  test('attaches Bearer token from auth-store on the first call', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ ok: true }));

    await authFetch('/api/foo', { method: 'GET' });

    const [, init] = fetchMock.mock.calls[0];
    const headers = init.headers as Headers;
    expect(headers.get('Authorization')).toBe('Bearer access-current');
  });

  test('passes through a non-401 response unchanged', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ data: 1 }, 200));

    const res = await authFetch('/api/foo');
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({ data: 1 });
    expect(setTokens).not.toHaveBeenCalled();
    expect(logout).not.toHaveBeenCalled();
  });

  test('TOKEN_EXPIRED 401 triggers refresh and retries the original request', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ error: 'Token expired', code: 'TOKEN_EXPIRED' }, 401))
      .mockResolvedValueOnce(jsonResponse({ accessToken: 'access-new', refreshToken: 'refresh-new' }))
      .mockResolvedValueOnce(jsonResponse({ data: 'retry-ok' }, 200));

    const res = await authFetch('/api/foo', { method: 'POST' });
    const body = await res.json();

    expect(body).toEqual({ data: 'retry-ok' });
    expect(setTokens).toHaveBeenCalledWith('access-new', 'refresh-new');
    expect(logout).not.toHaveBeenCalled();

    // Third call (the retry) should have the NEW Bearer token
    const [, retryInit] = fetchMock.mock.calls[2];
    const retryHeaders = retryInit.headers as Headers;
    expect(retryHeaders.get('Authorization')).toBe('Bearer access-new');
  });

  test('refresh failure leads to logout + redirect', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ error: 'Token expired', code: 'TOKEN_EXPIRED' }, 401))
      .mockResolvedValueOnce(jsonResponse({ error: 'Refresh token invalid' }, 401)); // refresh fails

    await authFetch('/api/foo');

    expect(logout).toHaveBeenCalled();
  });

  test('generic 401 (no TOKEN_EXPIRED code) triggers immediate logout', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ error: 'Missing token' }, 401));

    await authFetch('/api/foo');

    expect(logout).toHaveBeenCalled();
    expect(setTokens).not.toHaveBeenCalled();
    // refresh fetch should NOT have been called
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  test('401 with non-JSON body treated as generic 401', async () => {
    fetchMock.mockResolvedValueOnce(new Response('plain text 401', { status: 401 }));

    await authFetch('/api/foo');

    expect(logout).toHaveBeenCalled();
    expect(setTokens).not.toHaveBeenCalled();
  });
});

// vitest's beforeEach already covers reset; afterAll restoring fetch is enough.
import { afterAll } from 'vitest';
