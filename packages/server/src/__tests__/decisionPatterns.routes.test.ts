/**
 * REQ-CHOICE-001 — Decision Pattern Library Supertest
 *
 * Covers /api/decision-patterns endpoints:
 *   1. GET / returns full list
 *   2. GET /?category=security filters by category
 *   3. GET /?lifecycleStatus=approved filters by lifecycle
 *   4. GET /?category=invalid is ignored (not filtered)
 *   5. GET /:slug returns single pattern
 *   6. GET /:slug returns 404 when missing
 *   7. POST /:slug/adopt creates adoption + writes audit
 *   8. POST /:slug/adopt rejects unknown slug -> 404
 *   9. POST /:slug/adopt requires projectId -> 400
 *  10. POST /:slug/adopt blocks retiring patterns -> 409
 *  11. GET /:slug/stats returns aggregated counts
 *
 * Run: cd packages/server && npx jest src/__tests__/decisionPatterns.routes.test.ts --forceExit
 */

import express from 'express';
import request from 'supertest';

jest.mock('../middleware/auth.middleware', () => ({
  authenticate: (req: any, _res: unknown, next: () => void) => {
    req.user = { _id: 'user-test-id' };
    next();
  },
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

const mockCreate = jest.fn();
const mockCountDocuments = jest.fn();
const mockDistinct = jest.fn();
jest.mock('../models/PatternAdoption', () => ({
  PatternAdoptionModel: {
    create: (...args: unknown[]) => mockCreate(...args),
    countDocuments: (...args: unknown[]) => mockCountDocuments(...args),
    distinct: (...args: unknown[]) => mockDistinct(...args),
  },
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const decisionPatternsRouter = require('../routes/decisionPatterns.routes').default;

const app = express();
app.use(express.json());
app.use('/api/decision-patterns', decisionPatternsRouter);

const sampleList = [
  {
    _id: 'p1',
    slug: 'managed-message-queue',
    name: 'Managed Message Queue',
    category: 'messaging',
    lifecycleStatus: 'approved',
  },
  {
    _id: 'p2',
    slug: 'managed-oauth-provider',
    name: 'Managed OAuth/OIDC Provider',
    category: 'security',
    lifecycleStatus: 'approved',
  },
];

const buildFindChain = (returnValue: unknown) => ({
  sort: jest.fn().mockReturnThis(),
  lean: jest.fn().mockResolvedValue(returnValue),
});

const buildFindOneChain = (returnValue: unknown) => ({
  lean: jest.fn().mockResolvedValue(returnValue),
});

describe('REQ-CHOICE-001 GET /api/decision-patterns', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('1. returns full pattern list', async () => {
    mockFind.mockReturnValue(buildFindChain(sampleList));
    const res = await request(app).get('/api/decision-patterns');
    expect(res.status).toBe(200);
    expect(res.body.patterns).toHaveLength(2);
    expect(mockFind).toHaveBeenCalledWith({});
  });

  it('2. filters by category=security', async () => {
    mockFind.mockReturnValue(buildFindChain([sampleList[1]]));
    const res = await request(app).get('/api/decision-patterns?category=security');
    expect(res.status).toBe(200);
    expect(mockFind).toHaveBeenCalledWith({ category: 'security' });
  });

  it('3. filters by lifecycleStatus=approved', async () => {
    mockFind.mockReturnValue(buildFindChain(sampleList));
    const res = await request(app).get('/api/decision-patterns?lifecycleStatus=approved');
    expect(res.status).toBe(200);
    expect(mockFind).toHaveBeenCalledWith({ lifecycleStatus: 'approved' });
  });

  it('4. ignores invalid category', async () => {
    mockFind.mockReturnValue(buildFindChain(sampleList));
    const res = await request(app).get('/api/decision-patterns?category=bogus');
    expect(res.status).toBe(200);
    expect(mockFind).toHaveBeenCalledWith({});
  });
});

describe('REQ-CHOICE-001 GET /api/decision-patterns/:slug', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('5. returns single pattern', async () => {
    mockFindOne.mockReturnValue(buildFindOneChain(sampleList[0]));
    const res = await request(app).get('/api/decision-patterns/managed-message-queue');
    expect(res.status).toBe(200);
    expect(res.body.slug).toBe('managed-message-queue');
  });

  it('6. returns 404 when slug missing', async () => {
    mockFindOne.mockReturnValue(buildFindOneChain(null));
    const res = await request(app).get('/api/decision-patterns/does-not-exist');
    expect(res.status).toBe(404);
  });
});

describe('REQ-CHOICE-001.4 POST /api/decision-patterns/:slug/adopt', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('7. creates adoption + writes audit', async () => {
    mockFindOne.mockResolvedValue({
      _id: 'p1',
      slug: 'managed-message-queue',
      version: '1.0.0',
      lifecycleStatus: 'approved',
    });
    mockCreate.mockResolvedValue({ _id: 'a1' });
    const res = await request(app)
      .post('/api/decision-patterns/managed-message-queue/adopt')
      .send({ projectId: 'proj-123' });
    expect(res.status).toBe(201);
    expect(res.body.adoptionId).toBe('a1');
    expect(mockCreate).toHaveBeenCalledWith({
      patternId: 'p1',
      projectId: 'proj-123',
      userId: 'user-test-id',
      version: '1.0.0',
    });
    // Audit is fire-and-forget, but our mock resolves so should still get called
    expect(mockAudit).toHaveBeenCalled();
    const auditCall = mockAudit.mock.calls[0][0];
    expect(auditCall.action).toBe('pattern_adopted');
    expect(auditCall.entityId).toBe('managed-message-queue');
  });

  it('8. returns 404 when slug unknown', async () => {
    mockFindOne.mockResolvedValue(null);
    const res = await request(app)
      .post('/api/decision-patterns/unknown/adopt')
      .send({ projectId: 'proj-123' });
    expect(res.status).toBe(404);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('9. returns 400 when projectId missing', async () => {
    const res = await request(app).post('/api/decision-patterns/managed-message-queue/adopt').send({});
    expect(res.status).toBe(400);
  });

  it('10. returns 409 for retiring patterns', async () => {
    mockFindOne.mockResolvedValue({
      _id: 'p1',
      slug: 'managed-message-queue',
      version: '1.0.0',
      lifecycleStatus: 'retiring',
    });
    const res = await request(app)
      .post('/api/decision-patterns/managed-message-queue/adopt')
      .send({ projectId: 'proj-123' });
    expect(res.status).toBe(409);
    expect(mockCreate).not.toHaveBeenCalled();
  });
});

describe('REQ-CHOICE-007 GET /api/decision-patterns/:slug/stats', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('11. returns aggregated counts', async () => {
    mockFindOne.mockResolvedValue({ _id: 'p1', slug: 'managed-message-queue', version: '1.0.0' });
    mockCountDocuments.mockResolvedValueOnce(42).mockResolvedValueOnce(7);
    mockDistinct.mockResolvedValue(['proj-1', 'proj-2', 'proj-3']);
    const res = await request(app).get('/api/decision-patterns/managed-message-queue/stats');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      totalUses: 42,
      last30Days: 7,
      uniqueProjects: 3,
    });
  });
});
