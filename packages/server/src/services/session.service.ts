/**
 * session.service — Sitzungen in Redis, endlich mit Schreibseite (THE-535).
 *
 * ── DER BEFUND ──
 *
 * Die Leseseite existierte längst: `settings.routes.ts` listete
 * `session:{userId}:*` und löschte einzelne Schlüssel. Nur schrieb sie
 * NIEMAND. Die Sicherheits-Ansicht war strukturell leer, und „alle Sitzungen
 * abmelden" bestätigte einen Widerruf, der nie stattfand — das gefährlichste
 * an dem Bug war nicht das fehlende Feature, sondern das falsche Versprechen.
 *
 * ── ZWEI ENTSCHEIDUNGEN, DIE MAN KENNEN MUSS ──
 *
 * 1. **Sitzungen sind eine Widerrufs-Möglichkeit, kein Anmelde-Gate.**
 *    Fällt Redis aus, läuft Login weiter (createSession wirft nie) und die
 *    Prüfung FAILT OPEN: ein Redis-Ausfall darf nicht jeden Nutzer
 *    aussperren. Preis, offen ausgewiesen: während eines Ausfalls wirkt ein
 *    Widerruf nicht sofort, sondern erst mit Token-Ablauf (max. 15 min) —
 *    exakt das Verhalten von VOR diesem Ticket.
 *
 * 2. **Die Session-Id ist zufällig, nicht der JWT-Zeitstempel.** Die alte
 *    Leseseite verglich gegen `iat` (Sekunden!) — zwei Anmeldungen in
 *    derselben Sekunde wären dieselbe Sitzung. Die Id wandert als `sid` ins
 *    Access-Token, damit Middleware und „current"-Markierung sie kennen.
 *
 * Kein Token im Record: der Session-Eintrag ist Metadatum (Gerät, IP,
 * zuletzt aktiv), kein Credential-Speicher.
 *
 * Linear: THE-535 · Muster: CLAUDE.md „Sessions: session:{userId}:{sessionId}"
 */
import crypto from 'crypto';

/** 7 Tage — die Lebensdauer des Refresh-Tokens. Länger lebt keine Anmeldung. */
export const SESSION_TTL_SECONDS = 7 * 24 * 60 * 60;

/** Der Ausschnitt des Redis-Clients, den dieser Dienst braucht (Test: Doppel). */
export interface SessionStore {
  set(key: string, value: string, mode: 'EX', ttl: number): Promise<unknown>;
  get(key: string): Promise<string | null>;
  keys(pattern: string): Promise<string[]>;
  del(...keys: string[]): Promise<number>;
}

export interface SessionRecord {
  device: string;
  ip: string;
  createdAt: string;
  lastActive: string;
}

export interface SessionView {
  id: string;
  device: string;
  ip: string;
  lastActive: string;
  current: boolean;
}

export function newSessionId(): string {
  return crypto.randomBytes(16).toString('hex');
}

export function sessionKey(userId: string, sessionId: string): string {
  return `session:${userId}:${sessionId}`;
}

/**
 * Legt die Sitzung an. WIRFT NIE — Login darf an Redis nicht scheitern.
 * Gibt die Session-Id zurück; sie gehört als `sid` ins Access-Token.
 */
export async function createSession(
  redis: SessionStore,
  userId: string,
  meta: { device: string; ip: string },
): Promise<string> {
  const sid = newSessionId();
  const now = new Date().toISOString();
  const record: SessionRecord = {
    device: meta.device || 'Unknown',
    ip: meta.ip || '',
    createdAt: now,
    lastActive: now,
  };
  try {
    await redis.set(sessionKey(userId, sid), JSON.stringify(record), 'EX', SESSION_TTL_SECONDS);
  } catch {
    // Redis down → Sitzung nicht auffuehrbar/widerrufbar, aber Login läuft.
    // Das ist der Zustand von vor THE-535 — als Ausnahme, nicht als Regel.
  }
  return sid;
}

/** Aktualisiert `lastActive` und erneuert die TTL. Belebt Widerrufenes nicht wieder. */
export async function touchSession(redis: SessionStore, userId: string, sessionId: string): Promise<void> {
  try {
    const raw = await redis.get(sessionKey(userId, sessionId));
    if (!raw) return; // widerrufen oder abgelaufen — bleibt so
    const record = JSON.parse(raw) as SessionRecord;
    record.lastActive = new Date().toISOString();
    await redis.set(sessionKey(userId, sessionId), JSON.stringify(record), 'EX', SESSION_TTL_SECONDS);
  } catch {
    // best effort — „zuletzt aktiv" ist Komfort, kein Sicherheitsanker
  }
}

/** Die Sitzungen EINES Nutzers. Unlesbare Einträge werden übersprungen, nie geworfen. */
export async function listSessions(
  redis: SessionStore,
  userId: string,
  currentSessionId?: string,
): Promise<SessionView[]> {
  try {
    const keys = await redis.keys(`session:${userId}:*`);
    const out: SessionView[] = [];
    for (const key of keys) {
      const raw = await redis.get(key);
      if (!raw) continue;
      try {
        const record = JSON.parse(raw) as SessionRecord;
        const id = key.split(':').pop() ?? '';
        out.push({
          id,
          device: record.device || 'Unknown',
          ip: record.ip || '',
          lastActive: record.lastActive || record.createdAt,
          current: id === currentSessionId,
        });
      } catch {
        // kaputter Eintrag → überspringen, die Ansicht bleibt nutzbar
      }
    }
    return out;
  } catch {
    return [];
  }
}

/** Widerruft EINE Sitzung. `false`, wenn es sie nicht gab — keine falsche Bestätigung. */
export async function revokeSession(redis: SessionStore, userId: string, sessionId: string): Promise<boolean> {
  try {
    return (await redis.del(sessionKey(userId, sessionId))) > 0;
  } catch {
    return false;
  }
}

/**
 * Widerruft ALLE Sitzungen des Nutzers — optional außer der aktuellen
 * („die anderen Geräte abmelden"). Gibt die Anzahl zurück.
 */
export async function revokeAllSessions(
  redis: SessionStore,
  userId: string,
  keepSessionId?: string,
): Promise<number> {
  try {
    const keys = await redis.keys(`session:${userId}:*`);
    const toDelete = keepSessionId ? keys.filter((k) => k !== sessionKey(userId, keepSessionId)) : keys;
    if (toDelete.length === 0) return 0;
    return await redis.del(...toDelete);
  } catch {
    return 0;
  }
}

/**
 * Lebt diese Sitzung noch? FAILT OPEN bei Redis-Ausfall (Begründung im Kopf):
 * Verfügbarkeit vor Sofort-Widerruf; der Rückfall ist das Vor-THE-535-Verhalten.
 */
export async function isSessionActive(redis: SessionStore, userId: string, sessionId: string): Promise<boolean> {
  try {
    return (await redis.get(sessionKey(userId, sessionId))) !== null;
  } catch {
    return true;
  }
}
