/**
 * THE-655 Slice 1 — Ein geteilter Snapshot überlebt seinen Ursprung nicht.
 *
 * Befund (Prod, 2026-08-12): ein öffentlicher Snapshot-Link lieferte nach
 * Projekt- UND Kontolöschung weiter 200 bis zum TTL-Ablauf. Diese Tests pinnen
 * den öffentlichen Endpunkt: 200 nur, solange Projekt und Ersteller existieren;
 * sonst 410 Gone mit Klartext, und der Token ist danach weg.
 *
 * Run: cd packages/server && npx jest src/__tests__/snapshot.routes.gone.test.ts
 */
import express, { type Express } from 'express';
import request from 'supertest';

jest.mock('../config/neo4j', () => ({ runCypher: jest.fn().mockResolvedValue([]) }));
const projectExists = jest.fn();
const userExists = jest.fn();
jest.mock('../models/Project', () => ({ Project: { exists: (...a: unknown[]) => projectExists(...a) } }));
jest.mock('../models/User', () => ({ User: { exists: (...a: unknown[]) => userExists(...a) } }));
jest.mock('../middleware/auth.middleware', () => ({
  authenticate: (_req: any, _res: any, next: any) => next(),
}));
jest.mock('../middleware/projectAccess.middleware', () => ({
  requireProjectAccess: () => (_req: any, _res: any, next: any) => next(),
}));
jest.mock('../middleware/audit.middleware', () => ({
  createAuditEntry: jest.fn(),
  audit: () => (_req: any, _res: any, next: any) => next(),
}));

import { createSnapshot, peekSnapshot, resolveSharedSnapshot } from '../services/snapshot.service';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const snapshotRouter = require('../routes/snapshot.routes').default;

const PROJECT = '64b7f0c2a1e4d3f2b8c9a0d1';
const OWNER = '64b7f0c2a1e4d3f2b8c9a0d2';

function makeApp(): Express {
  const app = express();
  app.use(express.json());
  app.use('/api', snapshotRouter);
  return app;
}

async function share(overrides: Partial<{ projectId: string; createdBy: string; expiresInHours: number; maxAccesses: number }> = {}) {
  const s = await createSnapshot({ projectId: PROJECT, createdBy: OWNER, title: 'Stakeholder Overview', viewType: '3d', ...overrides });
  return s.token;
}

beforeEach(() => {
  projectExists.mockReset().mockResolvedValue({ _id: PROJECT });
  userExists.mockReset().mockResolvedValue({ _id: OWNER });
});

describe('GET /api/snapshots/:token (THE-655)', () => {
  it('200 mit unveränderter Antwortform, solange Projekt und Ersteller existieren', async () => {
    const token = await share();
    const res = await request(makeApp()).get(`/api/snapshots/${token}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toMatchObject({ title: 'Stakeholder Overview', viewType: '3d', elements: [], connections: [] });
    expect(res.body.data.expiresAt).toBeDefined();
  });

  it('410 Gone, wenn das Projekt gelöscht ist — Klartext, und der Token ist danach weg', async () => {
    const token = await share();
    projectExists.mockResolvedValue(null);
    const res = await request(makeApp()).get(`/api/snapshots/${token}`);
    expect(res.status).toBe(410);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toMatch(/project/i);
    expect(res.body.error).toMatch(/deleted/i);
    expect(peekSnapshot(token)).toBeNull();
    const again = await request(makeApp()).get(`/api/snapshots/${token}`);
    expect(again.status).toBe(404);
  });

  it('410 Gone, wenn das Konto des Erstellers gelöscht ist', async () => {
    const token = await share();
    userExists.mockResolvedValue(null);
    const res = await request(makeApp()).get(`/api/snapshots/${token}`);
    expect(res.status).toBe(410);
    expect(res.body.error).toMatch(/account/i);
    expect(peekSnapshot(token)).toBeNull();
  });

  it('wirft die Existenzprüfung, antwortet die Route 500 und der Token bleibt bestehen', async () => {
    const token = await share();
    projectExists.mockRejectedValue(new Error('mongo down'));
    const res = await request(makeApp()).get(`/api/snapshots/${token}`);
    expect(res.status).toBe(500);
    expect(res.body).toEqual({ success: false, error: 'Failed to load snapshot' });
    expect(peekSnapshot(token)).not.toBeNull();
    projectExists.mockResolvedValue({ _id: PROJECT });
    const again = await request(makeApp()).get(`/api/snapshots/${token}`);
    expect(again.status).toBe(200);
  });

  it('410 auch bei leerem createdBy — fail closed, ohne Abfrage des Kontos', async () => {
    const token = await share({ createdBy: '' });
    const res = await request(makeApp()).get(`/api/snapshots/${token}`);
    expect(res.status).toBe(410);
    expect(res.body.error).toMatch(/deleted/i);
    expect(userExists).not.toHaveBeenCalled();
  });

  it('410 bei ungültiger projectId — fail closed, ohne Abfrage des Projekts', async () => {
    const token = await share({ projectId: 'not-an-objectid' });
    const res = await request(makeApp()).get(`/api/snapshots/${token}`);
    expect(res.status).toBe(410);
    expect(projectExists).not.toHaveBeenCalled();
  });

  it('404 für unbekannten Token — ohne Datenbankfrage', async () => {
    const res = await request(makeApp()).get('/api/snapshots/does-not-exist');
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ success: false, error: 'Snapshot not found or expired' });
    expect(projectExists).not.toHaveBeenCalled();
  });

  it('abgelaufener Link bleibt 404, auch wenn das Projekt fehlt (Ablauf wird zuerst geprüft)', async () => {
    const token = await share({ expiresInHours: -1 });
    projectExists.mockResolvedValue(null);
    const res = await request(makeApp()).get(`/api/snapshots/${token}`);
    expect(res.status).toBe(404);
    expect(projectExists).not.toHaveBeenCalled();
  });

  it('maxAccesses wirkt unverändert: nach dem letzten erlaubten Zugriff 404', async () => {
    const token = await share({ maxAccesses: 1 });
    expect((await request(makeApp()).get(`/api/snapshots/${token}`)).status).toBe(200);
    expect((await request(makeApp()).get(`/api/snapshots/${token}`)).status).toBe(404);
  });
});

describe('resolveSharedSnapshot / peekSnapshot', () => {
  it('peek zählt nicht; ein ok-Ergebnis zählt genau einmal', async () => {
    const token = await share();
    expect(peekSnapshot(token)!.accessCount).toBe(0);
    const r = await resolveSharedSnapshot(token);
    expect(r.kind).toBe('ok');
    expect(peekSnapshot(token)!.accessCount).toBe(1);
  });

  it('ein gone-Ergebnis zählt nicht und räumt den Token weg', async () => {
    const token = await share();
    const r = await resolveSharedSnapshot(token, {
      projectExists: async () => false,
      ownerExists: async () => true,
    });
    expect(r).toEqual({ kind: 'gone', reason: 'project' });
    expect(peekSnapshot(token)).toBeNull();
  });

  it('die injizierten Prüfer bekommen projectId und createdBy des Snapshots', async () => {
    const token = await share();
    const checks = { projectExists: jest.fn().mockResolvedValue(true), ownerExists: jest.fn().mockResolvedValue(true) };
    await resolveSharedSnapshot(token, checks);
    expect(checks.projectExists).toHaveBeenCalledWith(PROJECT);
    expect(checks.ownerExists).toHaveBeenCalledWith(OWNER);
  });
});
