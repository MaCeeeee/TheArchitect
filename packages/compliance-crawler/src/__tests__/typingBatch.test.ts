/**
 * Typing-Batch Kern-Tests — THE-432 (Slice T) + Review-Fixes.
 *
 * Rein unit: fake clock (feste Date), fake call-Funktionen, kein Netz, kein
 * Mongo (die Crawler-Suite nutzt durchgängig validateSync statt einer echten
 * Verbindung — mongodb-memory-server ist installiert, aber bewusst unbenutzt).
 *
 * Run: cd packages/compliance-crawler && npx jest src/__tests__/typingBatch.test.ts --verbose
 */
import {
  TYPING_BATCH_MODEL,
  shouldSkipDoc,
  assembleTypingSuggestion,
  completeWithRetry,
  parseCliArgs,
  newBatchCounters,
  processTypingDoc,
  type TypingBatchDoc,
  type TypingSuggestion,
} from '../lib/typingBatch';
import { Regulation } from '../db/regulation.model';
import { TYPING_PROMPT_VERSION, NORM_ONTOLOGY } from '@thearchitect/shared';

const HASH = 'f'.repeat(64); // versionHash des aktuellen Dokument-Texts
const OLD_HASH = '0'.repeat(64); // Text-Stand, auf dem ein altes Label entstand

// ─── shouldSkipDoc (AC-4 + Idempotenz + versionHash-Anker) ──────

const CURRENT = {
  force: false,
  promptVersion: TYPING_PROMPT_VERSION,
  ontologyVersion: NORM_ONTOLOGY.ontologyVersion,
  modelId: TYPING_BATCH_MODEL,
};

/** Vorschlag mit dem AKTUELLEN (promptVersion, ontologyVersion, modelId)-Tripel + passendem Text-Anker. */
function upToDateTyping(status: 'suggested' | 'confirmed' | 'rejected') {
  return {
    status,
    promptVersion: CURRENT.promptVersion,
    ontologyVersion: CURRENT.ontologyVersion,
    modelId: CURRENT.modelId,
    versionHash: HASH,
  };
}

