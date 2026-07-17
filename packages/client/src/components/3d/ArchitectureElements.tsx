import { useMemo } from 'react';
import { useArchitectureStore } from '../../stores/architectureStore';
import { useRemediationStore } from '../../stores/remediationStore';
import { useViewPositions } from '../../hooks/useViewPositions';
import { useStationSalience } from '../../hooks/useStationSalience';
import { forcedLabelIds } from '../journey/stationSalience';
import { LAYER_Y } from '@thearchitect/shared';
import NodeObject3D from './NodeObject3D';
import type { ArchitectureElement } from '@thearchitect/shared';

export default function ArchitectureElements() {
  const elements = useArchitectureStore((s) => s.elements);
  const visibleLayers = useArchitectureStore((s) => s.visibleLayers);
  const previewElements = useRemediationStore((s) => s.previewElements);
  const { positions: viewPositions, visibleElementIds } = useViewPositions();
  const salience = useStationSalience();
  // Labels are forced only when the station discriminates AND the focus set is
  // small enough to read — an all-salient station (Model, fallbacks) must NOT
  // paint a wall of 40+ label boxes (user-reported, THE-500).
  const labelIds = useMemo(() => forcedLabelIds(salience), [salience]);

  const visibleElements = elements.filter(
    (el) => visibleLayers.has(el.layer) && visibleElementIds.has(el.id)
      && !el.metadata?.isPolicyNode
      && !el.metadata?.isActivity
  );

  // Convert preview elements to ArchitectureElement format for 3D rendering
  const proposalOverlays = useMemo<ArchitectureElement[]>(() => {
    if (previewElements.length === 0) return [];

    const spacing = 3;
    const rowSize = 5;
    const layerCounts: Record<string, number> = {};

    return previewElements
      .filter((pe) => visibleLayers.has(pe.layer))
      .map((pe) => {
        layerCounts[pe.layer] = (layerCounts[pe.layer] || 0);
        const col = layerCounts[pe.layer]++;
        const x = 15 + (col % rowSize) * spacing;
        const y = LAYER_Y[pe.layer] ?? 0;
        const z = Math.floor(col / rowSize) * spacing;

        return {
          id: pe.tempId,
          type: pe.type,
          name: pe.name,
          description: pe.description || '',
          layer: pe.layer,
          togafDomain: pe.togafDomain,
          maturityLevel: pe.maturityLevel || 1,
          riskLevel: pe.riskLevel || 'low',
          status: pe.status || 'target',
          position3D: { x, y, z },
          metadata: { isProposal: true },
          projectId: '',
          workspaceId: '',
          createdAt: '',
          updatedAt: '',
        } as ArchitectureElement;
      });
  }, [previewElements, visibleLayers]);

  return (
    <group>
      {visibleElements.map((element) => (
        <NodeObject3D
          key={element.id}
          element={element}
          viewPosition={viewPositions.get(element.id)}
          salience={salience.get(element.id) ?? 1}
          labelForced={labelIds.has(element.id)}
        />
      ))}
      {proposalOverlays.map((element) => (
        <NodeObject3D
          key={`proposal-${element.id}`}
          element={element}
        />
      ))}
    </group>
  );
}
