#!/usr/bin/env node
// Vertriebs-Log (THE-716): legt die NocoDB-Tabelle an und schreibt den ersten Eintrag.
// Idempotent: existiert die Tabelle bereits, wird nur gemeldet, nichts doppelt angelegt.
// Aufruf: node scripts/vertriebslog/setup.mjs   (liest NOCODB_URL/NOCODB_API_TOKEN/NOCODB_TABLE_ID aus .env)
// Stand 31.08.2026: waitlist.thearchitect.site liefert "tlsv1 alert internal error" —
// Caddy hat für die Subdomain kein gültiges Zertifikat. Script danach erneut ausführen.
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const env = readFileSync(join(ROOT, '.env'), 'utf8');
const get = (k) => (env.match(new RegExp(`^${k}=(.+)$`, 'm')) || [])[1]?.trim();
const URL_ = get('NOCODB_URL'), TOKEN = get('NOCODB_API_TOKEN'), WAITLIST_TABLE = get('NOCODB_TABLE_ID');
if (!URL_ || !TOKEN) { console.error('NOCODB_URL/NOCODB_API_TOKEN fehlen in .env'); process.exit(1); }

const api = async (method, path, body) => {
  const res = await fetch(`${URL_}${path}`, {
    method,
    headers: { 'xc-token': TOKEN, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status}: ${text.slice(0, 200)}`);
  return text ? JSON.parse(text) : null;
};

// Base über die bekannte Waitlist-Tabelle finden (kein Raten von IDs).
const waitlistMeta = await api('GET', `/api/v2/meta/tables/${WAITLIST_TABLE}`);
const baseId = waitlistMeta.base_id;
console.log(`Base: ${baseId} (via Waitlist-Tabelle)`);

const tables = await api('GET', `/api/v2/meta/bases/${baseId}/tables`);
const existing = (tables.list || []).find((t) => t.title === 'Vertriebslog');
let tableId;
if (existing) {
  tableId = existing.id;
  console.log(`Tabelle existiert bereits: ${tableId} — kein Neuanlegen.`);
} else {
  const created = await api('POST', `/api/v2/meta/bases/${baseId}/tables`, {
    table_name: 'vertriebslog',
    title: 'Vertriebslog',
    columns: [
      { column_name: 'datum', title: 'Datum', uidt: 'Date' },
      { column_name: 'firma_kontakt', title: 'Firma/Kontakt', uidt: 'SingleLineText' },
      { column_name: 'kanal', title: 'Kanal', uidt: 'SingleLineText' },
      { column_name: 'typ', title: 'Typ', uidt: 'SingleLineText' },
      { column_name: 'antwortlatenz_tage', title: 'Antwortlatenz (Tage)', uidt: 'Number' },
      { column_name: 'absagegrund', title: 'Absagegrund', uidt: 'LongText' },
      { column_name: 'zeitaufwand_min', title: 'Zeitaufwand (Min)', uidt: 'Number' },
      { column_name: 'naechster_schritt', title: 'Nächster Schritt', uidt: 'LongText' },
    ],
  });
  tableId = created.id;
  console.log(`Tabelle angelegt: ${tableId}`);
}

// Erster Eintrag: die BSH-Terminanfrage. Die Latenz-Uhr startet erst mit dem realen
// Versand durch den Menschen — bis dahin steht der Eintrag auf "Entwurf bereit".
const rows = await api('GET', `/api/v2/tables/${tableId}/records?limit=1&where=(Typ,eq,Anfrage)`);
if ((rows.list || []).length === 0) {
  await api('POST', `/api/v2/tables/${tableId}/records`, {
    Datum: new Date().toISOString().slice(0, 10),
    'Firma/Kontakt': 'BSH (Business-Architekt)',
    Kanal: 'E-Mail',
    Typ: 'Anfrage',
    'Nächster Schritt': 'Entwurf bereit (docs/customer/, privates Repo) — Latenz-Uhr startet mit realem Versand. NDA/AVV-Vorlauf im selben Anschreiben.',
    'Zeitaufwand (Min)': 0,
  });
  console.log('Erster Eintrag geschrieben: BSH-Terminanfrage (Entwurf bereit).');
} else {
  console.log('Erster Eintrag existiert bereits — übersprungen.');
}

console.log(`\nWochenkennzahl (AC-2), als Abfrage:
  curl -s "${URL_}/api/v2/tables/${tableId}/records?where=(Datum,gte,exactDate,<Montag>)&limit=200" -H "xc-token: …" \\
    | jq '[.list[]] | {gespraeche: ([.[] | select(.Typ=="Gespräch")] | length), minuten: ([.[]."Zeitaufwand (Min)"] | add)}'`);