describe('shouldSkipDoc (THE-432 AC-4: menschliche Entscheidung schlägt Batch)', () => {
  it('confirmed wird NIE neu getypt — auch nicht mit --force', () => {
    const doc = { versionHash: HASH, typing: upToDateTyping('confirmed') };
    expect(shouldSkipDoc(doc, CURRENT)).toEqual({ skip: true, reason: 'human-decided' });
    expect(shouldSkipDoc(doc, { ...CURRENT, force: true })).toEqual({
      skip: true,
      reason: 'human-decided',
    });
  });

  it('rejected wird ebenso NIE neu getypt — auch nicht mit --force', () => {
    const doc = { versionHash: HASH, typing: upToDateTyping('rejected') };
    expect(shouldSkipDoc(doc, CURRENT)).toEqual({ skip: true, reason: 'human-decided' });
    expect(shouldSkipDoc(doc, { ...CURRENT, force: true })).toEqual({
      skip: true,
      reason: 'human-decided',
    });
  });

  it('confirmed bleibt human-decided, selbst wenn das Tripel veraltet ist', () => {
    const doc = {
      versionHash: HASH,
      typing: { ...upToDateTyping('confirmed'), promptVersion: 'tp-0' },
    };
    expect(shouldSkipDoc(doc, { ...CURRENT, force: true })).toEqual({
      skip: true,
      reason: 'human-decided',
    });
  });

  it('suggested mit identischem Tripel + Text-Anker → skip up-to-date (Idempotenz)', () => {
    const doc = { versionHash: HASH, typing: upToDateTyping('suggested') };
    expect(shouldSkipDoc(doc, CURRENT)).toEqual({ skip: true, reason: 'up-to-date' });
  });

  it('--force überstimmt up-to-date (nur bei suggested)', () => {
    const doc = { versionHash: HASH, typing: upToDateTyping('suggested') };
    expect(shouldSkipDoc(doc, { ...CURRENT, force: true })).toEqual({ skip: false });
  });

  it.each([
    ['promptVersion', { promptVersion: 'tp-1' }],
    ['ontologyVersion', { ontologyVersion: '1.0.0' }],
    ['modelId', { modelId: 'claude-other-model' }],
  ])('abweichende %s im Tripel → kein Skip (Re-Typing gewollt)', (_name, override) => {
    const doc = { versionHash: HASH, typing: { ...upToDateTyping('suggested'), ...override } };
    expect(shouldSkipDoc(doc, CURRENT)).toEqual({ skip: false });
  });

  it('ungetyptes Dokument → kein Skip', () => {
    expect(shouldSkipDoc({ versionHash: HASH }, CURRENT)).toEqual({ skip: false });
    expect(shouldSkipDoc({ versionHash: HASH, typing: undefined }, CURRENT)).toEqual({
      skip: false,
    });
  });

  // Review-Fix 1: versionHash-Anker — die Crawl-Route aktualisiert Dokumente
  // in place (Novelle → neuer versionHash, typing überlebt). Ohne Anker sähe
  // ein Label zum ALTEN Text wie "up-to-date" aus.
  describe('versionHash-Anker (Novellen-Szenario)', () => {
    it('suggested mit altem Text-Anker → kein Skip (Label beschreibt den alten Text)', () => {
      const doc = {
        versionHash: HASH,
        typing: { ...upToDateTyping('suggested'), versionHash: OLD_HASH },
      };
      expect(shouldSkipDoc(doc, CURRENT)).toEqual({ skip: false });
    });

    it('suggested OHNE Text-Anker (Vor-Anker-Bestand) → kein Skip (Backfill gewollt)', () => {
      const { versionHash: _vh, ...unanchored } = upToDateTyping('suggested');
      const doc = { versionHash: HASH, typing: unanchored };
      expect(shouldSkipDoc(doc, CURRENT)).toEqual({ skip: false });
    });

    it('confirmed mit altem Text-Anker → skip, aber human-decided-stale (Re-Review-Signal, kein Re-Typing)', () => {
      const doc = {
        versionHash: HASH,
        typing: { ...upToDateTyping('confirmed'), versionHash: OLD_HASH },
      };
      expect(shouldSkipDoc(doc, CURRENT)).toEqual({ skip: true, reason: 'human-decided-stale' });
      // AC-4 hält auch hier: --force typt keine menschliche Entscheidung neu.
      expect(shouldSkipDoc(doc, { ...CURRENT, force: true })).toEqual({
        skip: true,
        reason: 'human-decided-stale',
      });
    });

    it('rejected mit altem Text-Anker → ebenso human-decided-stale', () => {
      const doc = {
        versionHash: HASH,
        typing: { ...upToDateTyping('rejected'), versionHash: OLD_HASH },
      };
      expect(shouldSkipDoc(doc, CURRENT)).toEqual({ skip: true, reason: 'human-decided-stale' });
    });
  });
});

// ─── assembleTypingSuggestion (AC-1 Provenance, AC-2 Telemetrie) ─

describe('assembleTypingSuggestion', () => {
  const NOW = new Date('2026-07-23T12:00:00.000Z'); // fake clock — deterministisch
  const META = { modelId: TYPING_BATCH_MODEL, now: NOW, versionHash: HASH };

  it('trägt die volle Provenance (AC-1): modelId, promptVersion, ontologyVersion, versionHash, typedAt, status suggested', () => {
    const s = assembleTypingSuggestion({ labels: { normKind: 'eu-regulation' }, dropped: [] }, META);
    expect(s.modelId).toBe(TYPING_BATCH_MODEL);
    expect(s.promptVersion).toBe(TYPING_PROMPT_VERSION);
    expect(s.ontologyVersion).toBe(NORM_ONTOLOGY.ontologyVersion);
    expect(s.versionHash).toBe(HASH); // Review-Fix 1: Anker an den getypten Text
    expect(s.typedAt).toBe(NOW);
    expect(s.status).toBe('suggested');
  });

  it('null (= "na", bewusste Nicht-Anwendbarkeit) bleibt null; fehlende Achse bleibt fehlend', () => {
    const s = assembleTypingSuggestion(
      { labels: { normKind: 'eu-regulation', obligationKind: null }, dropped: [] },
      META
    );
    expect(s.normKind).toBe('eu-regulation');
    expect(s.obligationKind).toBeNull(); // echtes Label, kein Loch
    expect('partyRole' in s).toBe(false); // offen ≠ na — Achse bleibt ABWESEND
    expect('provisionKind' in s).toBe(false);
  });

  it('droppedAxes nur wenn nicht leer (AC-2)', () => {
    const clean = assembleTypingSuggestion(
      { labels: { normKind: 'eu-regulation' }, dropped: [] },
      META
    );
    expect('droppedAxes' in clean).toBe(false);

    const dropped = assembleTypingSuggestion(
      { labels: {}, dropped: ['partyRole', 'provisionKind'] },
      META
    );
    expect(dropped.droppedAxes).toEqual(['partyRole', 'provisionKind']);
  });
});

