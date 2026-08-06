/**
 * Korpus-Vektorindex: Gesundheit + Nachzug als Service (THE-623 / THE-624).
 *
 * ZWEI Qdrant-Instanzen existieren, und das bleibt so (ADR-0009): der Crawler
 * embeddet in die auf Server B, die App durchsucht ihre lokale — die zusätzlich
 * die Mandanten-Collections (`elements-<projectId>`) hält und deshalb nicht
 * durch einen Remote-Index ersetzt wird. Der Preis dieser Trennung ist Drift:
 * am 2026-08-06 fehlten hier 214 Punkte (ESG-VO + THE-519-Anleihegesetze, elf
 * Tage unbemerkt), während `corpus/health` grün meldete — es maß nur Mongo.
 *
 * Dieser Service macht beides zur Serverfunktion:
 *   - `corpusVectorIndexHealth()` — misst den LOKALEN Index gegen den Korpus.
 *   - `syncCorpusVectors()` — zieht Fehlendes nach, ohne neu zu rechnen: die
 *     fertigen Vektoren liegen im `embedding`-Feld der Korpus-Mongo.
 *
 * Richtung ist PULL von Server A. Gemessen am 2026-08-06: Server B erreicht
 * Server A nicht (Tailscale-ACL aus THE-441, absichtlich), umgekehrt liegt die
 * Latenz bei 2,8 ms. Ein Push-Design wäre gegen die ACL gebaut.
 *
 * Das CLI-Skript `scripts/sync-corpus-vectors.ts` ist ein Wrapper über diesen
 * Service — ein Codepfad, zwei Aufrufer (Scheduler und Hand).
 *
 * Linear: THE-623 (REQ-VSYNC-001.1) · THE-624 (REQ-VSYNC-001.2) · Parent THE-621
 */
import * as crypto from 'node:crypto';
import { QdrantClient } from '@qdrant/js-client-rest';
import { CorpusRegulation, isCorpusConfigured } from './corpusClient.service';
import { log } from '../config/logger';

/** Muss mit compliance-crawler/src/embeddings/sidecar.ts übereinstimmen (all-mpnet-base-v2). */
export const EMBEDDING_DIM = 768;

/** Muss mit compliance-crawler/src/embeddings/qdrant.ts übereinstimmen. */
export const CORPUS_COLLECTION = 'regulations-corpus';

// Env live lesen (Muster corpusVectorSearch.service.ts) — nicht beim Modul-Load
// einfrieren, damit Tests und späte Env-Setzung funktionieren.
const qdrantUrl = (): string => process.env.QDRANT_URL || '';

let _client: QdrantClient | null = null;
function getLocalQdrant(): QdrantClient {
  if (!_client) _client = new QdrantClient({ url: qdrantUrl(), apiKey: process.env.QDRANT_API_KEY || undefined });
  return _client;
}

/** Test-only: Singleton und Drift-Check-Uhr zurücksetzen. */
export function __resetVectorSyncForTests(): void {
  _client = null;
  _lastDriftCheckMs = 0;
}

// ─── Reine Transformation (ohne DB und ohne Netz — testbar) ───────────────

/**
 * Punkt-ID aus dem stabilen `regulationKey`. ZEICHENGLEICHE Kopie von
 * `regulationKeyToPointId` im Crawler — weicht sie ab, schreibt der Nachzug
 * Dubletten statt zu überschreiben, und der Index wächst still auseinander.
 * (Pin-Test mit festgenagelten Kennungen: sync-corpus-vectors.test.ts.)
 */
