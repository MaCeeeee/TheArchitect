/**
 * Sprint-3 Bug-Fix — Refresh-Token-aware fetch() wrapper.
 *
 * The four AI-generator hooks (useDataObjectGenerator, useActivityGenerator,
 * useHierarchyGenerator, useProcessGenerator) use native `fetch()` instead
 * of the axios instance — because they need to consume Server-Sent-Events
 * streams which axios doesn't expose cleanly. As a result the
 * response-interceptor in services/api.ts (which handles
 * TOKEN_EXPIRED → refresh → retry) never fired for them, so users would
 * hit `{"error":"Token expired","code":"TOKEN_EXPIRED"}` raw 401 responses
 * mid-flow and get a frustrating modal-without-content.
 *
 * This wrapper replicates the axios interceptor's logic with plain fetch:
 *   1. Attach Bearer token from auth-store before sending
 *   2. If response is 401 with code === 'TOKEN_EXPIRED':
 *        - Call /auth/refresh with the refresh token
 *        - Save the new access + refresh tokens
 *        - Retry the original request once with the new access token
 *   3. If refresh fails (no refresh token, /auth/refresh also 401, etc.):
 *        - Logout, redirect to /login (same as axios interceptor)
 *   4. Generic 401 (no TOKEN_EXPIRED code): logout + redirect immediately
 *
 * For SSE-streams: the wrapper handles the **initial** response. If the
 * stream is mid-flight when the token expires the user gets a stream-end
 * (server cuts it), which is the same behavior as the existing flow —
 * the next interaction will see the 401, refresh, and continue.
 *
 * Concurrency: simple — each authFetch call refreshes independently if
 * needed. For high-concurrency flows we'd want a single in-flight refresh
 * queue (like the axios interceptor has), but the four generator hooks
 * are user-triggered and rarely fire in parallel.
 */

import { useAuthStore } from '../stores/authStore';

const API_BASE = import.meta.env.VITE_API_URL || '/api';

interface AuthFetchInit extends RequestInit {
  /**
   * If true, skip the token-refresh dance and just attach the current
   * Bearer. Used internally by the refresh call itself to avoid recursion.
   */
  _skipAuth?: boolean;
}

let refreshPromise: Promise<string | null> | null = null;

/**
 * Refresh the access token. Concurrent callers share the same in-flight
 * refresh so we don't burn the refresh token multiple times.
 */
async function refreshAccessToken(): Promise<string | null> {
  if (refreshPromise) return refreshPromise;

  refreshPromise = (async () => {
    const refreshToken = useAuthStore.getState().refreshToken;
    if (!refreshToken) return null;

    try {
      const resp = await fetch(`${API_BASE}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken }),
      });
      if (!resp.ok) return null;
      const data = (await resp.json()) as { accessToken: string; refreshToken: string };
      useAuthStore.getState().setTokens(data.accessToken, data.refreshToken);
      return data.accessToken;
    } catch {
      return null;
    } finally {
      // Clear so the next 401 starts a fresh refresh dance
      refreshPromise = null;
    }
  })();

  return refreshPromise;
}

/**
 * Logout + redirect — same end-state as the axios 401 generic path.
 */
function failHard(): void {
  useAuthStore.getState().logout();
  if (typeof window !== 'undefined') {
    window.location.href = '/login';
  }
}

/**
 * fetch() replacement for the AI-generator hooks. Drop-in compatible —
 * returns a normal Response object so consumers can keep using
 * response.ok / response.body.getReader() etc.
 */
export async function authFetch(url: string, init: AuthFetchInit = {}): Promise<Response> {
  const { _skipAuth, headers, ...rest } = init;

  const buildHeaders = (token: string | null): HeadersInit => {
    const merged = new Headers(headers as HeadersInit);
    if (token && !_skipAuth) merged.set('Authorization', `Bearer ${token}`);
    return merged;
  };

  const firstToken = useAuthStore.getState().token;
  let response = await fetch(url, { ...rest, headers: buildHeaders(firstToken) });

  if (response.status !== 401 || _skipAuth) return response;

  // 401 — inspect the response body to decide refresh vs logout. Body
  // can only be read once, so clone first.
  let code: string | undefined;
  try {
    const cloned = response.clone();
    const body = (await cloned.json()) as { code?: string };
    code = body?.code;
  } catch {
    // Body wasn't JSON — treat as generic 401
  }

  if (code === 'TOKEN_EXPIRED') {
    const newToken = await refreshAccessToken();
    if (!newToken) {
      failHard();
      return response;
    }
    // Retry once with the new token
    response = await fetch(url, { ...rest, headers: buildHeaders(newToken) });
    if (response.status === 401) failHard();
    return response;
  }

  // Generic 401 — invalid/missing token, no recovery
  failHard();
  return response;
}
