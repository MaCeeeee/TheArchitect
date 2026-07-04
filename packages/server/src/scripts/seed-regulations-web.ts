/**
 * seed-regulations-web — holt authentische DSGVO-Artikeltexte von einer öffentlichen
 * Quelle (gdpr-info.eu) und schreibt sie per Produkt-API in den Projekt-Bestand.
 *
 * Hintergrund: Der Crawler schreibt in den Korpus (Server B), der von der lokalen
 * Instanz nicht lesbar ist (kein CORPUS_MONGODB_URI, Crawler ohne Read-Route), und
 * der Agent-Proxy blockt Rechtsquellen. Der Nutzer-Mac hat offenes Internet — also
 * läuft die Beschaffung HIER, lokal.
 *
 * MUSS AUF DEM NUTZER-RECHNER LAUFEN (offener Netzzugang). Dry-Run per Default:
 * zeigt je Artikel Länge + Vorschau zum Prüfen; erst --apply schreibt via API.
 * Provenance: sourceUrl = die echte gdpr-info.eu-URL. VOR FREEZE stichprobenartig
 * gegen eur-lex.europa.eu verifizieren (RUBRIC.md §6: nur gecrawlte/geprüfte Texte).
 *
 *   export TA_API=http://localhost:3000/api TA_KEY=ta_... TA_PROJECT=6a3ff887...
 *   npm run regs:seed-web                 # Dry-Run (holt + zeigt Vorschau)
 *   npm run regs:seed-web -- --apply      # schreibt ins Projekt
 *
 * Linear: THE-379 · Epic THE-378
 */
import * as cheerio from 'cheerio';

// ─── Artikel-Auswahl (stratifiziert nach RUBRIC.md §6) ──────────
//
// Stufe 1 (Systemfähigkeit): 15, 17, 32 · Stufe 2 (org. Akt): 30, 33
// Auftragsverarb./Transfer: 28, 44 · Grundsätze/Rechtsgrund: 5, 6
// Hard Negatives (Behörden-Adressat, Adressaten-Test §3): 51, 83

export interface ArticleSpec {
  source: string;
  paragraphNumber: string;
  slug: string; // gdpr-info.eu URL-Slug
  jurisdiction: string;
  language: 'de' | 'en';
  role: string; // Doku: welche Stufe/Rolle im Set
}

export const DSGVO_ARTICLES: ArticleSpec[] = [
  { source: 'dsgvo', paragraphNumber: 'Art. 5', slug: 'art-5-gdpr', jurisdiction: 'EU', language: 'en', role: 'Grundsätze' },
  { source: 'dsgvo', paragraphNumber: 'Art. 6', slug: 'art-6-gdpr', jurisdiction: 'EU', language: 'en', role: 'Rechtsgrundlage' },
  { source: 'dsgvo', paragraphNumber: 'Art. 15', slug: 'art-15-gdpr', jurisdiction: 'EU', language: 'en', role: 'Stufe 1: Auskunft' },
  { source: 'dsgvo', paragraphNumber: 'Art. 17', slug: 'art-17-gdpr', jurisdiction: 'EU', language: 'en', role: 'Stufe 1: Löschung' },
  { source: 'dsgvo', paragraphNumber: 'Art. 28', slug: 'art-28-gdpr', jurisdiction: 'EU', language: 'en', role: 'Auftragsverarbeiter' },
  { source: 'dsgvo', paragraphNumber: 'Art. 30', slug: 'art-30-gdpr', jurisdiction: 'EU', language: 'en', role: 'Stufe 2: VVT' },
  { source: 'dsgvo', paragraphNumber: 'Art. 32', slug: 'art-32-gdpr', jurisdiction: 'EU', language: 'en', role: 'Stufe 1: Sicherheit' },
  { source: 'dsgvo', paragraphNumber: 'Art. 33', slug: 'art-33-gdpr', jurisdiction: 'EU', language: 'en', role: 'Stufe 2: Meldung' },
  { source: 'dsgvo', paragraphNumber: 'Art. 44', slug: 'art-44-gdpr', jurisdiction: 'EU', language: 'en', role: 'Drittlandtransfer' },
  { source: 'dsgvo', paragraphNumber: 'Art. 51', slug: 'art-51-gdpr', jurisdiction: 'EU', language: 'en', role: 'HARD NEGATIVE: Aufsichtsbehörde' },
  { source: 'dsgvo', paragraphNumber: 'Art. 83', slug: 'art-83-gdpr', jurisdiction: 'EU', language: 'en', role: 'HARD NEGATIVE: Bußgeld' },
];

