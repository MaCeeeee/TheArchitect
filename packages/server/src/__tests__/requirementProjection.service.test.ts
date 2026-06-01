/**
 * UC-REQPROJ-001 (THE-315) — Projection service tests.
 *
 * Verifies:
 *   - classifyObligation heuristic (requirement vs constraint, DE + EN)
 *   - projectRequirementsToModel: one driver per source, requirement/constraint
 *     split, influence + realization edges, idempotency call-shape, floating gaps.
 *
 * Neo4j is mocked (runCypher captured); Mongo via mongodb-memory-server.
 *
 * Run: cd packages/server && npx jest src/__tests__/requirementProjection.service.test.ts
 */
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';

// ─── Mock Neo4j ───────────────────────────────────────────────
const runCypherMock = jest.fn();
jest.mock('../config/neo4j', () => ({
  runCypher: (...args: unknown[]) => runCypherMock(...args),
}));

// Import AFTER mock
import {
  projectRequirementsToModel,
  __testExports,
} from '../services/requirementProjection.service';
import { ComplianceRequirement } from '../models/ComplianceRequirement';
import { Regulation } from '../models/Regulation';

const { classifyObligation } = __testExports;

const PROJECT_ID = '507f1f77bcf86cd799439011';

function mkRegulation(projectId: string, source: string, overrides: Record<string, unknown> = {}) {
  return {
    projectId: new mongoose.Types.ObjectId(projectId),
    title: `${source} Regulation`,
    fullText: 'a'.repeat(60),
    sourceUrl: 'https://example.org',
    effectiveFrom: new Date('2024-01-01'),
    language: 'de' as const,
    jurisdiction: 'DE',
    source,
    paragraphNumber: '§ 6',
    ...overrides,
  };
}

function mkRequirement(projectId: string, regulationId: mongoose.Types.ObjectId, overrides: Record<string, unknown> = {}) {
  return {
    projectId: new mongoose.Types.ObjectId(projectId),
    regulationId,
    sourceParagraph: 'p',
    title: 'Risikoanalyse durchführen',
    description: 'Das Unternehmen muss eine Risikoanalyse durchführen.',
    priority: 'must' as const,
    linkedElementIds: ['cap-1'],
    status: 'open' as const,
    createdBy: 'human' as const,
    ...overrides,
  };
}

describe('classifyObligation()', () => {
  it('classifies a positive obligation as requirement', () => {
    expect(classifyObligation('Risikoanalyse durchführen', 'Das Unternehmen muss ...')).toBe('requirement');
  });

  it('classifies a German prohibition as constraint', () => {
    expect(classifyObligation('Verarbeitung untersagen', 'Die Verarbeitung ist untersagt.')).toBe('constraint');
    expect(classifyObligation('Sensible Daten', 'Diese Daten dürfen nicht verarbeitet werden.')).toBe('constraint');
  });

  it('classifies an English prohibition as constraint', () => {
    expect(classifyObligation('Block processing', 'Processing is prohibited for this category.')).toBe('constraint');
    expect(classifyObligation('Access', 'Users must not access the system.')).toBe('constraint');
  });
});

