// packages/server/src/__tests__/compliance-pipeline.test.ts
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { CompliancePipelineState } from '../models/CompliancePipelineState';
import { Standard } from '../models/Standard';
import { StandardMapping } from '../models/StandardMapping';
import {
  getOrCreatePipelineState,
  refreshMappingStats,
  refreshPolicyStats,
  getPipelineStatus,
  getPortfolioOverview,
} from '../services/compliance-pipeline.service';
import { validateConfidence } from '../services/ai.service';

let mongod: MongoMemoryServer;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

afterEach(async () => {
  await CompliancePipelineState.deleteMany({});
  await Standard.deleteMany({});
  await StandardMapping.deleteMany({});
});

const PROJECT_ID = new mongoose.Types.ObjectId().toString();
const STANDARD_ID = new mongoose.Types.ObjectId().toString();
const USER_ID = new mongoose.Types.ObjectId().toString();

describe('getOrCreatePipelineState', () => {
  it('creates a new state if none exists', async () => {
    const state = await getOrCreatePipelineState(PROJECT_ID, STANDARD_ID);
    expect(state.stage).toBe('uploaded');
    expect(state.mappingStats.total).toBe(0);
    expect(state.policyStats.generated).toBe(0);
  });

  it('returns existing state on second call', async () => {
    const first = await getOrCreatePipelineState(PROJECT_ID, STANDARD_ID);
    const second = await getOrCreatePipelineState(PROJECT_ID, STANDARD_ID);
    expect(String(first._id)).toBe(String(second._id));
  });
});

describe('refreshMappingStats', () => {
  it('throws when standard not found', async () => {
    await expect(refreshMappingStats(PROJECT_ID, STANDARD_ID))
      .rejects.toThrow('Standard not found');
  });

  it('computes stats from mappings and advances stage', async () => {
    // Create a standard with 3 sections
    const standard = await Standard.create({
      projectId: PROJECT_ID,
      name: 'Test Standard',
      type: 'custom',
      uploadedBy: USER_ID,
      sections: [
        { number: '1.1', title: 'Section A', content: 'a', level: 1 },
        { number: '1.2', title: 'Section B', content: 'b', level: 1 },
        { number: '1.3', title: 'Section C', content: 'c', level: 1 },
      ],
    });

    const sectionIds = standard.sections.map((s: any) => s.id);

    // Create one compliant mapping for section A
    await StandardMapping.create({
      projectId: PROJECT_ID,
      standardId: String(standard._id),
      sectionId: sectionIds[0],
      elementId: new mongoose.Types.ObjectId().toString(),
      status: 'compliant',
      source: 'manual',
      createdBy: USER_ID,
    });

    const state = await refreshMappingStats(PROJECT_ID, String(standard._id));
    expect(state.mappingStats.compliant).toBe(1);
    expect(state.mappingStats.unmapped).toBe(2);
    expect(state.stage).toBe('mapped'); // advanced from 'uploaded'
  });
});

describe('refreshPolicyStats', () => {
  it('returns zero stats (Policy.standardId not yet implemented)', async () => {
    const state = await refreshPolicyStats(PROJECT_ID, STANDARD_ID);
    expect(state.policyStats.generated).toBe(0);
    expect(state.policyStats.approved).toBe(0);
  });
});

describe('getPipelineStatus', () => {
  it('returns all states for a project', async () => {
    await getOrCreatePipelineState(PROJECT_ID, STANDARD_ID);
    await getOrCreatePipelineState(PROJECT_ID, new mongoose.Types.ObjectId().toString());
    const states = await getPipelineStatus(PROJECT_ID);
    expect(states).toHaveLength(2);
  });
});

describe('getPortfolioOverview', () => {
  it('computes maturity levels correctly', async () => {
    const standard = await Standard.create({
      projectId: PROJECT_ID,
      name: 'ISO 21434',
      type: 'iso',
      version: '2021',
      uploadedBy: USER_ID,
      sections: [
        { number: '1', title: 'A', content: 'a', level: 1 },
        { number: '2', title: 'B', content: 'b', level: 1 },
      ],
    });
    await getOrCreatePipelineState(PROJECT_ID, String(standard._id));

    const overview = await getPortfolioOverview(PROJECT_ID);
    expect(overview.totalStandards).toBe(1);
    expect(overview.trackedStandards).toBe(1);
    expect(overview.portfolio[0].maturityLevel).toBe(1); // 0% coverage
    expect(overview.portfolio[0].standardName).toBe('ISO 21434');
  });
});

describe('validateConfidence', () => {
  const elements = [
    { id: 'el1', layer: 'application', type: 'application_component' },
    { id: 'el2', layer: 'technology', type: 'node' },
  ];

  it('returns original confidence for coverage gaps', () => {
    const result = validateConfidence({ elementId: '__COVERAGE_GAP__', confidence: 0.8 }, elements);
    expect(result).toBe(0.8);
  });

  it('reduces confidence on layer mismatch', () => {
    const result = validateConfidence(
      { elementId: 'el1', layer: 'technology', confidence: 1.0 },
      elements
    );
    expect(result).toBe(0.7); // 1.0 * 0.7
  });

  it('reduces confidence on type mismatch', () => {
    const result = validateConfidence(
      { elementId: 'el1', elementType: 'node', confidence: 1.0 },
      elements
    );
    expect(result).toBe(0.8); // 1.0 * 0.8
  });

  it('compounds layer + type mismatch penalties', () => {
    const result = validateConfidence(
      { elementId: 'el1', layer: 'technology', elementType: 'node', confidence: 1.0 },
      elements
    );
    expect(result).toBe(0.56); // 1.0 * 0.7 * 0.8
  });
});
