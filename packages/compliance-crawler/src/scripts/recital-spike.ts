/**
 * REQ-679.1 — Extraktions-Spike: Sind Erwägungsgründe in allen Familien sauber
 * abgrenzbar? READ-ONLY, kein Schreibvorgang auf irgendeine Datenbank (AC-1).
 *
 * Quelle ist dieselbe EUR-Lex-HTML-Seite, die der Crawler heute schon zieht.
 * Die CELEX-Nummern kommen aus SOURCE_CRAWL_CONFIG — keine zweite Liste, die
 * driften könnte (die Zwei-Listen-Falle hat uns diese Woche schon zweimal
 * getroffen).
 *
 * Ansatz: Die Präambel ist der Bereich VOR dem ersten Artikel-Titel
 * (`p.oj-ti-art` — derselbe Anker, an dem der Crawler heute zu lesen BEGINNT).
 * Darin sind Erwägungsgründe Absätze, die mit "(N)" anfangen.
 */
import axios from 'axios';
import * as cheerio from 'cheerio';
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { SOURCE_CRAWL_CONFIG, deriveEurLexUrl } from '../sources/crawl-config';

/** Amtliche Erwartung für die Gegenprobe (AC-5) — öffentlich bekannte Zahlen. */
const ERWARTUNG: Record<string, number> = { 'ai-act': 180, dsgvo: 173, dora: 106 };

/** Formeln, die das Ende der Präambel markieren (DE + EN, mehrere Rechtsakt-Arten). */
const ENDE =
  /HABEN FOLGENDE (VERORDNUNG|RICHTLINIE) ERLASSEN|HAVE ADOPTED THIS (REGULATION|DIRECTIVE)/i;

interface Befund {
  source: string;
  celex: string;
  url: string;
  gefunden: number;
  hoechste: number;
  luecken: number[];
  endeMarker: boolean;
  merkmal: string;
  fehler?: string;
}

