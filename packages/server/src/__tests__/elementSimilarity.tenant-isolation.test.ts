/**
 * UC-SIM-001 / REQ-SIM-005 — Tenant-Isolation Security Tests
 *
 * **HARD-STOP scenarios for production.** Cross-workspace element-leakage
 * would be a DSGVO violation (architecture data contains stakeholder names,
 * supplier names, internal system identifiers). These tests verify that:
 *
 *   1. Each workspace's elements live in their own Qdrant collection
 *   2. A query in workspace-B cannot see elements upserted in workspace-A,
 *      even if the elements are textually identical
 *   3. Delete operations cannot reach across workspaces
 *   4. elementId queries don't leak the source element across workspaces
 *   5. Injection-shaped workspaceIds are rejected, not silently sanitized
 *   6. The collection naming pattern is collision-resistant
 *
 * The other test file (`elementSimilarity.service.test.ts`) uses jest mocks
 * to verify the SHAPE of Qdrant calls. This file uses a workspace-aware
 * in-memory simulator that BEHAVES like the real Qdrant so we can prove
 * isolation as a behavioral property, not just an API-contract property.
 *
 * Run: cd packages/server && npx jest src/__tests__/elementSimilarity.tenant-isolation.test.ts --forceExit
 */

// ─── Workspace-aware in-memory Qdrant simulator ─────────────────────────────
//
// Stores points per collection. Search performs honest cosine over the
// stored vectors. This is enough to verify isolation as a property —
// not exhaustive Qdrant-mock, but right-shaped for the isolation tests.
//
// `_collections` is exposed via `(simQdrant as any).__collections` for
// per-test inspection. Built as a plain `Map<string, any>` so jest's
// auto-mock-hoisting doesn't trip over TypeScript-only syntax.

type SimPoint = { id: string; vector: number[]; payload: Record<string, unknown> };
type SimCollection = { name: string; points: Map<string, SimPoint> };

jest.mock('@qdrant/js-client-rest', () => {
  const cols = new Map<string, SimCollection>();
  const cosine = (a: number[], b: number[]): number => {
    let s = 0;
    for (let i = 0; i < a.length; i++) s += a[i] * b[i];
    return s;
  };
  const sim = {
    __collections: cols,
    getCollection: jest.fn(async (name: string) => {
      const c = cols.get(name);
      if (!c) throw new Error(`collection ${name} not found`);
      return { name };
    }),
    createCollection: jest.fn(async (name: string) => {
      cols.set(name, { name, points: new Map() });
      return {};
    }),
    upsert: jest.fn(async (name: string, opts: { points: SimPoint[] }) => {
      const c = cols.get(name);
      if (!c) throw new Error(`collection ${name} not found`);
      for (const p of opts.points) c.points.set(p.id, p);
      return {};
    }),
    delete: jest.fn(async (name: string, opts: { points: string[] }) => {
      const c = cols.get(name);
      if (!c) throw new Error(`collection ${name} not found`);
      for (const id of opts.points) c.points.delete(id);
      return {};
    }),
    search: jest.fn(async (
      name: string,
      opts: { vector: number[]; limit: number; score_threshold?: number },
    ) => {
      const c = cols.get(name);
      if (!c) throw new Error(`collection ${name} not found`);
      const ranked = Array.from(c.points.values())
        .map((p) => ({
          id: p.id,
          score: cosine(p.vector, opts.vector),
          payload: p.payload,
        }))
        .sort((a, b) => b.score - a.score)
        .filter((p) => (opts.score_threshold ?? -1) <= p.score);
      return ranked.slice(0, opts.limit);
    }),
    retrieve: jest.fn(async (
      name: string,
      opts: { ids: string[]; with_vector?: boolean },
    ) => {
      const c = cols.get(name);
      if (!c) throw new Error(`collection ${name} not found`);
      return opts.ids
        .map((id) => {
          const p = c.points.get(id);
          if (!p) return null;
          return { id: p.id, vector: opts.with_vector ? p.vector : undefined };
        })
        .filter(Boolean);
    }),
    getCollections: jest.fn(async () => ({
      collections: Array.from(cols.values()).map((c) => ({ name: c.name })),
    })),
  };
  return {
    QdrantClient: jest.fn().mockImplementation(() => sim),
    __sim: sim,
  };
});

