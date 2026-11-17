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

export const SLICE3_AXES = ['obligationKind', 'partyRole', 'provisionKind'] as const;
export type Slice3Axis = (typeof SLICE3_AXES)[number];
export const SLICE3_THRESHOLDS = [0.8, 1.0] as const;

/** gv3 und gv2 haben je 70 Fälle (beide frozen). */
export const SLICE3_CASES = 70;

export interface Slice3Run {
  label: string;
  golden: GoldenId;
  /** SHA-256 der Lauf-Datei — Input-Hash des Berichts (AC-1). */
  fileSha256: string;
  cases: TypingEvalCase[];
  /**
   * Fälle je Achse, in denen alle k Aufrufe offen blieben (weder Vorhersage noch Konfidenz) —
   * wie in Slice 1 übersprungen. Nur Anzeige, keine Wirkung auf die Entscheidung.
   */
  openByAxis: Record<Slice3Axis, number>;
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
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    throw new Error(`[the597-slice3] ${label}: kein gültiges JSON (${(e as Error).message})`);
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error(`[the597-slice3] ${label}: kein gültiges JSON (Top-Level ist kein Objekt)`);
  }
  const j = parsed as RawRun;
  const errs: string[] = [];
  const openByAxis = { obligationKind: 0, partyRole: 0, provisionKind: 0 } as Record<Slice3Axis, number>;
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
  if (Array.isArray(j.cases)) {
    // aggregateVotes (runTypingEval.ts) setzt für eine Achse, die in allen k Aufrufen offen blieb,
    // weder Label noch Konfidenz: predicted[axis] fehlt (undefined). Das ist „offen" und wird
    // wie in Slice 1 übersprungen. Jede Stimme (auch null = nicht anwendbar) trägt eine Konfidenz.
    type RawCase = {
      caseId?: unknown;
      predicted?: Record<string, unknown> | null;
      confidence?: Record<string, unknown> | null;
    };
    for (const c of j.cases as RawCase[]) {
      for (const axis of SLICE3_AXES) {
        const v = c?.confidence?.[axis];
        if (v === undefined) {
          if (c?.predicted?.[axis] === undefined) openByAxis[axis]++;
          else errs.push(`confidence ungültig: ${String(c?.caseId)}/${axis} (Vorhersage ohne Konfidenz)`);
        } else if (typeof v !== 'number' || !Number.isFinite(v) || v < 0 || v > 1) {
          errs.push(`confidence ungültig: ${String(c?.caseId)}/${axis}`);
        }
      }
    }
  }
  if (errs.length) {
    throw new Error(`[the597-slice3] ${label}: passt nicht zum vorregistrierten Instrument (${errs.join(', ')})`);
  }
  return {
    label,
    golden,
    fileSha256: createHash('sha256').update(raw).digest('hex'),
    cases: j.cases as TypingEvalCase[],
    openByAxis,
  };
}

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
  reviewLoad: number | null;
  go: boolean;
  /** GO ohne Replikation — steht auf einem Gold-Set. */
  oneGoldSetOnly: boolean;
}

export interface Slice3Decision {
  layer1: 'GO' | 'NO-GO';
  goCombos: Array<{ axis: Slice3Axis; threshold: number }>;
  combos: ComboVerdict[];
  inputs: Array<{ label: string; golden: GoldenId; fileSha256: string; openByAxis: Record<Slice3Axis, number> }>;
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
        reviewLoad: total ? (pooledGv3.caught + pooledGv3.falseAlarms) / total : null,
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
    inputs: runs.map((r) => ({ label: r.label, golden: r.golden, fileSha256: r.fileSha256, openByAxis: r.openByAxis })),
  };
}

export const KNOWN_ERROR_CLASSES = [
  { id: 'F-04', axis: 'obligationKind', goldClass: 'prohibition' },
  { id: 'F-05', axis: 'partyRole', goldClass: 'supervisory_authority' },
  { id: 'F-06', axis: 'provisionKind', goldClass: 'procedural' },
  { id: 'F-07', axis: 'partyRole', goldClass: 'member_state' },
] as const satisfies ReadonlyArray<{ id: string; axis: Slice3Axis; goldClass: string }>;

export interface KnownErrorClassStat {
  id: string;
  axis: Slice3Axis;
  goldClass: string;
  gold: number;
  wrong: number;
  routedBelow08: number;
  routedBelow10: number;
}

/** Beschreibend, gepoolt über gv3 — entscheidet nichts (Vorregistrierung, Abschnitt Instrument). */
export function knownErrorClasses(runs: Slice3Run[]): KnownErrorClassStat[] {
  const cases = pooled(runs.filter((r) => r.golden === 'gv3'));
  return KNOWN_ERROR_CLASSES.map(({ id, axis, goldClass }) => {
    const inClass = cases.filter((c) => c.gold[axis] === goldClass);
    const wrong = inClass.filter((c) => c.predicted[axis] !== goldClass);
    const conf = (c: TypingEvalCase) => c.confidence?.[axis];
    return {
      id,
      axis,
      goldClass,
      gold: inClass.length,
      wrong: wrong.length,
      routedBelow08: wrong.filter((c) => (conf(c) ?? Infinity) < SLICE3_THRESHOLDS[0]).length,
      routedBelow10: wrong.filter((c) => (conf(c) ?? Infinity) < SLICE3_THRESHOLDS[1]).length,
    };
  });
}

