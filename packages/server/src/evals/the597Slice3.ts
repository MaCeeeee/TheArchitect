/**
 * THE-597 Slice 3 — Go/No-Go für Schicht 1 (Kalibrierung/Schwelle).
 *
 * Setzt die am 17.11.2026 freigegebene Vorregistrierung mechanisch um
 * (docs/evals/the597-slice3-vorregistrierung.md). Jede Konstante hier steht
 * dort; wer eine ändert, ändert die Regel nach dem Blick auf die Daten.
 * Rein und LLM-frei.
 */
import { createHash } from 'crypto';
import { thresholdRoutingStats, type RoutingStat } from './metrics';
import { axisCalibrationSamples, type TypingEvalCase } from './typingMetrics';

export const SLICE3_INSTRUMENT = {
  model: 'claude-haiku-4-5-20251001',
  samples: 5,
  variante: 'tp-4',
} as const;

export const SLICE3_GOLDEN_SHA256 = {
  gv3: 'af57f9f52f7fcae330562b271a957cc585a0071d8aadced9d83aa68f33091b11',
  gv2: '39e09d58d20391ee89a95b687157862286f13f12219ce98f9dd0ddb5b1a006a3',
} as const;

export type GoldenId = keyof typeof SLICE3_GOLDEN_SHA256;

/** gv3 und gv2 haben je 70 Fälle (beide frozen). */
export const SLICE3_CASES = 70;

export interface Slice3Run {
  label: string;
  golden: GoldenId;
  /** SHA-256 der Lauf-Datei — Input-Hash des Berichts (AC-1). */
  fileSha256: string;
  cases: TypingEvalCase[];
}

interface RawRun {
  model?: unknown;
  samples?: unknown;
  variante?: unknown;
  the597?: { goldenSha256?: unknown };
  cases?: unknown;
}

/** Liest einen Lauf und weist alles ab, was nicht zum vorregistrierten Instrument passt. */
export function parseRun(label: string, golden: GoldenId, raw: string): Slice3Run {
  const j = JSON.parse(raw) as RawRun;
  const errs: string[] = [];
  if (j.model !== SLICE3_INSTRUMENT.model) errs.push(`model=${String(j.model)}`);
  if (j.samples !== SLICE3_INSTRUMENT.samples) errs.push(`samples=${String(j.samples)}`);
  if (j.variante !== SLICE3_INSTRUMENT.variante) errs.push(`variante=${String(j.variante)}`);
  if (j.the597?.goldenSha256 !== SLICE3_GOLDEN_SHA256[golden]) {
    errs.push(`goldenSha256=${String(j.the597?.goldenSha256)}`);
  }
  if (!Array.isArray(j.cases) || j.cases.length !== SLICE3_CASES) {
    errs.push(`cases=${Array.isArray(j.cases) ? j.cases.length : 'fehlen'} statt ${SLICE3_CASES}`);
  } else if (new Set((j.cases as Array<{ caseId?: unknown }>).map((c) => c.caseId)).size !== SLICE3_CASES) {
    errs.push('cases: caseId doppelt');
  }
  if (errs.length) {
    throw new Error(`[the597-slice3] ${label}: passt nicht zum vorregistrierten Instrument (${errs.join(', ')})`);
  }
  return {
    label,
    golden,
    fileSha256: createHash('sha256').update(raw).digest('hex'),
    cases: j.cases as TypingEvalCase[],
  };
}

export const SLICE3_AXES = ['obligationKind', 'partyRole', 'provisionKind'] as const;
export type Slice3Axis = (typeof SLICE3_AXES)[number];
export const SLICE3_THRESHOLDS = [0.8, 1.0] as const;
/** Nur diese Achsen werden auf gv2 repliziert — gv2 ist im Rollenraum 1.6.0 gelabelt, tp-4 kennt 1.7.0. */
export const REPLICATION_AXES: readonly Slice3Axis[] = ['obligationKind', 'provisionKind'];
export const SLICE3_RUN_COUNT = { gv3: 5, gv2: 2 } as const;
export const MIN_RECALL = 0.5;
export const MAX_FALSE_ALARM = 0.1;
export const MIN_STABLE_RUNS = 4;

/**
 * Kill-Kriterium vom 20.09.2026. Leerer Nenner (keine falschen oder keine richtigen Fälle) =
 * nicht erfüllt — Klarstellung in der Vorregistrierung vom 17.11.2026, Abschnitt Entscheidungsregel.
 */
