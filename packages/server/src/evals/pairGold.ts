/**
 * pairGold — das MENSCHLICHE Gold für den typisierten Paar-Richter
 * (THE-382 Slice 1, Task 3). Muster: actionGolden.ts / relationsGolden.ts.
 *
 * ── WOZU ──
 *
 * Der Paar-Richter ist nie gegen einen Menschen validiert worden. Alle
 * bisherigen Kappa-Werte messen Übereinstimmung zwischen MODELLEN — drei
 * Häuser können sich einig und gemeinsam falsch sein. Diese Datei hält das
 * fest, was ein Enterprise Architekt auf derselben, geblendeten Darstellung
 * geurteilt hat, damit `pairs:agreement` beides gegeneinander stellen kann.
 *
 * ── DREI REGELN, DIE HIER ALS SCHEMA STEHEN ──
 *
 * 1. Das Urteil ist eine `PairRelation`, kein Ja/Nein. Ein binäres Gold wäre
 *    teuer erhobener Müll: auf denselben 120 Fällen stieg das Kappa zwischen
 *    den Häusern von 0,308 auf 0,681, allein weil die Mittelkategorie
 *    existierte (`docs/evals/typed-relation-experiment.md`).
 * 2. `relation: null` heißt „unsicher" und ist ein ZULÄSSIGES Urteil. Ein
 *    erzwungenes Urteil täuscht Gewissheit vor, die der Mensch nicht hatte —
 *    derselbe Fehlermodus wie der erzwungene Katalog-Treffer.
 * 3. `subset` OHNE Richtung wird abgelehnt. Es sähe wie ein Urteil aus, trüge
 *    aber die halbe Aussage nicht, und wäre nicht auf IR 8477 abbildbar.
 *
 * Linear: THE-382 · Prämisse: THE-538, THE-438
 */
import fs from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import { PAIR_RELATIONS } from '@thearchitect/shared';
import type { ActionGoldenCase, ActionGoldenSet, ActionArm } from './actionGolden';

/**
 * Ein menschliches Urteil zu einem Fall.
 *
 * `wider` ist an `subset` gekoppelt — in BEIDE Richtungen. Fehlt es dort, ist
 * das Urteil unvollständig; steht es anderswo, ist es bedeutungslos und würde
 * eine Aussage vortäuschen, die niemand getroffen hat.
 */
export const PairGoldVerdictSchema = z
  .object({
    caseId: z.string().min(1),
    /** `null` = ausdrücklich unsicher. Kein Urteil ist besser als ein erzwungenes. */
    relation: z.enum(PAIR_RELATIONS).nullable(),
    /** Nur bei `subset`: welche der beiden Pflichten die WEITERE ist. */
    wider: z.enum(['A', 'B']).optional(),
    notes: z.string().optional(),
  })
  .superRefine((v, ctx) => {
    if (v.relation === 'subset' && !v.wider) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['wider'],
        message: `subset ohne Richtung (${v.caseId}) — welche Pflicht ist die weitere?`,
      });
    }
    if (v.relation !== 'subset' && v.wider) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['wider'],
        message: `wider bei relation="${v.relation}" (${v.caseId}) — die Richtung hat hier keine Bedeutung`,
      });
    }
  });

/**
 * Bewusst ein flaches `z.object` (kein `.superRefine` auf der äußeren Ebene):
 * `PairGoldSchema.shape` muss lesbar bleiben, und die fallübergreifenden
 * Prüfungen gehören in den Loader, wo sie eine sprechende Fehlermeldung
 * bekommen — siehe `loadPairGold`.
 */
export const PairGoldSchema = z.object({
  version: z.string().min(1),
  /** Prüfsatz, aus dem die Fälle stammen. Ohne ihn ist der Bezugspunkt verloren. */
  sourceSet: z.string().min(1),
  annotator: z.string().min(1),
  /**
   * Sah der Mensch dieselbe GEBLENDETE Darstellung wie der Richter?
   * Ist das falsch, ist eine Abweichung doppeldeutig — Urteil oder
   * Informationsvorsprung — und der Kappa misst nicht, was er messen soll.
   */
  blinded: z.boolean(),
  labeledAt: z.string().optional(),
  verdicts: z.array(PairGoldVerdictSchema).min(1),
});

export type PairGoldVerdict = z.infer<typeof PairGoldVerdictSchema>;
export type PairGold = z.infer<typeof PairGoldSchema>;

export const DEFAULT_PAIR_GOLD_PATH = path.join(__dirname, 'golden', 'actions.human.v1.json');

