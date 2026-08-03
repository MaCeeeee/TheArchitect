/**
 * THE-576 (REQ-576.1): Der Fingerabdruck entsteht LOKAL.
 *
 * ── WARUM ÜBERHAUPT LOKAL ──
 *
 * `sha256` ist am Evidenz-Objekt Pflicht und kommt laut Modell „vom Erfasser".
 * Einen 64-stelligen Hash abzutippen wäre Entwicklerwissen — die Fläche käme
 * nie über „nur mit Umweg erreichbar" hinaus.
 *
 * Hochladen ist ebenso keine Option: Das Modell hält fest, dass es BEWUSST
 * keinen Artefakt-Upload gibt — Aufbewahrungs- und Löschpflichten bleiben beim
 * Quellsystem, solange THE-536 offen ist.
 *
 * Beides zusammen ergibt genau einen Weg: die Datei im Browser lesen, den
 * Hash dort bilden, und ausschließlich den Fingerabdruck senden.
 */
import { describe, test, expect } from 'vitest';
import { sha256Hex, isSha256Hex } from './evidenceHash';

describe('sha256Hex — der Fingerabdruck, den das Evidenz-Objekt verlangt', () => {
  test('produces the known SHA-256 of an empty input', async () => {
    // Referenzwert aus FIPS 180-4 — eine Implementierung, die ihn verfehlt,
    // ist falsch, egal wie plausibel ihre Ausgabe aussieht.
    expect(await sha256Hex(new Uint8Array(0))).toBe(
      'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    );
  });

  test('produces the known SHA-256 of "abc"', async () => {
    expect(await sha256Hex(new TextEncoder().encode('abc'))).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
  });

  test('is 64 lowercase hex — exactly what the server validator accepts', async () => {
    const h = await sha256Hex(new TextEncoder().encode('irgendein Nachweis'));
    expect(h).toMatch(/^[0-9a-f]{64}$/);
  });

  test('different content gives a different fingerprint — otherwise it proves nothing', async () => {
    const a = await sha256Hex(new TextEncoder().encode('Meldung vom 1.'));
    const b = await sha256Hex(new TextEncoder().encode('Meldung vom 2.'));
    expect(a).not.toBe(b);
  });
});

describe('isSha256Hex — die Vorprüfung, die dem Nutzer den Fehlversuch erspart', () => {
  test('accepts exactly 64 hex characters', () => {
    expect(isSha256Hex('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855')).toBe(true);
  });

  test('rejects the plausible near-misses', () => {
    expect(isSha256Hex('')).toBe(false);
    expect(isSha256Hex('0'.repeat(63))).toBe(false);
    expect(isSha256Hex('0'.repeat(65))).toBe(false);
    expect(isSha256Hex('g'.repeat(64))).toBe(false);
  });

  test('NEGATIV-KONTROLLE: a string of zeros is well-formed but must never be produced', () => {
    // Formal gültig — und trotzdem eine Lüge, wenn niemand eine Datei gewählt
    // hat. Die Fläche erfindet keinen Hash; deshalb prüft die Form allein
    // nicht, ob ein Nachweis etwas belegt.
    expect(isSha256Hex('0'.repeat(64))).toBe(true);
  });
});
