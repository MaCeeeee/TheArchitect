/**
 * THE-597 Slice 3 — Go/No-Go für Schicht 1 (Kalibrierung/Schwelle).
 *
 * Setzt die am 17.11.2026 freigegebene Vorregistrierung mechanisch um
 * (docs/evals/the597-slice3-vorregistrierung.md). Jede Konstante hier steht
 * dort; wer eine ändert, ändert die Regel nach dem Blick auf die Daten.
 * Rein und LLM-frei.
 */
import { createHash } from 'crypto';
import type { TypingEvalCase } from './typingMetrics';

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
