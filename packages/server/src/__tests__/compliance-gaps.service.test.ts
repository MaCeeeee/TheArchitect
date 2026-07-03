// packages/server/src/__tests__/compliance-gaps.service.test.ts
//
// UC-GAP-001 (THE-307): live gap aggregation from ComplianceRequirement.
// Covers AC-1 (filters), AC-2 (age/regulation per item) and the summary
// semantics: gap = open|in_progress; done|waived = closed.
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { ComplianceRequirement } from '../models/ComplianceRequirement';
import { Regulation } from '../models/Regulation';
import { computeComplianceGaps } from '../services/compliance-gaps.service';

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
  await ComplianceRequirement.deleteMany({});
  await Regulation.deleteMany({});
});

const PROJECT_ID = new mongoose.Types.ObjectId().toString();

async function createRegulation(title: string) {
  return Regulation.create({
    projectId: PROJECT_ID,
    title,
    source: 'custom',
    jurisdiction: 'DE',
    paragraphNumber: `§ ${title}`,
    fullText: 'x'.repeat(60),
    sourceUrl: 'https://example.org/law',
    effectiveFrom: new Date('2024-01-01'),
    language: 'de',
  });
}

async function createRequirement(opts: {
  regulationId: string;
  title: string;
  priority?: 'must' | 'should' | 'may';
  status?: 'open' | 'in_progress' | 'done' | 'waived';
  linkedElementIds?: string[];
  createdAt?: Date;
}) {
  const doc = await ComplianceRequirement.create({
    projectId: PROJECT_ID,
    regulationId: opts.regulationId,
    title: opts.title,
    description: 'A description of the obligation',
    priority: opts.priority ?? 'must',
    status: opts.status ?? 'open',
    linkedElementIds: opts.linkedElementIds ?? [],
    createdBy: 'human',
  });
  if (opts.createdAt) {
    // createdAt is immutable under mongoose timestamps — bypass via raw collection
    await ComplianceRequirement.collection.updateOne(
      { _id: doc._id },
      { $set: { createdAt: opts.createdAt } },
    );
  }
  return doc;
}

describe('computeComplianceGaps (UC-GAP-001)', () => {
  it('computes global summary: open = open + in_progress, closed = done + waived', async () => {
    const reg = await createRegulation('LkSG');
    const regId = String(reg._id);
    await createRequirement({ regulationId: regId, title: 'Risikoanalyse durchführen', status: 'open', priority: 'must' });
    await createRequirement({ regulationId: regId, title: 'Präventionsmaßnahmen definieren', status: 'in_progress', priority: 'should' });
    await createRequirement({ regulationId: regId, title: 'Grundsatzerklärung veröffentlichen', status: 'done', priority: 'must' });
    await createRequirement({ regulationId: regId, title: 'Beschwerdeverfahren einrichten', status: 'waived', priority: 'may' });

    const { summary } = await computeComplianceGaps(PROJECT_ID);
    expect(summary.total).toBe(4);
    expect(summary.open).toBe(1);
    expect(summary.inProgress).toBe(1);
    expect(summary.done).toBe(1);
    expect(summary.waived).toBe(1);
    expect(summary.openMust).toBe(1); // only the open must; the done must is closed
  });

  it('per-regulation KPI: "N of M open" with pctOpen (view A)', async () => {
    const lksg = await createRegulation('LkSG');
    const nis2 = await createRegulation('NIS2');
    await createRequirement({ regulationId: String(lksg._id), title: 'LkSG requirement one', status: 'open' });
    await createRequirement({ regulationId: String(lksg._id), title: 'LkSG requirement two', status: 'done' });
    await createRequirement({ regulationId: String(nis2._id), title: 'NIS2 requirement one', status: 'open' });

    const { summary } = await computeComplianceGaps(PROJECT_ID);
    const lksgSummary = summary.byRegulation.find((r) => r.regulationTitle === 'LkSG');
    expect(lksgSummary).toMatchObject({ total: 2, open: 1, done: 1, pctOpen: 50 });
    const nis2Summary = summary.byRegulation.find((r) => r.regulationTitle === 'NIS2');
    expect(nis2Summary).toMatchObject({ total: 1, open: 1, pctOpen: 100 });
  });

  it('topElements ranks by open MUST first, only counts open work (view C)', async () => {
    const reg = await createRegulation('LkSG');
    const regId = String(reg._id);
    await createRequirement({ regulationId: regId, title: 'Must requirement on hr-platform', priority: 'must', status: 'open', linkedElementIds: ['el-hr'] });
    await createRequirement({ regulationId: regId, title: 'Second must on hr-platform', priority: 'must', status: 'in_progress', linkedElementIds: ['el-hr'] });
    await createRequirement({ regulationId: regId, title: 'May requirement on crm and erp', priority: 'may', status: 'open', linkedElementIds: ['el-crm', 'el-erp'] });
    await createRequirement({ regulationId: regId, title: 'Done must does not count', priority: 'must', status: 'done', linkedElementIds: ['el-crm'] });

    const { summary } = await computeComplianceGaps(PROJECT_ID);
    expect(summary.topElements[0]).toMatchObject({ elementId: 'el-hr', open: 2, openMust: 2 });
    const crm = summary.topElements.find((e) => e.elementId === 'el-crm');
    expect(crm).toMatchObject({ open: 1, openMust: 0 });
  });

  it('counts unlinked open requirements and computes ageDays (AC-2)', async () => {
    const reg = await createRegulation('LkSG');
    const tenDaysAgo = new Date(Date.now() - 10 * 86_400_000);
    await createRequirement({
      regulationId: String(reg._id),
      title: 'Unlinked open requirement',
      status: 'open',
      linkedElementIds: [],
      createdAt: tenDaysAgo,
    });

    const { items, summary } = await computeComplianceGaps(PROJECT_ID);
    expect(summary.unlinked).toBe(1);
    expect(items[0].ageDays).toBeGreaterThanOrEqual(9);
    expect(items[0].ageDays).toBeLessThanOrEqual(11);
    expect(items[0].regulationTitle).toBe('LkSG');
  });

  it('applies regulationId, elementId and priority filters (AC-1)', async () => {
    const lksg = await createRegulation('LkSG');
    const nis2 = await createRegulation('NIS2');
    await createRequirement({ regulationId: String(lksg._id), title: 'LkSG must on element', priority: 'must', linkedElementIds: ['el-1'] });
    await createRequirement({ regulationId: String(lksg._id), title: 'LkSG should elsewhere', priority: 'should', linkedElementIds: ['el-2'] });
    await createRequirement({ regulationId: String(nis2._id), title: 'NIS2 must on element', priority: 'must', linkedElementIds: ['el-1'] });

    const byRegulation = await computeComplianceGaps(PROJECT_ID, { regulationId: String(lksg._id) });
    expect(byRegulation.summary.total).toBe(2);

    const byElement = await computeComplianceGaps(PROJECT_ID, { elementId: 'el-1' });
    expect(byElement.summary.total).toBe(2);
    expect(byElement.items.every((i) => i.linkedElementIds.includes('el-1'))).toBe(true);

    const byPriority = await computeComplianceGaps(PROJECT_ID, { priority: 'must' });
    expect(byPriority.summary.total).toBe(2);
  });

  it('returns empty result for a project without requirements', async () => {
    const { items, summary } = await computeComplianceGaps(PROJECT_ID);
    expect(items).toHaveLength(0);
    expect(summary.total).toBe(0);
    expect(summary.byRegulation).toHaveLength(0);
    expect(summary.topElements).toHaveLength(0);
  });
});