// ─── completeWithRetry (leere Antwort = fehlgeschlagene Messung) ─

describe('completeWithRetry', () => {
  const noSleep = async (): Promise<void> => {}; // fake clock: kein echtes Warten im Test

  function fakeCall(responses: Array<string>) {
    const calls: number[] = []; // empfangene maxTokens-Budgets
    const call = async (maxTokens: number) => {
      calls.push(maxTokens);
      const text = responses[calls.length - 1] ?? '';
      return { text, inputTokens: 100, outputTokens: 10 };
    };
    return { call, calls };
  }

  it('nicht-leere Erstantwort → genau ein Call, Basis-Budget 400', async () => {
    const { call, calls } = fakeCall(['{"normKind":"eu-regulation"}']);
    const res = await completeWithRetry(call, { sleep: noSleep });
    expect(res).toEqual({
      text: '{"normKind":"eu-regulation"}',
      inputTokens: 100,
      outputTokens: 10,
    });
    expect(calls).toEqual([400]);
  });

  it('leer → Retry mit verdoppeltem Budget → Erfolg; Tokens über beide Anläufe akkumuliert', async () => {
    const { call, calls } = fakeCall(['', '{"ok":true}']);
    const res = await completeWithRetry(call, { sleep: noSleep });
    expect(res).toEqual({ text: '{"ok":true}', inputTokens: 200, outputTokens: 20 });
    expect(calls).toEqual([400, 800]);
  });

  it('3× leer → text null, aber Tokens ERHALTEN (Review-Fix 3: auch der Fehlschlag hat Geld gekostet)', async () => {
    const sleeps: number[] = [];
    const { call, calls } = fakeCall(['', '   \n ', '']); // Whitespace zählt als leer
    const res = await completeWithRetry(call, {
      sleep: async (ms) => {
        sleeps.push(ms);
      },
    });
    expect(res).toEqual({ text: null, inputTokens: 300, outputTokens: 30 });
    expect(calls).toEqual([400, 800, 1600]);
    expect(sleeps).toEqual([500, 1000]); // linear wachsend, KEIN Sleep nach dem letzten Anlauf
  });

  it('attempts/baseMaxTokens sind übersteuerbar; Erschöpfung trägt die akkumulierten Tokens', async () => {
    const { call, calls } = fakeCall(['', '']);
    const res = await completeWithRetry(call, { attempts: 2, baseMaxTokens: 100, sleep: noSleep });
    expect(res).toEqual({ text: null, inputTokens: 200, outputTokens: 20 });
    expect(calls).toEqual([100, 200]);
  });
});

// ─── parseCliArgs (Review-Fix 6: NaN-Guards) ────────────────────

describe('parseCliArgs', () => {
  it('parst alle Flags', () => {
    const r = parseCliArgs([
      '--limit',
      '20',
      '--source',
      'dsgvo',
      '--dry-run',
      '--force',
      '--concurrency',
      '2',
    ]);
    expect(r).toEqual({
      ok: true,
      args: { limit: 20, source: 'dsgvo', dryRun: true, force: true, concurrency: 2 },
    });
  });

  it('Defaults: kein Limit, keine Source, concurrency 4', () => {
    const r = parseCliArgs([]);
    expect(r).toEqual({
      ok: true,
      args: { limit: undefined, source: undefined, dryRun: false, force: false, concurrency: 4 },
    });
  });

  it('--limit abc → Fehler statt stillem Voll-Lauf (das wäre ein bezahlter Unfall)', () => {
    const r = parseCliArgs(['--limit', 'abc']);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain('--limit');
  });

  it('--limit 0 → Fehler (Limit < 1 ist nie gemeint)', () => {
    expect(parseCliArgs(['--limit', '0']).ok).toBe(false);
  });

  it('--limit ohne Wert → Fehler', () => {
    expect(parseCliArgs(['--limit']).ok).toBe(false);
  });

  it('--concurrency abc → Fehler statt stillem No-op (0 Worker täten schlicht nichts)', () => {
    const r = parseCliArgs(['--concurrency', 'abc']);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain('--concurrency');
  });

  it('--concurrency 0 → Fehler', () => {
    expect(parseCliArgs(['--concurrency', '0']).ok).toBe(false);
  });
});

// ─── processTypingDoc (Pipeline pur: Zähler, Resilienz, TOCTOU) ─

