/**
 * THE-739 / REQ-THE739-1 — a connector re-sync updates instead of duplicating.
 *
 * Every sync path (scheduler, connector sync, integration sync) used to CREATE a
 * fresh node with a random id per run → 27 identical GitHub elements in one
 * project. These tests drive the real importConnectorResult against a stateful,
 * projectId-scoped in-memory graph.
 */

type Node = Record<string, any> & { id: string; projectId: string };
type Rel = Record<string, any> & { sourceId: string; targetId: string; projectId: string; type: string };
const store: { elements: Node[]; connections: Rel[] } = { elements: [], connections: [] };

const row = (o: Record<string, unknown>) => ({ get: (k: string) => (o[k] === undefined ? null : o[k]) });

const runCypherMock = jest.fn((query: string, params: any) => {
  if (query.includes('RETURN e.id AS id')) {
    return Promise.resolve(
      store.elements
        .filter((e) => e.projectId === params.projectId && e.source === params.source
          && e.connectorConfigId === params.connectorConfigId)
        .map((e) => row(e)),
    );
  }
  return Promise.resolve([]);
});

const txMock = jest.fn((ops: Array<{ query: string; params: any }>) => {
  for (const { query, params: p } of ops) {
    if (query.includes('CREATE (e:ArchitectureElement')) {
      store.elements.push({
        id: p.id, projectId: p.projectId, name: p.name, type: p.type, layer: p.layer,
        description: p.description, status: p.status, riskLevel: p.riskLevel,
        maturityLevel: p.maturityLevel, provenance: 'import', source: p.source,
        createdAt: p.now, updatedAt: p.now, ...p.origin,
      });
    } else if (query.includes('MATCH (e:ArchitectureElement {id: $id, projectId: $projectId})')) {
      const e = store.elements.find((n) => n.id === p.id && n.projectId === p.projectId);
      if (!e) continue;
      const changed = ['name', 'type', 'layer', 'description', 'status', 'riskLevel', 'maturityLevel']
        .some((k) => e[k] !== p[k]);
      Object.assign(e, {
        name: p.name, type: p.type, layer: p.layer, description: p.description, status: p.status,
        riskLevel: p.riskLevel, maturityLevel: p.maturityLevel, updatedAt: p.now, ...p.origin,
      });
      if (changed) { e.certifiedBy = null; e.certifiedAt = null; }
    } else if (query.includes('MERGE (s)-[r:CONNECTS_TO')) {
      const s = store.elements.find((n) => n.id === p.sourceId && n.projectId === p.projectId);
      const t = store.elements.find((n) => n.id === p.targetId && n.projectId === p.projectId);
      if (!s || !t) continue;
      const hit = store.connections.find((r) => r.projectId === p.projectId
        && r.sourceId === p.sourceId && r.targetId === p.targetId && r.type === p.type);
      if (!hit) store.connections.push({ id: p.connId, sourceId: p.sourceId, targetId: p.targetId, projectId: p.projectId, type: p.type });
    } else {
      throw new Error(`unexpected write: ${query}`);
    }
  }
  return Promise.resolve();
});

jest.mock('../config/neo4j', () => ({
  runCypher: (q: string, p: any) => runCypherMock(q, p),
  runCypherTransaction: (ops: any) => txMock(ops),
}));

import { importConnectorResult, planConnectorUpsert } from '../services/connector-import.service';
import type { ParsedElement, ParsedConnection } from '../services/upload.service';

const origin = { source: 'github', connectorConfigId: 'TheArchitect', sourceRef: 'https://github.com/MaCeeeee/TheArchitect' };

let seq = 0;
/** Mimics the connector: a fresh random id on every fetch, stable externalId. */
const repo = (name: string, extra: Partial<ParsedElement> = {}): ParsedElement => ({
  id: `gh-${++seq}`, name, type: 'application_component', layer: 'application',
  description: '', status: 'current', riskLevel: 'low', maturityLevel: 3, ...extra,
});

beforeEach(() => {
  store.elements = [];
  store.connections = [];
  seq = 0;
});

