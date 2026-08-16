/**
 * THE-685 (REQ-CANON-001.3a): Formex-Beschaffungs-Spike — MISST, ÄNDERT NICHTS.
 *
 *   npm run formex:probe                      # alle EU-Fassungen, Netz erlaubt
 *   npm run formex:probe -- --source dora     # eine Fassung
 *   npm run formex:probe -- --offline         # nur aus der Ablage (Parser-Arbeit)
 *   npm run formex:probe -- --no-corpus       # ohne Bestandsabgleich (kein Mongo nötig)
 *
 * ── ROTE LINIE (AC-1) ──
 * Dieses CLI ist read-only. Es lädt KEIN Mongoose-Modell — es öffnet eine eigene
 * Verbindung und ruft ausschließlich `distinct` und `countDocuments`. Ohne
 * Modell gibt es kein Schema, ohne Schema keinen Schreibpfad. Das ist billiger
 * als jede Zusicherung, es werde schon nichts geschrieben.
 *
 * ── WAS ES BEANTWORTET ──
 * Für jede Fassung: Liefert CELLAR Formex? Trägt es lückenlose amtliche Ids?
 * Und — die eigentliche Frage — deckt sich die amtliche Artikelmenge mit
 * unserem Bestand? Abweichungen werden EINZELN benannt, nie als Summe: eine
 * Summe hätte den fehlenden DORA-Artikel 61 nie gezeigt.
 */
import { hostname } from 'node:os';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { SOURCE_CRAWL_CONFIG, type CrawlConfig } from '../sources/crawl-config';
import { fetchFormex, FormexFetchError, CELLAR_LANGUAGE } from '../lib/formexFetch';
import { analyzeFormex, normalizeArticleNumber, type FormexAnalysis } from '../lib/formexAnalyze';

const PAKET_WURZEL = resolve(__dirname, '../..');
const REPO_WURZEL = resolve(__dirname, '../../../..');

// Absoluter Pfad, nicht relativ: das Arbeitsverzeichnis wandert zwischen Mac
// (Repo-Wurzel oder Paket) und Server B (Container). Auf Server B fehlt die
// Datei — dotenv überschreibt vorhandene Variablen ohnehin nicht.
dotenv.config({ path: resolve(REPO_WURZEL, '.env') });

interface Args {
  offline: boolean;
  withCorpus: boolean;
  source?: string;
  cacheDir: string;
}

function parseArgs(argv: string[]): Args {
  const args: Args = {
    offline: false,
    withCorpus: true,
    cacheDir: process.env.FORMEX_CACHE_DIR || join(PAKET_WURZEL, '.formex-cache'),
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--offline') args.offline = true;
    else if (a === '--no-corpus') args.withCorpus = false;
    else if (a === '--source') args.source = argv[++i];
    else if (a === '--cache-dir') args.cacheDir = resolve(argv[++i]);
    else {
      console.error(`[formex-probe] Unbekanntes Argument: ${a}`);
      console.error('[formex-probe] Usage: formex-probe [--offline] [--no-corpus] [--source X] [--cache-dir DIR]');
      process.exit(2);
    }
  }
  return args;
}

interface Befund {
  source: string;
  celex: string;
  language: string;
  ok: boolean;
  fehler?: string;
  zipBytes?: number;
  sha256?: string;
  fromCache?: boolean;
  /** Über welchen Weg die Fassung kam — aufgelöst, geraten oder aus der Ablage. */
  route?: 'cache' | 'sparql' | 'celex-alias';
  url?: string;
  manifestationCount?: number;
  analyse?: FormexAnalysis;
  /** Artikelnummern im Bestand (aus `regulations.paragraphNumber`). */
  bestandArtikel?: string[];
  bestandRecitals?: number[];
  fehlendeArtikel?: string[];
  ueberzaehligeArtikel?: string[];
  fehlendeRecitals?: number[];
  ueberzaehligeRecitals?: number[];
}