describe('processTypingDoc', () => {
  const NOW = new Date('2026-07-23T12:00:00.000Z');

  const doc: TypingBatchDoc = {
    _id: 'id-1',
    regulationKey: 'dsgvo:art-6',
    versionHash: HASH,
    source: 'dsgvo',
    paragraphNumber: 'Art. 6',
    title: 'Lawfulness of processing',
    fullText: 'x'.repeat(60),
    language: 'en',
  };

  const OPTS = { ...CURRENT, dryRun: false };

  function deps(overrides?: {
    complete?: (
      user: string
    ) => Promise<{ text: string | null; inputTokens: number; outputTokens: number }>;
    write?: (id: unknown, s: TypingSuggestion) => Promise<boolean>;
  }) {
    const writes: Array<{ id: unknown; suggestion: TypingSuggestion }> = [];
    return {
      writes,
      deps: {
        complete:
          overrides?.complete ??
          // 'legislation' ist ein ECHTER E6-Wert — der Happy Path läuft durch
          // parsePrelabelLabels, ein erfundener Wert würde korrekt OOV-fallen.
          (async () => ({
            text: '{"normKind":"legislation","obligationKind":"na"}',
            inputTokens: 100,
            outputTokens: 10,
          })),
        write:
          overrides?.write ??
          (async (id: unknown, suggestion: TypingSuggestion) => {
            writes.push({ id, suggestion });
            return true;
          }),
        now: () => NOW,
      },
    };
  }

  it('Happy Path: typt, schreibt Vorschlag mit Text-Anker, zählt Tokens', async () => {
    const { writes, deps: d } = deps();
    const counters = newBatchCounters();
    await processTypingDoc(doc, OPTS, d, counters);
    expect(counters.typed).toBe(1);
    expect(counters.failed).toEqual([]);
    expect(counters.inputTokens).toBe(100);
    expect(counters.outputTokens).toBe(10);
    expect(writes).toHaveLength(1);
    expect(writes[0].id).toBe('id-1');
    expect(writes[0].suggestion.versionHash).toBe(HASH);
    expect(writes[0].suggestion.normKind).toBe('legislation');
    expect(writes[0].suggestion.obligationKind).toBeNull();
  });

  it('Review-Fix 2: ein Write-Fehler killt den Lauf nicht — failed-Liste, Funktion kehrt normal zurück', async () => {
    const { deps: d } = deps({
      write: async () => {
        throw new Error('transient Mongo hiccup');
      },
    });
    const counters = newBatchCounters();
    await expect(processTypingDoc(doc, OPTS, d, counters)).resolves.toBeUndefined();
    expect(counters.typed).toBe(0);
    expect(counters.failed).toEqual(['dsgvo:art-6']);
    // Tokens wurden trotzdem gezählt — der Modell-Call hat stattgefunden.
    expect(counters.inputTokens).toBe(100);
  });

  it('Review-Fix 3: text null (Messung fehlgeschlagen) → failed, aber Tokens gezählt', async () => {
    const { writes, deps: d } = deps({
      complete: async () => ({ text: null, inputTokens: 300, outputTokens: 30 }),
    });
    const counters = newBatchCounters();
    await processTypingDoc(doc, OPTS, d, counters);
    expect(counters.typed).toBe(0);
    expect(counters.failed).toEqual(['dsgvo:art-6']);
    expect(counters.inputTokens).toBe(300);
    expect(counters.outputTokens).toBe(30);
    expect(writes).toHaveLength(0); // fehlgeschlagene Messung schreibt NIE ein Label
  });

  it('complete wirft (API-Fehler) → failed, kein Write, Lauf geht weiter', async () => {
    const { writes, deps: d } = deps({
      complete: async () => {
        throw new Error('529 overloaded');
      },
    });
    const counters = newBatchCounters();
    await expect(processTypingDoc(doc, OPTS, d, counters)).resolves.toBeUndefined();
    expect(counters.failed).toEqual(['dsgvo:art-6']);
    expect(writes).toHaveLength(0);
  });

  it('Review-Fix 4: Write-Guard meldet "nicht geschrieben" (Mensch gewann das Rennen) → human-decided, nicht typed', async () => {
    const { deps: d } = deps({ write: async () => false });
    const counters = newBatchCounters();
    await processTypingDoc(doc, OPTS, d, counters);
    expect(counters.typed).toBe(0);
    expect(counters.skippedHuman).toBe(1);
    expect(counters.failed).toEqual([]);
  });

  it('Review-Fix 1: confirmed auf veraltetem Text → Zähler skippedHumanStale (Summary: braucht menschliche Re-Review)', async () => {
    const staleDoc: TypingBatchDoc = {
      ...doc,
      typing: { ...upToDateTyping('confirmed'), versionHash: OLD_HASH },
    };
    const { writes, deps: d } = deps();
    const counters = newBatchCounters();
    await processTypingDoc(staleDoc, OPTS, d, counters);
    expect(counters.skippedHumanStale).toBe(1);
    expect(counters.typed).toBe(0);
    expect(writes).toHaveLength(0);
  });

  it('dry-run: klassifiziert + zählt, ruft write nie auf', async () => {
    const { writes, deps: d } = deps();
    const counters = newBatchCounters();
    await processTypingDoc(doc, { ...OPTS, dryRun: true }, d, counters);
    expect(counters.typed).toBe(1);
    expect(writes).toHaveLength(0);
  });

  it('zählt OOV-Drops pro Achse (AC-2)', async () => {
    const { deps: d } = deps({
      complete: async () => ({
        text: '{"normKind":"invented-kind","partyRole":"martian"}',
        inputTokens: 50,
        outputTokens: 5,
      }),
    });
    const counters = newBatchCounters();
    await processTypingDoc(doc, OPTS, d, counters);
    expect(counters.droppedPerAxis).toEqual({ normKind: 1, partyRole: 1 });
  });
});

