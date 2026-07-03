/**
 * fullText cleanup tests — THE-365 (REQ-CRAWL-QUALITY-001).
 *
 * Run: cd packages/compliance-crawler && npx jest src/__tests__/clean.test.ts --verbose
 */
import { cleanRegulationText } from '../sources/clean';
import { nis2FirecrawlSource, aiActFirecrawlSource } from '../sources/firecrawl';

describe('cleanRegulationText (THE-365 AC-1)', () => {
  it('strips Markdown table scaffolding, keeps enumeration letters (real AI Act Art. 5 sample)', () => {
    const raw =
      'The following AI practices shall be prohibited: | | | | --- | --- | | (a) | ' +
      'the placing on the market of an AI system that deploys subliminal techniques';
    const out = cleanRegulationText(raw);
    expect(out).not.toMatch(/\|/); // no pipes left
    expect(out).not.toMatch(/-{3,}/); // no separator dashes left
    expect(out).toContain('(a)'); // enumeration preserved
    expect(out).toBe(
      'The following AI practices shall be prohibited: (a) the placing on the market of an AI system that deploys subliminal techniques'
    );
  });

  it('collapses chained separator rows and empty cells', () => {
    expect(cleanRegulationText('x | | | --- | --- | --- | | y')).toBe('x y');
    expect(cleanRegulationText('| --- | (b) | text')).toBe('(b) text');
  });

  it('preserves prose em-dash and spaced hyphens not adjacent to a table pipe', () => {
    expect(cleanRegulationText('the controller — see Article 4 — shall act')).toBe(
      'the controller — see Article 4 — shall act'
    );
    // spaced triple-hyphen used as a dash, no surrounding pipe → untouched
    expect(cleanRegulationText('pages 3 --- 5 apply')).toBe('pages 3 --- 5 apply');
    // hyphenated range inside a word → untouched
    expect(cleanRegulationText('sections 3---5')).toBe('sections 3---5');
  });

  it('normalises whitespace and trims', () => {
    expect(cleanRegulationText('  a   b\n\n c  ')).toBe('a b c');
  });

  it('is a no-op on already-clean text', () => {
    const clean = 'Providers shall ensure that AI systems are designed appropriately.';
    expect(cleanRegulationText(clean)).toBe(clean);
  });
});

describe('parseMarkdown integration — table garbage removed (THE-365 AC-2)', () => {
  const garbageMd = [
    '## Article 23',
    '### Reporting obligations',
    'Each entity shall notify incidents where: | | | | --- | --- | | (a) | it has caused ' +
      'a significant disruption to the service; | | | | --- | --- | | (b) | it has affected ' +
      'other natural or legal persons by causing considerable damage.',
  ].join('\n');

  it('NIS2 EN: output has no table scaffolding but keeps (a)/(b)', () => {
    const [art] = nis2FirecrawlSource({ apiKey: 'k' }).parseMarkdown(garbageMd);
    expect(art.paragraphNumber).toBe('Art. 23');
    expect(art.fullText).not.toMatch(/\|/);
    expect(art.fullText).not.toMatch(/-{3,}/);
    expect(art.fullText).toContain('(a)');
    expect(art.fullText).toContain('(b)');
    expect(art.fullText).toContain('significant disruption');
  });

  it('cap applies to cleaned text (clean happens before 19990 truncation)', () => {
    const noise = '| | | --- | --- | | '.repeat(400); // ~8k of pure scaffolding
    const md = `## Article 3\n### Definitions\n${noise} the real definition body follows here and must survive.`;
    const [art] = aiActFirecrawlSource({ apiKey: 'k', language: 'en' }).parseMarkdown(md);
    expect(art.fullText).not.toMatch(/\|/);
    expect(art.fullText).toContain('the real definition body follows here and must survive');
  });
});
