/**
 * regulationKey helper + ART30 reference + WfcompAssessment model (Slice 3.3 / THE-360).
 */
import { createHash } from 'node:crypto';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { buildRegulationKey, computeVersionHash, normaliseParagraph } from '../services/wfcomp/regulationKey';
import { ART30_REGULATION_REF } from '../data/art30.reference';
import { ART30_FULLTEXT } from '../data/art30.seed-data';
import { WfcompAssessment } from '../models/WfcompAssessment';

describe('regulationKey helper (mirror of corpus, ADR-0001)', () => {
  it('builds article-level keys; Abs. only when stated', () => {
    expect(buildRegulationKey('dsgvo', 'Art. 30')).toBe('dsgvo:art-30');
    expect(buildRegulationKey('dsgvo', 'Art. 30 Abs. 1')).toBe('dsgvo:art-30-abs-1');
    expect(normaliseParagraph('§ 6 Abs. 1')).toBe('6-abs-1');
  });

  it('versionHash is sha256(utf8) — deterministic + matches an independent hash', () => {
    const h = computeVersionHash(ART30_FULLTEXT);
    expect(h).toMatch(/^[a-f0-9]{64}$/);
    expect(h).toBe(computeVersionHash(ART30_FULLTEXT)); // deterministic
    expect(h).toBe(createHash('sha256').update(ART30_FULLTEXT, 'utf8').digest('hex'));
  });
});

describe('ART30_REGULATION_REF', () => {
  it('is the article-level corpus reference, hash over our canonical verbatim', () => {
    expect(ART30_REGULATION_REF.regulationKey).toBe('dsgvo:art-30');
    expect(ART30_REGULATION_REF.versionHash).toBe(computeVersionHash(ART30_FULLTEXT));
  });
});

describe('WfcompAssessment model', () => {
  let mongoServer: MongoMemoryServer;

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    await mongoose.connect(mongoServer.getUri());
    await WfcompAssessment.ensureIndexes();
  });
  afterAll(async () => {
    await mongoose.disconnect();
    await mongoServer.stop();
  });
  afterEach(async () => {
    await WfcompAssessment.deleteMany({});
  });

  const baseDoc = (over: Record<string, unknown> = {}) => ({
    projectId: new mongoose.Types.ObjectId(),
    wfcompId: 'wf-1',
    workflowName: 'Newsletter Signup',
    gapReport: { gdprScope: true, fields: [{ litera: 'd', criticality: 'HART', status: 'present' }] },
    regulationRef: ART30_REGULATION_REF,
    assessedBy: new mongoose.Types.ObjectId(),
    ...over,
  });

  it('round-trips the GapReport snapshot + corpus reference', async () => {
    const created = await WfcompAssessment.create(baseDoc());
    const found = await WfcompAssessment.findById(created._id).lean();
    expect(found?.gapReport.gdprScope).toBe(true);
    expect(found?.regulationRef.regulationKey).toBe('dsgvo:art-30');
    expect(found?.regulationRef.versionHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it('re-assess upserts the current record (no accumulation)', async () => {
    const projectId = new mongoose.Types.ObjectId();
    const filter = { projectId, wfcompId: 'wf-1' };
    await WfcompAssessment.updateOne(filter, { $set: baseDoc({ projectId }) }, { upsert: true, runValidators: true });
    await WfcompAssessment.updateOne(
      filter,
      { $set: baseDoc({ projectId, gapReport: { gdprScope: true, fields: [{ litera: 'd', criticality: 'HART', status: 'missing' }] } }) },
      { upsert: true, runValidators: true },
    );
    const all = await WfcompAssessment.find(filter);
    expect(all).toHaveLength(1);
    expect(all[0].gapReport.fields[0].status).toBe('missing'); // updated
  });

  it('rejects a duplicate (project + wfcompId) on create', async () => {
    const projectId = new mongoose.Types.ObjectId();
    await WfcompAssessment.create(baseDoc({ projectId }));
    await expect(WfcompAssessment.create(baseDoc({ projectId }))).rejects.toThrow();
  });

  it('is tenant-isolated', async () => {
    const a = new mongoose.Types.ObjectId();
    const b = new mongoose.Types.ObjectId();
    await WfcompAssessment.create(baseDoc({ projectId: a }));
    expect(await WfcompAssessment.countDocuments({ projectId: b })).toBe(0);
  });
});
