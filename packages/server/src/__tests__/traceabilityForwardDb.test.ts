/**
 * Tests für traceability.service.forwardTrace (THE-565 Task 1):
 * Norm → Klauseln → Anforderungs- und Maßnahmen-Stand je Klausel.
 *
 * DIE REGEL: die Gruppierungs-Achse ist die inhalts-basierte
 * `chain.clauseContentId` (THE-560); Legacy-Requirements ohne Klausel-Anker
 * erscheinen GETRENNT (`withoutClauseAnchor`) — nie rückwirkend interpretiert.
 * Die Coverage-Lücke (Klausel ohne verlinkte Elemente) ist der Punkt der
 * Ansicht, kein Randfall.
 */
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { forwardTrace } from '../services/traceability.service';
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

async function seedChainReq(args: {
  contentId: string;
  regulationKey: string;
  title: string;
  linked?: string[];
  deadline?: boolean;
}) {
  const str = await StakeholderRequirement.create({
    projectId,
    regulationKey: args.regulationKey,
    clause: {
      contentId: args.contentId,
      positionalId: `${args.regulationKey}:c01`,
      path: 'Abs. 1',
      text: `Klauseltext für ${args.contentId}.`,
    },
    text: 'Das Unternehmen erfüllt die Pflicht.',
    slots: { action: 'erfüllen', recipient: 'Behörde', modality: 'pflicht', condition: '' },
    kind: 'requirement',
    ...(args.deadline
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
    linkedElementIds: args.linked ?? [],
    chain: {
      clauseContentId: args.contentId,
      clausePath: 'Abs. 1',
      stakeholderRequirementIds: [str._id],
      systemRequirementId: new mongoose.Types.ObjectId(),
    },
  });
}

describe('forwardTrace — Norm nach Klauseln', () => {
  it('groups chain requirements by clause contentId with snapshot, gates state and linked elements', async () => {
    await seedChainReq({ contentId: 'aaaa19b2c4d5e6f7', regulationKey: 'nis2:art23', title: 'Frühwarnung senden', linked: ['el-1'] });
    await seedChainReq({ contentId: 'aaaa19b2c4d5e6f7', regulationKey: 'nis2:art23', title: 'Meldung übermitteln' });
    await seedChainReq({ contentId: 'bbbb19b2c4d5e6f7', regulationKey: 'nis2:art23', title: 'Abschlussbericht vorlegen' });

    const r = await forwardTrace(projectId);
    expect(r.norms).toHaveLength(1);
    const norm = r.norms[0];
    expect(norm.regulationKey).toBe('nis2:art23');
    expect(norm.clauses).toHaveLength(2);

    const shared = norm.clauses.find((c) => c.contentId === 'aaaa19b2c4d5e6f7')!;
    expect(shared.requirements).toHaveLength(2);
    expect(shared.clauseText).toMatch(/Klauseltext/);
    expect(shared.requirements.map((x) => x.title).sort()).toEqual(['Frühwarnung senden', 'Meldung übermitteln']);
    expect(shared.linkedElementIds).toEqual(['el-1']); // Maßnahmen-Stand der Klausel
  });

  it('a clause with NO linked elements is visibly uncovered — that is the point of the view', async () => {
    await seedChainReq({ contentId: 'cccc19b2c4d5e6f7', regulationKey: 'dsgvo:art33', title: 'Meldeprozess etablieren' });
    const r = await forwardTrace(projectId);
    const clause = r.norms[0].clauses[0];
    expect(clause.linkedElementIds).toEqual([]);
  });

  it('legacy requirements without a chain appear separately, never guessed', async () => {
    await seedChainReq({ contentId: 'dddd19b2c4d5e6f7', regulationKey: 'nis2:art23', title: 'Frühwarnung senden' });
    await ComplianceRequirement.create({
      projectId,
      regulationId: new mongoose.Types.ObjectId(),
      title: 'Altbestand aus REQGEN',
      description: 'Ein Requirement aus dem Ein-Schritt-Generator ohne Klausel.',
      priority: 'should',
      createdBy: 'human',
      linkedElementIds: [],
    });

    const r = await forwardTrace(projectId);
    expect(r.withoutClauseAnchor.count).toBe(1);
    expect(r.withoutClauseAnchor.requirementIds).toHaveLength(1);
    expect(r.norms[0].clauses).toHaveLength(1); // Legacy taucht in keiner Klausel auf
  });
});
