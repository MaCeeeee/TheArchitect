/**
 * Security-Audit H12: API-Keys speichern `permissions[]`, zeigen sie an — aber
 * `authenticateApiKey` hat sie nie gelesen. Ein Key, angelegt als
 * `["project:read"]`, trug die volle Rolle seines Besitzers. Diese Tests
 * nageln fest: ein Key mit Scope kann nie mehr als sein Scope; ein Key ohne
 * Scope bleibt (wie bisher, so legt ihn die UI an) ein Key mit Besitzerrechten.
 */
import crypto from 'crypto';
import express from 'express';
import request from 'supertest';
import { PERMISSIONS } from '@thearchitect/shared';

const OWNER = {
  _id: { toString: () => '507f1f77bcf86cd799439011' },
  role: 'enterprise_architect',
  permissions: [],
};

const KEYS: Record<string, { userId: string; permissions: string[]; expiresAt: Date | null; _id: string }> = {};
function mintKey(permissions: string[]): string {
  const raw = `ta_${crypto.randomBytes(16).toString('hex')}`;
  const hash = crypto.createHash('sha256').update(raw).digest('hex');
  KEYS[hash] = { userId: OWNER._id.toString(), permissions, expiresAt: null, _id: hash };
  return raw;
}

const apiKeyCreate = jest.fn(async (doc: Record<string, unknown>) => ({ ...doc, _id: 'new-key', createdAt: new Date() }));
jest.mock('../models/ApiKey', () => ({
  ApiKey: {
    findOne: jest.fn(async ({ keyHash }: { keyHash: string }) => KEYS[keyHash] ?? null),
    updateOne: jest.fn(() => Promise.resolve()),
    create: (doc: Record<string, unknown>) => apiKeyCreate(doc),
  },
}));
jest.mock('../models/User', () => ({
  User: { findById: () => ({ select: () => Promise.resolve(OWNER) }) },
}));
jest.mock('../config/redis', () => ({ getRedis: () => ({}) }));
jest.mock('../services/session.service', () => ({
  isSessionActive: jest.fn(async () => true),
  touchSession: jest.fn(async () => undefined),
  listSessions: jest.fn(),
  revokeSession: jest.fn(),
  revokeAllSessions: jest.fn(),
}));
jest.mock('../middleware/audit.middleware', () => ({ createAuditEntry: jest.fn(async () => undefined) }));
jest.mock('../models/Connection', () => ({ Connection: {}, encryptCredentials: jest.fn(), decryptCredentials: jest.fn() }));
jest.mock('../models/Project', () => ({ Project: {} }));
jest.mock('../services/connectors', () => ({ getAllConnectorTypes: jest.fn(() => []), getConnector: jest.fn() }));

import { authenticate, generateAccessToken } from '../middleware/auth.middleware';
import { requirePermission } from '../middleware/rbac.middleware';
import settingsRoutes from '../routes/settings.routes';

function makeApp() {
  const app = express();
  app.use(express.json());
  app.get('/probe/read', authenticate, requirePermission(PERMISSIONS.PROJECT_READ), (_q, r) => r.json({ ok: true }));
  app.delete('/probe/element', authenticate, requirePermission(PERMISSIONS.ELEMENT_DELETE), (_q, r) => r.json({ ok: true }));
  app.post('/probe/unguarded', authenticate, (_q, r) => r.json({ ok: true }));
  app.use('/api/settings', settingsRoutes);
  return app;
}

describe('API-Key-Scope (Security-Audit H12)', () => {
  beforeEach(() => apiKeyCreate.mockClear());

  it('DENIES a permission outside the key scope although the owner holds it — der ganze Zweck', async () => {
    const key = mintKey([PERMISSIONS.PROJECT_READ]);
    const res = await request(makeApp()).delete('/probe/element').set('X-API-Key', key);
    expect(res.status).toBe(403);
  });

  it('allows a permission inside the key scope', async () => {
    const key = mintKey([PERMISSIONS.PROJECT_READ]);
    const res = await request(makeApp()).get('/probe/read').set('X-API-Key', key);
    expect(res.status).toBe(200);
  });

  it('a read-only key cannot write, even on a route without a permission check', async () => {
    const key = mintKey([PERMISSIONS.PROJECT_READ, PERMISSIONS.ELEMENT_READ]);
    const res = await request(makeApp()).post('/probe/unguarded').set('Authorization', `Bearer ${key}`);
    expect(res.status).toBe(403);
  });

  it('never grants more than the owner has — the scope narrows, it does not widen', async () => {
    const key = mintKey([PERMISSIONS.ADMIN_MANAGE_USERS]);
    const app = express();
    app.get('/admin', authenticate, requirePermission(PERMISSIONS.ADMIN_MANAGE_USERS), (_q, r) => r.json({ ok: true }));
    const res = await request(app).get('/admin').set('X-API-Key', key);
    expect(res.status).toBe(403);
  });

  it('keeps an unscoped key (empty list, as the UI creates it) at the owner role', async () => {
    const key = mintKey([]);
    const res = await request(makeApp()).delete('/probe/element').set('X-API-Key', key);
    expect(res.status).toBe(200);
  });

  it('an API key cannot mint a new API key — sonst hebt ein Scope-Key sich selbst aus', async () => {
    const key = mintKey([PERMISSIONS.ELEMENT_CREATE]);
    const res = await request(makeApp()).post('/api/settings/api-keys').set('X-API-Key', key).send({ name: 'escalate' });
    expect(res.status).toBe(403);
    expect(apiKeyCreate).not.toHaveBeenCalled();
  });

  it('rejects unknown permission strings when creating a key', async () => {
    const jwtToken = generateAccessToken(OWNER._id.toString(), OWNER.role);
    const res = await request(makeApp())
      .post('/api/settings/api-keys')
      .set('Authorization', `Bearer ${jwtToken}`)
      .send({ name: 'bad', permissions: ['project:read', 'root:everything'] });
    expect(res.status).toBe(400);
    expect(apiKeyCreate).not.toHaveBeenCalled();
  });

  it('still creates a scoped key for an interactive (JWT) session', async () => {
    const jwtToken = generateAccessToken(OWNER._id.toString(), OWNER.role);
    const res = await request(makeApp())
      .post('/api/settings/api-keys')
      .set('Authorization', `Bearer ${jwtToken}`)
      .send({ name: 'reader', permissions: [PERMISSIONS.PROJECT_READ] });
    expect(res.status).toBe(201);
    expect(res.body.permissions).toEqual([PERMISSIONS.PROJECT_READ]);
  });
});
