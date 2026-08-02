/**
 * Tests für das Sitzungs-Tor in `authenticate` (THE-535).
 *
 * Das ist die sicherheitskritische Naht: hier entscheidet sich, ob ein
 * Widerruf SOFORT wirkt oder erst mit Token-Ablauf. Der Dienst darunter ist
 * getrennt getestet — hier geht es nur um die vier Verhaltensweisen der
 * Middleware.
 */
import jwt from 'jsonwebtoken';

const REDIS = { get: jest.fn(), set: jest.fn(), keys: jest.fn(), del: jest.fn() };
jest.mock('../config/redis', () => ({ getRedis: () => REDIS }));

const USER = { _id: '507f1f77bcf86cd799439011', role: 'chief_architect' };
jest.mock('../models/User', () => ({
  User: { findById: () => ({ select: () => Promise.resolve(USER) }) },
}));

import { authenticate, generateAccessToken } from '../middleware/auth.middleware';

function run(token: string): Promise<{ status: number; body: unknown; passed: boolean }> {
  return new Promise((resolve) => {
    const req = { headers: { authorization: `Bearer ${token}` } } as never;
    const res = {
      status(code: number) {
        (this as unknown as { _code: number })._code = code;
        return this;
      },
      json(body: unknown) {
        resolve({ status: (this as unknown as { _code: number })._code, body, passed: false });
        return this;
      },
    } as never;
    authenticate(req, res, () => resolve({ status: 200, body: null, passed: true }));
  });
}

describe('authenticate — das Sitzungs-Tor', () => {
  beforeEach(() => {
    REDIS.get.mockReset();
    REDIS.set.mockReset();
  });

  it('lets a token WITHOUT sid through — Alt-Tokens von vor dem Deploy dürfen nicht aussperren', async () => {
    const token = generateAccessToken(USER._id, USER.role); // ohne sid
    const r = await run(token);
    expect(r.passed).toBe(true);
    expect(REDIS.get).not.toHaveBeenCalled(); // gar nicht erst gefragt
  });

  it('lets a token through whose session is alive', async () => {
    REDIS.get.mockResolvedValue(JSON.stringify({ device: 'x', ip: '', createdAt: '', lastActive: '' }));
    const r = await run(generateAccessToken(USER._id, USER.role, 'sid-live'));
    expect(r.passed).toBe(true);
    expect(REDIS.get).toHaveBeenCalledWith(`session:${USER._id}:sid-live`);
  });

  it('REJECTS a token whose session was revoked — das ist der ganze Zweck', async () => {
    REDIS.get.mockResolvedValue(null); // widerrufen
    const r = await run(generateAccessToken(USER._id, USER.role, 'sid-weg'));
    expect(r.passed).toBe(false);
    expect(r.status).toBe(401);
    expect(r.body).toMatchObject({ code: 'SESSION_REVOKED' });
  });

  it('FAILS OPEN when Redis is down — ein Ausfall sperrt niemanden aus', async () => {
    REDIS.get.mockRejectedValue(new Error('redis down'));
    const r = await run(generateAccessToken(USER._id, USER.role, 'sid-egal'));
    expect(r.passed).toBe(true);
  });

  it('refuses a refresh token on the access path — unverändert', async () => {
    const refresh = jwt.sign(
      { userId: USER._id, role: USER.role, type: 'refresh' },
      process.env.JWT_SECRET || 'dev-only-JWT_SECRET-not-for-production',
      { expiresIn: '5m' },
    );
    const r = await run(refresh);
    expect(r.status).toBe(401);
  });
});
