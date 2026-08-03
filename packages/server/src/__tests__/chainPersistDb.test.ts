/**
 * Persist-Test der Ketten-Naht (THE-562, Phase 1 von ADR-0008): ein
 * bestätigter Ketten-Kandidat wird zu DREI verknüpften Dokumenten —
 * StakeholderRequirement → ChainSystemRequirement → chain-Refs.
 */
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { persistChainItem, type ChainCandidateDTO } from '../services/chainGenerate.service';
import { StakeholderRequirement } from '../models/StakeholderRequirement';
import { ChainSystemRequirement } from '../models/ChainSystemRequirement';

let mongod: MongoMemoryServer;
beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
});
afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

const chain: ChainCandidateDTO['chain'] = {
  regulationKey: 'nis2:art23',
  clauseContentId: 'a3f19b2c4d5e6f70',
  clausePath: 'Abs. 3',
  clauseText: 'Die Einrichtungen übermitteln binnen 72 Stunden nach Kenntnisnahme eine Meldung an das CSIRT.',
  stakeholderRequirement: {
    text: 'Das Unternehmen übermittelt binnen 72 Stunden nach Kenntnisnahme eine Meldung an das CSIRT.',
    slots: { action: 'Meldung übermitteln', recipient: 'CSIRT', modality: 'pflicht', condition: 'nach Kenntnisnahme' },
    kind: 'requirement',
    deadline: {
      dauer: { wert: 72, einheit: 'h' },
      bezugspunkt: 'kenntnis',
      stufe: null,
      quelle: 'binnen 72 Stunden nach Kenntnisnahme',
    },
  },
  systemRequirement: {
    text: 'Das Unternehmen meldet Sicherheitsvorfälle fristgerecht an die zuständige Stelle.',
    schutzgut: 'Netz- und Informationssysteme',
    verpflichteter: 'wesentliche Einrichtung',
    ausloeser: 'erheblicher Sicherheitsvorfall',
    nachweis: 'Meldung an das CSIRT',
    implementationFree: true,
  },
};

describe('persistChainItem — drei verknüpfte Dokumente', () => {
  it('writes StR + SysReq and returns chain refs that resolve', async () => {
    const projectId = new mongoose.Types.ObjectId();
    const refs = await persistChainItem(projectId, chain);

    const str = await StakeholderRequirement.findById(refs.stakeholderRequirementIds[0]).lean();
    expect(str).not.toBeNull();
    expect(str!.clause.contentId).toBe('a3f19b2c4d5e6f70');
    expect(str!.deadline!.bezugspunkt).toBe('kenntnis');
    expect(str!.kind).toBe('requirement');

    const sysReq = await ChainSystemRequirement.findById(refs.systemRequirementId).lean();
    expect(sysReq).not.toBeNull();
    expect(String(sysReq!.stakeholderRequirementIds[0])).toBe(String(str!._id));
    expect(sysReq!.schutzgut).toBe('Netz- und Informationssysteme');

    expect(refs.clauseContentId).toBe('a3f19b2c4d5e6f70');
  });

  it('a chain without deadline persists WITHOUT a deadline object', async () => {
    const projectId = new mongoose.Types.ObjectId();
    const refs = await persistChainItem(projectId, {
      ...chain,
      stakeholderRequirement: { ...chain.stakeholderRequirement, deadline: null },
    });
    const str = await StakeholderRequirement.findById(refs.stakeholderRequirementIds[0]).lean();
    expect(str!.deadline).toBeUndefined();
  });
});
