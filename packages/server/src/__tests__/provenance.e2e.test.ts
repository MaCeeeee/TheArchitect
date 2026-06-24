/**
 * REQ-PROV-002.5 — Cross-cutting E2E for connector provenance (UC-PROV-002).
 *
 * Drives the FULL chain against the real certification router with a stateful
 * in-memory Neo4j: the real createTemporaryGraph WRITES source+origin, then the
 * endpoints READ them — GitHub sync → pending (badge data) → certify → out of
 * pending → bySource.confirmed++. Also covers multi-tenant scope + backward-compat.
 */
import express from 'express';
import request from 'supertest';

jest.mock('../middleware/auth.middleware', () => ({
  authenticate: (req: any, _res: unknown, next: () => void) => {
    req.user = { _id: 'notar-1' };
    next();
  },
}));
jest.mock('../middleware/projectAccess.middleware', () => ({
  requireProjectAccess: () => (_req: unknown, _res: unknown, next: () => void) => next(),
}));
jest.mock('../middleware/audit.middleware', () => ({
  audit: () => (_req: unknown, _res: unknown, next: () => void) => next(),
}));

// ─── Stateful in-memory graph ───
type Atom = {
  id: string; projectId: string; name?: string; type: string; label?: string;
  layer?: string | null; provenance: string; source: string | null;
  confidence: number | null; certifiedBy: string | null; certifiedAt: string | null;
  sourceId?: string; targetId?: string;
  sourceRef?: string | null; importedAt?: string | null; connectorConfigId?: string | null;
};
const store: { elements: Atom[]; connections: Atom[] } = { elements: [], connections: [] };

const rawRow = (o: Record<string, unknown>) => ({ get: (k: string) => (o[k] === undefined ? null : o[k]) });
const numRow = (o: Record<string, number>) => ({ get: (k: string) => ({ toNumber: () => o[k] ?? 0 }) });
const isConfirmed = (a: Atom) => (a.provenance ?? 'user') === 'user' || a.certifiedBy != null;
const aggRow = (arr: Atom[]) =>
  numRow({
    total: arr.length,
    confirmed: arr.filter(isConfirmed).length,
    usr: arr.filter((a) => (a.provenance ?? 'user') === 'user').length,
    ai: arr.filter((a) => a.provenance === 'ai_generated').length,
    imp: arr.filter((a) => a.provenance === 'import').length,
    mcp: arr.filter((a) => a.provenance === 'mcp_discovered').length,
  });
const groupBySource = (arr: Atom[]) => {
  const m = new Map<string, { total: number; confirmed: number }>();
  arr.forEach((a) => {
    const g = m.get(a.source as string) ?? { total: 0, confirmed: 0 };
    g.total += 1;
    if (isConfirmed(a)) g.confirmed += 1;
    m.set(a.source as string, g);
  });
  return [...m.entries()].map(([src, g]) => ({
    get: (k: string) => (k === 'src' ? src : { toNumber: () => (g as Record<string, number>)[k] ?? 0 }),
  }));
};

const runCypherMock = jest.fn();
const txMock = jest.fn();
jest.mock('../config/neo4j', () => ({
  runCypher: (...a: unknown[]) => runCypherMock(...a),
  runCypherTransaction: (...a: unknown[]) => txMock(...a),
}));

import certificationRoutes from '../routes/certification.routes';
import { createTemporaryGraph, ParseResult } from '../services/upload.service';

const app = express();
app.use(express.json());
app.use('/api/projects', certificationRoutes);

// runCypherTransaction seeds the store from the REAL createTemporaryGraph output.
txMock.mockImplementation((ops: Array<{ query: string; params: any }>) => {
  ops.forEach(({ query, params }) => {
    if (query.includes('CREATE (e:ArchitectureElement')) {
      store.elements.push({
        id: params.id, projectId: params.projectId, name: params.name, type: params.type,
        layer: params.layer, provenance: 'import', source: params.source, confidence: null,
        certifiedBy: null, certifiedAt: null, sourceRef: null, importedAt: null, connectorConfigId: null,
        ...(params.origin || {}),
      });
    } else if (query.includes('CREATE (s)-[r:CONNECTS_TO')) {
      store.connections.push({
        id: params.connId, projectId: params.projectId, type: params.type, label: params.label,
        provenance: 'import', source: params.source, confidence: null, certifiedBy: null,
        certifiedAt: null, sourceId: params.sourceId, targetId: params.targetId,
        sourceRef: null, importedAt: null, connectorConfigId: null, ...(params.origin || {}),
      });
    }
  });
  return Promise.resolve(undefined);
});

