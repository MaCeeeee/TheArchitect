// ADR-0005 / CONTEXT.md: a Station is the spatial manifestation of a TOGAF ADM
// Phase — plain-language label on the surface, ADM reference as a badge.
// Arrival/Genesis are On-ramps, NOT stations, and never appear here.
import { PHASE_CONFIG } from '../../stores/journeyStore';
import type { JourneyPhase } from '../../stores/journeyStore';

export type StationKey = 'vision' | 'model' | 'explore' | 'plan' | 'govern' | 'track';

export interface StationDef {
  key: StationKey;
  label: string;    // plain-language surface name (CONTEXT.md)
  admBadge: string; // TOGAF ADM reference, shown as a badge for professionals
  phase: JourneyPhase;
  /** Escape hatch: where this station's work lives in the classic UI today. */
  classicRoute: (projectId: string) => string;
  /** Conformance gate this station maps onto (ADR-0005 #4), when it has one. */
  conformanceGate?: 'Cover' | 'Enforce' | 'Attest';
}

// admBadge is derived from journeyStore's PHASE_CONFIG (single source of truth)
// so the badge can never silently drift from the store's admLabel strings.
// Conformance gates map onto ADM stations (ADR-0005 #4): Explore=Cover, Govern=Enforce, Track=Attest.
export const STATIONS: StationDef[] = [
  { key: 'vision',  label: 'Vision',  admBadge: PHASE_CONFIG[1].admLabel, phase: 1, classicRoute: (id) => `/project/${id}` },
  { key: 'model',   label: 'Model',   admBadge: PHASE_CONFIG[2].admLabel, phase: 2, classicRoute: (id) => `/project/${id}` },
  { key: 'explore', label: 'Explore', admBadge: PHASE_CONFIG[3].admLabel, phase: 3, classicRoute: (id) => `/project/${id}/compliance/standards`, conformanceGate: 'Cover' },
  { key: 'plan',    label: 'Plan',    admBadge: PHASE_CONFIG[4].admLabel, phase: 4, classicRoute: (id) => `/project/${id}/compliance/roadmap` },
  { key: 'govern',  label: 'Govern',  admBadge: PHASE_CONFIG[5].admLabel, phase: 5, classicRoute: (id) => `/project/${id}/compliance/policies`, conformanceGate: 'Enforce' },
  { key: 'track',   label: 'Track',   admBadge: PHASE_CONFIG[6].admLabel, phase: 6, classicRoute: (id) => `/project/${id}/compliance/audit`, conformanceGate: 'Attest' },
];

export const DEFAULT_STATION: StationKey = 'model';

export function isStationKey(v: string | undefined): v is StationKey {
  return STATIONS.some((s) => s.key === v);
}

export function stationForPhase(phase: JourneyPhase): StationDef {
  // STATIONS covers all six JourneyPhase values 1..6 → find always succeeds.
  return STATIONS.find((s) => s.phase === phase)!;
}
