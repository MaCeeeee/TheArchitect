/**
 * THE-770 — workspace deletion writes an audit entry with its scope; 404 and Neo4j failure write none.
 * Databases mocked: this suite pins order and audit wiring. The real cascade is in workspace.it.test.ts.
 */
import express from 'express';
import request from 'supertest';

jest.mock('../middleware/auth.middleware', () => ({
  authenticate: (req: any, _res: unknown, next: () => void) => { req.user = { _id: 'user-123' }; next(); },
}));
jest.mock('../middleware/projectAccess.middleware', () => ({
  requireProjectAccess: () => (_req: unknown, _res: unknown, next: () => void) => next(),
}));
const auditCreate = jest.fn().mockResolvedValue({});
jest.mock('../models/AuditLog', () => ({ AuditLog: { create: (...a: unknown[]) => auditCreate(...a) } }));
const calls: string[] = [];
const findOne = jest.fn();
jest.mock('../models/Workspace', () => ({
  Workspace: {
    findOne: (...a: unknown[]) => findOne(...a),
    deleteOne: () => { calls.push('mongo.deleteOne'); return Promise.resolve({ deletedCount: 1 }); },
  },
}));
const runCypher = jest.fn();
jest.mock('../config/neo4j', () => ({ runCypher: (...a: unknown[]) => runCypher(...a) }));

import workspaceRoutes from '../routes/workspace.routes';

const int = (n: number) => ({ toNumber: () => n });
const row = (o: Record<string, unknown>) => ({ get: (k: string) => o[k] });
const app = express();
app.use(express.json());
app.use('/api/workspaces', workspaceRoutes);

beforeEach(() => {
  calls.length = 0; auditCreate.mockClear(); findOne.mockReset(); runCypher.mockReset();
  runCypher.mockImplementation(() => {
    calls.push('neo4j.delete');
    return Promise.resolve([row({ elements: int(2), relationships: int(3), crossWorkspaceRelationships: int(1), certified: int(1) })]);
  });
});

test('success: Neo4j before Mongo, one audit entry with scope, IP and user agent', async () => {
  findOne.mockResolvedValue({ _id: 'ws-a', name: 'Alpha', source: 'csv' });

  const res = await request(app).delete('/api/workspaces/p1/ws-a').set('User-Agent', 'jest-ua');

  expect(res.status).toBe(200);
  expect(calls).toEqual(['neo4j.delete', 'mongo.deleteOne']);
  expect(auditCreate).toHaveBeenCalledTimes(1);
  const entry = auditCreate.mock.calls[0][0];
  expect(entry).toMatchObject({
    userId: 'user-123', projectId: 'p1', action: 'delete_workspace', entityType: 'workspace', entityId: 'ws-a',
    before: { name: 'Alpha', source: 'csv' },
    after: { elements: 2, relationships: 3, crossWorkspaceRelationships: 1, certified: 1 },
    userAgent: 'jest-ua', riskLevel: 'high',
  });
  expect(typeof entry.ip).toBe('string');
});

test('no certified elements → riskLevel medium', async () => {
  findOne.mockResolvedValue({ _id: 'ws-a', name: 'Alpha', source: 'csv' });
  runCypher.mockResolvedValue([row({ elements: int(1), relationships: int(0), crossWorkspaceRelationships: int(0), certified: int(0) })]);
  await request(app).delete('/api/workspaces/p1/ws-a');
  expect(auditCreate.mock.calls[0][0].riskLevel).toBe('medium');
});

test('404: no Neo4j call, no Mongo delete, no audit entry', async () => {
  findOne.mockResolvedValue(null);
  const res = await request(app).delete('/api/workspaces/p1/ws-x');
  expect(res.status).toBe(404);
  expect(calls).toEqual([]);
  expect(auditCreate).not.toHaveBeenCalled();
});

test('Neo4j fails: 500, Mongo workspace NOT deleted, no audit entry', async () => {
  findOne.mockResolvedValue({ _id: 'ws-a', name: 'Alpha', source: 'csv' });
  runCypher.mockRejectedValue(new Error('neo4j down'));
  const res = await request(app).delete('/api/workspaces/p1/ws-a');
  expect(res.status).toBe(500);
  expect(calls).not.toContain('mongo.deleteOne');
  expect(auditCreate).not.toHaveBeenCalled();
});
