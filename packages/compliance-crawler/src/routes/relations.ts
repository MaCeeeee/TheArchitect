/**
 * Review-Pfad für die Cross-Norm-Kanten-Vorschläge (THE-433, Slice 1, Task 6).
 *
 *   GET  /relations/suggestions — was der Batch vorgeschlagen hat, filterbar
 *   POST /relations/decide      — ein MENSCH bestätigt oder verwirft eine Kante
 *
 * WARUM DIESE ROUTEN HIER UND NICHT AUF SERVER A: Der Korpus gehört Server B;
 * Server A ist am Korpus RO-User (THE-440). Der Schreibzugriff liegt also
 * ausschließlich beim Crawler, und die Entscheidung ist ein Write. Server A
 * bekommt dafür einen reinen LESE-Proxy (regulations.routes.ts).
 *
 * DIE EINE REGEL, DIE DEN PFAD TRÄGT (Asilomar #16): Eine bestehende
 * MENSCHLICHE Entscheidung wird nie stillschweigend überschrieben. Ein zweiter
 * decide-Aufruf auf einen bereits confirmed/rejected-Eintrag endet in 409 —
 * außer der Aufrufer sagt ausdrücklich `override: true`. Der Mensch entscheidet;
 * eine getroffene Entscheidung darf nicht unbemerkt verschwinden. Ein stilles
 * Überschreiben wäre schlimmer als ein Fehler, weil niemand es je sähe.
 * (Derselbe Vorrang, den der Batch schon kennt: mergeRelationSuggestions lässt
 * confirmed/rejected auch mit --force stehen.)
 *
 * TOCTOU: Zwischen Read und Write kann jemand anders entscheiden. Der Write
 * ist deshalb GEFÜHRT — ohne override matcht er nur einen Eintrag, der noch
 * 'suggested' ist. Matcht er nicht, hat der andere gewonnen und der Aufrufer
 * bekommt 409, statt dessen Entscheidung zu überfahren.
 *
 * Auth: `requireCrawlerToken` wie bei /crawl — unverändert übernommen.
 *
 * Linear: THE-433 (Slice 1, Task 6) · AC-6 (Human-Confirm vor Wirkung)
 */
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  RELATION_DECISIONS,
  RELATION_STATUSES,
  selectRelationSuggestions,
  type RelationStatus,
  type RelationSuggestionsDoc,
} from '@thearchitect/shared';
import { Regulation } from '../db/regulation.model';
import { requireCrawlerToken } from '../lib/requireToken';

// Die Lese-Sicht (Zeilen-Shape, Filter, Sortierung) lebt in
// @thearchitect/shared — Server A zeigt read-only exakt dieselbe Zeile
// (Begründung im Kopf von shared/src/relations/review.ts). Re-Export, damit
// Importeure dieser Route (Prüfsätze) unverändert weiterlaufen.
export {
  RELATION_DECISIONS,
  RELATION_STATUSES,
  selectRelationSuggestions,
  targetSourceOf,
} from '@thearchitect/shared';
export type {
  RelationStatus,
  RelationSuggestionOut,
  RelationSuggestionRow,
  RelationSuggestionsDoc,
} from '@thearchitect/shared';

export const RelationsListQuerySchema = z.object({
  /** Quelle des ZITIERENDEN Dokuments (z. B. 'dora'). */
  source: z.string().min(1).optional(),
  status: z.enum(RELATION_STATUSES).optional(),
  /** Quelle des ZIELS — aus dem Ziel-Key abgeleitet, nie geraten. */
  targetSource: z.string().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(500).default(100),
  offset: z.coerce.number().int().min(0).default(0),
});
export type RelationsListQuery = z.infer<typeof RelationsListQuerySchema>;

export const RelationsDecideBodySchema = z.object({
  regulationKey: z.string().min(1),
  targetRegulationKey: z.string().min(1),
  decision: z.enum(RELATION_DECISIONS),
  /**
   * Muss ausdrücklich gesetzt werden, um eine bestehende menschliche
   * Entscheidung zu ersetzen. Default false: Überschreiben ist nie der
   * Normalfall, sondern eine bewusste Handlung.
   */
  override: z.boolean().default(false),
});
export type RelationsDecideBody = z.infer<typeof RelationsDecideBodySchema>;

// ─── Die Entscheidungs-Regel ────────────────────────────────────

export type DecideOutcome = 'apply' | 'not_found' | 'conflict';

