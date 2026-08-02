/**
 * credentialKey — Auflösung und Prüfung des Credential-Schlüssels
 * (THE-534, SECURITY).
 *
 * ── DER BEFUND ──
 *
 * `Connection.ts` fiel bei fehlendem `CREDENTIAL_ENCRYPTION_KEY` auf einen
 * Schlüssel aus lauter Nullen zurück — die Connector-Zugangsdaten der Nutzer
 * (SAP, ServiceNow, Jira, GitHub …) lagen damit faktisch im Klartext für
 * jeden mit Datenbank-Zugriff. Es gab nur ein `console.warn`.
 *
 * Und das war kein reines Dev-Problem: `docker-compose.prod.yml` übergibt
 * `${CREDENTIAL_ENCRYPTION_KEY:-}` — die `:-`-Form liefert bei fehlender
 * Variable einen LEEREN STRING, nicht „unset". In JS ist `''` falsy, also
 * greift der Null-Key. `.env.example` führte die Variable ohne Platzhalter.
 *
 * ── DIE REGEL ──
 *
 * In Produktion gibt es KEINEN Ersatzschlüssel. Fehlt er, ist er leer, hat er
 * das falsche Format oder ist er der Null-Key: **Abbruch**. Ein Server, der
 * Zugangsdaten unsicher ablegt, ist schlimmer als einer, der nicht startet —
 * Letzteres merkt man sofort, Ersteres unter Umständen nie.
 *
 * Außerhalb von Produktion bleibt der Dev-Fallback, damit lokale Arbeit ohne
 * Einrichtung läuft. Aber: ein GESETZTER, aber kaputter Schlüssel fällt auch
 * dort NICHT still auf den Ersatz zurück — das wäre ein versteckter
 * Konfigurationsfehler, der erst beim Deploy nach Produktion auffliegt.
 *
 * ── WARUM DAS FORMAT MITGEPRÜFT WIRD ──
 *
 * `Buffer.from('zz…', 'hex')` wirft NICHT, sondern liefert einen kürzeren
 * Buffer. Ein unbemerkt schwächerer Schlüssel ist genau die Art Fehler, die
 * dieses Ticket beseitigt.
 *
 * Linear: THE-534
 */

/** Der frühere Dev-Fallback — 32 Null-Bytes als Hex. */
export const NULL_KEY = '0'.repeat(64);

/** Erzeugungs-Befehl, gehört in jede Fehlermeldung: ohne ihn ist sie nicht handlungsfähig. */
export const KEY_GENERATION_HINT = 'openssl rand -hex 32';

const HEX_64 = /^[0-9a-f]{64}$/i;

export function isNullKey(key: string): boolean {
  return key === NULL_KEY;
}

/**
 * Prüft einen Schlüsselwert. `null` = in Ordnung, sonst die Begründung.
 *
 * Getrennt von `resolveCredentialKey`, damit ein Start-Check die Meldung
 * ausgeben kann, ohne zu werfen.
 */
export function validateCredentialKey(key: string | undefined): string | null {
  if (!key || key.trim() === '') {
    return `CREDENTIAL_ENCRYPTION_KEY is not set (or empty). Generate one with: ${KEY_GENERATION_HINT}`;
  }
  if (!HEX_64.test(key)) {
    return `CREDENTIAL_ENCRYPTION_KEY must be 64 hex characters (32 bytes). Generate one with: ${KEY_GENERATION_HINT}`;
  }
  if (isNullKey(key)) {
    return `CREDENTIAL_ENCRYPTION_KEY is the insecure dev key (all zeros). Generate a real one with: ${KEY_GENERATION_HINT}`;
  }
  return null;
}

/**
 * Der Schlüssel für Ver- und Entschlüsselung.
 *
 * WIRFT in Produktion bei jedem Mangel. Außerhalb von Produktion nur dann,
 * wenn ein Schlüssel gesetzt, aber unbrauchbar ist — ein fehlender fällt dort
 * auf den Dev-Schlüssel zurück.
 */
export function resolveCredentialKey(
  key: string | undefined,
  nodeEnv: string | undefined,
): string {
  const problem = validateCredentialKey(key);
  if (!problem) return key!.toLowerCase();

  if (nodeEnv === 'production') {
    throw new Error(`[security] ${problem}`);
  }
  // Gesetzt, aber kaputt → auch in Dev ein Fehler (siehe Kopf).
  if (key && key.trim() !== '' && !isNullKey(key)) {
    throw new Error(`[security] ${problem}`);
  }
  return NULL_KEY;
}

/**
 * Start-Check für `main()`. Gibt `null` zurück, wenn alles in Ordnung ist,
 * sonst die Meldung — der Aufrufer entscheidet über Abbruch oder Warnung.
 */
export function checkCredentialKeyAtStartup(
  env: NodeJS.ProcessEnv = process.env,
): { ok: boolean; message: string | null; fatal: boolean } {
  const problem = validateCredentialKey(env.CREDENTIAL_ENCRYPTION_KEY);
  if (!problem) return { ok: true, message: null, fatal: false };
  return { ok: false, message: problem, fatal: env.NODE_ENV === 'production' };
}