const BASE_URL = 'https://gdpr-info.eu';

// ─── Extraktion (reine Funktion — testbar) ──────────────────────

export interface ExtractedArticle {
  title: string;
  fullText: string;
}

/**
 * Zieht Titel + Artikeltext aus einer gdpr-info.eu-Seite. Schneidet die
 * Boilerplate ab „Suitable Recitals" ab (verwandte Erwägungsgründe / Werbung).
 * Wirft, wenn der Content-Container fehlt oder der Text zu kurz ist.
 */
export function extractArticle(html: string): ExtractedArticle {
  const $ = cheerio.load(html);
  const title = $('h1.entry-title').first().text().trim() || $('h1').first().text().trim();

  const content = $('.entry-content').first();
  if (content.length === 0) {
    throw new Error('kein .entry-content gefunden (Seitenstruktur geändert?)');
  }
  content.find('script, style, .entry-meta, .gdpr-nav, nav').remove();

  // Boilerplate ab „Suitable Recitals" (Überschrift) wegschneiden.
  content.find('h1, h2, h3, h4').each((_i, el) => {
    const t = $(el).text().toLowerCase();
    if (t.includes('suitable recitals') || t.includes('recitals') || t.includes('gdpr training')) {
      $(el).nextAll().remove();
      $(el).remove();
    }
  });

  const raw = content.text();
  const fullText = raw
    .replace(/\r/g, '')
    .split('\n')
    .map(l => l.trim())
    .filter(Boolean)
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  if (fullText.length < 50) {
    throw new Error(`extrahierter Text zu kurz (${fullText.length} < 50)`);
  }
  return { title, fullText: fullText.slice(0, 50_000) };
}

// ─── Fetch + Glue ───────────────────────────────────────────────

async function fetchArticle(spec: ArticleSpec): Promise<ExtractedArticle> {
  const url = `${BASE_URL}/${spec.slug}/`;
  const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; TheArchitect-eval)' } });
  if (!res.ok) throw new Error(`GET ${url}: HTTP ${res.status}`);
  return extractArticle(await res.text());
}

async function main(): Promise<void> {
  const apply = process.argv.includes('--apply');
  const api = process.env.TA_API || 'http://localhost:3000/api';
  const key = process.env.TA_KEY;
  const projectId = process.env.TA_PROJECT;
  if (!key || !projectId) {
    console.error('TA_KEY und TA_PROJECT müssen gesetzt sein (TA_API optional).');
    process.exitCode = 2;
    return;
  }

  console.log(
    `[regs-web] ${DSGVO_ARTICLES.length} Artikel · ${apply ? 'APPLY' : 'DRY-RUN (schreiben mit --apply)'}\n`
  );

  let ok = 0;
  let failed = 0;
  for (const spec of DSGVO_ARTICLES) {
    try {
      const art = await fetchArticle(spec);
      const preview = art.fullText.replace(/\n/g, ' ').slice(0, 140);
      console.log(`  ✓ ${spec.paragraphNumber} [${spec.role}] ${art.fullText.length} chars`);
      console.log(`      "${preview}…"`);

      if (apply) {
        const res = await fetch(`${api}/projects/${projectId}/regulations`, {
          method: 'POST',
          headers: { 'X-API-Key': key, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            source: spec.source,
            paragraphNumber: spec.paragraphNumber,
            title: art.title || `${spec.source.toUpperCase()} ${spec.paragraphNumber}`,
            fullText: art.fullText,
            language: spec.language,
            jurisdiction: spec.jurisdiction,
            sourceUrl: `${BASE_URL}/${spec.slug}/`,
          }),
        });
        if (!res.ok) throw new Error(`POST ${spec.paragraphNumber}: HTTP ${res.status}`);
      }
      ok++;
    } catch (err) {
      console.log(`  ✗ ${spec.paragraphNumber} — ${err instanceof Error ? err.message : err}`);
      failed++;
    }
  }

  console.log(
    `\n[regs-web] ${ok} ok · ${failed} fehlgeschlagen` +
      (apply
        ? '\n[regs-web] NEXT: GET /regulations prüfen, dann POST /compliance/mappings/auto'
        : '\n[regs-web] DRY-RUN: nichts geschrieben. Vorschau prüfen, dann --apply.') +
      '\n[regs-web] ⚠️  VOR FREEZE: Wortlaut stichprobenartig gegen eur-lex.europa.eu verifizieren.'
  );
  if (failed > 0) process.exitCode = 1;
}

if (require.main === module) {
  main().catch(err => {
    console.error('[regs-web] FAILED:', err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
