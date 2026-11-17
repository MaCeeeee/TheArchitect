/**
 * THE-767 — workspace deletion and integrity against REAL databases.
 * Mocked databases hid both defects (label `:Element`, ObjectId vs. String `_id`), so nothing
 * here is mocked except auth, project access and the AuditLog sink.
 * Runs only with NEO4J_IT=1 and NEO4J_URI/NEO4J_PASSWORD set (local container thearchitect-neo4j).
 * Mongo is an in-memory server. Neo4j data uses fresh ObjectId-hex project ids and is removed afterwards.
 */
import express from 'express';
import request from 'supertest';
import mongoose, { Types } from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { connectNeo4j, getNeo4jDriver, runCypher } from '../config/neo4j';

const RUN = process.env.NEO4J_IT === '1';
const d = RUN ? describe : describe.skip;
if (!RUN) console.warn('[workspace.it] skipped — set NEO4J_IT=1 and NEO4J_URI/NEO4J_PASSWORD for a local Neo4j');

jest.mock('../middleware/auth.middleware', () => ({
  authenticate: (req: any, _res: unknown, next: () => void) => { req.user = { _id: 'user-it' }; next(); },
}));
jest.mock('../middleware/projectAccess.middleware', () => ({
  requireProjectAccess: () => (_req: unknown, _res: unknown, next: () => void) => next(),
}));
const auditCreate = jest.fn().mockResolvedValue({});
jest.mock('../models/AuditLog', () => ({ AuditLog: { create: (...a: unknown[]) => auditCreate(...a) } }));

import workspaceRoutes from '../routes/workspace.routes';
import { loadElementGroups, loadWorkspaceDocs, normalizeWorkspaceIds, applyAlign, deleteOrphans, planWorkspaceIntegrity } from '../services/workspace-integrity.service';

const hex = () => new Types.ObjectId().toHexString();
const P = hex();          // project under test
const OTHER_P = hex();    // another live project
const DEAD = hex();       // a project that no longer exists in Mongo
const ALL = [P, OTHER_P, DEAD];

const app = express();
app.use(express.json());
app.use('/api/workspaces', workspaceRoutes);

let mongo: MongoMemoryServer;
const wsColl = () => mongoose.connection.db!.collection('workspaces');

/** Workspace as written today (string _id). */
async function wsString(projectId: string, id: string) {
  await wsColl().insertOne({ _id: id as any, name: `ws ${id}`, projectId: new Types.ObjectId(projectId), source: 'manual',
    color: '#888', offsetX: 0, createdBy: new Types.ObjectId(), createdAt: new Date(), updatedAt: new Date() });
}
/** Workspace as written before 2ce216e (BSON ObjectId _id). */
async function wsLegacy(projectId: string, idHex: string, createdAt: Date) {
  await wsColl().insertOne({ _id: new Types.ObjectId(idHex) as any, name: 'legacy', projectId: new Types.ObjectId(projectId),
    source: 'csv', color: '#888', offsetX: 0, createdBy: new Types.ObjectId(), createdAt, updatedAt: createdAt });
}
async function el(projectId: string, id: string, workspaceId: string | null, certifiedBy: string | null = null) {
  await runCypher(
    `CREATE (:ArchitectureElement {id: $id, projectId: $projectId, workspaceId: $workspaceId,
       name: $id, type: 'application_component', certifiedBy: $certifiedBy})`,
    { id: `${projectId}-${id}`, projectId, workspaceId, certifiedBy },
  );
}
async function edge(projectId: string, from: string, to: string, certifiedBy: string | null = null) {
  await runCypher(
    `MATCH (a:ArchitectureElement {id: $from}), (b:ArchitectureElement {id: $to})
     CREATE (a)-[:CONNECTS_TO {id: $from + '->' + $to, certifiedBy: $certifiedBy}]->(b)`,
    { from: `${projectId}-${from}`, to: `${projectId}-${to}`, certifiedBy },
  );
}
async function count(projectId: string, workspaceId: string | null): Promise<number> {
  const r = await runCypher(
    `MATCH (e:ArchitectureElement {projectId: $projectId})
     WHERE ($workspaceId IS NULL AND e.workspaceId IS NULL) OR e.workspaceId = $workspaceId
     RETURN count(e) AS n`,
    { projectId, workspaceId },
  );
  return r[0].get('n').toNumber();
}
async function wipe() {
  await runCypher(`MATCH (e:ArchitectureElement) WHERE e.projectId IN $ps DETACH DELETE e`, { ps: ALL });
  await wsColl().deleteMany({});
  auditCreate.mockClear();
}

