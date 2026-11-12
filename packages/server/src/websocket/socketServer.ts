import { Server as HttpServer } from 'http';
import { Server, Socket } from 'socket.io';
import { isPlatformAdmin } from '@thearchitect/shared';
import { verifyAccessToken } from '../middleware/auth.middleware';
import { hasProjectRole, projectRoleOf } from '../middleware/projectAccess.middleware';
import { getRedis } from '../config/redis';
import { isSessionActive, sessionEvents, type SessionRevocation } from '../services/session.service';
import { User } from '../models/User';
import { Project } from '../models/Project';
import {
  resolveConflict,
  lockElement,
  unlockElement,
  unlockAllForUser,
  getLockedElements,
} from './conflictResolver';

// Security (Folgebefund zum Audit): `join:project` nahm projectId, userId und
// userName ungeprüft aus dem Payload — jeder angemeldete Nutzer konnte jedes
// Projekt mithören, hineinschreiben und sich als jemand anderes ausgeben, und
// ein widerrufener Login blieb verbunden. Jetzt gilt:
//  - Identität kommt aus Token + DB (socket.data), nie aus dem Payload;
//  - Beitritt nur mit Projektzugriff (dieselbe Regel wie requireProjectAccess);
//  - Modell-Events (Elemente, Verbindungen, Locks) erst ab Projektrolle editor;
//  - der Handshake prüft die Sitzung, und ein Widerruf trennt laufende Sockets.

interface SocketIdentity {
  userId: string;
  userName: string;
  role: string;
  sid?: string;
}

interface ConnectedUser {
  userId: string;
  userName: string;
  projectId: string;
  projectRole: string;
  cursor?: { x: number; y: number; z: number };
}

const connectedUsers = new Map<string, ConnectedUser>();

let ioInstance: Server | null = null;

export function getIO(): Server {
  if (!ioInstance) throw new Error('Socket.IO not initialized — call initSocketServer() first');
  return ioInstance;
}

function identityOf(socket: Socket): SocketIdentity {
  return socket.data as SocketIdentity;
}

/** Projektrolle für den Socket — Plattform-Admins haben implizit vollen Zugriff. */
async function resolveProjectRole(identity: SocketIdentity, projectId: string): Promise<string | null> {
  if (isPlatformAdmin(identity.role)) return 'owner';
  const project = await Project.findById(projectId).select('ownerId collaborators');
  return project ? projectRoleOf(project, identity.userId) : null;
}

function onlineIn(projectId: string): Array<Omit<ConnectedUser, 'projectRole'>> {
  return Array.from(connectedUsers.values())
    .filter((u) => u.projectId === projectId)
    .map(({ projectRole: _role, ...u }) => u);
}