// Reach back into the mock to inspect collection-state in tests.
const qdrantMockModule = jest.requireMock('@qdrant/js-client-rest') as {
  __sim: { __collections: Map<string, SimCollection> };
};
const collections = qdrantMockModule.__sim.__collections;

// ─── Sidecar mock: deterministic per-text vector ────────────────────────────
//
// Real sidecar returns semantically-meaningful embeddings. For isolation
// tests we just need stable vectors so identical text → identical vector.
// We hash text → 768-dim vector and normalize.

import * as crypto from 'node:crypto';

function fakeEmbed(text: string): number[] {
  // Deterministic 768-d vector seeded by text hash
  const seed = crypto.createHash('sha256').update(text).digest();
  const v = new Array(768);
  for (let i = 0; i < 768; i++) {
    // Map byte → [-1, 1]
    v[i] = (seed[i % seed.length] - 128) / 128;
  }
  // L2-normalize
  let norm = 0;
  for (const x of v) norm += x * x;
  norm = Math.sqrt(norm);
  for (let i = 0; i < v.length; i++) v[i] /= norm;
  return v;
}

const originalFetch = global.fetch;
beforeAll(() => {
  global.fetch = jest.fn(async (_url: unknown, init?: { body?: string }) => {
    const body = JSON.parse(init?.body ?? '{}');
    return {
      ok: true,
      json: async () => ({
        vector: fakeEmbed(body.text),
        dim: 768,
        model: 'mock',
      }),
    };
  }) as unknown as typeof fetch;
});

afterAll(() => {
  global.fetch = originalFetch;
});

beforeEach(() => {
  collections.clear();
  jest.clearAllMocks();
});

// ─── Now import the service under test ──────────────────────────────────────

import {
  upsertEmbedding,
  findSimilarElements,
  deleteEmbedding,
  WorkspaceMismatchError,
} from '../services/elementSimilarity.service';

// ─── Fixtures ───────────────────────────────────────────────────────────────

const WS_BSH = '69bc3587df3af891440096ce';     // realistic workspace 1
const WS_BANK = '6a017d5040fb91d0493c8490';    // realistic workspace 2

const emissionsRecord = {
  id: 'emissions-1',
  name: 'Emissions-Record',
  description: 'Scope 1/2/3 GHG measurements',
  type: 'data_object',
  layer: 'information',
  projectId: 'p-bsh',
};

