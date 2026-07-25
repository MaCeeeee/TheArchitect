#!/usr/bin/env node
/**
 * export-relations-pool.cjs — THE-517 AC-2: Pool-Export für das Verweis-Mining.
 *
 * Läuft IM Crawler-Container auf Server B (dort sind MONGODB_URI → Korpus-DB,
 * QDRANT_URL und QDRANT_API_KEY bereits gesetzt; mongoose liegt in
 * /app/node_modules). Zieht read-only alle Korpus-Provisions aus Mongo und
 * joint die Embedding-Vektoren aus der Qdrant-Collection `regulations-corpus`
 * über den regulationKey. Schreibt den Pool als JSON-Array nach STDOUT —
 * der Vollständigkeits-Report geht nach STDERR, damit `> pool.json` sauber
 * bleibt.
 *
 * Kontrakt der Ausgabe (loadCandidatesFromPool, build-relations-golden.ts):
 *   [{ source, paragraphNumber, title, fullText, language, embedding: number[] }]
 * Provisions ohne Vektor bleiben IM Pool (der Loader schließt sie selbst laut
 * aus) — aber der Report hier weist sie pro Quelle aus, damit eine Lücke in
 * der Qdrant-Abdeckung nicht erst beim Mining auffällt.
 *
 * Aufruf (Server B):
 *   docker cp /tmp/export-pool.cjs <container>:/tmp/
 *   docker exec <container> node /tmp/export-pool.cjs > /tmp/relations-pool.json
 */
'use strict';

const mongoose = require('mongoose');

const MONGODB_URI = process.env.MONGODB_URI;
const QDRANT_URL = (process.env.QDRANT_URL || '').replace(/\/+$/, '');
const QDRANT_API_KEY = process.env.QDRANT_API_KEY;
const QDRANT_COLLECTION = process.env.QDRANT_COLLECTION || 'regulations-corpus';

function log(msg) {
  process.stderr.write(`[export-pool] ${msg}\n`);
}

function fail(msg) {
  log(`FEHLER: ${msg}`);
  process.exit(2);
}

/** Qdrant liefert den Vektor je nach Collection-Config als Array oder benannt. */
function extractVector(v) {
  if (Array.isArray(v)) return v;
  if (v && typeof v === 'object') {
    const first = Object.values(v)[0];
    if (Array.isArray(first)) return first;
  }
  return null;
}

async function scrollQdrant() {
  const byKey = new Map();
  let offset = null;
  let pages = 0;
  do {
    const res = await fetch(`${QDRANT_URL}/collections/${QDRANT_COLLECTION}/points/scroll`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'api-key': QDRANT_API_KEY || '' },
      body: JSON.stringify({ limit: 512, with_payload: true, with_vector: true, offset }),
    });
    if (!res.ok) fail(`Qdrant scroll HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);
    const json = await res.json();
    const points = json?.result?.points || [];
    for (const p of points) {
      const pay = p.payload || {};
      const key = pay.regulationKey || pay.regulation_key || pay.key;
      const vec = extractVector(p.vector);
      if (key && vec) byKey.set(key, { vector: vec, versionHash: pay.versionHash || pay.version_hash });
    }
    offset = json?.result?.next_page_offset ?? null;
    pages += 1;
  } while (offset !== null && offset !== undefined);
  log(`Qdrant: ${byKey.size} Punkte mit regulationKey+Vektor über ${pages} Seiten (${QDRANT_COLLECTION})`);
  return byKey;
}

async function main() {
  if (!MONGODB_URI) fail('MONGODB_URI nicht gesetzt (im Crawler-Container laufen lassen)');
  if (!QDRANT_URL) fail('QDRANT_URL nicht gesetzt (im Crawler-Container laufen lassen)');

  await mongoose.connect(MONGODB_URI);
  const db = mongoose.connection.db;

  let docs = await db
    .collection('regulations')
    .find({}, { projection: { regulationKey: 1, source: 1, paragraphNumber: 1, title: 1, fullText: 1, language: 1, versionHash: 1 } })
    .toArray();

  if (docs.length === 0) {
    const names = (await db.listCollections().toArray()).map((c) => c.name).join(', ');
    fail(`Collection 'regulations' ist leer/fehlt. Vorhandene Collections: ${names}`);
  }
  log(`Mongo: ${docs.length} Provisions gelesen (${db.databaseName}.regulations)`);

  const vectors = await scrollQdrant();

  const pool = [];
  const perSource = new Map();
  for (const d of docs) {
    const key = d.regulationKey;
    const hit = key ? vectors.get(key) : undefined;
    const stat = perSource.get(d.source) || { total: 0, withVec: 0, hashMismatch: 0 };
    stat.total += 1;
    let embedding;
    if (hit) {
      stat.withVec += 1;
      if (hit.versionHash && d.versionHash && hit.versionHash !== d.versionHash) stat.hashMismatch += 1;
      embedding = hit.vector;
    }
    perSource.set(d.source, stat);
    pool.push({
      source: d.source,
      paragraphNumber: d.paragraphNumber,
      title: d.title || '',
      fullText: d.fullText || '',
      language: d.language === 'en' ? 'en' : 'de',
      ...(embedding ? { embedding } : {}),
    });
  }

  log('Abdeckung pro Quelle (total / mit Vektor / versionHash-Abweichung):');
  let missing = 0;
  for (const [src, s] of [...perSource.entries()].sort()) {
    missing += s.total - s.withVec;
    log(`  ${src}: ${s.total} / ${s.withVec} / ${s.hashMismatch}`);
  }
  if (missing > 0) log(`⚠️ ${missing} Provisions OHNE Vektor — der Miner schließt sie laut aus (nicht still).`);
  else log('✓ Vektor-Abdeckung vollständig.');

  process.stdout.write(JSON.stringify(pool));
  await mongoose.disconnect();
  log(`fertig: ${pool.length} Provisions im Pool.`);
}

main().catch((err) => fail(err?.stack || String(err)));