// ─── Schema: typing-Subdokument (null-Erhalt auf Dokument-Ebene) ─
//
// Die Crawler-Suite hat kein Live-Mongo (siehe Kopfkommentar) — der
// Save/Read-Beweis auf Draht-Ebene ist hier nicht führbar. Bewiesen wird die
// Dokument-Ebene: mongoose castet null auf einem optionalen String-Pfad NICHT
// weg (null umgeht Cast+Setter), und toObject() serialisiert null ≠ fehlend.
// Das ist exakt die Repräsentation, die der Treiber ans BSON übergibt.

describe('Regulation.typing Subdokument (THE-432 Schema-Erweiterung)', () => {
  const base = {
    regulationKey: 'dsgvo:art-6',
    versionHash: HASH,
    source: 'dsgvo',
    jurisdiction: 'EU',
    paragraphNumber: 'Art. 6',
    title: 'Lawfulness of processing',
    fullText: 'x'.repeat(60),
    sourceUrl: 'https://example.org/law',
    effectiveFrom: new Date('2024-01-01'),
    language: 'en',
  };

  const typing = {
    normKind: 'eu-regulation',
    obligationKind: null, // "na" — bewusst nicht anwendbar
    modelId: TYPING_BATCH_MODEL,
    promptVersion: TYPING_PROMPT_VERSION,
    ontologyVersion: NORM_ONTOLOGY.ontologyVersion,
    versionHash: HASH,
    typedAt: new Date('2026-07-23T12:00:00.000Z'),
    status: 'suggested',
  };

  it('validiert und erhält null vs. fehlend über den Dokument-Roundtrip', () => {
    const doc = new Regulation({ ...base, typing });
    expect(doc.validateSync()).toBeUndefined();

    const obj = doc.toObject();
    expect(obj.typing?.normKind).toBe('eu-regulation');
    expect(obj.typing?.obligationKind).toBeNull(); // null überlebt (echtes Label)
    expect(obj.typing && 'partyRole' in obj.typing && obj.typing.partyRole != null).toBe(false); // fehlend bleibt fehlend
    expect(obj.typing?.status).toBe('suggested');
    expect(obj.typing?.versionHash).toBe(HASH); // Review-Fix 1: Text-Anker persistiert
    expect(obj.typing?.droppedAxes).toBeUndefined(); // kein Auto-[] — Telemetrie nur wenn real
  });

  it('lehnt einen unbekannten status ab (enum)', () => {
    const doc = new Regulation({ ...base, typing: { ...typing, status: 'maybe' } });
    expect(doc.validateSync()?.errors?.['typing.status']).toBeDefined();
  });

  it('lehnt typing OHNE versionHash ab (Anker ist Pflicht-Provenance, Review-Fix 1)', () => {
    const { versionHash: _vh, ...unanchored } = typing;
    const doc = new Regulation({ ...base, typing: unanchored });
    expect(doc.validateSync()?.errors?.['typing.versionHash']).toBeDefined();
  });

  it('Dokument ohne typing bleibt gültig (additiv, Bestandsdaten unberührt)', () => {
    const doc = new Regulation(base);
    expect(doc.validateSync()).toBeUndefined();
    expect(doc.typing).toBeUndefined();
  });
});