// Same logical element data, different ID — used to verify content-based
// isolation (text-similarity won't bridge workspaces).
const emissionsRecordOtherWs = {
  ...emissionsRecord,
  id: 'emissions-bank-1',
  projectId: 'p-bank',
};

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('REQ-SIM-005 — Tenant-isolation as behavioral property', () => {
  it('1. each workspace gets its own Qdrant collection (different physical store)', async () => {
    await upsertEmbedding(WS_BSH, emissionsRecord);
    await upsertEmbedding(WS_BANK, emissionsRecordOtherWs);

    expect(collections.has(`elements-${WS_BSH}`)).toBe(true);
    expect(collections.has(`elements-${WS_BANK}`)).toBe(true);
    expect(collections.get(`elements-${WS_BSH}`)!.points.size).toBe(1);
    expect(collections.get(`elements-${WS_BANK}`)!.points.size).toBe(1);
  });

  it('2. text-query in workspace-B cannot see elements upserted in workspace-A', async () => {
    // Upsert exclusively in BSH
    await upsertEmbedding(WS_BSH, emissionsRecord);

    // Query SAME text in the BANK workspace → must return nothing
    const res = await findSimilarElements(WS_BANK, {
      text: 'Emissions-Record',
      scoreThreshold: 0.0,
    });

    expect(res.results).toHaveLength(0);
  });

  it('3. cross-content with same text is still per-workspace isolated', async () => {
    // Two workspaces both have an "Emissions-Record" — they should each
    // only see their own
    await upsertEmbedding(WS_BSH, emissionsRecord);
    await upsertEmbedding(WS_BANK, emissionsRecordOtherWs);

    const bshRes = await findSimilarElements(WS_BSH, { text: 'Emissions-Record', scoreThreshold: 0.0 });
    const bankRes = await findSimilarElements(WS_BANK, { text: 'Emissions-Record', scoreThreshold: 0.0 });

    expect(bshRes.results.map((r) => r.elementId)).toEqual(['emissions-1']);
    expect(bankRes.results.map((r) => r.elementId)).toEqual(['emissions-bank-1']);
    expect(bshRes.results[0].projectId).toBe('p-bsh');
    expect(bankRes.results[0].projectId).toBe('p-bank');
  });

  it('4. delete in workspace-B has no effect on workspace-A', async () => {
    await upsertEmbedding(WS_BSH, emissionsRecord);

    // Try to delete by the same id from the wrong workspace
    await deleteEmbedding(WS_BANK, 'emissions-1');

    // BSH side still has it
    const res = await findSimilarElements(WS_BSH, {
      text: 'Emissions-Record',
      scoreThreshold: 0.0,
    });
    expect(res.results).toHaveLength(1);
    expect(res.results[0].elementId).toBe('emissions-1');
  });

  it('5. elementId-query is bounded to the calling workspace', async () => {
    await upsertEmbedding(WS_BSH, emissionsRecord);

    // The same elementId queried from the wrong workspace should error
    // (element does not exist in that workspace's index)
    await expect(
      findSimilarElements(WS_BANK, { elementId: 'emissions-1' }),
    ).rejects.toThrow('not found in workspace index');
  });

  it('6. injection-shaped workspaceIds are REJECTED, not sanitized silently', async () => {
    // If we silently strip characters, an attacker could craft
    // "valid-workspace/../other-workspace" and land in another collection.
    // We must throw instead.
    const dangerous = [
      'foo/bar',
      '../etc',
      'foo;DROP',
      'foo bar',
      'foo$',
      'foo.bar',
    ];
    for (const ws of dangerous) {
      await expect(
        upsertEmbedding(ws, emissionsRecord),
      ).rejects.toThrow(WorkspaceMismatchError);
      await expect(
        findSimilarElements(ws, { text: 'q' }),
      ).rejects.toThrow(WorkspaceMismatchError);
      await expect(
        deleteEmbedding(ws, 'x'),
      ).rejects.toThrow(WorkspaceMismatchError);
    }
    // Confirm nothing leaked into the wrong place — no collection was
    // created by the rejected calls.
    expect(collections.size).toBe(0);
  });

  it('7. multiple workspaces live simultaneously without bleed', async () => {
    const ws_list = ['workspace-alpha', 'workspace-beta', 'workspace-gamma'];
    for (const ws of ws_list) {
      await upsertEmbedding(ws, {
        ...emissionsRecord,
        id: `e-${ws}`,
        projectId: `p-${ws}`,
      });
    }
    // Each should see exactly 1 element when querying their own workspace.
    // Use scoreThreshold: -1 because fakeEmbed produces hash-based vectors
    // whose cosine with the query text can land slightly negative; we only
    // care that ranking is isolated to the workspace, not the score value.
    for (const ws of ws_list) {
      const res = await findSimilarElements(ws, { text: 'Emissions', scoreThreshold: -1 });
      expect(res.results).toHaveLength(1);
      expect(res.results[0].projectId).toBe(`p-${ws}`);
    }
  });

  it('8. collection-name pattern is collision-resistant against workspace-id prefix tricks', async () => {
    // "elements-foo" as workspaceId would collide with the natural
    // collection name of workspace "foo". We can prevent that because
    // workspaceIds are validated and the prefix is part of the format.
    // Just verify the two distinct workspaces produce two distinct collections.
    await upsertEmbedding('foo', { ...emissionsRecord, id: 'e1' });
    await upsertEmbedding('elements-foo', { ...emissionsRecord, id: 'e2' });
    expect(collections.has('elements-foo')).toBe(true);
    expect(collections.has('elements-elements-foo')).toBe(true);
    // Each isolated to one element each
    expect(collections.get('elements-foo')!.points.size).toBe(1);
    expect(collections.get('elements-elements-foo')!.points.size).toBe(1);
  });
});
