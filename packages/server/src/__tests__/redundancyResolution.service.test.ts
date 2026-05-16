/**
 * REQ-RED-004 — redundancyResolution service unit tests
 *
 * Covers the merge-elements machinery with a Cypher-recording mock.
 * We assert on the SHAPE of the queries (existence-check, outgoing
 * transfer, incoming transfer, detach delete) rather than running
 * actual Neo4j — the integration story is covered end-to-end via
 * the Supertest at architecture.routes.redundancy-resolve.test.ts
 * and the manual Production-Smoke.
 */

// Track every Cypher call for shape-assertions
const cypherCalls: Array<{ query: string; params: Record<string, unknown> }> = [];

jest.mock('../config/neo4j', () => ({
  runCypher: jest.fn(async (query: string, params: Record<string, unknown>) => {
    cypherCalls.push({ query, params });
    // Existence-check: return both ids when source+target are queried
    if (query.includes('WHERE e.id IN [$sourceId, $targetId]')) {
      return [
        { get: (k: string) => (k === 'id' ? params.sourceId : null) },
        { get: (k: string) => (k === 'id' ? params.targetId : null) },
      ];
    }
    return [];
  }),
}));

const mockDeleteEmbedding = jest.fn().mockResolvedValue(undefined);
jest.mock('../services/elementSimilarity.service', () => ({
  deleteEmbedding: (...args: unknown[]) => mockDeleteEmbedding(...args),
}));

const mockCreateAuditEntry = jest.fn().mockResolvedValue(undefined);
jest.mock('../middleware/audit.middleware', () => ({
  createAuditEntry: (...args: unknown[]) => mockCreateAuditEntry(...args),
}));

import {
  mergeElements,
  applyRedundancyDecisions,
} from '../services/redundancyResolution.service';

const flushMicrotasks = () => new Promise<void>((r) => setImmediate(r));

beforeEach(() => {
  cypherCalls.length = 0;
  mockDeleteEmbedding.mockClear();
  mockCreateAuditEntry.mockClear();
});

// ─── mergeElements ──────────────────────────────────────────────────────────

describe('mergeElements', () => {
  it('rejects when sourceId === targetId', async () => {
    await expect(mergeElements('p1', 'e1', 'e1')).rejects.toThrow('sourceId === targetId');
  });

  it('checks both elements exist in the project before mutating', async () => {
    await mergeElements('p1', 'src', 'tgt');

    const existenceQuery = cypherCalls[0];
    expect(existenceQuery.query).toContain('WHERE e.id IN [$sourceId, $targetId]');
    expect(existenceQuery.params).toEqual(
      expect.objectContaining({ projectId: 'p1', sourceId: 'src', targetId: 'tgt' }),
    );
  });

  it('runs the full merge sequence: existence → outgoing → incoming → delete', async () => {
    await mergeElements('p1', 'src', 'tgt');

    // The exact call count depends on whether there are relationships to
    // transfer (0 in this mock), but the deterministic 3 always run:
    //   1. existence check
    //   2. outgoing scan
    //   3. incoming scan
    //   4. detach delete
    const queries = cypherCalls.map((c) => c.query);
    expect(queries.some((q) => q.includes('WHERE e.id IN [$sourceId, $targetId]'))).toBe(true);
    expect(queries.some((q) => q.includes('-[r:CONNECTS_TO]->(other:ArchitectureElement)'))).toBe(true);
    expect(queries.some((q) => q.includes('(other:ArchitectureElement)-[r:CONNECTS_TO]->(s:ArchitectureElement'))).toBe(true);
    expect(queries.some((q) => q.includes('DETACH DELETE s'))).toBe(true);
  });

  it('fires deleteEmbedding after delete (fire-and-forget)', async () => {
    await mergeElements('p1', 'src', 'tgt');
    await flushMicrotasks();

    expect(mockDeleteEmbedding).toHaveBeenCalledWith('p1', 'src');
  });

  it('does not abort if deleteEmbedding rejects (fire-and-forget safety)', async () => {
    mockDeleteEmbedding.mockRejectedValueOnce(new Error('qdrant down'));

    // Should not throw
    await expect(mergeElements('p1', 'src', 'tgt')).resolves.toBeUndefined();
  });
});

// ─── applyRedundancyDecisions ──────────────────────────────────────────────

