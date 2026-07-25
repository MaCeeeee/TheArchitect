/**
 * Relations-Batch Kern-Tests — THE-433 (Slice 1, Task 3b).
 *
 * Rein unit (Muster typingBatch.test.ts): fake clock, fake complete/write,
 * kein Netz, kein Mongo. Die Verhaltensregeln aus der Task-Spec, jede mit
 * ihrem Grund:
 *  - 'none' schreibt KEINEN Eintrag, setzt aber den relationScan-Anker
 *    (sonst würde jeder Lauf neu klassifizieren).
 *  - metadata-Antwort ('AMENDS') → Drop-Zähler, nie geschrieben (AC-5).
 *  - confirmed/rejected überleben JEDEN Re-Scan, auch --force (Asilomar #16).
 *  - leere Antwort nach allen Retries → Ausfall-Zähler, kein Eintrag und
 *    KEIN Anker (sonst würde der Ausfall nie nachgeholt).
 *  - Idempotenz: passender Anker (promptVersion+versionHash) → Skip.
 *  - Zod-Grenze: ein konstruierter Schema-Verstoß wirft LAUT statt still zu
 *    schreiben (die Mongoose-Schicht validiert relationType bewusst nicht).
 *
 * Run: cd packages/compliance-crawler && npx jest src/__tests__/relationsBatch.test.ts --verbose
 */
import {
  RELATIONS_BATCH_MODEL,
  assembleRelationSuggestion,
  mergeRelationSuggestions,
  newRelationsBatchCounters,
  processRelationDocGroup,
  relationWriteFilter,
  shouldSkipRelationScan,
  type RelationsBatchDoc,
  type RelationsBatchWrite,
} from '../lib/relationsBatch';
import type { RelationCandidate } from '../lib/relationCandidates';
import { RELATIONS_PROMPT_VERSION, type RelationSuggestion } from '@thearchitect/shared';

const HASH_A = 'a'.repeat(64); // Text-Stand des zitierenden Dokuments
const HASH_B = 'b'.repeat(64); // Text-Stand des Ziels
const OLD_HASH = '0'.repeat(64);
const NOW = new Date('2026-07-25T12:00:00.000Z');

const citingDoc: RelationsBatchDoc = {
  _id: 'id-dora-1',
  regulationKey: 'dora:art-1',
  source: 'dora',
  paragraphNumber: 'Art. 1',
  title: 'Subject matter',
  fullText: 'This Regulation shall be considered a sector-specific Union legal act for the purposes of Article 4 of Directive (EU) 2022/2555.',
  language: 'en',
  versionHash: HASH_A,
};

const targetDoc = {
  regulationKey: 'nis2:art-4',
  source: 'nis2',
  paragraphNumber: 'Art. 4',
  title: 'Sector-specific Union legal acts',
  fullText: 'Where sector-specific Union legal acts require … shall not apply to such entities.',
  language: 'en',
  versionHash: HASH_B,
};

const candidate: RelationCandidate = {
  citing: citingDoc,
  target: targetDoc,
  evidence: { matched: '(EU) 2022/2555', articleHints: ['4'] },
};

function humanEntry(status: 'confirmed' | 'rejected'): RelationSuggestion {
  return {
    targetRegulationKey: 'nis2:art-4',
    targetVersionHash: HASH_B,
    sourceVersionHash: HASH_A,
    relationType: 'PREVAILS_OVER',
    direction: 'a-to-b',
    evidence: { matched: '(EU) 2022/2555', articleHints: ['4'] },
    promptVersion: RELATIONS_PROMPT_VERSION,
    model: RELATIONS_BATCH_MODEL,
    suggestedAt: '2026-07-20T00:00:00.000Z',
    status,
  };
}

// ─── shouldSkipRelationScan (Idempotenz-Anker pro DOKUMENT) ─────