export function meetsCriterion(s: RoutingStat): boolean {
  return s.wrong > 0 && s.correct > 0 && s.recall >= MIN_RECALL && s.falseAlarmRate <= MAX_FALSE_ALARM;
}

function routingAt(cases: TypingEvalCase[], axis: Slice3Axis, threshold: number): RoutingStat {
  return thresholdRoutingStats(axisCalibrationSamples(cases, axis), [threshold])[0];
}

function pooled(runs: Slice3Run[]): TypingEvalCase[] {
  return runs.flatMap((r) => r.cases);
}

export interface ComboVerdict {
  axis: Slice3Axis;
  threshold: number;
  pooledGv3: RoutingStat;
  pooledGv3Pass: boolean;
  perRunGv3: Array<{ label: string; stat: RoutingStat; pass: boolean }>;
  stableRuns: number;
  stablePass: boolean;
  /** null = Replikation entfällt (partyRole). */
  pooledGv2: RoutingStat | null;
  replicationPass: boolean | null;
  /** (gefangen + Fehlalarme) / alle Samples, gepoolt über gv3. Berichtet, entscheidet nicht. */
  reviewLoad: number;
  go: boolean;
  /** GO ohne Replikation — steht auf einem Gold-Set. */
  oneGoldSetOnly: boolean;
}

export interface Slice3Decision {
  layer1: 'GO' | 'NO-GO';
  goCombos: Array<{ axis: Slice3Axis; threshold: number }>;
  combos: ComboVerdict[];
  inputs: Array<{ label: string; golden: GoldenId; fileSha256: string }>;
}

export function decideSlice3(runs: Slice3Run[]): Slice3Decision {
  const gv3 = runs.filter((r) => r.golden === 'gv3');
  const gv2 = runs.filter((r) => r.golden === 'gv2');
  if (gv3.length !== SLICE3_RUN_COUNT.gv3 || gv2.length !== SLICE3_RUN_COUNT.gv2) {
    throw new Error(
      `[the597-slice3] Vorregistrierung verlangt ${SLICE3_RUN_COUNT.gv3} gv3- und ${SLICE3_RUN_COUNT.gv2} gv2-Läufe, bekam ${gv3.length}/${gv2.length}`
    );
  }
  if (new Set(runs.map((r) => r.label)).size !== runs.length) {
    throw new Error('[the597-slice3] Label doppelt vergeben');
  }
  if (new Set(runs.map((r) => r.fileSha256)).size !== runs.length) {
    throw new Error('[the597-slice3] Zwei Läufe sind byte-identisch — dieselbe Datei doppelt gezählt?');
  }

  const combos: ComboVerdict[] = [];
  for (const axis of SLICE3_AXES) {
    for (const threshold of SLICE3_THRESHOLDS) {
      const pooledGv3 = routingAt(pooled(gv3), axis, threshold);
      const perRunGv3 = gv3.map((r) => {
        const stat = routingAt(r.cases, axis, threshold);
        return { label: r.label, stat, pass: meetsCriterion(stat) };
      });
      const stableRuns = perRunGv3.filter((p) => p.pass).length;
      const replicates = REPLICATION_AXES.includes(axis);
      const pooledGv2 = replicates ? routingAt(pooled(gv2), axis, threshold) : null;
      const replicationPass = pooledGv2 ? meetsCriterion(pooledGv2) : null;
      const pooledGv3Pass = meetsCriterion(pooledGv3);
      const stablePass = stableRuns >= MIN_STABLE_RUNS;
      const go = pooledGv3Pass && stablePass && replicationPass !== false;
      const total = pooledGv3.wrong + pooledGv3.correct;
      combos.push({
        axis,
        threshold,
        pooledGv3,
        pooledGv3Pass,
        perRunGv3,
        stableRuns,
        stablePass,
        pooledGv2,
        replicationPass,
        reviewLoad: total ? (pooledGv3.caught + pooledGv3.falseAlarms) / total : 0,
        go,
        oneGoldSetOnly: go && replicationPass === null,
      });
    }
  }
  const goCombos = combos.filter((c) => c.go).map((c) => ({ axis: c.axis, threshold: c.threshold }));
  return {
    layer1: goCombos.length ? 'GO' : 'NO-GO',
    goCombos,
    combos,
    inputs: runs.map((r) => ({ label: r.label, golden: r.golden, fileSha256: r.fileSha256 })),
  };
}