/**
 * Darf entschieden werden? `current` ist der Status des bestehenden Eintrags
 * (undefined = es gibt ihn nicht).
 *
 * - kein Eintrag → not_found. Eine Entscheidung legt NIE einen Vorschlag an:
 *   Vorschläge kommen aus dem Batch mit Evidence und Provenance; ein aus einem
 *   decide-Aufruf entstandener Eintrag hätte beides nicht.
 * - 'suggested' → apply.
 * - bereits confirmed/rejected → conflict, außer ausdrückliches override.
 */
export function classifyDecideOutcome(
  current: RelationStatus | undefined,
  override: boolean
): DecideOutcome {
  if (current === undefined) return 'not_found';
  if (current === 'suggested') return 'apply';
  return override ? 'apply' : 'conflict';
}

// ─── Routen ─────────────────────────────────────────────────────

const DOC_PROJECTION = 'regulationKey source paragraphNumber title relationSuggestions';

export async function relationsRoutes(app: FastifyInstance): Promise<void> {
  app.get('/relations/suggestions', { preHandler: requireCrawlerToken }, async (request, reply) => {
    const parsed = RelationsListQuerySchema.safeParse(request.query ?? {});
    if (!parsed.success) {
      return reply.code(400).send({ error: 'invalid_query', details: parsed.error.flatten() });
    }
    const { source, status, targetSource, limit, offset } = parsed.data;

    const query: Record<string, unknown> = { relationSuggestions: { $exists: true, $ne: [] } };
    if (source) query.source = source;

    const docs = (await Regulation.find(query)
      .select(DOC_PROJECTION)
      .lean()) as unknown as RelationSuggestionsDoc[];

    const { items, total } = selectRelationSuggestions(docs, { status, targetSource, limit, offset });
    return reply.code(200).send({ items, total, limit, offset });
  });

  app.post('/relations/decide', { preHandler: requireCrawlerToken }, async (request, reply) => {
    const parsed = RelationsDecideBodySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'invalid_body', details: parsed.error.flatten() });
    }
    const { regulationKey, targetRegulationKey, decision, override } = parsed.data;

    const doc = (await Regulation.findOne({ regulationKey })
      .select(DOC_PROJECTION)
      .lean()) as unknown as RelationSuggestionsDoc | null;
    const existing = doc?.relationSuggestions?.find(
      (s) => s.targetRegulationKey === targetRegulationKey
    );

    const outcome = classifyDecideOutcome(existing?.status, override);
    if (outcome === 'not_found') {
      return reply
        .code(404)
        .send({ error: 'suggestion_not_found', regulationKey, targetRegulationKey });
    }
    if (outcome === 'conflict') {
      return reply.code(409).send({
        error: 'already_decided',
        regulationKey,
        targetRegulationKey,
        currentStatus: existing!.status,
        hint: 'Diese Kante wurde bereits menschlich entschieden. Zum Ersetzen override: true senden.',
      });
    }

    // Geführter Write: ohne override greift er NUR, solange der Eintrag noch
    // 'suggested' ist. Entscheidet jemand zwischen Read und Write, matcht der
    // Filter nicht — dieser Aufruf verliert das Rennen, nie der andere.
    const elemMatch: Record<string, unknown> = { targetRegulationKey };
    if (!override) elemMatch.status = 'suggested';
    const res = await Regulation.updateOne(
      { regulationKey, relationSuggestions: { $elemMatch: elemMatch } },
      { $set: { 'relationSuggestions.$.status': decision } }
    );

    if ((res.matchedCount ?? 0) === 0) {
      return reply.code(409).send({
        error: 'already_decided',
        regulationKey,
        targetRegulationKey,
        hint: 'Zwischen Lesen und Schreiben hat jemand anders entschieden. Erneut lesen und prüfen.',
      });
    }

    if (override && existing!.status !== 'suggested') {
      // Ein Überschreiben ist zulässig, aber nie beiläufig: es hinterlässt eine
      // Spur im Log und im Antwort-Objekt.
      request.log.warn(
        { regulationKey, targetRegulationKey, from: existing!.status, to: decision },
        'relations/decide: menschliche Entscheidung per override ersetzt'
      );
    }

    return reply.code(200).send({
      regulationKey,
      targetRegulationKey,
      status: decision,
      previousStatus: existing!.status,
      overridden: override && existing!.status !== 'suggested',
    });
  });
}