/** Nur Host und Datenbank zeigen — Zugangsdaten gehören nie in eine Ausgabe. */
function maskUri(uri: string): string {
  try {
    const u = new URL(uri);
    return `${u.protocol}//${u.hostname}${u.port ? `:${u.port}` : ''}${u.pathname}`;
  } catch {
    return '(nicht lesbar)';
  }
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  const familien = Object.entries(SOURCE_CRAWL_CONFIG).filter(
    ([id, c]) =>
      (c as CrawlConfig).transport === 'eur-lex' &&
      (c as CrawlConfig).celex &&
      (c as CrawlConfig).language &&
      (!args.source || id === args.source)
  ) as Array<[string, CrawlConfig]>;
  if (familien.length === 0) throw new Error(`Keine EU-Fassung${args.source ? ` für '${args.source}'` : ''}.`);

  const ohneCellar = Object.entries(SOURCE_CRAWL_CONFIG).filter(([, c]) => (c as CrawlConfig).transport !== 'eur-lex');

  // ── Bestand: eigene, read-only Verbindung ──
  let conn: mongoose.Connection | null = null;
  let korpusUri = '';
  if (args.withCorpus) {
    korpusUri = process.env.CORPUS_MONGODB_URI || process.env.MONGODB_URI || '';
    if (!korpusUri) throw new Error('Weder CORPUS_MONGODB_URI noch MONGODB_URI gesetzt — mit --no-corpus laufen lassen.');
    conn = await mongoose.createConnection(korpusUri, { serverSelectionTimeoutMS: 8_000 }).asPromise();
  }

  console.log(`[formex-probe] ${familien.length} Fassung(en) · Host: ${hostname()}`);
  console.log(`[formex-probe] Ablage: ${args.cacheDir}${args.offline ? ' · OFFLINE (nur Ablage)' : ''}`);
  if (conn) console.log(`[formex-probe] Bestand (read-only): ${maskUri(korpusUri)}`);
  console.log('');

  const befunde: Befund[] = [];
  for (const [source, cfg] of familien) {
    const b: Befund = { source, celex: cfg.celex!, language: cfg.language!, ok: false };
    try {
      const paket = await fetchFormex(cfg.celex!, cfg.language!, {
        cacheDir: args.cacheDir,
        allowNetwork: !args.offline,
        userAgent: process.env.CRAWLER_USER_AGENT || 'TheArchitect-Compliance-Crawler/1.0',
      });
      const analyse = analyzeFormex(paket.xml, paket.docXml ?? undefined);

      // AC-8: Ein gültiges ZIP ohne jede Struktur ist ein Fehler, kein Befund.
      if (analyse.articles.length === 0 && analyse.recitalNumbers.length === 0) {
        throw new Error(`0 Artikel UND 0 Erwägungsgründe bei ${paket.zipBytes} Bytes — Analyse prüfen`);
      }

      Object.assign(b, {
        ok: true,
        zipBytes: paket.zipBytes,
        sha256: paket.sha256,
        fromCache: paket.fromCache,
        route: paket.route,
        url: paket.url,
        manifestationCount: paket.manifestationCount,
        analyse,
      });

      if (conn) {
        // Beide Seiten durch dieselbe Normalform: der Bestand führt `art. 61`,
        // die amtliche Quelle „Artikel 61". Was sich nicht normalisieren lässt
        // (Anhänge o. Ä.), bleibt roh stehen und taucht als überzählig auf —
        // sichtbar statt still verworfen.
        const bestandRoh = (await conn.collection('regulations').distinct('paragraphNumber', { source })) as string[];
        const bestandArtikel = bestandRoh.map((p) => normalizeArticleNumber(String(p)) ?? String(p).toLowerCase().trim());
        const bestandRecitals = ((await conn
          .collection('recitals')
          .distinct('recitalNumber', { source })) as number[]).map(Number);

        const amtlichA = new Set(analyse.articleNumbers);
        const bestandA = new Set(bestandArtikel);
        const amtlichR = new Set(analyse.recitalNumbers);
        const bestandR = new Set(bestandRecitals);

        Object.assign(b, {
          bestandArtikel,
          bestandRecitals,
          fehlendeArtikel: [...amtlichA].filter((n) => !bestandA.has(n)),
          ueberzaehligeArtikel: [...bestandA].filter((n) => !amtlichA.has(n)),
          fehlendeRecitals: [...amtlichR].filter((n) => !bestandR.has(n)),
          ueberzaehligeRecitals: [...bestandR].filter((n) => !amtlichR.has(n)),
        });
      }
    } catch (err) {
      b.fehler = err instanceof FormexFetchError ? `${err.message}${err.detail ? ` — ${err.detail}` : ''}` : String(err);
    }
    befunde.push(b);

    const a = b.analyse;
    const zeile = b.ok
      ? `${String(a!.articles.length).padStart(3)} Art · ${String(a!.recitalNumbers.length).padStart(4)} Erw · ` +
        `${a!.expressionType.padEnd(9)} · ${b.route!.padEnd(11)} · ${(b.zipBytes! / 1024).toFixed(0).padStart(4)} kB` +
        `${a!.articleGaps.length ? ` · amtl. Lücke ${a!.articleGaps.join(',')}` : ''}` +
        `${b.fehlendeArtikel?.length ? ` · IM BESTAND FEHLT ${b.fehlendeArtikel.join(',')}` : ''}` +
        `${b.ueberzaehligeArtikel?.length ? ` · ÜBERZÄHLIG ${b.ueberzaehligeArtikel.join(',')}` : ''}`
      : `✗ ${b.fehler}`;
    console.log(`  ${source.padEnd(20)} ${zeile}`);
    if (!b.fromCache && !args.offline) await new Promise((r) => setTimeout(r, 1_500)); // höflich gegenüber CELLAR
  }

  // ── Ablage-Verzeichnis (AC-3) + Bericht (AC-4) ──
  const geholt = befunde.filter((b) => b.ok);
  const manifest = {
    ticket: 'THE-685',
    note: 'Formex-Ablage: welche Fassung mit welchem Inhalt geholt wurde. Die Prüfsumme macht die ZIPs wiederbeschaffbar, ohne sie ins Repo zu legen.',
    host: hostname(),
    cacheDir: args.cacheDir,
    entries: geholt.map((b) => ({
      source: b.source,
      celex: b.celex,
      language: b.language,
      cellarLanguage: CELLAR_LANGUAGE[b.language],
      url: b.url,
      route: b.route,
      manifestationCount: b.manifestationCount,
      zipBytes: b.zipBytes,
      sha256: b.sha256,
      schemaVersion: b.analyse!.schemaVersion,
      expressionType: b.analyse!.expressionType,
    })),
  };
  const manifestPfad = join(PAKET_WURZEL, 'fixtures', 'the685-formex-manifest.json');
  mkdirSync(join(PAKET_WURZEL, 'fixtures'), { recursive: true });
  writeFileSync(manifestPfad, JSON.stringify(manifest, null, 2) + '\n');

  const berichtPfad = join(REPO_WURZEL, 'docs', 'evals', 'the685-formex-aequivalenz.md');
  mkdirSync(join(REPO_WURZEL, 'docs', 'evals'), { recursive: true });
  writeFileSync(berichtPfad, baueBericht(befunde, ohneCellar, args, korpusUri));

  // ── Zusammenfassung ──
  const mitAbweichung = befunde.filter((b) => b.ok && (b.fehlendeArtikel?.length || b.ueberzaehligeArtikel?.length));
  const mitAmtlLuecke = befunde.filter((b) => b.ok && b.analyse!.articleGaps.length > 0);
  console.log(`\n[formex-probe] SUMMARY`);
  console.log(`  Formex geliefert   : ${geholt.length} von ${befunde.length} Fassungen`);
  console.log(`  amtliche Lücken    : ${mitAmtlLuecke.length} Fassungen ${mitAmtlLuecke.length ? '(amtliche Nummerierung selbst lückig — kein Bestandsfehler)' : ''}`);
  console.log(`  Bestandsabweichung : ${mitAbweichung.length} Fassungen`);
  console.log(`  ohne CELLAR-Weg    : ${ohneCellar.map(([id]) => id).join(', ') || '—'}`);
  console.log(`  → Ablage           : ${manifestPfad}`);
  console.log(`  → Bericht          : ${berichtPfad}`);
  const fehlgeschlagen = befunde.filter((b) => !b.ok);
  if (fehlgeschlagen.length > 0) {
    console.error(`\n[formex-probe] NICHT GELIEFERT (${fehlgeschlagen.length}):`);
    for (const b of fehlgeschlagen) console.error(`  ✗ ${b.source}: ${b.fehler}`);
  }

  if (conn) await conn.close();
  // Der Spike misst; ein nicht gelieferter Rechtsakt ist ein Befund, kein Absturz.
  // Rot wird es nur, wenn NICHTS geliefert wurde — dann stimmt der Weg nicht.
  if (geholt.length === 0) process.exit(1);
}

