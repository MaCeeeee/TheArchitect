/**
 * Tests für backwardTrace (THE-565 Task 2) — das Ausmustern-Szenario:
 * je Element die Anforderungen samt Rechtsgrundlage und Frist, und die
 * mechanische Antwort auf „Tool ausmustern → welche Gesetze brechen?"
 * (`soleCoverage` = deriveCovered-Semantik: verlöre das Requirement sein
 * letztes Element, fiele covered auf no — kein Orakel).
 */
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { backwardTrace } from '../services/traceability.service';
import { StakeholderRequirement } from '../models/StakeholderRequirement';
import { ComplianceRequirement } from '../models/ComplianceRequirement';

let mongod: MongoMemoryServer;
beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
});
afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});
beforeEach(async () => {
  await Promise.all([StakeholderRequirement.deleteMany({}), ComplianceRequirement.deleteMany({})]);
});

const projectId = new mongoose.Types.ObjectId();

async function seedChainReq(args: { title: string; regulationKey: string; linked: string[]; withDeadline?: boolean }) {
  const str = await StakeholderRequirement.create({
    projectId,
    regulationKey: args.regulationKey,
    clause: { contentId: 'a3f19b2c4d5e6f70', text: 'Klauseltext.' },
    text: 'Das Unternehmen erfüllt die Pflicht.',
    slots: { action: 'erfüllen', recipient: 'Behörde', modality: 'pflicht', condition: '' },
    kind: 'requirement',
    ...(args.withDeadline
      ? { deadline: { dauer: { wert: 72, einheit: 'h' }, bezugspunkt: 'kenntnis', stufe: null, quelle: 'binnen 72 Stunden' } }
      : {}),
  });
  return ComplianceRequirement.create({
    projectId,
    regulationId: new mongoose.Types.ObjectId(),
    title: args.title,
    description: 'Das Unternehmen erfüllt die Meldepflicht nachweisbar.',
    priority: 'must',
    createdBy: 'human',
    linkedElementIds: args.linked,
    chain: {
      clauseContentId: 'a3f19b2c4d5e6f70',
      stakeholderRequirementIds: [str._id],
      systemRequirementId: new mongoose.Types.ObjectId(),
    },
  });
}

describe('backwardTrace — Element zu Anforderungen samt Impact', () => {
  it('answers the retirement question mechanically: sole-coverage requirements and their laws', async () => {
    await seedChainReq({ title: 'Frühwarnung senden', regulationKey: 'nis2:art23', linked: ['el-x'], withDeadline: true });
    await seedChainReq({ title: 'Meldung übermitteln', regulationKey: 'dsgvo:art33', linked: ['el-x', 'el-y'] });
    await seedChainReq({ title: 'Bericht vorlegen', regulationKey: 'dora:art19', linked: ['el-y'] });

    const r = await backwardTrace(projectId, 'el-x');
    expect(r.requirements).toHaveLength(2);

    const a = r.requirements.find((x) => x.title === 'Frühwarnung senden')!;
    expect(a.legalBasis).toBe('nis2:art23');
    expect(a.deadline!.bezugspunkt).toBe('kenntnis');
    expect(a.soleCoverage).toBe(true);

    const b = r.requirements.find((x) => x.title === 'Meldung übermitteln')!;
    expect(b.soleCoverage).toBe(false);
    expect(b.deadline).toBeNull();

    expect(r.impact).toEqual({ wouldLoseCoverage: 1, laws: ['nis2'] });
  });

  it('legacy requirements fall back to normId for the legal basis', async () => {
    await ComplianceRequirement.create({
      projectId,
      regulationId: new mongoose.Types.ObjectId(),
      title: 'Altbestand aus REQGEN',
      description: 'Ein Requirement ohne Kette, aber mit Element.',
      priority: 'should',
      createdBy: 'human',
      normId: 'upload:std-1',
      linkedElementIds: ['el-x'],
    });
    const r = await backwardTrace(projectId, 'el-x');
    expect(r.requirements[0].legalBasis).toBe('upload:std-1');
    expect(r.requirements[0].deadline).toBeNull();
  });
});
