/**
 * findOutputsByRegulation() — reverse-lookup (THE-423 Task 12, AC-5).
 *
 * REGDIFF/drift foundation (THE-308): given a regulationKey + versionHash,
 * find every ContextTrace whose `consumed` cites it, then join those
 * traces' `requestId`s against every output that stamps `contextTraceId`.
 *
 * Precision guarantee under test: outputs stamped with a DIFFERENT trace
 * (that did NOT consume this regulationKey/versionHash) must be excluded —
 * that's the entire reason per-regulation traces exist.
 *
 * Oracle is deliberately NOT covered here: oracle ContextTraces always have
 * `consumed:[]`, so they can never match a `consumed.regulationKey` query.
 *
 * Neo4j is mocked (mongodb-memory-server has no bolt endpoint available in
 * this harness) — mirrors architecture.routes.heal-connections.contextTrace.test.ts.
 * We assert `runCypher` is invoked with the resolved trace ids for both the
 * ArchitectureElement-node branch (future-proof; nothing stamped there yet)
 * and the CONNECTS_TO-relationship branch (already stamped, THE-423 Task 9).
 *
 * Run: cd packages/server && npx jest src/__tests__/contextTrace.findOutputsByRegulation.test.ts --verbose
 */
import mongoose, { Types } from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';

const mockRunCypher = jest.fn();
jest.mock('../config/neo4j', () => ({
  runCypher: (...args: unknown[]) => mockRunCypher(...args),
  serializeNeo4jProperties: (p: Record<string, unknown>) => p,
}));

import { ContextTrace } from '../models/ContextTrace';
import { ComplianceMapping } from '../models/ComplianceMapping';
import { ComplianceRequirement } from '../models/ComplianceRequirement';
import { LawDiscoveryFinding } from '../models/LawDiscoveryFinding';
import { findOutputsByRegulation } from '../services/contextTrace.service';

const REGULATION_KEY = 'dsgvo:art-30';
const VERSION_HASH = 'v-hash-1';
const OTHER_VERSION_HASH = 'v-hash-OTHER';

