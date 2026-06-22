/**
 * REQ-TRUST-001.1 — trust-summary aggregate endpoint. Supertest, Neo4j mocked.
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

const rec = (obj: Record<string, number>) => ({ get: (k: string) => ({ toNumber: () => obj[k] ?? 0 }) });

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/projects', certificationRoutes);
  return app;
}

// elementsAgg / connectionsAgg are the two RETURN rows the route reads in order.
function mockAgg(elements: Record<string, number>, connections: Record<string, number>) {
  let call = 0;
  runCypherMock.mockImplementation(() => {
    call += 1;
    return Promise.resolve([call === 1 ? rec(elements) : rec(connections)]);
  });
}

beforeEach(() => runCypherMock.mockReset());

describe('GET /:projectId/certification/trust-summary (REQ-TRUST-001.1)', () => {
  it('AC-1/AC-2 — sums elements + connections; confirmed = user OR certified', async () => {
    // elements: 4 total, 3 confirmed (2 user + 1 certified-ai); connections: 2 total, 1 confirmed
    mockAgg(
      { total: 4, confirmed: 3, usr: 2, ai: 2, imp: 0, mcp: 0 },
      { total: 2, confirmed: 1, usr: 1, ai: 1, imp: 0, mcp: 0 },
    );
    const res = await request(makeApp()).get('/api/projects/p1/certification/trust-summary');
    expect(res.status).toBe(200);
    expect(res.body.data.total).toBe(6);
    expect(res.body.data.confirmed).toBe(4);
    expect(res.body.data.unconfirmed).toBe(2); // total - confirmed = queue size
    expect(res.body.data.byProvenance).toEqual({
      user: 3, ai_generated: 3, import: 0, mcp_discovered: 0,
    });
  });

  it('AC-3 — confirmedPct rounded', async () => {
    mockAgg(
      { total: 3, confirmed: 2, usr: 2, ai: 1, imp: 0, mcp: 0 },
      { total: 1, confirmed: 1, usr: 1, ai: 0, imp: 0, mcp: 0 },
    );
    const res = await request(makeApp()).get('/api/projects/p1/certification/trust-summary');
    // confirmed 3 / total 4 = 75
    expect(res.body.data.confirmedPct).toBe(75);
  });

  it('AC-3 — empty project → confirmedPct null (no fake 0%)', async () => {
    mockAgg(
      { total: 0, confirmed: 0, usr: 0, ai: 0, imp: 0, mcp: 0 },
      { total: 0, confirmed: 0, usr: 0, ai: 0, imp: 0, mcp: 0 },
    );
    const res = await request(makeApp()).get('/api/projects/p1/certification/trust-summary');
    expect(res.body.data.total).toBe(0);
    expect(res.body.data.confirmedPct).toBeNull();
  });

  it('AC-4 — query scoped by projectId', async () => {
    mockAgg(
      { total: 1, confirmed: 1, usr: 1, ai: 0, imp: 0, mcp: 0 },
      { total: 0, confirmed: 0, usr: 0, ai: 0, imp: 0, mcp: 0 },
    );
    await request(makeApp()).get('/api/projects/p-scope/certification/trust-summary');
    for (const [, params] of runCypherMock.mock.calls) {
      expect(params).toEqual({ projectId: 'p-scope' });
    }
  });
});
