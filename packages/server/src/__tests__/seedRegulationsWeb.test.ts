/**
 * seed-regulations-web Tests — reine Extraktion (extractArticle) + Artikel-Auswahl.
 *
 * Run: cd packages/server && npx jest src/__tests__/seedRegulationsWeb.test.ts
 */
import { extractArticle, DSGVO_ARTICLES } from '../scripts/seed-regulations-web';

const page = (body: string) => `<!doctype html><html><head><title>x</title></head><body>
  <h1 class="entry-title">Art. 17 GDPR – Right to erasure</h1>
  <div class="entry-content">${body}</div>
</body></html>`;

describe('extractArticle()', () => {
  it('pulls title and article text, dropping the Suitable-Recitals boilerplate', () => {
    const html = page(`
      <ol>
        <li>The data subject shall have the right to obtain from the controller the erasure of personal data concerning him or her without undue delay.</li>
        <li>Where the controller has made the personal data public, it shall take reasonable steps to inform other controllers.</li>
      </ol>
      <h3>Suitable Recitals</h3>
      <p><a href="/recitals/no-65/">(65) Right of Rectification and Erasure</a></p>
      <p>GDPR training presentation</p>
    `);
    const { title, fullText } = extractArticle(html);
    expect(title).toBe('Art. 17 GDPR – Right to erasure');
    expect(fullText).toContain('right to obtain from the controller the erasure');
    expect(fullText).toContain('inform other controllers');
    // Boilerplate ist weg
    expect(fullText).not.toContain('Suitable Recitals');
    expect(fullText).not.toContain('training presentation');
    expect(fullText).not.toContain('(65)');
  });

  it('throws when the content container is missing', () => {
    expect(() => extractArticle('<html><body><p>nope</p></body></html>')).toThrow(/entry-content/);
  });

  it('throws when the extracted text is below the 50-char schema minimum', () => {
    expect(() => extractArticle(page('<p>short</p>'))).toThrow(/zu kurz/);
  });
});

describe('DSGVO_ARTICLES selection', () => {
  it('is stratified: Stufe-1, Stufe-2 and at least two hard negatives', () => {
    expect(DSGVO_ARTICLES.length).toBeGreaterThanOrEqual(10);
    const hardNegs = DSGVO_ARTICLES.filter(a => a.role.includes('HARD NEGATIVE'));
    expect(hardNegs.map(a => a.paragraphNumber)).toEqual(expect.arrayContaining(['Art. 51', 'Art. 83']));
    expect(DSGVO_ARTICLES.some(a => a.role.includes('Stufe 1'))).toBe(true);
    expect(DSGVO_ARTICLES.some(a => a.role.includes('Stufe 2'))).toBe(true);
    // eindeutige Slugs
    expect(new Set(DSGVO_ARTICLES.map(a => a.slug)).size).toBe(DSGVO_ARTICLES.length);
  });
});
