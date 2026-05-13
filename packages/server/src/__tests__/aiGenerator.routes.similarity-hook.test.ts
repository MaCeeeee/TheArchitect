/**
 * REQ-SIM-002 Stage 1 — Generator-D Embedding-Hook Supertest
 *
 * The architecture-route hooks (covered in
 * `architecture.routes.similarity-hook.test.ts`) only fire on the public
 * `/api/projects/:projectId/elements` CRUD path. The AI-Generator creates
 * elements through its own service-layer code path
 * (`aiGenerator.routes.ts`) and therefore never triggered the
 * re-embed hook — leaving generator-created elements without vectors.
 *
 * This suite verifies the gap-fix: `upsertEmbedding` must fire once per
 * newly-created element across all four generator entry points
 *   1. apply-activities
 *   2. apply-data-objects
 *   3. apply-processes
 *   4. apply-hierarchy (Gen-C, via the `createElement` helper)
 * and a `upsertEmbedding` rejection must not affect the user response.
 *
 * Run: cd packages/server && npx jest src/__tests__/aiGenerator.routes.similarity-hook.test.ts --forceExit
 */

import express from 'express';
import request from 'supertest';
import mongoose from 'mongoose';

const TEST_USER_ID = new mongoose.Types.ObjectId();
const PROJECT_ID = 'project-test-id';
const PROCESS_ID = 'process-test-id';
const CAPABILITY_ID = 'capability-test-id';

// ─── Stub middleware ────────────────────────────────────────────────────────

jest.mock('../middleware/auth.middleware', () => ({
  authenticate: (req: any, _res: any, next: any) => {
    req.user = { _id: TEST_USER_ID, role: 'admin' };
    next();
  },
}));

jest.mock('../middleware/projectAccess.middleware', () => ({
  requireProjectAccess: () => (_req: any, _res: any, next: any) => next(),
}));

jest.mock('../middleware/rateLimit.middleware', () => ({
  rateLimit: () => (_req: any, _res: any, next: any) => next(),
}));

jest.mock('../middleware/audit.middleware', () => ({
  audit: () => (_req: any, _res: any, next: any) => next(),
  createAuditEntry: jest.fn().mockResolvedValue(undefined),
}));

// ─── Neo4j stub — record CREATE-relevant calls only ─────────────────────────
//
// We simulate: nothing exists yet (so reuse-by-name returns []), CREATE
// succeeds. We do NOT register names in a map (unlike the apply-route
// test) because we want every generator call to take the CREATE path —
// so the embedding hook fires for every element.

jest.mock('../config/neo4j', () => ({
  runCypher: jest.fn(async (query: string, _params: Record<string, unknown>) => {
    if (query.includes('MERGE')) return [{ get: () => 'conn-stub' }];
    // CREATE / MATCH / etc. → empty result; route advances to CREATE branch
    return [];
  }),
}));

// ─── elementSimilarity spy ──────────────────────────────────────────────────

const mockUpsertEmbedding = jest.fn().mockResolvedValue(undefined);
jest.mock('../services/elementSimilarity.service', () => ({
  upsertEmbedding: (...args: unknown[]) => mockUpsertEmbedding(...args),
  findSimilarElements: jest.fn(),
  deleteEmbedding: jest.fn(),
}));

// ─── Mock heavy services we don't exercise ──────────────────────────────────

