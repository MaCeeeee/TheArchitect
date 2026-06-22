/**
 * REQ-CERT-001.1 — Certification-Endpoints (Notar-Workflow). Supertest, Neo4j gemockt.
 */
import express from 'express';
import request from 'supertest';

jest.mock('../middleware/auth.middleware', () => ({
  authenticate: (req: any, _res: unknown, next: () => void) => {
    req.user = { _id: 'user-123' };
    next();
  },
}));
jest.mock('../middleware/projectAccess.middleware', () => ({
  requireProjectAccess: () => (_req: unknown, _res: unknown, next: () => void) => next(),
}));
jest.mock('../middleware/audit.middleware', () => ({
  audit: () => (_req: unknown, _res: unknown, next: () => void) => next(),
}));

const runCypherMock = jest.fn();
jest.mock('../config/neo4j', () => ({
  runCypher: (...args: unknown[]) => runCypherMock(...args),
}));

import certificationRoutes from '../routes/certification.routes';

const rec = (obj: Record<string, unknown>) => ({ get: (k: string) => obj[k] });
const intVal = (n: number) => ({ toNumber: () => n });

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/projects', certificationRoutes);
  return app;
}

beforeEach(() => runCypherMock.mockReset());

describe('certification.routes (REQ-CERT-001.1)', () => {
  describe('GET /:projectId/certification/pending', () => {
    it('liefert unzertifizierte Atome (elements + connections + total)', async () => {
      runCypherMock.mockImplementation((q: string) => {
        if (q.includes('CONNECTS_TO')) {
          return Promise.resolve([
            rec({ id: 'c1', type: 'flow', label: '', provenance: 'ai_generated', source: 'ai-heal', confidence: 0.4, sourceId: 'a', targetId: 'b', sourceName: 'A', targetName: 'B' }),
          ]);
        }
        return Promise.resolve([
          rec({ id: 'e1', name: 'Elem', type: 'process', layer: 'business', provenance: 'ai_generated', source: 'ai-process', confidence: 0.6 }),
        ]);
      });
      const res = await request(makeApp()).get('/api/projects/p1/certification/pending');
      expect(res.status).toBe(200);
      expect(res.body.data.elements).toHaveLength(1);
      expect(res.body.data.connections).toHaveLength(1);
      expect(res.body.data.total).toBe(2);
      expect(res.body.data.elements[0].provenance).toBe('ai_generated');
      expect(res.body.data.connections[0].source).toBe('ai-heal');
    });

    it('AC-1/6 — Query scoped by projectId, filtert provenance<>user ∧ certifiedBy IS NULL', async () => {
      runCypherMock.mockResolvedValue([]);
      await request(makeApp()).get('/api/projects/p9/certification/pending');
      const [q, params] = runCypherMock.mock.calls[0];
      expect(q).toMatch(/provenance <> 'user'/);
      expect(q).toMatch(/certifiedBy IS NULL/);
      expect(params).toEqual({ projectId: 'p9' });
    });
  });

  describe('POST /:projectId/certification/certify', () => {
    it('AC-3 — zertifiziert elementIds, SET NUR certifiedBy/certifiedAt mit req.user', async () => {
      runCypherMock.mockResolvedValue([rec({ n: intVal(2) })]);
      const res = await request(makeApp())
        .post('/api/projects/p1/certification/certify')
        .send({ elementIds: ['e1', 'e2'] });
      expect(res.status).toBe(200);
      expect(res.body.data.elementsCertified).toBe(2);
      expect(res.body.data.certifiedBy).toBe('user-123');
      const [q, params] = runCypherMock.mock.calls[0];
      expect(q).toMatch(/SET e\.certifiedBy = \$userId, e\.certifiedAt = \$now/);
      expect(q).not.toMatch(/provenance|\.source|\.confidence/);
      expect(params.userId).toBe('user-123');
      expect(params.ids).toEqual(['e1', 'e2']);
    });

    it('AC-4 — all:true zertifiziert alle pending (elements + connections)', async () => {
      runCypherMock.mockResolvedValue([rec({ n: intVal(5) })]);
      const res = await request(makeApp())
        .post('/api/projects/p1/certification/certify')
        .send({ all: true });
      expect(res.status).toBe(200);
      expect(runCypherMock).toHaveBeenCalledTimes(2);
      for (const [q] of runCypherMock.mock.calls) {
        expect(q as string).toMatch(/provenance <> 'user'/);
        expect(q as string).toMatch(/certifiedBy IS NULL/);
      }
    });

    it('SICHERHEIT — certifiedBy kommt aus req.user, NICHT aus dem Body', async () => {
      runCypherMock.mockResolvedValue([rec({ n: intVal(1) })]);
      await request(makeApp())
        .post('/api/projects/p1/certification/certify')
        .send({ elementIds: ['e1'], certifiedBy: 'attacker' });
      const [, params] = runCypherMock.mock.calls[0];
      expect(params.userId).toBe('user-123');
    });

    it('AC-2 (REQ.3) — idempotent: certify-Query trägt certifiedBy IS NULL Guard', async () => {
      runCypherMock.mockResolvedValue([rec({ n: intVal(0) })]);
      await request(makeApp())
        .post('/api/projects/p1/certification/certify')
        .send({ connectionIds: ['c1'] });
      const [q] = runCypherMock.mock.calls[0];
      expect(q).toMatch(/certifiedBy IS NULL/);
      expect(q).toMatch(/SET r\.certifiedBy = \$userId, r\.certifiedAt = \$now/);
    });
  });
});
