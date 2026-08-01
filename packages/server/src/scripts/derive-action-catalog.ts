/**
 * derive-action-catalog — leitet aus den freien Handlungs-Formulierungen ein
 * kanonisches Vokabular ab (THE-438 Slice 1, Task 5, REQ-REQHARM-001.0).
 *
 *   npm run actions:derive -- --in <slots.json> [--out <proposal.json>]
 *                             [--provider anthropic|openrouter] [--model <id>]
 *
 * ── DIESES SKRIPT SCHREIBT NIEMALS IN DIE ONTOLOGIE ──
 *
 * Es erzeugt einen VORSCHLAG. Der Katalog ist Referenzdaten mit semver und
 * CHANGELOG-Pflicht (ADR-0004 E6); ihn automatisch fortzuschreiben würde die
 * menschliche Abnahme aushebeln, die genau dort sitzt, wo die Granularität
 * entschieden wird. Zu grobe Einträge erzeugen Compliance-FEHLER — zwei
 * Meldepflichten mit verschiedenen Adressaten und Fristen als „dieselbe
 * Pflicht" auszuweisen wäre einer.
 *
 * Wiederholbarkeit (AC von REQ-001.0) heißt deshalb: das VERFAHREN ist
 * wiederholbar, nicht der Schreibvorgang.
 *
 * Linear: THE-438 · Prämisse: THE-538
 */
import fs from 'node:fs';
import path from 'node:path';
import { DERIVE_SYSTEM, buildDeriveUserPrompt, NORM_ONTOLOGY } from '@thearchitect/shared';
import { createRaterClient, resolveRaterConfig, withEmptyResponseRetry, annotatorTag } from '../evals/raterClient';
import { arg, type SlotRecord } from './obligation-slots';

/**
 * Ein Katalog aus ~26 Einträgen mit englischem Label und deutschem Satz
 * braucht real ~5000 Tokens; 4000 schnitten die Antwort mitten im letzten
 * Objekt ab. Grosszügig gesetzt, weil ein zu kleines Budget als
 * „Antwort nicht lesbar" auftritt und damit die Fehlersuche in die falsche
 * Richtung schickt.
 */
const DERIVE_MAX_TOKENS = 8000;

export interface CatalogueProposal {
  vokabular: Array<{ id: string; label: string; description: string }>;
  anmerkung: string;
}

/** Nur die Formulierungen, dedupliziert — Eingabe der Ableitung. */
export function uniqueActionPhrases(records: SlotRecord[]): string[] {
  return [...new Set(records.map((r) => r.slots.handlung))];
}

