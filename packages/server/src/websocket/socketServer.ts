import { Server as HttpServer } from 'http';
import { Server, Socket } from 'socket.io';
import jwt from 'jsonwebtoken';
import {
  resolveConflict,
  lockElement,
  unlockElement,
  unlockAllForUser,
  getLockedElements,
} from './conflictResolver';

const JWT_SECRET = process.env.JWT_SECRET || 'thearchitect-dev-secret-change-in-production';

interface ConnectedUser {
  userId: string;
  userName: string;
  projectId: string;
  cursor?: { x: number; y: number; z: number };
}

const connectedUsers = new Map<string, ConnectedUser>();

export function initSocketServer(httpServer: HttpServer) {
  const io = new Server(httpServer, {
    cors: {
      origin: process.env.CLIENT_URL || 'http://localhost:3000',
      methods: ['GET', 'POST'],
      credentials: true,
    },
  });

  // Auth middleware for WebSocket
  io.use((socket, next) => {
    const token = socket.handshake.auth?.token;
    if (!token) {
      return next(new Error('Authentication required'));
    }

    try {
      const decoded = jwt.verify(token, JWT_SECRET) as { userId: string; role: string };
      (socket as Socket & { userId?: string; userRole?: string }).userId = decoded.userId;
      (socket as Socket & { userId?: string; userRole?: string }).userRole = decoded.role;
      next();
    } catch {
      next(new Error('Invalid token'));
    }
  });

  io.on('connection', (socket: Socket) => {
    console.log(`[WS] Client connected: ${socket.id}`);

    // Join project room
    socket.on('join:project', (data: { userId: string; userName: string; projectId: string }) => {
      const { userId, userName, projectId } = data;
      const room = `project:${projectId}`;

      socket.join(room);
      connectedUsers.set(socket.id, { userId, userName, projectId });

      // Notify others
      socket.to(room).emit('user:joined', { userId, userName });

      // Send current online users
      const roomUsers = Array.from(connectedUsers.values())
        .filter((u) => u.projectId === projectId);
      io.to(room).emit('users:online', roomUsers);

      // Send current element locks
      socket.emit('locks:state', getLockedElements());

      console.log(`[WS] ${userName} joined project ${projectId}`);
    });

    // Element events with conflict resolution
    socket.on('element:add', (element) => {
      const user = connectedUsers.get(socket.id);
      if (!user) return;
      socket.to(`project:${user.projectId}`).emit('element:add', element);
    });

    socket.on('element:update', (data: { elementId: string; changes: Record<string, unknown>; version?: number }) => {
      const user = connectedUsers.get(socket.id);
      if (!user) return;

      const result = resolveConflict(data.elementId, user.userId, data.changes, data.version);
      const room = `project:${user.projectId}`;

      if (result.accepted) {
        io.to(room).emit('element:update', {
          elementId: data.elementId,
          changes: result.resolvedChanges,
          version: result.newVersion,
          userId: user.userId,
        });

        if (result.conflict) {
          socket.emit('element:conflict', {
            elementId: data.elementId,
            conflicts: result.conflict,
            resolution: 'last_writer_wins',
          });
        }
      }
    });

    socket.on('element:delete', (data: { elementId: string }) => {
      const user = connectedUsers.get(socket.id);
      if (!user) return;
      const room = `project:${user.projectId}`;
      unlockElement(data.elementId, user.userId);
      socket.to(room).emit('element:delete', data);
    });

    // Element locking
    socket.on('element:lock', (data: { elementId: string }) => {
      const user = connectedUsers.get(socket.id);
      if (!user) return;

      const result = lockElement(data.elementId, user.userId, user.userName);
      if (result.success) {
        io.to(`project:${user.projectId}`).emit('element:locked', {
          elementId: data.elementId,
          userId: user.userId,
          userName: user.userName,
        });
      } else {
        socket.emit('element:lock_denied', {
          elementId: data.elementId,
          lockedBy: result.lockedBy,
        });
      }
    });

    socket.on('element:unlock', (data: { elementId: string }) => {
      const user = connectedUsers.get(socket.id);
      if (!user) return;

      if (unlockElement(data.elementId, user.userId)) {
        io.to(`project:${user.projectId}`).emit('element:unlocked', {
          elementId: data.elementId,
        });
      }
    });

    // Connection events
    socket.on('connection:add', (connection) => {
      const user = connectedUsers.get(socket.id);
      if (!user) return;
      socket.to(`project:${user.projectId}`).emit('connection:add', connection);
    });

    socket.on('connection:delete', (data: { connectionId: string }) => {
      const user = connectedUsers.get(socket.id);
      if (!user) return;
      socket.to(`project:${user.projectId}`).emit('connection:delete', data);
    });

    // Cursor tracking
    socket.on('cursor:move', (position: { x: number; y: number; z: number }) => {
      const user = connectedUsers.get(socket.id);
      if (!user) return;
      user.cursor = position;
      socket.to(`project:${user.projectId}`).emit('cursor:move', {
        userId: user.userId,
        userName: user.userName,
        position,
      });
    });

    // Chat
    socket.on('chat:message', (data: { text: string }) => {
      const user = connectedUsers.get(socket.id);
      if (!user) return;
      io.to(`project:${user.projectId}`).emit('chat:message', {
        userId: user.userId,
        userName: user.userName,
        text: data.text,
        timestamp: new Date().toISOString(),
      });
    });

    // Disconnect
    socket.on('disconnect', () => {
      const user = connectedUsers.get(socket.id);
      if (user) {
        const room = `project:${user.projectId}`;

        // Release all locks held by this user
        const unlockedElements = unlockAllForUser(user.userId);
        for (const elementId of unlockedElements) {
          io.to(room).emit('element:unlocked', { elementId });
        }

        socket.to(room).emit('user:left', { userId: user.userId, userName: user.userName });
        connectedUsers.delete(socket.id);

        const roomUsers = Array.from(connectedUsers.values())
          .filter((u) => u.projectId === user.projectId);
        io.to(room).emit('users:online', roomUsers);

        console.log(`[WS] ${user.userName} left project ${user.projectId}`);
      }
    });
  });

  console.log('[WebSocket] Server initialized');
  return io;
}
