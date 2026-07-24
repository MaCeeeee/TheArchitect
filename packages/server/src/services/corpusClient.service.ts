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
import { safeErrorMessage } from '@thearchitect/shared';
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
  /**
   * Typisierungs-VORSCHLAG (THE-432 Slice T) — geschrieben vom Batch im
   * compliance-crawler (Server B, dort liegt der Schreibzugriff), hier nur
   * GELESEN. `null` = Achse bewusst „nicht anwendbar", fehlend = offen.
   * Konsumenten (z. B. scope-applicability-Priorisierung im Discovery) sind
   * hinter Gate 2 + Feature-Flag — kein Code liest dieses Feld ungemessen.
   * Feldnamen müssen mit compliance-crawler/src/db/regulation.model.ts
   * identisch bleiben.
   */
  typing?: {
    normKind?: string | null;
    bindingness?: string | null;
    obligationKind?: string | null;
    partyRole?: string | null;
    provisionKind?: string | null;
    modelId: string;
    promptVersion: string;
    ontologyVersion: string;
    /**
     * Review-Fix 1 (THE-432): Anker an die TEXT-Version (sha256 von fullText),
     * die dieses Label beschreibt. Bei einer Novelle aktualisiert die
     * Crawl-Route das Dokument in place mit neuem versionHash — weicht
     * doc.versionHash von typing.versionHash ab, beschreibt das Label einen
     * ALTEN Text-Stand und darf nicht als aktuell konsumiert werden.
     */
    versionHash: string;
    typedAt: Date;
    status: 'suggested' | 'confirmed' | 'rejected';
    droppedAxes?: string[];
  };
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
    // Leseseite des typing-Subdokuments (Schreiber: compliance-crawler-Batch).
    // `type: String` ohne Validator/Default: null muss den Cast überleben
    // (bewusstes „nicht anwendbar"), fehlend bleibt fehlend.
    typing: {
      type: {
        normKind: { type: String, default: undefined },
        bindingness: { type: String, default: undefined },
        obligationKind: { type: String, default: undefined },
        partyRole: { type: String, default: undefined },
        provisionKind: { type: String, default: undefined },
        modelId: { type: String },
        promptVersion: { type: String },
        ontologyVersion: { type: String },
        versionHash: { type: String }, // Review-Fix 1: Text-Anker (Feldname identisch zum Crawler-Schema)
        typedAt: { type: Date },
        status: { type: String, enum: ['suggested', 'confirmed', 'rejected'] },
        droppedAxes: { type: [String], default: undefined },
      },
      _id: false,
      default: undefined,
    },
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
      // FAIL FAST: ohne buffering wirft eine Operation sofort, wenn die Verbindung
      // nicht ready ist (Auth-Fehler / Korpus down), statt 10s zu puffern und dann
      // Kern-Endpunkte zu 500en. Die Reads unten fangen das ab → App-DB-Fallback.
      bufferCommands: false,
    });
    _connection.on('error', err => log.error({ err: safeErrorMessage(err) }, '[corpus] connection error'));
  }
  return _connection;
}

