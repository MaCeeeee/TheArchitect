/**
 * Tests für remediationBacklink.service (THE-568, Slice A von REQ-001.5).
 *
 * DIE REGEL: der Rückschluss ist MECHANISCH — Join über
 * sourceRef.{standardId, sectionIds} → normId/sectionEId, $addToSet,
 * covered-Recompute. Menschliche Tore werden nie berührt; wer nicht joinbar
 * ist (kein normId, fremde Section), bleibt byte-gleich.
 */
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import {
  linkAppliedElements,
  unlinkAppliedElements,
} from '../services/remediationBacklink.service';
import { ComplianceRequirement } from '../models/ComplianceRequirement';
import { applyHumanGate, emptyGates, deriveCovered } from '../services/requirementGates.service';

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
  await ComplianceRequirement.deleteMany({});
});

const projectId = new mongoose.Types.ObjectId();
const standardId = new mongoose.Types.ObjectId();
const USER = '507f1f77bcf86cd799439099';

const baseReq = (over: Record<string, unknown>) => ({
  projectId,
  regulationId: new mongoose.Types.ObjectId(),
  title: `Req ${Math.random().toString(36).slice(2, 8)} etablieren`,
  description: 'Das Unternehmen etabliert den geforderten Prozess nachweisbar.',
  priority: 'must',
  createdBy: 'human',
  linkedElementIds: [],
  ...over,
});

const sourceRef = { standardId, sectionIds: ['s1', 's2'] };

describe('linkAppliedElements — der mechanische Join', () => {
  it('links matched requirements, derives covered, leaves non-matches untouched', async () => {
    const [a, b, foreign, noNorm] = await ComplianceRequirement.create([
      baseReq({ normId: `upload:${standardId}`, sectionEId: 's1' }),
      baseReq({ normId: `upload:${standardId}`, sectionEId: 's2' }),
      baseReq({ normId: `upload:${standardId}`, sectionEId: 'other' }),
      baseReq({ sectionEId: 's1' }), // Bestand vor THE-390: kein normId → kein Join
    ]);

    const r = await linkAppliedElements({
      projectId,
      sourceRef,
      elementIds: ['el-a', 'el-b'],
    });
    expect(r.linkedRequirements).toBe(2);

    const [a2, b2, f2, n2] = await Promise.all(
      [a, b, foreign, noNorm].map((d) => ComplianceRequirement.findById(d._id).lean()),
    );
    expect(a2!.linkedElementIds.sort()).toEqual(['el-a', 'el-b']);
    expect(b2!.linkedElementIds.sort()).toEqual(['el-a', 'el-b']);
    expect(a2!.gates!.covered.state).toBe('yes');
    expect(a2!.gates!.covered.setBy).toBe('system');
    expect(f2!.linkedElementIds).toEqual([]);
    expect(f2!.gates).toBeUndefined();
    expect(n2!.linkedElementIds).toEqual([]);
  });

  it('is idempotent — a second apply adds no duplicates', async () => {
    const doc = await ComplianceRequirement.create(
      baseReq({ normId: `upload:${standardId}`, sectionEId: 's1' }),
    );
    await linkAppliedElements({ projectId, sourceRef, elementIds: ['el-a'] });
    const again = await linkAppliedElements({ projectId, sourceRef, elementIds: ['el-a'] });
    expect(again.linkedRequirements).toBe(1);
    const fresh = await ComplianceRequirement.findById(doc._id).lean();
    expect(fresh!.linkedElementIds).toEqual(['el-a']);
  });

  it('never touches the human gates — attested stays exactly as set', async () => {
    const gates = applyHumanGate(emptyGates(), 'attested', 'yes', USER, 'Evidenz liegt vor');
    const doc = await ComplianceRequirement.create(
      baseReq({ normId: `upload:${standardId}`, sectionEId: 's1', gates }),
    );
    await linkAppliedElements({ projectId, sourceRef, elementIds: ['el-a'] });
    const fresh = await ComplianceRequirement.findById(doc._id).lean();
    expect(fresh!.gates!.attested.state).toBe('yes');
    expect(fresh!.gates!.attested.setBy).toBe(USER);
    expect(fresh!.gates!.attested.reason).toBe('Evidenz liegt vor');
    expect(fresh!.gates!.covered.state).toBe('yes');
  });

  it('is a no-op without a standardId — zero writes, zero linked', async () => {
    await ComplianceRequirement.create(
      baseReq({ normId: `upload:${standardId}`, sectionEId: 's1' }),
    );
    const r = await linkAppliedElements({ projectId, sourceRef: {}, elementIds: ['el-a'] });
    expect(r.linkedRequirements).toBe(0);
    const fresh = await ComplianceRequirement.findOne({ projectId }).lean();
    expect(fresh!.linkedElementIds).toEqual([]);
  });
});

/**
 * THE-643 — der Rückschluss greift auch in der KORPUS-Welt.
 *
 * Bis hierher baute `joinFilter` den Schlüssel von Hand: `upload:${standardId}`.
 * Für eine Korpus-Norm ergab das `upload:corpus:dsgvo` — einen Schlüssel, den
 * es nirgends gibt. Selbst nach dem Schema-Fix (der Vorschlag entsteht) wäre
 * der Rückschluss also ins Leere gegriffen, und `covered` wäre leer geblieben,
 * obwohl die Maßnahme existiert.
 *
 * Der Schlüssel kommt jetzt aus `sourceRef.normId`. Bestands-Proposals ohne
 * dieses Feld fallen auf die alte Ableitung zurück — das ist der Schutzraum
 * THE-568 und die eigentliche Bedingung dafür, dass diese Änderung additiv ist.
 */
