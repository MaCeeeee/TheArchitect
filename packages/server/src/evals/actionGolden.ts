/**
 * actionGolden — Prüfsatz für den Drei-Arme-Kontrollversuch (THE-438 Slice 1,
 * Task 7). Muster: typingGolden.ts / relationsGolden.ts.
 *
 * Der Prüfsatz enthält NUR die Arme T und K:
 *
 *   T — zwei Pflichten aus verschiedenen Rechtsakten unter DERSELBEN
 *       kanonischen Handlung. Der eigentliche Messwert.
 *   K — zwei Pflichten aus verschiedenen Rechtsakten unter VERSCHIEDENEN
 *       Handlungen. Darf nie „ja" ergeben (Negativ-Kontrolle).
 *
 * ── WARUM ARM P NICHT IM PRÜFSATZ STEHT ──
 *
 * Die Positiv-Kontrolle wird ERZEUGT, nicht kuratiert: dieselbe Pflicht auf
 * beiden Seiten, nur die Herkunft variiert. Das ist die billigste belastbare
 * Positiv-Kontrolle, sie lässt sich für JEDEN Korpus automatisch bilden, und
 * sie kann nicht veralten. Kuratiert man sie, entsteht die Versuchung, sie
 * beim Umbau des Prüfsatzes „mitzupflegen" — und genau dann misst sie nicht
 * mehr, was sie messen soll. Siehe `buildPositiveControls`.
 *
 * Linear: THE-438 · Prämisse: THE-538
 */
import fs from 'node:fs';
import path from 'node:path';
import { z } from 'zod';

export const ACTION_ARMS = ['T', 'K'] as const;
export type ActionArm = (typeof ACTION_ARMS)[number];

const ObligationRefSchema = z.object({
  law: z.string().min(1),
  para: z.string(),
  title: z.string().min(1),
  text: z.string().min(1),
});

export const ActionGoldenCaseSchema = z.object({
  id: z.string().min(1),
  arm: z.enum(ACTION_ARMS),
  a: ObligationRefSchema,
  b: ObligationRefSchema,
  /** Kanonische Handlung von a (bei Arm T zugleich die von b). */
  actionId: z.string().min(1),
  /** Nur bei Arm K gesetzt: die abweichende Handlung von b. */
  actionIdB: z.string().min(1).optional(),
});

export const ActionGoldenSetSchema = z.object({
  version: z.string().min(1),
  frozen: z.boolean(),
  /** Ontologie-Stand, gegen den die Handlungen zugeordnet wurden. */
  ontologyVersion: z.string().min(1),
  cases: z.array(ActionGoldenCaseSchema).min(1),
});

export type ActionGoldenCase = z.infer<typeof ActionGoldenCaseSchema>;
export type ActionGoldenSet = z.infer<typeof ActionGoldenSetSchema>;

export const DEFAULT_ACTION_GOLDEN_PATH = path.join(__dirname, 'golden', 'actions.v1.json');

export function findDuplicateCaseIds(cases: ActionGoldenCase[]): string[] {
  const seen = new Set<string>();
  const dup = new Set<string>();
  for (const c of cases) (seen.has(c.id) ? dup : seen).add(c.id);
  return [...dup];
}

export function loadActionGolden(filePath: string = DEFAULT_ACTION_GOLDEN_PATH): ActionGoldenSet {
  const set = ActionGoldenSetSchema.parse(JSON.parse(fs.readFileSync(filePath, 'utf8')));
  const dup = findDuplicateCaseIds(set.cases);
  if (dup.length) throw new Error(`actionGolden: doppelte caseIds: ${dup.join(', ')}`);
  return set;
}

/** Ein Arm-P-Fall: künstlich, deshalb eigener Typ statt `arm: 'P'` im Schema. */
export interface PositiveControlCase {
  id: string;
  a: z.infer<typeof ObligationRefSchema>;
  b: z.infer<typeof ObligationRefSchema>;
}

/**
 * Erzeugt die Positiv-Kontrolle: dieselbe Pflicht auf beiden Seiten, nur die
 * Herkunfts-Etiketten unterscheiden sich.
 *
 * Sagt der Richter hier nicht nahezu durchgängig „ja", urteilt er über das
 * Etikett statt über den Inhalt — dann ist jede Zahl aus Arm T wertlos.
 * Genau dieser Fall trat am 2026-08-01 ein (7/15 ungeblendet).
 *
 * Deterministisch: gleichmäßige Auswahl über die Fälle, kein Zufall — sonst
 * schwankt die Decke des Instruments zwischen zwei Läufen.
 */
export function buildPositiveControls(set: ActionGoldenSet, count = 15): PositiveControlCase[] {
  const out: PositiveControlCase[] = [];
  const n = Math.min(count, set.cases.length);
  for (let i = 0; i < n; i++) {
    const src = set.cases[Math.floor((i * set.cases.length) / n)];
    out.push({
      id: `P__${src.id}`,
      a: src.a,
      // Gleiche Pflicht, andere Herkunft. `law`/`para` werden ohnehin nie
      // gerendert — die Blendung macht beide Seiten textgleich, und genau das
      // ist der Punkt: der Richter MUSS hier „dieselbe Maßnahme" sagen.
      b: { ...src.a, law: src.a.law === 'DSGVO' ? 'NIS2' : 'DSGVO', para: 'Art. 99' },
    });
  }
  return out;
}

export interface ActionGoldenStats {
  total: number;
  byArm: Record<ActionArm, number>;
  laws: string[];
  actions: number;
}

export function actionGoldenStats(set: ActionGoldenSet): ActionGoldenStats {
  return {
    total: set.cases.length,
    byArm: {
      T: set.cases.filter((c) => c.arm === 'T').length,
      K: set.cases.filter((c) => c.arm === 'K').length,
    },
    laws: [...new Set(set.cases.flatMap((c) => [c.a.law, c.b.law]))].sort(),
    actions: new Set(set.cases.map((c) => c.actionId)).size,
  };
}
