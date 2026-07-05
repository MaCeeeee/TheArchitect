/**
 * Requirement-Layer Tests — Schema/Loader, Prädikat-Stimme, Kappa-Vergleich,
 * Worksheet-Bias-Freiheit. THE-378 (Requirement-Layer-Pivot).
 *
 * Run: cd packages/server && npx jest src/__tests__/requirementGolden.test.ts
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  loadRequirementGolden,
  predictedElementIds,
  RequirementGoldenError,
  DEFAULT_REQUIREMENTS_PATH,
  type RequirementGoldenSet,
} from '../evals/requirementsGolden';
import {
  compareRequirementSets,
  rulesGoldByReq,
} from '../scripts/requirement-kappa';
import { renderRequirementForm } from '../scripts/requirement-worksheet';

const facts = {
  holder: { v: 1, kind: 'store', holds: ['account:doc'], does: [], ops: { loc: 'eu', op: 'self', tier: 'core' } },
  vendor: { v: 1, kind: 'external', holds: [], does: [], ops: { loc: 'us', op: 'vendor_processor', tier: 'support' } },
};

function set(overrides: Partial<RequirementGoldenSet> = {}): RequirementGoldenSet {
  return {
    version: 'req-test',
    frozen: false,
    rubricRef: '../RUBRIC.md',
    candidates: [
      { id: 'db', name: 'DB', type: 'data_object', description: 'x', facts: facts.holder },
      { id: 'llm', name: 'LLM API', type: 'technology_service', description: 'y', facts: facts.vendor },
    ],
    requirements: [
      { reqId: 'r-erase', source: 'dsgvo', paragraphNumber: 'Art. 17', title: 'Erase personal data', description: 'delete on request', priority: 'must', predicate: 'gdpr.art17', goldElementIds: [] },
      { reqId: 'r-dpa', source: 'dsgvo', paragraphNumber: 'Art. 28', title: 'Bind processors', description: 'bind external processors via a DPA', priority: 'must', predicate: 'gdpr.art28', goldElementIds: [] },
    ],
    ...overrides,
  };
}

const tmp = (obj: unknown): string => {
  const p = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'req-')), 'set.json');
  fs.writeFileSync(p, JSON.stringify(obj));
  return p;
};

describe('loadRequirementGolden()', () => {
  it('loads the committed self requirement set (frozen baseline)', () => {
    const s = loadRequirementGolden(DEFAULT_REQUIREMENTS_PATH);
    expect(s.requirements.length).toBeGreaterThanOrEqual(10);
    expect(s.candidates.length).toBeGreaterThanOrEqual(30);
    expect(s.frozen).toBe(true); // adjudiziert + eingefroren (Kappa 0,709 Mensch-vs-Regel)
    expect(s.version).toBe('req-self-v1');
    // Gap-Befunde (leer): a6-lawbasis, a30-ropa, a33-breach
    expect(s.requirements.filter(r => r.goldElementIds.length === 0)).toHaveLength(3);
  });

  it('rejects an unknown predicate', () => {
    const s = set();
    s.requirements[0].predicate = 'gdpr.art999';
    expect(() => loadRequirementGolden(tmp(s))).toThrow(/unknown predicate/);
  });

  it('rejects goldElementIds outside the candidate list and duplicate reqIds', () => {
    const bad = set();
    bad.requirements[0].goldElementIds = ['ghost'];
    expect(() => loadRequirementGolden(tmp(bad))).toThrow(/not in candidates/);
    const dup = set();
    dup.requirements[1].reqId = 'r-erase';
    expect(() => loadRequirementGolden(tmp(dup))).toThrow(/Duplicate reqId/);
  });
});

describe('predictedElementIds() — deterministische dritte Stimme', () => {
  it('maps the erasure predicate to doc-holders and the DPA predicate to vendor_processors', () => {
    const s = set();
    expect(predictedElementIds(s.requirements[0], s.candidates)).toEqual(['db']); // art17 → doc holder
    expect(predictedElementIds(s.requirements[1], s.candidates)).toEqual(['llm']); // art28 → vendor
  });

  it('returns null when a requirement carries no predicate', () => {
    const s = set();
    delete s.requirements[0].predicate;
    expect(predictedElementIds(s.requirements[0], s.candidates)).toBeNull();
  });
});

describe('compareRequirementSets() + rulesGoldByReq()', () => {
  it('is 1.0 kappa when human labels exactly match the predicate voice', () => {
    const s = set();
    s.requirements[0].goldElementIds = ['db'];
    s.requirements[1].goldElementIds = ['llm'];
    const res = compareRequirementSets(s, rulesGoldByReq(s));
    expect(res.kappa).toBe(1);
    expect(res.agreement).toBe(1);
    expect(res.disagreements).toHaveLength(0);
  });

  it('surfaces directional disagreements', () => {
    const s = set();
    s.requirements[0].goldElementIds = ['db', 'llm']; // human over-includes llm on erasure
    s.requirements[1].goldElementIds = []; // human misses the vendor on DPA
    const res = compareRequirementSets(s, rulesGoldByReq(s));
    const erase = res.disagreements.find(d => d.reqId === 'r-erase')!;
    expect(erase.aOnly).toEqual(['llm']); // human-only
    const dpa = res.disagreements.find(d => d.reqId === 'r-dpa')!;
    expect(dpa.bOnly).toEqual(['llm']); // rules-only (human missed)
    expect(res.kappa).toBeLessThan(1);
  });
});

describe('renderRequirementForm() — bias-frei', () => {
  const html = renderRequirementForm((() => {
    const s = set();
    s.requirements[0].goldElementIds = ['db']; // darf NICHT ins HTML lecken
    s.requirements[0].notes = 'secret rationale';
    return s;
  })());

  it('renders one card per requirement with priority + description', () => {
    expect(html.startsWith('<!doctype html>')).toBe(true);
    expect((html.match(/class="req"/g) ?? [])).toHaveLength(2);
    expect(html).toContain('Erase personal data');
    expect(html).toContain('pri-must');
  });

  it('does not pre-check boxes and does not leak gold values / notes into the embedded data', () => {
    expect(html).not.toMatch(/<input[^>]*\bchecked\b/);
    expect(html).not.toContain('secret rationale'); // notes dürfen nicht lecken
    // die eingebetteten Blind-Daten (const SET) dürfen kein Gold vorbelegen
    const embedded = html.slice(html.indexOf('const SET ='), html.indexOf('function updateProg'));
    expect(embedded).not.toContain('goldElementIds');
    expect(embedded).not.toContain('"db"]'); // kein gold-Array [..,"db"] vorbelegt
  });
});
