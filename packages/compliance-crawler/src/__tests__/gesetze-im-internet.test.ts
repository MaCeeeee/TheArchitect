/**
 * gesetze-im-internet.de Parser Tests — REQ-ICM-001.2 / THE-276
 *
 * Tests GesetzeImInternetSource.parseHtml() and .crawl() (via fixtureMap) using
 * fixtures derived from real LkSG paragraph HTML structure.
 *
 * Live API calls are NOT exercised in CI.
 *
 * Run: cd packages/compliance-crawler && npx jest src/__tests__/gesetze-im-internet.test.ts --verbose
 */

import fs from 'fs';
import path from 'path';
import {
  GesetzeImInternetSource,
  lksgSource,
  bdsgSource,
} from '../sources/gesetze-im-internet';

const fixturesDir = path.join(__dirname, 'fixtures');
const lksgP3 = fs.readFileSync(path.join(fixturesDir, 'lksg-sample-paragraph-3.html'), 'utf-8');
const lksgP6 = fs.readFileSync(path.join(fixturesDir, 'lksg-sample-paragraph-6.html'), 'utf-8');

describe('GesetzeImInternetSource.parseHtml() (REQ-ICM-001.2)', () => {
  const source = lksgSource();

  it('parses LkSG § 3 from fixture', () => {
    const result = source.parseHtml(lksgP3, 3);
    expect(result).not.toBeNull();
    expect(result!.paragraphNumber).toBe('§ 3');
    expect(result!.title).toBe('Sorgfaltspflichten');
    expect(result!.fullText).toContain('Lieferketten');
    expect(result!.fullText).toContain('Risikomanagements');
    expect(result!.source).toBe('lksg');
    expect(result!.jurisdiction).toBe('DE');
    expect(result!.language).toBe('de');
    expect(result!.effectiveFrom).toEqual(new Date('2023-01-01'));
  });

  it('parses LkSG § 6 from fixture', () => {
    const result = source.parseHtml(lksgP6, 6);
    expect(result).not.toBeNull();
    expect(result!.paragraphNumber).toBe('§ 6');
    expect(result!.title).toBe('Präventionsmaßnahmen');
    expect(result!.fullText).toContain('Grundsatzerklärung');
    expect(result!.fullText.length).toBeGreaterThan(200);
  });

  it('returns null when expected number doesn\'t match (page mis-match)', () => {
    const result = source.parseHtml(lksgP3, 99); // expect § 99, but page is § 3
    expect(result).toBeNull();
  });

  it('returns null on empty/missing-header HTML', () => {
    const result = source.parseHtml('<html><body></body></html>', 3);
    expect(result).toBeNull();
  });

  it('returns null when body shorter than 50 chars', () => {
    const html = '<html><body><h2>§ 5 Test</h2><div class="jurAbsatz">tiny.</div></body></html>';
    const result = source.parseHtml(html, 5);
    expect(result).toBeNull();
  });

  it('caps fullText under model maxlength (19990 chars)', () => {
    const huge = 'A'.repeat(25_000);
    const html = `<html><body><h2>§ 7 Huge</h2><div class="jurAbsatz">${huge}</div></body></html>`;
    const result = source.parseHtml(html, 7);
    expect(result).not.toBeNull();
    expect(result!.fullText.length).toBeLessThanOrEqual(19_990);
  });
});

describe('GesetzeImInternetSource.crawl() with fixtureMap (no HTTP)', () => {
  it('crawls multiple paragraphs via fixtureMap', async () => {
    const fixtures = new Map<number, string>([
      [3, lksgP3],
      [6, lksgP6],
    ]);
    const source = lksgSource({
      paragraphNumbers: [3, 6],
      fixtureMap: fixtures,
      requestDelayMs: 0,
    });

    const results = await source.crawl();
    expect(results).toHaveLength(2);
    expect(results.map(r => r.paragraphNumber)).toEqual(['§ 3', '§ 6']);
    for (const r of results) {
      expect(r.source).toBe('lksg');
      expect(r.fullText.length).toBeGreaterThan(50);
    }
  });

  it('skips paragraphs not in fixtureMap silently (when no HTTP)', async () => {
    const fixtures = new Map<number, string>([[3, lksgP3]]);
    const source = lksgSource({
      paragraphNumbers: [3, 4, 5],
      fixtureMap: fixtures,
      requestDelayMs: 0,
      // No httpClient set — would fail in real scenario, but missing fixtures cause warnings, not crashes
    });

    // Mock console.warn to silence test output
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const results = await source.crawl();
    // Only § 3 has fixture; others try HTTP and fail (caught and logged)
    expect(results.find(r => r.paragraphNumber === '§ 3')).toBeDefined();
    warnSpy.mockRestore();
  });
});

describe('Factory functions', () => {
  it('lksgSource() default paragraph numbers (3–9)', () => {
    const s = lksgSource();
    expect(s.source).toBe('lksg');
    expect(s.description).toContain('lksg');
  });

  it('bdsgSource() default config', () => {
    const s = bdsgSource();
    expect(s.source).toBe('dsgvo'); // BDSG complements DSGVO
    expect(s.description).toContain('bdsg_2018');
  });

  it('lksgSource() respects custom paragraphNumbers', async () => {
    const fixtures = new Map<number, string>([[3, lksgP3]]);
    const s = lksgSource({
      paragraphNumbers: [3],
      fixtureMap: fixtures,
      requestDelayMs: 0,
    });
    const results = await s.crawl();
    expect(results).toHaveLength(1);
  });
});
