/**
 * sync-corpus-vectors — zieht den Prod-Vektorindex an den kanonischen Korpus nach.
 *
 * HINTERGRUND (THE-621, gemessen 2026-08-06): Es gibt ZWEI Qdrant-Instanzen.
 * Der Crawler embeddet in die auf Server B; die App durchsucht ihre EIGENE, lokale
 * (`QDRANT_URL=http://qdrant:6333`). Zwischen beiden gleicht nichts ab — im
 * `packages/server`-Code existiert für `regulations-corpus` nicht einmal ein
 * Schreiber, nur der Leser in `corpusVectorSearch.service.ts`. Der Prod-Index ist
 * damit ein eingefrorener Schnappschuss: Server B 1746 Punkte, Server A 1532.
 * Alles seit 2026-07-26 (ESG-Rating-VO, THE-519-Anleihegesetze) war in Produktion
 * semantisch unsichtbar — und `corpus/health` meldete dabei grün, weil es Mongo
 * misst und nicht den Vektorindex.
 *
 * WAS DIESES SKRIPT TUT: Es rechnet nichts neu. Die fertigen Vektoren liegen bereits
 * im `embedding`-Feld der Korpus-Mongo (dort schreibt sie der Crawler beim Einbetten
 * mit). Das Skript liest sie, baut daraus exakt die Punkte, die der Crawler baut, und
 * upsertet sie in den lokalen Index. Kein Sidecar-Aufruf, keine Kosten, keine Drift
 * zwischen zwei Einbettungs-Läufen.
 *
 * WAS ES NICHT TUT: die Ursache beheben. Es holt den Rückstand nach; dass er
 * überhaupt entsteht, bleibt THE-621 (Weg 2 + 3: ein Index statt zwei, und eine
 * Gesundheitsmeldung, die den Vektorindex mitmisst).
 *
 *   export MONGODB_URI=…  CORPUS_MONGODB_URI=…  QDRANT_URL=…  [QDRANT_API_KEY=…]
 *   npx ts-node src/scripts/sync-corpus-vectors.ts                    # Dry-Run: was fehlt?
 *   npx ts-node src/scripts/sync-corpus-vectors.ts --apply            # nachziehen
 *   npx ts-node src/scripts/sync-corpus-vectors.ts --source esg-rating-de --apply
 *   npx ts-node src/scripts/sync-corpus-vectors.ts --apply --force    # auch Vorhandene neu schreiben
 *
 * Idempotent: die Punkt-ID ist deterministisch aus dem `regulationKey` abgeleitet
 * (identische Formel wie im Crawler), ein zweiter Lauf überschreibt denselben Punkt.
 *
 * Linear: THE-621 · Anlass THE-614 (REQ-CORPUS-004.4)
 */
import mongoose from 'mongoose';
import * as crypto from 'node:crypto';
import { QdrantClient } from '@qdrant/js-client-rest';

/** Muss mit compliance-crawler/src/embeddings/sidecar.ts übereinstimmen (all-mpnet-base-v2). */
export const EMBEDDING_DIM = 768;

/** Muss mit compliance-crawler/src/embeddings/qdrant.ts übereinstimmen. */
export const CORPUS_COLLECTION = 'regulations-corpus';

// ─── Reine Transformation (ohne DB und ohne Netz — testbar) ───────────────

/**
 * Punkt-ID aus dem stabilen `regulationKey`. ZEICHENGLEICHE Kopie von
 * `regulationKeyToPointId` im Crawler — weicht sie ab, schreibt dieses Skript
 * Dubletten statt zu überschreiben, und der Index wächst still auseinander.
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
 * Baut Qdrant-Punkte aus Korpus-Dokumenten. Übersprungenes wird zurückgegeben, nicht
 * verschluckt: ein Dokument ohne Vektor ist genau die stille Lücke, um die es hier
 * geht — es darf nicht als Erfolg durchgehen.
 *
 * Das Payload-Schema spiegelt `RegulationPointPayload` des Crawlers. Bewusst NICHT
 * der Volltext: der Index filtert und zeigt an, gelesen wird aus Mongo.
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
 * fehlende geschrieben — ein Nachzug soll nicht jeden Vektor in Produktion anfassen,
 * nur weil eine Handvoll fehlt.
 */
export function planSync(points: QdrantPoint[], presentIds: Set<string>, force: boolean): SyncPlan {
  if (force) return { toUpsert: points, alreadyPresent: 0 };
  const toUpsert = points.filter((p) => !presentIds.has(p.id));
  return { toUpsert, alreadyPresent: points.length - toUpsert.length };
}

