/**
 * THE-681 (REQ-679.2): Erwägungsgründe crawlen → eigene Collection `recitals`.
 *
 *   npm run recitals:crawl -- --dry-run          # zählt, schreibt nichts
 *   npm run recitals:crawl -- --source cra-de    # eine Fassung
 *   npm run recitals:crawl                        # alle EUR-Lex-Fassungen
 *
 * ── ROTE LINIE (aus THE-679) ──
 * KEIN Schreibvorgang auf `regulations`. Dieses CLI schreibt ausschließlich
 * in die Collection `recitals`. Als Beleg zählt es `regulations` vor und
 * nach dem Lauf — die Zahl MUSS identisch sein (AC-2).
 *
 * ── IDEMPOTENZ (AC-6) ──
 * Je Fassung wird der Bestand einmal gelesen (regulationKey → versionHash);
 * geschrieben wird nur, was neu ist oder dessen Text sich geändert hat.
 * Zweiter Lauf ohne Quellen-Änderung = 0 Writes.
 */
import axios from 'axios';
import { connectMongo, disconnectMongo } from '../db/mongo';
import { Recital } from '../db/recital.model';
import { Regulation } from '../db/regulation.model';
import { SOURCE_CRAWL_CONFIG, deriveEurLexUrl, type CrawlConfig } from '../sources/crawl-config';
import { extractRecitals, buildRecitalDoc } from '../lib/recitalExtract';

interface Args {
  dryRun: boolean;
  source?: string;
}

