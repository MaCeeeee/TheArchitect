/**
 * Review-Pfad für Cross-Norm-Kanten-Vorschläge (THE-433, Slice 1, Task 6).
 *
 * Der Batch schreibt suggest-only; wirksam wird eine Kante erst, wenn ein
 * MENSCH sie bestätigt (AC-6). Diese Suite nagelt die eine Regel fest, die den
 * Review-Pfad überhaupt vertrauenswürdig macht:
 *
 *   Eine bestehende MENSCHLICHE Entscheidung wird nie stillschweigend
 *   überschrieben — ein zweiter decide-Aufruf auf einen bereits
 *   confirmed/rejected-Eintrag endet in 409, außer der Aufrufer sagt
 *   ausdrücklich `override: true`.
 *
 * Begründung: Asilomar #16 — der Mensch entscheidet, und eine getroffene
 * Entscheidung darf nicht unbemerkt verschwinden. Ein stilles Überschreiben
 * wäre schlimmer als ein Fehler, weil niemand es je sähe.
 *
 * Run: cd packages/compliance-crawler && npx jest src/__tests__/relations-routes.test.ts
 */
// config.ts parst process.env beim Import — MONGODB_URI VOR dem ersten require setzen.
process.env.MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/test';

import type { RelationSuggestionRow } from '../routes/relations';
const {
  RelationsDecideBodySchema,
  RelationsListQuerySchema,
  classifyDecideOutcome,
  selectRelationSuggestions,
}: typeof import('../routes/relations') = require('../routes/relations');

// ─── Fixtures ───────────────────────────────────────────────────

const entry = (over: Partial<RelationSuggestionRow['suggestion']> = {}) => ({
  targetRegulationKey: 'nis2:art-4',
  targetVersionHash: 'tgt-hash',
  sourceVersionHash: 'src-hash',
  relationType: 'PREVAILS_OVER',
  direction: 'a-to-b' as const,
  evidence: { matched: 'Article 4 of Directive (EU) 2022/2555', articleHints: ['art-4'] },
  promptVersion: 'rp-2',
  model: 'claude-haiku-4-5-20251001',
  suggestedAt: '2026-07-25T10:00:00.000Z',
  status: 'suggested' as const,
  ...over,
});

const doc = (
  regulationKey: string,
  source: string,
  suggestions: ReturnType<typeof entry>[]
) => ({
  regulationKey,
  source,
  paragraphNumber: 'Art. 1',
  title: 'Subject matter',
  relationSuggestions: suggestions,
});

// ─── Liste ──────────────────────────────────────────────────────

