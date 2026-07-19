/**
 * POST /:projectId/heal-connections (mode:'apply') — node-stamp with contextTraceId
 * (THE-423 Task 9, Step 2: connection).
 *
 * `suggestConnectionsForIsolatedElements` now stamps each returned `Suggestion`
 * with the `contextTraceId` of the RAG read that informed it (see
 * connectionSuggestion.contextTrace.test.ts). This route applies suggestions
 * in the SAME handler that computed them (no client round-trip), so the id
 * can ride straight onto the created `CONNECTS_TO` edge. This suite mocks
 * `suggestConnectionsForIsolatedElements` + `runCypher` (mirrors
 * architecture.routes.the-370-connection-scope.test.ts) and asserts the write
 * Cypher's `rows` param carries `contextTraceId`, and is `null` when the
 * suggestion has none (RAG unconfigured/failed for that element).
 *
 * Run: cd packages/server && npx jest src/__tests__/architecture.routes.heal-connections.contextTrace.test.ts --forceExit
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
  provenanceInlineFragment: () => '',
  provenanceCypherFragment: () => "r.provenance = 'test'",
  provenanceCoreFragment: () => "r.provenance = 'test'",
  provenanceParams: () => ({}),
  provenanceForActor: () => 'test',
}));

jest.mock('../services/elementSimilarity.service', () => ({
  findRedundancies: jest.fn(),
  findSimilarElements: jest.fn(),
  upsertEmbedding: jest.fn().mockResolvedValue(undefined),
  deleteEmbedding: jest.fn().mockResolvedValue(undefined),
}));

const mockSuggest = jest.fn();
jest.mock('../services/connectionSuggestion.service', () => ({
  suggestConnectionsForIsolatedElements: (...args: unknown[]) => mockSuggest(...args),
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const architectureRouter = require('../routes/architecture.routes').default;

const app = express();
app.use(express.json());
app.use('/api/projects', architectureRouter);

const PROJECT_ID = 'project-A';

beforeEach(() => {
  mockRunCypher.mockReset();
  mockSuggest.mockReset();
});

function healReport(perElement: Record<string, unknown[]>) {
  return {
    elementsAnalyzed: 2,
    isolatedCount: 2,
    suggestionsTotal: Object.values(perElement).flat().length,
    perElement: new Map(Object.entries(perElement)),
    ragContextUsed: true,
    llmCallsMade: 2,
    invalidRelationshipDrops: 0,
  };
}

describe('POST /:projectId/heal-connections (apply) — contextTraceId node-stamp', () => {
  it('stamps r.contextTraceId onto the created edge from the suggestion', async () => {
    mockSuggest.mockResolvedValue(healReport({
      s1: [{
        sourceId: 's1', sourceName: 'CFO', sourceType: 'stakeholder',
        targetId: 'd1', targetName: 'CSRD', targetType: 'driver',
        relationshipType: 'influence', confidence: 0.9, reasoning: 'r',
        direction: 'outgoing', contextTraceId: 'trace-abc-123',
      }],
    }));
    // elements/connections load queries (2 calls before apply write) → [];
    // then existence-check UNWIND → [] (nothing exists yet); then the write UNWIND-MERGE.
    mockRunCypher
      .mockResolvedValueOnce([]) // elements
      .mockResolvedValueOnce([]) // connections
      .mockResolvedValueOnce([]) // existence check
      .mockResolvedValueOnce([{ get: (k: string) => ({ id: 'conn-1', sourceId: 's1', targetId: 'd1', type: 'influence' }[k]) }]); // write

    const res = await request(app)
      .post(`/api/projects/${PROJECT_ID}/heal-connections`)
      .send({ mode: 'apply' });

    expect(res.status).toBe(201);
    expect(res.body.data.appliedCount).toBe(1);

    // 4th call = the write UNWIND-MERGE.
    const [query, params] = mockRunCypher.mock.calls[3] as [string, { rows: Array<{ contextTraceId: string | null }> }];
    expect(query).toContain('r.contextTraceId = row.contextTraceId');
    expect(params.rows).toHaveLength(1);
    expect(params.rows[0].contextTraceId).toBe('trace-abc-123');
  });

  it('stamps null when the suggestion carries no contextTraceId (RAG unconfigured for that element)', async () => {
    mockSuggest.mockResolvedValue(healReport({
      s1: [{
        sourceId: 's1', sourceName: 'CFO', sourceType: 'stakeholder',
        targetId: 'd1', targetName: 'CSRD', targetType: 'driver',
        relationshipType: 'influence', confidence: 0.9, reasoning: 'r',
        direction: 'outgoing', // contextTraceId intentionally absent
      }],
    }));
    mockRunCypher
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ get: (k: string) => ({ id: 'conn-1', sourceId: 's1', targetId: 'd1', type: 'influence' }[k]) }]);

    const res = await request(app)
      .post(`/api/projects/${PROJECT_ID}/heal-connections`)
      .send({ mode: 'apply' });

    expect(res.status).toBe(201);
    const [, params] = mockRunCypher.mock.calls[3] as [string, { rows: Array<{ contextTraceId: string | null }> }];
    expect(params.rows[0].contextTraceId).toBeNull();
  });
});
