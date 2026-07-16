// packages/client/src/components/journey/stationTempo.ts
// The two tempi (ADR-0005 #8, THE-494): a station arrival is CINEMATIC only the
// first time this browser reaches that station in this project; afterwards it is
// INSTANT. prefers-reduced-motion always wins → instant. Persistence mirrors the
// PhaseTransition Set-as-JSON convention, but keyed PER PROJECT.
import type { StationKey } from './stations';

export type Tempo = 'cinematic' | 'instant';

const storageKey = (projectId: string) => `ta_seen_stations:${projectId}`;

export function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

export function getSeenStations(projectId: string): Set<string> {
  try {
    const raw = localStorage.getItem(storageKey(projectId));
    return new Set(raw ? (JSON.parse(raw) as string[]) : []);
  } catch {
    return new Set();
  }
}

export function markStationSeen(projectId: string, station: StationKey): void {
  try {
    const seen = getSeenStations(projectId);
    seen.add(station);
    localStorage.setItem(storageKey(projectId), JSON.stringify([...seen]));
  } catch {
    /* storage unavailable — every arrival stays cinematic, which is safe */
  }
}

export function decideTempo(projectId: string, station: StationKey): Tempo {
  if (prefersReducedMotion()) return 'instant';
  return getSeenStations(projectId).has(station) ? 'instant' : 'cinematic';
}
