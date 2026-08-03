/**
 * Tests für die Ketten-Modelle (THE-561, Phase 1 von ADR-0008).
 *
 * DIE ZWEI REGELN:
 *   1. Der Klausel-Snapshot ist Teil des Dokuments — die Referenz muss auch
 *      nach einer Novelle auflösbar sein (contentId aus THE-560).
 *   2. Rückverweis-Pflicht ist SCHEMA, nicht Konvention: eine
 *      Systemanforderung ohne Stakeholder-Anforderung ist ungültig
 *      (ISO 15288 §6.4.3.2 f).
 */
import { StakeholderRequirement } from '../models/StakeholderRequirement';
import { ChainSystemRequirement } from '../models/ChainSystemRequirement';

const oid = '507f1f77bcf86cd799439011';

const validStR = {
  projectId: oid,
  regulationKey: 'nis2:art23',
  clause: {
    contentId: 'a3f19b2c4d5e6f70',
    positionalId: 'nis2:art23:c04',
    path: 'Abs. 3',
    text: 'Die Einrichtungen übermitteln binnen 72 Stunden eine Meldung.',
    regulationVersionHash: 'v2-hash',
  },
  text: 'Das Unternehmen übermittelt binnen 72 Stunden nach Kenntnisnahme eine Meldung an das CSIRT.',
  slots: { action: 'Meldung übermitteln', recipient: 'CSIRT', modality: 'muss', condition: 'nach Kenntnisnahme' },
  kind: 'requirement',
};

describe('StakeholderRequirement', () => {
  it('accepts a well-formed document', () => {
    expect(new StakeholderRequirement(validStR).validateSync()).toBeUndefined();
  });

  it('rejects a malformed clause contentId — the reference axis must be sound', () => {
    const bad = { ...validStR, clause: { ...validStR.clause, contentId: 'not-hex' } };
    expect(new StakeholderRequirement(bad).validateSync()).toBeDefined();
  });

  it('rejects kinds outside requirement|constraint', () => {
    expect(new StakeholderRequirement({ ...validStR, kind: 'wish' }).validateSync()).toBeDefined();
  });

  it('is valid WITHOUT a deadline — no invented deadline object (THE-561 AC 3)', () => {
    const doc = new StakeholderRequirement(validStR);
    expect(doc.validateSync()).toBeUndefined();
    expect(doc.deadline).toBeUndefined();
  });

  it('carries a deadline ⟨Dauer, Bezugspunkt, Stufe⟩ when the clause has one', () => {
    const doc = new StakeholderRequirement({
      ...validStR,
      deadline: {
        dauer: { wert: 72, einheit: 'h' },
        bezugspunkt: 'kenntnis',
        stufe: 'zwischen',
        quelle: 'binnen 72 Stunden nach Kenntnisnahme',
      },
    });
    expect(doc.validateSync()).toBeUndefined();
    expect(doc.deadline!.bezugspunkt).toBe('kenntnis');
  });
});

describe('ChainSystemRequirement', () => {
  const validSysReq = {
    projectId: oid,
    text: 'Das Unternehmen muss Sicherheitsvorfälle fristgerecht an die zuständige Stelle melden können.',
    schutzgut: 'Netz- und Informationssysteme',
    verpflichteter: 'wesentliche Einrichtung',
    ausloeser: 'erheblicher Sicherheitsvorfall',
    nachweis: 'Meldung an das CSIRT',
    stakeholderRequirementIds: [oid],
  };

  it('accepts a well-formed document', () => {
    expect(new ChainSystemRequirement(validSysReq).validateSync()).toBeUndefined();
  });

  it('REJECTS an empty back-reference list — traceability is schema, not convention', () => {
    expect(
      new ChainSystemRequirement({ ...validSysReq, stakeholderRequirementIds: [] }).validateSync(),
    ).toBeDefined();
  });
});
