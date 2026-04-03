import { useMemo, useState, useEffect, useRef } from 'react';
import { Html } from '@react-three/drei';
import * as THREE from 'three';
import { useSimulationStore, type DiscussionBubble } from '../../stores/simulationStore';
import { useArchitectureStore } from '../../stores/architectureStore';
import { useRoadmapStore } from '../../stores/roadmapStore';
import { AGENT_COLORS } from './AgentAvatars3D';

// ─── Constants ───

const MAX_BUBBLES_GLOBAL = 30;
const MAX_BUBBLES_PER_ELEMENT = 3;
const BUBBLE_Y_BASE = 1.8;
const BUBBLE_Y_SPACING = 1.4;
const WORKSPACE_GAP = 40;

const POSITION_BADGES: Record<string, { label: string; color: string; bg: string }> = {
  approve: { label: 'approve', color: '#22c55e', bg: 'rgba(34,197,94,0.15)' },
  reject:  { label: 'reject',  color: '#ef4444', bg: 'rgba(239,68,68,0.15)' },
  modify:  { label: 'modify',  color: '#eab308', bg: 'rgba(234,179,8,0.15)' },
  abstain: { label: 'abstain', color: '#6b7280', bg: 'rgba(107,114,128,0.15)' },
};

// ─── Props ───

interface DiscussionBubbles3DProps {
  plateauMode?: boolean;
}

// ─── Main Component ───

export default function DiscussionBubbles3D({ plateauMode }: DiscussionBubbles3DProps) {
  const discussionBubbles = useSimulationStore((s) => s.discussionBubbles);
  const showBubbles = useSimulationStore((s) => s.showBubbles);
  const showOverlay = useSimulationStore((s) => s.showOverlay);
  const isRunning = useSimulationStore((s) => s.isRunning);
  const currentRound = useSimulationStore((s) => s.currentRound);
  const elements = useArchitectureStore((s) => s.elements);

  // Plateau data (only used in plateauMode)
  const plateauSnapshots = useRoadmapStore((s) => s.plateauSnapshots);

  const isVisible = showBubbles && (isRunning || showOverlay) && discussionBubbles.length > 0;

  // Build element position map
  const elementPositionMap = useMemo(() => {
    const map = new Map<string, THREE.Vector3>();

    if (plateauMode && plateauSnapshots.length > 0) {
      // In plateau view: find elements across plateaus with offset
      for (let i = 0; i < plateauSnapshots.length; i++) {
        const snapshot = plateauSnapshots[i];
        const offsetX = i * WORKSPACE_GAP;
        for (const elState of Object.values(snapshot.elements)) {
          // Use plateau-adjusted position; prefer the plateau where element changed
          const key = `${(elState as any).elementId}_p${i}`;
          map.set(key, new THREE.Vector3(
            (elState as any).position3D.x + offsetX,
            (elState as any).position3D.y,
            (elState as any).position3D.z,
          ));
          // Also set fallback without plateau index
          if (!map.has((elState as any).elementId)) {
            map.set((elState as any).elementId, new THREE.Vector3(
              (elState as any).position3D.x + offsetX,
              (elState as any).position3D.y,
              (elState as any).position3D.z,
            ));
          }
        }
      }
    } else {
      // Standard 3D view
      for (const el of elements) {
        map.set(el.id, new THREE.Vector3(el.position3D.x, el.position3D.y, el.position3D.z));
      }
    }

    return map;
  }, [elements, plateauMode, plateauSnapshots]);

  // Group bubbles by element, cap per element and global
  const visibleBubbles = useMemo(() => {
    if (!isVisible) return [];

    // Group by target element
    const byElement = new Map<string, DiscussionBubble[]>();
    for (const bubble of discussionBubbles) {
      if (!elementPositionMap.has(bubble.targetElementId)) continue;
      const existing = byElement.get(bubble.targetElementId) || [];
      existing.push(bubble);
      byElement.set(bubble.targetElementId, existing);
    }

    // Per element: keep most recent N, sorted by round desc then timestamp desc
    const result: Array<DiscussionBubble & { stackIndex: number; worldPos: THREE.Vector3 }> = [];

    for (const [elementId, bubbles] of byElement) {
      const sorted = bubbles
        .sort((a, b) => b.round - a.round || b.timestamp - a.timestamp)
        .slice(0, MAX_BUBBLES_PER_ELEMENT);

      const pos = elementPositionMap.get(elementId)!;
      for (let i = 0; i < sorted.length; i++) {
        result.push({ ...sorted[i], stackIndex: i, worldPos: pos });
      }

      if (result.length >= MAX_BUBBLES_GLOBAL) break;
    }

    return result.slice(0, MAX_BUBBLES_GLOBAL);
  }, [discussionBubbles, elementPositionMap, isVisible]);

  if (!isVisible || visibleBubbles.length === 0) return null;

  return (
    <group>
      {visibleBubbles.map((bubble) => (
        <BubbleOverlay
          key={bubble.id}
          bubble={bubble}
          worldPos={bubble.worldPos}
          stackIndex={bubble.stackIndex}
          isCurrent={bubble.round === currentRound}
          isRunning={isRunning}
        />
      ))}
    </group>
  );
}

