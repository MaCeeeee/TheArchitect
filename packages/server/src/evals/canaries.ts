/**
 * canaries — mechanisch konstruierte Fälle, die ein Richter ablehnen MUSS
 * (THE-382 Slice 1, Task 6).
 *
 * ── WOZU ──
 *
 * Die Positiv-Kontrolle prüft, ob der Richter zustimmen kann. Sie prüft nicht,
 * ob er auch ablehnen kann. Ein Richter, der alles durchwinkt, besteht Arm P
 * mit 100 % — und liefert eine Trefferquote, die nichts bedeutet. Die
 * Kanarienvögel sind die zweite Vorbedingung: erkennt er sie nicht, ist der
 * Lauf ungültig, unabhängig davon, wie gut Arm P aussah.
 *
 * ── WARUM PARTNER-TAUSCH ──
 *
 * Der Kanarienvogel entsteht aus ZWEI verschiedenen Arm-T-Paaren: die A-Seite
 * des einen, die B-Seite des anderen. Beide Hälften sind damit echte
 * Compliance-Pflichten, sauber formuliert und plausibel aussehend — nur gehören
 * sie zu verschiedenen Maßnahmen. Ein aus dem Zusammenhang gerissener Unsinn
 * wäre zu leicht; hier muss der Richter tatsächlich lesen.
 *
 * ── WARUM NICHT VOM MODELL ERZEUGT ──
 *
 * Ein Modell, das seine eigenen Fallen baut, erbt dabei seine eigenen blinden
 * Flecken: es konstruiert genau die Fälle, die es ohnehin erkennt. Deshalb rein
 * mechanisch und deterministisch — kein LLM-Aufruf in dieser Datei.
 *
 * Linear: THE-382
 */
import type { PairRelation } from '@thearchitect/shared';
import type { ActionGoldenCase, ActionGoldenSet } from './actionGolden';

/** Untergrenze der Fangquote. Darunter ist der Lauf ungültig. */
export const CANARY_CATCH_MIN = 0.9;

/** Präfix, an dem ein Kanarienvogel überall erkennbar ist. */
export const CANARY_PREFIX = 'canary__';

export interface CanaryCase {
  id: string;
  a: ActionGoldenCase['a'];
  b: ActionGoldenCase['b'];
  /** Die beiden Quell-Fälle — damit ein Streitfall nachvollziehbar bleibt. */
  from: [string, string];
}

export function isCanaryId(id: string): boolean {
  return id.startsWith(CANARY_PREFIX);
}

/**
 * Baut Kanarienvögel durch Partner-Tausch zwischen benachbarten Arm-T-Fällen.
 *
 * Deterministisch: dieselbe Eingabe ergibt dieselben Fälle. Ein Lauf, dessen
 * Fallen zwischen zwei Messungen wechseln, misst zwei verschiedene Dinge.
 */
export function buildCanaries(set: ActionGoldenSet, count = 10): CanaryCase[] {
  // Beide Haelften aus Arm T: dort sind die Paare thematisch verwandt, der
  // Tausch faellt also NICHT schon durch einen Themenbruch auf.
  const pool = set.cases.filter((c) => c.arm === 'T').sort((x, y) => x.id.localeCompare(y.id));
  if (pool.length < 2) return [];

  const out: CanaryCase[] = [];
  const n = Math.min(count, pool.length);
  for (let i = 0; i < n; i++) {
    const left = pool[i];
    // Partner aus der gegenueberliegenden Haelfte: maximaler Abstand im Pool,
    // damit die getauschte Seite nicht zufaellig zur selben Handlung gehoert.
    const right = pool[(i + Math.floor(pool.length / 2)) % pool.length];
    if (left.id === right.id) continue;

    out.push({
      id: `${CANARY_PREFIX}${left.id}__${right.id}`,
      a: left.a,
      b: right.b,
      from: [left.id, right.id],
    });
  }
  return out;
}

/**
 * Anteil der gefangenen Kanarienvögel.
 *
 * GEFANGEN ist `unrelated` **oder** `intersects`. Die Lockerung ist bewusst:
 * beide Hälften sind echte Compliance-Pflichten, und zwei beliebige davon haben
 * fast immer einen entfernten gemeinsamen Bezug — `intersects` ist deshalb ein
 * vertretbares Urteil. NICHT vertretbar sind `equal` und `subset`: wer bei zwei
 * zusammengewürfelten Pflichten sagt, eine Maßnahme erfülle beide, stempelt ab.
 *
 * `null` (keine Antwort) zählt NICHT als gefangen — Schweigen ist keine
 * Erkennung. Und eine leere Menge ergibt `null` statt 100 %: ein Lauf ohne
 * Kanarienvögel ist nicht geprüft, nicht bestanden.
 */
export function canaryCatchRate(votes: (PairRelation | null)[]): number | null {
  if (votes.length === 0) return null;
  const caught = votes.filter((v) => v === 'unrelated' || v === 'intersects').length;
  return caught / votes.length;
}

/** `null` (nicht gemessen) besteht das Tor NICHT — dieselbe Regel wie beim Kappa. */
export function meetsCanaryGate(rate: number | null): boolean {
  return rate !== null && rate >= CANARY_CATCH_MIN;
}
