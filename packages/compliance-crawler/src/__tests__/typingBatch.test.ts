/**
 * Typing-Batch Kern-Tests — THE-432 (Slice T).
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
} from '../lib/typingBatch';
import { Regulation } from '../db/regulation.model';
import { TYPING_PROMPT_VERSION, NORM_ONTOLOGY } from '@thearchitect/shared';

// ─── shouldSkipDoc (AC-4 + Idempotenz) ──────────────────────────

const CURRENT = {
  force: false,
  promptVersion: TYPING_PROMPT_VERSION,
  ontologyVersion: NORM_ONTOLOGY.ontologyVersion,
  modelId: TYPING_BATCH_MODEL,
};

/** Vorschlag mit dem AKTUELLEN (promptVersion, ontologyVersion, modelId)-Tripel. */
function upToDateTyping(status: 'suggested' | 'confirmed' | 'rejected') {
  return {
    status,
    promptVersion: CURRENT.promptVersion,
    ontologyVersion: CURRENT.ontologyVersion,
    modelId: CURRENT.modelId,
  };
}

describe('shouldSkipDoc (THE-432 AC-4: menschliche Entscheidung schlägt Batch)', () => {
  it('confirmed wird NIE neu getypt — auch nicht mit --force', () => {
    const doc = { typing: upToDateTyping('confirmed') };
    expect(shouldSkipDoc(doc, CURRENT)).toEqual({ skip: true, reason: 'human-decided' });
    expect(shouldSkipDoc(doc, { ...CURRENT, force: true })).toEqual({
      skip: true,
      reason: 'human-decided',
    });
  });

  it('rejected wird ebenso NIE neu getypt — auch nicht mit --force', () => {
    const doc = { typing: upToDateTyping('rejected') };
    expect(shouldSkipDoc(doc, CURRENT)).toEqual({ skip: true, reason: 'human-decided' });
    expect(shouldSkipDoc(doc, { ...CURRENT, force: true })).toEqual({
      skip: true,
      reason: 'human-decided',
    });
  });

  it('confirmed bleibt human-decided, selbst wenn das Tripel veraltet ist', () => {
    const doc = {
      typing: { ...upToDateTyping('confirmed'), promptVersion: 'tp-0' },
    };
    expect(shouldSkipDoc(doc, { ...CURRENT, force: true })).toEqual({
      skip: true,
      reason: 'human-decided',
    });
  });

  it('suggested mit identischem Tripel → skip up-to-date (Idempotenz)', () => {
    const doc = { typing: upToDateTyping('suggested') };
    expect(shouldSkipDoc(doc, CURRENT)).toEqual({ skip: true, reason: 'up-to-date' });
  });

  it('--force überstimmt up-to-date (nur bei suggested)', () => {
    const doc = { typing: upToDateTyping('suggested') };
    expect(shouldSkipDoc(doc, { ...CURRENT, force: true })).toEqual({ skip: false });
  });

  it.each([
    ['promptVersion', { promptVersion: 'tp-1' }],
    ['ontologyVersion', { ontologyVersion: '1.0.0' }],
    ['modelId', { modelId: 'claude-other-model' }],
  ])('abweichende %s im Tripel → kein Skip (Re-Typing gewollt)', (_name, override) => {
    const doc = { typing: { ...upToDateTyping('suggested'), ...override } };
    expect(shouldSkipDoc(doc, CURRENT)).toEqual({ skip: false });
  });

  it('ungetyptes Dokument → kein Skip', () => {
    expect(shouldSkipDoc({}, CURRENT)).toEqual({ skip: false });
    expect(shouldSkipDoc({ typing: undefined }, CURRENT)).toEqual({ skip: false });
  });
});

// ─── assembleTypingSuggestion (AC-1 Provenance, AC-2 Telemetrie) ─

describe('assembleTypingSuggestion', () => {
  const NOW = new Date('2026-07-23T12:00:00.000Z'); // fake clock — deterministisch

  it('trägt die volle Provenance (AC-1): modelId, promptVersion, ontologyVersion, typedAt, status suggested', () => {
    const s = assembleTypingSuggestion(
      { labels: { normKind: 'eu-regulation' }, dropped: [] },
      { modelId: TYPING_BATCH_MODEL, now: NOW }
    );
    expect(s.modelId).toBe(TYPING_BATCH_MODEL);
    expect(s.promptVersion).toBe(TYPING_PROMPT_VERSION);
    expect(s.ontologyVersion).toBe(NORM_ONTOLOGY.ontologyVersion);
    expect(s.typedAt).toBe(NOW);
    expect(s.status).toBe('suggested');
  });

  it('null (= "na", bewusste Nicht-Anwendbarkeit) bleibt null; fehlende Achse bleibt fehlend', () => {
    const s = assembleTypingSuggestion(
      { labels: { normKind: 'eu-regulation', obligationKind: null }, dropped: [] },
      { modelId: TYPING_BATCH_MODEL, now: NOW }
    );
    expect(s.normKind).toBe('eu-regulation');
    expect(s.obligationKind).toBeNull(); // echtes Label, kein Loch
    expect('partyRole' in s).toBe(false); // offen ≠ na — Achse bleibt ABWESEND
    expect('provisionKind' in s).toBe(false);
  });

  it('droppedAxes nur wenn nicht leer (AC-2)', () => {
    const clean = assembleTypingSuggestion(
      { labels: { normKind: 'eu-regulation' }, dropped: [] },
      { modelId: TYPING_BATCH_MODEL, now: NOW }
    );
    expect('droppedAxes' in clean).toBe(false);

    const dropped = assembleTypingSuggestion(
      { labels: {}, dropped: ['partyRole', 'provisionKind'] },
      { modelId: TYPING_BATCH_MODEL, now: NOW }
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

  it('3× leer → null (fehlgeschlagene Messung), Budgets 400/800/1600, linearer Backoff', async () => {
    const sleeps: number[] = [];
    const { call, calls } = fakeCall(['', '   \n ', '']); // Whitespace zählt als leer
    const res = await completeWithRetry(call, {
      sleep: async (ms) => {
        sleeps.push(ms);
      },
    });
    expect(res).toBeNull();
    expect(calls).toEqual([400, 800, 1600]);
    expect(sleeps).toEqual([500, 1000]); // linear wachsend, KEIN Sleep nach dem letzten Anlauf
  });

  it('attempts/baseMaxTokens sind übersteuerbar', async () => {
    const { call, calls } = fakeCall(['', '']);
    const res = await completeWithRetry(call, { attempts: 2, baseMaxTokens: 100, sleep: noSleep });
    expect(res).toBeNull();
    expect(calls).toEqual([100, 200]);
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
    versionHash: 'a'.repeat(64),
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
    expect(obj.typing?.droppedAxes).toBeUndefined(); // kein Auto-[] — Telemetrie nur wenn real
  });

  it('lehnt einen unbekannten status ab (enum)', () => {
    const doc = new Regulation({ ...base, typing: { ...typing, status: 'maybe' } });
    expect(doc.validateSync()?.errors?.['typing.status']).toBeDefined();
  });

  it('Dokument ohne typing bleibt gültig (additiv, Bestandsdaten unberührt)', () => {
    const doc = new Regulation(base);
    expect(doc.validateSync()).toBeUndefined();
    expect(doc.typing).toBeUndefined();
  });
});
