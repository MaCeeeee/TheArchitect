import { Html } from '@react-three/drei';
import { useCollaborationStore } from '../../stores/collaborationStore';
import { useAuthStore } from '../../stores/authStore';

export default function CursorOverlay() {
  const onlineUsers = useCollaborationStore((s) => s.onlineUsers);
  const currentUserId = useAuthStore((s) => s.user?.id);

  const otherUsers = onlineUsers.filter(
    (u) => u.userId !== currentUserId && u.cursor
  );

  return (
    <>
      {otherUsers.map((user) => (
        <group key={user.userId} position={[user.cursor!.x, user.cursor!.y, user.cursor!.z]}>
          {/* Cursor dot */}
          <mesh>
            <sphereGeometry args={[0.15, 8, 8]} />
            <meshBasicMaterial color={user.color} transparent opacity={0.8} />
          </mesh>

          {/* Pulse ring */}
          <mesh rotation={[-Math.PI / 2, 0, 0]}>
            <ringGeometry args={[0.2, 0.35, 16]} />
            <meshBasicMaterial color={user.color} transparent opacity={0.3} />
          </mesh>

          {/* Label */}
          <Html
            position={[0, 0.4, 0]}
            center
            style={{ pointerEvents: 'none' }}
          >
            <div
              className="px-1.5 py-0.5 rounded text-[9px] font-medium text-white whitespace-nowrap"
              style={{ backgroundColor: user.color }}
            >
              {user.userName}
            </div>
          </Html>
        </group>
      ))}
    </>
  );
}