describe('shouldSkipRelationScan', () => {
  const OPTS = { force: false, promptVersion: RELATIONS_PROMPT_VERSION };

  it('passender Anker (versionHash + promptVersion) → skip', () => {
    const doc = {
      versionHash: HASH_A,
      relationScan: { promptVersion: RELATIONS_PROMPT_VERSION, versionHash: HASH_A },
    };
    expect(shouldSkipRelationScan(doc, OPTS)).toBe(true);
  });

  it('--force überstimmt den Anker', () => {
    const doc = {
      versionHash: HASH_A,
      relationScan: { promptVersion: RELATIONS_PROMPT_VERSION, versionHash: HASH_A },
    };
    expect(shouldSkipRelationScan(doc, { ...OPTS, force: true })).toBe(false);
  });

  it('alter Text-Stand (Novelle) → kein Skip', () => {
    const doc = {
      versionHash: HASH_A,
      relationScan: { promptVersion: RELATIONS_PROMPT_VERSION, versionHash: OLD_HASH },
    };
    expect(shouldSkipRelationScan(doc, OPTS)).toBe(false);
  });

  it('anderer Prompt-Stand → kein Skip (Re-Scan nach Prompt-Bump gewollt)', () => {
    const doc = {
      versionHash: HASH_A,
      relationScan: { promptVersion: 'rp-1', versionHash: HASH_A },
    };
    expect(shouldSkipRelationScan(doc, OPTS)).toBe(false);
  });

  it('kein Anker → kein Skip', () => {
    expect(shouldSkipRelationScan({ versionHash: HASH_A }, OPTS)).toBe(false);
  });
});

// ─── assembleRelationSuggestion (Zod-Grenze VOR dem Write) ──────

describe('assembleRelationSuggestion', () => {
  it('baut einen schema-validen Vorschlag mit beiden Text-Ankern und voller Provenance', () => {
    const s = assembleRelationSuggestion(
      candidate,
      { relation: 'PREVAILS_OVER', direction: 'a-to-b' },
      { model: RELATIONS_BATCH_MODEL, now: NOW }
    );
    expect(s).toEqual({
      targetRegulationKey: 'nis2:art-4',
      targetVersionHash: HASH_B,
      sourceVersionHash: HASH_A,
      relationType: 'PREVAILS_OVER',
      direction: 'a-to-b',
      evidence: { matched: '(EU) 2022/2555', articleHints: ['4'] },
      promptVersion: RELATIONS_PROMPT_VERSION,
      model: RELATIONS_BATCH_MODEL,
      suggestedAt: '2026-07-25T12:00:00.000Z',
      status: 'suggested',
    });
  });

  it('wirft LAUT bei einem konstruierten Schema-Verstoß (metadata-Typ) statt still zu schreiben', () => {
    // Die Mongoose-Schicht validiert relationType bewusst NICHT (siehe
    // regulation.model.ts) — die Zod-Grenze hier ist die einzige Erzwingung.
    expect(() =>
      assembleRelationSuggestion(
        candidate,
        { relation: 'AMENDS', direction: 'a-to-b' },
        { model: RELATIONS_BATCH_MODEL, now: NOW }
      )
    ).toThrow(/inferred/);
  });
});

// ─── mergeRelationSuggestions (Mensch schlägt Batch) ────────────

describe('mergeRelationSuggestions', () => {
  const freshSuggested = assembleRelationSuggestion(
    candidate,
    { relation: 'CONCRETIZES', direction: 'a-to-b' },
    { model: RELATIONS_BATCH_MODEL, now: NOW }
  );

  it('ersetzt alte suggested-Einträge durch die frischen', () => {
    const old = { ...humanEntry('confirmed'), status: 'suggested' as const, relationType: 'INTERPRETS' };
    const { merged, skippedHumanPairs } = mergeRelationSuggestions([old], [freshSuggested]);
    expect(merged).toEqual([freshSuggested]);
    expect(skippedHumanPairs).toBe(0);
  });

  it('behält confirmed/rejected IMMER und verwirft den frischen Vorschlag fürs selbe Ziel-Paar', () => {
    const confirmed = humanEntry('confirmed');
    const { merged, skippedHumanPairs } = mergeRelationSuggestions([confirmed], [freshSuggested]);
    expect(merged).toEqual([confirmed]);
    expect(skippedHumanPairs).toBe(1);
  });

  it('frische Vorschläge für ANDERE Ziele laufen neben menschlichen Entscheidungen', () => {
    const rejected = { ...humanEntry('rejected'), targetRegulationKey: 'nis2:art-21' };
    const { merged } = mergeRelationSuggestions([rejected], [freshSuggested]);
    expect(merged).toEqual([rejected, freshSuggested]);
  });
});

// ─── relationWriteFilter (TOCTOU-Guard analog typingBatch) ──────

describe('relationWriteFilter', () => {
  it('greift nur bei unverändertem versionHash und ohne fremde menschliche Entscheidung', () => {
    const filter = relationWriteFilter('id-1', HASH_A, ['nis2:art-4']);
    expect(filter).toEqual({
      _id: 'id-1',
      versionHash: HASH_A,
      relationSuggestions: {
        $not: {
          $elemMatch: {
            status: { $in: ['confirmed', 'rejected'] },
            targetRegulationKey: { $nin: ['nis2:art-4'] },
          },
        },
      },
    });
  });
});

