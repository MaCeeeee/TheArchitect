/**
 * THE-684: die sechs Schäden des Änderungsartikel-Fehlers reparieren.
 *
 *   npm run the684:repair              # DRY-RUN — zeigt, was geschrieben würde
 *   npm run the684:repair -- --write   # schreibt
 *
 * ── Warum ein eigenes CLI statt eines Neu-Crawls ──
 * Ein voller Neu-Crawl der betroffenen Fassungen würde ALLE ihre Artikel neu
 * schreiben. Der Text käme dann aus einem anderen Parser als bei den Nachbarn,
 * jeder versionHash änderte sich, und Einbettung wie Typisierung müssten für
 * ~500 Bestimmungen nachlaufen — teuer, und die 494 gesunden Artikel hätten
 * nichts davon. Dieses CLI fasst deshalb NUR die Datensätze an, die
 * nachweislich defekt sind.
 *
 * ── Was „nachweislich defekt" heißt ──
 * Nicht eine Liste im Code. Der Defekt wird bei jedem Lauf neu gegen die
 * amtliche Formex-Struktur bestimmt (Ablage aus THE-685):
 *   FEHLT       — amtlich vorhandene Artikelnummer ohne Datensatz
 *   TITEL FALSCH — Datensatz da, aber sein Titel deckt sich nicht mit dem amtlichen
 * Damit repariert der Lauf genau das, was die Messung zeigt — und meldet am
 * Ende dieselbe Messung erneut, statt „fertig" zu behaupten.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import AdmZip from 'adm-zip';
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import { Regulation } from '../db/regulation.model';
import { buildRegulationKey, computeVersionHash } from '../db/regulationKey';
import { NORM_ONTOLOGY } from '@thearchitect/shared';
import { SOURCE_CRAWL_CONFIG, deriveEurLexUrl, type CrawlConfig } from '../sources/crawl-config';
import { EurLexSource } from '../sources/eur-lex';
import { cacheFileName } from '../lib/formexFetch';
import { analyzeFormex, normalizeArticleNumber } from '../lib/formexAnalyze';
import { fetchLegalHtml } from '../lib/legalHtmlFetch';

const PAKET_WURZEL = resolve(__dirname, '../..');
// `../config` wird hier bewusst NICHT importiert: es liest die Umgebung beim
// Import — also bevor diese Zeile die Repo-`.env` laden kann — und verlangt
// dabei ein MONGODB_URI, das dieses CLI gar nicht benutzt.
dotenv.config({ path: resolve(PAKET_WURZEL, '../../.env') });

const ABLAGE = process.env.FORMEX_CACHE_DIR || join(PAKET_WURZEL, '.formex-cache');

type DefektArt = 'fehlt' | 'titel-falsch';
interface Defekt {
  source: string;
  nummer: string;
  art: DefektArt;
  amtlicherTitel: string;
  bestandsTitel?: string;
}

/** Titel-Vergleich, robust gegen Zeichensetzung und Groß-/Kleinschreibung. */
function titelKern(s: string): string {
  return s.toLowerCase().replace(/[^a-zäöüß0-9]/g, '').slice(0, 40);
}

function titelPasst(amtlich: string, bestand: string): boolean {
  const a = titelKern(amtlich);
  const b = titelKern(bestand);
  if (a.length <= 6 || b.length <= 6) return true; // zu kurz für ein Urteil
  return a.startsWith(b.slice(0, 20)) || b.startsWith(a.slice(0, 20));
}

/** Amtliche Artikel einer Fassung aus der Formex-Ablage: Nummer → Titel. */
function amtlicheArtikel(cfg: CrawlConfig): Map<string, string> | null {
  const pfad = join(ABLAGE, cacheFileName(cfg.celex!, cfg.language!));
  if (!existsSync(pfad)) return null;
  const eintrag = new AdmZip(readFileSync(pfad))
    .getEntries()
    .filter((e) => e.entryName.endsWith('.xml') && !e.entryName.endsWith('.doc.xml'))
    .sort((a, b) => b.header.size - a.header.size)[0];
  return new Map(
    analyzeFormex(eintrag.getData().toString('utf8'))
      .articles.filter((a) => a.number)
      .map((a) => [a.number!, a.title])
  );
}

