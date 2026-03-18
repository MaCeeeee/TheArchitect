import { useState, useRef, useEffect } from 'react';
import { MessageSquare, Send, X } from 'lucide-react';
import { useCollaborationStore } from '../../stores/collaborationStore';
import { useAuthStore } from '../../stores/authStore';
import { emitChatMessage } from '../../services/socket';

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

export default function TeamChat({ isOpen, onClose }: Props) {
  const [message, setMessage] = useState('');
  const messages = useCollaborationStore((s) => s.chatMessages);
  const clearUnread = useCollaborationStore((s) => s.clearUnread);
  const onlineUsers = useCollaborationStore((s) => s.onlineUsers);
  const currentUser = useAuthStore((s) => s.user);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOpen) {
      clearUnread();
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [isOpen, messages.length]);

  const handleSend = () => {
    const text = message.trim();
    if (!text) return;
    emitChatMessage(text);
    setMessage('');
  };

  const getUserColor = (userId: string) => {
    const user = onlineUsers.find((u) => u.userId === userId);
    return user?.color || '#4a5a4a';
  };

  if (!isOpen) return null;

  return (
    <div className="absolute bottom-4 right-4 w-80 h-96 rounded-xl border border-[#1a2a1a] bg-[#111111] flex flex-col shadow-2xl z-50">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-[#1a2a1a]">
        <div className="flex items-center gap-1.5">
          <MessageSquare size={14} className="text-[#00ff41]" />
          <span className="text-xs font-semibold text-white">Team Chat</span>
          <span className="text-[10px] text-[#4a5a4a]">({onlineUsers.length} online)</span>
        </div>
        <button onClick={onClose} className="text-[#4a5a4a] hover:text-white">
          <X size={14} />
        </button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {messages.length === 0 && (
          <p className="text-[10px] text-[#3a4a3a] text-center mt-8">No messages yet. Say hello!</p>
        )}
        {messages.map((msg, i) => {
          const isSystem = msg.userId === 'system';
          const isSelf = msg.userId === currentUser?.id;

          if (isSystem) {
            return (
              <div key={i} className="text-center">
                <span className="text-[9px] text-[#3a4a3a] italic">{msg.text}</span>
              </div>
            );
          }

          return (
            <div key={i} className={`flex flex-col ${isSelf ? 'items-end' : 'items-start'}`}>
              <div className="flex items-center gap-1 mb-0.5">
                <span
                  className="text-[9px] font-medium"
                  style={{ color: getUserColor(msg.userId) }}
                >
                  {isSelf ? 'You' : msg.userName}
                </span>
                <span className="text-[8px] text-[#3a4a3a]">
                  {new Date(msg.timestamp).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
              <div
                className={`rounded-lg px-2.5 py-1.5 max-w-[85%] text-xs ${
                  isSelf
                    ? 'bg-[#00ff41] text-black'
                    : 'bg-[#0a0a0a] text-[#7a8a7a]'
                }`}
              >
                {msg.text}
              </div>
            </div>
          );
        })}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="p-2 border-t border-[#1a2a1a]">
        <div className="flex items-center gap-1.5">
          <input
            type="text"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSend()}
            placeholder="Type a message..."
            className="flex-1 bg-[#0a0a0a] border border-[#1a2a1a] rounded-md px-2.5 py-1.5 text-xs text-white placeholder:text-[#3a4a3a] outline-none focus:border-[#00ff41]"
          />
          <button
            onClick={handleSend}
            disabled={!message.trim()}
            className="p-1.5 rounded-md bg-[#00ff41] text-black hover:bg-[#00cc33] disabled:opacity-30 transition"
          >
            <Send size={12} />
          </button>
        </div>
      </div>
    </div>
  );
}
