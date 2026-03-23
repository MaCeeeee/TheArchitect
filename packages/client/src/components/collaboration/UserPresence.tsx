import { Users, Wifi, WifiOff } from 'lucide-react';
import { useCollaborationStore } from '../../stores/collaborationStore';

export default function UserPresence() {
  const onlineUsers = useCollaborationStore((s) => s.onlineUsers);
  const isConnected = useCollaborationStore((s) => s.isConnected);

  return (
    <div className="flex items-center gap-2">
      {/* Connection status */}
      <div className="flex items-center gap-1">
        {isConnected ? (
          <Wifi size={12} className="text-green-400" />
        ) : (
          <WifiOff size={12} className="text-red-400" />
        )}
      </div>

      {/* Online users */}
      {onlineUsers.length > 0 && (
        <div className="flex items-center gap-1">
          <Users size={12} className="text-[var(--text-tertiary)]" />
          <div className="flex -space-x-1.5">
            {onlineUsers.slice(0, 5).map((user) => (
              <div
                key={user.userId}
                className="w-5 h-5 rounded-full border-2 border-[#111111] flex items-center justify-center text-[8px] font-bold text-white"
                style={{ backgroundColor: user.color }}
                title={user.userName}
              >
                {user.userName.charAt(0).toUpperCase()}
              </div>
            ))}
            {onlineUsers.length > 5 && (
              <div className="w-5 h-5 rounded-full border-2 border-[#111111] bg-[#1a2a1a] flex items-center justify-center text-[8px] text-[var(--text-secondary)]">
                +{onlineUsers.length - 5}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
