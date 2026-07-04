/**
 * build-self-golden Tests — reine Transformation (buildGoldenDraft/profiledCandidates).
 *
 * Run: cd packages/server && npx jest src/__tests__/buildSelfGolden.test.ts
 */
import { buildGoldenDraft, profiledCandidates, slugifyCaseId } from '../scripts/build-self-golden';
import { GoldenSetSchema } from '../evals/goldenSet';

const facts = {
  v: 1, kind: 'store', holds: ['account:doc', 'credentials:doc'], does: [],
  ops: { loc: 'eu', op: 'self', tier: 'core' },
};

const elements = [
  { id: 'data-mongo', name: 'MongoDB', type: 'data_object', description: 'Users', metadata: { compliance: facts } },
  { id: 'wiki', name: 'Wiki', type: 'application', description: 'Notes', metadata: {} }, // kein Profil → raus
  { id: 'stakeholder-1', name: 'Founder', type: 'stakeholder' }, // kein metadata → raus
];

const regs = [
  { source: 'dsgvo', paragraphNumber: 'Art. 17', title: 'Erasure', fullText: 'x'.repeat(60), language: 'en', jurisdiction: 'EU' },
  { source: 'dsgvo', paragraphNumber: 'Art. 30', title: 'ROPA', fullText: 'y'.repeat(60), language: 'en', jurisdiction: 'EU' },
  { source: 'dsgvo', paragraphNumber: 'Art. X', title: 'too short', fullText: 'short', language: 'en', jurisdiction: 'EU' }, // < 50 → raus
];

describe('slugifyCaseId()', () => {
  it('makes a stable, filesystem-safe id', () => {
    expect(slugifyCaseId('dsgvo', 'Art. 17')).toBe('dsgvo-art-17');
    expect(slugifyCaseId('dsgvo', 'Art. 83')).toBe('dsgvo-art-83');
  });
});

describe('profiledCandidates()', () => {
  it('keeps only profiled elements and serializes facts into the description', () => {
    const cands = profiledCandidates(elements);
    expect(cands.map(c => c.id)).toEqual(['data-mongo']);
    expect(cands[0].description).toContain('Users');
    expect(cands[0].description).toContain('facts: store; holds account,credentials');
  });
});

describe('buildGoldenDraft()', () => {
  it('produces a schema-valid draft with empty gold and short regs dropped', () => {
    const draft = buildGoldenDraft(regs, elements);
    expect(() => GoldenSetSchema.parse(draft)).not.toThrow();
    expect(draft.frozen).toBe(false);
    expect(draft.cases.map(c => c.caseId)).toEqual(['dsgvo-art-17', 'dsgvo-art-30']); // Art. X raus
    expect(draft.cases.every(c => c.goldElementIds.length === 0)).toBe(true);
    expect(draft.cases[0].candidates).toHaveLength(1);
  });

  it('throws when no element carries a compliance profile', () => {
    expect(() => buildGoldenDraft(regs, [{ id: 'x', name: 'X', type: 'application' }])).toThrow(/profilierten/);
  });
});
