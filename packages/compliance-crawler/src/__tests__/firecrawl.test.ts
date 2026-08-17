/**
 * Firecrawl Parser Tests — THE-285 / REQ-ICM-001.2 (EUR-Lex via Firecrawl)
 *
 * Tests FirecrawlSource.parseMarkdown() against curated fixtures that mimic
 * the markdown Firecrawl returns for EUR-Lex pages.
 *
 * Live API calls are NOT exercised in CI — those run via `npm run crawl:nis2:live`
 * (after FIRECRAWL_API_KEY is configured).
 *
 * Run: cd packages/compliance-crawler && npx jest src/__tests__/firecrawl.test.ts --verbose
 */

import fs from 'fs';
import path from 'path';
import { FirecrawlSource } from '../sources/firecrawl';

const fixturesDir = path.join(__dirname, 'fixtures');
const nis2Md = fs.readFileSync(path.join(fixturesDir, 'firecrawl-nis2-sample.md'), 'utf-8');
const dsgvoMd = fs.readFileSync(path.join(fixturesDir, 'firecrawl-dsgvo-sample.md'), 'utf-8');

/**
 * THE-418 (.6-Kern): nis2FirecrawlSource/dsgvoFirecrawlSource factories were
 * removed — source-registry.ts now builds FirecrawlSource generically from
 * crawl-config.ts. These local helpers reconstruct the same literal config the
 * old factories used, so the parser is still exercised end-to-end via fixtures.
 */
interface FirecrawlTestOpts {
  apiKey: string;
  apiUrl?: string;
  articleNumbers?: number[];
  httpClient?: any;
}

function nis2FirecrawlSource(opts: FirecrawlTestOpts): FirecrawlSource {
  return new FirecrawlSource({
    source: 'nis2',
    jurisdiction: 'EU',
    language: 'en',
    effectiveFrom: new Date('2024-10-17'),
    url: 'https://eur-lex.europa.eu/legal-content/EN/TXT/HTML/?uri=CELEX:32022L2555',
    articleNumbers: opts.articleNumbers,
    apiKey: opts.apiKey,
    apiUrl: opts.apiUrl,
    httpClient: opts.httpClient,
  });
}

function dsgvoFirecrawlSource(opts: FirecrawlTestOpts): FirecrawlSource {
  return new FirecrawlSource({
    source: 'dsgvo',
    jurisdiction: 'EU',
    language: 'de',
    effectiveFrom: new Date('2018-05-25'),
    url: 'https://eur-lex.europa.eu/legal-content/DE/TXT/HTML/?uri=CELEX:32016R0679',
    articleNumbers: opts.articleNumbers ?? [5, 6, 9, 32],
    apiKey: opts.apiKey,
    apiUrl: opts.apiUrl,
    httpClient: opts.httpClient,
  });
}

describe('FirecrawlSource.parseMarkdown() — NIS2 EN (THE-285)', () => {
  it('extracts all Article-N headers from fixture', () => {
    const source = nis2FirecrawlSource({ apiKey: 'test-key' });
    const results = source.parseMarkdown(nis2Md);
    const numbers = results.map(r => r.paragraphNumber);
    expect(numbers).toEqual(expect.arrayContaining(['Art. 20', 'Art. 21', 'Art. 22', 'Art. 100']));
  });

  it('applies articleNumbers filter (NIS2 demo set 20–24)', () => {
    const source = nis2FirecrawlSource({
      apiKey: 'test-key',
      articleNumbers: [20, 21, 22, 23, 24],
    });
    const results = source.parseMarkdown(nis2Md);
    expect(results.map(r => r.paragraphNumber)).toEqual(['Art. 20', 'Art. 21', 'Art. 22']);
    expect(results.find(r => r.paragraphNumber === 'Art. 100')).toBeUndefined();
  });

  it('extracts title from ### sub-header', () => {
    const source = nis2FirecrawlSource({ apiKey: 'test-key', articleNumbers: [21] });
    const [art21] = source.parseMarkdown(nis2Md);
    expect(art21.title).toBe('Cybersecurity risk-management measures');
    expect(art21.paragraphNumber).toBe('Art. 21');
  });

  it('AC: extracts complete metadata block', () => {
    const source = nis2FirecrawlSource({ apiKey: 'test-key', articleNumbers: [21] });
    const [art21] = source.parseMarkdown(nis2Md);
    expect(art21.source).toBe('nis2');
    expect(art21.jurisdiction).toBe('EU');
    expect(art21.language).toBe('en');
    expect(art21.effectiveFrom).toEqual(new Date('2024-10-17'));
    expect(art21.sourceUrl).toContain('CELEX:32022L2555');
    expect(art21.fullText).toContain('essential and important entities');
    expect(art21.fullText).toContain('all-hazards approach');
  });

  it('rejects too-short article body (<50 chars)', () => {
    const minimalMd = `## Article 99\n### Too short\nTiny.\n`;
    const source = nis2FirecrawlSource({ apiKey: 'test-key' });
    const results = source.parseMarkdown(minimalMd);
    expect(results.find(r => r.paragraphNumber === 'Art. 99')).toBeUndefined();
  });

  it('caps fullText at 19990 chars (under model maxlength 20000)', () => {
    const longBody = 'A'.repeat(25_000);
    const md = `## Article 21\n### Stress test\n${longBody}\n`;
    const source = nis2FirecrawlSource({ apiKey: 'test-key' });
    const [reg] = source.parseMarkdown(md);
    expect(reg.fullText.length).toBeLessThanOrEqual(19_990);
  });

  it('handles bold-decorated article headers (non-# markdown)', () => {
    const altMd = `**Article 7**\n\n**Lightweight header style**\n\n1. The provisions contained herein shall apply to all member states and shall be implemented in a uniform manner.\n`;
    const source = nis2FirecrawlSource({ apiKey: 'test-key' });
    const [reg] = source.parseMarkdown(altMd);
    expect(reg).toBeDefined();
    expect(reg.paragraphNumber).toBe('Art. 7');
  });
});

