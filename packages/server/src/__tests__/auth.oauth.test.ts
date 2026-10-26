/**
 * Security-Audit H8 + H9 (OAuth).
 *
 * H8 — Pre-Hijacking: `findOrCreateOAuthUser` hängte jede OAuth-Identität an
 * ein bestehendes lokales Konto mit derselben E-Mail, ohne zu prüfen, ob die
 * E-Mail auf irgendeiner Seite bestätigt ist. Angreifer registriert
 * `victim@corp` mit eigenem Passwort; meldet sich das Opfer später per SSO an,
 * landet es im Konto des Angreifers.
 *
 * H9 — Login-CSRF: `state` war ein globaler Redis-Nonce ohne Bindung an den
 * Browser. Ein Angreifer erzeugt ein gültiges (code, state) für SEIN Konto
 * und schickt dem Opfer die Callback-URL — das Opfer arbeitet danach
 * unbemerkt im Konto des Angreifers.
 */
import express from 'express';
import request from 'supertest';

process.env.GOOGLE_CLIENT_ID = 'test-client';
process.env.GOOGLE_CLIENT_SECRET = 'test-secret';

const mockStore = new Map<string, string>();
jest.mock('../config/redis', () => ({
  getRedis: () => ({
    get: async (k: string) => mockStore.get(k) ?? null,
    set: async (k: string, v: string) => {
      mockStore.set(k, v);
      return 'OK';
    },
    del: async (k: string) => (mockStore.delete(k) ? 1 : 0),
  }),
}));

type FakeUser = {
  _id: { toString: () => string };
  email: string;
  name: string;
  role: string;
  emailVerified: boolean;
  oauthProviders: Array<{ provider: string; providerId: string }>;
  save: jest.Mock;
};
let mockExisting: FakeUser | null = null;
const mockCreate = jest.fn(async (doc: Record<string, unknown>) => ({ _id: { toString: () => 'u-new' }, ...doc }));
jest.mock('../models/User', () => ({
  User: {
    findOne: jest.fn(async (q: Record<string, unknown>) => ('email' in q ? mockExisting : null)),
    countDocuments: jest.fn(async () => 5),
    create: (doc: Record<string, unknown>) => mockCreate(doc),
  },
}));

let mockProfile = { provider: 'google', providerId: 'g-victim', email: 'victim@corp.example', name: 'Victim', emailVerified: true };
jest.mock('../services/oauth.service', () => ({
  exchangeGoogleCode: jest.fn(async () => mockProfile),
  exchangeGithubCode: jest.fn(async () => mockProfile),
  exchangeMicrosoftCode: jest.fn(async () => mockProfile),
}));

let mockIdPayload: Record<string, unknown> = {};
jest.mock('google-auth-library', () => ({
  OAuth2Client: jest.fn().mockImplementation(() => ({
    verifyIdToken: jest.fn(async () => ({ getPayload: () => mockIdPayload })),
  })),
}));

jest.mock('../services/session.service', () => ({
  createSession: jest.fn(async () => 'sid-1'),
  revokeSession: jest.fn(),
}));
jest.mock('../middleware/audit.middleware', () => ({ createAuditEntry: jest.fn(async () => undefined) }));
jest.mock('../utils/totp', () => ({ isTotpCodeValid: () => false }));
jest.mock('../services/email.service', () => ({}));
jest.mock('../services/upload.service', () => ({}));
jest.mock('../models/HealthReport', () => ({}));
jest.mock('../models/Project', () => ({}));
jest.mock('otplib', () => ({}));

import authRoutes from '../routes/auth.routes';

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/auth', authRoutes);
  return app;
}

/** Startet den Login in EINEM Browser: liefert state und dessen Cookie-Header. */
async function startLogin(app: express.Express): Promise<{ state: string; cookie: string }> {
  const res = await request(app).get('/api/auth/oauth/google');
  expect(res.status).toBe(302);
  const state = new URL(res.headers.location).searchParams.get('state')!;
  const setCookie = (res.headers['set-cookie'] as unknown as string[] | undefined) ?? [];
  const cookie = setCookie.map((c) => c.split(';')[0]).join('; ');
  return { state, cookie };
}

function landedWithTokens(location: string): boolean {
  return location.includes('/auth/callback') && location.includes('accessToken=');
}

