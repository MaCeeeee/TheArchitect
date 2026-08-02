/**
 * reencrypt-credentials — Connector-Zugangsdaten auf einen neuen Schlüssel
 * umschlüsseln (THE-534).
 *
 *   npm run credentials:reencrypt -- --from <alter-key> --to <neuer-key> [--apply]
 *
 * Nur nötig, wenn Server A bisher mit dem Null-Schlüssel lief. Dann sind die
 * Blobs faktisch im Klartext abgelegt und müssen auf einen echten Schlüssel
 * gehoben werden.
 *
 * ── TROCKENLAUF IST DER STANDARD ──
 *
 * Ohne `--apply` wird NICHTS geschrieben. Das Skript fasst Zugangsdaten an;
 * ein versehentlicher Lauf mit falschem `--from` würde jeden Blob unlesbar
 * machen. Der Trockenlauf zeigt, wie viele Dokumente lesbar sind — ist diese
 * Zahl nicht die erwartete, ist der Quell-Schlüssel falsch und man hört auf.
 *
 * ── KEINE KLARTEXT-AUSGABE ──
 *
 * Das Skript gibt NIE entschlüsselte Werte aus, auch nicht gekürzt. Es zählt
 * nur. Wer ein Migrations-Log mit Zugangsdaten erzeugt, hat das Problem
 * verschoben statt gelöst.
 *
 * ── UND DANACH: ROTIEREN ──
 *
 * Umschlüsseln macht die Daten wieder sicher ABGELEGT — es macht nicht
 * ungeschehen, dass sie unsicher lagen. Lief der Null-Schlüssel in Produktion,
 * sind die betroffenen Zugangsdaten als kompromittiert zu behandeln und beim
 * Zielsystem zu rotieren. Das sagt auch die Abschlussmeldung.
 *
 * Linear: THE-534
 */
import 'dotenv/config';
import crypto from 'crypto';
import mongoose from 'mongoose';
import { validateCredentialKey, NULL_KEY } from '../models/credentialKey';

interface Blob {
  _id: unknown;
  credentials?: string;
}

/** Entschlüsselt mit einem AUSDRÜCKLICH übergebenen Schlüssel. REIN. */
export function decryptWith(blob: string, keyHex: string): Record<string, string> | null {
  if (!blob) return null;
  try {
    const [ivHex, tagHex, dataHex] = blob.split(':');
    if (!ivHex || !tagHex || !dataHex) return null;
    const d = crypto.createDecipheriv('aes-256-gcm', Buffer.from(keyHex, 'hex'), Buffer.from(ivHex, 'hex'));
    d.setAuthTag(Buffer.from(tagHex, 'hex'));
    const out = Buffer.concat([d.update(Buffer.from(dataHex, 'hex')), d.final()]);
    return JSON.parse(out.toString('utf8')) as Record<string, string>;
  } catch {
    return null;
  }
}

/** Verschlüsselt mit einem AUSDRÜCKLICH übergebenen Schlüssel. REIN. */
export function encryptWith(value: Record<string, string>, keyHex: string): string {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', Buffer.from(keyHex, 'hex'), iv);
  const enc = Buffer.concat([c.update(JSON.stringify(value), 'utf8'), c.final()]);
  return `${iv.toString('hex')}:${c.getAuthTag().toString('hex')}:${enc.toString('hex')}`;
}

export interface ReencryptPlan {
  total: number;
  readable: number;
  unreadable: number;
  empty: number;
}

/** Was ein Lauf täte — ohne zu schreiben. REIN. */
export function planReencryption(docs: Blob[], fromKey: string): ReencryptPlan {
  let readable = 0;
  let unreadable = 0;
  let empty = 0;
  for (const d of docs) {
    if (!d.credentials) {
      empty += 1;
      continue;
    }
    if (decryptWith(d.credentials, fromKey)) readable += 1;
    else unreadable += 1;
  }
  return { total: docs.length, readable, unreadable, empty };
}

function arg(argv: string[], flag: string): string | undefined {
  const i = argv.indexOf(flag);
  return i !== -1 ? argv[i + 1] : undefined;
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const fromKey = arg(argv, '--from') ?? NULL_KEY;
  const toKey = arg(argv, '--to');
  const apply = argv.includes('--apply');

  if (!toKey) {
    console.error('Usage: reencrypt-credentials --to <64-hex> [--from <64-hex>] [--apply]');
    console.error('  --from entfällt = der Null-Schlüssel (der Fall, um den es geht).');
    process.exitCode = 2;
    return;
  }
  const problem = validateCredentialKey(toKey);
  if (problem) {
    console.error(`[reencrypt] Ziel-Schlüssel unbrauchbar: ${problem}`);
    process.exitCode = 2;
    return;
  }
  if (fromKey === toKey) {
    console.error('[reencrypt] Quell- und Ziel-Schlüssel sind identisch — nichts zu tun.');
    process.exitCode = 2;
    return;
  }

  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error('[reencrypt] MONGODB_URI fehlt.');
    process.exitCode = 2;
    return;
  }
  await mongoose.connect(uri);
  const coll = mongoose.connection.collection('connections');
  const docs = (await coll.find({}, { projection: { credentials: 1 } }).toArray()) as unknown as Blob[];

  const plan = planReencryption(docs, fromKey);
  console.log(
    `[reencrypt] ${plan.total} Verbindung(en): ${plan.readable} lesbar · ${plan.unreadable} NICHT lesbar · ${plan.empty} ohne Zugangsdaten`,
  );

  if (plan.unreadable > 0) {
    console.warn(
      `[reencrypt] WARNUNG: ${plan.unreadable} Blob(s) lassen sich mit dem Quell-Schlüssel nicht lesen. ` +
        'Entweder ist --from falsch, oder diese Dokumente wurden bereits umgeschlüsselt. ' +
        'Sie bleiben unangetastet.',
    );
  }

  if (!apply) {
    console.log('[reencrypt] TROCKENLAUF — nichts geschrieben. Mit --apply ausführen, wenn die Zahlen stimmen.');
    await mongoose.disconnect();
    return;
  }

  let written = 0;
  for (const d of docs) {
    if (!d.credentials) continue;
    const plain = decryptWith(d.credentials, fromKey);
    if (!plain) continue; // nicht lesbar → nicht anfassen
    await coll.updateOne({ _id: d._id as never }, { $set: { credentials: encryptWith(plain, toKey) } });
    written += 1;
  }
  console.log(`[reencrypt] ${written} Verbindung(en) umgeschlüsselt.`);
  console.log(
    '[reencrypt] WICHTIG: Umschlüsseln macht die Ablage wieder sicher — es macht nicht ungeschehen, ' +
      'dass die Daten unsicher lagen. Lief der Null-Schlüssel in Produktion, sind die betroffenen ' +
      'Zugangsdaten als kompromittiert zu behandeln und beim Zielsystem zu ROTIEREN.',
  );
  await mongoose.disconnect();
}

if (require.main === module) {
  void main();
}