describe('FirecrawlSource.parseMarkdown() — DSGVO DE (THE-285)', () => {
  it('extracts German "Artikel" headers', () => {
    const source = dsgvoFirecrawlSource({ apiKey: 'test-key' });
    const results = source.parseMarkdown(dsgvoMd);
    const numbers = results.map(r => r.paragraphNumber);
    expect(numbers).toEqual(expect.arrayContaining(['Art. 5', 'Art. 32']));
  });

  it('default factory uses demo set [5, 6, 9, 32] — filters Art. 100', () => {
    const source = dsgvoFirecrawlSource({ apiKey: 'test-key' });
    const results = source.parseMarkdown(dsgvoMd);
    expect(results.find(r => r.paragraphNumber === 'Art. 100')).toBeUndefined();
    // Fixture has 5, 32, 100 — Art. 6 + 9 aren't in fixture
    expect(results.map(r => r.paragraphNumber).sort()).toEqual(['Art. 32', 'Art. 5']);
  });

  it('AC: extracts German metadata block', () => {
    const source = dsgvoFirecrawlSource({ apiKey: 'test-key', articleNumbers: [32] });
    const [art32] = source.parseMarkdown(dsgvoMd);
    expect(art32.title).toBe('Sicherheit der Verarbeitung');
    expect(art32.source).toBe('dsgvo');
    expect(art32.language).toBe('de');
    expect(art32.fullText).toContain('Stands der Technik');
    expect(art32.fullText).toContain('Schutzniveau');
  });

  it('does not match English "Article" pattern when language=de', () => {
    const englishInGerman = `## Article 5\n### Should not match\nThis English header should not be parsed in a DE source.\n`;
    const source = dsgvoFirecrawlSource({ apiKey: 'test-key' });
    const results = source.parseMarkdown(englishInGerman);
    expect(results.find(r => r.paragraphNumber === 'Art. 5')).toBeUndefined();
  });
});

