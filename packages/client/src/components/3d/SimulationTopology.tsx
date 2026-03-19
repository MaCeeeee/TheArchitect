import { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useArchitectureStore } from '../../stores/architectureStore';
import { useSimulationStore } from '../../stores/simulationStore';
import { useXRayStore } from '../../stores/xrayStore';

/**
 * SimulationTopology renders the X-Ray "Simulation Deltas" sub-view:
 * - Delta rings: green (improved) / red (worsened) pulsing rings around elements
 * - Delta beams: vertical cylinders showing magnitude of change
 * - Deadlock/Consensus auras on contested elements
 */

function DeltaRing({ position, delta, maxDelta }: {
  position: THREE.Vector3;
  delta: number;
  maxDelta: number;
}) {
  const ref = useRef<THREE.Mesh>(null);
  const glowRef = useRef<THREE.Mesh>(null);
  const absDelta = Math.abs(delta);
  const ratio = Math.min(absDelta / Math.max(maxDelta, 1), 1);
  const radius = 0.8 + ratio * 0.5;
  const color = delta < 0 ? '#22c55e' : '#ef4444';

  useFrame((state) => {
    if (!ref.current) return;
    const pulse = 1 + Math.sin(state.clock.elapsedTime * 2.5) * 0.1;
    ref.current.scale.set(pulse, pulse, 1);
    (ref.current.material as THREE.MeshBasicMaterial).opacity =
      0.4 + Math.sin(state.clock.elapsedTime * 2) * 0.15;

    if (glowRef.current) {
      glowRef.current.scale.set(pulse * 1.3, pulse * 1.3, 1);
      (glowRef.current.material as THREE.MeshBasicMaterial).opacity =
        0.1 + Math.sin(state.clock.elapsedTime * 2) * 0.05;
    }
  });

  return (
    <group position={[position.x, position.y - 0.7, position.z]}>
      <mesh ref={ref} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[radius - 0.06, radius, 32]} />
        <meshBasicMaterial color={color} transparent opacity={0.5} />
      </mesh>
      <mesh ref={glowRef} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[radius, radius + 0.15, 32]} />
        <meshBasicMaterial color={color} transparent opacity={0.12} />
      </mesh>
    </group>
  );
}

function DeltaBeam({ position, delta, maxDelta }: {
  position: THREE.Vector3;
  delta: number;
  maxDelta: number;
}) {
  const ref = useRef<THREE.Mesh>(null);
  const absDelta = Math.abs(delta);
  const ratio = Math.min(absDelta / Math.max(maxDelta, 1), 1);
  const height = Math.min(0.5 + ratio * 3, 4);
  const isImprovement = delta < 0;
  const color = isImprovement ? '#22c55e' : '#ef4444';

  // Beam goes up for improvements, down for degradations
  const yOffset = isImprovement ? height / 2 + 0.5 : -(height / 2 + 0.5);

  useFrame((state) => {
    if (!ref.current) return;
    (ref.current.material as THREE.MeshBasicMaterial).opacity =
      0.2 + Math.sin(state.clock.elapsedTime * 2) * 0.08;
  });

  return (
    <mesh ref={ref} position={[position.x, position.y + yOffset, position.z]}>
      <cylinderGeometry args={[0.06, 0.12, height, 8]} />
      <meshBasicMaterial color={color} transparent opacity={0.25} />
    </mesh>
  );
}

function DeadlockAura({ position }: { position: THREE.Vector3 }) {
  const ref = useRef<THREE.Mesh>(null);

  useFrame((state) => {
    if (!ref.current) return;
    const scale = 1 + Math.sin(state.clock.elapsedTime * 3) * 0.12;
    ref.current.scale.set(scale, scale, scale);
    (ref.current.material as THREE.MeshBasicMaterial).opacity =
      0.12 + Math.sin(state.clock.elapsedTime * 2) * 0.06;
  });

  return (
    <mesh ref={ref} position={position}>
      <sphereGeometry args={[1.3, 16, 16]} />
      <meshBasicMaterial
        color="#ef4444"
        transparent
        opacity={0.12}
        side={THREE.BackSide}
        wireframe
      />
    </mesh>
  );
}