export function initSocketServer(httpServer: HttpServer) {
  const io = new Server(httpServer, {
    cors: {
      origin: process.env.CLIENT_URL || 'http://localhost:3000',
      methods: ['GET', 'POST'],
      credentials: true,
    },
  });

  // Auth middleware for WebSocket: Token, Sitzung, Nutzer
  io.use(async (socket, next) => {
    const token = socket.handshake.auth?.token;
    if (!token) {
      return next(new Error('Authentication required'));
    }

    let decoded: { userId: string; role: string; sid?: string };
    try {
      decoded = verifyAccessToken(token);
    } catch {
      return next(new Error('Invalid token'));
    }

    try {
      // Wie in `authenticate`: Tokens mit sid brauchen eine lebende Sitzung
      // (fail-open bei Redis-Ausfall, siehe session.service).
      if (decoded.sid && !(await isSessionActive(getRedis(), decoded.userId, decoded.sid))) {
        return next(new Error('Session revoked'));
      }
      const user = await User.findById(decoded.userId).select('name role');
      if (!user) return next(new Error('User not found'));
      const identity: SocketIdentity = {
        userId: String(user._id),
        userName: user.name,
        role: user.role,
        sid: decoded.sid,
      };
      socket.data = identity;
      next();
    } catch {
      next(new Error('Authentication error'));
    }
  });

  // Widerruf einer Sitzung trennt die zugehörigen Sockets sofort.
  const onRevoked = ({ userId, sessionId, keepSessionId }: SessionRevocation) => {
    for (const socket of io.of('/').sockets.values()) {
      const identity = identityOf(socket);
      if (identity?.userId !== userId) continue;
      const hit = sessionId ? identity.sid === sessionId : !keepSessionId || identity.sid !== keepSessionId;
      if (hit) socket.disconnect(true);
    }
  };
  sessionEvents.on('revoked', onRevoked); // initSocketServer läuft einmal pro Prozess

  io.on('connection', (socket: Socket) => {
    console.log(`[WS] Client connected: ${socket.id}`);
    const identity = identityOf(socket);

    /** Nur für Mitglieder mit mindestens `minRole` im aktuell betretenen Projekt. */
    const member = (minRole = 'viewer'): ConnectedUser | null => {
      const user = connectedUsers.get(socket.id);
      return user && hasProjectRole(user.projectRole, minRole) ? user : null;
    };

    const leaveCurrentProject = () => {
      const user = connectedUsers.get(socket.id);
      if (!user) return;
      const room = `project:${user.projectId}`;
      for (const elementId of unlockAllForUser(user.projectId, user.userId)) {
        io.to(room).emit('element:unlocked', { elementId });
      }
      socket.leave(room);
      connectedUsers.delete(socket.id);
      socket.to(room).emit('user:left', { userId: user.userId, userName: user.userName });
      io.to(room).emit('users:online', onlineIn(user.projectId));
      console.log(`[WS] ${user.userName} left project ${user.projectId}`);
    };

    // Join project room — userId/userName im Payload werden ignoriert
    socket.on('join:project', async (data: { projectId?: unknown }) => {
      const projectId = typeof data?.projectId === 'string' ? data.projectId : '';
      let projectRole: string | null = null;
      try {
        projectRole = projectId ? await resolveProjectRole(identity, projectId) : null;
      } catch {
        projectRole = null; // ungültige Id o. Ä. — wie kein Zugriff behandeln
      }
      if (!projectRole) {
        socket.emit('join:denied', { projectId });
        return;
      }

      leaveCurrentProject();
      const room = `project:${projectId}`;
      socket.join(room);
      connectedUsers.set(socket.id, { userId: identity.userId, userName: identity.userName, projectId, projectRole });

      // Notify others
      socket.to(room).emit('user:joined', { userId: identity.userId, userName: identity.userName });

      // Send current online users
      io.to(room).emit('users:online', onlineIn(projectId));

      // Send current element locks — nur die dieses Projekts
      socket.emit('locks:state', getLockedElements(projectId));

      console.log(`[WS] ${identity.userName} joined project ${projectId}`);
    });

    socket.on('leave:project', leaveCurrentProject);

    // Element events with conflict resolution — Modell-Änderungen ab editor
    socket.on('element:add', (element) => {
      const user = member('editor');
      if (!user) return;
      socket.to(`project:${user.projectId}`).emit('element:add', element);
    });

    socket.on('element:update', (data: { elementId: string; changes: Record<string, unknown>; version?: number }) => {
      const user = member('editor');
      if (!user) return;

      const result = resolveConflict(user.projectId, data.elementId, user.userId, data.changes, data.version);
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
      const user = member('editor');
      if (!user) return;
      const room = `project:${user.projectId}`;
      unlockElement(user.projectId, data.elementId, user.userId);
      socket.to(room).emit('element:delete', data);
    });

    // Element locking
    socket.on('element:lock', (data: { elementId: string }) => {
      const user = member('editor');
      if (!user) return;

      const result = lockElement(user.projectId, data.elementId, user.userId, user.userName);
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
      const user = member('editor');
      if (!user) return;

      if (unlockElement(user.projectId, data.elementId, user.userId)) {
        io.to(`project:${user.projectId}`).emit('element:unlocked', {
          elementId: data.elementId,
        });
      }
    });

    // Connection events
    socket.on('connection:add', (connection) => {
      const user = member('editor');
      if (!user) return;
      socket.to(`project:${user.projectId}`).emit('connection:add', connection);
    });

    socket.on('connection:delete', (data: { connectionId: string }) => {
      const user = member('editor');
      if (!user) return;
      socket.to(`project:${user.projectId}`).emit('connection:delete', data);
    });

    // Cursor tracking — Präsenz, für alle Mitglieder
    socket.on('cursor:move', (position: { x: number; y: number; z: number }) => {
      const user = member();
      if (!user) return;
      user.cursor = position;
      socket.to(`project:${user.projectId}`).emit('cursor:move', {
        userId: user.userId,
        userName: user.userName,
        position,
      });
    });

    // Chat — für alle Mitglieder
    socket.on('chat:message', (data: { text: string }) => {
      const user = member();
      if (!user) return;
      io.to(`project:${user.projectId}`).emit('chat:message', {
        userId: user.userId,
        userName: user.userName,
        text: data.text,
        timestamp: new Date().toISOString(),
      });
    });

    // Disconnect
    socket.on('disconnect', leaveCurrentProject);
  });

  ioInstance = io;
  console.log('[WebSocket] Server initialized');
  return io;
}
