/**
 * Tests für die Sitzungs-Verwaltung (THE-535, SECURITY/DSGVO).
 *
 * DER BEFUND: Im gesamten Server schrieb NICHTS einen
 * `session:{userId}:{sessionId}`-Schlüssel. Gelesen und gelöscht wurde
 * dagegen sehr wohl — die Sicherheits-Ansicht war strukturell leer, und
 * „alle Sitzungen abmelden" löschte nichts, weil es nichts zu löschen gab.
 *
 * Ein Nutzer, der nach Geräteverlust „überall abmelden" klickt, bekam eine
 * Bestätigung, ohne dass irgendetwas geschah. Das ist die gefährlichste Art
 * Fehler: nicht ein fehlendes Feature, sondern ein **falsches Versprechen**.
 *
 * ── EIN ZWEITER DEFEKT AUF DER LESESEITE ──
 *
 * `settings.routes.ts` bestimmte die aktuelle Sitzung über
 * `sessionId === jwtPayload.iat` — der JWT-Zeitstempel in SEKUNDEN. Zwei
 * Anmeldungen in derselben Sekunde bekämen dieselbe Id. Die Sitzung braucht
 * eine eigene, zufällige Kennung (`sid`) im Token.
 */
import {
  SESSION_TTL_SECONDS,
  newSessionId,
  sessionKey,
  createSession,
  touchSession,
  listSessions,
  revokeSession,
  revokeAllSessions,
  isSessionActive,
  type SessionStore,
} from '../services/session.service';

/** Redis-Doppel: nur die vier benutzten Operationen, mit sichtbarer TTL. */
function fakeRedis(): SessionStore & { store: Map<string, { value: string; ttl: number }> } {
  const store = new Map<string, { value: string; ttl: number }>();
  return {
    store,
    async set(key, value, _mode, ttl) {
      store.set(key, { value, ttl });
      return 'OK';
    },
    async get(key) {
      return store.get(key)?.value ?? null;
    },
    async keys(pattern) {
      const re = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$');
      return [...store.keys()].filter((k) => re.test(k));
    },
    async del(...keys: string[]) {
      let n = 0;
      for (const k of keys) if (store.delete(k)) n += 1;
      return n;
    },
  };
}

const USER = '507f1f77bcf86cd799439011';

describe('newSessionId — der zweite Defekt: iat als Id kollidiert', () => {
  it('is random, not a timestamp — two calls in the same second differ', () => {
    const a = newSessionId();
    const b = newSessionId();
    expect(a).not.toBe(b);
    expect(a).toMatch(/^[0-9a-f]{32}$/);
  });
});

describe('sessionKey', () => {
  it('matches the pattern the read side already expects', () => {
    expect(sessionKey(USER, 'abc')).toBe(`session:${USER}:abc`);
  });
});

describe('createSession', () => {
  it('writes a record the read side can parse, with a TTL', async () => {
    const redis = fakeRedis();
    const sid = await createSession(redis, USER, { device: 'Chrome auf macOS', ip: '203.0.113.7' });
    const entry = redis.store.get(sessionKey(USER, sid))!;
    expect(entry.ttl).toBe(SESSION_TTL_SECONDS);
    const parsed = JSON.parse(entry.value);
    expect(parsed.device).toBe('Chrome auf macOS');
    expect(parsed.ip).toBe('203.0.113.7');
    expect(parsed.createdAt).toBeTruthy();
    expect(parsed.lastActive).toBeTruthy();
  });

  it('does NOT store the token — a session record is metadata, not a credential', async () => {
    const redis = fakeRedis();
    const sid = await createSession(redis, USER, { device: 'x', ip: '1.2.3.4' });
    expect(redis.store.get(sessionKey(USER, sid))!.value).not.toMatch(/eyJ|Bearer|token/i);
  });

  it('survives a Redis outage without breaking the login', async () => {
    // Eine Sitzung ist eine WIDERRUFS-Moeglichkeit, kein Anmelde-Gate. Faellt
    // Redis aus, darf sich niemand deshalb nicht mehr anmelden koennen.
    const broken: SessionStore = {
      set: async () => { throw new Error('redis down'); },
      get: async () => { throw new Error('redis down'); },
      keys: async () => { throw new Error('redis down'); },
      del: async () => { throw new Error('redis down'); },
    };
    await expect(createSession(broken, USER, { device: 'x', ip: '' })).resolves.toMatch(/^[0-9a-f]{32}$/);
  });
});