export function findDuplicateCaseIds(verdicts: PairGoldVerdict[]): string[] {
  const seen = new Set<string>();
  const dup = new Set<string>();
  for (const v of verdicts) (seen.has(v.caseId) ? dup : seen).add(v.caseId);
  return [...dup];
}

/**
 * Lädt das menschliche Gold.
 *
 * Wirft bei `blinded: false`: ein Gold von einem ungeblendeten Arbeitsblatt ist
 * nicht mit den Maschinenurteilen vergleichbar. Es darf erfasst werden — aber
 * nicht stillschweigend in den Vergleich laufen.
 */
export function loadPairGold(filePath: string = DEFAULT_PAIR_GOLD_PATH): PairGold {
  const gold = PairGoldSchema.parse(JSON.parse(fs.readFileSync(filePath, 'utf8')));

  const dup = findDuplicateCaseIds(gold.verdicts);
  if (dup.length) throw new Error(`pairGold: doppelte caseIds: ${dup.join(', ')}`);

  if (!gold.blinded) {
    throw new Error(
      'pairGold: blinded=false — der Mensch sah die Gesetzesnamen, der Richter nicht. ' +
        'Eine Abweichung wäre nicht als Urteilsunterschied lesbar. Neu erheben.'
    );
  }
  return gold;
}

/** Anteil ausdrücklich unsicherer Urteile. `null` bei leerem Gold statt 0. */
export function unsureRate(gold: PairGold): number | null {
  if (gold.verdicts.length === 0) return null;
  return gold.verdicts.filter((v) => v.relation === null).length / gold.verdicts.length;
}

/**
 * Verteilung der vier Typen. Unsichere Urteile zählen NICHT mit — sonst sähe
 * ein zurückhaltender Adjudikator wie ein entschiedener aus.
 *
 * Die Zahl, auf die es ankommt, ist `equal`: kam sie bei den Modellen in 120
 * Fällen null Mal vor, und vergibt der Mensch sie häufig, dann liegt eine
 * Rubrik-Differenz Mensch/Maschine vor (O-5).
 */
export function relationDistribution(gold: PairGold): Record<string, number> {
  const out: Record<string, number> = Object.fromEntries(PAIR_RELATIONS.map((r) => [r, 0]));
  for (const v of gold.verdicts) if (v.relation) out[v.relation]++;
  return out;
}

/**
 * Zieht eine Stichprobe für die Adjudikation.
 *
 * DETERMINISTISCH — kein Zufall, keine Uhrzeit: der menschliche Anker darf
 * zwischen zwei Läufen nicht wackeln, sonst adjudiziert man beim zweiten Mal
 * andere Fälle und vergleicht Äpfel mit Birnen.
 *
 * ARM-PROPORTIONAL — eine Stichprobe, die zufällig nur Arm T träfe, könnte die
 * Negativ-Seite gar nicht prüfen. Der Richter darf bei Arm K nie zustimmen;
 * ohne Arm-K-Fälle im Gold bliebe genau das ungeprüft.
 */
export function samplePairs(set: ActionGoldenSet, count: number): ActionGoldenCase[] {
  if (count <= 0) return [];

  const byArm: Record<ActionArm, ActionGoldenCase[]> = {
    T: set.cases.filter((c) => c.arm === 'T'),
    K: set.cases.filter((c) => c.arm === 'K'),
  };
  const total = byArm.T.length + byArm.K.length;
  if (total === 0) return [];

  const want = Math.min(count, total);
  // Arm T bestimmt die Quote, Arm K bekommt den Rest — so summieren die beiden
  // Teile exakt auf `want`, ohne dass eine Rundung einen Fall verschluckt.
  const wantT = Math.min(byArm.T.length, Math.round((want * byArm.T.length) / total));
  const wantK = Math.min(byArm.K.length, want - wantT);

  const pick = (cases: ActionGoldenCase[], n: number): ActionGoldenCase[] => {
    if (n <= 0) return [];
    // Gleichmäßige Spreizung über die (nach id sortierte) Liste — dasselbe
    // Verfahren wie bei `buildPositiveControls`, damit beide Stichproben auf
    // dieselbe Weise stabil sind.
    const sorted = [...cases].sort((x, y) => x.id.localeCompare(y.id));
    const out: ActionGoldenCase[] = [];
    for (let i = 0; i < n; i++) out.push(sorted[Math.floor((i * sorted.length) / n)]);
    return out;
  };

  return [...pick(byArm.T, wantT), ...pick(byArm.K, wantK)];
}
