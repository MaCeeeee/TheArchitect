/**
 * REQ-METH-001.3 / .4 — GET /advisor/ladder and PUT/DELETE /advisor/translations/:connectionId
 * Run: cd packages/server && npx jest src/__tests__/advisorLadder.routes.test.ts --forceExit
 */
import express from 'express';
import request from 'supertest';

jest.mock('../middleware/auth.middleware', () => ({
  authenticate: (_req: unknown, _res: unknown, next: () => void) => next(),
}));
jest.mock('../middleware/requireVerifiedEmail.middleware', () => ({
  requireVerifiedEmail: (_req: unknown, _res: unknown, next: () => void) => next(),
}));
jest.mock('../middleware/rbac.middleware', () => ({
  requirePermission: () => (_req: unknown, _res: unknown, next: () => void) => next(),
}));
const accessCalls: string[] = [];
jest.mock('../middleware/projectAccess.middleware', () => ({
  requireProjectAccess: (role: string) => (_req: unknown, _res: unknown, next: () => void) => {
    accessCalls.push(role);
    next();
  },
}));
jest.mock('../middleware/rateLimit.middleware', () => ({
  rateLimit: () => (_req: unknown, _res: unknown, next: () => void) => next(),
}));
jest.mock('../middleware/audit.middleware', () => ({
  audit: () => (_req: unknown, _res: unknown, next: () => void) => next(),
}));
jest.mock('../services/advisor.service', () => ({ runAdvisorScan: jest.fn() }));

const mockRunCypher = jest.fn();
jest.mock('../config/neo4j', () => ({
  runCypher: (...args: unknown[]) => mockRunCypher(...args),
}));

import advisorRoutes from '../routes/advisor.routes';

const rec = (o: Record<string, unknown>) => ({ get: (k: string) => o[k] });

function app() {
  const a = express();
  a.use(express.json());
  a.use('/api/projects', advisorRoutes);
  return a;
}

beforeEach(() => {
  mockRunCypher.mockReset();
  accessCalls.length = 0;
});

describe('GET /:projectId/advisor/ladder', () => {
  test('builds the report from three read-only queries, behind viewer access', async () => {
    mockRunCypher
      .mockResolvedValueOnce([
        rec({ id: 'te', name: 'TE', type: 'grouping' }),
        rec({ id: 'prod', name: 'Produktion', type: 'grouping' }),
        rec({ id: 'log', name: 'Logistik', type: 'grouping' }),
        rec({ id: 'bom', name: 'BOM', type: 'business_object' }),
        rec({ id: 'order', name: 'Order', type: 'business_object' }),
        rec({ id: 'delivery', name: 'Delivery', type: 'business_object' }),
      ])
      .mockResolvedValueOnce([
        rec({ id: 'm1', sourceId: 'te', targetId: 'bom', type: 'composition', translationFactor: null, translationQuantity: null }),
        rec({ id: 'm2', sourceId: 'prod', targetId: 'order', type: 'composition', translationFactor: null, translationQuantity: null }),
        rec({ id: 'm3', sourceId: 'log', targetId: 'delivery', type: 'composition', translationFactor: null, translationQuantity: null }),
        rec({ id: 't1', sourceId: 'te', targetId: 'prod', type: 'flow', translationFactor: 1, translationQuantity: null }),
        rec({ id: 't2', sourceId: 'prod', targetId: 'log', type: 'flow', translationFactor: { toNumber: () => 10 }, translationQuantity: null }),
        rec({ id: 't3', sourceId: 'te', targetId: 'log', type: 'flow', translationFactor: 12, translationQuantity: null }),
      ])
      .mockResolvedValueOnce([rec({ annualCost: 3, technicalDebtRatio: 0 })]);

    const res = await request(app()).get('/api/projects/p1/advisor/ladder');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.projectId).toBe('p1');
    expect(res.body.data.highestRung).toBe(5);
    expect(res.body.data.cohomology[0].verdict).toBe('global_obstruction');
    expect(res.body.data.cohomology[0].loopDefects[0].steps).toHaveLength(3);
    expect(res.body.data.tolerance).toBe(1e-6);
    const schuld = res.body.data.methods.find((m: { methodId: string }) => m.methodId === 'DA-technische-schuld');
    expect(schuld.oneInputAway).toBe('technicalDebtRatio on at least 1 element');
    expect(accessCalls).toEqual(['viewer']);
    expect(mockRunCypher).toHaveBeenCalledTimes(3);
    mockRunCypher.mock.calls.forEach(([query, params]) => {
      expect(params).toEqual({ projectId: 'p1' });
      expect(String(query)).not.toMatch(/\b(SET|CREATE|MERGE|DELETE|REMOVE)\b/);
    });
  });

  test('Neo4j failure → 500 without internals', async () => {
    mockRunCypher.mockRejectedValue(new Error('boom: neo4j://secret'));
    const res = await request(app()).get('/api/projects/p1/advisor/ladder');
    expect(res.status).toBe(500);
    expect(JSON.stringify(res.body)).not.toContain('secret');
  });
});

