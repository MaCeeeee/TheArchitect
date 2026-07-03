// packages/server/src/__tests__/standards.service.stats-refresh.test.ts
//
// THE-389 regression: every StandardMapping write path must keep the cached
// CompliancePipelineState.mappingStats in sync — without callers having to
// remember a manual refresh-stats call. Before the fix, bulk-create, upsert
// and delete left the cache stale (Remediate showed 0/0/0 despite real gaps).
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { CompliancePipelineState } from '../models/CompliancePipelineState';
import { Standard } from '../models/Standard';
import { StandardMapping } from '../models/StandardMapping';
import { bulkCreateMappings, upsertMapping, deleteMapping } from '../services/standards.service';

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
const USER_ID = new mongoose.Types.ObjectId().toString();

async function createStandardWithSections() {
  const standard = await Standard.create({
    projectId: PROJECT_ID,
    name: 'LkSG Test',
    type: 'custom',
    uploadedBy: USER_ID,
    sections: [
      { number: '1', title: 'A', content: 'a', level: 1 },
      { number: '2', title: 'B', content: 'b', level: 1 },
      { number: '3', title: 'C', content: 'c', level: 1 },
    ],
  });
  return { standard, sectionIds: standard.sections.map((s) => s.id) };
}

function mappingInput(standardId: string, sectionId: string, status: 'compliant' | 'partial' | 'gap') {
  return {
    projectId: PROJECT_ID,
    standardId,
    sectionId,
    sectionNumber: '1',
    elementId: new mongoose.Types.ObjectId().toString(),
    elementName: 'El',
    elementLayer: 'application',
    status,
    notes: '',
    source: 'manual' as const,
    confidence: 1,
    createdBy: USER_ID,
  };
}

async function getStats(standardId: string) {
  const state = await CompliancePipelineState.findOne({ projectId: PROJECT_ID, standardId });
  return state?.mappingStats;
}

describe('mapping writes keep pipeline stats fresh (THE-389)', () => {
  it('bulkCreateMappings refreshes stats without a manual refresh call', async () => {
    const { standard, sectionIds } = await createStandardWithSections();
    const standardId = String(standard._id);

    await bulkCreateMappings([
      mappingInput(standardId, sectionIds[0], 'compliant'),
      mappingInput(standardId, sectionIds[1], 'gap'),
    ]);

    const stats = await getStats(standardId);
    expect(stats?.compliant).toBe(1);
    expect(stats?.gap).toBe(1);
    expect(stats?.unmapped).toBe(1);
  });

  it('upsertMapping refreshes stats', async () => {
    const { standard, sectionIds } = await createStandardWithSections();
    const standardId = String(standard._id);

    await upsertMapping(mappingInput(standardId, sectionIds[0], 'partial'));

    const stats = await getStats(standardId);
    expect(stats?.partial).toBe(1);
    expect(stats?.unmapped).toBe(2);
  });

  it('deleteMapping refreshes stats', async () => {
    const { standard, sectionIds } = await createStandardWithSections();
    const standardId = String(standard._id);

    const mapping = await upsertMapping(mappingInput(standardId, sectionIds[0], 'gap'));
    expect((await getStats(standardId))?.gap).toBe(1);

    await deleteMapping(String(mapping._id));

    const stats = await getStats(standardId);
    expect(stats?.gap).toBe(0);
    expect(stats?.unmapped).toBe(3);
  });

  it('write does not fail when the standard was deleted (best-effort refresh)', async () => {
    const { standard, sectionIds } = await createStandardWithSections();
    const standardId = String(standard._id);
    await Standard.deleteOne({ _id: standard._id });

    await expect(
      upsertMapping(mappingInput(standardId, sectionIds[0], 'gap')),
    ).resolves.toBeTruthy();
  });
});
