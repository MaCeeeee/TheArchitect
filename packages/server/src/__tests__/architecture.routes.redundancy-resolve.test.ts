/**
 * REQ-RED-004 — Bulk-Merge endpoint Supertest
 *
 * Covers POST /api/projects/:projectId/redundancies/resolve
 *
 * Scenarios:
 *   1. merge-into-a: applyRedundancyDecisions called, response counts back
 *   2. merge-into-b: same path with swapped source/target
 *   3. keep-both: counted as 'kept', no merge attempted
 *   4. skip: counted as 'skipped', no merge attempted
 *   5. Mixed batch (one of each): correct count breakdown
 *   6. Per-pair error doesn't block remaining decisions
 *   7. Validation: empty decisions array → 400
 *   8. Validation: invalid action → 400
 *   9. Service throws unexpected error → 500
 *
 * Run: cd packages/server && npx jest src/__tests__/architecture.routes.redundancy-resolve.test.ts --forceExit
 */

import express from 'express';
import request from 'supertest';

jest.mock('../middleware/auth.middleware', () => ({
  authenticate: (_req: unknown, _res: unknown, next: () => void) => next(),
}));
jest.mock('../middleware/rbac.middleware', () => ({
  requirePermission: () => (_req: unknown, _res: unknown, next: () => void) => next(),
}));
jest.mock('../middleware/projectAccess.middleware', () => ({
  requireProjectAccess: () => (_req: unknown, _res: unknown, next: () => void) => next(),
}));
jest.mock('../middleware/audit.middleware', () => ({
  audit: () => (_req: unknown, _res: unknown, next: () => void) => next(),
}));
jest.mock('../middleware/rateLimit.middleware', () => ({
  rateLimit: () => (_req: unknown, _res: unknown, next: () => void) => next(),
}));

jest.mock('../config/neo4j', () => ({
  runCypher: jest.fn().mockResolvedValue([]),
  serializeNeo4jProperties: (p: Record<string, unknown>) => p,
}));

const mockCountDocuments = jest.fn();
const mockFindOne = jest.fn();
jest.mock('../models/AuditLog', () => ({
  AuditLog: {
    countDocuments: (...args: unknown[]) => mockCountDocuments(...args),
    findOne: (...args: unknown[]) => mockFindOne(...args),
  },
}));

jest.mock('../services/elementSimilarity.service', () => ({
  findRedundancies: jest.fn(),
  findSimilarElements: jest.fn(),
  upsertEmbedding: jest.fn().mockResolvedValue(undefined),
  deleteEmbedding: jest.fn().mockResolvedValue(undefined),
}));

const mockApplyDecisions = jest.fn();
jest.mock('../services/redundancyResolution.service', () => ({
  applyRedundancyDecisions: (...args: unknown[]) => mockApplyDecisions(...args),
}));

