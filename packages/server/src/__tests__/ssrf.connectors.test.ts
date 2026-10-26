/**
 * Security-Audit H7: kein SSRF-Schutz. `POST /api/settings/connections`
 * speicherte jede `baseUrl`; `/orgs`, `/repos`, `/test` riefen sie ab und
 * spiegelten den Antwort-Body zurück — für JEDEN angemeldeten Nutzer. Die
 * zwölf Connectors und der Sync-Scheduler wählten gespeicherte URLs selbst
 * wieder an, Redirects wurden überall gefolgt. Ziel u. a.: Cloud-Metadaten
 * (169.254.169.254), Redis/Mongo/Neo4j im Docker-Netz, das Tailnet.
 *
 * Der lokale Testserver auf 127.0.0.1 steht für einen solchen internen
 * Dienst: Er darf nie getroffen werden.
 */
import fs from 'fs';
import http from 'http';
import path from 'path';
import express from 'express';
import request from 'supertest';

let mockConn: Record<string, unknown> | null = null;
const mockConnCreate = jest.fn(async (doc: Record<string, unknown>) => ({ _id: 'c-1', createdAt: new Date(), ...doc }));
jest.mock('../models/Connection', () => ({
  Connection: {
    create: (doc: Record<string, unknown>) => mockConnCreate(doc),
    findOne: jest.fn(async () => mockConn),
  },
  encryptCredentials: () => 'enc',
  decryptCredentials: () => ({ token: 'secret-token' }),
}));
jest.mock('../middleware/auth.middleware', () => ({
  authenticate: (req: { user?: unknown }, _res: unknown, next: () => void) => {
    req.user = { _id: 'u-1', role: 'viewer' };
    next();
  },
}));
jest.mock('../middleware/audit.middleware', () => ({ createAuditEntry: jest.fn(async () => undefined) }));
jest.mock('../models/Project', () => ({ Project: {} }));
jest.mock('../models/User', () => ({ User: {} }));
jest.mock('../models/ApiKey', () => ({ ApiKey: {} }));
jest.mock('../config/redis', () => ({ getRedis: () => ({}) }));
jest.mock('../services/session.service', () => ({}));

import settingsRoutes from '../routes/settings.routes';
import { getConnector } from '../services/connectors';
import type { ConnectorConfig } from '../services/connectors/base.connector';

let server: http.Server;
let hits = 0;
let internalUrl = '';

beforeAll(async () => {
  server = http.createServer((_req, res) => {
    hits++;
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify([{ full_path: 'INTERNAL-SECRET', id: 1 }]));
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  internalUrl = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
});
afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));
beforeEach(() => {
  hits = 0;
  mockConn = null;
  mockConnCreate.mockClear();
  delete process.env.CONNECTOR_PRIVATE_HOST_ALLOWLIST;
});

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/settings', settingsRoutes);
  return app;
}

describe('SSRF über Connections (Security-Audit H7)', () => {
  it.each([
    'http://169.254.169.254/latest/meta-data',
    'http://127.0.0.1:6379',
    'http://localhost:7474',
    'http://[::1]:27017',
    'http://10.0.0.5',
    'http://100.106.223.83:6333',
    'file:///etc/passwd',
  ])('refuses to store a connection to %s', async (baseUrl) => {
    const res = await request(makeApp())
      .post('/api/settings/connections')
      .send({ name: 'x', type: 'gitlab', baseUrl, credentials: { token: 't' } });
    expect(res.status).toBe(400);
    expect(mockConnCreate).not.toHaveBeenCalled();
  });

  it('never dials an internal host from discovery, even for a connection stored before the fix — der ganze Zweck', async () => {
    mockConn = { _id: 'c-1', type: 'gitlab', baseUrl: internalUrl, credentials: 'enc' };
    const res = await request(makeApp()).get('/api/settings/connections/c-1/orgs');
    expect(hits).toBe(0);
    expect(JSON.stringify(res.body)).not.toContain('INTERNAL-SECRET');
  });

  it('connectors (and so the sync scheduler) never dial an internal host', async () => {
    const config: ConnectorConfig = {
      type: 'n8n',
      name: 'n8n',
      baseUrl: internalUrl,
      authMethod: 'api_key',
      credentials: { api_key: 'k' },
      projectId: 'p',
      mappingRules: [],
      syncIntervalMinutes: 0,
      filters: {},
      enabled: true,
    } as ConnectorConfig;
    const result = await getConnector('n8n')!.testConnection(config);
    expect(hits).toBe(0);
    expect(result.success).toBe(false);
  });

  it('no connector or connection route calls fetch/axios directly — nur über safeFetch', () => {
    const src = path.join(__dirname, '..');
    const files = [
      ...fs.readdirSync(path.join(src, 'services/connectors')).map((f) => path.join(src, 'services/connectors', f)),
      path.join(src, 'routes/settings.routes.ts'),
      path.join(src, 'routes/architecture.routes.ts'),
    ];
    const offenders = files.filter((f) => /(?<![\w.])fetch\(|\baxios\b/.test(fs.readFileSync(f, 'utf8')));
    expect(offenders.map((f) => path.relative(src, f))).toEqual([]);
  });
});