describe('FirecrawlSource.crawl() — Mocked HTTP', () => {
  it('calls /v1/scrape with correct payload + auth header', async () => {
    const mockPost = jest.fn().mockResolvedValue({
      data: {
        success: true,
        data: {
          markdown: nis2Md,
        },
      },
    });
    const mockClient: any = { post: mockPost };

    const source = nis2FirecrawlSource({
      apiKey: 'fc-test-key-xyz',
      httpClient: mockClient,
      articleNumbers: [21],
    });

    const results = await source.crawl();

    expect(mockPost).toHaveBeenCalledWith(
      'https://api.firecrawl.dev/v1/scrape',
      expect.objectContaining({
        url: expect.stringContaining('CELEX:32022L2555'),
        formats: ['markdown'],
        waitFor: 5000,
        onlyMainContent: true,
      })
    );
    expect(results).toHaveLength(1);
    expect(results[0].paragraphNumber).toBe('Art. 21');
  });

  it('respects custom apiUrl (self-hosted Firecrawl)', async () => {
    const mockPost = jest.fn().mockResolvedValue({
      data: { success: true, data: { markdown: nis2Md } },
    });
    const mockClient: any = { post: mockPost };

    const source = nis2FirecrawlSource({
      apiKey: 'local',
      apiUrl: 'http://firecrawl:3002',
      httpClient: mockClient,
      articleNumbers: [21],
    });
    await source.crawl();

    expect(mockPost).toHaveBeenCalledWith(
      'http://firecrawl:3002/v1/scrape',
      expect.any(Object)
    );
  });

  it('throws SourceParseError on Firecrawl error response', async () => {
    const mockClient: any = {
      post: jest.fn().mockResolvedValue({
        data: { success: false, error: 'Rate limited' },
      }),
    };
    const source = nis2FirecrawlSource({ apiKey: 'k', httpClient: mockClient });
    await expect(source.crawl()).rejects.toThrow(/Rate limited/);
  });

  it('throws SourceParseError on empty markdown', async () => {
    const mockClient: any = {
      post: jest.fn().mockResolvedValue({
        data: { success: true, data: { markdown: '' } },
      }),
    };
    const source = nis2FirecrawlSource({ apiKey: 'k', httpClient: mockClient });
    await expect(source.crawl()).rejects.toThrow(/no\/short markdown/);
  });

  it('throws SourceParseError on transport failure', async () => {
    const mockClient: any = {
      post: jest.fn().mockRejectedValue(new Error('ECONNRESET')),
    };
    const source = nis2FirecrawlSource({ apiKey: 'k', httpClient: mockClient });
    await expect(source.crawl()).rejects.toThrow(/Firecrawl request failed/);
  });
});

describe('FirecrawlSource — config defaults', () => {
  it('sets description with source + URL', () => {
    const s = nis2FirecrawlSource({ apiKey: 'k' });
    expect(s.description).toContain('NIS2');
    expect(s.description).toContain('CELEX:32022L2555');
  });

  it('apiUrl trailing slash is normalised', async () => {
    const mockPost = jest.fn().mockResolvedValue({
      data: { success: true, data: { markdown: nis2Md } },
    });
    const mockClient: any = { post: mockPost };

    const source = new FirecrawlSource({
      source: 'nis2',
      jurisdiction: 'EU',
      language: 'en',
      effectiveFrom: new Date('2024-10-17'),
      url: 'https://example.org',
      apiKey: 'k',
      apiUrl: 'http://firecrawl:3002/', // trailing slash
      httpClient: mockClient,
    });
    await source.crawl();

    expect(mockPost).toHaveBeenCalledWith(
      'http://firecrawl:3002/v1/scrape',
      expect.any(Object)
    );
  });
});

// ─── THE-684: Änderungsartikel ──────────────────────────────────────────────

/**
 * Der Fehler, der vier Artikel verlor und zwei überschrieb.
 *
 * Ein Änderungsartikel beginnt mit dem Satz „Artikel 45 der Verordnung … wird
 * wie folgt geändert:". Die alte Regel — Zeile BEGINNT mit „Artikel N" — las
 * das als neue Überschrift. Folge: der laufende Artikel brach vor seinem Text
 * ab (Rumpf leer → still verworfen), und sein Inhalt landete unter der
 * ZITIERTEN Nummer, wo er den echten Artikel überschrieb.
 *
 * Die Textbeispiele sind wörtlich aus der amtlichen Formex-Fassung.
 */