describe('PUT /:projectId/advisor/translations/:connectionId', () => {
  test('stores factor and quantity on a relationship between two contexts of this project', async () => {
    mockRunCypher.mockResolvedValueOnce([rec({ id: 'c1' })]);
    const res = await request(app()).put('/api/projects/p1/advisor/translations/c1').send({ factor: 12, quantity: ' pieces ' });
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ id: 'c1', factor: 12, quantity: 'pieces' });
    expect(accessCalls).toEqual(['editor']);
    const [query, params] = mockRunCypher.mock.calls[0];
    expect(params).toEqual({
      projectId: 'p1',
      connectionId: 'c1',
      factor: 12,
      quantity: 'pieces',
      contextTypes: ['grouping', 'location'],
      membershipTypes: ['composition', 'aggregation'],
    });
    expect(String(query)).toContain('NOT r.type IN $membershipTypes');
    expect(String(query).match(/projectId: \$projectId/g)).toHaveLength(2);
  });

  test('quantity defaults to "default"', async () => {
    mockRunCypher.mockResolvedValueOnce([rec({ id: 'c1' })]);
    const res = await request(app()).put('/api/projects/p1/advisor/translations/c1').send({ factor: 0.5 });
    expect(res.body.data.quantity).toBe('default');
  });

  test.each([[0], [-2], ['12'], [null]])('factor %p is refused with 400 and nothing is written', async (factor) => {
    const res = await request(app()).put('/api/projects/p1/advisor/translations/c1').send({ factor });
    expect(res.status).toBe(400);
    expect(mockRunCypher).not.toHaveBeenCalled();
  });

  test.each([[1e13], [1e-13], [1e308]])('factor %p is outside the accepted range: 400 and nothing is written', async (factor) => {
    const res = await request(app()).put('/api/projects/p1/advisor/translations/c1').send({ factor });
    expect(res.status).toBe(400);
    expect(mockRunCypher).not.toHaveBeenCalled();
  });

  test.each([[1e12], [1e-12]])('factor %p is the edge of the accepted range and is stored', async (factor) => {
    mockRunCypher.mockResolvedValueOnce([rec({ id: 'c1' })]);
    const res = await request(app()).put('/api/projects/p1/advisor/translations/c1').send({ factor });
    expect(res.status).toBe(200);
    expect(mockRunCypher.mock.calls[0][1].factor).toBe(factor);
  });

  test('unknown relationship, foreign project, non-context ends or a membership → 404', async () => {
    mockRunCypher.mockResolvedValueOnce([]);
    const res = await request(app()).put('/api/projects/p1/advisor/translations/nope').send({ factor: 2 });
    expect(res.status).toBe(404);
  });
});

describe('DELETE /:projectId/advisor/translations/:connectionId', () => {
  test('removes the translation, scoped to the project', async () => {
    mockRunCypher.mockResolvedValueOnce([rec({ id: 'c1' })]);
    const res = await request(app()).delete('/api/projects/p1/advisor/translations/c1');
    expect(res.status).toBe(200);
    expect(accessCalls).toEqual(['editor']);
    const [query, params] = mockRunCypher.mock.calls[0];
    expect(params).toEqual({ projectId: 'p1', connectionId: 'c1' });
    expect(String(query)).toContain('REMOVE r.translationFactor, r.translationQuantity');
  });

  test('not found → 404', async () => {
    mockRunCypher.mockResolvedValueOnce([]);
    const res = await request(app()).delete('/api/projects/p1/advisor/translations/nope');
    expect(res.status).toBe(404);
  });
});
