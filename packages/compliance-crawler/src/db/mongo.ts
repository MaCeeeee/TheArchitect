import mongoose from 'mongoose';
import { safeErrorMessage } from '@thearchitect/shared';
import { config } from '../config';

/**
 * MongoDB connection management for the crawler (Server B → dedicated corpus Mongo, ADR-0001).
 *
 * Hardened against connection drops: when Server A's MongoDB is redeployed/restarted
 * (which happens on every Server A deploy), the connection goes to readyState 0. The
 * previous implementation used a sticky `isConnected = true` flag that was never reset,
 * so the service reported a phantom-connected state and never reconnected — staying
 * `degraded` indefinitely. We now derive state purely from `mongoose.connection.readyState`
 * and drive an automatic background reconnect loop off the driver's lifecycle events.
 */

const MONGO_OPTIONS = {
  serverSelectionTimeoutMS: 5000,
  maxPoolSize: 5,
};

const RECONNECT_DELAY_MS = 5000;

type MinimalLogger = {
  info: (obj: unknown, msg?: string) => void;
  warn: (obj: unknown, msg?: string) => void;
  error: (obj: unknown, msg?: string) => void;
};

const consoleLogger: MinimalLogger = {
  info: (o, m) => console.info(m ?? '', o ?? ''),
  warn: (o, m) => console.warn(m ?? '', o ?? ''),
  error: (o, m) => console.error(m ?? '', o ?? ''),
};

let logger: MinimalLogger = consoleLogger;
let listenersBound = false;
let shuttingDown = false;
let reconnectTimer: NodeJS.Timeout | null = null;

/** Inject the Fastify/pino logger so reconnect events show up in the service logs. */
export function setMongoLogger(l: MinimalLogger): void {
  logger = l;
}

function scheduleReconnect(): void {
  if (reconnectTimer || shuttingDown) return;
  reconnectTimer = setTimeout(async () => {
    reconnectTimer = null;
    if (shuttingDown || mongoose.connection.readyState === 1) return;
    try {
      await mongoose.connect(config.MONGODB_URI, MONGO_OPTIONS);
    } catch (err) {
      logger.warn({ err: safeErrorMessage(err) }, 'Mongo reconnect attempt failed; will retry');
      scheduleReconnect();
    }
  }, RECONNECT_DELAY_MS);
  // Don't let the reconnect timer keep the event loop (and thus the process) alive.
  if (typeof reconnectTimer.unref === 'function') reconnectTimer.unref();
}

function bindListeners(): void {
  if (listenersBound) return;
  listenersBound = true;
  mongoose.connection.on('connected', () => logger.info({}, 'Mongo connected'));
  mongoose.connection.on('reconnected', () => logger.info({}, 'Mongo reconnected'));
  mongoose.connection.on('error', (err) => logger.error({ err: safeErrorMessage(err) }, 'Mongo connection error'));
  mongoose.connection.on('disconnected', () => {
    if (shuttingDown) return;
    logger.warn({}, 'Mongo disconnected — scheduling reconnect');
    scheduleReconnect();
  });
}

export async function connectMongo(): Promise<void> {
  shuttingDown = false;
  bindListeners();
  if (mongoose.connection.readyState === 1) return;
  try {
    await mongoose.connect(config.MONGODB_URI, MONGO_OPTIONS);
  } catch (err) {
    // Initial connect failed: keep the process up and retry in the background so a
    // transient Server A / Tailscale outage at boot doesn't require a manual redeploy.
    scheduleReconnect();
    throw err;
  }
}

export async function disconnectMongo(): Promise<void> {
  shuttingDown = true;
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  if (mongoose.connection.readyState === 0) return;
  await mongoose.disconnect();
}

export function mongoConnectionState(): { connected: boolean; readyState: number } {
  return {
    connected: mongoose.connection.readyState === 1,
    readyState: mongoose.connection.readyState,
  };
}