function liste(xs: Array<string | number> | undefined, max = 12): string {
  if (!xs || xs.length === 0) return '—';
  return xs.length <= max ? xs.join(', ') : `${xs.slice(0, max).join(', ')} … (+${xs.length - max})`;
}

function baueBericht(befunde: Befund[], ohneCellar: Array<[string, CrawlConfig]>, args: Args, korpusUri: string): string {
  const z: string[] = [];
  z.push('# THE-685 — Formex-Äquivalenz: amtliche Struktur gegen unseren Bestand', '');
  z.push('> Erzeugt von `npm run formex:probe` (read-only). Nicht von Hand pflegen — neu erzeugen.', '');
  z.push(`**Host:** ${hostname()} · **Ablage:** \`${args.cacheDir}\`` + (korpusUri ? ` · **Bestand:** \`${maskUri(korpusUri)}\`` : ' · **ohne Bestandsabgleich**'), '');

  z.push('## Übersicht', '');
  z.push('| Fassung | CELEX | Formex | Weg | Ausdruck | Artikel amtl. | Artikel Bestand | Erw. amtl. | Erw. Bestand | Abweichung |');
  z.push('|---|---|---|---|---|---|---|---|---|---|');
  for (const b of befunde) {
    if (!b.ok) {
      z.push(`| \`${b.source}\` | ${b.celex} | ✗ | — | — | — | — | — | — | ${b.fehler?.slice(0, 80)} |`);
      continue;
    }
    const a = b.analyse!;
    const abw = [
      b.fehlendeArtikel?.length ? `fehlt: ${liste(b.fehlendeArtikel, 6)}` : '',
      b.ueberzaehligeArtikel?.length ? `überzählig: ${liste(b.ueberzaehligeArtikel, 6)}` : '',
      b.fehlendeRecitals?.length ? `Erw. fehlt: ${liste(b.fehlendeRecitals, 6)}` : '',
    ].filter(Boolean).join(' · ');
    z.push(
      `| \`${b.source}\` | ${b.celex} | ✓ ${(b.zipBytes! / 1024).toFixed(0)} kB | ${b.route} | ${a.expressionType} | ` +
        `${a.articles.length} | ${b.bestandArtikel?.length ?? '—'} | ${a.recitalNumbers.length} | ${b.bestandRecitals?.length ?? '—'} | ${abw || '—'} |`
    );
  }
  z.push('');

  z.push('## Abweichungen im Einzelnen', '');
  z.push('Jede Abweichung mit Nummer — eine Summe hätte den fehlenden DORA-Artikel 61 nie gezeigt.', '');
  const auffaellig = befunde.filter(
    (b) => b.ok && (b.fehlendeArtikel?.length || b.ueberzaehligeArtikel?.length || b.fehlendeRecitals?.length || b.ueberzaehligeRecitals?.length)
  );
  if (auffaellig.length === 0) z.push('_Keine — amtliche Menge und Bestand decken sich in allen geprüften Fassungen._', '');
  for (const b of auffaellig) {
    z.push(`### \`${b.source}\` (${b.celex})`, '');
    for (const [label, xs] of [
      ['Artikel amtlich vorhanden, im Bestand FEHLEND', b.fehlendeArtikel],
      ['Artikel im Bestand, amtlich NICHT vorhanden', b.ueberzaehligeArtikel],
      ['Erwägungsgründe amtlich vorhanden, im Bestand fehlend', b.fehlendeRecitals],
      ['Erwägungsgründe im Bestand, amtlich nicht vorhanden', b.ueberzaehligeRecitals],
    ] as Array<[string, Array<string | number> | undefined]>) {
      if (xs?.length) z.push(`- **${label}:** ${liste(xs, 40)}`);
    }
    for (const nr of b.fehlendeArtikel ?? []) {
      const art = b.analyse!.articles.find((a) => a.number === nr);
      if (art) z.push(`  - Artikel ${nr} (amtliche Id \`${art.identifier}\`): „${art.title}"`);
    }
    z.push('');
  }

  z.push('## Struktur je Fassung', '');
  z.push('| Fassung | Schema | ARTICLE | PARAG | ALINEA | LIST | ITEM | CONSID | ANNEX | zitiert (ausgenommen) | amtl. Nummern-Lücke |');
  z.push('|---|---|---|---|---|---|---|---|---|---|---|');
  for (const b of befunde.filter((x) => x.ok)) {
    const c = b.analyse!.counts;
    z.push(
      `| \`${b.source}\` | ${b.analyse!.schemaVersion ?? '—'} | ${c.ARTICLE ?? 0} | ${c.PARAG ?? 0} | ${c.ALINEA ?? 0} | ` +
        `${c.LIST ?? 0} | ${c.ITEM ?? 0} | ${c.CONSID ?? 0} | ${c.ANNEX ?? 0} | ${b.analyse!.quotedElements} | ${liste(b.analyse!.articleGaps, 8)} |`
    );
  }
  z.push('');

  z.push('## Grenzen (AC-6)', '');
  z.push('- **Kein CELLAR-Weg:** ' + (ohneCellar.map(([id, c]) => `\`${id}\` (${c.transport})`).join(', ') || '—') + ' — nationales Recht bzw. andere Beschaffung.');
  const nichtGeliefert = befunde.filter((b) => !b.ok);
  z.push('- **CELLAR ohne Formex:** ' + (nichtGeliefert.map((b) => `\`${b.source}\``).join(', ') || 'keine') + '.');
  z.push('- **Anhänge:** `ARTICLE` außerhalb von `ENACTING.TERMS` wird ausgewiesen, aber nicht als Artikel des Gesetzes gezählt.');
  z.push('- **Zitierte Rechtsakte:** Alles unter `QUOT.S` ist fremder Text und bleibt aus jeder Zählung heraus.');
  z.push('');
  return z.join('\n');
}

main().catch(async (err) => {
  console.error('[formex-probe] Abbruch:', err);
  await mongoose.disconnect().catch(() => undefined);
  process.exit(1);
});