describe('importConnectorResult — re-sync is idempotent (THE-739)', () => {
  it('two syncs of the same repo leave exactly one element', async () => {
    const first = await importConnectorResult('p1', { elements: [repo('TheArchitect', { externalId: '42' })], connections: [] }, origin);
    const second = await importConnectorResult('p1', { elements: [repo('TheArchitect', { externalId: '42' })], connections: [] }, origin);

    expect(store.elements.filter((e) => e.projectId === 'p1')).toHaveLength(1);
    expect(first).toMatchObject({ elementsCreated: 1, elementsUpdated: 0 });
    expect(second).toMatchObject({ elementsCreated: 0, elementsUpdated: 1 });
    expect(store.elements[0].externalId).toBe('42');
  });

  it('updates the existing element in place (rename upstream keeps the id)', async () => {
    await importConnectorResult('p1', { elements: [repo('Old', { externalId: '42' })], connections: [] }, origin);
    const id = store.elements[0].id;
    await importConnectorResult('p1', { elements: [repo('New', { externalId: '42', description: 'moved' })], connections: [] }, origin);

    expect(store.elements).toHaveLength(1);
    expect(store.elements[0]).toMatchObject({ id, name: 'New', description: 'moved' });
  });

  it('never matches an element of another project (THE-370 pattern)', async () => {
    await importConnectorResult('other', { elements: [repo('TheArchitect', { externalId: '42' })], connections: [] }, origin);
    await importConnectorResult('p1', { elements: [repo('TheArchitect', { externalId: '42' })], connections: [] }, origin);

    expect(store.elements.map((e) => e.projectId).sort()).toEqual(['other', 'p1']);
  });

  it('adopts a legacy element without externalId instead of adding a 28th', async () => {
    store.elements.push({
      id: 'gh-legacy', projectId: 'p1', name: 'TheArchitect', type: 'application_component',
      source: 'github', connectorConfigId: 'TheArchitect', createdAt: '2026-06-24T00:00:00.000Z',
    });
    const r = await importConnectorResult('p1', { elements: [repo('TheArchitect', { externalId: '42' })], connections: [] }, origin);

    expect(r).toMatchObject({ elementsCreated: 0, elementsUpdated: 1 });
    expect(store.elements).toHaveLength(1);
    expect(store.elements[0]).toMatchObject({ id: 'gh-legacy', externalId: '42' });
  });

  it('is idempotent for connectors without externalId (name+type fallback)', async () => {
    const batch = () => [repo('Same'), repo('Same'), repo('Other')];
    await importConnectorResult('p1', { elements: batch(), connections: [] }, origin);
    await importConnectorResult('p1', { elements: batch(), connections: [] }, origin);

    // Two same-named items stay two — each existing node is matched at most once.
    expect(store.elements).toHaveLength(3);
  });

  it('does not duplicate connections across syncs', async () => {
    const sync = () => {
      const a = repo('upstream', { externalId: '1' });
      const b = repo('fork', { externalId: '2' });
      const conn: ParsedConnection = { id: `conn-${seq}`, sourceId: a.id, targetId: b.id, type: 'specialization', label: 'fork' };
      return importConnectorResult('p1', { elements: [a, b], connections: [conn] }, origin);
    };
    await sync();
    await sync();

    expect(store.elements).toHaveLength(2);
    expect(store.connections).toHaveLength(1);
  });

  it('sends a changed element back to the notary queue, keeps certification when unchanged', async () => {
    await importConnectorResult('p1', { elements: [repo('Repo', { externalId: '7' })], connections: [] }, origin);
    Object.assign(store.elements[0], { certifiedBy: 'notar-1', certifiedAt: '2026-10-01' });

    await importConnectorResult('p1', { elements: [repo('Repo', { externalId: '7' })], connections: [] }, origin);
    expect(store.elements[0].certifiedBy).toBe('notar-1');

    await importConnectorResult('p1', { elements: [repo('Repo', { externalId: '7', status: 'retired' })], connections: [] }, origin);
    expect(store.elements[0].certifiedBy).toBeNull();
  });
});

describe('planConnectorUpsert', () => {
  it('prefers the externalId match over a legacy name match, oldest legacy first', () => {
    const plan = planConnectorUpsert(
      [repo('A', { externalId: 'x' }), repo('B')],
      [
        { id: 'legacy-new', externalId: null, name: 'B', type: 'application_component', createdAt: '2026-07-01' },
        { id: 'legacy-old', externalId: null, name: 'B', type: 'application_component', createdAt: '2026-06-01' },
        { id: 'ext', externalId: 'x', name: 'renamed', type: 'application_component', createdAt: '2026-06-01' },
      ],
    );
    expect(plan.updates.map((u) => u.id)).toEqual(['ext', 'legacy-old']);
    expect(plan.creates).toHaveLength(0);
  });
});
