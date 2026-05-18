/**
 * REQ-CHOICE-001.3 + REQ-CHOICE-007 — Lifecycle / Endorsement / Stats-All Supertests
 *
 * Covers the routes added for UC-CHOICE-007:
 *   1. PATCH /:slug/lifecycle (chief_architect only) — deprecate + successor
 *   2. PATCH /:slug/lifecycle — invalid lifecycleStatus -> 400
 *   3. PATCH /:slug/lifecycle — unknown successorSlug -> 400
 *   4. PATCH /:slug/lifecycle — self-succession -> 400
 *   5. POST /:slug/endorse — happy path
 *   6. POST /:slug/endorse — reason < 30 chars -> 400
 *   7. POST /:slug/endorse — duplicate (dup key) -> 409
 *   8. DELETE /:slug/endorse — happy path
 *   9. DELETE /:slug/endorse — no existing endorsement -> 404
 *  10. GET /stats-all — returns enriched array with badges + endorsements
 *  11. GET /stats-all — empty pattern list returns []
 *
 * Run: cd packages/server && npx jest src/__tests__/decisionPatterns.lifecycle.test.ts --forceExit
 */

import express from 'express';
import request from 'supertest';

jest.mock('../middleware/auth.middleware', () => ({
  authenticate: (req: any, _res: unknown, next: () => void) => {
    req.user = { _id: 'user-test-id', role: 'chief_architect' };
    next();
  },
}));

jest.mock('../middleware/rbac.middleware', () => ({
  requireRole: () => (_req: unknown, _res: unknown, next: () => void) => next(),
}));

const mockAudit = jest.fn().mockResolvedValue(undefined);
jest.mock('../middleware/audit.middleware', () => ({
  createAuditEntry: (...args: unknown[]) => mockAudit(...args),
  audit: () => (_req: unknown, _res: unknown, next: () => void) => next(),
}));

const mockFind = jest.fn();
const mockFindOne = jest.fn();
jest.mock('../models/DecisionPattern', () => ({
  DecisionPatternModel: {
    find: (...args: unknown[]) => mockFind(...args),
    findOne: (...args: unknown[]) => mockFindOne(...args),
  },
}));

const mockAdoptionAggregate = jest.fn().mockResolvedValue([]);
const mockAdoptionCountDocuments = jest.fn();
const mockAdoptionDistinct = jest.fn();
jest.mock('../models/PatternAdoption', () => ({
  PatternAdoptionModel: {
    aggregate: (...args: unknown[]) => mockAdoptionAggregate(...args),
    countDocuments: (...args: unknown[]) => mockAdoptionCountDocuments(...args),
    distinct: (...args: unknown[]) => mockAdoptionDistinct(...args),
    create: jest.fn(),
  },
}));

