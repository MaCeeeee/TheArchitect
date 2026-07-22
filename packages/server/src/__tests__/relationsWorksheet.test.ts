/**
 * relations-worksheet Tests — HTML-Adjudikationsformular für Cross-Norm-
 * Relationen (THE-421, Task 14).
 *
 * Run: cd packages/server && npx jest src/__tests__/relationsWorksheet.test.ts
 */
import { renderRelationsWorksheet } from '../scripts/relations-worksheet';
import { RelationsGoldenSetSchema, type RelationsGoldenSet } from '../evals/relationsGolden';

function fixture(): RelationsGoldenSet {
  return RelationsGoldenSetSchema.parse({
    version: 'v1-draft',
    frozen: false,
    ontologyVersion: '1.0.0',
    rubricRef: 'RUBRIC.md',
    cases: [
      {
        caseId: 'dora-nis2-001',
        a: {
          regulationKey: 'dora:art.5',
          source: 'dora',
          paragraphNumber: 'Art. 5',
          title: 'ICT Risk Management',
          fullText: 'Financial entities shall implement an internal governance and control framework.'.padEnd(60, '.'),
          language: 'en',
        },
        b: {
          regulationKey: 'nis2:art.21',
          source: 'nis2',
          paragraphNumber: 'Art. 21',
          title: 'Cybersecurity risk-management measures',
          fullText: 'Essential and important entities shall take appropriate technical measures.'.padEnd(60, '.'),
          language: 'en',
        },
        relation: 'DEROGATED_BY',
        direction: 'b-to-a',
        annotator: 'annotator-a',
        labeledAt: '2026-07-15',
      },
      {
        caseId: 'dsgvo-eprivacy-001',
        a: {
          regulationKey: 'dsgvo:art.6',
          source: 'dsgvo',
          paragraphNumber: 'Art. 6',
          title: 'Rechtmäßigkeit der Verarbeitung',
          fullText: 'Die Verarbeitung ist nur rechtmäßig, wenn mindestens eine der Bedingungen erfüllt ist.'.padEnd(60, '.'),
          language: 'de',
        },
        b: {
          regulationKey: 'eprivacy:art.5',
          source: 'eprivacy',
          paragraphNumber: 'Art. 5',
          title: 'Vertraulichkeit der Kommunikation',
          fullText: 'Mitgliedstaaten stellen die Vertraulichkeit der Kommunikation sicher.'.padEnd(60, '.'),
          language: 'de',
        },
        // offen — noch nicht gelabelt
      },
    ],
  });
}

describe('renderRelationsWorksheet()', () => {
  const set = fixture();
  const html = renderRelationsWorksheet(set);

  it('renders both paragraphs with their source and paragraph number', () => {
    expect(html).toContain(set.cases[0].a.fullText);
    expect(html).toContain(set.cases[0].b.fullText);
    expect(html).toContain(set.cases[0].a.regulationKey);
    expect(html).toContain(set.cases[0].b.regulationKey);
  });

  it('offers only inferred relation types plus a no-relation option', () => {
    expect(html).toContain('DEROGATED_BY');
    expect(html).not.toContain('AMENDS'); // metadata relations are parser-only
  });

  it('renders a direction control with both directions', () => {
    expect(html).toContain('a-to-b');
    expect(html).toContain('b-to-a');
  });

  it('prefills an existing label so the pass is adjudication, not cold labeling', () => {
    // case 0 is pre-labeled DEROGATED_BY / b-to-a — both must come out selected
    expect(html).toMatch(/<option value="DEROGATED_BY" selected>/);
    expect(html).toMatch(/<option value="b-to-a" selected>/);
  });

  it('embeds the ontology version and the case count', () => {
    expect(html).toContain(set.ontologyVersion);
    expect(html).toContain(String(set.cases.length));
  });

  it('is self-contained: no external script or stylesheet references', () => {
    expect(html).not.toMatch(/<script[^>]+src=/);
    expect(html).not.toMatch(/<link[^>]+stylesheet/);
  });

  it('makes an invalid export structurally impossible: the direction control is disabled whenever relation is not a chosen type', () => {
    // case 1 is open (no label yet) → its direction select must render disabled
    // so it can never contribute a `direction` without a `relation`.
    expect(html).toMatch(/id="dir_1"[^>]*\bdisabled\b/);
    // case 0 has a real relation label → its direction select must be enabled.
    expect(html).not.toMatch(/id="dir_0"[^>]*\bdisabled\b/);
    // the coupling logic itself must be present in the embedded script (not
    // just true by accident of the fixture): disabling driven by the
    // sentinel values for "open" and "no relation".
    expect(html).toMatch(/__none/);
    expect(html).toMatch(/\.disabled\s*=/);
  });
});
