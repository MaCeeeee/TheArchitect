/**
 * persist + load lifted graph (Slice 3 / THE-360). Neo4j mocked (house pattern).
 * Headline: the round-trip proof — persist → load yields the SAME trace verdict,
 * so the pure runTraceCheck stays the single source of truth.
 */
import fs from 'fs';
import path from 'path';

jest.mock('../config/neo4j', () => ({
  runCypher: jest.fn(),
  runCypherTransaction: jest.fn(),
}));

import { runCypher, runCypherTransaction } from '../config/neo4j';
import { persistLiftedGraph, loadLiftedGraph } from '../services/wfcomp/persist';
import { sanitizeN8nWorkflow } from '../services/wfcomp/sanitize';
import { liftCompliance } from '../services/wfcomp/lift';
import { runTraceCheck } from '../services/wfcomp/trace';
import { applyAttestation } from '../services/wfcomp/attestation';
import { ART30_FIELDS } from '../data/art30.seed-data';

const mockTx = runCypherTransaction as jest.Mock;
const mockRun = runCypher as jest.Mock;

const lift = (name: string) =>
  liftCompliance(
    sanitizeN8nWorkflow(JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'wfcomp', `${name}.json`), 'utf-8'))),
  );

beforeEach(() => {
  mockTx.mockReset();
  mockRun.mockReset();
});

describe('persistLiftedGraph (3.1)', () => {
  it('deletes the prior subgraph first, then creates elements + edges, tenant-scoped', async () => {
    const g = lift('clean-compliant');
    await persistLiftedGraph('p1', 'wf1', g);

    expect(mockTx).toHaveBeenCalledTimes(1);
    const ops = mockTx.mock.calls[0][0] as Array<{ query: string; params: Record<string, unknown> }>;

    // first op = scoped idempotent delete
    expect(ops[0].query).toMatch(/DETACH DELETE/);
    expect(ops[0].params).toMatchObject({ projectId: 'p1', wfcompId: 'wf1' });

    const elementOps = ops.filter(o => o.query.includes('CREATE (e:ArchitectureElement'));
    const edgeOps = ops.filter(o => o.query.includes('CONNECTS_TO'));
    expect(elementOps).toHaveLength(g.elements.length);
    expect(edgeOps).toHaveLength(g.edges.length);

    // every op carries projectId + wfcompId; attrs are passed for SET e += $attrs
    for (const op of [...elementOps, ...edgeOps]) {
      expect(op.params.projectId).toBe('p1');
      expect(op.params.wfcompId).toBe('wf1');
    }
    expect(elementOps.every(o => 'attrs' in o.params)).toBe(true);
  });
});

describe('loadLiftedGraph (3.2)', () => {
  it('reconstructs elements (attrs minus structural props) + edges from Neo4j records', async () => {
    mockRun
      .mockResolvedValueOnce([
        { get: (k: string) => (k === 'e' ? { properties: { id: 'x1', projectId: 'p1', name: 'Proc', type: 'process', source: 'wfcomp', wfcompId: 'wf1', provenance: 'import', gdprScope: true } } : undefined) },
        { get: (k: string) => (k === 'e' ? { properties: { id: 'x2', projectId: 'p1', name: 'PD', type: 'data_object', source: 'wfcomp', wfcompId: 'wf1', provenance: 'import', personal: true } } : undefined) },
      ])
      .mockResolvedValueOnce([
        { get: (k: string) => ({ from: 'x1', to: 'x2', rel: 'access' } as Record<string, string>)[k] },
      ]);

    const g = await loadLiftedGraph('p1', 'wf1');
    expect(g.elements).toHaveLength(2);
    expect(g.elements[0]).toEqual({ id: 'x1', type: 'process', name: 'Proc', attrs: { gdprScope: true }, provenance: 'import' });
    expect(g.elements[1].attrs).toEqual({ personal: true }); // structural props stripped
    expect(g.edges).toEqual([{ from: 'x1', to: 'x2', rel: 'access' }]);
  });
});

describe('round-trip: persist → load preserves the trace verdict', () => {
  // A tiny in-memory Neo4j: persist writes into the store, load reads it back.
  function wireFakeNeo4j() {
    const store: { elements: Record<string, unknown>[]; edges: Record<string, string>[] } = { elements: [], edges: [] };
    mockTx.mockImplementation(async (ops: Array<{ query: string; params: Record<string, unknown> }>) => {
      for (const op of ops) {
        if (op.query.includes('DETACH DELETE')) {
          store.elements = [];
          store.edges = [];
        } else if (op.query.includes('CREATE (e:ArchitectureElement')) {
          store.elements.push({
            id: op.params.id, projectId: op.params.projectId, name: op.params.name, type: op.params.type,
            source: 'wfcomp', wfcompId: op.params.wfcompId, provenance: op.params.provenance,
            ...(op.params.attrs as Record<string, unknown>),
          });
        } else if (op.query.includes('CONNECTS_TO')) {
          store.edges.push({ from: op.params.from as string, to: op.params.to as string, rel: op.params.rel as string });
        }
      }
    });
    mockRun.mockImplementation(async (query: string) => {
      if (query.includes('RETURN e')) {
        return store.elements.map((props) => ({ get: (k: string) => (k === 'e' ? { properties: props } : undefined) }));
      }
      return store.edges.map((e) => ({ get: (k: string) => e[k] }));
    });
    return store;
  }

  it.each(['clean-compliant', 'missing-recipient', 'thirdcountry-no-safeguard', 'inferrable-purpose'])(
    'fixture %s: load(persist(g)) gives an identical GapReport',
    async (fixture) => {
      wireFakeNeo4j();
      const original = lift(fixture);
      await persistLiftedGraph('p1', 'wf1', original);
      const loaded = await loadLiftedGraph('p1', 'wf1');
      expect(runTraceCheck(loaded, ART30_FIELDS)).toEqual(runTraceCheck(original, ART30_FIELDS));
    },
  );

  it('preserves attested provenance:user through the round-trip (AC-6)', async () => {
    wireFakeNeo4j();
    // a human attests the missing recipient (lit. d) → a 'user' node is materialized
    const attested = applyAttestation(lift('missing-recipient'), [{ litera: 'd', value: 'ACME Processing GmbH' }]);
    expect(attested.elements.some((e) => e.provenance === 'user')).toBe(true);

    await persistLiftedGraph('p1', 'wf1', attested);
    const loaded = await loadLiftedGraph('p1', 'wf1');

    // the human-signed node stays distinguishable from machine-lifted ones
    const userNodes = loaded.elements.filter((e) => e.provenance === 'user');
    expect(userNodes.length).toBe(attested.elements.filter((e) => e.provenance === 'user').length);
    expect(loaded.elements.some((e) => e.provenance === 'import')).toBe(true); // lifted nodes still 'import'
    // and the verdict reflects the attestation
    expect(runTraceCheck(loaded, ART30_FIELDS).fields.find((f) => f.litera === 'd')?.status).toBe('present');
  });

  it('re-assessment replaces (does not accumulate) the subgraph', async () => {
    const store = wireFakeNeo4j();
    await persistLiftedGraph('p1', 'wf1', lift('clean-compliant'));
    const after1 = store.elements.length;
    await persistLiftedGraph('p1', 'wf1', lift('clean-compliant')); // re-assess
    expect(store.elements.length).toBe(after1); // not doubled
  });
});