jest.mock('../services/dataObjectGenerator.service', () => ({
  generateDataObjectsForProcess: jest.fn(),
}));
jest.mock('../services/activityGenerator.service', () => ({
  generateActivitiesForProcess: jest.fn(),
}));
jest.mock('../services/processGenerator.service', () => ({
  generateProcessesForCapability: jest.fn(),
}));
jest.mock('../services/architectureGenerator.service', () => ({
  extractArchitectureFromDocument: jest.fn(),
}));
jest.mock('../services/document-parser.service', () => ({
  extractText: jest.fn(),
  isSupportedDocument: jest.fn(),
  getSupportedFormats: jest.fn(() => []),
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const aiGeneratorRouter = require('../routes/aiGenerator.routes').default;

const app = express();
app.use(express.json());
app.use('/api/ai-generator', aiGeneratorRouter);

const flushMicrotasks = () => new Promise<void>((r) => setImmediate(r));

beforeEach(() => {
  mockUpsertEmbedding.mockClear();
});

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('REQ-SIM-002 Stage 1 — Generator-D upsertEmbedding hook coverage', () => {
  it('apply-activities triggers one upsertEmbedding per activity', async () => {
    const res = await request(app)
      .post(`/api/ai-generator/projects/${PROJECT_ID}/processes/${PROCESS_ID}/apply-activities`)
      .send({
        activities: [
          { name: 'Vorfall melden', owner: 'DPO', action: 'meldet', system: 'BfDI-Portal',
            when: 'innerhalb 72h', output: 'Aktenzeichen', enables: 'Audit-Trail' },
          { name: 'Risiko bewerten', owner: 'Security-Team', action: 'analysiert', system: 'Splunk',
            when: 'taeglich', output: 'Risk-Score', enables: 'Mitigation-Plan' },
        ],
      });

    expect(res.status).toBe(200);
    await flushMicrotasks();

    expect(mockUpsertEmbedding).toHaveBeenCalledTimes(2);
    const calls = mockUpsertEmbedding.mock.calls;
    expect(calls[0][0]).toBe(PROJECT_ID);
    expect(calls[0][1].name).toBe('Vorfall melden');
    expect(calls[0][1].type).toBe('process');
    expect(calls[0][1].layer).toBe('business');
    expect(calls[1][1].name).toBe('Risiko bewerten');
  });

  it('apply-data-objects triggers one upsertEmbedding per data-object', async () => {
    const res = await request(app)
      .post(`/api/ai-generator/projects/${PROJECT_ID}/processes/${PROCESS_ID}/apply-data-objects`)
      .send({
        dataObjects: [
          { name: 'Emissions-Record', description: 'Scope 1/2/3 GHG measurements',
            archimateType: 'data_object', crudOperations: 'CRUD',
            sensitivity: 'internal', dataClass: 'operational' },
          { name: 'Audit-Log Entry', description: 'Compliance audit trail event',
            archimateType: 'data_object', crudOperations: 'CR',
            sensitivity: 'internal', dataClass: 'compliance' },
          { name: 'Customer-Master', description: 'Customer record with PII',
            archimateType: 'data_object', crudOperations: 'R',
            sensitivity: 'restricted', dataClass: 'customer' },
        ],
      });

    expect(res.status).toBe(200);
    await flushMicrotasks();

    expect(mockUpsertEmbedding).toHaveBeenCalledTimes(3);
    const calls = mockUpsertEmbedding.mock.calls;
    expect(calls.every((c) => c[0] === PROJECT_ID)).toBe(true);
    expect(calls.every((c) => c[1].layer === 'information')).toBe(true);
    expect(calls.map((c) => c[1].name)).toEqual([
      'Emissions-Record', 'Audit-Log Entry', 'Customer-Master',
    ]);
  });

  it('apply-processes triggers one upsertEmbedding per process', async () => {
    const res = await request(app)
      .post(`/api/ai-generator/projects/${PROJECT_ID}/capabilities/${CAPABILITY_ID}/apply-processes`)
      .send({
        processes: [
          { name: 'ESG-Reporting', description: 'Quartalsweise CSRD-Compliance-Reports erstellen' },
          { name: 'Supplier-Risk-Assessment', description: 'Lieferanten-Risiken nach LkSG bewerten' },
        ],
      });

    expect(res.status).toBe(200);
    await flushMicrotasks();

    expect(mockUpsertEmbedding).toHaveBeenCalledTimes(2);
    const calls = mockUpsertEmbedding.mock.calls;
    expect(calls.every((c) => c[0] === PROJECT_ID)).toBe(true);
    expect(calls.every((c) => c[1].type === 'business_process')).toBe(true);
    expect(calls.every((c) => c[1].layer === 'business')).toBe(true);
    expect(calls[0][1].name).toBe('ESG-Reporting');
    expect(calls[1][1].name).toBe('Supplier-Risk-Assessment');
  });

  it('apply-hierarchy (Gen-C) triggers upsertEmbedding for every element createElement makes', async () => {
    const res = await request(app)
      .post(`/api/ai-generator/projects/${PROJECT_ID}/architecture/apply-hierarchy`)
      .send({
        hierarchy: {
          vision: {
            visionStatements: ['Net-zero by 2030'],
            mission: '',
            drivers: [], principles: [], goals: [],
          },
          stakeholders: [],
          capabilities: [],
          processes: [],
          activities: [],
        },
        accept: {
          vision: true, stakeholders: [], capabilities: [],
          processes: [], activities: [],
        },
      });

    expect(res.status).toBe(200);
    await flushMicrotasks();

    // The vision statement should produce exactly one createElement call
    // and therefore one upsertEmbedding call.
    expect(mockUpsertEmbedding).toHaveBeenCalledTimes(1);
    const [ws, el] = mockUpsertEmbedding.mock.calls[0];
    expect(ws).toBe(PROJECT_ID);
    expect(el.type).toBe('goal');
    expect(el.layer).toBe('motivation');
    expect(el.name).toBe('Net-zero by 2030');
  });

  it('upsertEmbedding rejection never breaks the apply response (fire-and-forget)', async () => {
    mockUpsertEmbedding.mockRejectedValueOnce(new Error('sidecar down'));

    const res = await request(app)
      .post(`/api/ai-generator/projects/${PROJECT_ID}/processes/${PROCESS_ID}/apply-data-objects`)
      .send({
        dataObjects: [
          { name: 'X', description: '', archimateType: 'data_object',
            crudOperations: 'R', sensitivity: 'public', dataClass: 'misc' },
        ],
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    await flushMicrotasks();
    // hook fired exactly once, even though it rejected
    expect(mockUpsertEmbedding).toHaveBeenCalledTimes(1);
  });
});
