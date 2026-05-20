/**
 * EUR-Lex NIS2 Parser Tests — REQ-ICM-001.2 / THE-276
 *
 * Tests the EurLexNis2Source.parseHtml() against a curated fixture.
 * Live API calls are NOT exercised in CI — those run via `npm run crawl:nis2:live`.
 *
 * Run: cd packages/compliance-crawler && npx jest src/__tests__/eur-lex.test.ts --verbose
 */

import fs from 'fs';
import path from 'path';
import { EurLexNis2Source } from '../sources/eur-lex';

const fixtureHtml = fs.readFileSync(
  path.join(__dirname, 'fixtures/nis2-sample.html'),
  'utf-8'
);

describe('EurLexNis2Source.parseHtml() (REQ-ICM-001.2)', () => {
  it('extracts all NIS2 articles from fixture', () => {
    const source = new EurLexNis2Source();
    const results = source.parseHtml(fixtureHtml);
    // Fixture has Art. 20, 21, 22, 100 → all parsed when no filter
    expect(results.map(r => r.paragraphNumber)).toEqual(
      expect.arrayContaining(['Art. 20', 'Art. 21', 'Art. 22', 'Art. 100'])
    );
  });

  it('applies articleNumbers filter (NIS2 demo set 20–24)', () => {
    const source = new EurLexNis2Source({ articleNumbers: [20, 21, 22, 23, 24] });
    const results = source.parseHtml(fixtureHtml);
    expect(results.map(r => r.paragraphNumber)).toEqual([
      'Art. 20',
      'Art. 21',
      'Art. 22',
    ]);
    // Art. 100 must NOT appear
    expect(results.find(r => r.paragraphNumber === 'Art. 100')).toBeUndefined();
  });

  it('AC-2: extracts paragraphNumber, title, fullText, sourceUrl, effectiveFrom', () => {
    const source = new EurLexNis2Source({ articleNumbers: [21] });
    const [art21] = source.parseHtml(fixtureHtml);
    expect(art21.paragraphNumber).toBe('Art. 21');
    expect(art21.title).toBe('Cybersecurity risk-management measures');
    expect(art21.fullText.length).toBeGreaterThan(50);
    expect(art21.fullText).toContain('essential and important entities');
    expect(art21.sourceUrl).toContain('eur-lex.europa.eu');
    expect(art21.effectiveFrom).toEqual(new Date('2024-10-17'));
    expect(art21.language).toBe('en');
    expect(art21.jurisdiction).toBe('EU');
    expect(art21.source).toBe('nis2');
  });

  it('rejects articles with body shorter than 50 chars', () => {
    const minimalHtml = `
      <p class="oj-ti-art">Article 99</p>
      <p class="oj-sti-art">Too short</p>
      <p class="oj-normal">tiny.</p>
    `;
    const source = new EurLexNis2Source();
    const results = source.parseHtml(minimalHtml);
    expect(results.find(r => r.paragraphNumber === 'Art. 99')).toBeUndefined();
  });

  it('caps fullText at 19990 chars (under model maxlength 20000)', () => {
    const longBody = 'A'.repeat(25_000);
    const html = `
      <p class="oj-ti-art">Article 21</p>
      <p class="oj-sti-art">Stress test</p>
      <p class="oj-normal">${longBody}</p>
    `;
    const source = new EurLexNis2Source();
    const [reg] = source.parseHtml(html);
    expect(reg.fullText.length).toBeLessThanOrEqual(19_990);
  });

  it('tolerates `ti-art` fallback class (without oj- prefix)', () => {
    const html = `
      <p class="ti-art">Article 7</p>
      <p class="sti-art">Fallback class test</p>
      <p class="oj-normal">This text must be at least fifty characters long for the parser to accept the article.</p>
    `;
    const source = new EurLexNis2Source();
    const [reg] = source.parseHtml(html);
    expect(reg).toBeDefined();
    expect(reg.paragraphNumber).toBe('Art. 7');
    expect(reg.title).toBe('Fallback class test');
  });
});