if (RUN) {
  beforeAll(async () => {
    mongo = await MongoMemoryServer.create();
    await mongoose.connect(mongo.getUri());
    await connectNeo4j();
  });
  afterAll(async () => {
    try { await runCypher(`MATCH (e:ArchitectureElement) WHERE e.projectId IN $ps DETACH DELETE e`, { ps: ALL }); } catch { /* neo4j not connected */ }
    try { await getNeo4jDriver().close(); } catch { /* neo4j not connected */ }
    try { await mongoose.disconnect(); } catch { /* not connected */ }
    try { await mongo?.stop(); } catch { /* not started */ }
  });
  beforeEach(wipe);
}

d('THE-768 — DELETE /api/workspaces cascades to ArchitectureElement', () => {
  test('positive: 3 elements + 1 internal edge are gone; negative: same ws id in another project, another ws, no-ws stay', async () => {
    await wsString(P, 'ws-a');
    await el(P, 'a1', 'ws-a'); await el(P, 'a2', 'ws-a'); await el(P, 'a3', 'ws-a');
    await edge(P, 'a1', 'a2');
    await el(P, 'b1', 'ws-b');          // other workspace, same project
    await el(OTHER_P, 'x1', 'ws-a');    // same workspace id, other project
    await el(P, 'n1', null);            // element without workspace

    const res = await request(app).delete(`/api/workspaces/${P}/ws-a`);

    expect(res.status).toBe(200);
    expect(await count(P, 'ws-a')).toBe(0);
    expect(await count(P, 'ws-b')).toBe(1);
    expect(await count(OTHER_P, 'ws-a')).toBe(1);
    expect(await count(P, null)).toBe(1);
    expect(await wsColl().countDocuments({ _id: 'ws-a' as any })).toBe(0);
  });

  test('unknown workspace → 404 and nothing is deleted', async () => {
    await el(P, 'a1', 'ws-a');
    const res = await request(app).delete(`/api/workspaces/${P}/ws-a`);
    expect(res.status).toBe(404);
    expect(await count(P, 'ws-a')).toBe(1);
  });
  test('response and audit count what was removed: elements, edges, cross-workspace edges, certified', async () => {
    await wsString(P, 'ws-a');
    await el(P, 'a1', 'ws-a', 'notary-1'); await el(P, 'a2', 'ws-a');
    await el(P, 'b1', 'ws-b');
    await edge(P, 'a1', 'a2');   // internal
    await edge(P, 'a2', 'b1');   // crosses into ws-b

    const res = await request(app).delete(`/api/workspaces/${P}/ws-a`);

    expect(res.body.removed).toEqual({ elements: 2, relationships: 2, crossWorkspaceRelationships: 1, certified: 1, certifiedRelationships: 0 });
    expect(auditCreate).toHaveBeenCalledTimes(1);
    expect(auditCreate.mock.calls[0][0].after).toEqual({ ...res.body.removed, mongoDeleted: true });
    expect(await count(P, 'ws-b')).toBe(1);   // the other end survives, only the edge is gone
  });
});

d('THE-770 — audit scope for certified relationships and empty workspaces', () => {
  test('only a relationship is certified → removed.certifiedRelationships 1, audit riskLevel high', async () => {
    await wsString(P, 'ws-a');
    await el(P, 'a1', 'ws-a'); await el(P, 'a2', 'ws-a');
    await edge(P, 'a1', 'a2', 'notary-1');

    const res = await request(app).delete(`/api/workspaces/${P}/ws-a`);

    expect(res.status).toBe(200);
    expect(res.body.removed).toMatchObject({ certified: 0, certifiedRelationships: 1 });
    expect(auditCreate.mock.calls[0][0].riskLevel).toBe('high');
  });

  test('workspace without elements → 200, all zeros, Mongo doc gone, one audit entry', async () => {
    await wsString(P, 'ws-empty');

    const res = await request(app).delete(`/api/workspaces/${P}/ws-empty`);

    expect(res.status).toBe(200);
    expect(res.body.removed).toEqual({ elements: 0, relationships: 0, crossWorkspaceRelationships: 0, certified: 0, certifiedRelationships: 0 });
    expect(await wsColl().countDocuments({ _id: 'ws-empty' as any })).toBe(0);
    expect(auditCreate).toHaveBeenCalledTimes(1);
  });
});