describe('applyRedundancyDecisions', () => {
  it('returns zeroes for empty decision list', async () => {
    const result = await applyRedundancyDecisions('p1', []);
    expect(result).toEqual({
      resolved: 0, merged: 0, kept: 0, skipped: 0, errors: [],
    });
  });

  it('counts skip without running any merge', async () => {
    const result = await applyRedundancyDecisions('p1', [
      { aId: 'a', bId: 'b', action: 'skip' },
    ]);
    expect(result.skipped).toBe(1);
    expect(result.resolved).toBe(0);
    expect(result.merged).toBe(0);
    // No cypher beyond zero — skip is pure metadata
    expect(cypherCalls).toHaveLength(0);
  });

  it('counts keep-both as resolved but not merged', async () => {
    const result = await applyRedundancyDecisions('p1', [
      { aId: 'a', bId: 'b', action: 'keep-both' },
    ]);
    expect(result.kept).toBe(1);
    expect(result.resolved).toBe(1);
    expect(result.merged).toBe(0);
    expect(cypherCalls).toHaveLength(0);
  });

  it('merge-into-a uses bId as source, aId as target', async () => {
    await applyRedundancyDecisions('p1', [
      { aId: 'KEEPER', bId: 'DROPPED', action: 'merge-into-a' },
    ]);

    const existenceCall = cypherCalls.find((c) =>
      c.query.includes('WHERE e.id IN [$sourceId, $targetId]'),
    );
    expect(existenceCall?.params.sourceId).toBe('DROPPED');
    expect(existenceCall?.params.targetId).toBe('KEEPER');
  });

  it('merge-into-b uses aId as source, bId as target', async () => {
    await applyRedundancyDecisions('p1', [
      { aId: 'DROPPED', bId: 'KEEPER', action: 'merge-into-b' },
    ]);

    const existenceCall = cypherCalls.find((c) =>
      c.query.includes('WHERE e.id IN [$sourceId, $targetId]'),
    );
    expect(existenceCall?.params.sourceId).toBe('DROPPED');
    expect(existenceCall?.params.targetId).toBe('KEEPER');
  });

  it('one error does not block remaining decisions', async () => {
    // First decision will fail (mock returns no rows → not in project)
    const { runCypher } = jest.requireMock('../config/neo4j');
    runCypher.mockImplementationOnce(async (query: string, params: Record<string, unknown>) => {
      cypherCalls.push({ query, params });
      // Existence-check returns ONLY target, not source → throws "not in project"
      if (query.includes('WHERE e.id IN [$sourceId, $targetId]')) {
        return [{ get: (k: string) => (k === 'id' ? params.targetId : null) }];
      }
      return [];
    });

    const result = await applyRedundancyDecisions('p1', [
      { aId: 'a1', bId: 'b1', action: 'merge-into-a' },
      { aId: 'a2', bId: 'b2', action: 'skip' },
    ]);

    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].aId).toBe('a1');
    expect(result.errors[0].reason).toContain('not in project');
    expect(result.skipped).toBe(1); // second decision still ran
  });

  it('mixed batch returns correct breakdown', async () => {
    const result = await applyRedundancyDecisions('p1', [
      { aId: 'a1', bId: 'b1', action: 'merge-into-a' },
      { aId: 'a2', bId: 'b2', action: 'merge-into-b' },
      { aId: 'a3', bId: 'b3', action: 'keep-both' },
      { aId: 'a4', bId: 'b4', action: 'skip' },
    ]);

    expect(result.merged).toBe(2);
    expect(result.kept).toBe(1);
    expect(result.skipped).toBe(1);
    expect(result.resolved).toBe(3); // merge + keep, not skip
    expect(result.errors).toHaveLength(0);
  });
});

// ─── REQ-RED-005 — Audit writes ─────────────────────────────────────────────

describe('applyRedundancyDecisions — audit (REQ-RED-005)', () => {
  const auditCtx = { userId: 'user-1', ip: '127.0.0.1', userAgent: 'jest' };

  it('writes redundancy_resolved audit per successful merge', async () => {
    await applyRedundancyDecisions(
      'p1',
      [{ aId: 'a1', bId: 'b1', action: 'merge-into-a' }],
      auditCtx,
    );

    expect(mockCreateAuditEntry).toHaveBeenCalledTimes(1);
    const call = mockCreateAuditEntry.mock.calls[0][0];
    expect(call.action).toBe('redundancy_resolved');
    expect(call.entityType).toBe('redundancy_pair');
    expect(call.entityId).toBe('a1|b1');
    expect(call.projectId).toBe('p1');
    expect(call.userId).toBe('user-1');
    expect(call.riskLevel).toBe('medium');
    expect(call.after).toMatchObject({
      aId: 'a1', bId: 'b1', action: 'merge-into-a', sourceId: 'b1', targetId: 'a1',
    });
  });

  it('writes redundancy_kept audit for keep-both decisions', async () => {
    await applyRedundancyDecisions(
      'p1',
      [{ aId: 'a1', bId: 'b1', action: 'keep-both' }],
      auditCtx,
    );

    expect(mockCreateAuditEntry).toHaveBeenCalledTimes(1);
    const call = mockCreateAuditEntry.mock.calls[0][0];
    expect(call.action).toBe('redundancy_kept');
    expect(call.riskLevel).toBe('low');
  });

  it('writes NO audit for skip decisions (pure metadata, no state change)', async () => {
    await applyRedundancyDecisions(
      'p1',
      [{ aId: 'a1', bId: 'b1', action: 'skip' }],
      auditCtx,
    );
    expect(mockCreateAuditEntry).not.toHaveBeenCalled();
  });

  it('writes NO audit when auditContext is omitted (backwards-compat)', async () => {
    await applyRedundancyDecisions('p1', [
      { aId: 'a1', bId: 'b1', action: 'merge-into-a' },
    ]);
    expect(mockCreateAuditEntry).not.toHaveBeenCalled();
  });

  it('audit failure does not abort the merge or block other decisions', async () => {
    mockCreateAuditEntry.mockRejectedValueOnce(new Error('mongo down'));

    const result = await applyRedundancyDecisions(
      'p1',
      [
        { aId: 'a1', bId: 'b1', action: 'merge-into-a' },
        { aId: 'a2', bId: 'b2', action: 'keep-both' },
      ],
      auditCtx,
    );

    // First merge still counted as merged despite audit failure
    expect(result.merged).toBe(1);
    expect(result.kept).toBe(1);
    expect(result.errors).toHaveLength(0); // audit failure isn't a user-facing error
  });
});
