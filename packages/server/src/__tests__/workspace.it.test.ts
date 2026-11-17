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
import { loadElementGroups, loadWorkspaceDocs, normalizeWorkspaceIds, applyAlign, deleteOrphans, sampleGroup, planWorkspaceIntegrity } from '../services/workspace-integrity.service';

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
      return { normalized: (await normalizeWorkspaceIds(wsColl(), p.normalize)).normalized, moved: (await applyAlign(s, p.align)).reduce((t, x) => t + x.moved, 0) };
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
    const from = await runCypher(
      `MATCH (e:ArchitectureElement {projectId: $p, workspaceId: $w}) WHERE e.workspaceIdAlignedFrom IS NOT NULL
       RETURN collect(e.workspaceIdAlignedFrom) AS f`, { p: P, w: LEGACY });
    expect(from[0].get('f')).toEqual([`ws-${T}-16dxo`, `ws-${T}-16dxo`]);

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

  test('conflict: string doc with the same hex but different content → legacy kept, string doc untouched, reported', async () => {
    await wsLegacy(P, LEGACY, new Date(T + 84));
    await wsColl().insertOne({ _id: LEGACY as any, name: 'DIFFERENT', projectId: new Types.ObjectId(P), source: 'manual',
      color: '#888', offsetX: 0, createdBy: new Types.ObjectId(), createdAt: new Date(T + 84), updatedAt: new Date() });
    const r = await normalizeWorkspaceIds(wsColl(), [LEGACY]);
    expect(r).toEqual({ normalized: 0, conflicts: [LEGACY] });
    expect(await wsColl().countDocuments({ _id: new Types.ObjectId(LEGACY) as any })).toBe(1);
    expect((await wsColl().findOne({ _id: LEGACY as any }))!.name).toBe('DIFFERENT');
  });

  test('normalizeWorkspaceIds calls onStep once per id with its outcome', async () => {
    const CONFLICT = hex();
    await wsLegacy(P, LEGACY, new Date(T + 84));
    await wsLegacy(P, CONFLICT, new Date(T + 85));
    await wsColl().insertOne({ _id: CONFLICT as any, name: 'DIFFERENT', projectId: new Types.ObjectId(P), source: 'manual',
      color: '#888', offsetX: 0, createdBy: new Types.ObjectId(), createdAt: new Date(T + 85), updatedAt: new Date() });
    const missing = hex();
    const seen: Array<{ id: string; outcome: string }> = [];
    const r = await normalizeWorkspaceIds(wsColl(), [LEGACY, CONFLICT, missing], (d) => seen.push(d));
    expect(r).toEqual({ normalized: 1, conflicts: [CONFLICT] });
    expect(seen).toEqual([{ id: LEGACY, outcome: 'normalized' }, { id: CONFLICT, outcome: 'conflict' }, { id: missing, outcome: 'skipped' }]);
  });

  test('half-finished earlier run: identical string doc exists → legacy doc is removed', async () => {
    await wsLegacy(P, LEGACY, new Date(T + 84));
    const legacy = await wsColl().findOne({ _id: new Types.ObjectId(LEGACY) as any });
    await wsColl().insertOne({ ...legacy!, _id: LEGACY as any, updatedAt: new Date(T + 999_999) });
    const r = await normalizeWorkspaceIds(wsColl(), [LEGACY]);
    expect(r).toEqual({ normalized: 1, conflicts: [] });
    expect(await wsColl().countDocuments({ _id: new Types.ObjectId(LEGACY) as any })).toBe(0);
    expect(await wsColl().countDocuments({ _id: LEGACY as any })).toBe(1);
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
      expect(p.orphans).toEqual([{ projectId: P, workspaceId: 'ws-1782282061855-e269m', n: 2, certified: 0, certifiedRelationships: 0 }]);
      expect(await deleteOrphans(s, wsColl(), p.orphans)).toEqual({ removed: 2, skippedCertified: [], skippedNowExists: [], partial: [] });
    } finally { await s.close(); }

    expect(await count(P, 'ws-1782282061855-e269m')).toBe(0);
    expect(await count(P, 'ws-a')).toBe(1);
    expect(await count(DEAD, 'ws-1775479541598-rfu4y')).toBe(1);
  });

  test('certified orphan group survives, uncertified orphan group is deleted', async () => {
    await el(P, 'c1', 'ws-1782282061855-cccc1', 'notary-1'); await el(P, 'c2', 'ws-1782282061855-cccc1');
    await el(P, 'u1', 'ws-1782282061855-uuuu1');

    const s = getNeo4jDriver().session();
    try {
      const p = planWorkspaceIntegrity(await loadElementGroups(s, { projectIds: ALL }), await loadWorkspaceDocs(wsColl()), new Set([P, OTHER_P]));
      expect(p.orphans).toHaveLength(2);
      expect(await deleteOrphans(s, wsColl(), p.orphans)).toEqual({ removed: 1, skippedCertified: ['ws-1782282061855-cccc1'], skippedNowExists: [], partial: [] });
    } finally { await s.close(); }

    expect(await count(P, 'ws-1782282061855-cccc1')).toBe(2);
    expect(await count(P, 'ws-1782282061855-uuuu1')).toBe(0);
  });

  test('race: a workspace with that id appears after planning → group is not deleted, reported as skippedNowExists (string and ObjectId _id)', async () => {
    const hexOrphan = hex();
    await el(P, 'r1', 'ws-1782282061855-race1'); await el(P, 'r2', hexOrphan);

    const s = getNeo4jDriver().session();
    try {
      const p = planWorkspaceIntegrity(await loadElementGroups(s, { projectIds: ALL }), await loadWorkspaceDocs(wsColl()), new Set([P, OTHER_P]));
      expect(p.orphans).toHaveLength(2);
      await wsString(P, 'ws-1782282061855-race1');
      await wsLegacy(P, hexOrphan, new Date());
      const r = await deleteOrphans(s, wsColl(), p.orphans);
      expect(r.removed).toBe(0);
      expect(r.skippedNowExists.sort()).toEqual(['ws-1782282061855-race1', hexOrphan].sort());
    } finally { await s.close(); }

    expect(await count(P, 'ws-1782282061855-race1')).toBe(1);
    expect(await count(P, hexOrphan)).toBe(1);
  });

  test('an uncertified orphan group whose only relationship is certified survives', async () => {
    await el(P, 'k1', 'ws-1782282061855-kkkk1'); await el(P, 'k2', 'ws-1782282061855-kkkk1');
    await edge(P, 'k1', 'k2', 'notary-1');
    await el(P, 'u1', 'ws-1782282061855-uuuu2');
    await edge(P, 'u1', 'k1');   // plain edge, no certification

    const s = getNeo4jDriver().session();
    try {
      const groups = await loadElementGroups(s, { projectIds: ALL });
      expect(groups.find((x) => x.workspaceId === 'ws-1782282061855-kkkk1')).toMatchObject({ certified: 0, certifiedRelationships: 1 });
      const p = planWorkspaceIntegrity(groups, await loadWorkspaceDocs(wsColl()), new Set([P, OTHER_P]));
      const r = await deleteOrphans(s, wsColl(), p.orphans);
      expect(r.skippedCertified).toEqual(['ws-1782282061855-kkkk1']);
      expect(r.removed).toBe(1);
    } finally { await s.close(); }

    expect(await count(P, 'ws-1782282061855-kkkk1')).toBe(2);
    expect(await count(P, 'ws-1782282061855-uuuu2')).toBe(0);
  });

  test('stale plan: a relationship is certified AFTER planning → the element survives the delete-time guard', async () => {
    await el(P, 's1', 'ws-1782282061855-stale1'); await el(P, 's2', 'ws-1782282061855-stale1');
    await el(P, 'x1', 'ws-a-other-live');
    await edge(P, 's1', 'x1');

    const s = getNeo4jDriver().session();
    try {
      const p = planWorkspaceIntegrity(await loadElementGroups(s, { projectIds: ALL }), await loadWorkspaceDocs(wsColl()), new Set([P, OTHER_P]));
      const o = p.orphans.find((x) => x.workspaceId === 'ws-1782282061855-stale1')!;
      expect(o).toMatchObject({ certified: 0, certifiedRelationships: 0 });
      await runCypher(`MATCH ({id: $a})-[r]-({id: $b}) SET r.certifiedBy = 'notary-1'`, { a: `${P}-s1`, b: `${P}-x1` });
      const r = await deleteOrphans(s, wsColl(), [o]);
      expect(r.skippedCertified).toEqual([]);   // plan said uncertified; the Cypher guard saved s1
      expect(r.removed).toBe(1);                // only s2
      expect(r.partial).toEqual([{ projectId: P, workspaceId: 'ws-1782282061855-stale1', planned: 2, removed: 1 }]);
    } finally { await s.close(); }

    expect(await count(P, 'ws-1782282061855-stale1')).toBe(1);
  });

  test('a group without a numeric certifiedRelationships is skipped, never deleted', async () => {
    await el(P, 'n1', 'ws-1782282061855-nnnn1');
    const s = getNeo4jDriver().session();
    try {
      const bad = { projectId: P, workspaceId: 'ws-1782282061855-nnnn1', n: 1, certified: 0 } as any;
      expect(await deleteOrphans(s, wsColl(), [bad])).toEqual({ removed: 0, skippedCertified: ['ws-1782282061855-nnnn1'], skippedNowExists: [], partial: [] });
    } finally { await s.close(); }
    expect(await count(P, 'ws-1782282061855-nnnn1')).toBe(1);
  });

  test('deleteOrphans calls onStep once per group with its outcome', async () => {
    await el(P, 'e1', 'ws-1782282061855-step1'); await el(P, 'e2', 'ws-1782282061855-step1');
    await el(P, 'e3', 'ws-1782282061855-step2', 'notary-1');
    await el(P, 'e4', 'ws-1782282061855-step3');
    const s = getNeo4jDriver().session();
    try {
      const p = planWorkspaceIntegrity(await loadElementGroups(s, { projectIds: ALL }), await loadWorkspaceDocs(wsColl()), new Set([P, OTHER_P]));
      await wsString(P, 'ws-1782282061855-step3');   // appears after planning
      const seen: any[] = [];
      await deleteOrphans(s, wsColl(), p.orphans, (d) => seen.push(d));
      const by = (w: string) => seen.find((x) => x.workspaceId === w);
      expect(seen).toHaveLength(3);
      expect(by('ws-1782282061855-step1')).toMatchObject({ projectId: P, outcome: 'removed', planned: 2, removed: 2 });
      expect(by('ws-1782282061855-step2')).toMatchObject({ outcome: 'skipped-certified', removed: 0 });
      expect(by('ws-1782282061855-step3')).toMatchObject({ outcome: 'skipped-now-exists', removed: 0 });
    } finally { await s.close(); }
  });

  test('sampleGroup (read-only) returns up to 5 names and the createdAt range', async () => {
    for (let i = 1; i <= 7; i += 1) {
      await runCypher(
        `CREATE (:ArchitectureElement {id: $id, projectId: $p, workspaceId: 'ws-1782282061855-smpl1', name: $name, type: 'application_component',
           createdAt: datetime($c)})`,
        { id: `${P}-s${i}`, p: P, name: `Sample ${i}`, c: `2026-0${i}-01T00:00:00Z` },
      );
    }
    const s = getNeo4jDriver().session();
    try {
      const r = await sampleGroup(s, P, 'ws-1782282061855-smpl1');
      expect(r.names).toEqual(['Sample 1', 'Sample 2', 'Sample 3', 'Sample 4', 'Sample 5']);
      expect(r.minCreatedAt).toMatch(/^2026-01-01/);
      expect(r.maxCreatedAt).toMatch(/^2026-07-01/);
    } finally { await s.close(); }
    expect(await count(P, 'ws-1782282061855-smpl1')).toBe(7);
  });
});