describe('findOutputsByRegulation() (THE-423 Task 12, AC-5)', () => {
  let mongoServer: MongoMemoryServer;
  let projectId: string;

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    await mongoose.connect(mongoServer.getUri());
  });

  afterAll(async () => {
    await mongoose.disconnect();
    await mongoServer.stop();
  });

  beforeEach(() => {
    projectId = new Types.ObjectId().toString();
    mockRunCypher.mockReset();
    mockRunCypher.mockResolvedValue([]);
  });

  afterEach(async () => {
    await ContextTrace.deleteMany({});
    await ComplianceMapping.deleteMany({});
    await ComplianceRequirement.deleteMany({});
    await LawDiscoveryFinding.deleteMany({});
  });

  it('returns exactly the outputs stamped with a trace that consumed the regulationKey+versionHash, excluding others', async () => {
    // Trace R: consumed the target regulationKey@versionHash.
    const matchingTrace = await ContextTrace.create({
      requestId: 'trace-R',
      feature: 'mapping',
      projectId: new mongoose.Types.ObjectId(projectId),
      consumed: [
        { regulationKey: REGULATION_KEY, versionHash: VERSION_HASH, retrievalMethod: 'direct' },
      ],
    });

    // Trace O: a DIFFERENT trace (different versionHash) — its outputs must be excluded.
    const otherTrace = await ContextTrace.create({
      requestId: 'trace-O',
      feature: 'mapping',
      projectId: new mongoose.Types.ObjectId(projectId),
      consumed: [
        { regulationKey: REGULATION_KEY, versionHash: OTHER_VERSION_HASH, retrievalMethod: 'direct' },
      ],
    });
    expect(matchingTrace.requestId).toBe('trace-R');
    expect(otherTrace.requestId).toBe('trace-O');

    // Outputs stamped with the matching trace R.
    await ComplianceMapping.create({
      projectId: new mongoose.Types.ObjectId(projectId),
      regulationId: new mongoose.Types.ObjectId(),
      contextTraceId: 'trace-R',
      elementId: 'el-1',
      elementType: 'capability',
      confidence: 0.9,
      reasoning: '',
      createdBy: 'human',
    });
    await ComplianceRequirement.create({
      projectId: new mongoose.Types.ObjectId(projectId),
      regulationId: new mongoose.Types.ObjectId(),
      contextTraceId: 'trace-R',
      title: 'Req from R',
      description: 'A valid description of the requirement.',
      priority: 'must',
      createdBy: 'human',
    });
    await LawDiscoveryFinding.create({
      projectId: new mongoose.Types.ObjectId(projectId),
      family: 'family-R',
      jurisdiction: 'EU',
      contextTraceId: 'trace-R',
      applies: true,
      confidence: 0.8,
      retrievalScore: 0.7,
      corpusVersionHash: 'ch-R',
      judgeModel: 'test-model',
      createdBy: 'human',
    });

    // Outputs stamped with the OTHER trace O — must NOT be returned.
    await ComplianceMapping.create({
      projectId: new mongoose.Types.ObjectId(projectId),
      regulationId: new mongoose.Types.ObjectId(),
      contextTraceId: 'trace-O',
      elementId: 'el-2',
      elementType: 'capability',
      confidence: 0.9,
      reasoning: '',
      createdBy: 'human',
    });
    await ComplianceRequirement.create({
      projectId: new mongoose.Types.ObjectId(projectId),
      regulationId: new mongoose.Types.ObjectId(),
      contextTraceId: 'trace-O',
      title: 'Req from O',
      description: 'A different valid description.',
      priority: 'must',
      createdBy: 'human',
    });
    await LawDiscoveryFinding.create({
      projectId: new mongoose.Types.ObjectId(projectId),
      family: 'family-O',
      jurisdiction: 'EU',
      contextTraceId: 'trace-O',
      applies: true,
      confidence: 0.8,
      retrievalScore: 0.7,
      corpusVersionHash: 'ch-O',
      judgeModel: 'test-model',
      createdBy: 'human',
    });

    const result = await findOutputsByRegulation(projectId, REGULATION_KEY, VERSION_HASH);

    expect(result.traceIds).toEqual(['trace-R']);

    expect(result.affected.mappings).toHaveLength(1);
    expect(result.affected.mappings[0].elementId).toBe('el-1');

    expect(result.affected.requirements).toHaveLength(1);
    expect(result.affected.requirements[0].title).toBe('Req from R');

    expect(result.affected.findings).toHaveLength(1);
    expect(result.affected.findings[0].family).toBe('family-R');

    // Neo4j branches: both queried with the resolved trace ids.
    expect(mockRunCypher).toHaveBeenCalledTimes(2);
    for (const call of mockRunCypher.mock.calls) {
      const [, params] = call as [string, { ids: string[]; projectId: string }];
      expect(params.ids).toEqual(['trace-R']);
      expect(params.projectId).toBe(projectId);
    }
    expect(result.affected.elements).toEqual([]);
    expect(result.affected.connections).toEqual([]);
  });

  it('short-circuits to all-empty groups (no Mongo/Neo4j output queries) when no trace matches', async () => {
    const result = await findOutputsByRegulation(projectId, 'no-such:key', 'no-such-hash');

    expect(result.traceIds).toEqual([]);
    expect(result.affected).toEqual({
      mappings: [],
      requirements: [],
      findings: [],
      elements: [],
      connections: [],
    });
    expect(mockRunCypher).not.toHaveBeenCalled();
  });

  it('surfaces Neo4j-matched elements and connections when runCypher returns records', async () => {
    const matchingTrace = await ContextTrace.create({
      requestId: 'trace-N',
      feature: 'connection',
      projectId: new mongoose.Types.ObjectId(projectId),
      consumed: [
        { regulationKey: REGULATION_KEY, versionHash: VERSION_HASH, retrievalMethod: 'dense' },
      ],
    });
    expect(matchingTrace.requestId).toBe('trace-N');

    mockRunCypher
      .mockResolvedValueOnce([
        { get: (k: string) => ({ e: { properties: { id: 'elem-1', contextTraceId: 'trace-N' } } }[k]) },
      ])
      .mockResolvedValueOnce([
        { get: (k: string) => ({ r: { properties: { id: 'conn-1', contextTraceId: 'trace-N' } } }[k]) },
      ]);

    const result = await findOutputsByRegulation(projectId, REGULATION_KEY, VERSION_HASH);

    expect(result.traceIds).toEqual(['trace-N']);
    expect(result.affected.elements).toEqual([{ id: 'elem-1', contextTraceId: 'trace-N' }]);
    expect(result.affected.connections).toEqual([{ id: 'conn-1', contextTraceId: 'trace-N' }]);
  });
});