export function parseProposal(raw: string): CatalogueProposal | null {
  const m = raw.replace(/^```json\s*|\s*```$/g, '').match(/\{[\s\S]*\}/);
  if (!m) return null;
  try {
    const o = JSON.parse(m[0]) as Partial<CatalogueProposal>;
    if (!Array.isArray(o.vokabular) || o.vokabular.length === 0) return null;
    return { vokabular: o.vokabular, anmerkung: String(o.anmerkung ?? '') };
  } catch {
    return null;
  }
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const inPath = arg(argv, '--in');
  if (!inPath) {
    console.error(
      'Usage: actions:derive -- --in <slots.json> [--out <proposal.json>] ' +
        '[--provider anthropic|openrouter] [--model <id>]',
    );
    process.exitCode = 2;
    return;
  }
  const outPath = path.resolve(arg(argv, '--out') || 'action-catalog.proposal.json');
  const cfg = resolveRaterConfig(argv);

  const records = JSON.parse(fs.readFileSync(path.resolve(inPath), 'utf8')) as SlotRecord[];
  const phrases = uniqueActionPhrases(records);
  console.log(`[derive] ${phrases.length} verschiedene Formulierungen aus ${records.length} Pflichten`);

  const client = withEmptyResponseRetry(createRaterClient(cfg));
  const { text, outputTokens } = await client.complete({
    system: DERIVE_SYSTEM,
    user: buildDeriveUserPrompt(phrases),
    maxTokens: DERIVE_MAX_TOKENS,
  });

  const proposal = parseProposal(text);
  if (!proposal) {
    // Eine ABGESCHNITTENE Antwort darf nicht wie eine SCHLECHTE aussehen. Bei
    // 216 Formulierungen reichten 4000 Tokens nicht, das JSON brach mitten im
    // Objekt ab — als „nicht lesbar" gemeldet hätte das zur Suche am Prompt
    // geführt statt am Budget. Dieselbe Falle wie die stumme Kürzung bei
    // Reasoning-Modellen (siehe raterClient).
    const truncated = outputTokens >= DERIVE_MAX_TOKENS;
    console.error(
      truncated
        ? `[derive] Antwort am Token-Budget abgeschnitten (${outputTokens}/${DERIVE_MAX_TOKENS}) — ` +
            `NICHT die Formulierung ist schuld. Budget erhöhen oder Phrasen-Zahl senken.`
        : '[derive] Antwort nicht lesbar — kein Vorschlag geschrieben.',
    );
    process.exitCode = 1;
    return;
  }

  fs.writeFileSync(outPath, JSON.stringify(proposal, null, 2) + '\n');

  // Bewusst `Set<string>`: die Vorschlags-ids sind FREIE Strings aus dem Modell.
  // Ohne die Weitung würde der abgeleitete id-Union den Vergleich verbieten —
  // und genau dieser Vergleich soll ja zeigen, was NICHT im Katalog steht.
  const existing = new Set<string>(NORM_ONTOLOGY.canonicalActions.map((a) => a.id));
  const added = proposal.vokabular.filter((v) => !existing.has(v.id)).map((v) => v.id);
  const dropped = [...existing].filter((id) => !proposal.vokabular.some((v) => v.id === id));

  console.log(
    `[derive] ${proposal.vokabular.length} kanonische Handlungen vorgeschlagen (${cfg.provider}/${cfg.model})\n` +
      `[derive] annotator: ${annotatorTag(cfg)}\n` +
      `[derive] Diff gegen Ontologie ${NORM_ONTOLOGY.ontologyVersion} — NOMINAL, NICHT SEMANTISCH:\n` +
      `[derive]   ${added.length} id(s) nicht im Katalog${added.length ? `: ${added.join(', ')}` : ''}\n` +
      `[derive]   ${dropped.length} Katalog-id(s) nicht getroffen${dropped.length ? `: ${dropped.join(', ')}` : ''}\n` +
      `[derive]   ACHTUNG: die Ableitung ist VERFAHRENS-reproduzierbar, aber NICHT id-stabil.\n` +
      `[derive]   Schon eine andere Sprachfassung im Prompt liefert andere ids für dieselbe\n` +
      `[derive]   Maßnahme (z. B. document-legal-basis ↔ rechtsgrundlage-dokumentieren). Ein\n` +
      `[derive]   hoher Diff heißt daher NICHT, dass der Katalog falsch ist — er ist ohne\n` +
      `[derive]   menschlichen Abgleich schlicht nicht interpretierbar.\n` +
      `[derive] Anmerkung des Modells: ${proposal.anmerkung}\n` +
      `[derive] → ${outPath}\n` +
      `[derive] NEXT (MENSCHLICH, nicht automatisch): Granularität prüfen, ids/Labels abnehmen,\n` +
      `[derive]   dann canonicalActions in packages/shared/src/ontology/norm-ontology.v1.ts pflegen,\n` +
      `[derive]   ontologyVersion bumpen, CHANGELOG-Eintrag schreiben, Versions-Pin im Test nachziehen.\n` +
      `[derive]   Danach: npm run actions:eval (Positiv-/Negativ-Kontrolle muss halten).`,
  );
}

if (require.main === module) {
  void main();
}
