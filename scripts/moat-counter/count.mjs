#!/usr/bin/env node
// Moat-Zähler (THE-717): G5 bekommt eine Wochenzahl. Strikt lesend.
// Quellen: Korpus-Mongo (CORPUS_MONGODB_URI, nur via Tailnet erreichbar),
// Gold-Verzeichnis packages/server/src/evals/golden.
// Aufruf: scripts/moat-counter/count.sh (setzt cwd + env)
import { readFileSync, readdirSync, statSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const require = createRequire(join(ROOT, 'packages/server/package.json'));
const { MongoClient } = require('mongoose').mongo;

const uri = (readFileSync(join(ROOT, '.env'), 'utf8').match(/^CORPUS_MONGODB_URI=(.+)$/m) || [])[1]?.trim();
if (!uri) { console.error('CORPUS_MONGODB_URI fehlt in .env'); process.exit(1); }

function countGold(dir) {
  let files = 0, cases = 0;
  const walk = (d) => {
    for (const e of readdirSync(d)) {
      const p = join(d, e);
      if (statSync(p).isDirectory()) { walk(p); continue; }
      files++;
      if (e.endsWith('.json')) {
        try {
          const j = JSON.parse(readFileSync(p, 'utf8'));
          const arr = Array.isArray(j) ? j : (j.cases || j.items || j.pairs || j.examples || []);
          cases += Array.isArray(arr) ? arr.length : 0;
        } catch { /* nicht-parsebares zaehlt nur als Datei */ }
      }
    }
  };
  walk(dir);
  return { files, cases };
}

let corpus = null, warn = '';
// Zwei Versuche — die Tailnet-Route braucht nach Idle gelegentlich einen Weckruf.
let c;
try {
  for (let attempt = 1; attempt <= 2; attempt++) {
    c = new MongoClient(uri, { serverSelectionTimeoutMS: 15000 });
    try { await c.connect(); break; }
    catch (e) { await c.close().catch(() => {}); if (attempt === 2) throw e; }
  }
  const db = c.db();
  const provisions = await db.collection('regulations').estimatedDocumentCount();
  const recitals = await db.collection('recitals').estimatedDocumentCount();
  const typed = await db.collection('regulations').countDocuments({ typing: { $exists: true } });
  const laws = (await db.collection('regulations').aggregate([
    { $project: { law: { $arrayElemAt: [{ $split: ['$regulationKey', ':'] }, 0] } } },
    { $group: { _id: '$law' } }, { $count: 'n' },
  ]).toArray())[0]?.n ?? 0;
  corpus = { laws, provisions, recitals, typed };
  await c.close();
} catch (e) {
  warn = `WARN: Korpus-Mongo nicht erreichbar (${e.message}) — nur Repo-Zahlen. Tailnet prüfen (100.106.223.83).`;
}

const gold = countGold(join(ROOT, 'packages/server/src/evals/golden'));

// ISO-Woche + Delta gegen den jüngsten vorhandenen Report
const now = new Date();
const week = `${now.toLocaleDateString('sv', { timeZone: 'Europe/Berlin' })}`;
const isoWeek = (() => {
  const d = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
  const day = d.getUTCDay() || 7; d.setUTCDate(d.getUTCDate() + 4 - day);
  const y = d.getUTCFullYear();
  const w = Math.ceil((((d - Date.UTC(y, 0, 1)) / 86400000) + 1) / 7);
  return `${y}-W${String(w).padStart(2, '0')}`;
})();

const metrics = {
  'Gesetze live': corpus?.laws ?? null,
  'Bestimmungen (regulations)': corpus?.provisions ?? null,
  'Erwägungsgründe (recitals)': corpus?.recitals ?? null,
  'davon typisiert': corpus?.typed ?? null,
  'Gold-Dateien': gold.files,
  'Gold-Fälle': gold.cases,
};

const outDir = join(ROOT, 'reports', 'moat');
mkdirSync(outDir, { recursive: true });
// Delta gegen den zuletzt geschriebenen Report — auch derselben Woche (Lauf-über-Lauf),
// im Wochentakt ist das automatisch der Vorwochen-Report.
const prevFiles = existsSync(outDir) ? readdirSync(outDir).filter(f => f.endsWith('.md')).sort() : [];
const prevFile = prevFiles.pop();
let prev = {};
if (prevFile) {
  const txt = readFileSync(join(outDir, prevFile), 'utf8');
  for (const m of txt.matchAll(/^\| (.+?) \| ([\d.]+|—) \|/gm)) {
    if (m[2] !== '—') prev[m[1]] = Number(m[2]);
  }
}

let md = `# Moat-Report ${isoWeek}\n\nStand ${week} · Quelle: regulations-corpus (Tailnet) + packages/server/src/evals/golden · read-only\n`;
if (warn) md += `\n> ${warn}\n`;
md += `\n| Messgröße | Wert | Δ zu ${prevFile ? prevFile.replace('.md', '') : '—'} |\n|---|---|---|\n`;
for (const [k, v] of Object.entries(metrics)) {
  const d = (v != null && prev[k] != null) ? (v - prev[k] === 0 ? '±0' : (v - prev[k] > 0 ? `+${v - prev[k]}` : `${v - prev[k]}`)) : '—';
  md += `| ${k} | ${v ?? '—'} | ${d} |\n`;
}
md += `\nHandlungskatalog: noch nicht instrumentiert — Quelle unklar (THE-538-Katalog „26 aus 216" hat keinen maschinenlesbaren Ort im Repo). Befund gehört in die nächste Betting Table.\n`;

writeFileSync(join(outDir, `${isoWeek}.md`), md);
console.log(md);
console.log(`→ geschrieben: reports/moat/${isoWeek}.md`);
