// ADR-0005 / CONTEXT.md: a Station is the spatial manifestation of a TOGAF ADM
// Phase — plain-language label on the surface, ADM reference as a badge.
// Arrival/Genesis are On-ramps, NOT stations, and never appear here.
import type { JourneyPhase } from '../../stores/journeyStore';

export type StationKey = 'vision' | 'model' | 'explore' | 'plan' | 'govern' | 'track';

export interface StationDef {
  key: StationKey;
  label: string;    // plain-language surface name (CONTEXT.md)
  admBadge: string; // TOGAF ADM reference, shown as a badge for professionals
  phase: JourneyPhase;
  /** Escape hatch: where this station's work lives in the classic UI today. */
  classicRoute: (projectId: string) => string;
}

export const STATIONS: StationDef[] = [
  { key: 'vision',  label: 'Vision',  admBadge: 'Phase A',    phase: 1, classicRoute: (id) => `/project/${id}` },
  { key: 'model',   label: 'Model',   admBadge: 'Phases B-D', phase: 2, classicRoute: (id) => `/project/${id}` }, // hyphen = journeyStore admLabel
  { key: 'explore', label: 'Explore', admBadge: 'Phase E',    phase: 3, classicRoute: (id) => `/project/${id}/compliance/standards` },
  { key: 'plan',    label: 'Plan',    admBadge: 'Phase F',    phase: 4, classicRoute: (id) => `/project/${id}/compliance/roadmap` },
  { key: 'govern',  label: 'Govern',  admBadge: 'Phase G',    phase: 5, classicRoute: (id) => `/project/${id}/compliance/policies` },
  { key: 'track',   label: 'Track',   admBadge: 'Phase H',    phase: 6, classicRoute: (id) => `/project/${id}/compliance/audit` },
];

export const DEFAULT_STATION: StationKey = 'model';

export function isStationKey(v: string | undefined): v is StationKey {
  return STATIONS.some((s) => s.key === v);
}

export function stationForPhase(phase: JourneyPhase): StationDef {
  // STATIONS covers all six JourneyPhase values 1..6 → find always succeeds.
  return STATIONS.find((s) => s.phase === phase)!;
}
