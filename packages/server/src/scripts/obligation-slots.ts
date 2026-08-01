/**
 * obligation-slots — zerlegt die Pflichten eines Projekts in
 * ⟨Handlung · Adressat · Modalität · Bedingung⟩ (THE-438 Slice 1, Task 5).
 *
 *   npm run actions:slots -- --project <projectId> [--out slots.json] [--limit N]
 *                            [--provider anthropic|openrouter] [--model <id>]
 *
 * READ-ONLY: liest `ComplianceRequirement` + `Regulation`, schreibt ausschließlich
 * eine JSON-Datei. Kein Schreibzugriff auf die Datenbank.
 *
 * WARUM DIE ZERLEGUNG OHNE KATALOG LÄUFT: Erst frei extrahieren, dann Vokabular
 * ableiten (`actions:derive`). Gibt man dem Modell die Katalog-Liste schon hier,
 * misst die spätere Ableitung die Liste statt den Korpus. Der Prompt trägt
 * deshalb ausdrücklich „Es gibt KEINE Vorgabeliste" (shared/obligations/prompt).
 *
 * `loadObligations` wird auch von `classify-obligations.ts` importiert — Muster
 * wie runTypingEval ← prelabel-typing.
 *
 * Linear: THE-438 · Prämisse: THE-538
 */
import fs from 'node:fs';
import path from 'node:path';
import {
  SLOT_SYSTEM,
  buildSlotUserPrompt,
  parseSlots,
  type ObligationRef,
  type ObligationSlots,
} from '@thearchitect/shared';
import {
  createRaterClient,
  resolveRaterConfig,
  withEmptyResponseRetry,
  annotatorTag,
  type RaterClient,
} from '../evals/raterClient';

export interface SlotRecord extends ObligationRef {
  slots: ObligationSlots;
}

export const arg = (argv: string[], flag: string): string | undefined => {
  const i = argv.indexOf(flag);
  return i !== -1 ? argv[i + 1] : undefined;
};

/**
 * Lädt die Pflichten eines Projekts als `ObligationRef`.
 *
 * `law` kommt aus dem Regulation-Titel und dient NUR der Auswertung — die
 * Prompt-Bauer rendern das Feld nie (Blendung, siehe shared/obligations/prompt).
 */
export async function loadObligations(projectId: string, limit?: number): Promise<ObligationRef[]> {
  const { ComplianceRequirement } = await import('../models/ComplianceRequirement');
  const { Regulation } = await import('../models/Regulation');

  const q = ComplianceRequirement.find({ projectId }).sort({ _id: 1 }).lean();
  const docs = await (limit ? q.limit(limit) : q);

  const regIds = [...new Set(docs.map((d) => String(d.regulationId)).filter(Boolean))];
  const regs = await Regulation.find({ _id: { $in: regIds } }).select('title').lean();
  const titleById = new Map(regs.map((r) => [String(r._id), r.title]));

  return docs.map((d) => ({
    law: titleById.get(String(d.regulationId)) || 'unknown',
    para: d.sourceParagraph || d.sectionEId || '',
    title: d.title,
    text: d.description,
  }));
}

/** Kern, `ask` injiziert — ohne Live-LLM testbar. */
export async function decomposeAll(
  obligations: ObligationRef[],
  client: RaterClient,
  onProgress?: (done: number, total: number) => void,
): Promise<{ records: SlotRecord[]; failed: ObligationRef[] }> {
  const records: SlotRecord[] = [];
  const failed: ObligationRef[] = [];

  for (const [i, o] of obligations.entries()) {
    const { text } = await client.complete({
      system: SLOT_SYSTEM,
      user: buildSlotUserPrompt(o),
      maxTokens: 400,
    });
    const slots = parseSlots(text);
    if (slots) records.push({ ...o, slots });
    else failed.push(o);
    onProgress?.(i + 1, obligations.length);
  }
  return { records, failed };
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const projectId = arg(argv, '--project');
  if (!projectId) {
    console.error(
      'Usage: actions:slots -- --project <projectId> [--out <slots.json>] [--limit N] ' +
        '[--provider anthropic|openrouter] [--model <id>]',
    );
    process.exitCode = 2;
    return;
  }
  const outPath = path.resolve(arg(argv, '--out') || `slots.${projectId}.json`);
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
      console.error(`[slots] keine Requirements für Projekt ${projectId} gefunden.`);
      process.exitCode = 1;
      return;
    }
    const client = withEmptyResponseRetry(createRaterClient(cfg));
    const { records, failed } = await decomposeAll(obligations, client, (d, t) =>
      process.stdout.write(`\r[slots] ${d}/${t}`),
    );

    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, JSON.stringify(records, null, 2) + '\n');

    const uniqueActions = new Set(records.map((r) => r.slots.handlung)).size;
    console.log(
      `\n[slots] ${records.length}/${obligations.length} zerlegt (${cfg.provider}/${cfg.model})\n` +
        `[slots] verschiedene Handlungs-Formulierungen: ${uniqueActions}\n` +
        `[slots] annotator: ${annotatorTag(cfg)}\n` +
        `[slots] → ${outPath}\n` +
        `[slots] NEXT: npm run actions:derive -- --in ${path.relative(process.cwd(), outPath)}`,
    );

    // Ausfälle sind KEIN Randdetail: sie verschwinden sonst still aus der
    // Ableitungs-Grundlage und schönen die Abdeckung, ohne dass es jemand sieht.
    if (failed.length > 0) {
      console.error(
        `\n[slots] ${failed.length} Pflicht(en) NICHT zerlegt — nicht ignorieren:\n` +
          failed.map((f) => `  - ${f.law} ${f.para}: ${f.title}`).join('\n'),
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