const pct = (x: number) => `${(x * 100).toFixed(1)} %`;
/** Leerer Nenner → „—" statt 0 % (Konvention aus metrics.ts, THE-597 R-003). */
const rate = (n: number, d: number) => (d ? `${pct(n / d)} (${n}/${d})` : '—');
const thr = (t: number) => `< ${t.toFixed(1)}`;
const yn = (b: boolean | null) => (b === null ? 'entfällt' : b ? 'ja' : 'nein');

export function renderSlice3Report(d: Slice3Decision, known: KnownErrorClassStat[]): string {
  const L: string[] = [];
  L.push('# THE-597 Slice 3 — Ergebnis: Go/No-Go für Schicht 1');
  L.push('');
  L.push('Regel: `docs/evals/the597-slice3-vorregistrierung.md` (freigegeben 17.11.2026, vor der Messung).');
  L.push(
    `Instrument: \`${SLICE3_INSTRUMENT.model}\` · Prompt \`${SLICE3_INSTRUMENT.variante}\` · k = ${SLICE3_INSTRUMENT.samples} · Kriterium Recall ≥ ${pct(MIN_RECALL)} und Fehlalarm ≤ ${pct(MAX_FALSE_ALARM)} · stabil in ≥ ${MIN_STABLE_RUNS} von ${SLICE3_RUN_COUNT.gv3} gv3-Läufen · repliziert auf gv2 (nur ${REPLICATION_AXES.join(', ')}).`
  );
  L.push('');
  const goText = d.goCombos.map((g) => `${g.axis} ${thr(g.threshold)}`).join(', ');
  L.push(`## Verdikt — Schicht 1: **${d.layer1}**${d.layer1 === 'GO' ? ` (${goText})` : ''}`);
  L.push('');
  if (d.combos.some((c) => c.oneGoldSetOnly)) {
    L.push('⚠️ Mindestens ein GO steht auf **einem** Gold-Set (partyRole, keine Replikation möglich).');
    L.push('');
  }
  L.push('## Kombinationen');
  L.push('');
  L.push('| Achse | Schwelle | Recall gepoolt gv3 | Fehlalarm gepoolt gv3 | gepoolt erfüllt | stabil (Läufe) | gv2 repliziert | Prüf-Last | GO |');
  L.push('|---|---|---|---|---|---|---|---|---|');
  for (const c of d.combos) {
    L.push(
      `| ${c.axis} | ${thr(c.threshold)} | ${rate(c.pooledGv3.caught, c.pooledGv3.wrong)} | ${rate(c.pooledGv3.falseAlarms, c.pooledGv3.correct)} | ${yn(c.pooledGv3Pass)} | ${c.stableRuns}/${c.perRunGv3.length} | ${yn(c.replicationPass)}${c.pooledGv2 ? ` (${rate(c.pooledGv2.caught, c.pooledGv2.wrong)} / ${rate(c.pooledGv2.falseAlarms, c.pooledGv2.correct)})` : ''} | ${rate(c.pooledGv3.caught + c.pooledGv3.falseAlarms, c.pooledGv3.wrong + c.pooledGv3.correct)} | **${c.go ? 'GO' : 'nein'}** |`
    );
  }
  L.push('');
  L.push('Prüf-Last = Anteil aller gv3-Samples, die ein Mensch sehen müsste. Sie wird berichtet und entscheidet nicht (stand nicht im Kriterium vom 20.09.2026).');
  L.push('');
  L.push('## Einzelläufe gv3 (Recall / Fehlalarm)');
  L.push('');
  L.push(`| Achse | Schwelle | ${d.combos[0]?.perRunGv3.map((p) => p.label).join(' | ') ?? ''} |`);
  L.push(`|---|---|${d.combos[0]?.perRunGv3.map(() => '---|').join('') ?? ''}`);
  for (const c of d.combos) {
    L.push(
      `| ${c.axis} | ${thr(c.threshold)} | ${c.perRunGv3.map((p) => `${rate(p.stat.caught, p.stat.wrong)} / ${rate(p.stat.falseAlarms, p.stat.correct)}${p.pass ? ' ✓' : ''}`).join(' | ')} |`
    );
  }
  L.push('');
  if (known.length) {
    L.push('## Bekannte Fehlerklassen (beschreibend, gepoolt über gv3 — entscheidet nicht)');
    L.push('');
    L.push('Gezählt wird die Gold-Seite: Fälle mit dieser Gold-Klasse, die falsch klassifiziert wurden (bei F-07 war im Register die Precision das Problem; diese Seite sieht die Tabelle nicht).');
    L.push('');
    L.push('| ID | Achse | Gold-Klasse | Gold | falsch | davon < 0,8 | davon < 1,0 |');
    L.push('|---|---|---|---|---|---|---|');
    for (const k of known) {
      L.push(`| ${k.id} | ${k.axis} | ${k.goldClass} | ${k.gold} | ${k.wrong} | ${k.routedBelow08} | ${k.routedBelow10} |`);
    }
    L.push('');
  }
  L.push('## Offen geblieben (alle k Aufrufe ohne Wert, wie in Slice 1 übersprungen)');
  L.push('');
  L.push(`| Lauf | ${SLICE3_AXES.join(' | ')} |`);
  L.push(`|---|${SLICE3_AXES.map(() => '---|').join('')}`);
  for (const i of d.inputs) L.push(`| ${i.label} | ${SLICE3_AXES.map((a) => i.openByAxis[a]).join(' | ')} |`);
  L.push('');
  L.push('## Inputs (SHA-256 der Lauf-Dateien)');
  L.push('');
  L.push('| Lauf | Golden | SHA-256 |');
  L.push('|---|---|---|');
  for (const i of d.inputs) L.push(`| ${i.label} | ${i.golden} | \`${i.fileSha256}\` |`);
  L.push('');
  return L.join('\n');
}
