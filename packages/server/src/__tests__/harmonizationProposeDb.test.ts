/**
 * Tests für proposeSharedMeasures + confirmSharedMeasure (THE-569 Task 3).
 *
 * DIE ZWEI GARANTIEN:
 *   1. Verdrängte Paare erreichen den Richter NIE (Judge-Spy) und erscheinen
 *      als eigener Fall mit Zitat — Lauf-4-Negativ-Kontrolle als Produkttest.
 *   2. Bestätigung ist ein Mensch-Akt auf ein BEREITS verlinktes Element —
 *      das System schlägt die Gruppe vor, nie das Element (THE-551).
 */
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import {
  proposeSharedMeasures,
  confirmSharedMeasure,
  HarmonizationError,
} from '../services/harmonization.service';
import { StakeholderRequirement } from '../models/StakeholderRequirement';
import { ChainSystemRequirement } from '../models/ChainSystemRequirement';
import { ComplianceRequirement } from '../models/ComplianceRequirement';
import { applyHumanGate, emptyGates } from '../services/requirementGates.service';

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
  await Promise.all([
    StakeholderRequirement.deleteMany({}),
    ChainSystemRequirement.deleteMany({}),
    ComplianceRequirement.deleteMany({}),
  ]);
});

const projectId = new mongoose.Types.ObjectId();

async function seed(regulationKey: string, verpflichteter: string): Promise<string> {
  const str = await StakeholderRequirement.create({
    projectId,
    regulationKey,
    clause: { contentId: 'a3f19b2c4d5e6f70', text: 'Die Einrichtungen übermitteln eine Meldung.' },
    text: 'Das Unternehmen übermittelt eine Meldung.',
    slots: { action: 'Meldung übermitteln', recipient: 'CSIRT', modality: 'pflicht', condition: '' },
    kind: 'requirement',
  });
  const sysReq = await ChainSystemRequirement.create({
    projectId,
    text: `Das Unternehmen meldet Vorfälle fristgerecht (${regulationKey}).`,
    schutzgut: 'Netzsysteme',
    verpflichteter,
    ausloeser: 'Vorfall',
    nachweis: 'Meldung',
    stakeholderRequirementIds: [str._id],
    actionClassification: { actionId: 'vorfall-melden-behoerde', ontologyVersion: require('@thearchitect/shared').NORM_ONTOLOGY.ontologyVersion },
  });
  return String(sysReq._id);
}

const askNever = async (): Promise<string> => {
  throw new Error('classify must not run — classifications are cached');
};

describe('proposeSharedMeasures', () => {
  it('groups compatible pairs, NEVER judges displaced ones, reports them with citations + stats', async () => {
    const nis2 = await seed('nis2:art23', 'wesentliche Einrichtung');
    const dsgvo = await seed('dsgvo:art33', 'Verantwortlicher');
    const dora = await seed('dora:art19', 'Finanzunternehmen');

    const judgedPairs: string[][] = [];
    const judge = async (_s: string, user: string): Promise<string> => {
      judgedPairs.push([user.includes('nis2') ? 'nis2' : '', user.includes('dora') ? 'dora' : ''].filter(Boolean));
      return JSON.stringify({ relation: 'subset', wider: 'A', why: 'stub: gemeinsamer Kern' });
    };

    const r = await proposeSharedMeasures(projectId, { ask: askNever, judge, maxJudgedPairs: 50 });

    // Verdrängung: nis2×dora ausgeschlossen, mit Zitat, BEVOR ein Modell lief.
    expect(r.grouping.excludedByDisplacement).toHaveLength(1);
    const ex = r.grouping.excludedByDisplacement[0];
    expect([ex.a, ex.b].sort()).toEqual([dora, nis2].sort());
    expect(ex.citations.join(' ')).toMatch(/Art\. 1|Art\. 4/);

    // Der Richter sah GENAU die zwei kompatiblen Paare — nie nis2×dora.
    expect(r.stats.pairsJudged).toBe(2);
    for (const pair of judgedPairs) expect(pair).not.toEqual(['nis2', 'dora']);

    // subset-Urteile verketten die judgebaren Paare zu einer Gruppe mit dsgvo.
    expect(r.grouping.measures.length).toBeGreaterThanOrEqual(1);
    const allMembers = r.grouping.measures.flatMap((m) => m.memberIds);
    expect(allMembers).toContain(dsgvo);

    // Confirm-UI-Futter: je Mitglied ein Detail-Eintrag (hier ohne
    // materialisierte Requirements -> requirementId null, Elemente leer).
    expect(r.memberDetails.map((d) => d.systemRequirementId).sort()).toEqual([...allMembers].sort());
  });

  it('exposes the cap — judged pairs never exceed maxJudgedPairs, capping is visible', async () => {
    await seed('nis2:art23', 'wesentliche Einrichtung');
    await seed('dsgvo:art33', 'Verantwortlicher');
    const judge = async (): Promise<string> => JSON.stringify({ relation: 'unrelated', why: 'stub' });
    const r = await proposeSharedMeasures(projectId, { ask: askNever, judge, maxJudgedPairs: 0 });
    expect(r.stats.pairsJudged).toBe(0);
    expect(r.grouping.cappedPairs).toBeGreaterThanOrEqual(1);
  });
});

describe('confirmSharedMeasure — der Mensch verlinkt', () => {
  const makeCompReq = (sysReqId: string, linked: string[] = []) =>
    ComplianceRequirement.create({
      projectId,
      regulationId: new mongoose.Types.ObjectId(),
      title: `Anforderung ${sysReqId.slice(-5)}`,
      description: 'Das Unternehmen erfüllt die Meldepflicht nachweisbar.',
      priority: 'must',
      createdBy: 'human',
      linkedElementIds: linked,
      chain: {
        clauseContentId: 'a3f19b2c4d5e6f70',
        stakeholderRequirementIds: [new mongoose.Types.ObjectId()],
        systemRequirementId: new mongoose.Types.ObjectId(sysReqId),
      },
    });

  it('links the shared element to ALL members and recomputes covered — human gates untouched', async () => {
    const s1 = String(new mongoose.Types.ObjectId());
    const s2 = String(new mongoose.Types.ObjectId());
    const gates = applyHumanGate(emptyGates(), 'attested', 'yes', '507f1f77bcf86cd799439099', 'Nachweis liegt vor');
    const a = await makeCompReq(s1, ['el-shared']);
    await ComplianceRequirement.updateOne({ _id: a._id }, { $set: { gates } });
    const b = await makeCompReq(s2);

    const r = await confirmSharedMeasure({ projectId, systemRequirementIds: [s1, s2], elementId: 'el-shared' });
    expect(r.linkedRequirements).toBe(2);

    const [fa, fb] = await Promise.all([
      ComplianceRequirement.findById(a._id).lean(),
      ComplianceRequirement.findById(b._id).lean(),
    ]);
    expect(fb!.linkedElementIds).toContain('el-shared');
    expect(fb!.gates!.covered.state).toBe('yes');
    expect(fa!.linkedElementIds).toEqual(['el-shared']); // kein Duplikat
    expect(fa!.gates!.attested.state).toBe('yes'); // Mensch-Tor unangetastet
  });

  it('rejects when the element is linked to NO member — the system never picks the element', async () => {
    const s1 = String(new mongoose.Types.ObjectId());
    const s2 = String(new mongoose.Types.ObjectId());
    await makeCompReq(s1);
    await makeCompReq(s2);
    await expect(
      confirmSharedMeasure({ projectId, systemRequirementIds: [s1, s2], elementId: 'el-nowhere' }),
    ).rejects.toThrow(HarmonizationError);
  });
});
