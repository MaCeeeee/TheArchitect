/**
 * Corpus Client (THE-368 / ADR-0002 Leitplanke 2).
 *
 * Encapsulated read/write boundary from the App (Server A) to the canonical
 * regulation corpus (dedicated Mongo instance on Server B, reached via Tailnet).
 * A SEPARATE Mongoose connection — never the app-DB connection — so a later move
 * to a regional replica / own instance is a config change, not a refactor.
 *
 * Corpus is project-independent and keyed by `regulationKey` (ADR-0001).
 *
 * Config: CORPUS_MONGODB_URI (e.g. mongodb://...@<corpus-tailnet>:27017/regulations-corpus?authSource=admin)
 */
import mongoose, { Schema, Connection, Model, Document } from 'mongoose';
import { log } from '../config/logger';

export interface ICorpusRegulation extends Document {
  regulationKey: string;
  versionHash: string;
  source: string;
  jurisdiction: string;
  paragraphNumber: string;
  title: string;
  fullText: string;
  summary?: string;
  sourceUrl: string;
  effectiveFrom: Date;
  language: string;
  version: number;
  crawledAt: Date;
}

export const corpusRegulationSchema = new Schema<ICorpusRegulation>(
  {
    regulationKey: { type: String, required: true },
    versionHash: { type: String, required: true },
    source: { type: String, required: true },
    jurisdiction: { type: String, required: true },
    paragraphNumber: { type: String, required: true },
    title: { type: String, required: true },
    fullText: { type: String, required: true },
    summary: { type: String },
    sourceUrl: { type: String, required: true },
    effectiveFrom: { type: Date, required: true },
    language: { type: String, required: true },
    version: { type: Number, default: 1 },
    crawledAt: { type: Date, default: Date.now },
  },
  { timestamps: true, collection: 'regulations' },
);
corpusRegulationSchema.index({ regulationKey: 1, version: 1 }, { unique: true });

let _connection: Connection | null = null;
let _model: Model<ICorpusRegulation> | null = null;

export function isCorpusConfigured(): boolean {
  return Boolean(process.env.CORPUS_MONGODB_URI);
}

/** Lazily open (and cache) the dedicated corpus connection. Throws if not configured. */
export function getCorpusConnection(): Connection {
  if (!isCorpusConfigured()) {
    throw new Error('corpus not configured — set CORPUS_MONGODB_URI');
  }
  if (!_connection) {
    _connection = mongoose.createConnection(process.env.CORPUS_MONGODB_URI as string, {
      serverSelectionTimeoutMS: 5000,
      maxPoolSize: 5,
    });
    _connection.on('error', err => log.error({ err }, '[corpus] connection error'));
  }
  return _connection;
}

export function CorpusRegulation(): Model<ICorpusRegulation> {
  if (!_model) {
    _model = getCorpusConnection().model<ICorpusRegulation>('Regulation', corpusRegulationSchema);
  }
  return _model;
}

/** Test seam: inject a connection/model (e.g. an in-memory corpus) and reset. */
export function __setCorpusForTests(model: Model<ICorpusRegulation> | null): void {
  _model = model;
}

// ─── Read API ───

export async function getRegulationByKey(key: string): Promise<ICorpusRegulation | null> {
  return CorpusRegulation().findOne({ regulationKey: key }).sort({ version: -1 });
}

export async function getRegulationsByKeys(keys: string[]): Promise<ICorpusRegulation[]> {
  if (keys.length === 0) return [];
  return CorpusRegulation().find({ regulationKey: { $in: keys } });
}

/** Map of regulationKey → current (latest) versionHash. For drift-detection (THE-306/368). */
export async function getCurrentVersionHashes(keys: string[]): Promise<Map<string, string>> {
  const regs = await getRegulationsByKeys([...new Set(keys)]);
  const map = new Map<string, string>();
  for (const r of regs) {
    const existing = map.get(r.regulationKey);
    // keep the highest version's hash if duplicates exist
    if (!existing || (r.version ?? 1) >= 1) map.set(r.regulationKey, r.versionHash);
  }
  return map;
}

// ─── Write API (seed-migration) ───

export async function upsertCorpusRegulation(
  reg: Omit<ICorpusRegulation, keyof Document>,
): Promise<{ inserted: boolean }> {
  const res = await CorpusRegulation().updateOne(
    { regulationKey: reg.regulationKey, version: reg.version ?? 1 },
    { $set: reg },
    { upsert: true, runValidators: true },
  );
  return { inserted: (res.upsertedCount ?? 0) > 0 };
}

export async function corpusHealth(): Promise<{ ok: boolean; count?: number }> {
  if (!isCorpusConfigured()) return { ok: false };
  try {
    const count = await CorpusRegulation().estimatedDocumentCount();
    return { ok: true, count };
  } catch (err) {
    log.warn({ err }, '[corpus] health check failed');
    return { ok: false };
  }
}
