/**
 * Tests für den Credential-Schlüssel (THE-534, SECURITY).
 *
 * DER BEFUND: fehlte `CREDENTIAL_ENCRYPTION_KEY`, verschlüsselte der Server die
 * Connector-Zugangsdaten der Nutzer (SAP, ServiceNow, Jira, GitHub …) mit
 * einem Schlüssel aus lauter Nullen — also faktisch im Klartext für jeden mit
 * Datenbank-Zugriff. Es gab nur ein `console.warn`, keinen Abbruch.
 *
 * `docker-compose.prod.yml` macht daraus einen Produktionsfall: die Form
 * `${CREDENTIAL_ENCRYPTION_KEY:-}` übergibt bei fehlender Variable einen
 * LEEREN STRING, nicht „unset" — und `''` ist in JS falsy, der Null-Key greift.
 *
 * ── DIE REGEL ──
 *
 * In Produktion gibt es keinen Ersatzschlüssel. Fehlt er, ist er leer, hat er
 * das falsche Format oder ist er der Null-Key: **Start abbrechen**. Ein Server,
 * der Zugangsdaten unsicher ablegt, ist schlimmer als einer, der nicht startet
 * — Letzteres merkt man sofort.
 *
 * Außerhalb von Produktion bleibt der Dev-Fallback, aber laut und benannt.
 */
import {
  NULL_KEY,
  isNullKey,
  validateCredentialKey,
  resolveCredentialKey,
} from '../models/credentialKey';

describe('isNullKey — die Falle, um die es geht', () => {
  it('recognises the all-zero dev key', () => {
    expect(isNullKey(NULL_KEY)).toBe(true);
    expect(isNullKey('0'.repeat(64))).toBe(true);
  });

  it('does not flag a real key', () => {
    expect(isNullKey('a3f1'.repeat(16))).toBe(false);
  });

  it('treats a key that is merely zero-heavy as real — only ALL zeros is the dev key', () => {
    expect(isNullKey('0'.repeat(63) + '1')).toBe(false);
  });
});

describe('validateCredentialKey — Format ist Teil der Sicherheit', () => {
  it('accepts 64 hex characters', () => {
    expect(validateCredentialKey('a3f1'.repeat(16))).toBeNull();
    expect(validateCredentialKey('A3F1'.repeat(16))).toBeNull(); // Groß-/Kleinschreibung egal
  });

  it('rejects missing and empty — the docker-compose ":-" case is EMPTY, not unset', () => {
    expect(validateCredentialKey(undefined)).toMatch(/not set/i);
    expect(validateCredentialKey('')).toMatch(/not set/i);
    expect(validateCredentialKey('   ')).toMatch(/not set/i);
  });

  it('rejects wrong length — a short key silently weakens AES-256', () => {
    expect(validateCredentialKey('a3f1'.repeat(8))).toMatch(/64 hex/i);
    expect(validateCredentialKey('a3f1'.repeat(20))).toMatch(/64 hex/i);
  });

  it('rejects non-hex — Buffer.from would silently truncate it', () => {
    // Buffer.from('zz…', 'hex') liefert einen KÜRZEREN Buffer statt zu werfen —
    // ein unbemerkt schwächerer Schlüssel. Deshalb hier prüfen.
    expect(validateCredentialKey('z'.repeat(64))).toMatch(/64 hex/i);
  });

  it('rejects the null key explicitly, with its own message', () => {
    expect(validateCredentialKey(NULL_KEY)).toMatch(/insecure dev key/i);
  });
});

