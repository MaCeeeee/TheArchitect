/**
 * Echtzeit-Kanal: Mandantentrennung und Sitzungs-Widerruf (Folgebefund zum
 * Security-Audit, beim Review von H1 gefunden).
 *
 * `join:project` nahm `projectId`, `userId` und `userName` ungeprüft aus dem
 * Payload. Jeder angemeldete Nutzer konnte so die Element-, Lock- und
 * Presence-Events JEDES Projekts mithören, eigene hineinschicken und sich als
 * jemand anderes ausgeben. `locks:state` lieferte die Locks aller Projekte.
 * Und die Socket-Auth prüfte keine Sitzung: ein abgemeldetes Gerät blieb
 * verbunden.
 *
 * Hier laufen ein echter Socket.IO-Server und echte Clients; nur Mongo und
 * Redis sind gedoublet.
 */
import http from 'http';
import { AddressInfo } from 'net';
import { io as connect, Socket as ClientSocket } from 'socket.io-client';

const OWNER = '507f1f77bcf86cd799439011';
const EDITOR = '507f1f77bcf86cd799439022';
const VIEWER = '507f1f77bcf86cd799439033';
const STRANGER = '507f1f77bcf86cd799439044';
const CHIEF = '507f1f77bcf86cd799439055';

const USERS: Record<string, { _id: string; name: string; role: string }> = {
  [OWNER]: { _id: OWNER, name: 'Olga Owner', role: 'enterprise_architect' },
  [EDITOR]: { _id: EDITOR, name: 'Ed Editor', role: 'enterprise_architect' },
  [VIEWER]: { _id: VIEWER, name: 'Vic Viewer', role: 'enterprise_architect' },
  [STRANGER]: { _id: STRANGER, name: 'Stan Stranger', role: 'enterprise_architect' },
  [CHIEF]: { _id: CHIEF, name: 'Chief', role: 'chief_architect' },
};
const PROJECTS: Record<string, unknown> = {
  'p-victim': {
    _id: 'p-victim',
    ownerId: { toString: () => OWNER },
    collaborators: [
      { userId: { toString: () => EDITOR }, role: 'editor' },
      { userId: { toString: () => VIEWER }, role: 'viewer' },
    ],
  },
  'p-stranger': { _id: 'p-stranger', ownerId: { toString: () => STRANGER }, collaborators: [] },
};

const mockRedis = new Map<string, string>();
jest.mock('../config/redis', () => ({
  getRedis: () => ({
    get: async (k: string) => mockRedis.get(k) ?? null,
    set: async (k: string, v: string) => (mockRedis.set(k, v), 'OK'),
    del: async (...keys: string[]) => keys.filter((k) => mockRedis.delete(k)).length,
    keys: async (pattern: string) => [...mockRedis.keys()].filter((k) => k.startsWith(pattern.replace('*', ''))),
  }),
}));
jest.mock('../models/User', () => ({
  User: { findById: (id: string) => ({ select: async () => USERS[id] ?? null }) },
}));
jest.mock('../models/ApiKey', () => ({ ApiKey: {} }));
jest.mock('../models/Project', () => ({
  Project: { findById: (id: string) => ({ select: async () => PROJECTS[id] ?? null, then: (ok: (v: unknown) => unknown) => Promise.resolve(PROJECTS[id] ?? null).then(ok) }) },
}));

import { initSocketServer } from '../websocket/socketServer';
import { generateAccessToken } from '../middleware/auth.middleware';
import { getRedis } from '../config/redis';
import { createSession, revokeAllSessions, revokeSession } from '../services/session.service';

let server: http.Server;
let url = '';
const clients: ClientSocket[] = [];

beforeAll(async () => {
  server = http.createServer();
  initSocketServer(server);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});
afterEach(() => {
  while (clients.length) clients.pop()!.disconnect();
});

async function tokenFor(userId: string): Promise<{ token: string; sid: string }> {
  const sid = await createSession(getRedis() as never, userId, { device: 'test', ip: '' });
  return { token: generateAccessToken(userId, USERS[userId].role, sid), sid };
}

function open(token: string): Promise<ClientSocket> {
  return new Promise((resolve, reject) => {
    const c = connect(url, { auth: { token }, transports: ['websocket'], reconnection: false, forceNew: true });
    clients.push(c);
    c.on('connect', () => resolve(c));
    c.on('connect_error', reject);
  });
}

/** Sammelt alle Events eines Clients. */
function record(c: ClientSocket): Array<[string, unknown]> {
  const seen: Array<[string, unknown]> = [];
  c.onAny((event, payload) => seen.push([event, payload]));
  return seen;
}

const settle = (ms = 150) => new Promise((r) => setTimeout(r, ms));

async function joined(userId: string, projectId: string, payload: Record<string, unknown> = {}) {
  const { token, sid } = await tokenFor(userId);
  const c = await open(token);
  const seen = record(c);
  c.emit('join:project', { projectId, ...payload });
  await settle();
  return { c, seen, sid };
}