function existingUser(emailVerified: boolean): FakeUser {
  return {
    _id: { toString: () => 'u-existing' },
    email: 'victim@corp.example',
    name: 'Existing',
    role: 'enterprise_architect',
    emailVerified,
    oauthProviders: [],
    save: jest.fn(async () => undefined),
  };
}

beforeEach(() => {
  mockStore.clear();
  mockCreate.mockClear();
  mockExisting = null;
  mockProfile = { provider: 'google', providerId: 'g-victim', email: 'victim@corp.example', name: 'Victim', emailVerified: true };
});

describe('OAuth state ist an den Browser gebunden (Security-Audit H9)', () => {
  it('REJECTS a valid state presented without the initiating browser’s cookie — der ganze Zweck', async () => {
    const app = makeApp();
    const { state } = await startLogin(app); // Angreifer-Browser
    const res = await request(app).get(`/api/auth/oauth/google/callback?code=c&state=${state}`); // Opfer, ohne Cookie
    expect(res.status).toBe(302);
    expect(landedWithTokens(res.headers.location)).toBe(false);
  });

  it('rejects a state from one browser combined with the cookie of another', async () => {
    const app = makeApp();
    const attacker = await startLogin(app);
    const victim = await startLogin(app);
    const res = await request(app)
      .get(`/api/auth/oauth/google/callback?code=c&state=${attacker.state}`)
      .set('Cookie', victim.cookie);
    expect(landedWithTokens(res.headers.location)).toBe(false);
  });

  it('completes the login in the browser that started it', async () => {
    const app = makeApp();
    const { state, cookie } = await startLogin(app);
    const res = await request(app).get(`/api/auth/oauth/google/callback?code=c&state=${state}`).set('Cookie', cookie);
    expect(landedWithTokens(res.headers.location)).toBe(true);
  });

  it('the state is single-use', async () => {
    const app = makeApp();
    const { state, cookie } = await startLogin(app);
    await request(app).get(`/api/auth/oauth/google/callback?code=c&state=${state}`).set('Cookie', cookie);
    const again = await request(app).get(`/api/auth/oauth/google/callback?code=c&state=${state}`).set('Cookie', cookie);
    expect(landedWithTokens(again.headers.location)).toBe(false);
  });
});

describe('OAuth-Verknüpfung nur bei bestätigter E-Mail (Security-Audit H8)', () => {
  async function callback(app: express.Express) {
    const { state, cookie } = await startLogin(app);
    return request(app).get(`/api/auth/oauth/google/callback?code=c&state=${state}`).set('Cookie', cookie);
  }

  it('does NOT link into a local account whose email was never verified — Pre-Hijacking', async () => {
    mockExisting = existingUser(false); // vom Angreifer vorregistriert
    const res = await callback(makeApp());
    expect(landedWithTokens(res.headers.location)).toBe(false);
    expect(mockExisting.oauthProviders).toEqual([]);
    expect(mockExisting.save).not.toHaveBeenCalled();
  });

  it('does NOT link when the provider does not vouch for the email', async () => {
    mockExisting = existingUser(true);
    mockProfile = { ...mockProfile, emailVerified: false };
    const res = await callback(makeApp());
    expect(landedWithTokens(res.headers.location)).toBe(false);
    expect(mockExisting.oauthProviders).toEqual([]);
  });

  it('still links when both sides have verified the email', async () => {
    mockExisting = existingUser(true);
    const res = await callback(makeApp());
    expect(landedWithTokens(res.headers.location)).toBe(true);
    expect(mockExisting.oauthProviders).toHaveLength(1);
  });

  it('the Google ID-token flow honours email_verified as well', async () => {
    mockExisting = existingUser(true);
    mockIdPayload = { sub: 'g-victim', email: 'victim@corp.example', email_verified: false, name: 'V' };
    const res = await request(makeApp()).post('/api/auth/oauth/google/token').send({ credential: 'jwt' });
    expect(res.status).not.toBe(200);
    expect(mockExisting.oauthProviders).toEqual([]);
  });

  it('a brand-new OAuth account carries the provider’s verification state', async () => {
    mockProfile = { ...mockProfile, email: 'new@corp.example', emailVerified: true };
    await callback(makeApp());
    expect(mockCreate).toHaveBeenCalledWith(expect.objectContaining({ email: 'new@corp.example', emailVerified: true }));
  });
});
