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
  previewCandidatePairs,
  DEFAULT_MAX_JUDGED_PAIRS,
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

async function seed(
  regulationKey: string,
  verpflichteter: string,
  opts: { classified?: boolean } = {},
): Promise<string> {
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
    ...(opts.classified === false
      ? {}
      : {
          actionClassification: {
            actionId: 'vorfall-melden-behoerde',
            ontologyVersion: require('@thearchitect/shared').NORM_ONTOLOGY.ontologyVersion,
          },
        }),
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


  // ─── THE-591: die Negativ-Kontrolle des Anschlusses ────────────────────
  //
  // Der Adressat kommt jetzt aus dem Korpus. Die entscheidende Frage ist NICHT,
  // ob dadurch mehr Paare entstehen — sondern ob das Verdraengungs-Gate weiter
  // greift. Gemessen in THE-589: Die Kante `dora-prevails-nis2` haengt an
  // `financial_entity`; eine generische Rolle macht das Gate blind.
  //
  // Hier liefert der KORPUS die Rollen. Das Gate muss unveraendert schliessen.
  it('THE-591 NEGATIV-KONTROLLE: corpus roles do not open the displacement gate', async () => {
    const nis2 = await seed('nis2:art23', 'irgendein Freitext ohne Lexikon-Treffer');
    const dora = await seed('dora:art19', 'ebenfalls unmappbarer Freitext');

    // Beide waeren ohne Korpus unmappbar — die Rollen kommen ausschliesslich
    // von dort. Genau so wird sichtbar, ob das Gate mit ihnen arbeitet.
    const judged: string[] = [];
    const r = await proposeSharedMeasures(projectId, {
      ask: askNever,
      judge: async (_s, user) => {
        judged.push(user);
        return JSON.stringify({ relation: 'subset', wider: 'A', why: 'stub' });
      },
      maxJudgedPairs: 50,
      fetchProvisions: async (keys) =>
        keys.map((k) => ({
          regulationKey: k,
          versionHash: 'v1',
          typing: {
            partyRole: k.startsWith('dora') ? 'financial_entity' : 'essential_important_entity',
            status: 'suggested',
            versionHash: 'v1',
          },
        })) as never,
    });

    // Die Rollen stammen aus dem Korpus — nicht aus dem Lexikon.
    expect(r.stats.addresseeFromCorpus).toBe(2);
    expect(r.stats.addresseeFromLexicon).toBe(0);

    // UND das Gate schliesst trotzdem: das Paar erreicht den Richter nie.
    expect(r.grouping.excludedByDisplacement).toHaveLength(1);
    expect([r.grouping.excludedByDisplacement[0].a, r.grouping.excludedByDisplacement[0].b].sort()).toEqual(
      [dora, nis2].sort(),
    );
    expect(judged).toHaveLength(0);
    expect(r.stats.pairsJudged).toBe(0);
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

/**
 * THE-590 Slice 1 — die Vorschau.
 *
 * Der Kern ist eine Selbstverstaendlichkeit, die leicht verlorengeht: **eine
 * Kostenvorschau, die selbst Kosten verursacht, hebt sich auf.**
 * `buildGroupables` klassifiziert heute jede Anforderung ohne gueltigen
 * Cache-Eintrag — eine naive Vorschau wuerde also genau die Modellaufrufe
 * ausloesen, vor denen sie warnen soll.
 *
 * Durchgesetzt wird das nicht mit einem Schalter, sondern ueber die
 * ABHAENGIGKEIT: ohne `ask` gibt es keinen Klassifikator, also kann nicht
 * klassifiziert werden. Ein boolescher Schalter kann falsch stehen; eine
 * fehlende Abhaengigkeit kann es nicht.
 */
describe('previewCandidatePairs (THE-590)', () => {
  it('counts the candidate pairs without a judge and without a classifier', async () => {
    await seed('nis2:art23', 'wesentliche Einrichtung');
    await seed('dsgvo:art33', 'Verantwortlicher');

    const preview = await previewCandidatePairs(projectId, { cap: DEFAULT_MAX_JUDGED_PAIRS });

    expect(preview.candidatePairs).toBe(1);
    expect(preview.total).toBe(2);
    expect(preview.needsClassification).toBe(0);
    expect(preview.wouldCap).toBe(0);
    expect(preview.cap).toBe(DEFAULT_MAX_JUDGED_PAIRS);
  });

  // Die Verdraengung gehoert getrennt ausgewiesen: ein ausgeschlossenes Paar
  // ist KEIN Kandidat, der weggekappt wurde (THE-563).
  it('reports displaced pairs separately — they were never candidates', async () => {
    await seed('nis2:art23', 'wesentliche Einrichtung');
    await seed('dora:art19', 'Finanzunternehmen');

    const preview = await previewCandidatePairs(projectId, { cap: DEFAULT_MAX_JUDGED_PAIRS });

    expect(preview.excludedByDisplacement).toBe(1);
    expect(preview.candidatePairs).toBe(0);
  });

  it('names what it could NOT place — the count is a floor, not a promise', async () => {
    await seed('nis2:art23', 'wesentliche Einrichtung');
    await seed('dsgvo:art33', 'Verantwortlicher', { classified: false });

    const preview = await previewCandidatePairs(projectId, { cap: DEFAULT_MAX_JUDGED_PAIRS });

    expect(preview.total).toBe(2);
    expect(preview.needsClassification).toBe(1);
    // Ohne die zweite Seite gibt es kein Paar — und die Vorschau sagt WARUM.
    expect(preview.candidatePairs).toBe(0);
  });

  it('leaves the unclassified requirement untouched — the preview does not write', async () => {
    await seed('nis2:art23', 'wesentliche Einrichtung');
    await seed('dsgvo:art33', 'Verantwortlicher', { classified: false });

    await previewCandidatePairs(projectId, { cap: DEFAULT_MAX_JUDGED_PAIRS });

    const after = await ChainSystemRequirement.findOne({ projectId, text: /dsgvo/ });
    expect(after?.actionClassification).toBeFalsy();
  });

  it('announces the capping BEFORE the run', async () => {
    await seed('nis2:art23', 'wesentliche Einrichtung');
    await seed('dsgvo:art33', 'Verantwortlicher');

    const preview = await previewCandidatePairs(projectId, { cap: 0 });

    expect(preview.candidatePairs).toBe(1);
    expect(preview.wouldCap).toBe(1);
  });

  // Die tragende Zusage: was die Vorschau ankuendigt, urteilt der Lauf auch.
  // Zwei Kopien desselben Filters waeren genau die Sorte Duplikat, die
  // auseinanderlaeuft — dann zeigte die Vorschau eine Zahl, die nie eintritt.
  it('agrees with the real run — the preview and the judge see the same pairs', async () => {
    await seed('nis2:art23', 'wesentliche Einrichtung');
    await seed('dsgvo:art33', 'Verantwortlicher');
    await seed('dora:art19', 'Finanzunternehmen');

    const preview = await previewCandidatePairs(projectId, { cap: DEFAULT_MAX_JUDGED_PAIRS });
    const run = await proposeSharedMeasures(projectId, {
      ask: askNever,
      judge: async () => JSON.stringify({ relation: 'unrelated', why: 'stub' }),
      maxJudgedPairs: DEFAULT_MAX_JUDGED_PAIRS,
    });

    expect(preview.candidatePairs).toBe(run.grouping.candidatePairs);
    expect(preview.excludedByDisplacement).toBe(run.grouping.excludedByDisplacement.length);
    expect(run.stats.pairsJudged).toBe(preview.candidatePairs);
  });
});
