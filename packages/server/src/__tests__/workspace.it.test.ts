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
async function edge(projectId: string, from: string, to: string) {
  await runCypher(
    `MATCH (a:ArchitectureElement {id: $from}), (b:ArchitectureElement {id: $to})
     CREATE (a)-[:CONNECTS_TO {id: $from + '->' + $to}]->(b)`,
    { from: `${projectId}-${from}`, to: `${projectId}-${to}` },
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
    await runCypher(`MATCH (e:ArchitectureElement) WHERE e.projectId IN $ps DETACH DELETE e`, { ps: ALL });
    await getNeo4jDriver().close();
    await mongoose.disconnect();
    await mongo.stop();
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

    expect(res.body.removed).toEqual({ elements: 2, relationships: 2, crossWorkspaceRelationships: 1, certified: 1 });
    expect(auditCreate).toHaveBeenCalledTimes(1);
    expect(auditCreate.mock.calls[0][0].after).toEqual(res.body.removed);
    expect(await count(P, 'ws-b')).toBe(1);   // the other end survives, only the edge is gone
  });
});