describe('selectRelationSuggestions() — Liste + Filter', () => {
  const docs = [
    doc('dora:art-1', 'dora', [entry(), entry({ targetRegulationKey: 'dsgvo:art-32', status: 'confirmed' })]),
    doc('cra-en:art-3', 'cra-en', [entry({ targetRegulationKey: 'nis2:art-12', relationType: 'INTERPRETS' })]),
  ];

  it('flacht die Einträge zu Zeilen ab — zitierendes Dokument + Ziel + Provenance', () => {
    const { items, total } = selectRelationSuggestions(docs, {});
    expect(total).toBe(3);
    expect(items).toHaveLength(3);
    const row = items.find((i) => i.regulationKey === 'dora:art-1' && i.suggestion.targetRegulationKey === 'nis2:art-4')!;
    expect(row).toMatchObject({
      regulationKey: 'dora:art-1',
      source: 'dora',
      paragraphNumber: 'Art. 1',
      title: 'Subject matter',
    });
    expect(row.suggestion).toMatchObject({
      targetRegulationKey: 'nis2:art-4',
      relationType: 'PREVAILS_OVER',
      direction: 'a-to-b',
      status: 'suggested',
      promptVersion: 'rp-2',
      model: 'claude-haiku-4-5-20251001',
    });
    expect(row.suggestion.evidence.matched).toContain('2022/2555');
  });

  it('filtert nach status', () => {
    const { items, total } = selectRelationSuggestions(docs, { status: 'confirmed' });
    expect(total).toBe(1);
    expect(items[0].suggestion.targetRegulationKey).toBe('dsgvo:art-32');
  });

  it('filtert nach targetSource (aus dem Ziel-Key abgeleitet, nicht geraten)', () => {
    const { items, total } = selectRelationSuggestions(docs, { targetSource: 'nis2' });
    expect(total).toBe(2);
    expect(items.every((i) => i.suggestion.targetRegulationKey.startsWith('nis2:'))).toBe(true);
  });

  it('paginiert stabil sortiert (regulationKey, dann Ziel-Key)', () => {
    const page1 = selectRelationSuggestions(docs, { limit: 2, offset: 0 });
    const page2 = selectRelationSuggestions(docs, { limit: 2, offset: 2 });
    expect(page1.total).toBe(3);
    expect(page1.items).toHaveLength(2);
    expect(page2.items).toHaveLength(1);
    const keys = [...page1.items, ...page2.items].map((i) => `${i.regulationKey}->${i.suggestion.targetRegulationKey}`);
    expect(keys).toEqual([
      'cra-en:art-3->nis2:art-12',
      'dora:art-1->dsgvo:art-32',
      'dora:art-1->nis2:art-4',
    ]);
  });

  it('Dokumente ohne Vorschläge liefern keine Zeilen', () => {
    expect(selectRelationSuggestions([{ ...doc('x:art-1', 'x', []), relationSuggestions: undefined }], {}).total).toBe(0);
  });
});

describe('RelationsListQuerySchema', () => {
  it('setzt Defaults und erzwingt Grenzen', () => {
    const ok = RelationsListQuerySchema.parse({});
    expect(ok.limit).toBeGreaterThan(0);
    expect(ok.offset).toBe(0);
    expect(RelationsListQuerySchema.safeParse({ limit: '0' }).success).toBe(false);
    expect(RelationsListQuerySchema.safeParse({ status: 'bogus' }).success).toBe(false);
    expect(RelationsListQuerySchema.parse({ limit: '5', offset: '10' })).toMatchObject({ limit: 5, offset: 10 });
  });
});

// ─── Die Kernregel: menschliche Entscheidung ist unantastbar ────

describe('classifyDecideOutcome() — Asilomar #16', () => {
  it('ein frischer Vorschlag darf entschieden werden', () => {
    expect(classifyDecideOutcome('suggested', false)).toBe('apply');
  });
  it('kein Eintrag → not_found (nie stillschweigend anlegen)', () => {
    expect(classifyDecideOutcome(undefined, false)).toBe('not_found');
    expect(classifyDecideOutcome(undefined, true)).toBe('not_found');
  });
  it('bereits menschlich entschieden → conflict, in BEIDE Richtungen', () => {
    expect(classifyDecideOutcome('confirmed', false)).toBe('conflict');
    expect(classifyDecideOutcome('rejected', false)).toBe('conflict');
  });
  it('nur ein ausdrückliches override hebt den Konflikt auf', () => {
    expect(classifyDecideOutcome('confirmed', true)).toBe('apply');
    expect(classifyDecideOutcome('rejected', true)).toBe('apply');
  });
});

describe('RelationsDecideBodySchema', () => {
  const base = { regulationKey: 'dora:art-1', targetRegulationKey: 'nis2:art-4' };
  it('akzeptiert confirmed/rejected, lehnt alles andere ab', () => {
    expect(RelationsDecideBodySchema.safeParse({ ...base, decision: 'confirmed' }).success).toBe(true);
    expect(RelationsDecideBodySchema.safeParse({ ...base, decision: 'rejected' }).success).toBe(true);
    expect(RelationsDecideBodySchema.safeParse({ ...base, decision: 'suggested' }).success).toBe(false);
    expect(RelationsDecideBodySchema.safeParse({ ...base, decision: 'maybe' }).success).toBe(false);
  });
  it('override ist standardmäßig aus — Überschreiben muss man ausdrücklich wollen', () => {
    expect(RelationsDecideBodySchema.parse({ ...base, decision: 'confirmed' }).override).toBe(false);
  });
});

