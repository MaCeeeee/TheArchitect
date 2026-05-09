/**
 * UC-DATA-001 — Apply Data-Objects Route Tests
 *
 * Critical safety check: REQ-DATA-003 says auto-connections must be
 * idempotent. Without it UC-RED-001's redundancy detector would later
 * flag legitimate access-edges as duplicates.
 *
 * Scenarios:
 * - First apply creates new element + access-connection
 * - Reuse-by-name: same-name in 2nd call links to existing element
 *   instead of creating duplicate
 * - Re-apply identical payload does NOT duplicate connections (MERGE)
 * - CRUD letters map correctly to access-label (read | write | read-write)
 *
 * The apply route uses runCypher heavily — we capture all calls and
 * assert against the resulting Cypher patterns rather than running
 * Neo4j (which would be too slow for CI).
 *
 * Run: cd packages/server && npx jest src/__tests__/dataObject-apply.routes.test.ts --forceExit
 */

import express from 'express';
import request from 'supertest';
import mongoose from 'mongoose';

const TEST_USER_ID = new mongoose.Types.ObjectId();

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

// Track Cypher calls for assertions
const cypherCalls: Array<{ query: string; params: Record<string, unknown> }> = [];
const existingByName = new Map<string, string>(); // simulated DB

jest.mock('../config/neo4j', () => ({
  runCypher: jest.fn(async (query: string, params: Record<string, unknown>) => {
    cypherCalls.push({ query, params });

    // Simulate the existence-check query for reuse-by-name
    if (query.includes("WHERE e.type IN ['data_object'") && (params as any).name) {
      const existingId = existingByName.get((params as any).name as string);
      if (existingId) {
        return [{ get: (k: string) => (k === 'id' ? existingId : null) }];
      }
      return [];
    }
    // Simulate CREATE returning the new node — we register the name
    if (query.includes('CREATE (e:ArchitectureElement') && (params as any).name) {
      existingByName.set((params as any).name as string, (params as any).id as string);
      return [];
    }
    // MERGE for connection — return a stub
    if (query.includes('MERGE (p)-[r:CONNECTS_TO')) {
      return [{ get: () => (params as any).connId }];
    }
    return [];
  }),
}));

// Mock services not relevant to this test
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
app.use('/api', aiGeneratorRouter);

const PROJECT_ID = new mongoose.Types.ObjectId().toString();
const PROCESS_ID = 'process-test-001';

beforeEach(() => {
  cypherCalls.length = 0;
  existingByName.clear();
});

describe('Apply Data-Objects (REQ-DATA-003 + REQ-DATA-004)', () => {
  describe('reuse-by-name (REQ-DATA-001 V1 dedup)', () => {
    it('first apply creates new element + access-connection', async () => {
      const res = await request(app)
        .post(`/api/projects/${PROJECT_ID}/processes/${PROCESS_ID}/apply-data-objects`)
        .send({
          dataObjects: [
            {
              name: 'Emissions-Record',
              description: 'Scope 1/2/3 measurements',
              dataClass: 'transactional',
              sensitivity: 'internal',
              crudOperations: 'CRU',
              archimateType: 'data_object',
            },
          ],
        });

      expect(res.status).toBe(200);
      expect(res.body.count).toBe(1);
      expect(res.body.dataObjectIds.length).toBe(1);
      expect(res.body.connectionIds.length).toBe(1);

      const createdElement = cypherCalls.find((c) => c.query.includes('CREATE (e:ArchitectureElement'));
      expect(createdElement).toBeDefined();
      // layer is hardcoded in the Cypher template, not parameterized
      expect(createdElement!.query).toContain("layer: 'information'");
      expect((createdElement!.params as any).type).toBe('data_object');
    });

    it('second apply with same name reuses existing element-id (no duplicate CREATE)', async () => {
      // First apply creates the element
      await request(app)
        .post(`/api/projects/${PROJECT_ID}/processes/${PROCESS_ID}/apply-data-objects`)
        .send({
          dataObjects: [
            {
              name: 'Emissions-Record',
              description: 'first',
              dataClass: 'transactional',
              sensitivity: 'internal',
              crudOperations: 'CR',
              archimateType: 'data_object',
            },
          ],
        });

      const createsBefore = cypherCalls.filter((c) =>
        c.query.includes('CREATE (e:ArchitectureElement'),
      ).length;

      // Second apply with the same name
      const res = await request(app)
        .post(`/api/projects/${PROJECT_ID}/processes/${PROCESS_ID}/apply-data-objects`)
        .send({
          dataObjects: [
            {
              name: 'Emissions-Record', // same name!
              description: 'second call',
              dataClass: 'transactional',
              sensitivity: 'internal',
              crudOperations: 'R',
              archimateType: 'data_object',
            },
          ],
        });

      expect(res.status).toBe(200);
      expect(res.body.count).toBe(0); // no NEW element created
      expect(res.body.connectionIds.length).toBe(1); // connection still made

      const createsAfter = cypherCalls.filter((c) =>
        c.query.includes('CREATE (e:ArchitectureElement'),
      ).length;
      expect(createsAfter).toBe(createsBefore); // no new CREATE
    });
  });

  describe('access-connection MERGE-idempotency (REQ-DATA-003)', () => {
    it('uses MERGE pattern to prevent duplicate access-edges', async () => {
      await request(app)
        .post(`/api/projects/${PROJECT_ID}/processes/${PROCESS_ID}/apply-data-objects`)
        .send({
          dataObjects: [
            {
              name: 'Test',
              description: 'test',
              dataClass: 'reference',
              sensitivity: 'public',
              crudOperations: 'R',
              archimateType: 'data_object',
            },
          ],
        });

      const mergeCall = cypherCalls.find((c) => c.query.includes('MERGE (p)-[r:CONNECTS_TO'));
      expect(mergeCall).toBeDefined();
      expect(mergeCall!.query).toContain("type: 'access'");
      expect(mergeCall!.query).toContain('ON CREATE SET');
      expect(mergeCall!.query).toContain('ON MATCH');
    });
  });

  describe('CRUD → access-label mapping (REQ-DATA-003)', () => {
    it.each([
      ['R', 'read'],
      ['C', 'write'],
      ['U', 'write'],
      ['D', 'write'],
      ['CR', 'read-write'],
      ['CRU', 'read-write'],
      ['RU', 'read-write'],
      ['CRUD', 'read-write'],
    ])('%s → %s', async (crud, expectedLabel) => {
      cypherCalls.length = 0;
      await request(app)
        .post(`/api/projects/${PROJECT_ID}/processes/${PROCESS_ID}/apply-data-objects`)
        .send({
          dataObjects: [
            {
              name: `Test-${crud}`,
              description: 'test',
              dataClass: 'reference',
              sensitivity: 'public',
              crudOperations: crud,
              archimateType: 'data_object',
            },
          ],
        });

      const mergeCall = cypherCalls.find((c) => c.query.includes('MERGE (p)-[r:CONNECTS_TO'));
      expect((mergeCall!.params as any).label).toBe(expectedLabel);
    });
  });

  describe('error cases', () => {
    it('400 on empty dataObjects array', async () => {
      const res = await request(app)
        .post(`/api/projects/${PROJECT_ID}/processes/${PROCESS_ID}/apply-data-objects`)
        .send({ dataObjects: [] });
      expect(res.status).toBe(400);
    });

    it('400 on missing dataObjects', async () => {
      const res = await request(app)
        .post(`/api/projects/${PROJECT_ID}/processes/${PROCESS_ID}/apply-data-objects`)
        .send({});
      expect(res.status).toBe(400);
    });
  });
});
