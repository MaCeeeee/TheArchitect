/**
 * TOR: EIN SCHLÜSSEL HAT EINEN BAUER (THE-653, Familie 1).
 *
 * ── DIE FEHLERKLASSE ──
 *
 * Dreimal in einer Woche dasselbe Rezept, dreimal still:
 *
 *   THE-600  Verdrängungs-Gate rechnet mit `nis2`, der Korpus liefert `nis2-de`
 *   THE-643  Backlink-Join baut `upload:${standardId}` von Hand
 *   THE-645  Norm-Facade baut `${source}:${para}` ohne normaliseParagraph
 *
 * Und am 10.08. fand die Vermessung dieses Tors den vierten Fall LIVE:
 * `requirements.routes.ts` normalisierte den Chain-Fallback mit `\s+` statt
 * `[^a-z0-9]+` — aus „Art. 32" wurde `dsgvo:art.-32` statt `dsgvo:art-32`,
 * vier von vier Testfaellen wichen ab.
 *
 * Still heisst: kein Crash, keine Exception, gruene Tests. Der Vorschlag
 * entsteht, das Element auch — nur der Join findet nichts, und eine Zahl
 * bewegt sich nicht. `regulation-key.ts` nennt die Invariante selbst
 * verbindlich: „MUST stay byte-identical on both sides" (ADR-0001).
 *
 * ── WAS DIESES TOR VERBIETET ──
 *
 *   S1  die Normalisierung reimplementieren:  [^a-z0-9]+/g, '-'
 *       ausserhalb von regulation-key.ts — wer so normalisiert, baut
 *       normaliseParagraph nach und driftet bei der naechsten Aenderung.
 *   S2  Work-Ids per Template bauen:  `corpus:${…}`  |  `upload:${…}`
 *       — dafuer gibt es deriveNormWorkId / toNormWorkId.
 *
 * ── WAS ES ABSICHTLICH NICHT TRIFFT (Watch-Point: diese Liste darf nicht
 *    stillschweigend wachsen) ──
 *
 *   scripts/ + evals/   Golden-Builder und Eval-Slugs sind EINGEFRORENE
 *                       Fixture-Schluesselraeume — eine Umstellung braeche
 *                       Golden-Dateien. (seed-local-corpus ist trotzdem auf
 *                       buildRegulationKey umgestellt — Guertel und
 *                       Hosentraeger, nur eben nicht tor-bewacht.)
 *   Kommentarzeilen     duerfen den alten Bug dokumentieren.
 *   andere Slugs        oracle.service (Stakeholder, '_'), wfcomp (Tokenizer-
 *                       split), PropertyPanel (externe URL) — andere
 *                       Schluesselraeume, von den scharfen Signaturen nicht
 *                       getroffen. Ein Tor, dessen Rot man routinemaessig
 *                       wegdrueckt, ist keins.
 *
 * Rein mechanisch: liest Quelltext, keine DB, kein Netz.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve, relative } from 'node:path';

const REPO = resolve(__dirname, '../../../..');

/** Produktcode-Wurzeln — die Pfade, die Produktdaten lesen oder schreiben. */
const SCAN_ROOTS = [
  'packages/server/src/services',
  'packages/server/src/routes',
  'packages/server/src/models',
  'packages/shared/src',
  'packages/client/src',
];

const EXCLUDE = /__tests__|\.test\.|\/scripts\/|\/evals\//;
const CANONICAL_HOME = /shared\/src\/utils\/regulation-key\.ts$/;

const S1_REIMPLEMENTED_NORMALISATION = /\[\^a-z0-9\]\+\/g,\s*['"`]-['"`]/;
const S2_HANDBUILT_WORK_ID = /`(corpus|upload):\$\{/;

/** Zeilen, die nur dokumentieren, zaehlen nicht. */
function isComment(line: string): boolean {
  const t = line.trim();
  return t.startsWith('//') || t.startsWith('*') || t.startsWith('/*');
}

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(p)) out.push(p);
  }
  return out;
}

/** Kern des Tors — pur, damit die Umkehrprobe ihn direkt fuettern kann. */
export function findViolations(
  files: Array<{ path: string; content: string }>,
): string[] {
  const hits: string[] = [];
  for (const f of files) {
    if (EXCLUDE.test(f.path) || CANONICAL_HOME.test(f.path)) continue;
    f.content.split('\n').forEach((line, i) => {
      if (isComment(line)) return;
      if (S1_REIMPLEMENTED_NORMALISATION.test(line)) {
        hits.push(`${f.path}:${i + 1}  reimplementiert normaliseParagraph — buildRegulationKey benutzen`);
      }
      if (S2_HANDBUILT_WORK_ID.test(line)) {
        hits.push(`${f.path}:${i + 1}  baut den Work-Id per Template — deriveNormWorkId/toNormWorkId benutzen`);
      }
    });
  }
  return hits;
}

describe('Tor: ein Schlüssel hat einen Bauer (THE-653)', () => {
  it('UMKEHRPROBE: das Tor erkennt beide Verstösse in synthetischem Code', () => {
    // Ohne diese Probe pruefte das Tor nur, dass Code existiert — nicht, dass
    // es ablehnen kann (dieselbe Logik wie die Kanarienvoegel, THE-382).
    const bad = findViolations([
      {
        path: 'packages/server/src/services/synthetic.ts',
        content: [
          `const key = para.toLowerCase().replace(/[^a-z0-9]+/g, '-');`,
          'const workId = `corpus:${source}`;',
          `// Kommentar: \`upload:\${id}\` — dokumentiert nur, zaehlt nicht`,
        ].join('\n'),
      },
    ]);
    expect(bad).toHaveLength(2);
    expect(bad[0]).toContain('synthetic.ts:1');
    expect(bad[1]).toContain('synthetic.ts:2');
  });

  it('UMKEHRPROBE: regulation-key.ts selbst und Skripte sind ausgenommen', () => {
    const ok = findViolations([
      {
        path: 'packages/shared/src/utils/regulation-key.ts',
        content: `return p.toLowerCase().replace(/[^a-z0-9]+/g, '-');`,
      },
      {
        path: 'packages/server/src/scripts/some-golden-builder.ts',
        content: `const slug = s.replace(/[^a-z0-9]+/g, '-');`,
      },
    ]);
    expect(ok).toHaveLength(0);
  });

  it('der Produktcode ist frei von handgebauten Schlüsseln', () => {
    const files = SCAN_ROOTS.flatMap((root) => walk(join(REPO, root))).map((p) => ({
      path: relative(REPO, p),
      content: readFileSync(p, 'utf8'),
    }));
    // Eigene Regel dieses Tages: eine leere Messung ist kein Bestehen.
    expect(files.length).toBeGreaterThan(100);

    const hits = findViolations(files);
    if (hits.length > 0) {
      // Jest-expect traegt keine eigene Meldung — und OHNE die Wegweisung
      // waere das Rot nur ein Raetsel. Die Meldung nennt Fundort und Ausweg.
      throw new Error(
        `Handgebaute Norm-/Sektions-Schlüssel gefunden:\n  ${hits.join('\n  ')}\n` +
          'Die kanonischen Bauer sind buildRegulationKey / deriveNormWorkId / toNormWorkId\n' +
          '(shared). Drei stille Bugs in einer Woche entstanden genau so — THE-600,\n' +
          'THE-643, THE-645.',
      );
    }
    expect(hits).toHaveLength(0);
  });
});
