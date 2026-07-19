/**
 * THE-413 proof: the crawler's Regulation (corpus) schema accepts EVERY
 * ontology source without an enum edit — the test iterates NORM_SOURCE_IDS
 * instead of a hardcoded list. togaf/archimate entered ONLY as data rows; if
 * they validate here, "new source = data" holds at the corpus write boundary
 * (Server B), matching the server-side Regulation model (THE-413).
 */
import { Regulation } from '../db/regulation.model';
import { NORM_SOURCE_IDS, LANGUAGE_IDS, NORM_ONTOLOGY } from '@thearchitect/shared';

const base = {
  regulationKey: 'dsgvo:art-1',
  versionHash: 'a'.repeat(64),
  jurisdiction: 'EU',
  paragraphNumber: 'Art. 1',
  title: 'Test title',
  fullText: 'x'.repeat(60),
  sourceUrl: 'https://example.org/law',
  effectiveFrom: new Date('2024-01-01'),
  language: 'en',
};

describe('crawler Regulation.source is ontology-driven (THE-413)', () => {
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

  it('null source is still rejected — by required, not by the ontology validator (crawler: source is required)', () => {
    const err = new Regulation({ ...base, source: null }).validateSync();
    expect(err?.errors?.source).toBeDefined();
  });
});

describe('Regulation.language is ontology-driven (THE-417)', () => {
  it.each(LANGUAGE_IDS)('accepts ontology language "%s"', (language) => {
    const err = new Regulation({ ...base, source: 'dsgvo', language }).validateSync();
    expect(err?.errors?.language).toBeUndefined();
  });
  it('rejects a language missing from the ontology', () => {
    const err = new Regulation({ ...base, source: 'dsgvo', language: 'fr' }).validateSync();
    expect(err?.errors?.language).toBeDefined();
  });
  it('null language still rejected — by required, not the validator', () => {
    const err = new Regulation({ ...base, source: 'dsgvo', language: null }).validateSync();
    expect(err?.errors?.language).toBeDefined();
  });
});

it('Regulation accepts + keeps the ontologyVersion stamp (THE-417 AC-2)', () => {
  const doc = new Regulation({
    ...base,
    source: 'dsgvo',
    ontologyVersion: NORM_ONTOLOGY.ontologyVersion,
  });
  expect(doc.validateSync()?.errors?.ontologyVersion).toBeUndefined();
  // Version-agnostic round-trip (was hardcoded '1.2.0' — stale since the 1.3.0 bump,
  // pre-existing red on master; THE-511 bumps to 1.4.0). Tests the stamp is KEPT.
  expect(doc.ontologyVersion).toBe(NORM_ONTOLOGY.ontologyVersion);
});
