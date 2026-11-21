// @vitest-environment jsdom
/**
 * OAuth callback: the one-time login code is redeemed exactly once.
 * React StrictMode (development) runs effects twice. The server accepts a code only once,
 * so a second redemption fails — and its error path must not log out the user the first one signed in.
 * Run: cd packages/client && npx vitest run src/components/security/OAuthCallbackPage.test.tsx
 */
import { StrictMode } from 'react';
import { describe, test, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

vi.mock('../../services/api', () => ({
  authAPI: { oauthExchange: vi.fn(), me: vi.fn() },
}));

import OAuthCallbackPage from './OAuthCallbackPage';
import { authAPI } from '../../services/api';
import { useAuthStore } from '../../stores/authStore';

const exchange = vi.mocked(authAPI.oauthExchange);
const me = vi.mocked(authAPI.me);
type ExchangeAnswer = Awaited<ReturnType<typeof authAPI.oauthExchange>>;
type MeAnswer = Awaited<ReturnType<typeof authAPI.me>>;

const user = { id: 'u1', email: 'user@example.test', name: 'User', role: 'enterprise_architect' };

/** Like the server: the first redemption of a code succeeds, every further one is refused. */
function serverRedeemsOnce() {
  const used = new Set<string>();
  exchange.mockImplementation(async (code: string) => {
    if (used.has(code)) throw Object.assign(new Error('Request failed with status code 401'), { response: { status: 401 } });
    used.add(code);
    return { data: { accessToken: 'access-1', refreshToken: 'refresh-1' } } as unknown as ExchangeAnswer;
  });
  me.mockResolvedValue({ data: user } as unknown as MeAnswer);
}

function renderAt(url: string, strict: boolean) {
  const tree = (
    <MemoryRouter initialEntries={[url]}>
      <Routes>
        <Route path="/auth/callback" element={<OAuthCallbackPage />} />
        <Route path="/dashboard" element={<p>dashboard page</p>} />
        <Route path="/login" element={<p>login page</p>} />
      </Routes>
    </MemoryRouter>
  );
  return render(strict ? <StrictMode>{tree}</StrictMode> : tree);
}

describe('OAuthCallbackPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAuthStore.getState().logout();
  });

  test('in StrictMode the code is redeemed once and the user stays signed in', async () => {
    serverRedeemsOnce();
    renderAt('/auth/callback?code=abc', true);

    expect(await screen.findByText('dashboard page')).toBeInTheDocument();
    // let any second, late answer settle before checking the outcome
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(exchange).toHaveBeenCalledTimes(1);
    expect(exchange).toHaveBeenCalledWith('abc');
    expect(screen.queryByText('login page')).not.toBeInTheDocument();
    expect(useAuthStore.getState().isAuthenticated).toBe(true);
    expect(useAuthStore.getState().token).toBe('access-1');
  });

  test('without StrictMode the code is redeemed once as well', async () => {
    serverRedeemsOnce();
    renderAt('/auth/callback?code=abc', false);

    expect(await screen.findByText('dashboard page')).toBeInTheDocument();
    expect(exchange).toHaveBeenCalledTimes(1);
    expect(useAuthStore.getState().isAuthenticated).toBe(true);
  });

  test('a refused code leads to the login page and leaves no session behind', async () => {
    exchange.mockRejectedValue(Object.assign(new Error('Request failed with status code 401'), { response: { status: 401 } }));
    renderAt('/auth/callback?code=expired', true);

    expect(await screen.findByText('login page')).toBeInTheDocument();
    expect(exchange).toHaveBeenCalledTimes(1);
    expect(useAuthStore.getState().isAuthenticated).toBe(false);
    expect(useAuthStore.getState().token).toBeNull();
  });

  test('without a code it goes to the login page and calls nothing', async () => {
    renderAt('/auth/callback', true);

    expect(await screen.findByText('login page')).toBeInTheDocument();
    expect(exchange).not.toHaveBeenCalled();
  });
});
