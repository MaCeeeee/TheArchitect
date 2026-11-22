/**
 * UC-METH-002 (REQ .1) — POST /api/projects/:projectId/groups.
 * The suite mocks the read query, the writer and the middlewares; it checks the contract:
 * what is written, what is refused, what the audit sees.
 * Run: cd packages/server && npx jest src/__tests__/groups.routes.test.ts --forceExit
 */
import express from 'express';
import request from 'supertest';

let editor = true;
jest.mock('../middleware/auth.middleware', () => ({
  authenticate: (req: { user?: unknown }, _res: unknown, next: () => void) => { req.user = { _id: 'u1' }; next(); },
}));
jest.mock('../middleware/rbac.middleware', () => ({
  requirePermission: () => (_req: unknown, _res: unknown, next: () => void) => next(),
}));
jest.mock('../middleware/projectAccess.middleware', () => ({
  requireProjectAccess: (role: string) => (_req: unknown, res: { status: (n: number) => { json: (b: unknown) => void } }, next: () => void) =>
    role === 'editor' && !editor ? res.status(403).json({ success: false, error: 'Forbidden' }) : next(),
}));
const auditEntries: Array<Record<string, unknown>> = [];
jest.mock('../middleware/audit.middleware', () => ({
  audit: (opts: { action: string; getAfter?: (req: unknown, body: unknown) => Record<string, unknown> }) =>
    (req: unknown, res: { json: (b: unknown) => unknown; statusCode: number }, next: () => void) => {
      const original = res.json.bind(res);
      res.json = (body: unknown) => {
        if (res.statusCode >= 200 && res.statusCode < 300) auditEntries.push({ action: opts.action, after: opts.getAfter?.(req, body) });
        return original(body);
      };
      next();
    },
}));

const mockRunCypher = jest.fn();
jest.mock('../config/neo4j', () => ({ runCypher: (...args: unknown[]) => mockRunCypher(...args) }));
const mockWriteGroup = jest.fn();
jest.mock('../services/groups/groupWriter', () => {
  const actual = jest.requireActual('../services/groups/groupWriter');
  return { ...actual, writeGroup: (...args: unknown[]) => mockWriteGroup(...args) };
});
jest.mock('../services/elementSimilarity.service', () => ({ upsertEmbedding: jest.fn().mockResolvedValue(undefined) }));
jest.mock('../services/policy-evaluation.service', () => ({ evaluateElementPolicies: jest.fn().mockResolvedValue(undefined) }));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const router = require('../routes/groups.routes').default;
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { GroupMembersChangedError } = require('../services/groups/groupWriter');
const app = express();
app.use(express.json());
app.use('/api/projects', router);

const rec = (o: Record<string, unknown>) => ({ get: (k: string) => o[k] });
const rows = (...items: Array<[string, string]>) => items.map(([id, type]) => rec({ id, name: `name-${id}`, type, posX: 0, posZ: 0 }));
const post = (body: string | object) => request(app).post('/api/projects/p1/groups').send(body);

beforeEach(() => { editor = true; auditEntries.length = 0; mockRunCypher.mockReset(); mockWriteGroup.mockReset().mockResolvedValue(undefined); });

test('3 valid members → 201, one grouping, 3 compositions, nothing skipped, one audit entry', async () => {
  mockRunCypher.mockResolvedValue(rows(['p', 'process'], ['a', 'application_component'], ['n', 'node']));
  const res = await post({ name: '  Sales  ', memberIds: ['p', 'a', 'n', 'p'] });
  expect(res.status).toBe(201);
  expect(res.body.data.element).toMatchObject({ type: 'grouping', name: 'Sales', layer: 'business', projectId: 'p1' });
  expect(res.body.data.connections).toHaveLength(3);
  expect(res.body.data.connections.every((c: { type: string; sourceId: string }) => c.type === 'composition' && c.sourceId === res.body.data.element.id)).toBe(true);
  expect(res.body.data.skipped).toEqual([]);
  const [readQuery, readParams] = mockRunCypher.mock.calls[0];
  expect(readQuery).toContain('{projectId: $projectId}');
  expect(readParams).toMatchObject({ projectId: 'p1', ids: ['p', 'a', 'n'] });
  expect(mockWriteGroup).toHaveBeenCalledTimes(1);
  expect(mockWriteGroup.mock.calls[0][0].members).toHaveLength(3);
  expect(auditEntries).toEqual([{ action: 'create_group', after: { groupId: res.body.data.element.id, name: 'Sales', type: 'grouping', members: 3, skipped: 0, memberIds: ['a', 'n', 'p'], skippedIds: [] } }]);
});