jest.mock('../services/policy-evaluation.service', () => ({
  evaluateElementPolicies: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../services/connectionSuggestion.service', () => ({
  suggestConnectionsForIsolatedElements: jest.fn().mockResolvedValue({ created: 0 }),
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const architectureRouter = require('../routes/architecture.routes').default;

const app = express();
app.use(express.json());
app.use('/api/projects', architectureRouter);

const PROJECT_ID = 'project-test-id';
const URL = `/api/projects/${PROJECT_ID}/redundancies/resolve`;

beforeEach(() => {
  mockApplyDecisions.mockReset();
  mockApplyDecisions.mockResolvedValue({
    resolved: 0, merged: 0, kept: 0, skipped: 0, errors: [],
  });
});

describe('POST /:projectId/redundancies/resolve (REQ-RED-004)', () => {
  it('1. merge-into-a forwards decision to service', async () => {
    mockApplyDecisions.mockResolvedValueOnce({
      resolved: 1, merged: 1, kept: 0, skipped: 0, errors: [],
    });

    const res = await request(app).post(URL).send({
      decisions: [{ aId: 'a1', bId: 'b1', action: 'merge-into-a' }],
    });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.merged).toBe(1);
    // 3rd arg is auditContext (undefined here because the auth middleware
    // is mocked without setting req.user — REQ-RED-005)
    expect(mockApplyDecisions).toHaveBeenCalledWith(
      PROJECT_ID,
      [{ aId: 'a1', bId: 'b1', action: 'merge-into-a' }],
      undefined,
    );
  });

  it('2. merge-into-b also passes through', async () => {
    mockApplyDecisions.mockResolvedValueOnce({
      resolved: 1, merged: 1, kept: 0, skipped: 0, errors: [],
    });

    const res = await request(app).post(URL).send({
      decisions: [{ aId: 'a1', bId: 'b1', action: 'merge-into-b' }],
    });

    expect(res.status).toBe(200);
    expect(res.body.data.merged).toBe(1);
  });

  it('3. keep-both counts as kept (no merge)', async () => {
    mockApplyDecisions.mockResolvedValueOnce({
      resolved: 1, merged: 0, kept: 1, skipped: 0, errors: [],
    });

    const res = await request(app).post(URL).send({
      decisions: [{ aId: 'a1', bId: 'b1', action: 'keep-both' }],
    });

    expect(res.status).toBe(200);
    expect(res.body.data.kept).toBe(1);
    expect(res.body.data.merged).toBe(0);
  });

  it('4. skip counts as skipped (no merge)', async () => {
    mockApplyDecisions.mockResolvedValueOnce({
      resolved: 0, merged: 0, kept: 0, skipped: 1, errors: [],
    });

    const res = await request(app).post(URL).send({
      decisions: [{ aId: 'a1', bId: 'b1', action: 'skip' }],
    });

    expect(res.status).toBe(200);
    expect(res.body.data.skipped).toBe(1);
    expect(res.body.data.resolved).toBe(0);
  });

  it('5. mixed batch returns correct count breakdown', async () => {
    mockApplyDecisions.mockResolvedValueOnce({
      resolved: 3, merged: 2, kept: 1, skipped: 1, errors: [],
    });

    const res = await request(app).post(URL).send({
      decisions: [
        { aId: 'a1', bId: 'b1', action: 'merge-into-a' },
        { aId: 'a2', bId: 'b2', action: 'merge-into-b' },
        { aId: 'a3', bId: 'b3', action: 'keep-both' },
        { aId: 'a4', bId: 'b4', action: 'skip' },
      ],
    });

    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({
      resolved: 3, merged: 2, kept: 1, skipped: 1,
    });
  });

  it('6. per-pair error appears in errors[] without breaking the batch', async () => {
    mockApplyDecisions.mockResolvedValueOnce({
      resolved: 1, merged: 1, kept: 0, skipped: 0,
      errors: [{ aId: 'a2', bId: 'b2', reason: 'source not in project' }],
    });

    const res = await request(app).post(URL).send({
      decisions: [
        { aId: 'a1', bId: 'b1', action: 'merge-into-a' },
        { aId: 'a2', bId: 'b2', action: 'merge-into-a' },
      ],
    });

    expect(res.status).toBe(200);
    expect(res.body.data.merged).toBe(1);
    expect(res.body.data.errors).toHaveLength(1);
    expect(res.body.data.errors[0].reason).toContain('not in project');
  });

  it('7. empty decisions array returns 400', async () => {
    const res = await request(app).post(URL).send({ decisions: [] });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Validation failed');
  });

  it('8. invalid action returns 400', async () => {
    const res = await request(app).post(URL).send({
      decisions: [{ aId: 'a', bId: 'b', action: 'merge' }],
    });
    expect(res.status).toBe(400);
  });

  it('9. service throws unexpected error → 500', async () => {
    mockApplyDecisions.mockRejectedValueOnce(new Error('database connection lost'));

    const res = await request(app).post(URL).send({
      decisions: [{ aId: 'a', bId: 'b', action: 'merge-into-a' }],
    });

    expect(res.status).toBe(500);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toBe('Failed to resolve redundancies');
  });

  it('caps decision batch at 50 (validation)', async () => {
    const tooMany = Array.from({ length: 51 }, (_, i) => ({
      aId: `a${i}`, bId: `b${i}`, action: 'skip' as const,
    }));
    const res = await request(app).post(URL).send({ decisions: tooMany });
    expect(res.status).toBe(400);
  });
});

// ─── REQ-RED-005 — Stats endpoint ──────────────────────────────────────────

describe('GET /:projectId/stats/redundancies (REQ-RED-005)', () => {
  const STATS_URL = `/api/projects/${PROJECT_ID}/stats/redundancies`;

  beforeEach(() => {
    mockCountDocuments.mockReset();
    mockFindOne.mockReset();
  });

  it('aggregates resolved + kept counters from the audit log', async () => {
    mockCountDocuments
      .mockResolvedValueOnce(7) // resolved
      .mockResolvedValueOnce(3); // kept
    // findOne().sort().select().lean() chain
    const chain = {
      sort: () => chain,
      select: () => chain,
      lean: () => Promise.resolve({
        timestamp: new Date('2026-05-16T15:00:00Z'),
        userId: 'user-1',
        after: { aId: 'a1', bId: 'b1' },
      }),
    };
    mockFindOne.mockReturnValue(chain);

    const res = await request(app).get(STATS_URL);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toMatchObject({
      totalResolved: 7,
      totalKept: 3,
      lastResolvedBy: 'user-1',
    });
    expect(res.body.data.lastResolvedPair).toEqual({ aId: 'a1', bId: 'b1' });
    expect(res.body.data.lastResolvedAt).toBeTruthy();
  });

  it('returns nulls when no resolved redundancies yet', async () => {
    mockCountDocuments.mockResolvedValueOnce(0).mockResolvedValueOnce(0);
    const chain = {
      sort: () => chain,
      select: () => chain,
      lean: () => Promise.resolve(null),
    };
    mockFindOne.mockReturnValue(chain);

    const res = await request(app).get(STATS_URL);

    expect(res.status).toBe(200);
    expect(res.body.data.totalResolved).toBe(0);
    expect(res.body.data.lastResolvedAt).toBeNull();
    expect(res.body.data.lastResolvedPair).toBeNull();
  });

  it('500 on DB failure', async () => {
    mockCountDocuments.mockRejectedValue(new Error('mongo dead'));
    // findOne must also be set so Promise.all doesn't hang on undefined
    const chain = {
      sort: () => chain,
      select: () => chain,
      lean: () => Promise.resolve(null),
    };
    mockFindOne.mockReturnValue(chain);

    const res = await request(app).get(STATS_URL);
    expect(res.status).toBe(500);
    expect(res.body.success).toBe(false);
  });
});
