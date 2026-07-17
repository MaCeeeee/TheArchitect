// Semantic LOD by IMPORTANCE, not distance (THE-500, ADR-0005 #7). Each station
// surfaces the elements that matter for its phase, derived from data. Additive:
// low salience recedes to RECEDE, never to 0 (nothing fully vanishes). Values are
// starting defaults — tune in the browser.
import type { StationKey } from './stations';
import type { ArchitectureElement } from '@thearchitect/shared';

export const RECEDE = 0.18;

export interface SalienceContext {
  degreeById: Map<string, number>;   // connection degree (Model hub emphasis)
  coverageGapIds: Set<string>;       // Explore: elements with a compliance coverage gap
  violationIds: Set<string>;         // Govern: elements with ≥1 policy violation
  costById: Map<string, number>;     // Plan: annual cost
  roadmapElementIds: Set<string>;    // Plan/Track: elements referenced by the roadmap
  selectedId: string | null;         // Model: the selected element
  hasData: { explore: boolean; govern: boolean; plan: boolean; track: boolean };
}

const VISION_LAYERS = new Set(['motivation', 'strategy']);

/** Importance weight [0..1] of an element on a given station. */
export function stationSalience(
  el: Pick<ArchitectureElement, 'id' | 'layer'> & { annualCost?: number },
  station: StationKey,
  ctx: SalienceContext,
): number {
  switch (station) {
    case 'model':
      return 1; // home / working view — full detail, nothing recedes
    case 'vision':
      return VISION_LAYERS.has(el.layer) ? 1 : RECEDE;
    case 'explore':
      if (!ctx.hasData.explore) return 1;
      return ctx.coverageGapIds.has(el.id) ? 1 : RECEDE;
    case 'govern':
      if (!ctx.hasData.govern) return 1;
      return ctx.violationIds.has(el.id) ? 1 : RECEDE;
    case 'plan':
      if (!ctx.hasData.plan) return 1;
      return ctx.roadmapElementIds.has(el.id) ? 1 : RECEDE;
    case 'track':
      // Track re-forms into the plateau renderer when roadmap data exists (Scene
      // handles that). This branch only runs in the box-world fallback → full.
      return 1;
  }
}
