/**
 * Tests für harmonization.service.buildGroupables (THE-569 Task 2):
 * ChainSystemRequirement → GroupableSysReq — source aus dem regulationKey-
 * Präfix, addresseeClass aus dem Lexikon, actionId aus dem Produktions-
 * Klassifikator, GECACHT mit ontologyVersion (eine Klassifikation ohne
 * Katalog-Stand ist später nicht deutbar, THE-438-Muster).
 */
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { buildGroupables } from '../services/harmonization.service';
import { StakeholderRequirement } from '../models/StakeholderRequirement';
import { ChainSystemRequirement } from '../models/ChainSystemRequirement';
import { NORM_ONTOLOGY } from '@thearchitect/shared';

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
  await Promise.all([StakeholderRequirement.deleteMany({}), ChainSystemRequirement.deleteMany({})]);
});

const projectId = new mongoose.Types.ObjectId();

async function seedSysReq(over: {
  regulationKey: string;
  verpflichteter: string;
  text?: string;
}): Promise<string> {
  const str = await StakeholderRequirement.create({
    projectId,
    regulationKey: over.regulationKey,
    clause: {
      contentId: 'a3f19b2c4d5e6f70',
      text: 'Die Einrichtungen übermitteln eine Meldung.',
    },
    text: 'Das Unternehmen übermittelt eine Meldung.',
    slots: { action: 'Meldung übermitteln', recipient: 'CSIRT', modality: 'pflicht', condition: '' },
    kind: 'requirement',
  });
  const sysReq = await ChainSystemRequirement.create({
    projectId,
    text: over.text ?? 'Das Unternehmen meldet Vorfälle fristgerecht.',
    schutzgut: 'Netzsysteme',
    verpflichteter: over.verpflichteter,
    ausloeser: 'Vorfall',
    nachweis: 'Meldung',
    stakeholderRequirementIds: [str._id],
  });
  return String(sysReq._id);
}

/** classify-Stub: antwortet mit einer festen Handlung, zählt Aufrufe. */
function classifyStub(actionId = 'vorfall-melden-behoerde') {
  let calls = 0;
  const ask = async (): Promise<string> => {
    calls += 1;
    return JSON.stringify({ id: actionId });
  };
  return { ask, calls: () => calls };
}

describe('buildGroupables — Anreicherung mit Cache und Quoten', () => {
  it('builds groupables: source from key prefix, addresseeClass from lexicon, actionId from classifier', async () => {
    const nis2Id = await seedSysReq({ regulationKey: 'nis2:art23', verpflichteter: 'wesentliche Einrichtung' });
    const doraId = await seedSysReq({ regulationKey: 'dora:art19', verpflichteter: 'Finanzunternehmen' });
    const stub = classifyStub();

    const r = await buildGroupables(projectId, { ask: stub.ask });
    expect(r.groupables).toHaveLength(2);

    const nis2 = r.groupables.find((g) => g.id === nis2Id)!;
    expect(nis2.source).toBe('nis2');
    expect(nis2.addresseeClass).toBe('essential_important_entity');
    expect(nis2.actionId).toBe('vorfall-melden-behoerde');
    expect(r.groupables.find((g) => g.id === doraId)!.source).toBe('dora');
    expect(stub.calls()).toBe(2);
    expect(r.stats).toEqual({ total: 2, unmappedAddressee: 0, unclassified: 0 });
  });

  it('caches the classification with ontologyVersion — second run makes zero classify calls', async () => {
    await seedSysReq({ regulationKey: 'nis2:art23', verpflichteter: 'wesentliche Einrichtung' });
    const first = classifyStub();
    await buildGroupables(projectId, { ask: first.ask });
    expect(first.calls()).toBe(1);

    const doc = await ChainSystemRequirement.findOne({ projectId }).lean();
    expect(doc!.actionClassification).toMatchObject({
      actionId: 'vorfall-melden-behoerde',
      ontologyVersion: NORM_ONTOLOGY.ontologyVersion,
    });

    const second = classifyStub();
    const r = await buildGroupables(projectId, { ask: second.ask });
    expect(second.calls()).toBe(0);
    expect(r.groupables[0].actionId).toBe('vorfall-melden-behoerde');
  });

  it('re-classifies when the cached ontologyVersion is stale', async () => {
    const id = await seedSysReq({ regulationKey: 'nis2:art23', verpflichteter: 'wesentliche Einrichtung' });
    await ChainSystemRequirement.updateOne(
      { _id: id },
      { $set: { actionClassification: { actionId: 'zugriffskontrolle', ontologyVersion: '0.0.1' } } },
    );
    const stub = classifyStub('vorfall-melden-behoerde');
    const r = await buildGroupables(projectId, { ask: stub.ask });
    expect(stub.calls()).toBe(1);
    expect(r.groupables[0].actionId).toBe('vorfall-melden-behoerde');
  });

  it('unmapped addressee → excluded from groupables, counted — never paired wrongly', async () => {
    await seedSysReq({ regulationKey: 'nis2:art23', verpflichteter: 'Zahlungsdienstleister nach PSD2' });
    const stub = classifyStub();
    const r = await buildGroupables(projectId, { ask: stub.ask });
    expect(r.groupables).toHaveLength(0);
    expect(r.stats.unmappedAddressee).toBe(1);
    expect(stub.calls()).toBe(0); // kein Klassifikations-Call für Unpaarbares — Kosten sichtbar sparen
  });

  it('unreadable classification → excluded, counted as unclassified, run continues', async () => {
    await seedSysReq({ regulationKey: 'nis2:art23', verpflichteter: 'wesentliche Einrichtung' });
    const ok = await seedSysReq({ regulationKey: 'dora:art19', verpflichteter: 'Finanzunternehmen' });
    let call = 0;
    const ask = async (): Promise<string> => {
      call += 1;
      return call === 1 ? 'GARBAGE' : JSON.stringify({ id: 'vorfall-melden-behoerde' });
    };
    const r = await buildGroupables(projectId, { ask });
    expect(r.stats.unclassified).toBe(1);
    expect(r.groupables.map((g) => g.id)).toEqual([ok]);
  });
});