async function pruefe(source: string, celex: string, language: string): Promise<Befund> {
  const url = deriveEurLexUrl(celex, language);
  const basis: Befund = { source, celex, url, gefunden: 0, hoechste: 0, luecken: [], endeMarker: false, merkmal: '—' };
  try {
    const res = await axios.get(url, {
      timeout: 60_000,
      headers: { 'User-Agent': 'TheArchitect-Compliance-Crawler/1.0' },
    });
    const $ = cheerio.load(res.data);

    // DIAGNOSE 14.08.: prevAll() war falsch. Der Artikel-Anker liegt tief in
    // `div.eli-subdivision` und hat NULL Geschwister davor — die Präambel ist
    // ein anderer Zweig des Baums, kein vorheriges Geschwister. Der tragende
    // Container ist `div.eli-subdivision`; die Präambel endet an der
    // Erlass-Formel, die im CRA-DE bei Zeichen 207.239 steht, dicht vor
    // "Artikel 1" (207.482). Deshalb: am TEXT schneiden, nicht am Baum.
    const ganzerText = $('body').text();
    const endeTreffer = ENDE.exec(ganzerText);
    const grenze = endeTreffer ? endeTreffer.index : -1;

    const nummern: number[] = [];
    const merkmale = new Map<string, number>();
    let laufendeLaenge = 0;
    const kandidaten = $('div.eli-subdivision').toArray();
    if (kandidaten.length === 0) {
      return { ...basis, fehler: 'kein div.eli-subdivision — anderes Markup' };
    }
    for (const el of kandidaten) {
      const text = $(el).text().replace(/\s+/g, ' ').trim();
      // Nur Container, die GENAU einen Erwägungsgrund tragen (nicht die
      // Sammel-Divs, die alles enthalten) — Heuristik: kein zweiter
      // "(N)"-Anfang tief drin, Länge plausibel.
      const m = /^\((\d{1,3})\)\s+\S/.exec(text);
      if (!m) continue;
      const n = Number(m[1]);
      if (n < 1 || n > 400 || nummern.includes(n)) continue;
      // Vor der Erlass-Formel? (Artikel-Absätze heißen auch "(1)")
      const pos = ganzerText.indexOf(text.slice(0, 40));
      if (grenze > 0 && pos > grenze) continue;
      nummern.push(n);
      laufendeLaenge += text.length;
      const cls = ($(el).attr('class') ?? '(ohne Klasse)').split(/\s+/)[0];
      merkmale.set(cls, (merkmale.get(cls) ?? 0) + 1);
    }

    const ganzerVorspann = grenze > 0 ? ganzerText.slice(0, grenze + 40) : ganzerText;
    const hoechste = nummern.length ? Math.max(...nummern) : 0;
    const luecken: number[] = [];
    for (let i = 1; i <= hoechste; i++) if (!nummern.includes(i)) luecken.push(i);

    return {
      ...basis,
      gefunden: nummern.length,
      hoechste,
      luecken,
      endeMarker: ENDE.test(ganzerVorspann),
      merkmal: [...merkmale.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? '—',
    };
  } catch (err) {
    return { ...basis, fehler: (err as Error).message.slice(0, 90) };
  }
}

function urteil(b: Befund): 'sauber' | 'teilweise' | 'nicht extrahierbar' {
  if (b.fehler || b.gefunden === 0) return 'nicht extrahierbar';
  if (b.luecken.length > 0 || !b.endeMarker) return 'teilweise';
  return 'sauber';
}

async function main(): Promise<void> {
  const rows = Object.entries(SOURCE_CRAWL_CONFIG).filter(
    ([, c]: [string, any]) => c.transport === 'eur-lex' && c.celex && c.language
  ) as Array<[string, any]>;
  if (rows.length === 0) throw new Error('0 EUR-Lex-Quellen in der Config — leere Messung ist kein Bestehen.');

  console.log(`Prüfe ${rows.length} Fassungen …\n`);
  const befunde: Befund[] = [];
  for (const [source, cfg] of rows) {
    const b = await pruefe(source, cfg.celex, cfg.language);
    befunde.push(b);
    const u = urteil(b);
    const luecke = b.luecken.length ? ` LÜCKEN: ${b.luecken.slice(0, 8).join(',')}${b.luecken.length > 8 ? '…' : ''}` : '';
    console.log(
      `  ${source.padEnd(20)} ${String(b.gefunden).padStart(4)} Erw. (max ${String(b.hoechste).padStart(3)})  ` +
        `${b.endeMarker ? 'Ende ✓' : 'Ende ✗'}  ${u.padEnd(18)} ${b.merkmal}${luecke}${b.fehler ? '  ' + b.fehler : ''}`
    );
    await new Promise((r) => setTimeout(r, 900)); // höflich gegenüber EUR-Lex
  }

  // ── Familien-Urteil: eine Familie gilt, wenn MINDESTENS eine Fassung sauber ist
  const familien = new Map<string, Befund[]>();
  for (const b of befunde) {
    const f = b.source.replace(/-(de|en)$/, '');
    familien.set(f, [...(familien.get(f) ?? []), b]);
  }
  const sauber = [...familien.entries()].filter(([, bs]) => bs.some((b) => urteil(b) === 'sauber'));

  console.log(`\n── Familien-Urteil ──`);
  console.log(`  sauber extrahierbar: ${sauber.length} von ${familien.size}`);
  console.log(`  Kill-Kriterium (≥10): ${sauber.length >= 10 ? 'GEHALTEN' : 'GERISSEN'}`);

  console.log(`\n── Gegenprobe amtliche Erwartung (AC-5) ──`);
  for (const [fam, soll] of Object.entries(ERWARTUNG)) {
    const bs = familien.get(fam) ?? [];
    for (const b of bs) {
      const d = b.hoechste - soll;
      console.log(`  ${b.source.padEnd(20)} gefunden ${String(b.hoechste).padStart(3)} · erwartet ${soll} · Δ ${d > 0 ? '+' : ''}${d}  ${Math.abs(d) <= 2 ? '✓' : '⚠ verdächtig'}`);
    }
  }

  console.log(`\n── Sprach-Quervergleich (AC-6) ──`);
  for (const [fam, bs] of [...familien.entries()].sort()) {
    if (bs.length < 2) continue;
    const zahlen = bs.map((b) => b.gefunden);
    if (new Set(zahlen).size > 1) {
      console.log(`  ⚠ ${fam}: ${bs.map((b) => `${b.source}=${b.gefunden}`).join(' vs. ')}`);
    }
  }

  writeFileSync(
    resolve(__dirname, '../../../../docs/evals/the680-recital-spike.json'),
    JSON.stringify({ befunde, familien: sauber.map(([f]) => f) }, null, 2)
  );
  console.log(`\n  → docs/evals/the680-recital-spike.json`);
}
main().catch((e) => { console.error(e); process.exit(1); });
