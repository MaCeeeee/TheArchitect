/**
 * EU AI Act + EU Data Act Parser Tests — THE-396 (UC-CORPUS-002)
 *
 * Verifies the language-parametrised factories for the two new corpus sources:
 *   - AI Act  (Regulation (EU) 2024/1689, CELEX 32024R1689) via EurLexSource (EN fixture)
 *   - Data Act (Regulation (EU) 2023/2854, CELEX 32023R2854) via FirecrawlSource (DE fixture)
 *
 * Live API calls are NOT exercised in CI. Real crawls run via the /crawl route
 * (Firecrawl path) or `crawl-live.ts` locally (direct EUR-Lex).
 *
 * Run: cd packages/compliance-crawler && npx jest src/__tests__/eu-acts.test.ts --verbose
 */

import fs from 'fs';
import path from 'path';
import { aiActEurLexSource, dataActEurLexSource } from '../sources/eur-lex';
import { aiActFirecrawlSource, dataActFirecrawlSource } from '../sources/firecrawl';

const fixturesDir = path.join(__dirname, 'fixtures');
const aiActHtml = fs.readFileSync(path.join(fixturesDir, 'ai-act-sample.html'), 'utf-8');
const dataActMd = fs.readFileSync(path.join(fixturesDir, 'firecrawl-data-act-sample.md'), 'utf-8');

describe('AI Act — EurLexSource EN (THE-396)', () => {
  it('full crawl (no filter) extracts every article header', () => {
    const source = aiActEurLexSource({ language: 'en' });
    const results = source.parseHtml(aiActHtml);
    expect(results.map(r => r.paragraphNumber)).toEqual(
      expect.arrayContaining(['Art. 5', 'Art. 50', 'Art. 999'])
    );
  });

  it('AC-1: source key encodes language (ai-act-en)', () => {
    const [art5] = aiActEurLexSource({ language: 'en', articleNumbers: [5] }).parseHtml(aiActHtml);
    expect(art5.source).toBe('ai-act-en');
    expect(art5.language).toBe('en');
    expect(art5.jurisdiction).toBe('EU');
  });

  it('AC-2: extracts full metadata for Art. 5', () => {
    const [art5] = aiActEurLexSource({ language: 'en', articleNumbers: [5] }).parseHtml(aiActHtml);
    expect(art5.paragraphNumber).toBe('Art. 5');
    expect(art5.title).toBe('Prohibited AI practices');
    expect(art5.fullText).toContain('subliminal techniques');
    expect(art5.effectiveFrom).toEqual(new Date('2024-08-01'));
    expect(art5.sourceUrl).toContain('CELEX:32024R1689');
  });

  it('German factory uses ai-act-de + DE article regex', () => {
    const source = aiActEurLexSource({ language: 'de' });
    expect(source.source).toBe('ai-act-de');
    // English "Article" headers must NOT parse under a DE source
    expect(source.parseHtml(aiActHtml)).toHaveLength(0);
  });

  it('Firecrawl factory targets the AI Act CELEX + language URL', () => {
    const en = aiActFirecrawlSource({ apiKey: 'k', language: 'en' });
    expect(en.source).toBe('ai-act-en');
    expect(en.description).toContain('CELEX:32024R1689');
    const de = aiActFirecrawlSource({ apiKey: 'k', language: 'de' });
    expect(de.source).toBe('ai-act-de');
    expect(de.description).toContain('/DE/');
  });
});

describe('Data Act — FirecrawlSource DE (THE-396)', () => {
  it('full crawl (no filter) extracts every Artikel header', () => {
    const source = dataActFirecrawlSource({ apiKey: 'k', language: 'de' });
    const results = source.parseMarkdown(dataActMd);
    expect(results.map(r => r.paragraphNumber)).toEqual(
      expect.arrayContaining(['Art. 4', 'Art. 5', 'Art. 998'])
    );
  });

  it('AC-1: source key encodes language (data-act-de)', () => {
    const source = dataActFirecrawlSource({ apiKey: 'k', language: 'de', articleNumbers: [5] });
    const [art5] = source.parseMarkdown(dataActMd);
    expect(art5.source).toBe('data-act-de');
    expect(art5.language).toBe('de');
    expect(art5.effectiveFrom).toEqual(new Date('2024-01-11'));
    expect(art5.sourceUrl).toContain('CELEX:32023R2854');
  });

  it('AC-2: extracts German title + body for Art. 5', () => {
    const source = dataActFirecrawlSource({ apiKey: 'k', language: 'de', articleNumbers: [5] });
    const [art5] = source.parseMarkdown(dataActMd);
    expect(art5.title).toBe('Recht der Nutzer, Daten mit Dritten zu teilen');
    expect(art5.fullText).toContain('Dritten');
  });

  it('English factory uses data-act-en + EN URL', () => {
    const en = dataActFirecrawlSource({ apiKey: 'k', language: 'en' });
    expect(en.source).toBe('data-act-en');
    expect(en.description).toContain('/EN/');
    expect(en.description).toContain('CELEX:32023R2854');
  });

  it('EN source does not match German "Artikel" headers', () => {
    const en = dataActFirecrawlSource({ apiKey: 'k', language: 'en' });
    expect(en.parseMarkdown(dataActMd)).toHaveLength(0);
  });
});