function parseArgs(argv: string[]): Args {
  const args: Args = { dryRun: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--dry-run') args.dryRun = true;
    else if (a === '--source') args.source = argv[++i];
    else {
      console.error(`[recitals-crawl] Unbekanntes Argument: ${a}`);
      console.error('[recitals-crawl] Usage: recitals-crawl [--dry-run] [--source X]');
      process.exit(2);
    }
  }
  return args;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const rows = Object.entries(SOURCE_CRAWL_CONFIG).filter(
    ([id, c]) =>
      (c as CrawlConfig).transport === 'eur-lex' &&
      (c as CrawlConfig).celex &&
      (c as CrawlConfig).language &&
      (!args.source || id === args.source)
  ) as Array<[string, CrawlConfig]>;
  if (rows.length === 0) throw new Error(`Keine passende EUR-Lex-Quelle${args.source ? ` für '${args.source}'` : ''}.`);

  await connectMongo();
  const regulationsVorher = await Regulation.countDocuments({});

  let inserted = 0;
  let updated = 0;
  let unchanged = 0;
  const fehler: string[] = [];

  console.log(
    `[recitals-crawl] ${rows.length} Fassung(en) · regulations vorher: ${regulationsVorher}` +
      `${args.dryRun ? ' · DRY-RUN (keine Writes)' : ''}\n`
  );

  for (const [source, cfg] of rows) {
    const url = deriveEurLexUrl(cfg.celex!, cfg.language!);

    // Fetch mit Drossel-Erkennung: EUR-Lex antwortet unter Last mit HTTP 202
    // und LEEREM Body (beobachtet 14.08. nach ~55 Requests in einer Stunde).
    // Ein leerer Body ist ein Quellen-Problem, NIE "0 Erwägungsgründe" —
    // die Unterscheidung hat der erste Dry-Run nicht getroffen und meldete
    // 24 falsche Fehler. Backoff: 20s, dann 75s.
    let html = '';
    let fetchFehler = '';
    for (const wartezeit of [0, 20_000, 75_000]) {
      if (wartezeit > 0) {
        console.log(`  ${source.padEnd(20)} gedrosselt — warte ${wartezeit / 1000}s …`);
        await new Promise((r) => setTimeout(r, wartezeit));
      }
      try {
        const res = await axios.get(url, {
          timeout: 60_000,
          headers: { 'User-Agent': 'TheArchitect-Compliance-Crawler/1.0' },
          validateStatus: () => true,
        });
        if (res.status === 200 && String(res.data ?? '').length > 10_000) {
          html = String(res.data);
          fetchFehler = '';
          break;
        }
        fetchFehler = `HTTP ${res.status}, Body ${String(res.data ?? '').length} Zeichen (gedrosselt?)`;
      } catch (err) {
        fetchFehler = (err as Error).message.slice(0, 60);
      }
    }
    if (!html) {
      fehler.push(`${source}: fetch — ${fetchFehler}`);
      continue;
    }

    const ex = extractRecitals(html);

    // Eigene Regel: eine leere Messung ist kein Bestehen. Eine Fassung, die
    // der Spike als sauber belegt hat, darf hier nicht still 0 liefern.
    if (ex.recitals.length === 0) {
      // Der erste Dry-Run lehrte: 0 hieß bisher immer "Quelle gedrosselt",
      // nie "keine Erwägungsgründe" — selbst eprivacy (2002) liefert 49
      // über den Absatz-Fallback. 0 ist deshalb IMMER ein Fehler.
      fehler.push(`${source}: 0 Erwägungsgründe trotz vollem HTML — Extraktion prüfen`);
      continue;
    }
    if (ex.gaps.length > 0) {
      fehler.push(`${source}: Lücken bei ${ex.gaps.slice(0, 6).join(',')} — nicht geschrieben`);
      continue;
    }

    // Bestand einmal lesen: regulationKey → versionHash (Idempotenz, AC-6).
    const bestand = new Map<string, string>(
      (
        await Recital.find({ source }, { regulationKey: 1, versionHash: 1 }).lean()
      ).map((d) => [d.regulationKey, d.versionHash])
    );

    let ins = 0;
    let upd = 0;
    let same = 0;
    const crawledAt = new Date();
    for (const recital of ex.recitals) {
      const doc = buildRecitalDoc({ source, language: cfg.language!, celex: cfg.celex!, recital, crawledAt });
      const vorhanden = bestand.get(doc.regulationKey);
      if (vorhanden === doc.versionHash) {
        same++;
        continue;
      }
      if (!args.dryRun) {
        await Recital.updateOne(
          { regulationKey: doc.regulationKey },
          { $set: doc },
          { upsert: true, runValidators: true }
        );
      }
      if (vorhanden === undefined) ins++;
      else upd++;
    }
    inserted += ins;
    updated += upd;
    unchanged += same;
    console.log(
      `  ${source.padEnd(20)} ${String(ex.recitals.length).padStart(4)} Erw. · ` +
        `neu ${String(ins).padStart(4)} · geändert ${String(upd).padStart(3)} · unverändert ${String(same).padStart(4)} · ${ex.selector}`
    );
    await new Promise((r) => setTimeout(r, 3_000)); // höflich gegenüber EUR-Lex — 900ms reichten nicht
  }

  const regulationsNachher = await Regulation.countDocuments({});
  const recitalsGesamt = await Recital.countDocuments({});

  console.log(`\n[recitals-crawl] SUMMARY`);
  console.log(`  neu geschrieben  : ${inserted}${args.dryRun ? ' (DRY-RUN — nichts geschrieben)' : ''}`);
  console.log(`  geändert         : ${updated}`);
  console.log(`  unverändert      : ${unchanged}`);
  console.log(`  recitals gesamt  : ${recitalsGesamt}`);
  console.log(
    `  regulations      : ${regulationsVorher} → ${regulationsNachher} ` +
      `${regulationsVorher === regulationsNachher ? '✓ unberührt (AC-2)' : '✗✗✗ VERÄNDERT — das darf nicht sein'}`
  );
  if (fehler.length > 0) {
    console.error(`\n[recitals-crawl] FEHLER (${fehler.length}):`);
    for (const f of fehler) console.error(`  ✗ ${f}`);
  }
  await disconnectMongo();
  if (fehler.length > 0 || regulationsVorher !== regulationsNachher) process.exit(1);
}

main().catch(async (err) => {
  console.error('[recitals-crawl] Abbruch:', err);
  await disconnectMongo().catch(() => undefined);
  process.exit(1);
});