d('THE-769 — align legacy workspaces (ObjectId _id) and their elements', () => {
  const T = 1782282111647;
  const LEGACY = '6a3b777ff1bf836dc790f8f0';
  const live = () => new Set([P, OTHER_P]);
  async function plan() {
    const s = getNeo4jDriver().session();
    try {
      return planWorkspaceIntegrity(await loadElementGroups(s, { projectIds: ALL }), await loadWorkspaceDocs(wsColl()), live());
    } finally { await s.close(); }
  }
  async function align() {
    const p = await plan();
    const s = getNeo4jDriver().session();
    try {
      return { normalized: await normalizeWorkspaceIds(wsColl(), p.normalize), moved: await applyAlign(s, p.align) };
    } finally { await s.close(); }
  }

  test('before align: the legacy workspace cannot be found by the route (404) and nothing is deleted', async () => {
    await wsLegacy(P, LEGACY, new Date(T + 84));
    await el(P, 'l1', `ws-${T}-16dxo`);
    const res = await request(app).delete(`/api/workspaces/${P}/${LEGACY}`);
    expect(res.status).toBe(404);
    expect(await count(P, `ws-${T}-16dxo`)).toBe(1);
  });

  test('after align: deleting the legacy workspace removes all its elements (REQ-2 positive)', async () => {
    await wsLegacy(P, LEGACY, new Date(T + 84));
    await el(P, 'l1', `ws-${T}-16dxo`); await el(P, 'l2', `ws-${T}-16dxo`);
    await el(P, 'k1', LEGACY);                       // already on the hex id (n8n merge case)
    await el(P, 'o1', `ws-${T - 50_000}-e269m`);     // orphan, must not move

    const r = await align();

    expect(r).toEqual({ normalized: 1, moved: 2 });
    expect(await wsColl().countDocuments({ _id: LEGACY as any })).toBe(1);
    expect(await wsColl().countDocuments({ _id: new Types.ObjectId(LEGACY) as any })).toBe(0);
    expect(await count(P, LEGACY)).toBe(3);
    expect(await count(P, `ws-${T - 50_000}-e269m`)).toBe(1);

    const res = await request(app).delete(`/api/workspaces/${P}/${LEGACY}`);
    expect(res.status).toBe(200);
    expect(await count(P, LEGACY)).toBe(0);
    expect(await count(P, `ws-${T - 50_000}-e269m`)).toBe(1);
  });

  test('negative: ambiguous candidates are not written', async () => {
    await wsLegacy(P, '6a00000000000000000000a1', new Date(T + 1000));
    await wsLegacy(P, '6a00000000000000000000a2', new Date(T - 2000));
    await el(P, 'l1', `ws-${T}-xxxxx`);
    const r = await align();
    expect(r.moved).toBe(0);
    expect(await count(P, `ws-${T}-xxxxx`)).toBe(1);
  });

  test('align keeps every workspace field and is idempotent', async () => {
    await wsLegacy(P, LEGACY, new Date(T + 84));
    await el(P, 'l1', `ws-${T}-16dxo`);
    await align();
    const doc = await wsColl().findOne({ _id: LEGACY as any });
    expect(doc).toMatchObject({ name: 'legacy', source: 'csv' });
    expect(String(doc!.projectId)).toBe(P);
    expect(await align()).toEqual({ normalized: 0, moved: 0 });
  });
});

d('THE-771 — delete orphans only', () => {
  test('removes orphan groups of live projects; ok, aligned and dead-project elements stay', async () => {
    await wsString(P, 'ws-a');
    await el(P, 'a1', 'ws-a');
    await el(P, 'o1', 'ws-1782282061855-e269m'); await el(P, 'o2', 'ws-1782282061855-e269m');
    await el(DEAD, 'd1', 'ws-1775479541598-rfu4y');

    const s = getNeo4jDriver().session();
    try {
      const p = planWorkspaceIntegrity(await loadElementGroups(s, { projectIds: ALL }), await loadWorkspaceDocs(wsColl()), new Set([P, OTHER_P]));
      expect(p.orphans).toEqual([{ projectId: P, workspaceId: 'ws-1782282061855-e269m', n: 2, certified: 0 }]);
      expect(await deleteOrphans(s, p.orphans)).toBe(2);
    } finally { await s.close(); }

    expect(await count(P, 'ws-1782282061855-e269m')).toBe(0);
    expect(await count(P, 'ws-a')).toBe(1);
    expect(await count(DEAD, 'ws-1775479541598-rfu4y')).toBe(1);
  });
});
