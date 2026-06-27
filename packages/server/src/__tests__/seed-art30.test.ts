/**
 * seed-art30 Tests — REQ-WFCOMP-001.1 / THE-352
 *
 * Run: cd packages/server && npx jest seed-art30 --verbose
 */
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { Regulation } from '../models/Regulation';
import { ComplianceRequirement } from '../models/ComplianceRequirement';
import { seedArt30 } from '../scripts/seed-art30';

describe('seedArt30 (REQ-WFCOMP-001.1 / THE-352)', () => {
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
  });

  it('seeds 1 Regulation + 7 ComplianceRequirements with correct criticality split', async () => {
    const projectId = new mongoose.Types.ObjectId().toString();
    await seedArt30(projectId);

    const regs = await Regulation.find({ projectId, source: 'dsgvo' });
    const reqs = await ComplianceRequirement.find({ projectId });

    expect(regs).toHaveLength(1);
    expect(reqs).toHaveLength(7);
    expect(reqs.filter(r => r.criticality === 'HART')).toHaveLength(4); // a–d
    expect(reqs.filter(r => r.criticality === 'BEDINGT')).toHaveLength(1); // e
    expect(reqs.filter(r => r.criticality === 'WEICH')).toHaveLength(2); // f,g
  });

  it('every requirement is human-authored, has a traceTarget, links to the regulation', async () => {
    const projectId = new mongoose.Types.ObjectId().toString();
    const { regulationId } = await seedArt30(projectId);
    const reqs = await ComplianceRequirement.find({ projectId });

    expect(reqs.every(r => r.createdBy === 'human')).toBe(true);
    expect(reqs.every(r => !!r.traceTarget && typeof r.traceTarget.from === 'string')).toBe(true);
    expect(reqs.every(r => r.regulationId.toString() === regulationId)).toBe(true);
    // sourceParagraph (Ebene B per lit.) ist befüllt
    expect(reqs.every(r => r.sourceParagraph.length > 10)).toBe(true);
  });

  it('pins the verbatim Art. 30(1) text + version-lock on the Regulation', async () => {
    const projectId = new mongoose.Types.ObjectId().toString();
    await seedArt30(projectId);
    const reg = await Regulation.findOne({ projectId, source: 'dsgvo' });

    expect(reg?.paragraphNumber).toBe('Art. 30 Abs. 1');
    expect(reg?.version).toBe(1);
    expect(reg?.fullText.startsWith('(1) Jeder Verantwortliche')).toBe(true);
    expect(reg?.fullText).toContain('g) wenn möglich, eine allgemeine Beschreibung der technischen');
    expect(reg?.sourceUrl).toContain('CELEX:32016R0679');
  });

  it('BEDINGT field (lit. e) carries a guard on its traceTarget', async () => {
    const projectId = new mongoose.Types.ObjectId().toString();
    await seedArt30(projectId);
    const e = await ComplianceRequirement.findOne({ projectId, criticality: 'BEDINGT' });
    expect(e?.traceTarget?.guard?.flag).toBe('thirdCountry');
    expect(e?.traceTarget?.guard?.equals).toBe(true);
  });

  it('is idempotent — re-run yields no duplicates', async () => {
    const projectId = new mongoose.Types.ObjectId().toString();
    await seedArt30(projectId);
    await seedArt30(projectId);
    expect(await Regulation.countDocuments({ projectId })).toBe(1);
    expect(await ComplianceRequirement.countDocuments({ projectId })).toBe(7);
  });

  it('is tenant-isolated — seeding project A leaves project B empty', async () => {
    const projectA = new mongoose.Types.ObjectId().toString();
    const projectB = new mongoose.Types.ObjectId().toString();
    await seedArt30(projectA);
    expect(await ComplianceRequirement.countDocuments({ projectId: projectB })).toBe(0);
  });
});