describe('Socket.IO — Projekt-Mitgliedschaft', () => {
  it('a non-member cannot listen in on another tenant’s project — der ganze Zweck', async () => {
    const owner = await joined(OWNER, 'p-victim');
    const stranger = await joined(STRANGER, 'p-victim');
    owner.c.emit('element:add', { id: 'secret-element', name: 'Kronjuwel' });
    await settle();
    expect(JSON.stringify(stranger.seen)).not.toContain('Kronjuwel');
    expect(stranger.seen.map(([e]) => e)).toContain('join:denied');
  });

  it('a non-member cannot inject events into another tenant’s project', async () => {
    const owner = await joined(OWNER, 'p-victim');
    const stranger = await joined(STRANGER, 'p-victim');
    stranger.c.emit('element:add', { id: 'x', name: 'Eingeschleust' });
    stranger.c.emit('chat:message', { text: 'Eingeschleust' });
    await settle();
    expect(JSON.stringify(owner.seen)).not.toContain('Eingeschleust');
  });

  it('members see each other’s edits; editors may write', async () => {
    const owner = await joined(OWNER, 'p-victim');
    const editor = await joined(EDITOR, 'p-victim');
    editor.c.emit('element:add', { id: 'e1', name: 'Neues Element' });
    await settle();
    expect(JSON.stringify(owner.seen)).toContain('Neues Element');
  });

  it('a project viewer receives events but cannot write into the model', async () => {
    const owner = await joined(OWNER, 'p-victim');
    const viewer = await joined(VIEWER, 'p-victim');
    viewer.c.emit('element:add', { id: 'v1', name: 'Viewer-Schreibversuch' });
    viewer.c.emit('element:delete', { elementId: 'e1' });
    await settle();
    expect(JSON.stringify(owner.seen)).not.toContain('Viewer-Schreibversuch');
    expect(owner.seen.map(([e]) => e)).not.toContain('element:delete');
    owner.c.emit('element:add', { id: 'o1', name: 'Vom Owner' });
    await settle();
    expect(JSON.stringify(viewer.seen)).toContain('Vom Owner');
  });

  it('identity comes from the token, never from the payload', async () => {
    const owner = await joined(OWNER, 'p-victim');
    await joined(EDITOR, 'p-victim', { userId: OWNER, userName: 'Olga Owner (fake)' });
    const joinedEvents = owner.seen.filter(([e]) => e === 'user:joined').map(([, p]) => p);
    expect(joinedEvents).toContainEqual({ userId: EDITOR, userName: 'Ed Editor' });
    expect(JSON.stringify(owner.seen)).not.toContain('(fake)');
  });

  it('locks:state only carries locks of the joined project', async () => {
    const stranger = await joined(STRANGER, 'p-stranger');
    stranger.c.emit('element:lock', { elementId: 'stranger-el' });
    await settle();
    const editor = await joined(EDITOR, 'p-victim');
    const state = editor.seen.find(([e]) => e === 'locks:state')?.[1] as Array<{ elementId: string }>;
    expect(state.map((l) => l.elementId)).not.toContain('stranger-el');
  });

  it('switching projects leaves the old room', async () => {
    const owner = await joined(OWNER, 'p-victim');
    const editor = await joined(EDITOR, 'p-victim');
    editor.c.emit('leave:project');
    await settle();
    owner.c.emit('element:add', { id: 'after-leave', name: 'Nach dem Verlassen' });
    await settle();
    expect(JSON.stringify(editor.seen)).not.toContain('Nach dem Verlassen');
  });

  it('the platform admin may join any project', async () => {
    const owner = await joined(OWNER, 'p-victim');
    const chief = await joined(CHIEF, 'p-victim');
    owner.c.emit('element:add', { id: 'c1', name: 'Für den Admin sichtbar' });
    await settle();
    expect(JSON.stringify(chief.seen)).toContain('Für den Admin sichtbar');
  });
});

describe('Socket.IO — Sitzungs-Widerruf', () => {
  it('refuses the handshake for a revoked session', async () => {
    const { token, sid } = await tokenFor(EDITOR);
    await revokeSession(getRedis() as never, EDITOR, sid);
    await expect(open(token)).rejects.toThrow();
  });

  it('disconnects a live socket when its session is revoked', async () => {
    const editor = await joined(EDITOR, 'p-victim');
    expect(editor.c.connected).toBe(true);
    await revokeSession(getRedis() as never, EDITOR, editor.sid);
    await settle();
    expect(editor.c.connected).toBe(false);
  });

  it('"log out other devices" disconnects only the other sockets', async () => {
    const here = await joined(EDITOR, 'p-victim');
    const elsewhere = await joined(EDITOR, 'p-victim');
    await revokeAllSessions(getRedis() as never, EDITOR, here.sid);
    await settle();
    expect(here.c.connected).toBe(true);
    expect(elsewhere.c.connected).toBe(false);
  });
});
