import { useArchitectureStore } from '../../stores/architectureStore';
import NodeObject3D from './NodeObject3D';

export default function ArchitectureElements() {
  const elements = useArchitectureStore((s) => s.elements);
  const visibleLayers = useArchitectureStore((s) => s.visibleLayers);

  const visibleElements = elements.filter((el) => visibleLayers.has(el.layer));

  return (
    <group>
      {visibleElements.map((element) => (
        <NodeObject3D key={element.id} element={element} />
      ))}
    </group>
  );
}
