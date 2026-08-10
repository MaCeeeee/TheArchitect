/**
 * TOR: EINE LEERE MESSUNG IST KEIN BESTEHEN (THE-653, Familie 2).
 *
 * ── DIE FEHLERKLASSE ──
 *
 * Ein Signal meldet Erfolg, wo keiner ist — die haeufigste Bug-Familie des
 * Augusts, viermal in Produktion und einmal beinahe im eigenen Werkzeug:
 *
 *   corpus/health   elf Tage gruen, weil es die falsche Datenbank mass (ADR-0009)
 *   THE-638         „No gaps detected" ueber 14 offenen MUST-Pflichten
 *   THE-642         Cast-Fehler als HTTP 200 im SSE-Rumpf
 *   THE-627         neue Gesetze anwendbarkeits-blind, niemand meldete es
 *   10.08.          der Bestandslauf las 0 Projekte (falsche Antwortform) und
 *                   haette „0 rohe Anker — bestanden" gemeldet. Eine
 *                   Falschaussage, die exakt wie ein Bestehen aussieht.
 *
 * ── DIE REGEL ──
 *
 * Wer behauptet „keine Verstoesse", muss zuerst belegen, DASS er etwas
 * angesehen hat. Mechanisch: Jede E2E-Spec, die eine Null-Zusicherung traegt
 * (`toBe(0)`, `toHaveLength(0)`, `toEqual([])`), muss im selben Lauf einen
 * positiven Nenner zusichern (`toBeGreaterThan(`). Datei-Ebene, bewusst grob —
 * die Praezision kommt aus der kleinen Zahl der Spezifikationen, nicht aus
 * einem Parser.
 *
 * Das Tor unterliegt seiner eigenen Regel: findet es keine Spec-Dateien,
 * bricht es — im Docker-Build liegt `e2e/` dafuer im Builder (Dockerfile).
 *
 * Rein mechanisch: liest Quelltext, keine DB, kein Netz.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const E2E_DIR = resolve(__dirname, '../../../..', 'e2e');

const ZERO_ASSERTIONS = [/\.toBe\(0\)/, /\.toHaveLength\(0\)/, /\.toEqual\(\[\]\)/];
const DENOMINATOR = /\.toBeGreaterThan\(/;

/** Kern des Tors — pur, damit die Umkehrprobe ihn direkt fuettern kann. */
export function specsWithoutDenominator(
  specs: Array<{ name: string; content: string }>,
): string[] {
  return specs
    .filter((s) => ZERO_ASSERTIONS.some((z) => z.test(s.content)))
    .filter((s) => !DENOMINATOR.test(s.content))
    .map((s) => s.name);
}

describe('Tor: eine leere Messung ist kein Bestehen (THE-653)', () => {
  it('UMKEHRPROBE: eine Spec mit Null-Zusicherung ohne Nenner wird erkannt', () => {
    const bad = specsWithoutDenominator([
      {
        name: 'naiv.spec.ts',
        // Genau der Beinahe-Fehler vom 10.08.: raw === 0 behauptet Sauberkeit,
        // ohne zu belegen, dass ueberhaupt etwas gelesen wurde.
        content: `expect(raw).toBe(0);`,
      },
      {
        name: 'ehrlich.spec.ts',
        content: `expect(total).toBeGreaterThan(0);\nexpect(raw).toBe(0);`,
      },
      {
        name: 'ohne-null.spec.ts',
        content: `expect(status).toBe(200);`,
      },
    ]);
    expect(bad).toEqual(['naiv.spec.ts']);
  });

  it('jede E2E-Spec mit Null-Zusicherung trägt einen positiven Nenner', () => {
    const names = readdirSync(E2E_DIR).filter((n) => n.endsWith('.spec.ts'));
    // Die eigene Regel zuerst: Ein leerer Scan waere ein stilles Bestehen.
    // Bricht es hier, fehlt e2e/ im Kontext (Docker: COPY e2e/ im Builder).
    expect(names.length).toBeGreaterThan(0);

    const specs = names.map((name) => ({
      name,
      content: readFileSync(join(E2E_DIR, name), 'utf8'),
    }));
    const offenders = specsWithoutDenominator(specs);
    if (offenders.length > 0) {
      throw new Error(
        `Diese Specs behaupten „nichts gefunden", ohne zu belegen, dass sie etwas\n` +
          `angesehen haben:\n  ${offenders.join('\n  ')}\n` +
          'Vor jede Null-Zusicherung gehoert ein Nenner: expect(<gelesen>).toBeGreaterThan(0).\n' +
          'Praezedenz: der Bestandslauf vom 10.08. las 0 Projekte und haette\n' +
          '„0 rohe Anker — bestanden" gemeldet.',
      );
    }
    expect(offenders).toHaveLength(0);
  });
});
