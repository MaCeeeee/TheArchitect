/**
 * UC-EXEC-001 — Thresholds for headline tone derivation.
 *
 * Single source of truth shared between executiveSummary.service (backend)
 * and the Persona views (frontend) so business rules stay in sync.
 *
 * Linear: THE-287
 */

export const HEADLINE_THRESHOLDS = {
  cio: {
    critical_hotspots: 5,
    critical_spofs: 3,
    warning_hotspots: 1,
  },
  ceo: {
    critical_drivers: 3,
    mapping_low_pct: 30,
  },
  cfo: {
    critical_tier: 3,
    warning_tier: 2,
  },
  /** Score above which an element counts as a "critical hotspot". */
  hotspot_score: 60,
  /** Maturity level (0–5) at or below which an element counts as "immature". */
  immature_maturity_max: 2,
} as const;
