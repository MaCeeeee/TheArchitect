/**
 * Security-Audit H1: der MFA-Zwischen-Token aus `/login` war ein normaler
 * Zugangs-Token (`type: 'access'`, ohne `sid`). `authenticate` ließ ihn durch
 * und las die Rechte aus der DB-Rolle — wer nur das Passwort kannte, hatte
 * damit vollen API-Zugriff, ganz ohne zweiten Faktor. Diese Tests nageln fest:
 * der Zwischen-Token taugt ausschließlich für `/mfa/verify`.
 */
import express from 'express';
import request from 'supertest';
import bcrypt from 'bcrypt';

const PASSWORD = 'Correct-Horse-1!';
const USER = {
  _id: { toString: () => '507f1f77bcf86cd799439011' },
  email: 'mfa@example.com',
  name: 'MFA User',
  role: 'enterprise_architect',
  passwordHash: bcrypt.hashSync(PASSWORD, 4),
  mfaEnabled: true,
  mfaSecret: 'JBSWY3DPEHPK3PXP',
};

// `findById` wird zweimal unterschiedlich benutzt: `authenticate` ruft
// `.select(...)`, `/mfa/verify` awaitet direkt.
const asQuery = (doc: unknown) => ({
  select: () => Promise.resolve(doc),
  then: (ok: (v: unknown) => unknown, fail?: (e: unknown) => unknown) => Promise.resolve(doc).then(ok, fail),
});
jest.mock('../models/User', () => ({
  User: {
    findOne: jest.fn(() => Promise.resolve(USER)),
    findById: jest.fn(() => asQuery(USER)),
  },
}));
jest.mock('../config/redis', () => ({ getRedis: () => ({ get: jest.fn(async () => '{}'), set: jest.fn() }) }));
jest.mock('../services/session.service', () => ({
  createSession: jest.fn(async () => 'sid-full'),
  revokeSession: jest.fn(),
  isSessionActive: jest.fn(async () => true),
  touchSession: jest.fn(async () => undefined),
}));
jest.mock('../middleware/audit.middleware', () => ({ createAuditEntry: jest.fn(async () => undefined) }));
jest.mock('../utils/totp', () => ({ isTotpCodeValid: (code: unknown) => code === '424242' }));
jest.mock('../services/email.service', () => ({}));
jest.mock('../services/upload.service', () => ({}));
jest.mock('../services/oauth.service', () => ({}));
jest.mock('../models/HealthReport', () => ({}));
jest.mock('../models/Project', () => ({}));
jest.mock('otplib', () => ({}));

import authRoutes from '../routes/auth.routes';
import { authenticate, generateAccessToken } from '../middleware/auth.middleware';

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/auth', authRoutes);
  app.get('/api/probe', authenticate, (_req, res) => res.json({ ok: true }));
  return app;
}

async function loginForMfaToken(app: express.Express): Promise<string> {
  const res = await request(app).post('/api/auth/login').send({ email: USER.email, password: PASSWORD });
  expect(res.status).toBe(200);
  expect(res.body.mfaRequired).toBe(true);
  return res.body.mfaToken as string;
}

describe('MFA-Zwischen-Token (Security-Audit H1)', () => {
  it('REJECTS the pending token on a protected route — der ganze Zweck', async () => {
    const app = makeApp();
    const mfaToken = await loginForMfaToken(app);
    const res = await request(app).get('/api/probe').set('Authorization', `Bearer ${mfaToken}`);
    expect(res.status).toBe(401);
  });

  it('still completes the login with the pending token and a valid code', async () => {
    const app = makeApp();
    const mfaToken = await loginForMfaToken(app);
    const res = await request(app).post('/api/auth/mfa/verify').send({ mfaToken, code: '424242' });
    expect(res.status).toBe(200);
    expect(res.body.accessToken).toEqual(expect.any(String));
    // Der echte Zugangs-Token kommt durch.
    const probe = await request(app).get('/api/probe').set('Authorization', `Bearer ${res.body.accessToken}`);
    expect(probe.status).toBe(200);
  });

  it('rejects a wrong code', async () => {
    const app = makeApp();
    const mfaToken = await loginForMfaToken(app);
    const res = await request(app).post('/api/auth/mfa/verify').send({ mfaToken, code: '000000' });
    expect(res.status).toBe(401);
  });

  it('does not accept an ordinary access token in place of the pending token', async () => {
    const app = makeApp();
    const access = generateAccessToken(USER._id.toString(), USER.role, 'sid-x');
    const res = await request(app).post('/api/auth/mfa/verify').send({ mfaToken: access, code: '424242' });
    expect(res.status).not.toBe(200);
  });

  it('rejects a pending token minted before the fix (type access, role __mfa_pending__)', async () => {
    const legacy = generateAccessToken(USER._id.toString(), '__mfa_pending__');
    const res = await request(makeApp()).get('/api/probe').set('Authorization', `Bearer ${legacy}`);
    expect(res.status).toBe(401);
  });
});
