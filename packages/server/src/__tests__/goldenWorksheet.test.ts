/**
 * golden-worksheet Tests — HTML-Labeling-Formular (THE-379)
 *
 * Run: cd packages/server && npx jest src/__tests__/goldenWorksheet.test.ts
 */
import { renderLabelingForm } from '../scripts/golden-worksheet';
import { GoldenSetSchema, type GoldenSet } from '../evals/goldenSet';

function fixture(): GoldenSet {
  return GoldenSetSchema.parse({
    version: 'v1-draft',
    frozen: false,
    cases: [
      {
        caseId: 'dsgvo-art30',
        source: 'dsgvo',
        paragraphNumber: 'Art. 30',
        title: 'VVT',
        fullText: 'Jeder Verantwortliche führt ein Verzeichnis der Verarbeitungstätigkeiten.'.padEnd(60, '.'),
        language: 'de',
        jurisdiction: 'EU',
        candidates: [
          { id: 'el-a', name: 'Register App', type: 'application' },
          { id: 'el-b', name: 'CRM & <script>', type: 'application', description: 'stores <PII> & data' },
        ],
        goldElementIds: ['el-a'], // wird im Formular NICHT vorausgewählt
        notes: 'A-Begründung — darf B nicht beeinflussen',
      },
    ],
  });
}

describe('renderLabelingForm()', () => {
  const html = renderLabelingForm(fixture());

  it('produces a self-contained HTML document with export scaffolding', () => {
    expect(html.startsWith('<!doctype html>')).toBe(true);
    expect(html).toContain('function exportJSON()');
    expect(html).toContain('const SET =');
    // ein Card-Abschnitt pro Case
    expect((html.match(/class="case"/g) ?? [])).toHaveLength(1);
    // eine Checkbox pro Kandidat
    expect(html).toContain('id="cb_0_0"');
    expect(html).toContain('id="cb_0_1"');
  });

  it('does NOT pre-check boxes and does NOT leak A\'s gold/notes into the visible form', () => {
    // kein <input> trägt ein `checked`-Attribut (CSS :checked ist erlaubt)
    expect(html).not.toMatch(/<input[^>]*\bchecked\b/);
    // A's Begründung taucht nicht als sichtbarer Text auf
    expect(html).not.toContain('A-Begründung');
  });

  it('HTML-escapes candidate content to prevent markup breakage', () => {
    expect(html).toContain('CRM &amp; &lt;script&gt;');
    expect(html).toContain('stores &lt;PII&gt; &amp; data');
    // embed schützt gegen </script>-Ausbruch
    expect(html).not.toContain('</script>\\n</head>'); // sanity: kein roher Break
  });

  it('embeds the full set (with ids/candidates) so export can rebuild the schema', () => {
    expect(html).toContain('"caseId":"dsgvo-art30"');
    expect(html).toContain('"id":"el-a"');
    expect(html).toContain('"id":"el-b"');
  });
});
