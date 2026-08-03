/**
 * Tests für chainDrift (THE-565 Task 4) — eine Novelle staled NUR die
 * tatsächlich veränderten Klauseln.
 *
 * Der Kern-Test spielt die umnummerierende Novelle aus THE-550 nach:
 * positional zeigten danach 24/30 Referenzen auf die falsche Klausel —
 * die contentId findet 30/30. Hier wird dieser gemessene Vorteil
 * PRODUKTVERHALTEN: die veränderte Klausel wird mismatch, die
 * Nachbar-Klausel bleibt byte-gleich. Evidenz-Alterung läuft über die
 * THE-558-Bausteine (EINE Quelle).
 */
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';

jest.mock('../services/norm.service', () => ({
  getPipelineNorm: jest.fn(),
}));

import { chainDriftCheck } from '../services/chainDrift.service';
import { getPipelineNorm } from '../services/norm.service';
import { StakeholderRequirement } from '../models/StakeholderRequirement';
import { ComplianceRequirement } from '../models/ComplianceRequirement';
import { Evidence } from '../models/Evidence';
import { applyHumanGate, emptyGates } from '../services/requirementGates.service';
import { clauseContentId } from '@thearchitect/shared';

const getNorm = jest.mocked(getPipelineNorm);

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
  jest.clearAllMocks();
  await Promise.all([
    StakeholderRequirement.deleteMany({}),
    ComplianceRequirement.deleteMany({}),
    Evidence.deleteMany({}),
  ]);
});

const projectId = new mongoose.Types.ObjectId();

const CLAUSE_1 = 'Die Einrichtungen übermitteln unverzüglich eine Frühwarnung an das CSIRT.';
const CLAUSE_2 = 'Die Einrichtungen legen binnen eines Monats einen Abschlussbericht vor.';
const ORIGINAL_TEXT = `(1) ${CLAUSE_1}\n\n(2) ${CLAUSE_2}`;
// Umnummerierende Novelle: neuer Absatz (1); Klausel 1 textlich geändert,
// Klausel 2 wandert nach (3), bleibt aber WÖRTLICH identisch.
const AMENDED_TEXT = `(1) Die Einrichtungen benennen eine zentrale Kontaktstelle.\n\n(2) ${CLAUSE_1.replace('unverzüglich', 'binnen 12 Stunden')}\n\n(3) ${CLAUSE_2}`;

function mockNormWith(content: string): void {
  getNorm.mockResolvedValue({
    id: 'std-1',
    source: 'upload',
    name: 'Test Standard',
    sections: [{ id: 's1', number: '1', title: 'Meldung', content }],
  } as never);
}

async function seedChainReq(clauseText: string, over: Record<string, unknown> = {}) {
  const contentId = clauseContentId(clauseText);
  const str = await StakeholderRequirement.create({
    projectId,
    regulationKey: 'upload:std-1',
    clause: { contentId, text: clauseText },
    text: 'Das Unternehmen erfüllt die Pflicht.',
    slots: { action: 'erfüllen', recipient: 'CSIRT', modality: 'pflicht', condition: '' },
    kind: 'requirement',
  });
  const req = await ComplianceRequirement.create({
    projectId,
    regulationId: new mongoose.Types.ObjectId(),
    title: `Pflicht ${contentId.slice(0, 6)} erfuellen`,
    description: 'Das Unternehmen erfüllt die Meldepflicht nachweisbar.',
    priority: 'must',
    createdBy: 'human',
    normId: 'upload:std-1',
    sectionEId: 's1',
    linkedElementIds: ['el-1'],
    chain: {
      clauseContentId: contentId,
      stakeholderRequirementIds: [str._id],
      systemRequirementId: new mongoose.Types.ObjectId(),
    },
    ...over,
  });
  return req;
}

describe('chainDriftCheck — nur die veränderte Klausel fällt', () => {
  it('unchanged text → nothing staled, nothing touched', async () => {
    await seedChainReq(CLAUSE_1);
    await seedChainReq(CLAUSE_2);
    mockNormWith(ORIGINAL_TEXT);

    const r = await chainDriftCheck(projectId);
    expect(r).toMatchObject({ checked: 2, staled: 0, skipped: 0 });
    const docs = await ComplianceRequirement.find({ projectId }).lean();
    expect(docs.every((d) => !d.regulationVersionMismatch)).toBe(true);
  });

  it('renumbering novella: ONLY the changed clause goes mismatch — the neighbour stays byte-equal (THE-550 as product behaviour)', async () => {
    const changed = await seedChainReq(CLAUSE_1);
    const stable = await seedChainReq(CLAUSE_2);
    mockNormWith(AMENDED_TEXT);

    const r = await chainDriftCheck(projectId);
    expect(r.staled).toBe(1);

    const changedDoc = await ComplianceRequirement.findById(changed._id).lean();
    const stableDoc = await ComplianceRequirement.findById(stable._id).lean();
    expect(changedDoc!.regulationVersionMismatch).toBe(true);
    expect(stableDoc!.regulationVersionMismatch).toBeUndefined(); // byte-gleich trotz Umnummerierung
  });

  it('staling cascades honestly: evidence goes stale, attested falls with a visible reason (THE-558, one source)', async () => {
    const gates = applyHumanGate(emptyGates(), 'attested', 'yes', '507f1f77bcf86cd799439099', 'Nachweis liegt vor');
    const req = await seedChainReq(CLAUSE_1, { gates });
    await Evidence.create({
      projectId,
      requirementId: req._id,
      kind: 'report',
      ref: 'https://wiki.example.com/runbooks/meldung',
      sha256: 'a3f1'.repeat(16),
      collectedAt: new Date(),
      collectedBy: new mongoose.Types.ObjectId(),
    });
    mockNormWith(AMENDED_TEXT);

    await chainDriftCheck(projectId);

    const ev = await Evidence.findOne({ requirementId: req._id }).lean();
    expect(ev!.stale).toBe(true);
    const fresh = await ComplianceRequirement.findById(req._id).lean();
    expect(fresh!.gates!.attested.state).toBe('unknown');
    expect(fresh!.gates!.attested.setBy).toBe('system');
    expect(fresh!.gates!.attested.reason).toMatch(/stale|law text/i);
  });

  it('a world without retrievable text is skipped and counted — never silent', async () => {
    await seedChainReq(CLAUSE_1);
    getNorm.mockResolvedValue(null);

    const r = await chainDriftCheck(projectId);
    expect(r.skipped).toBe(1);
    expect(r.staled).toBe(0);
  });
});