describe('resolveCredentialKey — in Produktion gibt es keinen Ersatz', () => {
  it('THROWS in production when the key is missing', () => {
    expect(() => resolveCredentialKey(undefined, 'production')).toThrow(/CREDENTIAL_ENCRYPTION_KEY/);
  });

  it('THROWS in production on the empty string — the docker-compose ":-" case', () => {
    expect(() => resolveCredentialKey('', 'production')).toThrow(/CREDENTIAL_ENCRYPTION_KEY/);
  });

  it('THROWS in production on the null key, even if someone set it explicitly', () => {
    expect(() => resolveCredentialKey(NULL_KEY, 'production')).toThrow(/insecure dev key/i);
  });

  it('THROWS in production on a malformed key', () => {
    expect(() => resolveCredentialKey('abc', 'production')).toThrow(/64 hex/i);
  });

  it('names the remedy in the error — the message must be actionable', () => {
    expect(() => resolveCredentialKey(undefined, 'production')).toThrow(/openssl rand -hex 32/);
  });

  it('accepts a valid key in production', () => {
    const key = 'a3f1'.repeat(16);
    expect(resolveCredentialKey(key, 'production')).toBe(key.toLowerCase());
  });

  it('falls back OUTSIDE production so local development keeps working', () => {
    expect(resolveCredentialKey(undefined, 'development')).toBe(NULL_KEY);
    expect(resolveCredentialKey('', 'test')).toBe(NULL_KEY);
  });

  it('still prefers a real key outside production — the fallback is a last resort', () => {
    const key = 'b7c2'.repeat(16);
    expect(resolveCredentialKey(key, 'development')).toBe(key);
  });

  it('does NOT fall back outside production when the key is merely malformed', () => {
    // Ein gesetzter, aber kaputter Schluessel ist ein Konfigurationsfehler —
    // still auf den Null-Key zu fallen wuerde ihn verstecken, und beim Deploy
    // nach Produktion waere die Ueberraschung komplett.
    expect(() => resolveCredentialKey('abc', 'development')).toThrow(/64 hex/i);
  });
});

describe('Round-trip: der Fix darf bestehende Blobs nicht brechen', () => {
  it('encrypt → decrypt returns the original credentials', async () => {
    const { encryptCredentials, decryptCredentials } = await import('../models/Connection');
    const secret = { apiKey: 'ta_live_123', user: 'ops-bot' };
    expect(decryptCredentials(encryptCredentials(secret))).toEqual(secret);
  });

  it('an unreadable blob yields {} — a wrong key must not crash the route', async () => {
    const { decryptCredentials } = await import('../models/Connection');
    expect(decryptCredentials('kaputt')).toEqual({});
    expect(decryptCredentials('')).toEqual({});
  });
});


describe('Re-Verschlüsselung (THE-534) — das Werkzeug für den Ernstfall', () => {
  const { decryptWith, encryptWith, planReencryption } = require('../scripts/reencrypt-credentials');
  const OLD = NULL_KEY;
  const NEW = 'c4d2'.repeat(16);

  it('re-encrypts under a new key and keeps the content', () => {
    const secret = { token: 'ghp_secret', user: 'bot' };
    const oldBlob = encryptWith(secret, OLD);
    const plain = decryptWith(oldBlob, OLD);
    expect(plain).toEqual(secret);
    const newBlob = encryptWith(plain!, NEW);
    expect(decryptWith(newBlob, NEW)).toEqual(secret);
  });

  it('the new blob is NOT readable with the old key — that is the whole point', () => {
    const newBlob = encryptWith({ a: 'b' }, NEW);
    expect(decryptWith(newBlob, OLD)).toBeNull();
  });

  it('planReencryption counts instead of guessing — a wrong --from shows up as unreadable', () => {
    const docs = [
      { _id: 1, credentials: encryptWith({ a: '1' }, OLD) },
      { _id: 2, credentials: encryptWith({ a: '2' }, NEW) }, // schon umgeschluesselt
      { _id: 3, credentials: '' },
      { _id: 4 },
    ];
    const plan = planReencryption(docs, OLD);
    expect(plan).toEqual({ total: 4, readable: 1, unreadable: 1, empty: 2 });
  });

  it('never returns a value for a malformed blob — no crash on garbage', () => {
    expect(decryptWith('kaputt', OLD)).toBeNull();
    expect(decryptWith('', OLD)).toBeNull();
  });
});
