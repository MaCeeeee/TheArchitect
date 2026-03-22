import { useArchitectureStore } from '../../stores/architectureStore';
import { useViewPositions } from '../../hooks/useViewPositions';
import NodeObject3D from './NodeObject3D';

export default function ArchitectureElements() {
  const elements = useArchitectureStore((s) => s.elements);
  const visibleLayers = useArchitectureStore((s) => s.visibleLayers);
  const { positions: viewPositions, visibleElementIds } = useViewPositions();

  const visibleElements = elements.filter(
    (el) => visibleLayers.has(el.layer) && visibleElementIds.has(el.id)
  );

  return (
    <group>
      {visibleElements.map((element) => (
        <NodeObject3D
          key={element.id}
          element={element}
          viewPosition={viewPositions.get(element.id)}
        />
      ))}
    </group>
  );
}