function ConsensusAura({ position }: { position: THREE.Vector3 }) {
  const ref = useRef<THREE.Mesh>(null);

  useFrame((state) => {
    if (!ref.current) return;
    const scale = 1 + Math.sin(state.clock.elapsedTime * 2) * 0.08;
    ref.current.scale.set(scale, scale, scale);
    (ref.current.material as THREE.MeshBasicMaterial).opacity =
      0.1 + Math.sin(state.clock.elapsedTime * 1.5) * 0.05;
  });

  return (
    <mesh ref={ref} position={position}>
      <sphereGeometry args={[1.2, 16, 16]} />
      <meshBasicMaterial
        color="#22c55e"
        transparent
        opacity={0.1}
        side={THREE.BackSide}
      />
    </mesh>
  );
}

export default function SimulationTopology() {
  const elements = useArchitectureStore((s) => s.elements);
  const riskOverlay = useSimulationStore((s) => s.riskOverlay);
  const costOverlay = useSimulationStore((s) => s.costOverlay);
  const activeRun = useSimulationStore((s) => s.activeRun);
  const subView = useXRayStore((s) => s.subView);

  const { deltaElements, deadlockElementIds, consensusElementIds, maxDelta } = useMemo(() => {
    if (subView !== 'simulation') {
      return { deltaElements: [], deadlockElementIds: new Set<string>(), consensusElementIds: new Set<string>(), maxDelta: 1 };
    }

    const items: { id: string; position: THREE.Vector3; combinedDelta: number }[] = [];
    let max = 0;

    for (const el of elements) {
      const riskDelta = riskOverlay.get(el.id) || 0;
      const costDelta = costOverlay.get(el.id) || 0;
      const combined = riskDelta + costDelta;

      if (Math.abs(combined) > 0.1) {
        items.push({
          id: el.id,
          position: new THREE.Vector3(el.position3D.x, el.position3D.y, el.position3D.z),
          combinedDelta: combined,
        });
        if (Math.abs(combined) > max) max = Math.abs(combined);
      }
    }

    // Identify deadlock/consensus elements from emergence events
    const deadlockIds = new Set<string>();
    const consensusIds = new Set<string>();

    if (activeRun?.rounds) {
      for (const round of activeRun.rounds) {
        for (const event of round.emergenceEvents) {
          if (event.type === 'deadlock') {
            // Find elements targeted by deadlock agents in this round
            for (const turn of round.agentTurns) {
              if (event.involvedAgents.includes(turn.agentName)) {
                for (const action of turn.validatedActions) {
                  deadlockIds.add(action.targetElementId);
                }
              }
            }
          }
        }
      }

      // Consensus: elements where all agents approved in the last round
      const lastRound = activeRun.rounds[activeRun.rounds.length - 1];
      if (lastRound) {
        const elementPositions = new Map<string, Set<string>>();
        for (const turn of lastRound.agentTurns) {
          for (const action of turn.validatedActions) {
            const positions = elementPositions.get(action.targetElementId) || new Set();
            positions.add(turn.position);
            elementPositions.set(action.targetElementId, positions);
          }
        }
        for (const [elId, positions] of elementPositions) {
          if (positions.size === 1 && positions.has('approve')) {
            consensusIds.add(elId);
          }
        }
      }
    }

    return {
      deltaElements: items,
      deadlockElementIds: deadlockIds,
      consensusElementIds: consensusIds,
      maxDelta: max || 1,
    };
  }, [elements, riskOverlay, costOverlay, activeRun, subView]);

  // Element position map for auras
  const elementPositionMap = useMemo(() => {
    const map = new Map<string, THREE.Vector3>();
    for (const el of elements) {
      map.set(el.id, new THREE.Vector3(el.position3D.x, el.position3D.y, el.position3D.z));
    }
    return map;
  }, [elements]);

  if (subView !== 'simulation') return null;

  return (
    <group>
      {/* Delta rings around elements with changes */}
      {deltaElements.map((el) => (
        <DeltaRing
          key={`ring-${el.id}`}
          position={el.position}
          delta={el.combinedDelta}
          maxDelta={maxDelta}
        />
      ))}

      {/* Delta beams showing magnitude */}
      {deltaElements.map((el) => (
        <DeltaBeam
          key={`beam-${el.id}`}
          position={el.position}
          delta={el.combinedDelta}
          maxDelta={maxDelta}
        />
      ))}

      {/* Deadlock auras */}
      {Array.from(deadlockElementIds).map((elId) => {
        const pos = elementPositionMap.get(elId);
        return pos ? <DeadlockAura key={`dead-${elId}`} position={pos} /> : null;
      })}

      {/* Consensus auras */}
      {Array.from(consensusElementIds).map((elId) => {
        const pos = elementPositionMap.get(elId);
        return pos ? <ConsensusAura key={`cons-${elId}`} position={pos} /> : null;
      })}
    </group>
  );
}
