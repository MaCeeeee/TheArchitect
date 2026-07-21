/**
 * prelabel-relations pure functions — THE-421 Task 13 (LLM-Prelabel, ohne API).
 *
 * Mirrors prelabelTyping.test.ts. Two hard rules under test:
 *  (1) only `inferred` relation types may be offered/accepted — metadata ones
 *      (AMENDS, CONSOLIDATES, REPEALS, CITES) must never appear or survive.
 *  (2) direction is a separate, explicit field — a relation without a valid
 *      direction is incomplete and must be dropped, not repaired by guessing.
 *
 * Run: cd packages/server && npx jest src/__tests__/prelabelRelations.test.ts
 */
import { buildRelationsPrompt, parseRelationLabel } from '../scripts/prelabel-relations';
import type { RelationsGoldenCase } from '../evals/relationsGolden';

const pairCase: RelationsGoldenCase = {
  caseId: 'case-1',
  a: {
    regulationKey: 'dora:art-1',
    source: 'dora',
    paragraphNumber: 'art-1',
    title: 'Subject matter',
    fullText: 'This Regulation lays down uniform requirements for the security of network and information systems.',
    language: 'en',
  },
  b: {
    regulationKey: 'nis2:art-1',
    source: 'nis2',
    paragraphNumber: 'art-1',
    title: 'Subject matter',
    fullText: 'This Directive lays down measures with a view to achieving a high common level of cybersecurity.',
    language: 'en',
  },
};

describe('buildRelationsPrompt', () => {
  it('offers only inferred relation types, never metadata ones', () => {
    const p = buildRelationsPrompt(pairCase);
    expect(p).toContain('DEROGATED_BY');
    expect(p).not.toContain('AMENDS');
    expect(p).not.toContain('CITES');
    expect(p).not.toContain('CONSOLIDATES');
    expect(p).not.toContain('REPEALS');
    expect(p).toContain('none');
  });

  it('presents both paragraphs labelled A and B with their source', () => {
    const p = buildRelationsPrompt(pairCase);
    expect(p).toContain(pairCase.a.fullText);
    expect(p).toContain(pairCase.b.fullText);
    expect(p).toContain('dora');
    expect(p).toContain('nis2');
    expect(p).toContain('art-1');
  });

  it('asks for the direction explicitly', () => {
    const p = buildRelationsPrompt(pairCase);
    expect(p).toContain('a-to-b');
    expect(p).toContain('b-to-a');
  });

  it('does not hardcode a relation-type count in the prompt text', () => {
    expect(buildRelationsPrompt(pairCase)).not.toContain('twelve');
  });
});

describe('parseRelationLabel', () => {
  it('maps "none" to null with no direction', () => {
    const r = parseRelationLabel('{"relation":"none"}');
    expect(r.relation).toBeNull();
    expect(r.direction).toBeUndefined();
    expect(r.dropped).toBe(false);
  });

  it('drops a metadata relation even if the model returns one', () => {
    const r = parseRelationLabel('{"relation":"AMENDS","direction":"a-to-b"}');
    expect(r.relation).toBeUndefined();
    expect(r.dropped).toBe(true);
  });

  it('drops a relation proposed without a valid direction', () => {
    expect(parseRelationLabel('{"relation":"DEROGATED_BY"}').dropped).toBe(true);
    expect(parseRelationLabel('{"relation":"DEROGATED_BY","direction":"sideways"}').dropped).toBe(true);
  });

  it('accepts a valid relation with direction', () => {
    const r = parseRelationLabel('{"relation":"CONCRETIZES","direction":"b-to-a"}');
    expect(r.relation).toBe('CONCRETIZES');
    expect(r.direction).toBe('b-to-a');
    expect(r.dropped).toBe(false);
  });

  it('never throws on malformed output and leaves the label open', () => {
    for (const junk of ['', 'not json', '{', '{"relation":}']) {
      expect(() => parseRelationLabel(junk)).not.toThrow();
      const r = parseRelationLabel(junk);
      expect(r.relation).toBeUndefined();
    }
  });

  it('extracts the JSON object from surrounding prose', () => {
    const r = parseRelationLabel('Here you go: {"relation":"IMPLEMENTS","direction":"a-to-b"} — done');
    expect(r.relation).toBe('IMPLEMENTS');
    expect(r.direction).toBe('a-to-b');
    expect(r.dropped).toBe(false);
  });

  it('missing relation field entirely → open, not dropped', () => {
    const r = parseRelationLabel('{}');
    expect(r.relation).toBeUndefined();
    expect(r.direction).toBeUndefined();
    expect(r.dropped).toBe(false);
  });

  it('an out-of-vocabulary relation id is dropped', () => {
    const r = parseRelationLabel('{"relation":"invented_relation","direction":"a-to-b"}');
    expect(r.relation).toBeUndefined();
    expect(r.dropped).toBe(true);
  });
});

// Der erste Zwei-Prüfer-Lauf ohne Rubrik-Regeln kam auf Kappa 0,265: beide
// Prüfer bekamen nur die Namensliste der Beziehungsarten. Ein Kappa misst nur
// dann eine unklare Aufgabendefinition, wenn die Prüfer sie auch bekommen haben.
describe('buildRelationsPrompt — Rubrik-Regeln im Prompt', () => {
  const anyCase = {
    caseId: 'x__y',
    a: { source: 'dsgvo', paragraphNumber: 'Art. 32', regulationKey: 'dsgvo:art-32', fullText: 'A'.repeat(60), language: 'de' as const },
    b: { source: 'nis2-de', paragraphNumber: 'Art. 21', regulationKey: 'nis2-de:art-21', fullText: 'B'.repeat(60), language: 'de' as const },
  };

  it('carries the decisive C4 rule (parallel obligation is not a relation)', () => {
    const p = buildRelationsPrompt(anyCase as never);
    expect(p).toContain('parallel obligation is NOT a relation');
    expect(p).toContain('OTHER NORM');
  });

  it('carries the displacement-vs-concretisation test from C5', () => {
    const p = buildRelationsPrompt(anyCase as never);
    expect(p).toContain('PREVAILS_OVER');
    expect(p).toContain('CONCRETIZES');
  });

  it('still lists only inferred relation types (metadata types stay out)', () => {
    const p = buildRelationsPrompt(anyCase as never);
    expect(p).not.toContain('AMENDS');
    expect(p).not.toContain('REPEALS');
  });
});
