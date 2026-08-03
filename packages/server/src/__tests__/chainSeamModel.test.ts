/**
 * Tests für die additive Naht am ComplianceRequirement (THE-562, Phase 1 von
 * ADR-0008): `createdBy: 'chain'` + `chain`-Rückverweise.
 *
 * DIE REGEL: additiv heißt beweisbar additiv — ein Bestands-Dokument ohne
 * `chain` bleibt exakt so gültig wie gestern.
 */
import { ComplianceRequirement } from '../models/ComplianceRequirement';

const base = {
  projectId: '507f1f77bcf86cd799439011',
  regulationId: '507f1f77bcf86cd799439012',
  title: 'Meldeprozess etablieren',
  description: 'Das Unternehmen übermittelt fristgerecht eine Meldung an das CSIRT.',
  priority: 'must',
  createdBy: 'llm',
  extractionConfidence: 0.9,
  extractionRationale: 'Art. 23 Abs. 3 verlangt die Meldung ausdruecklich.',
};

describe('ComplianceRequirement — Ketten-Naht (additiv)', () => {
  it('a legacy document WITHOUT chain stays valid — the regression that matters', () => {
    expect(new ComplianceRequirement(base).validateSync()).toBeUndefined();
  });

  it("accepts createdBy: 'chain' with chain refs", () => {
    const doc = new ComplianceRequirement({
      ...base,
      createdBy: 'chain',
      extractionConfidence: undefined,
      extractionRationale: undefined,
      chain: {
        clauseContentId: 'a3f19b2c4d5e6f70',
        clausePath: 'Abs. 3',
        stakeholderRequirementIds: ['507f1f77bcf86cd799439021'],
        systemRequirementId: '507f1f77bcf86cd799439022',
      },
    });
    expect(doc.validateSync()).toBeUndefined();
  });

  it('rejects a chain block with a malformed clauseContentId', () => {
    const doc = new ComplianceRequirement({
      ...base,
      createdBy: 'chain',
      extractionConfidence: undefined,
      extractionRationale: undefined,
      chain: {
        clauseContentId: 'nope',
        stakeholderRequirementIds: ['507f1f77bcf86cd799439021'],
        systemRequirementId: '507f1f77bcf86cd799439022',
      },
    });
    expect(doc.validateSync()).toBeDefined();
  });

  it('rejects a chain block without stakeholder back-references', () => {
    const doc = new ComplianceRequirement({
      ...base,
      createdBy: 'chain',
      extractionConfidence: undefined,
      extractionRationale: undefined,
      chain: {
        clauseContentId: 'a3f19b2c4d5e6f70',
        stakeholderRequirementIds: [],
        systemRequirementId: '507f1f77bcf86cd799439022',
      },
    });
    expect(doc.validateSync()).toBeDefined();
  });

  it('chain defaults to undefined — absence is the legacy state, not an empty object', () => {
    expect(new ComplianceRequirement(base).chain).toBeUndefined();
  });
});