// runCypher interprets read/write queries against the store (projectId-scoped).
runCypherMock.mockImplementation((query: string, params: any) => {
  const q: string = query;
  const pid = params.projectId;
  const els = store.elements.filter((e) => e.projectId === pid);
  const conns = store.connections.filter((c) => c.projectId === pid);

  if (q.includes('SET e.certifiedBy = $userId')) {
    const hit = els.filter((e) =>
      q.includes('$ids') ? params.ids.includes(e.id) && !e.certifiedBy : e.provenance !== 'user' && !e.certifiedBy,
    );
    hit.forEach((e) => { e.certifiedBy = params.userId; e.certifiedAt = params.now; });
    return Promise.resolve([numRow({ n: hit.length })]);
  }
  if (q.includes('SET r.certifiedBy = $userId')) {
    const hit = conns.filter((c) =>
      q.includes('$ids') ? params.ids.includes(c.id) && !c.certifiedBy : c.provenance !== 'user' && !c.certifiedBy,
    );
    hit.forEach((c) => { c.certifiedBy = params.userId; c.certifiedAt = params.now; });
    return Promise.resolve([numRow({ n: hit.length })]);
  }
  if (q.includes('e.name AS name')) {
    return Promise.resolve(els.filter((e) => e.provenance !== 'user' && !e.certifiedBy).map((e) => rawRow(e)));
  }
  if (q.includes('r.label AS label')) {
    return Promise.resolve(
      conns
        .filter((c) => c.provenance !== 'user' && !c.certifiedBy)
        .map((c) =>
          rawRow({
            ...c,
            sourceName: els.find((e) => e.id === c.sourceId)?.name ?? null,
            targetName: els.find((e) => e.id === c.targetId)?.name ?? null,
          }),
        ),
    );
  }
  if (q.includes('e.source AS src')) return Promise.resolve(groupBySource(els.filter((e) => e.source != null)));
  if (q.includes('r.source AS src')) return Promise.resolve(groupBySource(conns.filter((c) => c.source != null)));
  if (q.includes('count(e) AS total')) return Promise.resolve([aggRow(els)]);
  if (q.includes('count(r) AS total')) return Promise.resolve([aggRow(conns)]);
  return Promise.resolve([]);
});

const githubParsed: ParseResult = {
  elements: [
    { id: 'el-1', name: 'Payment Repo', type: 'application_component', layer: 'application', description: '', status: 'active', riskLevel: 'low', maturityLevel: 3 },
  ],
  connections: [{ id: 'c-1', sourceId: 'el-1', targetId: 'el-1', type: 'serving', label: '' }],
  warnings: [],
  format: 'connector:github',
};

beforeEach(() => {
  store.elements = [];
  store.connections = [];
});

describe('UC-PROV-002 E2E — sync → pending → certify → trust-summary (REQ-PROV-002.5)', () => {
  it('runs the full GitHub provenance chain end to end', async () => {
    // 1. GitHub sync writes source + origin via the real createTemporaryGraph.
    const { projectId } = await createTemporaryGraph(githubParsed, {
      origin: { sourceRef: 'https://api.github.com/acme', connectorConfigId: 'gh-main' },
    });

    // 2. Pending exposes the de-anonymized source + origin (the badge + origin line).
    let pending = await request(app).get(`/api/projects/${projectId}/certification/pending`);
    expect(pending.body.data.total).toBe(2); // 1 element + 1 connection
    const el = pending.body.data.elements[0];
    expect(el.source).toBe('github');
    expect(el.sourceRef).toBe('https://api.github.com/acme');
    expect(el.connectorConfigId).toBe('gh-main');
    expect(typeof el.importedAt).toBe('string');
    expect(pending.body.data.connections[0].source).toBe('github');

    // 3. Before certification: bySource.github is fully unconfirmed.
    let trust = await request(app).get(`/api/projects/${projectId}/certification/trust-summary`);
    expect(trust.body.data.bySource.github).toEqual({ total: 2, confirmed: 0, unconfirmed: 2 });
    expect(trust.body.data.confirmedPct).toBe(0);

    // 4. Notary certifies all.
    const certify = await request(app)
      .post(`/api/projects/${projectId}/certification/certify`)
      .send({ all: true });
    expect(certify.body.data).toMatchObject({ elementsCertified: 1, connectionsCertified: 1 });

    // 5. Queue is now empty …
    pending = await request(app).get(`/api/projects/${projectId}/certification/pending`);
    expect(pending.body.data.total).toBe(0);

    // 6. … and bySource.github flipped to fully confirmed.
    trust = await request(app).get(`/api/projects/${projectId}/certification/trust-summary`);
    expect(trust.body.data.bySource.github).toEqual({ total: 2, confirmed: 2, unconfirmed: 0 });
    expect(trust.body.data.confirmedPct).toBe(100);
  });

  it('scopes pending + bySource by projectId (multi-tenant isolation)', async () => {
    const a = await createTemporaryGraph(githubParsed, { origin: { sourceRef: 'repo-a', connectorConfigId: 'a' } });
    const b = await createTemporaryGraph(
      { ...githubParsed, format: 'csv' },
      {},
    );

    const pendingA = await request(app).get(`/api/projects/${a.projectId}/certification/pending`);
    // Only project A's github atoms — none of B's csv atoms leak in.
    expect(pendingA.body.data.elements.every((e: any) => e.source === 'github')).toBe(true);
    const trustB = await request(app).get(`/api/projects/${b.projectId}/certification/trust-summary`);
    expect(Object.keys(trustB.body.data.bySource)).toEqual(['csv']);
  });

  it('backward-compat: legacy upload (no origin) shows source "upload", no origin line', async () => {
    // A pre-REQ import: source defaults to 'upload', no origin fields.
    const { projectId } = await createTemporaryGraph({ ...githubParsed, format: undefined as any });

    const pending = await request(app).get(`/api/projects/${projectId}/certification/pending`);
    const el = pending.body.data.elements[0];
    expect(el.source).toBe('upload');
    expect(el.sourceRef).toBeNull();
    expect(el.importedAt).toBeNull();

    const trust = await request(app).get(`/api/projects/${projectId}/certification/trust-summary`);
    expect(trust.body.data.bySource.upload).toEqual({ total: 2, confirmed: 0, unconfirmed: 2 });
  });
});