// ─── Routen (Fastify inject, Mongo gemockt) ─────────────────────

describe('Relations-Routen (THE-433 Task 6)', () => {
  const build = async (docs: unknown[], updateResult = { matchedCount: 1, modifiedCount: 1 }) => {
    jest.resetModules();
    const { Regulation } = require('../db/regulation.model');
    const findSpy = jest.spyOn(Regulation, 'find').mockReturnValue({
      select: () => ({ lean: async () => docs }),
    } as never);
    const findOneSpy = jest.spyOn(Regulation, 'findOne').mockReturnValue({
      select: () => ({ lean: async () => docs[0] ?? null }),
    } as never);
    const updateSpy = jest.spyOn(Regulation, 'updateOne').mockResolvedValue(updateResult as never);
    const { buildApp } = require('../index');
    const app = await buildApp();
    return { app, findSpy, findOneSpy, updateSpy };
  };

  afterEach(() => jest.restoreAllMocks());

  it('GET /relations/suggestions → 200 + Zeilen mit Ziel, Typ, Richtung, Provenance', async () => {
    const { app } = await build([doc('dora:art-1', 'dora', [entry()])]);
    try {
      const res = await app.inject({ method: 'GET', url: '/relations/suggestions' });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.total).toBe(1);
      expect(body.items[0]).toMatchObject({ regulationKey: 'dora:art-1', source: 'dora' });
      expect(body.items[0].suggestion).toMatchObject({
        targetRegulationKey: 'nis2:art-4',
        relationType: 'PREVAILS_OVER',
        direction: 'a-to-b',
        status: 'suggested',
        promptVersion: 'rp-2',
      });
    } finally {
      await app.close();
    }
  });

  it('POST /relations/decide auf einen frischen Vorschlag → 200 + Status gesetzt', async () => {
    const { app, updateSpy } = await build([doc('dora:art-1', 'dora', [entry()])]);
    try {
      const res = await app.inject({
        method: 'POST',
        url: '/relations/decide',
        payload: { regulationKey: 'dora:art-1', targetRegulationKey: 'nis2:art-4', decision: 'confirmed' },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toMatchObject({ status: 'confirmed', previousStatus: 'suggested' });
      expect(updateSpy).toHaveBeenCalledTimes(1);
    } finally {
      await app.close();
    }
  });

  it('POST /relations/decide auf einen bereits ENTSCHIEDENEN Eintrag → 409, Bestand unverändert', async () => {
    const { app, updateSpy } = await build([doc('dora:art-1', 'dora', [entry({ status: 'confirmed' })])]);
    try {
      const res = await app.inject({
        method: 'POST',
        url: '/relations/decide',
        payload: { regulationKey: 'dora:art-1', targetRegulationKey: 'nis2:art-4', decision: 'rejected' },
      });
      expect(res.statusCode).toBe(409);
      expect(res.json()).toMatchObject({ error: 'already_decided', currentStatus: 'confirmed' });
      // Entscheidend: KEIN Write. Die menschliche Entscheidung bleibt stehen.
      expect(updateSpy).not.toHaveBeenCalled();
    } finally {
      await app.close();
    }
  });

  it('POST /relations/decide mit override: true → 200 und der vorherige Stand wird ausgewiesen', async () => {
    const { app, updateSpy } = await build([doc('dora:art-1', 'dora', [entry({ status: 'confirmed' })])]);
    try {
      const res = await app.inject({
        method: 'POST',
        url: '/relations/decide',
        payload: {
          regulationKey: 'dora:art-1',
          targetRegulationKey: 'nis2:art-4',
          decision: 'rejected',
          override: true,
        },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toMatchObject({ status: 'rejected', previousStatus: 'confirmed', overridden: true });
      expect(updateSpy).toHaveBeenCalledTimes(1);
    } finally {
      await app.close();
    }
  });

  it('POST /relations/decide auf ein unbekanntes Paar → 404', async () => {
    const { app, updateSpy } = await build([doc('dora:art-1', 'dora', [entry()])]);
    try {
      const res = await app.inject({
        method: 'POST',
        url: '/relations/decide',
        payload: { regulationKey: 'dora:art-1', targetRegulationKey: 'gibt-es-nicht:art-9', decision: 'confirmed' },
      });
      expect(res.statusCode).toBe(404);
      expect(updateSpy).not.toHaveBeenCalled();
    } finally {
      await app.close();
    }
  });

  it('POST /relations/decide mit ungültiger decision → 400', async () => {
    const { app, updateSpy } = await build([doc('dora:art-1', 'dora', [entry()])]);
    try {
      const res = await app.inject({
        method: 'POST',
        url: '/relations/decide',
        payload: { regulationKey: 'dora:art-1', targetRegulationKey: 'nis2:art-4', decision: 'suggested' },
      });
      expect(res.statusCode).toBe(400);
      expect(updateSpy).not.toHaveBeenCalled();
    } finally {
      await app.close();
    }
  });

  it('verliert das Rennen gegen eine gleichzeitige menschliche Entscheidung → 409 (TOCTOU-Guard)', async () => {
    // Read sieht 'suggested', der geführte Write matcht aber nicht mehr:
    // jemand hat zwischen Read und Write entschieden.
    const { app } = await build([doc('dora:art-1', 'dora', [entry()])], { matchedCount: 0, modifiedCount: 0 });
    try {
      const res = await app.inject({
        method: 'POST',
        url: '/relations/decide',
        payload: { regulationKey: 'dora:art-1', targetRegulationKey: 'nis2:art-4', decision: 'confirmed' },
      });
      expect(res.statusCode).toBe(409);
    } finally {
      await app.close();
    }
  });
});

// ─── Auth wie /crawl ────────────────────────────────────────────

describe('Auth: X-Crawler-Token wie bei /crawl', () => {
  afterEach(() => {
    delete process.env.CRAWLER_SHARED_SECRET;
    jest.restoreAllMocks();
    jest.resetModules();
  });

  it('gesetztes CRAWLER_SHARED_SECRET → 401 ohne Token, 200 mit Token (beide Routen)', async () => {
    process.env.CRAWLER_SHARED_SECRET = 's3cr3t';
    jest.resetModules();
    const { Regulation } = require('../db/regulation.model');
    jest.spyOn(Regulation, 'find').mockReturnValue({
      select: () => ({ lean: async () => [doc('dora:art-1', 'dora', [entry()])] }),
    } as never);
    jest.spyOn(Regulation, 'findOne').mockReturnValue({
      select: () => ({ lean: async () => doc('dora:art-1', 'dora', [entry()]) }),
    } as never);
    jest.spyOn(Regulation, 'updateOne').mockResolvedValue({ matchedCount: 1, modifiedCount: 1 } as never);
    const { buildApp } = require('../index');
    const app = await buildApp();
    try {
      expect((await app.inject({ method: 'GET', url: '/relations/suggestions' })).statusCode).toBe(401);
      expect(
        (
          await app.inject({
            method: 'POST',
            url: '/relations/decide',
            payload: { regulationKey: 'dora:art-1', targetRegulationKey: 'nis2:art-4', decision: 'confirmed' },
          })
        ).statusCode
      ).toBe(401);

      const okList = await app.inject({
        method: 'GET',
        url: '/relations/suggestions',
        headers: { 'x-crawler-token': 's3cr3t' },
      });
      expect(okList.statusCode).toBe(200);
    } finally {
      await app.close();
    }
  });
});
