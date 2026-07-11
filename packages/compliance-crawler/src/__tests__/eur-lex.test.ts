/**
 * EUR-Lex Parser Tests — REQ-ICM-001.2 / THE-276
 *
 * Tests EurLexSource.parseHtml() against curated NIS2 + DSGVO fixtures.
 * Live API calls are NOT exercised in CI — those run via `npm run crawl:nis2:live`.
 *
 * THE-418 (.6-Kern): the per-law factories (nis2EurLexSource, dsgvoEurLexSource,
 * EurLexNis2Source) were removed — source-registry.ts now builds EurLexSource
 * generically from crawl-config.ts. These tests construct EurLexSource directly
 * with the same literal config the old factories used (still exercising the
 * generic parser against real fixtures).
 *
 * Run: cd packages/compliance-crawler && npx jest src/__tests__/eur-lex.test.ts --verbose
 */

import fs from 'fs';
import path from 'path';
import { EurLexSource } from '../sources/eur-lex';

const fixturesDir = path.join(__dirname, 'fixtures');
const fixtureHtml = fs.readFileSync(path.join(fixturesDir, 'nis2-sample.html'), 'utf-8');
const dsgvoHtml = fs.readFileSync(path.join(fixturesDir, 'dsgvo-sample.html'), 'utf-8');

function nis2Source(articleNumbers?: number[]): EurLexSource {
  return new EurLexSource({
    source: 'nis2',
    jurisdiction: 'EU',
    language: 'en',
    effectiveFrom: new Date('2024-10-17'),
    celex: '32022L2555',
    articleNumbers,
  });
}

function dsgvoSource(articleNumbers: number[] = [5, 6, 9, 32]): EurLexSource {
  return new EurLexSource({
    source: 'dsgvo',
    jurisdiction: 'EU',
    language: 'de',
    effectiveFrom: new Date('2018-05-25'),
    celex: '32016R0679',
    articleNumbers,
  });
}

describe('EurLexSource.parseHtml() — NIS2 (REQ-ICM-001.2)', () => {
  it('extracts all NIS2 articles from fixture', () => {
    const source = nis2Source();
    const results = source.parseHtml(fixtureHtml);
    // Fixture has Art. 20, 21, 22, 100 → all parsed when no filter
    expect(results.map(r => r.paragraphNumber)).toEqual(
      expect.arrayContaining(['Art. 20', 'Art. 21', 'Art. 22', 'Art. 100'])
    );
  });

  it('applies articleNumbers filter (NIS2 demo set 20–24)', () => {
    const source = nis2Source([20, 21, 22, 23, 24]);
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
    const source = nis2Source([21]);
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
    const source = nis2Source();
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
    const source = nis2Source();
    const [reg] = source.parseHtml(html);
    expect(reg.fullText.length).toBeLessThanOrEqual(19_990);
  });

  it('tolerates `ti-art` fallback class (without oj- prefix)', () => {
    const html = `
      <p class="ti-art">Article 7</p>
      <p class="sti-art">Fallback class test</p>
      <p class="oj-normal">This text must be at least fifty characters long for the parser to accept the article.</p>
    `;
    const source = nis2Source();
    const [reg] = source.parseHtml(html);
    expect(reg).toBeDefined();
    expect(reg.paragraphNumber).toBe('Art. 7');
    expect(reg.title).toBe('Fallback class test');
  });
});

describe('EurLexSource — DSGVO (German) (REQ-ICM-001.2)', () => {
  it('extracts German "Artikel" articles from DSGVO fixture', () => {
    const source = dsgvoSource([5, 32]);
    const results = source.parseHtml(dsgvoHtml);
    expect(results.map(r => r.paragraphNumber)).toEqual(['Art. 5', 'Art. 32']);
  });

  it('AC-2: DSGVO Art. 32 — extracts full metadata in German', () => {
    const source = dsgvoSource([32]);
    const [art32] = source.parseHtml(dsgvoHtml);
    expect(art32.paragraphNumber).toBe('Art. 32');
    expect(art32.title).toBe('Sicherheit der Verarbeitung');
    expect(art32.fullText).toContain('Stands der Technik'); // Genitiv im Fixture
    expect(art32.fullText).toContain('Schutzniveau');
    expect(art32.source).toBe('dsgvo');
    expect(art32.jurisdiction).toBe('EU');
    expect(art32.language).toBe('de');
    expect(art32.effectiveFrom).toEqual(new Date('2018-05-25'));
  });

  it('filters out Art. 100 (not in demo set 5/6/9/32)', () => {
    const source = dsgvoSource();
    const results = source.parseHtml(dsgvoHtml);
    expect(results.find(r => r.paragraphNumber === 'Art. 100')).toBeUndefined();
  });

  it('demo set [5, 6, 9, 32] (crawl-config.ts) matches fixture coverage', () => {
    const source = dsgvoSource();
    const results = source.parseHtml(dsgvoHtml);
    // Fixture only has 5, 32 (not 6, 9), so we get 2 results
    expect(results.map(r => r.paragraphNumber).sort()).toEqual(['Art. 32', 'Art. 5']);
  });
});
