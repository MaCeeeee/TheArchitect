import { io, Socket } from 'socket.io-client';
import { useAuthStore } from '../stores/authStore';

const SOCKET_URL = import.meta.env.VITE_WS_URL || 'http://localhost:4000';

let socket: Socket | null = null;

export interface CursorData {
  userId: string;
  userName: string;
  position: { x: number; y: number; z: number };
}

export interface ChatMessage {
  userId: string;
  userName: string;
  text: string;
  timestamp: string;
}

export interface OnlineUser {
  userId: string;
  userName: string;
  cursor?: { x: number; y: number; z: number };
}

export function getSocket(): Socket | null {
  return socket;
}

export function connectSocket(): Socket {
  if (socket?.connected) return socket;

  const token = useAuthStore.getState().token;

  socket = io(SOCKET_URL, {
    auth: { token },
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionDelay: 1000,
    reconnectionAttempts: 10,
  });

  socket.on('connect', () => {
    console.log('[Socket] Connected:', socket!.id);
  });

  socket.on('connect_error', (err) => {
    console.error('[Socket] Connection error:', err.message);
  });

  socket.on('disconnect', (reason) => {
    console.log('[Socket] Disconnected:', reason);
  });

  return socket;
}

export function disconnectSocket() {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}

export function joinProject(projectId: string) {
  const user = useAuthStore.getState().user;
  if (!socket || !user) return;

  socket.emit('join:project', {
    userId: user.id,
    userName: user.name,
    projectId,
  });
}

export function leaveProject() {
  if (socket) {
    socket.emit('leave:project');
  }
}

// Element operations
export function emitElementAdd(element: unknown) {
  socket?.emit('element:add', element);
}

export function emitElementUpdate(elementId: string, changes: Record<string, unknown>) {
  socket?.emit('element:update', { elementId, changes });
}

export function emitElementDelete(elementId: string) {
  socket?.emit('element:delete', { elementId });
}

// Connection operations
export function emitConnectionAdd(connection: unknown) {
  socket?.emit('connection:add', connection);
}

export function emitConnectionDelete(connectionId: string) {
  socket?.emit('connection:delete', { connectionId });
}

// Cursor tracking
export function emitCursorMove(position: { x: number; y: number; z: number }) {
  socket?.emit('cursor:move', position);
}

// Chat
export function emitChatMessage(text: string) {
  socket?.emit('chat:message', { text });
}

// Element lock
export function emitElementLock(elementId: string) {
  socket?.emit('element:lock', { elementId });
}

export function emitElementUnlock(elementId: string) {
  socket?.emit('element:unlock', { elementId });
}