describe('FirecrawlSource.parseMarkdown() — Änderungsartikel (THE-684)', () => {
  function quelle(language: 'de' | 'en'): FirecrawlSource {
    return new FirecrawlSource({
      source: (language === 'de' ? 'dora-de' : 'dora') as never,
      jurisdiction: 'EU',
      language,
      effectiveFrom: new Date('2025-01-17'),
      url: 'https://eur-lex.europa.eu/legal-content/EN/TXT/HTML/?uri=CELEX:32022R2554',
      apiKey: 'test',
    });
  }

  const DORA_EN = [
    'Article 60',
    'Amendments to Regulation (EU) No 648/2012',
    'Regulation (EU) No 648/2012 is amended as follows: in Article 26, paragraph 3 is replaced by the following text which sets out the operational resilience duties.',
    '',
    'Article 61',
    'Amendments to Regulation (EU) No 909/2014',
    'Article 45 of Regulation (EU) No 909/2014 is amended as follows:',
    '(1) paragraph 1 is replaced by the following: a central securities depository shall identify sources of operational risk and minimise them through appropriate systems and controls.',
    '',
    'Article 62',
    'Amendments to Regulation (EU) No 600/2014',
    'Regulation (EU) No 600/2014 is amended as follows, with the operational requirements applying from the date of entry into force.',
  ].join('\n');

  it('Artikel 61 überlebt seinen eigenen Änderungssatz', () => {
    const r = quelle('en').parseMarkdown(DORA_EN);
    const a61 = r.find((x) => x.paragraphNumber === 'Art. 61');
    expect(a61).toBeDefined();
    expect(a61!.title).toBe('Amendments to Regulation (EU) No 909/2014');
    expect(a61!.fullText).toContain('central securities depository');
  });

  it('der ZITIERTE Artikel 45 wird kein eigener Datensatz — sonst überschreibt er den echten', () => {
    // Der psd2-de-Schaden: Artikel 4 der Zahlungsdiensterichtlinie trug am
    // 16.08. den Titel „Article 4" statt „Begriffsbestimmungen", weil ein
    // Zitat aus Artikel 110 ihn überschrieben hatte.
    const r = quelle('en').parseMarkdown(DORA_EN);
    expect(r.map((x) => x.paragraphNumber)).toEqual(['Art. 60', 'Art. 61', 'Art. 62']);
  });

  it('deutsche Fassung: derselbe Satzbau, dasselbe Ergebnis', () => {
    const md = [
      'Artikel 61',
      'Änderungen der Verordnung (EU) Nr. 909/2014',
      'Artikel 45 der Verordnung (EU) Nr. 909/2014 wird wie folgt geändert:',
      '1. Absatz 1 erhält folgende Fassung: Ein Zentralverwahrer ermittelt Quellen operationeller Risiken und minimiert sie durch geeignete Systeme und Kontrollen.',
      '',
      'Artikel 62',
      'Änderungen der Verordnung (EU) Nr. 600/2014',
      'Die Verordnung (EU) Nr. 600/2014 wird wie folgt geändert, wobei die Anforderungen ab dem Tag des Inkrafttretens gelten.',
    ].join('\n');
    const r = quelle('de').parseMarkdown(md);
    expect(r.map((x) => x.paragraphNumber)).toEqual(['Art. 61', 'Art. 62']);
    expect(r[0].fullText).toContain('Zentralverwahrer');
  });

  it('der Verweisungsartikel der KI-VO überlebt — und seine deutsche Fassung tat es schon vorher', () => {
    // Die Asymmetrie, die den Mechanismus bewies: EN beginnt mit „Article 18
    // of Regulation …" und ging verloren, DE beginnt mit „Unbeschadet …" und
    // überlebte. Nach dem Fix überleben beide.
    const en = new FirecrawlSource({
      source: 'ai-act-en' as never, jurisdiction: 'EU', language: 'en',
      effectiveFrom: new Date('2024-08-01'), url: 'https://example.invalid', apiKey: 'test',
    });
    const md = [
      'Article 94',
      'Procedural rights of economic operators of the general-purpose AI model',
      'Article 18 of Regulation (EU) 2019/1020 shall apply mutatis mutandis to the providers of the general-purpose AI model, without prejudice to more specific procedural rights.',
      '',
      'Article 95',
      'Codes of conduct',
      'The AI Office and the Member States shall encourage and facilitate the drawing up of codes of conduct intended to foster voluntary application.',
    ].join('\n');
    const r = en.parseMarkdown(md);
    expect(r.map((x) => x.paragraphNumber)).toEqual(['Art. 94', 'Art. 95']);
    expect(r[0].fullText).toContain('mutatis mutandis');
  });

  it('geschmückte Überschriften bleiben Überschriften', () => {
    const md = ['## **Article 7**', 'Scope', 'This Article applies to all financial entities established in the Union and their critical service providers.'].join('\n');
    expect(quelle('en').parseMarkdown(md).map((x) => x.paragraphNumber)).toEqual(['Art. 7']);
  });

  it('WÄCHTER: findet die strenge Regel nichts, bricht der Lauf laut ab', () => {
    // Sollte Firecrawl je Überschrift und Untertitel in EINER Zeile liefern,
    // darf daraus kein leeres Gesetz werden, sondern ein Fehler.
    const md = [
      'Article 1 Subject matter and scope of this Regulation as applied',
      'This Regulation lays down uniform requirements for the security of network and information systems.',
      'Article 2 Definitions used throughout this Regulation for its purposes',
      'For the purposes of this Regulation the following definitions apply to all entities concerned.',
    ].join('\n');
    expect(() => quelle('en').parseMarkdown(md)).toThrow(/Markdown-Form hat sich geändert/);
  });
});
