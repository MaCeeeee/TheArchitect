/**
 * THE-370 — Connection creation must be scoped to projectId.
 *
 * Bug: POST /api/projects/:projectId/connections matched source/target
 * ArchitectureElement by `id` ALONE. Element ids are not globally unique
 * (callers reuse short ids like `cap-trust` across projects), so an unscoped
 * MATCH could link into a foreign project or match ambiguously and blow up on
 * the global connection-id constraint.
 *
 * The suite mocks runCypher, so it asserts the *query* and *params* the route
 * builds — locking in that both endpoints carry `projectId: $projectId` and
 * that the projectId comes from the URL param. It also covers the new 404 when
 * neither endpoint exists in the project (MATCH returns no rows).
 *
 * Run: cd packages/server && npx jest src/__tests__/architecture.routes.the-370-connection-scope.test.ts --forceExit
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

const mockRunCypher = jest.fn();
jest.mock('../config/neo4j', () => ({
  runCypher: (...args: unknown[]) => mockRunCypher(...args),
  serializeNeo4jProperties: (p: Record<string, unknown>) => p,
}));

jest.mock('../services/provenance.helper', () => ({
  provenanceCypherFragment: () => "r.provenance = 'test'",
  provenanceParams: () => ({}),
  provenanceForActor: () => 'test',
}));

jest.mock('../services/elementSimilarity.service', () => ({
  findRedundancies: jest.fn(),
  findSimilarElements: jest.fn(),
  upsertEmbedding: jest.fn().mockResolvedValue(undefined),
  deleteEmbedding: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../services/connectionSuggestion.service', () => ({
  suggestConnectionsForIsolatedElements: jest.fn().mockResolvedValue({ created: 0 }),
}));

jest.mock('../services/policy-evaluation.service', () => ({
  evaluateElementPolicies: jest.fn().mockResolvedValue(undefined),
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const architectureRouter = require('../routes/architecture.routes').default;

const app = express();
app.use(express.json());
app.use('/api/projects', architectureRouter);

const PROJECT_ID = 'project-A';

beforeEach(() => {
  mockRunCypher.mockReset();
});

describe('THE-370: POST /:projectId/connections is projectId-scoped', () => {
  it('scopes BOTH endpoints to projectId and passes the URL projectId through', async () => {
    // MATCH found the edge → one row back.
    mockRunCypher.mockResolvedValue([{ get: () => 'conn-1' }]);

    const res = await request(app)
      .post(`/api/projects/${PROJECT_ID}/connections`)
      .send({ sourceId: 'cap-trust', targetId: 'app-erp', type: 'serving' });

    expect(res.status).toBe(201);
    expect(mockRunCypher).toHaveBeenCalledTimes(1);

    const [query, params] = mockRunCypher.mock.calls[0] as [string, Record<string, unknown>];

    // Both endpoints carry the projectId scope — the actual bug fix.
    expect(query).toContain('id: $sourceId, projectId: $projectId');
    expect(query).toContain('id: $targetId, projectId: $projectId');
    // A bare, unscoped endpoint match must NOT survive anywhere in the query.
    expect(query).not.toMatch(/\{id: \$sourceId\}/);
    expect(query).not.toMatch(/\{id: \$targetId\}/);

    // projectId comes from the URL, not the body.
    expect(params.projectId).toBe(PROJECT_ID);
    expect(params.sourceId).toBe('cap-trust');
    expect(params.targetId).toBe('app-erp');
  });

  it('returns 404 when neither endpoint exists in this project (MATCH empty)', async () => {
    // A colliding id lives only in another project → scoped MATCH finds nothing.
    mockRunCypher.mockResolvedValue([]);

    const res = await request(app)
      .post(`/api/projects/${PROJECT_ID}/connections`)
      .send({ sourceId: 'cap-trust', targetId: 'app-erp', type: 'serving' });

    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
  });
});
