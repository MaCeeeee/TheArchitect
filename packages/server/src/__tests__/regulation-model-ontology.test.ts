/**
 * THE-413 proof: the Regulation schema accepts EVERY ontology source without
 * an enum edit — the test iterates NORM_SOURCE_IDS instead of a hardcoded
 * list. togaf/archimate entered ONLY as data rows; if they validate here,
 * "new source = data" holds at the schema boundary.
 */
import mongoose from 'mongoose';
import { Regulation } from '../models/Regulation';
import { Policy } from '../models/Policy';
import { NORM_SOURCE_IDS } from '@thearchitect/shared';

const base = {
  projectId: new mongoose.Types.ObjectId(),
  jurisdiction: 'EU',
  paragraphNumber: 'Art. 1',
  title: 'Test title',
  fullText: 'x'.repeat(60),
  sourceUrl: 'https://example.org/law',
  effectiveFrom: new Date('2024-01-01'),
  language: 'en',
};

describe('Regulation.source is ontology-driven (THE-413)', () => {
  it.each(NORM_SOURCE_IDS)('accepts ontology source "%s" without any enum edit', (source) => {
    const err = new Regulation({ ...base, source }).validateSync();
    expect(err?.errors?.source).toBeUndefined();
  });

  it('rejects a source missing from the ontology, pointing at the registry', () => {
    const err = new Regulation({ ...base, source: 'not-in-ontology' }).validateSync();
    expect(err?.errors?.source).toBeDefined();
    expect(String(err?.errors?.source?.message)).toContain('ontology');
  });

  it('rejects a jurisdiction missing from the ontology', () => {
    const err = new Regulation({ ...base, source: 'dsgvo', jurisdiction: 'XX' }).validateSync();
    expect(err?.errors?.jurisdiction).toBeDefined();
  });

  it('jurisdiction matching is exact-case (lowercase rejected — intentional)', () => {
    const err = new Regulation({ ...base, source: 'dsgvo', jurisdiction: 'eu' }).validateSync();
    expect(err?.errors?.jurisdiction).toBeDefined();
  });

  it('null source is still rejected — by required, not by the ontology validator', () => {
    const err = new Regulation({ ...base, source: null }).validateSync();
    expect(err?.errors?.source).toBeDefined();
  });
});

describe('Policy.source is ontology-driven (THE-413)', () => {
  // Policy.ts required fields: projectId, name, category, createdBy (rest have defaults).
  const policyBase = {
    projectId: new mongoose.Types.ObjectId(),
    name: 'Test Policy',
    category: 'compliance' as const,
    createdBy: new mongoose.Types.ObjectId(),
  };

  it.each(['togaf', 'archimate', 'nis2', 'custom'])('accepts ontology source "%s"', (source) => {
    const err = new Policy({ ...policyBase, source }).validateSync();
    expect(err?.errors?.source).toBeUndefined();
  });

  it('rejects a non-ontology source', () => {
    const err = new Policy({ ...policyBase, source: 'foo' }).validateSync();
    expect(err?.errors?.source).toBeDefined();
  });

  it("null source passes the validator (enum parity) — presence is required()'s job", () => {
    const err = new Policy({ ...policyBase, source: null }).validateSync();
    expect(err?.errors?.source).toBeUndefined();
  });
});
