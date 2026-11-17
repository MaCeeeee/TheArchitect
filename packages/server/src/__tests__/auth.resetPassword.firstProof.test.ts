/**
 * Security-Audit H8 (Review-Fund): Pre-Hijacking über den Passwort-Reset.
 *
 * Der Angreifer registriert `victim@corp`, richtet API-Keys und MFA ein und
 * behält einen 7-Tage-Refresh-Token. Das Opfer wird beim SSO abgewiesen
 * („sign in with your password") und setzt das Passwort zurück. Der Reset
 * ist der ERSTE Nachweis, dass das Konto dem Postfach-Besitzer gehört —
 * alles, was davor eingerichtet wurde, kann vom Angreifer stammen und muss
 * weg. Sessions werden bei jedem Reset widerrufen.
 */
import express from 'express';
import request from 'supertest';

type FakeUser = Record<string, unknown> & { save: jest.Mock };
let mockUser: FakeUser;
const mockApiKeyDeleteMany = jest.fn(async (_q: unknown) => ({ deletedCount: 2 }));
const mockRevokeAll = jest.fn(async (..._a: unknown[]) => 3);

jest.mock('../models/User', () => ({ User: { findOne: jest.fn(async () => mockUser) } }));
jest.mock('../models/ApiKey', () => ({ ApiKey: { deleteMany: (q: unknown) => mockApiKeyDeleteMany(q) } }));
jest.mock('../services/session.service', () => ({
  createSession: jest.fn(),
  revokeSession: jest.fn(),
  revokeAllSessions: (...a: unknown[]) => mockRevokeAll(...a),
}));
jest.mock('../config/redis', () => ({ getRedis: () => ({}) }));
jest.mock('../middleware/audit.middleware', () => ({ createAuditEntry: jest.fn(async () => undefined) }));
jest.mock('../utils/totp', () => ({ isTotpCodeValid: () => false }));
jest.mock('../services/email.service', () => ({}));
jest.mock('../services/upload.service', () => ({}));
jest.mock('../services/oauth.service', () => ({}));
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

function user(emailVerified: boolean): FakeUser {
  return {
    _id: { toString: () => 'u-victim' },
    email: 'victim@corp.example',
    emailVerified,
    mfaEnabled: true,
    mfaSecret: 'ATTACKERSECRET',
    save: jest.fn(async () => undefined),
  };
}

const reset = () =>
  request(makeApp()).post('/api/auth/reset-password').send({ token: 't', password: 'N3w-Passw0rd!' });

beforeEach(() => {
  mockApiKeyDeleteMany.mockClear();
  mockRevokeAll.mockClear();
});

describe('Passwort-Reset als erster Besitznachweis (Security-Audit H8)', () => {
  it('purges API keys and MFA set up before the email was ever proven — der ganze Zweck', async () => {
    mockUser = user(false);
    expect((await reset()).status).toBe(200);
    expect(mockApiKeyDeleteMany).toHaveBeenCalledWith({ userId: mockUser._id });
    expect(mockUser.mfaEnabled).toBe(false);
    expect(mockUser.mfaSecret).toBeUndefined();
    expect(mockRevokeAll).toHaveBeenCalledWith(expect.anything(), 'u-victim');
  });

  it('revokes all sessions on every reset, but keeps keys and MFA of a verified account', async () => {
    mockUser = user(true);
    expect((await reset()).status).toBe(200);
    expect(mockRevokeAll).toHaveBeenCalledWith(expect.anything(), 'u-victim');
    expect(mockApiKeyDeleteMany).not.toHaveBeenCalled();
    expect(mockUser.mfaEnabled).toBe(true);
  });
});
