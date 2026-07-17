// Assembles the per-station salience map from the stores (THE-500). Returns all-1
// when a station isn't active (classic) or the user turned on "Show all".
import { useMemo } from 'react';
import { useArchitectureStore } from '../stores/architectureStore';
import { useComplianceStore } from '../stores/complianceStore';
import { useRoadmapStore } from '../stores/roadmapStore';
import { useUIStore } from '../stores/uiStore';
import { stationSalience, type SalienceContext } from '../components/journey/stationSalience';

export function useStationSalience(): Map<string, number> {
  const station = useUIStore((s) => s.journeyStation);
  const override = useUIStore((s) => s.salienceOverride);
  const elements = useArchitectureStore((s) => s.elements);
  const connections = useArchitectureStore((s) => s.connections);
  const selectedId = useArchitectureStore((s) => s.selectedElementId);
  const violationsByElement = useComplianceStore((s) => s.violationsByElement);
  const mappingsByElement = useComplianceStore((s) => s.mappingsByElement);
  const roadmaps = useRoadmapStore((s) => s.roadmaps);

  return useMemo(() => {
    const map = new Map<string, number>();
    if (!station || override) {
      for (const el of elements) map.set(el.id, 1);
      return map;
    }
    // degree per element (Connection uses sourceId/targetId — architectureStore.ts:82)
    const degreeById = new Map<string, number>();
    for (const c of connections) {
      degreeById.set(c.sourceId, (degreeById.get(c.sourceId) ?? 0) + 1);
      degreeById.set(c.targetId, (degreeById.get(c.targetId) ?? 0) + 1);
    }
    // coverage gap = element with zero mappings (only meaningful if any mappings exist)
    const coverageGapIds = new Set<string>();
    for (const el of elements) if ((mappingsByElement.get(el.id)?.length ?? 0) === 0) coverageGapIds.add(el.id);
    const violationIds = new Set<string>();
    for (const [id, n] of violationsByElement) if (n > 0) violationIds.add(id);
    const roadmapElementIds = new Set<string>(); // roadmap→element linkage lands with the Plan re-form; empty for now → Plan falls back
    const costById = new Map<string, number>(elements.map((e) => [e.id, e.annualCost ?? 0]));

    const ctx: SalienceContext = {
      degreeById, coverageGapIds, violationIds, costById, roadmapElementIds, selectedId,
      hasData: {
        explore: mappingsByElement.size > 0,
        govern: violationIds.size > 0,
        plan: roadmaps.length > 0 && roadmapElementIds.size > 0,
        track: roadmaps.length > 0,
      },
    };
    for (const el of elements) map.set(el.id, stationSalience(el, station, ctx));
    return map;
  }, [station, override, elements, connections, selectedId, violationsByElement, mappingsByElement, roadmaps]);
}