// ─── Single Speech Bubble ───

function BubbleOverlay({
  bubble,
  worldPos,
  stackIndex,
  isCurrent,
  isRunning,
}: {
  bubble: DiscussionBubble;
  worldPos: THREE.Vector3;
  stackIndex: number;
  isCurrent: boolean;
  isRunning: boolean;
}) {
  const agentColor = AGENT_COLORS[bubble.agentColorIndex % AGENT_COLORS.length];
  const badge = POSITION_BADGES[bubble.position] || POSITION_BADGES.abstain;
  const yOffset = BUBBLE_Y_BASE + stackIndex * BUBBLE_Y_SPACING;
  const opacity = isCurrent ? 1 : 0.45;

  // Truncate reasoning to ~100 chars
  const displayReasoning = bubble.actionReasoning.length > 100
    ? bubble.actionReasoning.slice(0, 97) + '...'
    : bubble.actionReasoning;

  // Typewriter effect for new bubbles (current round + running)
  const [visibleChars, setVisibleChars] = useState(isCurrent && isRunning ? 0 : displayReasoning.length);
  const animatedRef = useRef(false);

  useEffect(() => {
    if (animatedRef.current || visibleChars >= displayReasoning.length) return;
    animatedRef.current = true;
    const interval = setInterval(() => {
      setVisibleChars((prev) => {
        if (prev >= displayReasoning.length) {
          clearInterval(interval);
          return displayReasoning.length;
        }
        return prev + 2; // 2 chars per tick for speed
      });
    }, 25);
    return () => clearInterval(interval);
  }, [displayReasoning.length, visibleChars]);

  const shownText = displayReasoning.slice(0, visibleChars);
  const isTyping = visibleChars < displayReasoning.length;

  return (
    <Html
      position={[worldPos.x, worldPos.y + yOffset, worldPos.z]}
      center
      distanceFactor={12}
      style={{ pointerEvents: 'none' }}
    >
      <div
        style={{
          maxWidth: 230,
          padding: '6px 8px',
          borderRadius: 6,
          backgroundColor: 'rgba(10, 10, 10, 0.92)',
          borderLeft: `3px solid ${agentColor}`,
          border: `1px solid ${agentColor}30`,
          borderLeftWidth: 3,
          borderLeftColor: agentColor,
          fontFamily: 'monospace',
          fontSize: 9,
          lineHeight: 1.4,
          opacity,
          transform: 'scale(1)',
          animation: isCurrent ? 'bubblePopIn 200ms ease-out' : undefined,
          transition: 'opacity 300ms ease',
        }}
      >
        {/* Header: Agent name + Position badge */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 3 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <div style={{
              width: 6, height: 6, borderRadius: '50%',
              backgroundColor: agentColor,
              boxShadow: isCurrent ? `0 0 4px ${agentColor}` : 'none',
            }} />
            <span style={{ color: agentColor, fontWeight: 600, fontSize: 9 }}>
              {bubble.agentName}
            </span>
            <span style={{ color: '#555', fontSize: 7 }}>R{bubble.round + 1}</span>
          </div>
          <span style={{
            fontSize: 7,
            fontWeight: 600,
            padding: '1px 4px',
            borderRadius: 3,
            color: badge.color,
            backgroundColor: badge.bg,
            textTransform: 'uppercase',
            letterSpacing: '0.04em',
          }}>
            {badge.label}
          </span>
        </div>

        {/* Reasoning text with typewriter */}
        <div style={{ color: '#ccc', wordBreak: 'break-word' }}>
          {shownText}
          {isTyping && <span style={{ color: agentColor, animation: 'blink 0.6s infinite' }}>|</span>}
        </div>

        {/* Action type badge */}
        <div style={{
          marginTop: 3,
          fontSize: 7,
          color: '#888',
          display: 'flex',
          alignItems: 'center',
          gap: 3,
        }}>
          <span style={{ color: badge.color }}>{'>'}</span>
          <span>{bubble.actionType.replace(/_/g, ' ')}</span>
          <span style={{ color: '#555' }}>on</span>
          <span style={{
            color: '#aaa',
            maxWidth: 100,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}>
            {bubble.targetElementName}
          </span>
        </div>
      </div>

      {/* CSS Animations injected via style tag */}
      <style>{`
        @keyframes bubblePopIn {
          from { transform: scale(0.7); opacity: 0; }
          to   { transform: scale(1);   opacity: 1; }
        }
        @keyframes blink {
          0%, 100% { opacity: 1; }
          50%      { opacity: 0; }
        }
      `}</style>
    </Html>
  );
}
