import { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { Html, Line } from '@react-three/drei';
import * as THREE from 'three';
import { useSimulationStore } from '../../stores/simulationStore';
import { useArchitectureStore } from '../../stores/architectureStore';
import { LAYER_Y } from '@thearchitect/shared/src/constants/togaf.constants';

export const AGENT_COLORS = ['#06b6d4', '#a855f7', '#f43f5e', '#eab308', '#22d3ee', '#f97316'];

/**
 * AgentAvatars3D renders translucent spheres above architecture layers
 * representing simulation agent personas. Active agents pulse during reasoning,
 * and connection lines show which elements each agent addresses.
 */
export default function AgentAvatars3D() {
  const isRunning = useSimulationStore((s) => s.isRunning);
  const showOverlay = useSimulationStore((s) => s.showOverlay);
  const activeRun = useSimulationStore((s) => s.activeRun);
  const currentAgent = useSimulationStore((s) => s.currentAgent);
  const liveFeed = useSimulationStore((s) => s.liveFeed);
  const elements = useArchitectureStore((s) => s.elements);

  const agents = activeRun?.config?.agents;
  const isVisible = isRunning || (showOverlay && activeRun?.result != null);

  // Build element position map — skip elements that are filtered from main render
  // (activities live in drill-frame at y=-100, policy nodes are HUD overlays).
  // Lines drawn to those targets would spike below the visible layer stack.
  const elementPositionMap = useMemo(() => {
    const map = new Map<string, THREE.Vector3>();
    for (const el of elements) {
      if (el.metadata?.isActivity || el.metadata?.isPolicyNode) continue;
      map.set(el.id, new THREE.Vector3(el.position3D.x, el.position3D.y, el.position3D.z));
    }
    return map;
  }, [elements]);

  // Get target element IDs for each agent
  const agentTargets = useMemo(() => {
    const targets = new Map<string, string[]>();
    if (!agents) return targets;

    if (isRunning) {
      // During running: extract from latest 'actions' feed entry
      for (let i = liveFeed.length - 1; i >= 0; i--) {
        const entry = liveFeed[i];
        if (entry.type === 'actions' && entry.data) {
          const data = entry.data as { validated?: Array<{ targetElementId: string }> };
          const ids = data.validated?.map((a) => a.targetElementId) || [];
          // Associate with current agent's last action entry
          const agentName = entry.content.split(':')[0]?.trim();
          if (agentName) {
            targets.set(agentName, ids);
          }
        }
      }
    } else if (activeRun?.result) {
      // After completion: show recommended actions per agent
      for (const agent of agents) {
        const lastRound = activeRun.rounds?.[activeRun.rounds.length - 1];
        if (!lastRound) continue;
        const turn = lastRound.agentTurns.find((t) => t.agentPersonaId === agent.id);
        if (turn) {
          targets.set(agent.name, turn.validatedActions.map((a) => a.targetElementId));
        }
      }
    }

    return targets;
  }, [agents, isRunning, liveFeed, activeRun]);

  if (!isVisible || !agents || agents.length === 0) return null;

  return (
    <group>
      {agents.map((agent, index) => {
        const layerY = LAYER_Y[agent.visibleLayers[0]] ?? 4;
        const totalAgents = agents.length;
        const x = index * 4 - (totalAgents - 1) * 2;
        const position = new THREE.Vector3(x, layerY + 3, -8);
        const color = AGENT_COLORS[index % AGENT_COLORS.length];
        const isActive = isRunning && currentAgent === agent.name;
        const targetIds = agentTargets.get(agent.name) || [];

        return (
          <AgentAvatar3D
            key={agent.id}
            position={position}
            color={color}
            name={agent.name}
            isActive={isActive}
            targetIds={targetIds}
            elementPositionMap={elementPositionMap}
          />
        );
      })}
    </group>
  );
}

// ─── Single Agent Avatar ───

function AgentAvatar3D({
  position,
  color,
  name,
  isActive,
  targetIds,
  elementPositionMap,
}: {
  position: THREE.Vector3;
  color: string;
  name: string;
  isActive: boolean;
  targetIds: string[];
  elementPositionMap: Map<string, THREE.Vector3>;
}) {
  const meshRef = useRef<THREE.Mesh>(null);
  const lightRef = useRef<THREE.PointLight>(null);

  useFrame((state) => {
    if (!meshRef.current) return;
    const t = state.clock.elapsedTime;

    if (isActive) {
      // Pulsing scale during reasoning
      const pulse = 1 + Math.sin(t * 4) * 0.2;
      meshRef.current.scale.set(pulse, pulse, pulse);

      // Glow
      const mat = meshRef.current.material as THREE.MeshStandardMaterial;
      mat.emissiveIntensity = 0.6 + Math.sin(t * 3) * 0.2;

      if (lightRef.current) {
        lightRef.current.intensity = 1.5 + Math.sin(t * 4) * 0.5;
      }
    } else {
      meshRef.current.scale.set(1, 1, 1);
      const mat = meshRef.current.material as THREE.MeshStandardMaterial;
      mat.emissiveIntensity = 0.3;
    }

    // Gentle float
    meshRef.current.position.y = position.y + Math.sin(t * 1.2) * 0.15;
  });

  // Resolve target positions
  const targetPositions = useMemo(() => {
    const positions: THREE.Vector3[] = [];
    for (const id of targetIds) {
      const pos = elementPositionMap.get(id);
      if (pos) positions.push(pos);
    }
    return positions;
  }, [targetIds, elementPositionMap]);

  return (
    <group>
      {/* Agent sphere */}
      <mesh ref={meshRef} position={position}>
        <sphereGeometry args={[0.8, 32, 32]} />
        <meshStandardMaterial
          color={color}
          transparent
          opacity={0.35}
          emissive={color}
          emissiveIntensity={0.3}
          metalness={0.4}
          roughness={0.6}
        />
      </mesh>

      {/* Point light for active agent */}
      {isActive && (
        <pointLight
          ref={lightRef}
          position={[position.x, position.y + 0.5, position.z]}
          color={color}
          intensity={1.5}
          distance={8}
        />
      )}

      {/* Name label */}
      <Html
        position={[position.x, position.y + 1.3, position.z]}
        center
        distanceFactor={15}
        style={{ pointerEvents: 'none' }}
      >
        <div
          className="text-[10px] font-medium px-1.5 py-0.5 rounded whitespace-nowrap"
          style={{
            color,
            backgroundColor: 'rgba(10, 10, 10, 0.85)',
            border: `1px solid ${color}40`,
            textShadow: isActive ? `0 0 6px ${color}` : 'none',
          }}
        >
          {name}
        </div>
      </Html>

      {/* Connection beams to target elements */}
      {targetPositions.map((targetPos, i) => (
        <AgentBeam
          key={`beam-${i}`}
          start={position}
          end={targetPos}
          color={color}
          isActive={isActive}
        />
      ))}
    </group>
  );
}

// ─── Connection Beam from Agent to Element ───

function AgentBeam({
  start,
  end,
  color,
  isActive,
}: {
  start: THREE.Vector3;
  end: THREE.Vector3;
  color: string;
  isActive: boolean;
}) {
  const particleRef = useRef<THREE.Mesh>(null);

  const curve = useMemo(() => {
    const mid = start.clone().lerp(end, 0.5);
    mid.y += 2;
    return new THREE.QuadraticBezierCurve3(start, mid, end);
  }, [start, end]);

  const points = useMemo(() => curve.getPoints(32), [curve]);

  useFrame((state) => {
    if (!particleRef.current) return;
    const speed = isActive ? 0.5 : 0.3;
    const t = (state.clock.elapsedTime * speed) % 1;
    const point = curve.getPoint(t);
    particleRef.current.position.copy(point);
  });

  return (
    <group>
      <Line
        points={points}
        color={color}
        lineWidth={1.5}
        transparent
        opacity={isActive ? 0.5 : 0.25}
      />
      {/* Traveling particle */}
      <mesh ref={particleRef}>
        <sphereGeometry args={[0.1, 8, 8]} />
        <meshBasicMaterial color={color} transparent opacity={isActive ? 0.8 : 0.4} />
      </mesh>
    </group>
  );
}
