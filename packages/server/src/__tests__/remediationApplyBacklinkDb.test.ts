/**
 * Integrations-Test des Rückschlusses (THE-568 Task 2): applyProposal
 * verlinkt die NEU erzeugten Element-Ids (nicht die tempIds!) mit den
 * auslösenden Requirements; rollbackProposal nimmt sie symmetrisch zurück —
 * VOR dem Leeren von appliedElementIds (der Plan-Watch-Point).
 *
 * Neo4j ist gemockt — geprüft wird die Mongo-Seite der Schleife.
 */
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';

jest.mock('../config/neo4j', () => ({
  runCypher: jest.fn().mockResolvedValue([]),
  runCypherTransaction: jest.fn().mockResolvedValue(undefined),
  serializeNeo4jProperties: (o: Record<string, unknown>) => o,
}));

import { applyProposal, rollbackProposal } from '../services/remediation-apply.service';
import { RemediationProposal } from '../models/RemediationProposal';
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
  await Promise.all([ComplianceRequirement.deleteMany({}), RemediationProposal.deleteMany({})]);
});

const projectId = new mongoose.Types.ObjectId();
const standardId = new mongoose.Types.ObjectId();
const userId = new mongoose.Types.ObjectId().toString();

const proposalElement = {
  tempId: 't1',
  name: 'Incident Reporting Process',
  type: 'process',
  layer: 'business',
  togafDomain: 'business',
  description: 'Handles regulatory incident reporting',
  status: 'target',
  riskLevel: 'medium',
  maturityLevel: 1,
  confidence: 0.9,
  reasoning: 'closes the reporting gap',
};

const makeProposal = (over: Record<string, unknown> = {}) =>
  RemediationProposal.create({
    projectId,
    source: 'compliance',
    sourceRef: { standardId, sectionIds: ['s1'] },
    title: 'Close reporting gap',
    description: 'Adds the missing reporting process',
    elements: [proposalElement],
    connections: [],
    status: 'validated',
    confidence: 0.9,
    createdBy: new mongoose.Types.ObjectId(),
    appliedElementIds: [],
    appliedConnectionIds: [],
    ...over,
  });

const makeRequirement = () =>
  ComplianceRequirement.create({
    projectId,
    regulationId: new mongoose.Types.ObjectId(),
    title: 'Meldeprozess etablieren',
    description: 'Das Unternehmen etabliert einen nachweisbaren Meldeprozess.',
    priority: 'must',
    createdBy: 'human',
    normId: `upload:${standardId}`,
    sectionEId: 's1',
    linkedElementIds: [],
  });

describe('applyProposal → Rückschluss', () => {
  it('links the freshly created element ids and reports the count', async () => {
    const proposal = await makeProposal();
    const req = await makeRequirement();

    const result = await applyProposal(projectId.toString(), 'ws1', proposal.id, userId);
    expect(result.linkedRequirements).toBe(1);
    expect(result.elementIds).toHaveLength(1);

    const fresh = await ComplianceRequirement.findById(req._id).lean();
    expect(fresh!.linkedElementIds).toEqual(result.elementIds); // echte Ids, nicht tempIds
    expect(fresh!.gates!.covered.state).toBe('yes');
  });

  it('advisor proposals stay a no-op for requirements', async () => {
    const proposal = await makeProposal({ source: 'advisor', sourceRef: { insightIds: ['i1'] } });
    const req = await makeRequirement();

    const result = await applyProposal(projectId.toString(), 'ws1', proposal.id, userId);
    expect(result.linkedRequirements).toBe(0);

    const fresh = await ComplianceRequirement.findById(req._id).lean();
    expect(fresh!.linkedElementIds).toEqual([]);
    expect(fresh!.gates).toBeUndefined();
  });
});

describe('rollbackProposal → symmetrischer Rückweg', () => {
  it('removes the links again and re-derives covered — before appliedElementIds is cleared', async () => {
    const proposal = await makeProposal();
    const req = await makeRequirement();

    const applied = await applyProposal(projectId.toString(), 'ws1', proposal.id, userId);
    await rollbackProposal(proposal.id);

    const fresh = await ComplianceRequirement.findById(req._id).lean();
    expect(fresh!.linkedElementIds).toEqual([]);
    expect(fresh!.gates!.covered.state).toBe('no');
    expect(applied.elementIds).toHaveLength(1); // der Link existierte wirklich
  });
});