// ─── processRelationDocGroup (Pipeline pur) ─────────────────────

describe('processRelationDocGroup', () => {
  const OPTS = { force: false, dryRun: false, promptVersion: RELATIONS_PROMPT_VERSION, model: RELATIONS_BATCH_MODEL };

  function deps(complete: (user: string) => Promise<{ text: string | null; inputTokens: number; outputTokens: number }>) {
    const writes: RelationsBatchWrite[] = [];
    return {
      writes,
      deps: {
        complete,
        write: async (w: RelationsBatchWrite) => {
          writes.push(w);
          return true;
        },
        now: () => NOW,
      },
    };
  }

  const ok = (json: string) => async () => ({ text: json, inputTokens: 100, outputTokens: 10 });

  it('gültige Relation → Zod-validierter Eintrag + Anker', async () => {
    const { writes, deps: d } = deps(ok('{"relation":"PREVAILS_OVER","direction":"a-to-b"}'));
    const counters = newRelationsBatchCounters();
    await processRelationDocGroup({ doc: citingDoc, candidates: [candidate] }, OPTS, d, counters);
    expect(writes).toHaveLength(1);
    expect(writes[0].docId).toBe('id-dora-1');
    expect(writes[0].suggestions).toHaveLength(1);
    expect(writes[0].suggestions[0].relationType).toBe('PREVAILS_OVER');
    expect(writes[0].anchor).toEqual({
      promptVersion: RELATIONS_PROMPT_VERSION,
      versionHash: HASH_A,
      scannedAt: NOW,
    });
    expect(counters.suggestionsByType).toEqual({ PREVAILS_OVER: 1 });
    expect(counters.inputTokens).toBe(100);
  });

  it("'none' → KEIN Eintrag, aber der Anker wird gesetzt (sonst klassifiziert jeder Lauf neu)", async () => {
    const { writes, deps: d } = deps(ok('{"relation":"none"}'));
    const counters = newRelationsBatchCounters();
    await processRelationDocGroup({ doc: citingDoc, candidates: [candidate] }, OPTS, d, counters);
    expect(counters.none).toBe(1);
    expect(writes).toHaveLength(1);
    expect(writes[0].suggestions).toEqual([]);
    expect(writes[0].anchor).not.toBeNull();
  });

  it("metadata-Antwort ('AMENDS') → Drop-Zähler, NIE geschrieben; Anker gesetzt (Messung fand statt)", async () => {
    const { writes, deps: d } = deps(ok('{"relation":"AMENDS","direction":"a-to-b"}'));
    const counters = newRelationsBatchCounters();
    await processRelationDocGroup({ doc: citingDoc, candidates: [candidate] }, OPTS, d, counters);
    expect(counters.droppedOov).toBe(1);
    expect(counters.suggestionsByType).toEqual({});
    expect(writes).toHaveLength(1);
    expect(writes[0].suggestions).toEqual([]);
    expect(writes[0].anchor).not.toBeNull();
  });

  it('confirmed-Eintrag überlebt den --force-Re-Scan (auch wenn das Modell anders antwortet)', async () => {
    const confirmed = humanEntry('confirmed');
    const doc = { ...citingDoc, relationSuggestions: [confirmed] };
    const { writes, deps: d } = deps(ok('{"relation":"CONCRETIZES","direction":"a-to-b"}'));
    const counters = newRelationsBatchCounters();
    await processRelationDocGroup(
      { doc, candidates: [candidate] },
      { ...OPTS, force: true },
      d,
      counters
    );
    expect(writes).toHaveLength(1);
    // Die menschliche Entscheidung steht unangetastet drin; der frische
    // CONCRETIZES-Vorschlag fürs selbe Ziel wurde verworfen.
    expect(writes[0].suggestions).toEqual([confirmed]);
    expect(counters.skippedHumanPair).toBe(1);
  });

  it('leere Antwort nach allen Retries → Ausfall-Zähler, kein Eintrag, KEIN Anker (Nachholen möglich)', async () => {
    const { writes, deps: d } = deps(async () => ({ text: null, inputTokens: 300, outputTokens: 0 }));
    const counters = newRelationsBatchCounters();
    await processRelationDocGroup({ doc: citingDoc, candidates: [candidate] }, OPTS, d, counters);
    expect(counters.failedDocs).toEqual(['dora:art-1']);
    expect(writes).toHaveLength(0); // nichts zu schreiben, kein Anker — der Re-Run holt das Dokument nach
    expect(counters.inputTokens).toBe(300); // auch der Fehlschlag hat Geld gekostet
  });

  it('API-Fehler → wie Ausfall: kein Eintrag, kein Anker, Lauf geht weiter', async () => {
    const { writes, deps: d } = deps(async () => {
      throw new Error('529 overloaded');
    });
    const counters = newRelationsBatchCounters();
    await expect(
      processRelationDocGroup({ doc: citingDoc, candidates: [candidate] }, OPTS, d, counters)
    ).resolves.toBeUndefined();
    expect(counters.failedDocs).toEqual(['dora:art-1']);
    expect(writes).toHaveLength(0);
  });

  it('Teil-Ausfall (1 von 2 Kandidaten leer) → erfolgreiche Einträge geschrieben, aber KEIN Anker', async () => {
    const secondTarget = { ...targetDoc, regulationKey: 'nis2:art-21', paragraphNumber: 'Art. 21' };
    const secondCandidate: RelationCandidate = { ...candidate, target: secondTarget };
    let call = 0;
    const { writes, deps: d } = deps(async () => {
      call++;
      return call === 1
        ? { text: '{"relation":"PREVAILS_OVER","direction":"a-to-b"}', inputTokens: 100, outputTokens: 10 }
        : { text: null, inputTokens: 100, outputTokens: 0 };
    });
    const counters = newRelationsBatchCounters();
    await processRelationDocGroup(
      { doc: citingDoc, candidates: [candidate, secondCandidate] },
      OPTS,
      d,
      counters
    );
    expect(counters.failedDocs).toEqual(['dora:art-1']);
    expect(writes).toHaveLength(1);
    expect(writes[0].suggestions).toHaveLength(1);
    expect(writes[0].anchor).toBeNull(); // ohne Anker greift der Re-Run das Dokument wieder auf
  });

  it('Idempotenz: passender Anker → Skip, das Modell wird NIE gerufen', async () => {
    const doc = {
      ...citingDoc,
      relationScan: { promptVersion: RELATIONS_PROMPT_VERSION, versionHash: HASH_A },
    };
    let called = 0;
    const { writes, deps: d } = deps(async () => {
      called++;
      return { text: '{"relation":"none"}', inputTokens: 1, outputTokens: 1 };
    });
    const counters = newRelationsBatchCounters();
    await processRelationDocGroup({ doc, candidates: [candidate] }, OPTS, d, counters);
    expect(called).toBe(0);
    expect(writes).toHaveLength(0);
    expect(counters.skippedUpToDate).toBe(1);
  });

  it('dry-run: klassifiziert + zählt, ruft write nie auf', async () => {
    const { writes, deps: d } = deps(ok('{"relation":"PREVAILS_OVER","direction":"a-to-b"}'));
    const counters = newRelationsBatchCounters();
    await processRelationDocGroup(
      { doc: citingDoc, candidates: [candidate] },
      { ...OPTS, dryRun: true },
      d,
      counters
    );
    expect(counters.suggestionsByType).toEqual({ PREVAILS_OVER: 1 });
    expect(writes).toHaveLength(0);
  });

  it('Write-Guard meldet "nicht geschrieben" (Mensch gewann das Rennen) → raceLost, kein Fehler', async () => {
    const d = {
      complete: async () => ({
        text: '{"relation":"PREVAILS_OVER","direction":"a-to-b"}',
        inputTokens: 1,
        outputTokens: 1,
      }),
      write: async () => false,
      now: () => NOW,
    };
    const counters = newRelationsBatchCounters();
    await processRelationDocGroup({ doc: citingDoc, candidates: [candidate] }, OPTS, d, counters);
    expect(counters.raceLost).toBe(1);
    expect(counters.failedDocs).toEqual([]);
  });

  it('Write-Fehler killt den Lauf nicht → failedDocs, Funktion kehrt normal zurück', async () => {
    const d = {
      complete: async () => ({ text: '{"relation":"PREVAILS_OVER","direction":"a-to-b"}', inputTokens: 1, outputTokens: 1 }),
      write: async () => {
        throw new Error('transient Mongo hiccup');
      },
      now: () => NOW,
    };
    const counters = newRelationsBatchCounters();
    await expect(
      processRelationDocGroup({ doc: citingDoc, candidates: [candidate] }, OPTS, d, counters)
    ).resolves.toBeUndefined();
    expect(counters.failedDocs).toEqual(['dora:art-1']);
  });
});
