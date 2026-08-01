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
  buildRegulationKey,
  SLOT_UNSTATED,
  OBLIGATION_MODALITIES,
  type ObligationRef,
  type ObligationSlots,
} from '@thearchitect/shared';
import { resolveTypedAddressees, partyCoverage, type TypedProvisionDoc } from '../services/typedProvision.service';
import {
  createRaterClient,
  resolveRaterConfig,
  withEmptyResponseRetry,
  annotatorTag,
  type RaterClient,
} from '../evals/raterClient';

export interface SlotRecord extends ObligationRef {
  slots: ObligationSlots;
  /** Korpus-Schlüssel der Provision — Join-Anker, wird nie in einen Prompt gerendert. */
  regulationKey?: string | null;
  /**
   * Der VERPFLICHTETE, aus der typisierten Provision (`partyRole`, THE-540).
   *
   * Er kommt bewusst NICHT aus der Zerlegung: dort lieferte das Modell
   * überwiegend den Empfänger (rund 4/20 Übereinstimmung). Die Typisierung
   * deckt ihn zu 100 % ab, die Zerlegung tat es zu 48 % — und beschrieb dabei
   * etwas anderes. `null` heißt „keine konsumierbare Typisierung", nicht
   * „kein Adressat".
   */
  adressat?: string | null;
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
export interface LoadedObligation extends ObligationRef {
  /** `source:paragraph` der Provision im Korpus — Anker für den Typisierungs-Join. */
  regulationKey: string | null;
}

export async function loadObligations(projectId: string, limit?: number): Promise<LoadedObligation[]> {
  const { ComplianceRequirement } = await import('../models/ComplianceRequirement');
  const { Regulation } = await import('../models/Regulation');

  const q = ComplianceRequirement.find({ projectId }).sort({ _id: 1 }).lean();
  const docs = await (limit ? q.limit(limit) : q);

  const regIds = [...new Set(docs.map((d) => String(d.regulationId)).filter(Boolean))];
  const regs = await Regulation.find({ _id: { $in: regIds } })
    .select('title source paragraphNumber')
    .lean();
  const byId = new Map(regs.map((r) => [String(r._id), r]));

  return docs.map((d) => {
    const reg = byId.get(String(d.regulationId));
    // `sectionEId` trägt den Korpus-Schlüssel, wo er gesetzt ist; sonst aus
    // source + Paragraph gebaut. Schlägt beides fehl, bleibt der Join für diese
    // Pflicht aus — sichtbar als fehlender Wert, nicht als geratener.
    let regulationKey: string | null = d.sectionEId || null;
    if (!regulationKey && reg?.source && reg?.paragraphNumber) {
      try {
        regulationKey = buildRegulationKey(reg.source, reg.paragraphNumber);
      } catch {
        regulationKey = null;
      }
    }
    return {
      law: reg?.title || 'unknown',
      para: d.sourceParagraph || d.sectionEId || '',
      title: d.title,
      text: d.description,
      regulationKey,
    };
  });
}

/** Kern, `ask` injiziert — ohne Live-LLM testbar. */
export async function decomposeAll(
  obligations: LoadedObligation[],
  client: RaterClient,
  onProgress?: (done: number, total: number) => void,
  /** THE-540: Korpus-Adressaten, Schlüssel → Rolle. Leer = Join aus (Korpus-Ausfall). */
  typedAddressees: Map<string, string> = new Map(),
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
    if (slots) {
      records.push({
        ...o,
        slots,
        adressat: o.regulationKey ? typedAddressees.get(o.regulationKey) ?? null : null,
      });
    } else failed.push(o);
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
    // THE-540 Achse 1: Adressat aus der typisierten Provision. Der Korpus liegt
    // auf Server B; ist er nicht erreichbar, bleibt die Map leer und die
    // Zerlegung läuft unverändert auf dem LLM-Wert weiter.
    const keys = obligations.map((o) => o.regulationKey).filter((k): k is string => Boolean(k));
    const typed = await resolveTypedAddressees(keys, async (ks) => {
      const { getRegulationsByKeys } = await import('../services/corpusClient.service');
      return (await getRegulationsByKeys(ks)) as unknown as TypedProvisionDoc[];
    });

    const client = withEmptyResponseRetry(createRaterClient(cfg));
    const { records, failed } = await decomposeAll(
      obligations,
      client,
      (d, t) => process.stdout.write(`\r[slots] ${d}/${t}`),
      typed,
    );

    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, JSON.stringify(records, null, 2) + '\n');

    const uniqueActions = new Set(records.map((r) => r.slots.handlung)).size;
    // Befüllung je Slot und Modalitäts-Verteilung ausweisen: ein Slot, der
    // überwiegend leer bleibt, trägt das versprochene Delta nicht (Adressat
    // lag in der Referenzmessung bei 48 %), und eine kippende
    // Modalitäts-Verteilung ist das einzige Frühwarnsignal dafür, dass
    // Verbote nicht mehr als solche erkannt werden (THE-542).
    const fillRate = (pick: (r: SlotRecord) => string): string => {
      const n = records.filter((r) => pick(r).trim() !== SLOT_UNSTATED && pick(r).trim() !== '').length;
      return `${n}/${records.length} = ${records.length ? Math.round((100 * n) / records.length) : 0} %`;
    };
    // Abdeckung beider Parteien-Slots (THE-540). Sie werden NICHT mehr
    // gegeneinander verglichen: seit dem Split messen sie verschiedene Dinge —
    // `adressat` den Verpflichteten (aus der Typisierung), `empfaenger` die
    // Gegenpartei (aus der Zerlegung). Ein Vergleich wäre ein Kategorienfehler.
    const cov = partyCoverage(
      records.map((r) => ({ adressat: r.adressat, empfaenger: r.slots.empfaenger })),
    );
    const modal = OBLIGATION_MODALITIES.map(
      (m) => `${m} ${records.filter((r) => r.slots.modalitaet === m).length}`,
    ).join(' · ');
    console.log(
      `\n[slots] ${records.length}/${obligations.length} zerlegt (${cfg.provider}/${cfg.model})\n` +
        `[slots] verschiedene Handlungs-Formulierungen: ${uniqueActions}\n` +
        `[slots] Bedingung befüllt: ${fillRate((r) => r.slots.bedingung)}\n` +
        `[slots] Modalität: ${modal}\n` +
        `[slots] Adressat  (Typisierung · wer ist verpflichtet): ${cov.adressatFilled}/${cov.total}\n` +
        `[slots] Empfänger (Zerlegung · an wen):                 ${cov.empfaengerFilled}/${cov.total}\n` +
        `[slots] beide Parteien bekannt: ${cov.bothFilled}/${cov.total}\n` +
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