// ─── Ausführung ──────────────────────────────────────────────────────────

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

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const apply = args.includes('--apply');
  const force = args.includes('--force');
  const sourceIdx = args.indexOf('--source');
  const sourceFilter = sourceIdx >= 0 ? args[sourceIdx + 1] : undefined;

  const corpusUri = process.env.CORPUS_MONGODB_URI;
  const qdrantUrl = process.env.QDRANT_URL;
  if (!corpusUri) throw new Error('CORPUS_MONGODB_URI fehlt — ohne Korpus gibt es nichts nachzuziehen');
  if (!qdrantUrl) throw new Error('QDRANT_URL fehlt — das Ziel des Nachzugs ist unbestimmt');

  console.log(`Modus     : ${apply ? 'APPLY (schreibt)' : 'DRY-RUN (schreibt nicht)'}${force ? ' +FORCE' : ''}`);
  console.log(`Ziel-Index: ${qdrantUrl} / ${CORPUS_COLLECTION}`);
  if (sourceFilter) console.log(`Filter    : source = ${sourceFilter}`);

  const conn = await mongoose.createConnection(corpusUri).asPromise();
  const client = new QdrantClient({ url: qdrantUrl, apiKey: process.env.QDRANT_API_KEY || undefined });

  try {
    const filter = sourceFilter ? { source: sourceFilter } : {};
    const docs = (await conn
      .collection('regulations')
      .find(filter)
      .project({
        regulationKey: 1, versionHash: 1, source: 1, paragraphNumber: 1,
        title: 1, summary: 1, effectiveFrom: 1, jurisdiction: 1, language: 1, embedding: 1,
      })
      .toArray()) as unknown as CorpusVectorSource[];

    console.log(`\nKorpus    : ${docs.length} Dokumente`);

    const { points, skipped } = buildPoints(docs);
    if (skipped.length > 0) {
      console.log(`\n⚠ ${skipped.length} Dokumente OHNE brauchbaren Vektor — die bleiben unsichtbar:`);
      for (const s of skipped.slice(0, 20)) {
        console.log(`   ${s.regulationKey}: ${s.reason}${s.detail ? ` (${s.detail})` : ''}`);
      }
      if (skipped.length > 20) console.log(`   … und ${skipped.length - 20} weitere`);
      console.log('   → auf Server B nachholen: POST /embed-all {"force":false}');
    }

    const presentIds = await fetchPresentIds(client);
    console.log(`Ziel-Index: ${presentIds.size} Punkte vorhanden`);

    const plan = planSync(points, presentIds, force);
    console.log(`\nNachzuziehen: ${plan.toUpsert.length}   (bereits vorhanden: ${plan.alreadyPresent})`);

    if (plan.toUpsert.length > 0) {
      const bySource = new Map<string, number>();
      for (const p of plan.toUpsert) {
        const s = String(p.payload.source);
        bySource.set(s, (bySource.get(s) ?? 0) + 1);
      }
      for (const [s, n] of [...bySource.entries()].sort()) console.log(`   ${s}: ${n}`);
    }

    if (!apply) {
      console.log('\nDRY-RUN — nichts geschrieben. Mit --apply ausführen.');
      return;
    }
    if (plan.toUpsert.length === 0) {
      console.log('\nNichts zu tun — der Index ist auf dem Stand des Korpus.');
      return;
    }

    let written = 0;
    for (let i = 0; i < plan.toUpsert.length; i += UPSERT_BATCH) {
      const batch = plan.toUpsert.slice(i, i + UPSERT_BATCH);
      await client.upsert(CORPUS_COLLECTION, { wait: true, points: batch });
      written += batch.length;
      console.log(`   geschrieben: ${written}/${plan.toUpsert.length}`);
    }

    // Gegenprobe aus dem Ziel selbst — der Upsert-Rückgabewert ist kein Beweis.
    const after = await client.count(CORPUS_COLLECTION, { exact: true });
    console.log(`\nZiel-Index jetzt: ${after.count} Punkte (vorher ${presentIds.size}, +${after.count - presentIds.size})`);
    if (sourceFilter) {
      const c = await client.count(CORPUS_COLLECTION, {
        exact: true,
        filter: { must: [{ key: 'source', match: { value: sourceFilter } }] },
      });
      console.log(`Davon ${sourceFilter}: ${c.count}`);
    }
  } finally {
    await conn.close();
  }
}

if (require.main === module) {
  main().catch((err) => {
    console.error('FEHLGESCHLAGEN:', err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