/** True nur, wenn die Korpus-Verbindung offen UND verbunden ist (readyState 1). */
export function isCorpusReachable(): boolean {
  return isCorpusConfigured() && _connection?.readyState === 1;
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

/**
 * Test seam: fully reset the lazy corpus connection + model so the next access
 * re-opens a fresh (still-handshaking) connection — used to exercise the
 * first-poll-after-boot readiness race in corpusHealth() (THE-470).
 */
export async function __resetCorpusForTests(): Promise<void> {
  _model = null;
  if (_connection) {
    await _connection.close();
    _connection = null;
  }
}

// ─── Read API ───

export async function getRegulationByKey(key: string): Promise<ICorpusRegulation | null> {
  return CorpusRegulation().findOne({ regulationKey: key }).sort({ version: -1 });
}

/** Exact version by key+hash — for version-pin (AC-3). Returns null if that version no longer exists. */
export async function getRegulationByKeyAndHash(
  key: string,
  versionHash: string,
): Promise<ICorpusRegulation | null> {
  try {
    return await CorpusRegulation().findOne({ regulationKey: key, versionHash });
  } catch (err) {
    log.warn({ err: safeErrorMessage(err), key }, '[corpus] getRegulationByKeyAndHash failed');
    return null;
  }
}

export async function getRegulationsByKeys(keys: string[]): Promise<ICorpusRegulation[]> {
  if (keys.length === 0) return [];
  try {
    return await CorpusRegulation().find({ regulationKey: { $in: keys } });
  } catch (err) {
    // Korpus unerreichbar/Auth-Fehler → leer zurück, Aufrufer fällt auf App-DB zurück.
    log.warn({ err: safeErrorMessage(err) }, '[corpus] getRegulationsByKeys failed — falling back');
    return [];
  }
}

/**
 * Alle (aktuellsten) Korpus-Regulations zu den gegebenen Quellen. Nur die
 * höchste Version je regulationKey (der Crawler legt bei Änderung eine neue
 * Version an). Für den Projekt-Import (import-regulations-from-corpus.ts), weil
 * der Crawler in den kanonischen Korpus schreibt, nicht in den Projekt-Bestand.
 */
export async function listCorpusBySource(sources: string[]): Promise<ICorpusRegulation[]> {
  if (sources.length === 0) return [];
  let all: ICorpusRegulation[];
  try {
    all = await CorpusRegulation()
      .find({ source: { $in: sources } })
      .sort({ regulationKey: 1, version: -1 });
  } catch (err) {
    log.warn({ err: safeErrorMessage(err) }, '[corpus] listCorpusBySource failed — returning empty');
    return [];
  }
  const latest = new Map<string, ICorpusRegulation>();
  for (const r of all) {
    if (!latest.has(r.regulationKey)) latest.set(r.regulationKey, r); // erste = höchste Version
  }
  return [...latest.values()];
}

/** Map of regulationKey → current (latest) versionHash. For drift-detection (THE-306/368). */
export async function getCurrentVersionHashes(keys: string[]): Promise<Map<string, string>> {
  const regs = await getRegulationsByKeys([...new Set(keys)]);
  const latest = new Map<string, ICorpusRegulation>();
  for (const r of regs) {
    const cur = latest.get(r.regulationKey);
    if (!cur || (r.version ?? 1) > (cur.version ?? 1)) latest.set(r.regulationKey, r);
  }
  const map = new Map<string, string>();
  for (const [k, r] of latest) map.set(k, r.versionHash);
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

/**
 * How long corpusHealth() waits for the lazy corpus connection's initial handshake
 * before declaring the corpus unreachable. Covers a normal Tailnet handshake
 * (sub-second) without letting a genuinely-down corpus hang the (polled) health
 * probe. THE-368 / THE-419 / THE-470.
 */
const CORPUS_HEALTH_READY_TIMEOUT_MS = 3000;

/**
 * Await the lazily-opened corpus connection reaching readyState 1, bounded by
 * timeoutMs. No-op when no real connection is open (injected-model test path) or
 * when it is already connected. Closes the first-poll-after-boot race where
 * estimatedDocumentCount() would otherwise throw "before initial connection is
 * complete" with bufferCommands:false (THE-470).
 */
async function waitForCorpusReadyIfConnected(timeoutMs: number): Promise<void> {
  if (!_connection || _connection.readyState === 1) return;
  let timer: NodeJS.Timeout | undefined;
  try {
    await Promise.race([
      _connection.asPromise(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error('corpus connection not ready within timeout')),
          timeoutMs,
        );
        timer.unref?.();
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export async function corpusHealth(): Promise<{ ok: boolean; count?: number }> {
  if (!isCorpusConfigured()) return { ok: false };
  try {
    // Resolve the model first — this lazily opens the real corpus connection (or
    // returns the injected test model) — THEN wait out the connection's handshake
    // so the first poll right after a container recreate doesn't race it and
    // false-alarm {ok:false} (THE-470).
    const model = CorpusRegulation();
    await waitForCorpusReadyIfConnected(CORPUS_HEALTH_READY_TIMEOUT_MS);
    const count = await model.estimatedDocumentCount();
    return { ok: true, count };
  } catch (err) {
    log.warn({ err: safeErrorMessage(err) }, '[corpus] health check failed');
    return { ok: false };
  }
}