export function regulationKeyToPointId(regulationKey: string): string {
  const h = crypto.createHash('sha256').update(regulationKey).digest('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`;
}

/** Die Teilmenge der Korpus-Felder, die ein Punkt braucht. */
export interface CorpusVectorSource {
  regulationKey: string;
  versionHash: string;
  source: string;
  paragraphNumber: string;
  title: string;
  summary?: string;
  effectiveFrom: Date | string;
  jurisdiction: string;
  language: string;
  embedding?: number[];
}

export interface QdrantPoint {
  id: string;
  vector: number[];
  payload: Record<string, unknown>;
}

export type SkipReason = 'no-embedding' | 'wrong-dim';

export interface BuildResult {
  points: QdrantPoint[];
  skipped: Array<{ regulationKey: string; reason: SkipReason; detail?: string }>;
}

/**
 * Baut Qdrant-Punkte aus Korpus-Dokumenten. Übersprungenes wird zurückgegeben,
 * nicht verschluckt: ein Dokument ohne Vektor ist genau die stille Lücke, um
 * die es hier geht. Payload-Schema = `RegulationPointPayload` des Crawlers;
 * bewusst OHNE Volltext (der Index filtert und zeigt an, gelesen wird aus Mongo).
 */
export function buildPoints(docs: CorpusVectorSource[]): BuildResult {
  const points: QdrantPoint[] = [];
  const skipped: BuildResult['skipped'] = [];

  for (const d of docs) {
    if (!d.embedding || d.embedding.length === 0) {
      skipped.push({ regulationKey: d.regulationKey, reason: 'no-embedding' });
      continue;
    }
    if (d.embedding.length !== EMBEDDING_DIM) {
      skipped.push({
        regulationKey: d.regulationKey,
        reason: 'wrong-dim',
        detail: `${d.embedding.length} != ${EMBEDDING_DIM}`,
      });
      continue;
    }
    points.push({
      id: regulationKeyToPointId(d.regulationKey),
      vector: d.embedding,
      payload: {
        regulationKey: d.regulationKey,
        versionHash: d.versionHash,
        source: d.source,
        paragraphNumber: d.paragraphNumber,
        title: d.title,
        ...(d.summary ? { summary: d.summary } : {}),
        effectiveFrom:
          d.effectiveFrom instanceof Date
            ? d.effectiveFrom.toISOString().slice(0, 10)
            : String(d.effectiveFrom).slice(0, 10),
        jurisdiction: d.jurisdiction,
        language: d.language,
      },
    });
  }

  return { points, skipped };
}

/** Was gegenüber dem Ziel-Index tatsächlich zu tun ist. */
export interface SyncPlan {
  toUpsert: QdrantPoint[];
  alreadyPresent: number;
}

/**
 * Vergleicht gegen die im Ziel vorhandenen Punkt-IDs. Ohne `force` werden nur
 * fehlende geschrieben — ein Nachzug soll nicht jeden Vektor in Produktion
 * anfassen, nur weil eine Handvoll fehlt.
 */
export function planSync(points: QdrantPoint[], presentIds: Set<string>, force: boolean): SyncPlan {
  if (force) return { toUpsert: points, alreadyPresent: 0 };
  const toUpsert = points.filter((p) => !presentIds.has(p.id));
  return { toUpsert, alreadyPresent: points.length - toUpsert.length };
}

// ─── Health: der lokale Index gegen den Korpus (THE-623) ──────────────────

export interface VectorIndexHealth {
  /** Punkte im LOKALEN Prod-Qdrant; null ⇒ unerreichbar/unkonfiguriert (nicht „leer"). */
  points: number | null;
  /** Dokumente in der Korpus-Mongo; null ⇒ Korpus nicht konfiguriert/erreichbar. */
  corpusCount: number | null;
  /** corpusCount − points; null, sobald eine Seite null ist. */
  drift: number | null;
  /** true nur bei messbarem drift === 0. */
  ok: boolean;
}

/**
 * Misst den lokalen Vektorindex gegen den Korpus. Ein `count` pro Seite, kein
 * Scroll — billig genug für den tokenlosen Health-Endpoint. Unerreichbar ist
 * `null`, nicht `0`: „Index leer" und „Index weg" sind verschiedene Diagnosen
 * (Muster aus corpus-status, THE-468).
 */
export async function corpusVectorIndexHealth(): Promise<VectorIndexHealth> {
  let points: number | null = null;
  let corpusCount: number | null = null;

  if (qdrantUrl()) {
    try {
      const res = await getLocalQdrant().count(CORPUS_COLLECTION, { exact: true });
      points = res.count;
    } catch {
      points = null;
    }
  }
  if (isCorpusConfigured()) {
    try {
      corpusCount = await CorpusRegulation().estimatedDocumentCount();
    } catch {
      corpusCount = null;
    }
  }

  const drift = points !== null && corpusCount !== null ? corpusCount - points : null;
  const health: VectorIndexHealth = { points, corpusCount, drift, ok: drift === 0 };

  if (drift !== null && drift !== 0) {
    log.warn(
      { corpusCount, points, drift },
      '[vector-sync] Prod-Vektorindex weicht vom Korpus ab — neue Gesetze sind semantisch unsichtbar, bis der Nachzug läuft'
    );
  }
  return health;
}

// ─── Nachzug (THE-624) ─────────────────────────────────────────────────────

const UPSERT_BATCH = 100;
const SCROLL_BATCH = 1000;

/** Alle Punkt-IDs des Ziel-Index einsammeln (ohne Vektoren — nur zum Abgleich). */
async function fetchPresentIds(client: QdrantClient): Promise<Set<string>> {
  const ids = new Set<string>();
  let offset: string | number | undefined | null;
  for (;;) {
    const res = await client.scroll(CORPUS_COLLECTION, {
      limit: SCROLL_BATCH,
      with_payload: false,
      with_vector: false,
      ...(offset != null ? { offset } : {}),
    });
    for (const p of res.points) ids.add(String(p.id));
    offset = res.next_page_offset as string | number | null | undefined;
    if (offset == null) break;
  }
  return ids;
}

export interface SyncResult {
  corpusDocs: number;
  skipped: BuildResult['skipped'];
  alreadyPresent: number;
  planned: number;
  written: number;
  /** Gegenprobe aus dem Ziel selbst — der Upsert-Rückgabewert ist kein Beweis. */
  pointsAfter: number | null;
  applied: boolean;
}

/**
 * Zieht den lokalen Vektorindex an den Korpus nach. `apply: false` = Plan ohne
 * Schreiben. Wirft bei fehlender Konfiguration und bei Transportfehlern — die
 * Aufrufer entscheiden, ob das fatal ist (CLI: ja) oder geloggt-und-weiter
 * (Scheduler: nie werfen, Muster runCrawlJob).
 */
export async function syncCorpusVectors(args?: {
  apply?: boolean;
  force?: boolean;
  sourceFilter?: string;
}): Promise<SyncResult> {
  const { apply = false, force = false, sourceFilter } = args ?? {};

  if (!isCorpusConfigured()) throw new Error('CORPUS_MONGODB_URI fehlt — ohne Korpus gibt es nichts nachzuziehen');
  if (!qdrantUrl()) throw new Error('QDRANT_URL fehlt — das Ziel des Nachzugs ist unbestimmt');

  const filter: Record<string, unknown> = sourceFilter ? { source: sourceFilter } : {};
  const docs = (await CorpusRegulation()
    .find(filter)
    .select({
      regulationKey: 1, versionHash: 1, source: 1, paragraphNumber: 1,
      title: 1, summary: 1, effectiveFrom: 1, jurisdiction: 1, language: 1, embedding: 1,
    })
    .lean()) as unknown as CorpusVectorSource[];

  const { points, skipped } = buildPoints(docs);
  if (skipped.length > 0) {
    // Vektorlose Korpus-Dokumente kann NUR Server B heilen (embed-all) — hier
    // laut machen, nicht verschlucken (die DORA-Lücke, eine Ebene tiefer).
    log.warn(
      { count: skipped.length, sample: skipped.slice(0, 5) },
      '[vector-sync] Korpus-Dokumente ohne brauchbaren Vektor — auf Server B POST /embed-all ausführen'
    );
  }

  const client = getLocalQdrant();
  const presentIds = await fetchPresentIds(client);
  const plan = planSync(points, presentIds, force);

  let written = 0;
  let pointsAfter: number | null = null;

  if (apply && plan.toUpsert.length > 0) {
    for (let i = 0; i < plan.toUpsert.length; i += UPSERT_BATCH) {
      const batch = plan.toUpsert.slice(i, i + UPSERT_BATCH);
      await client.upsert(CORPUS_COLLECTION, { wait: true, points: batch });
      written += batch.length;
    }
  }
  if (apply) {
    try {
      pointsAfter = (await client.count(CORPUS_COLLECTION, { exact: true })).count;
    } catch {
      pointsAfter = null;
    }
  }

  return {
    corpusDocs: docs.length,
    skipped,
    alreadyPresent: plan.alreadyPresent,
    planned: plan.toUpsert.length,
    written,
    pointsAfter,
    applied: apply,
  };
}

// ─── Periodischer Drift-Check (THE-624) — Pull deckt auch manuelle Crawls ──

export const isVectorSyncEnabled = (): boolean =>
  (process.env.VECTOR_SYNC_ENABLED ?? 'true').toLowerCase() !== 'false';
const vectorSyncEnabled = isVectorSyncEnabled;
const vectorSyncIntervalMs = (): number =>
  Number(process.env.VECTOR_SYNC_INTERVAL_MINUTES ?? 360) * 60 * 1000;

let _lastDriftCheckMs = 0;

/**
 * Prüft höchstens einmal je Intervall auf Drift und zieht bei Bedarf nach.
 * Wirft NIE (Muster runCrawlJob): ein Ausfall wird geloggt und beim nächsten
 * Takt erneut versucht. Prozess-lokale Uhr statt Mongo-Log — nach einem
 * Neustart läuft der Check einmal früh, was idempotent und damit harmlos ist.
 */
export async function maybeRunVectorDriftCheck(now: number = Date.now()): Promise<SyncResult | null> {
  if (!vectorSyncEnabled()) return null;
  if (now - _lastDriftCheckMs < vectorSyncIntervalMs()) return null;
  _lastDriftCheckMs = now;

  try {
    const health = await corpusVectorIndexHealth();
    if (health.drift === null || health.drift === 0) return null;

    const res = await syncCorpusVectors({ apply: true });
    log.info(
      { planned: res.planned, written: res.written, skipped: res.skipped.length, pointsAfter: res.pointsAfter },
      '[vector-sync] Drift geschlossen — Nachzug ohne Menschen in der Schleife'
    );
    return res;
  } catch (err) {
    log.warn({ err }, '[vector-sync] Drift-Check fehlgeschlagen — nächster Takt versucht es erneut');
    return null;
  }
}

/**
 * Nachzug direkt nach einem (Scheduler-)Crawl — der Normalfall, der die Lücke
 * sofort schließt statt aufs Intervall zu warten. Wirft nie.
 */
export async function runPostCrawlVectorSync(): Promise<SyncResult | null> {
  if (!vectorSyncEnabled()) return null;
  try {
    const res = await syncCorpusVectors({ apply: true });
    if (res.planned > 0) {
      log.info(
        { planned: res.planned, written: res.written, pointsAfter: res.pointsAfter },
        '[vector-sync] Post-Crawl-Nachzug: neue Vektoren in den Prod-Index übernommen'
      );
    }
    return res;
  } catch (err) {
    log.warn({ err }, '[vector-sync] Post-Crawl-Nachzug fehlgeschlagen — der periodische Check holt es nach');
    return null;
  }
}