const mockEndorsementCreate = jest.fn();
const mockEndorsementDeleteOne = jest.fn();
const mockEndorsementAggregate = jest.fn().mockResolvedValue([]);
jest.mock('../models/PatternEndorsement', () => ({
  PatternEndorsementModel: {
    create: (...args: unknown[]) => mockEndorsementCreate(...args),
    deleteOne: (...args: unknown[]) => mockEndorsementDeleteOne(...args),
    aggregate: (...args: unknown[]) => mockEndorsementAggregate(...args),
  },
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const decisionPatternsRouter = require('../routes/decisionPatterns.routes').default;

const app = express();
app.use(express.json());
app.use('/api/decision-patterns', decisionPatternsRouter);

const buildFindChain = (returnValue: unknown) => ({
  sort: jest.fn().mockReturnThis(),
  lean: jest.fn().mockResolvedValue(returnValue),
});

const validReason =
  'This pattern provides excellent NIS2 compliance for our supplier onboarding workflows.';

describe('REQ-CHOICE-001.3 PATCH /api/decision-patterns/:slug/lifecycle', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('1. deprecates pattern with successor', async () => {
    const patternSave = jest.fn().mockResolvedValue(undefined);
    const pattern: any = {
      _id: 'p1',
      slug: 'managed-oauth-provider',
      lifecycleStatus: 'approved',
      deprecatedAt: null,
      successorId: null,
      save: patternSave,
    };
    const successor = { _id: 'p2', slug: 'managed-oauth-provider-v2' };
    mockFindOne
      .mockResolvedValueOnce(pattern) // initial find
      .mockResolvedValueOnce(successor); // successor lookup
    const res = await request(app)
      .patch('/api/decision-patterns/managed-oauth-provider/lifecycle')
      .send({
        lifecycleStatus: 'retiring',
        successorSlug: 'managed-oauth-provider-v2',
        reason: 'NIS2 hardening requires PKCE',
      });
    expect(res.status).toBe(200);
    expect(pattern.lifecycleStatus).toBe('retiring');
    expect(pattern.deprecatedAt).toBeInstanceOf(Date);
    expect(pattern.successorId).toBe('p2');
    expect(patternSave).toHaveBeenCalled();
    expect(mockAudit).toHaveBeenCalled();
    const auditCall = mockAudit.mock.calls[0][0];
    expect(auditCall.action).toBe('pattern_lifecycle_changed');
    expect(auditCall.riskLevel).toBe('medium');
  });

  it('2. returns 400 for invalid lifecycleStatus', async () => {
    const res = await request(app)
      .patch('/api/decision-patterns/managed-oauth-provider/lifecycle')
      .send({ lifecycleStatus: 'bogus' });
    expect(res.status).toBe(400);
    expect(mockFindOne).not.toHaveBeenCalled();
  });

  it('3. returns 400 when successor slug unknown', async () => {
    const pattern: any = {
      _id: 'p1',
      slug: 'managed-oauth-provider',
      lifecycleStatus: 'approved',
      deprecatedAt: null,
      successorId: null,
      save: jest.fn(),
    };
    mockFindOne
      .mockResolvedValueOnce(pattern)
      .mockResolvedValueOnce(null);
    const res = await request(app)
      .patch('/api/decision-patterns/managed-oauth-provider/lifecycle')
      .send({ successorSlug: 'does-not-exist' });
    expect(res.status).toBe(400);
  });

  it('4. returns 400 when pattern would succeed itself', async () => {
    const pattern: any = {
      _id: 'p1',
      slug: 'managed-oauth-provider',
      lifecycleStatus: 'approved',
      deprecatedAt: null,
      successorId: null,
      save: jest.fn(),
    };
    const sameAsSelf = { _id: 'p1', slug: 'managed-oauth-provider' };
    mockFindOne
      .mockResolvedValueOnce(pattern)
      .mockResolvedValueOnce(sameAsSelf);
    const res = await request(app)
      .patch('/api/decision-patterns/managed-oauth-provider/lifecycle')
      .send({ successorSlug: 'managed-oauth-provider' });
    expect(res.status).toBe(400);
  });
});

describe('REQ-CHOICE-007.3 POST/DELETE /api/decision-patterns/:slug/endorse', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('5. creates endorsement with audit', async () => {
    mockFindOne.mockResolvedValueOnce({ _id: 'p1', slug: 'managed-oauth-provider' });
    mockEndorsementCreate.mockResolvedValueOnce({ _id: 'e1' });
    const res = await request(app)
      .post('/api/decision-patterns/managed-oauth-provider/endorse')
      .send({ reason: validReason });
    expect(res.status).toBe(201);
    expect(mockEndorsementCreate).toHaveBeenCalledWith({
      patternId: 'p1',
      userId: 'user-test-id',
      reason: validReason.trim(),
    });
    expect(mockAudit).toHaveBeenCalled();
    expect(mockAudit.mock.calls[0][0].action).toBe('pattern_endorsed');
  });

  it('6. returns 400 when reason < 30 chars', async () => {
    const res = await request(app)
      .post('/api/decision-patterns/managed-oauth-provider/endorse')
      .send({ reason: 'too short' });
    expect(res.status).toBe(400);
    expect(mockEndorsementCreate).not.toHaveBeenCalled();
  });

  it('7. returns 409 on duplicate endorsement', async () => {
    mockFindOne.mockResolvedValueOnce({ _id: 'p1', slug: 'managed-oauth-provider' });
    const dupErr: any = new Error('duplicate key');
    dupErr.code = 11000;
    mockEndorsementCreate.mockRejectedValueOnce(dupErr);
    const res = await request(app)
      .post('/api/decision-patterns/managed-oauth-provider/endorse')
      .send({ reason: validReason });
    expect(res.status).toBe(409);
  });

  it('8. DELETE removes endorsement', async () => {
    mockFindOne.mockResolvedValueOnce({ _id: 'p1', slug: 'managed-oauth-provider' });
    mockEndorsementDeleteOne.mockResolvedValueOnce({ deletedCount: 1 });
    const res = await request(app).delete(
      '/api/decision-patterns/managed-oauth-provider/endorse'
    );
    expect(res.status).toBe(200);
    expect(mockEndorsementDeleteOne).toHaveBeenCalledWith({
      patternId: 'p1',
      userId: 'user-test-id',
    });
  });

  it('9. DELETE returns 404 when no endorsement exists', async () => {
    mockFindOne.mockResolvedValueOnce({ _id: 'p1', slug: 'managed-oauth-provider' });
    mockEndorsementDeleteOne.mockResolvedValueOnce({ deletedCount: 0 });
    const res = await request(app).delete(
      '/api/decision-patterns/managed-oauth-provider/endorse'
    );
    expect(res.status).toBe(404);
  });
});

describe('REQ-CHOICE-007.1 + 007.2 GET /api/decision-patterns/stats-all', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('10. returns enriched patterns with badges + endorsement summary', async () => {
    const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
    const sixtyDaysAgo = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000);
    const patterns = [
      {
        _id: 'p1',
        slug: 'managed-oauth-provider',
        name: 'OAuth Provider',
        category: 'security',
        createdAt: sixtyDaysAgo,
        deprecatedAt: null,
        successorId: null,
      },
      {
        _id: 'p2',
        slug: 'shiny-new-pattern',
        name: 'Shiny New',
        category: 'security',
        createdAt: twoDaysAgo,
        deprecatedAt: null,
        successorId: null,
      },
    ];
    mockFind.mockReturnValue(buildFindChain(patterns));
    mockAdoptionAggregate
      // totalAgg
      .mockResolvedValueOnce([
        { _id: 'p1', count: 100 },
        { _id: 'p2', count: 0 },
      ])
      // last30Agg
      .mockResolvedValueOnce([{ _id: 'p1', count: 10 }])
      // projectsAgg
      .mockResolvedValueOnce([{ _id: 'p1', count: 5 }]);
    mockEndorsementAggregate.mockResolvedValueOnce([
      {
        _id: 'p1',
        count: 2,
        entries: [
          { userId: 'u1', reason: 'NIS2 compliant', timestamp: new Date() },
          { userId: 'user-test-id', reason: 'my endorsement', timestamp: new Date() },
        ],
      },
    ]);

    const res = await request(app).get('/api/decision-patterns/stats-all');
    expect(res.status).toBe(200);
    expect(res.body.patterns).toHaveLength(2);

    const oauth = res.body.patterns.find((p: any) => p.slug === 'managed-oauth-provider');
    expect(oauth.stats.totalUses).toBe(100);
    expect(oauth.stats.last30Days).toBe(10);
    expect(oauth.stats.uniqueProjects).toBe(5);
    expect(oauth.stats.endorsements.count).toBe(2);
    expect(oauth.stats.endorsements.hasMyEndorsement).toBe(true);
    expect(oauth.stats.badges.map((b: any) => b.kind)).toContain('architects-choice');

    const shiny = res.body.patterns.find((p: any) => p.slug === 'shiny-new-pattern');
    expect(shiny.stats.totalUses).toBe(0);
    expect(shiny.stats.isNew).toBe(true);
    expect(shiny.stats.badges.map((b: any) => b.kind)).toContain('new');
  });

  it('11. returns empty array when no patterns exist', async () => {
    mockFind.mockReturnValue(buildFindChain([]));
    const res = await request(app).get('/api/decision-patterns/stats-all');
    expect(res.status).toBe(200);
    expect(res.body.patterns).toEqual([]);
    expect(mockAdoptionAggregate).not.toHaveBeenCalled();
  });
});
