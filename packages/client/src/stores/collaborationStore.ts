import { create } from 'zustand';

export interface OnlineUser {
  userId: string;
  userName: string;
  cursor?: { x: number; y: number; z: number };
  color: string;
}

export interface ChatMessage {
  userId: string;
  userName: string;
  text: string;
  timestamp: string;
}

export interface ElementLock {
  elementId: string;
  userId: string;
  userName: string;
  lockedAt: string;
}

const USER_COLORS = [
  '#ef4444', '#f97316', '#eab308', '#22c55e',
  '#06b6d4', '#3b82f6', '#8b5cf6', '#ec4899',
];

interface CollaborationState {
  onlineUsers: OnlineUser[];
  chatMessages: ChatMessage[];
  elementLocks: Map<string, ElementLock>;
  unreadCount: number;
  isConnected: boolean;

  setOnlineUsers: (users: { userId: string; userName: string; cursor?: { x: number; y: number; z: number } }[]) => void;
  updateCursor: (userId: string, userName: string, position: { x: number; y: number; z: number }) => void;
  addChatMessage: (msg: ChatMessage) => void;
  clearUnread: () => void;
  setConnected: (connected: boolean) => void;
  lockElement: (lock: ElementLock) => void;
  unlockElement: (elementId: string) => void;
  userJoined: (userId: string, userName: string) => void;
  userLeft: (userId: string) => void;
}

export const useCollaborationStore = create<CollaborationState>((set, get) => ({
  onlineUsers: [],
  chatMessages: [],
  elementLocks: new Map(),
  unreadCount: 0,
  isConnected: false,

  setOnlineUsers: (users) =>
    set({
      onlineUsers: users.map((u, i) => ({
        ...u,
        color: USER_COLORS[i % USER_COLORS.length],
      })),
    }),

  updateCursor: (userId, userName, position) =>
    set((state) => {
      const users = state.onlineUsers.map((u) =>
        u.userId === userId ? { ...u, cursor: position } : u
      );
      // Add user if not in list yet
      if (!users.find((u) => u.userId === userId)) {
        users.push({
          userId,
          userName,
          cursor: position,
          color: USER_COLORS[users.length % USER_COLORS.length],
        });
      }
      return { onlineUsers: users };
    }),

  addChatMessage: (msg) =>
    set((state) => ({
      chatMessages: [...state.chatMessages, msg],
      unreadCount: state.unreadCount + 1,
    })),

  clearUnread: () => set({ unreadCount: 0 }),

  setConnected: (connected) => set({ isConnected: connected }),

  lockElement: (lock) =>
    set((state) => {
      const locks = new Map(state.elementLocks);
      locks.set(lock.elementId, lock);
      return { elementLocks: locks };
    }),

  unlockElement: (elementId) =>
    set((state) => {
      const locks = new Map(state.elementLocks);
      locks.delete(elementId);
      return { elementLocks: locks };
    }),

  userJoined: (userId, userName) =>
    set((state) => {
      if (state.onlineUsers.find((u) => u.userId === userId)) return state;
      return {
        onlineUsers: [
          ...state.onlineUsers,
          { userId, userName, color: USER_COLORS[state.onlineUsers.length % USER_COLORS.length] },
        ],
        chatMessages: [
          ...state.chatMessages,
          { userId: 'system', userName: 'System', text: `${userName} joined`, timestamp: new Date().toISOString() },
        ],
      };
    }),

  userLeft: (userId) =>
    set((state) => {
      const leaving = state.onlineUsers.find((u) => u.userId === userId);
      return {
        onlineUsers: state.onlineUsers.filter((u) => u.userId !== userId),
        chatMessages: leaving
          ? [
              ...state.chatMessages,
              { userId: 'system', userName: 'System', text: `${leaving.userName} left`, timestamp: new Date().toISOString() },
            ]
          : state.chatMessages,
      };
    }),
}));