describe('linkAppliedElements — beide Welten (THE-643)', () => {
  const CORPUS_NORM = 'corpus:dsgvo';
  const corpusRef = { normId: CORPUS_NORM, sectionIds: ['dsgvo:art-32'] };

  it('KORPUS: findet die Anforderung über normId — nicht über upload:<id>', async () => {
    const [hit, miss] = await ComplianceRequirement.create([
      baseReq({ normId: CORPUS_NORM, sectionEId: 'dsgvo:art-32' }),
      // Dieselbe Sektion, ANDERES Gesetz: der Join darf nicht über die
      // Sektions-Kennung allein laufen.
      baseReq({ normId: 'corpus:nis2', sectionEId: 'dsgvo:art-32' }),
    ]);

    const r = await linkAppliedElements({
      projectId,
      sourceRef: corpusRef,
      elementIds: ['el-corpus'],
    });
    expect(r.linkedRequirements).toBe(1);

    const [h, m] = await Promise.all(
      [hit, miss].map((d) => ComplianceRequirement.findById(d._id).lean()),
    );
    expect(h!.linkedElementIds).toEqual(['el-corpus']);
    expect(h!.gates!.covered.state).toBe('yes');
    expect(m!.linkedElementIds).toEqual([]);
  });

  it('SCHUTZRAUM THE-568: Bestand ohne normId greift weiter über standardId', async () => {
    // Genau die Proposals, die vor dieser Änderung entstanden sind: sie tragen
    // eine ObjectId und kein `normId`. Bricht dieser Fall, ist der Rückschluss
    // für alles Bestehende tot — das wäre der teuerste denkbare Regress.
    const doc = await ComplianceRequirement.create(
      baseReq({ normId: `upload:${standardId}`, sectionEId: 's1' }),
    );
    const r = await linkAppliedElements({ projectId, sourceRef, elementIds: ['el-legacy'] });
    expect(r.linkedRequirements).toBe(1);
    const fresh = await ComplianceRequirement.findById(doc._id).lean();
    expect(fresh!.linkedElementIds).toEqual(['el-legacy']);
  });

  it('normId gewinnt, wenn beide Felder da sind — der kanonische Schlüssel führt', async () => {
    const doc = await ComplianceRequirement.create(
      baseReq({ normId: CORPUS_NORM, sectionEId: 'dsgvo:art-32' }),
    );
    const r = await linkAppliedElements({
      projectId,
      // Ein Proposal, das BEIDES trägt — so schreibt es der Upload-Weg ab jetzt.
      // Hier steht absichtlich eine unpassende standardId daneben: gewönne sie,
      // fände der Join nichts.
      sourceRef: { ...corpusRef, standardId },
      elementIds: ['el-both'],
    });
    expect(r.linkedRequirements).toBe(1);
    const fresh = await ComplianceRequirement.findById(doc._id).lean();
    expect(fresh!.linkedElementIds).toEqual(['el-both']);
  });

  it('NEGATIV-KONTROLLE: weder normId noch standardId bleibt ein No-op', async () => {
    await ComplianceRequirement.create(baseReq({ normId: CORPUS_NORM, sectionEId: 'dsgvo:art-32' }));
    // advisor/manual — dokumentierter No-op, kein Fehler.
    const r = await linkAppliedElements({
      projectId,
      sourceRef: { sectionIds: ['dsgvo:art-32'] },
      elementIds: ['el-x'],
    });
    expect(r.linkedRequirements).toBe(0);
    const fresh = await ComplianceRequirement.findOne({ projectId }).lean();
    expect(fresh!.linkedElementIds).toEqual([]);
  });

  it('der Rückweg ist symmetrisch — unlink findet dieselbe Korpus-Anforderung', async () => {
    const doc = await ComplianceRequirement.create(
      baseReq({ normId: CORPUS_NORM, sectionEId: 'dsgvo:art-32' }),
    );
    await linkAppliedElements({ projectId, sourceRef: corpusRef, elementIds: ['el-corpus'] });
    const r = await unlinkAppliedElements({
      projectId,
      sourceRef: corpusRef,
      elementIds: ['el-corpus'],
    });
    expect(r.linkedRequirements).toBe(1);
    const fresh = await ComplianceRequirement.findById(doc._id).lean();
    expect(fresh!.linkedElementIds).toEqual([]);
  });
});

describe('unlinkAppliedElements — der symmetrische Rückweg', () => {
  it('removes the element ids and re-derives covered (empty → no, system reason)', async () => {
    const doc = await ComplianceRequirement.create(
      baseReq({ normId: `upload:${standardId}`, sectionEId: 's1' }),
    );
    await linkAppliedElements({ projectId, sourceRef, elementIds: ['el-a'] });
    const r = await unlinkAppliedElements({ projectId, sourceRef, elementIds: ['el-a'] });
    expect(r.linkedRequirements).toBe(1);

    const fresh = await ComplianceRequirement.findById(doc._id).lean();
    expect(fresh!.linkedElementIds).toEqual([]);
    expect(fresh!.gates!.covered).toMatchObject({ ...deriveCovered([]), setAt: expect.any(String) });
  });

  it('leaves manually linked elements alone — only the applied ids are pulled', async () => {
    const doc = await ComplianceRequirement.create(
      baseReq({ normId: `upload:${standardId}`, sectionEId: 's1', linkedElementIds: ['manual-1'] }),
    );
    await linkAppliedElements({ projectId, sourceRef, elementIds: ['el-a'] });
    await unlinkAppliedElements({ projectId, sourceRef, elementIds: ['el-a'] });
    const fresh = await ComplianceRequirement.findById(doc._id).lean();
    expect(fresh!.linkedElementIds).toEqual(['manual-1']);
    expect(fresh!.gates!.covered.state).toBe('yes'); // manual-1 deckt weiter
  });
});
