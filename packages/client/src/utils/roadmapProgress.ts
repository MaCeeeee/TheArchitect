// ─── REQ-PLATEAU-005 — Roadmap-wide implementation progress ─────────────────
//
// Aggregates implementation progress across ALL waves of a roadmap (the
// per-wave / per-plateau counting lives in plateauComputation.ts). Also
// resolves the first unimplemented element in wave order, so the header
// counter can offer a "jump to next" action (camera fly-to + wave focus).

import type { RoadmapWave } from '@thearchitect/shared';

export interface NextUnimplemented {
  waveNumber: number;
  elementId: string;
}

export interface RoadmapProgress {
  /** Elements with a truthy implementedAt timestamp. */
  implemented: number;
  /** Total elements across all waves. */
  total: number;
  /** Rounded percentage 0–100 (0 when the roadmap has no elements). */
  pct: number;
  /** First unimplemented element in wave order, null when all done. */
  next: NextUnimplemented | null;
}

export function computeRoadmapProgress(waves: RoadmapWave[]): RoadmapProgress {
  let implemented = 0;
  let total = 0;
  let next: NextUnimplemented | null = null;

  for (const wave of waves) {
    for (const el of wave.elements) {
      total++;
      if (el.implementedAt != null) {
        implemented++;
      } else if (!next) {
        next = { waveNumber: wave.waveNumber, elementId: el.elementId };
      }
    }
  }

  const pct = total === 0 ? 0 : Math.round((implemented / total) * 100);
  return { implemented, total, pct, next };
}