/** Defekte einer Fassung bestimmen — die Messung, nicht eine Liste. */
async function defekteFinden(source: string, cfg: CrawlConfig): Promise<Defekt[]> {
  const amtlich = amtlicheArtikel(cfg);
  if (!amtlich) return [];
  const docs = await Regulation.find({ source }, { paragraphNumber: 1, title: 1 }).lean();
  const bestand = new Map<string, string>();
  for (const d of docs) {
    const n = normalizeArticleNumber(String(d.paragraphNumber));
    if (n) bestand.set(n, String(d.title ?? ''));
  }
  const defekte: Defekt[] = [];
  for (const [nummer, amtlicherTitel] of amtlich) {
    const bestandsTitel = bestand.get(nummer);
    if (bestandsTitel === undefined) {
      defekte.push({ source, nummer, art: 'fehlt', amtlicherTitel });
    } else if (!titelPasst(amtlicherTitel, bestandsTitel)) {
      defekte.push({ source, nummer, art: 'titel-falsch', amtlicherTitel, bestandsTitel });
    }
  }
  return defekte;
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const schreiben = argv.includes('--write');
  for (const a of argv) {
    if (a !== '--write') {
      console.error(`[the684-repair] Unbekanntes Argument: ${a}`);
      process.exit(2);
    }
  }

  // Eigene Verbindung mit sichtbarem Ziel: auf Server B ist MONGODB_URI der
  // Korpus, auf dem Mac die lokale Entwicklungs-DB. Ein Werkzeug, das schreibt,
  // muss zeigen, WOHIN — sonst repariert man irgendwann den falschen Bestand.
  const korpusUri = process.env.CORPUS_MONGODB_URI || process.env.MONGODB_URI || '';
  if (!korpusUri) throw new Error('Weder CORPUS_MONGODB_URI noch MONGODB_URI gesetzt.');
  let ziel = '(nicht lesbar)';
  try {
    const u = new URL(korpusUri);
    ziel = `${u.protocol}//${u.hostname}${u.port ? `:${u.port}` : ''}${u.pathname}`;
  } catch {
    /* Anzeige ist Beiwerk, nie ein Grund abzubrechen */
  }
  await mongoose.connect(korpusUri, { serverSelectionTimeoutMS: 8_000 });
  console.log(`[the684-repair] Ziel: ${ziel}`);
  const vorher = await Regulation.countDocuments({});

  const eurLex = Object.entries(SOURCE_CRAWL_CONFIG).filter(
    ([, c]) => (c as CrawlConfig).transport === 'eur-lex' && (c as CrawlConfig).celex && (c as CrawlConfig).language
  ) as Array<[string, CrawlConfig]>;

  console.log(`[the684-repair] ${eurLex.length} Fassungen · Bestimmungen vorher: ${vorher}${schreiben ? '' : ' · DRY-RUN'}\n`);

  const alleDefekte: Defekt[] = [];
  for (const [source, cfg] of eurLex) alleDefekte.push(...(await defekteFinden(source, cfg)));

  if (alleDefekte.length === 0) {
    console.log('[the684-repair] Keine Defekte — der Bestand deckt sich mit der amtlichen Struktur.');
    await mongoose.disconnect();
    return;
  }

  const proQuelle = new Map<string, Defekt[]>();
  for (const d of alleDefekte) proQuelle.set(d.source, [...(proQuelle.get(d.source) ?? []), d]);

  console.log(`Gefundene Defekte: ${alleDefekte.length} in ${proQuelle.size} Fassungen`);
  for (const d of alleDefekte) {
    console.log(
      `  ${d.source.padEnd(11)} Art. ${d.nummer.padEnd(4)} ${d.art === 'fehlt' ? 'FEHLT       ' : 'TITEL FALSCH'} ` +
        `amtlich „${d.amtlicherTitel.slice(0, 42)}"${d.bestandsTitel !== undefined ? ` · Bestand „${d.bestandsTitel.slice(0, 32)}"` : ''}`
    );
  }
  console.log('');

  let geschrieben = 0;
  const unreparierbar: string[] = [];
  for (const [source, defekte] of proQuelle) {
    const cfg = SOURCE_CRAWL_CONFIG[source];
    const url = deriveEurLexUrl(cfg.celex!, cfg.language!);
    let html: string;
    try {
      const res = await fetchLegalHtml(url, {
        firecrawlKey: process.env.FIRECRAWL_API_KEY,
        firecrawlUrl: process.env.FIRECRAWL_API_URL || undefined,
      });
      html = res.html;
      if (res.via === 'firecrawl') console.log(`  ${source}: Direktweg gedrosselt → über Firecrawl geholt`);
    } catch (err) {
      unreparierbar.push(`${source}: HTML nicht beschaffbar — ${(err as Error).message}`);
      continue;
    }

    // Der HTML-Parser trifft Artikel-Überschriften über die EUR-Lex-Klasse
    // `p.oj-ti-art` — er rät sie nicht am Zeilenanfang und ist deshalb von
    // diesem Fehler nie betroffen gewesen.
    const parser = new EurLexSource({
      source: source as never,
      jurisdiction: cfg.jurisdiction as never,
      language: cfg.language as never,
      effectiveFrom: cfg.effectiveFrom ? new Date(cfg.effectiveFrom) : new Date(0),
      celex: cfg.celex!,
      url,
    });
    const geparst = new Map(
      parser.parseHtml(html).map((p) => [normalizeArticleNumber(p.paragraphNumber) ?? p.paragraphNumber, p])
    );
    const fetchedAt = new Date();

    for (const d of defekte) {
      const p = geparst.get(d.nummer);
      if (!p) {
        unreparierbar.push(`${source} Art. ${d.nummer}: im HTML nicht gefunden`);
        continue;
      }
      if (!titelPasst(d.amtlicherTitel, p.title)) {
        // Nicht blind schreiben: was der Parser liefert, muss zum amtlichen
        // Titel passen — sonst tauschen wir einen Defekt gegen einen anderen.
        unreparierbar.push(
          `${source} Art. ${d.nummer}: Parser-Titel „${p.title.slice(0, 40)}" passt nicht zum amtlichen „${d.amtlicherTitel.slice(0, 40)}"`
        );
        continue;
      }
      const regulationKey = buildRegulationKey(p.source, p.paragraphNumber);
      console.log(
        `  ${schreiben ? 'schreibe' : 'würde schreiben'} ${regulationKey.padEnd(18)} ${String(p.fullText.length).padStart(5)} Z · „${p.title.slice(0, 40)}"`
      );
      if (schreiben) {
        await Regulation.updateOne(
          { regulationKey, version: 1 },
          {
            $set: {
              ...p,
              regulationKey,
              versionHash: computeVersionHash(p.fullText),
              crawledAt: new Date(),
              provenance: { adapter: 'eur-lex', format: 'html', fetchedAt, sourceUri: p.sourceUrl },
              ontologyVersion: NORM_ONTOLOGY.ontologyVersion,
            },
            $setOnInsert: { version: 1 },
          },
          { upsert: true, runValidators: true }
        );
      }
      geschrieben++;
    }
  }

  // Nachmessen statt behaupten: dieselbe Messung noch einmal.
  const rest: Defekt[] = [];
  if (schreiben) {
    for (const [source, cfg] of eurLex) rest.push(...(await defekteFinden(source, cfg)));
  }
  const nachher = await Regulation.countDocuments({});

  console.log(`\n[the684-repair] SUMMARY`);
  console.log(`  Defekte gefunden : ${alleDefekte.length}`);
  console.log(`  ${schreiben ? 'geschrieben     ' : 'würde schreiben '} : ${geschrieben}`);
  if (schreiben) console.log(`  Defekte danach   : ${rest.length} ${rest.length === 0 ? '✓' : '✗ ' + rest.map((d) => `${d.source}:${d.nummer}`).join(', ')}`);
  console.log(`  Bestimmungen     : ${vorher} → ${nachher}`);
  if (unreparierbar.length > 0) {
    console.error(`\n[the684-repair] NICHT REPARIERBAR (${unreparierbar.length}):`);
    for (const u of unreparierbar) console.error(`  ✗ ${u}`);
  }
  if (schreiben && geschrieben > 0) {
    console.log(
      `\n  Hinweis: die neuen Datensätze tragen noch keine Vektoren und keine Typisierung.\n` +
        `  Vektoren zieht der Nachzug (ADR-0009), Typisierung läuft über 'npm run typing:batch'.`
    );
  }

  await mongoose.disconnect();
  if (unreparierbar.length > 0 || (schreiben && rest.length > 0)) process.exit(1);
}

main().catch(async (err) => {
  console.error('[the684-repair] Abbruch:', err);
  await mongoose.disconnect().catch(() => undefined);
  process.exit(1);
});