describe('projectRequirementsToModel()', () => {
  let mongoServer: MongoMemoryServer;

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    await mongoose.connect(mongoServer.getUri());
    await Regulation.ensureIndexes();
    await ComplianceRequirement.ensureIndexes();
  });

  afterAll(async () => {
    await mongoose.disconnect();
    await mongoServer.stop();
  });

  afterEach(async () => {
    await Regulation.deleteMany({});
    await ComplianceRequirement.deleteMany({});
    runCypherMock.mockReset();
  });

  // runCypher returns records exposing .get('n') for the edge-count reads
  function mockEdgeCounts() {
    runCypherMock.mockImplementation(() => Promise.resolve([{ get: () => 1 }]));
  }

  it('returns all-zero summary + skips Cypher when no requirements', async () => {
    const summary = await projectRequirementsToModel({ projectId: PROJECT_ID });
    expect(summary.requirementsProjected).toBe(0);
    expect(summary.constraintsProjected).toBe(0);
    expect(runCypherMock).not.toHaveBeenCalled();
  });

  it('projects requirement + constraint with one driver per source', async () => {
    mockEdgeCounts();
    const reg = await Regulation.create(mkRegulation(PROJECT_ID, 'lksg'));
    await ComplianceRequirement.create([
      mkRequirement(PROJECT_ID, reg._id as mongoose.Types.ObjectId, {
        title: 'Risikoanalyse durchführen',
        description: 'Eine Risikoanalyse ist durchzuführen.',
        linkedElementIds: ['cap-1'],
      }),
      mkRequirement(PROJECT_ID, reg._id as mongoose.Types.ObjectId, {
        title: 'Verarbeitung untersagen',
        description: 'Die Verarbeitung ist untersagt.',
        linkedElementIds: ['cap-2'],
      }),
    ]);

    const summary = await projectRequirementsToModel({ projectId: PROJECT_ID });

    expect(summary.driversUpserted).toBe(1);              // one source → one driver
    expect(summary.requirementsProjected).toBe(1);        // positive obligation
    expect(summary.constraintsProjected).toBe(1);         // prohibition → constraint
    expect(summary.elementIds).toHaveLength(2);
    expect(summary.influenceEdges).toBe(1);               // mocked count
    expect(summary.realizationEdges).toBe(1);

    // 4 Cypher batches: drivers, elements, influence, realization
    expect(runCypherMock).toHaveBeenCalledTimes(4);

    // The element-MERGE batch carries the obligation kind on each row
    const elementCall = runCypherMock.mock.calls[1];
    const rows = (elementCall[1] as { rows: Array<{ kind: string }> }).rows;
    const kinds = rows.map((r) => r.kind).sort();
    expect(kinds).toEqual(['constraint', 'requirement']);
  });

  it('counts floating gaps for requirements with no linked elements', async () => {
    mockEdgeCounts();
    const reg = await Regulation.create(mkRegulation(PROJECT_ID, 'nis2'));
    await ComplianceRequirement.create([
      mkRequirement(PROJECT_ID, reg._id as mongoose.Types.ObjectId, { title: 'Linked One', linkedElementIds: ['cap-1'] }),
      mkRequirement(PROJECT_ID, reg._id as mongoose.Types.ObjectId, { title: 'Floating Gap Item', linkedElementIds: [] }),
    ]);

    const summary = await projectRequirementsToModel({ projectId: PROJECT_ID });
    expect(summary.floatingGaps).toBe(1);
  });

  it('creates one driver per distinct source', async () => {
    mockEdgeCounts();
    const reg1 = await Regulation.create(mkRegulation(PROJECT_ID, 'lksg', { paragraphNumber: '§ 6' }));
    const reg2 = await Regulation.create(mkRegulation(PROJECT_ID, 'nis2', { paragraphNumber: 'Art. 21' }));
    await ComplianceRequirement.create([
      mkRequirement(PROJECT_ID, reg1._id as mongoose.Types.ObjectId, { title: 'From LkSG' }),
      mkRequirement(PROJECT_ID, reg2._id as mongoose.Types.ObjectId, { title: 'From NIS2' }),
    ]);

    const summary = await projectRequirementsToModel({ projectId: PROJECT_ID });
    expect(summary.driversUpserted).toBe(2);

    const driverCall = runCypherMock.mock.calls[0];
    const driverRows = (driverCall[1] as { rows: Array<{ source: string }> }).rows;
    expect(driverRows.map((r) => r.source).sort()).toEqual(['lksg', 'nis2']);
  });

  it('filters by requirementIds when provided', async () => {
    mockEdgeCounts();
    const reg = await Regulation.create(mkRegulation(PROJECT_ID, 'lksg'));
    const docs = await ComplianceRequirement.create([
      mkRequirement(PROJECT_ID, reg._id as mongoose.Types.ObjectId, { title: 'Keep This One' }),
      mkRequirement(PROJECT_ID, reg._id as mongoose.Types.ObjectId, { title: 'Skip This One' }),
    ]);

    const summary = await projectRequirementsToModel({
      projectId: PROJECT_ID,
      requirementIds: [String(docs[0]._id)],
    });
    expect(summary.elementIds).toHaveLength(1);
  });
});