test('a goal among the members is skipped with its reason; the group has the others', async () => {
  mockRunCypher.mockResolvedValue(rows(['p', 'process'], ['a', 'application_component'], ['g', 'goal']));
  const res = await post({ name: 'Sales', memberIds: ['p', 'a', 'g'] });
  expect(res.status).toBe(201);
  expect(res.body.data.connections).toHaveLength(2);
  expect(res.body.data.skipped).toEqual([{ id: 'g', name: 'name-g', type: 'goal', reason: 'composition_not_valid' }]);
});

test('an id that is not in this project → 400 with the id, nothing written, no audit', async () => {
  mockRunCypher.mockResolvedValue(rows(['p', 'process'], ['a', 'application_component']));
  const res = await post({ name: 'Sales', memberIds: ['p', 'a', 'foreign'] });
  expect(res.status).toBe(400);
  expect(res.body.unknownIds).toEqual(['foreign']);
  expect(mockWriteGroup).not.toHaveBeenCalled();
  expect(auditEntries).toEqual([]);
});

test('fewer than 2 valid members → 400, nothing written', async () => {
  mockRunCypher.mockResolvedValue(rows(['p', 'process'], ['g', 'goal']));
  const res = await post({ name: 'Sales', memberIds: ['p', 'g'] });
  expect(res.status).toBe(400);
  expect(res.body.error).toBe('A group needs a minimum of 2 valid members');
  expect(mockWriteGroup).not.toHaveBeenCalled();
});

test('empty member list, empty name, wrong type → 400, no query', async () => {
  for (const body of [{ name: 'x', memberIds: [] }, { name: '   ', memberIds: ['a', 'b'] }, { name: 'x', type: 'goal', memberIds: ['a', 'b'] }]) {
    const res = await post(body);
    expect(res.status).toBe(400);
  }
  expect(mockRunCypher).not.toHaveBeenCalled();
});

test('a viewer → 403, nothing read or written', async () => {
  editor = false;
  const res = await post({ name: 'Sales', memberIds: ['p', 'a'] });
  expect(res.status).toBe(403);
  expect(mockRunCypher).not.toHaveBeenCalled();
  expect(mockWriteGroup).not.toHaveBeenCalled();
});

test('a member vanished during the write → 409', async () => {
  mockRunCypher.mockResolvedValue(rows(['p', 'process'], ['a', 'application_component']));
  mockWriteGroup.mockRejectedValue(new GroupMembersChangedError(2, 1));
  const res = await post({ name: 'Sales', memberIds: ['p', 'a'] });
  expect(res.status).toBe(409);
  expect(auditEntries).toEqual([]);
});

test('an id that matches two elements of the project → 409, nothing written', async () => {
  mockRunCypher.mockResolvedValue(rows(['p', 'process'], ['p', 'process'], ['a', 'application_component']));
  const res = await post({ name: 'Sales', memberIds: ['p', 'a'] });
  expect(res.status).toBe(409);
  expect(res.body.ambiguousIds).toEqual(['p']);
  expect(mockWriteGroup).not.toHaveBeenCalled();
  expect(auditEntries).toEqual([]);
});

test('201 member ids → 400, nothing read', async () => {
  const res = await post({ name: 'Sales', memberIds: Array.from({ length: 201 }, (_, i) => `id-${i}`) });
  expect(res.status).toBe(400);
  expect(mockRunCypher).not.toHaveBeenCalled();
});

test('audit carries the member ids and the skipped ids', async () => {
  mockRunCypher.mockResolvedValue(rows(['p', 'process'], ['a', 'application_component'], ['g', 'goal']));
  const res = await post({ name: 'Sales', memberIds: ['p', 'a', 'g'] });
  expect(auditEntries[0].after).toMatchObject({ members: 2, skipped: 1, memberIds: ['a', 'p'], skippedIds: ['g'] });
  expect(res.status).toBe(201);
});