describe('listSessions', () => {
  it('returns the sessions of THIS user only', async () => {
    const redis = fakeRedis();
    const mine = await createSession(redis, USER, { device: 'A', ip: '' });
    await createSession(redis, 'someone-else', { device: 'B', ip: '' });
    const list = await listSessions(redis, USER);
    expect(list.map((s) => s.id)).toEqual([mine]);
  });

  it('marks the current session — via sid, not via a timestamp', async () => {
    const redis = fakeRedis();
    const a = await createSession(redis, USER, { device: 'A', ip: '' });
    const b = await createSession(redis, USER, { device: 'B', ip: '' });
    const list = await listSessions(redis, USER, a);
    expect(list.find((s) => s.id === a)?.current).toBe(true);
    expect(list.find((s) => s.id === b)?.current).toBe(false);
  });

  it('skips unreadable records instead of failing the whole view', async () => {
    const redis = fakeRedis();
    const good = await createSession(redis, USER, { device: 'A', ip: '' });
    redis.store.set(sessionKey(USER, 'kaputt'), { value: '{nicht json', ttl: 1 });
    const list = await listSessions(redis, USER);
    expect(list.map((s) => s.id)).toEqual([good]);
  });

  it('returns [] on a Redis outage — an empty list, never a crash', async () => {
    const broken: SessionStore = {
      set: async () => 'OK',
      get: async () => { throw new Error('down'); },
      keys: async () => { throw new Error('down'); },
      del: async () => 0,
    };
    await expect(listSessions(broken, USER)).resolves.toEqual([]);
  });
});

describe('revokeSession / revokeAllSessions — das Versprechen muss halten', () => {
  it('revokes one session and leaves the others', async () => {
    const redis = fakeRedis();
    const a = await createSession(redis, USER, { device: 'A', ip: '' });
    const b = await createSession(redis, USER, { device: 'B', ip: '' });
    expect(await revokeSession(redis, USER, a)).toBe(true);
    expect((await listSessions(redis, USER)).map((s) => s.id)).toEqual([b]);
  });

  it('reports false for a session that does not exist — no false confirmation', async () => {
    const redis = fakeRedis();
    expect(await revokeSession(redis, USER, 'gibtsnicht')).toBe(false);
  });

  it('revokes ALL sessions of the user — and only of this user', async () => {
    const redis = fakeRedis();
    await createSession(redis, USER, { device: 'A', ip: '' });
    await createSession(redis, USER, { device: 'B', ip: '' });
    const other = await createSession(redis, 'someone-else', { device: 'C', ip: '' });
    expect(await revokeAllSessions(redis, USER)).toBe(2);
    expect(await listSessions(redis, USER)).toEqual([]);
    expect(redis.store.has(sessionKey('someone-else', other))).toBe(true);
  });

  it('keeps the current session when asked to (log out the OTHER devices)', async () => {
    const redis = fakeRedis();
    const keep = await createSession(redis, USER, { device: 'A', ip: '' });
    await createSession(redis, USER, { device: 'B', ip: '' });
    expect(await revokeAllSessions(redis, USER, keep)).toBe(1);
    expect((await listSessions(redis, USER)).map((s) => s.id)).toEqual([keep]);
  });
});

describe('isSessionActive — der Widerruf muss sofort wirken', () => {
  it('is true for a live session, false after revocation', async () => {
    const redis = fakeRedis();
    const sid = await createSession(redis, USER, { device: 'A', ip: '' });
    expect(await isSessionActive(redis, USER, sid)).toBe(true);
    await revokeSession(redis, USER, sid);
    expect(await isSessionActive(redis, USER, sid)).toBe(false);
  });

  it('FAILS OPEN on a Redis outage — availability over immediate revocation', async () => {
    // Bewusste Abwaegung, hier festgehalten: waere die Antwort `false`, sperrte
    // ein Redis-Ausfall JEDEN Nutzer aus. Fail-open faellt auf das Verhalten
    // von VOR diesem Ticket zurueck (Token gilt bis zum Ablauf, max. 15 min) —
    // ein bereits widerrufenes Token lebt waehrend des Ausfalls wieder.
    const broken: SessionStore = {
      set: async () => 'OK',
      get: async () => { throw new Error('down'); },
      keys: async () => [],
      del: async () => 0,
    };
    expect(await isSessionActive(broken, USER, 'irgendwas')).toBe(true);
  });
});

describe('touchSession — „zuletzt aktiv" ohne die TTL zu verlieren', () => {
  it('updates lastActive and renews the TTL', async () => {
    const redis = fakeRedis();
    const sid = await createSession(redis, USER, { device: 'A', ip: '' });
    const before = JSON.parse(redis.store.get(sessionKey(USER, sid))!.value);
    await new Promise((r) => setTimeout(r, 5));
    await touchSession(redis, USER, sid);
    const after = JSON.parse(redis.store.get(sessionKey(USER, sid))!.value);
    expect(new Date(after.lastActive).getTime()).toBeGreaterThanOrEqual(new Date(before.lastActive).getTime());
    expect(after.createdAt).toBe(before.createdAt); // Anlage bleibt Anlage
    expect(redis.store.get(sessionKey(USER, sid))!.ttl).toBe(SESSION_TTL_SECONDS);
  });

  it('does not resurrect a revoked session', async () => {
    const redis = fakeRedis();
    const sid = await createSession(redis, USER, { device: 'A', ip: '' });
    await revokeSession(redis, USER, sid);
    await touchSession(redis, USER, sid);
    expect(await isSessionActive(redis, USER, sid)).toBe(false);
  });
});
