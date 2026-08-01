/**
 * classify-obligations — ordnet die Pflichten eines Projekts den kanonischen
 * Handlungen des eingefrorenen Katalogs zu (THE-438 Slice 1, Task 5,
 * REQ-REQHARM-001.2).
 *
 *   npm run actions:classify -- --project <projectId> [--out assignments.json]
 *                               [--limit N] [--provider …] [--model …]
 *
 * READ-ONLY: schreibt ausschließlich eine JSON-Datei, nie in die Datenbank.
 *
 * ── WIE DIE AUSGABE ZU LESEN IST ──
 *
 *   unparseable > 0   Lauf-Fehler (Budget, Modell, Prompt). Nachfahren, nicht
 *                     wegdiskutieren — sonst fehlen die Pflichten still.
 *   none-Quote        Aussage über den KATALOG, nicht über den Lauf. Eine
 *                     auffällig NIEDRIGE Quote auf einem Korpus, aus dem der
 *                     Katalog NICHT abgeleitet wurde, ist ein WARNZEICHEN für
 *                     erzwungene Treffer — kein Erfolg. In der Referenzmessung
 *                     lag sie in-sample bei 0,5 %, und genau das war der Anlass
 *                     zu kontrollieren.
 *
 * Die gesetzesübergreifenden Gruppen am Ende sind der eigentliche Ertrag: eine
 * kanonische Handlung, die Pflichten aus mehr als einem Rechtsakt trägt, ist
 * ein Harmonisierungs-KANDIDAT — noch keine Aussage. Ob eine Maßnahme wirklich
 * beide erfüllt, entscheidet der Paar-Richter mit Konfidenzstufe (Task 6/7).
 *
 * Linear: THE-438 · Prämisse: THE-538
 */
import fs from 'node:fs';
import path from 'node:path';
import { NORM_ONTOLOGY, type ObligationRef } from '@thearchitect/shared';
import { classifyObligations } from '../services/obligationAction.service';
import { createRaterClient, resolveRaterConfig, withEmptyResponseRetry, annotatorTag } from '../evals/raterClient';
import { arg, loadObligations } from './obligation-slots';

interface AssignmentRecord extends ObligationRef {
  actionId: string | null;
  unparseable: boolean;
  ontologyVersion: string;
}

/** Kanonische Handlungen, die Pflichten aus mehr als einem Rechtsakt tragen. */
export function crossLawGroups(records: AssignmentRecord[]): Array<{ actionId: string; laws: string[]; count: number }> {
  const byAction = new Map<string, AssignmentRecord[]>();
  for (const r of records) {
    if (!r.actionId) continue;
    const list = byAction.get(r.actionId) ?? [];
    list.push(r);
    byAction.set(r.actionId, list);
  }
  return [...byAction.entries()]
    .map(([actionId, rs]) => ({ actionId, laws: [...new Set(rs.map((r) => r.law))], count: rs.length }))
    .filter((g) => g.laws.length > 1)
    .sort((a, b) => b.laws.length - a.laws.length || b.count - a.count);
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const projectId = arg(argv, '--project');
  if (!projectId) {
    console.error(
      'Usage: actions:classify -- --project <projectId> [--out <assignments.json>] [--limit N] ' +
        '[--provider anthropic|openrouter] [--model <id>]',
    );
    process.exitCode = 2;
    return;
  }
  const outPath = path.resolve(arg(argv, '--out') || `assignments.${projectId}.json`);
  const limitRaw = arg(argv, '--limit');
  const limit = limitRaw ? Number(limitRaw) : undefined;
  const cfg = resolveRaterConfig(argv);

  const dotenv = await import('dotenv');
  dotenv.config();
  const { connectMongoDB } = await import('../config/database');
  await connectMongoDB();

  try {
    const obligations = await loadObligations(projectId, limit);
    if (obligations.length === 0) {
      console.error(`[classify] keine Requirements für Projekt ${projectId} gefunden.`);
      process.exitCode = 1;
      return;
    }

    const client = withEmptyResponseRetry(createRaterClient(cfg));
    let done = 0;
    const { assignments, stats } = await classifyObligations(obligations, async (system, user) => {
      const { text } = await client.complete({ system, user, maxTokens: 200 });
      process.stdout.write(`\r[classify] ${++done}/${obligations.length}`);
      return text;
    });

    const records: AssignmentRecord[] = obligations.map((o, i) => ({ ...o, ...assignments[i] }));
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, JSON.stringify(records, null, 2) + '\n');

    const pct = (n: number): string => (stats.total ? `${((100 * n) / stats.total).toFixed(1)} %` : '—');
    const groups = crossLawGroups(records);

    console.log(
      `\n[classify] total=${stats.total} assigned=${stats.assigned} (${pct(stats.assigned)}) ` +
        `none=${stats.none} (${pct(stats.none)}) unparseable=${stats.unparseable}\n` +
        `[classify] Katalog: ontologyVersion ${NORM_ONTOLOGY.ontologyVersion} ` +
        `(${NORM_ONTOLOGY.canonicalActions.length} Handlungen, ${new Set(records.map((r) => r.actionId).filter(Boolean)).size} belegt)\n` +
        `[classify] annotator: ${annotatorTag(cfg)}\n` +
        `[classify] gesetzesübergreifende Handlungen: ${groups.length}\n` +
        groups.map((g) => `[classify]   ${g.laws.length} Rechtsakte · ${g.count} Pflichten · ${g.actionId}`).join('\n') +
        `\n[classify] → ${outPath}\n` +
        `[classify] Das sind KANDIDATEN, keine Aussage — Konfidenzstufe kommt aus npm run actions:eval.`,
    );

    if (stats.unparseable > 0) {
      console.error(
        `\n[classify] ${stats.unparseable} unlesbare Antwort(en) — Lauf-Fehler, nicht ignorieren.\n` +
          records
            .filter((r) => r.unparseable)
            .map((r) => `  - ${r.law} ${r.para}: ${r.title}`)
            .join('\n'),
      );
      process.exitCode = 1;
    }
  } finally {
    const mongoose = await import('mongoose');
    await mongoose.default.connection.close();
  }
}

if (require.main === module) {
  void main();
}
