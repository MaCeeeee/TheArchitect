/**
 * prelabel-typing pure functions — THE-430 Slice 1 (LLM-Prelabel, ohne API).
 *
 * Run: cd packages/server && npx jest src/__tests__/prelabelTyping.test.ts
 */
import { buildPrelabelUserPrompt, parsePrelabelLabels } from '../scripts/prelabel-typing';
import { TYPING_AXES } from '../evals/typingGolden';

describe('buildPrelabelUserPrompt', () => {
  const prov = {
    source: 'dsgvo',
    paragraphNumber: 'art-5',
    title: 'Grundsätze',
    fullText: 'Personenbezogene Daten müssen rechtmäßig verarbeitet werden.',
    language: 'de' as const,
  };

  it('listet alle vier E6-Achsen + den Provisions-Text', () => {
    const p = buildPrelabelUserPrompt(prov);
    expect(p).toContain('normKind:');
    expect(p).toContain('bindingness:');
    expect(p).toContain('obligationKind:');
    expect(p).toContain('partyRole:');
    // geschlossene Räume injiziert
    expect(p).toContain('obligation (Obligation / Gebot)');
    expect(p).toContain('controller');
    expect(p).toContain('Personenbezogene Daten müssen');
    expect(p).toContain('"na"');
  });

  it('lists all five axes in the prompt', () => {
    const p = buildPrelabelUserPrompt(prov);
    for (const axis of TYPING_AXES) expect(p).toContain(axis);
    expect(p).toContain('scope-applicability'); // provisionKind options are present
  });

  it('does not hardcode an axis count in the prompt text', () => {
    expect(buildPrelabelUserPrompt(prov)).not.toContain('four axes');
  });
});

describe('parsePrelabelLabels', () => {
  it('mappt gültige Werte auf Labels', () => {
    const { labels, dropped } = parsePrelabelLabels(
      '{"normKind":"legislation","bindingness":"binding","obligationKind":"obligation","partyRole":"controller"}'
    );
    expect(labels).toEqual({
      normKind: 'legislation',
      bindingness: 'binding',
      obligationKind: 'obligation',
      partyRole: 'controller',
    });
    expect(dropped).toEqual([]);
  });

  it('"na" → null (bewusst nicht anwendbar)', () => {
    const { labels } = parsePrelabelLabels('{"normKind":"legislation","obligationKind":"na","partyRole":"na"}');
    expect(labels.obligationKind).toBeNull();
    expect(labels.partyRole).toBeNull();
    expect(labels.normKind).toBe('legislation');
  });

  it('OOV-Wert → verworfen (Achse offen), in dropped gezählt', () => {
    const { labels, dropped } = parsePrelabelLabels('{"obligationKind":"duty","normKind":"invented_kind"}');
    expect(labels.obligationKind).toBeUndefined();
    expect(labels.normKind).toBeUndefined();
    expect(dropped.sort()).toEqual(['normKind', 'obligationKind']);
  });

  it('fehlende Achse → offen (undefined), nicht null', () => {
    const { labels } = parsePrelabelLabels('{"normKind":"legislation"}');
    expect('bindingness' in labels).toBe(false);
  });

  it('extrahiert JSON aus umgebendem Text', () => {
    const { labels } = parsePrelabelLabels('Here you go: {"normKind":"guideline"} — done');
    expect(labels.normKind).toBe('guideline');
  });

  it('kaputtes/leeres JSON → alle Achsen offen, kein Throw', () => {
    expect(() => parsePrelabelLabels('not json at all')).not.toThrow();
    expect(parsePrelabelLabels('not json').labels).toEqual({});
  });

  it('drops an out-of-vocabulary provisionKind and leaves the axis open', () => {
    const { labels, dropped } = parsePrelabelLabels('{"provisionKind":"bogus"}');
    expect(labels.provisionKind).toBeUndefined();
    expect(dropped).toContain('provisionKind');
  });

  it('accepts a valid provisionKind and maps "na" to null', () => {
    expect(parsePrelabelLabels('{"provisionKind":"obligation"}').labels.provisionKind).toBe('obligation');
    expect(parsePrelabelLabels('{"provisionKind":"na"}').labels.provisionKind).toBeNull();
  });
});

// Gleiche Lehre wie beim Beziehungs-Prüfsatz: die Abgrenzungsregeln standen nur
// in der Rubrik, die kein Prüfer zu sehen bekam. Ein Kappa misst nur dann eine
// unklare Aufgabendefinition, wenn die Prüfer die Definition auch bekommen haben.
describe('buildPrelabelUserPrompt — Rubrik-Regeln im Prompt', () => {
  const provision = {
    source: 'dsgvo',
    paragraphNumber: 'Art. 2',
    title: 'Anwendungsbereich',
    fullText: 'x'.repeat(60),
    language: 'de',
  } as never;

  it('carries all three contentious distinctions from B3', () => {
    const p = buildPrelabelUserPrompt(provision);
    expect(p).toContain('scope-applicability vs. definition');
    expect(p).toContain('obligation vs. procedural');
    expect(p).toContain('obligation vs. enforcement-supervision');
  });

  it('states that normKind/bindingness follow the source document, not the provision', () => {
    const p = buildPrelabelUserPrompt(provision);
    expect(p).toContain('describe the DOCUMENT');
    expect(p).toContain('not itself a');
  });
});

// ─── Provider-Unabhängigkeit (THE-421) ──────────────────────────
//
// Zweiter Prüfer muss aus einem ANDEREN Modell-Haus kommen, sonst ist der Kappa
// durch geteilte Trainingsherkunft aufgebläht. Was dabei NICHT variieren darf:
// der Prompt. Gemessen wird Prüfer-Unabhängigkeit, nicht Prompt-Unterschied.
import { runTypingPrelabel } from '../scripts/prelabel-typing';
import { withEmptyResponseRetry, type RaterClient, type RaterRequest } from '../evals/raterClient';
import { TypingGoldenSetSchema, type TypingGoldenSet } from '../evals/typingGolden';

function recorder(provider: 'anthropic' | 'openrouter', model: string, reply: string) {
  const requests: RaterRequest[] = [];
  const client: RaterClient = {
    provider,
    model,
    async complete(req) {
      requests.push(req);
      return { text: reply, inputTokens: 3, outputTokens: 5 };
    },
  };
  return { client, requests };
}

const draft: TypingGoldenSet = {
  version: 'v1',
  frozen: false,
  ontologyVersion: 'e6-1.6.0',
  rubricRef: 'RUBRIC.md',
  cases: [
    {
      caseId: 'dsgvo-art-5',
      source: 'dsgvo',
      paragraphNumber: 'Art. 5',
      title: 'Grundsätze',
      fullText: 'Personenbezogene Daten müssen auf rechtmäßige Weise und in einer für die betroffene Person nachvollziehbaren Weise verarbeitet werden.',
      language: 'de',
      jurisdiction: 'eu',
      labels: {},
    },
  ],
};

describe('runTypingPrelabel — Provider-Austausch ändert den Prompt nicht', () => {
  it('hands byte-identical system and user prompts to both providers', async () => {
    const a = recorder('anthropic', 'claude-haiku-4-5-20251001', '{"normKind":"legislation"}');
    const b = recorder('openrouter', 'openai/gpt-5', '{"normKind":"legislation"}');
    await runTypingPrelabel(draft, a.client);
    await runTypingPrelabel(draft, b.client);
    expect(a.requests).toHaveLength(1);
    expect(b.requests).toHaveLength(1);
    expect(a.requests[0].system).toBe(b.requests[0].system);
    expect(a.requests[0].user).toBe(b.requests[0].user);
    expect(a.requests[0].maxTokens).toBe(b.requests[0].maxTokens);
  });

  it('stamps the provider into the annotator so a pass is attributable from the file alone', async () => {
    const a = recorder('anthropic', 'claude-haiku-4-5-20251001', '{"normKind":"legislation"}');
    const b = recorder('openrouter', 'openai/gpt-5', '{"normKind":"legislation"}');
    const ra = await runTypingPrelabel(draft, a.client);
    const rb = await runTypingPrelabel(draft, b.client);
    expect(ra.cases[0].annotator).toBe('llm-prelabel:anthropic:claude-haiku-4-5-20251001');
    expect(rb.cases[0].annotator).toBe('llm-prelabel:openrouter:openai/gpt-5');
    expect(ra.cases[0].annotator).not.toBe(rb.cases[0].annotator);
  });

  it('accumulates token usage and OOV drops from the client responses', async () => {
    const a = recorder('anthropic', 'claude-haiku-4-5-20251001', '{"normKind":"invented"}');
    const r = await runTypingPrelabel(draft, a.client);
    expect(r.inputTokens).toBe(3);
    expect(r.outputTokens).toBe(5);
    expect(r.droppedTotal).toBe(1);
  });
});

// ─── Fehlgeschlagene Messung ≠ Enthaltung (THE-421) ─────────────
//
// 18 von 100 Fällen kamen im Live-Lauf leer zurück und verschwanden lautlos
// als "offen" aus dem Kappa. Der Lauf muss sie deshalb als AUSFALL zählen und
// im Artefakt markieren — sonst ist ein Messfehler von einer bewussten
// Nicht-Aussage des Prüfers nicht mehr zu unterscheiden.
describe('runTypingPrelabel — leere Antwort zählt als Ausfall, nicht als offen', () => {
  it('counts an exhausted case as a failed measurement and marks it in the case', async () => {
    const a = recorder('openrouter', 'openai/gpt-5', '');
    const r = await runTypingPrelabel(draft, a.client);
    expect(r.noResponseTotal).toBe(1);
    expect(r.noResponseCaseIds).toEqual(['dsgvo-art-5']);
    expect(r.cases[0].measurementFailed).toBe(true);
    // Kein Ersatz-Label, kein Default — die Achsen bleiben leer.
    expect(r.cases[0].labels).toEqual({});
    // Ein Ausfall ist KEIN OOV-Drop; die beiden Zähler dürfen sich nicht mischen.
    expect(r.droppedTotal).toBe(0);
  });

  it('does not mark a genuine "na" answer as a failure — that is a real label', async () => {
    const a = recorder('openrouter', 'openai/gpt-5', '{"obligationKind":"na"}');
    const r = await runTypingPrelabel(draft, a.client);
    expect(r.noResponseTotal).toBe(0);
    expect(r.cases[0].measurementFailed).toBeUndefined();
    expect(r.cases[0].labels.obligationKind).toBeNull();
  });

  it('a case rescued by the client retry is a normal labeled case, not a failure', async () => {
    const replies = ['', '{"normKind":"legislation"}'];
    let n = 0;
    const client: RaterClient = {
      provider: 'openrouter',
      model: 'openai/gpt-5',
      async complete() {
        const text = replies[Math.min(n++, replies.length - 1)];
        return { text, inputTokens: 1, outputTokens: 1 };
      },
    };
    const r = await runTypingPrelabel(draft, withEmptyResponseRetry(client, { sleep: async () => {} }));
    expect(r.noResponseTotal).toBe(0);
    expect(r.cases[0].measurementFailed).toBeUndefined();
    expect(r.cases[0].labels.normKind).toBe('legislation');
  });

  it('a failed case survives schema validation so the marker reaches the artifact', () => {
    const out = {
      ...draft,
      cases: [{ ...draft.cases[0], labels: {}, measurementFailed: true }],
    };
    const parsed = TypingGoldenSetSchema.parse(out);
    expect(parsed.cases[0].measurementFailed).toBe(true);
  });
});

// GPT-5 antwortet häufiger in einem Markdown-Codeblock als Claude. Der Parser
// muss das aushalten — der Prompt wird dafür NICHT aufgeweicht.
describe('parsePrelabelLabels — OpenAI-typische Antwortformen', () => {
  it('parses a fenced ```json block', () => {
    const fenced = '```json\n{"normKind":"legislation","provisionKind":"obligation"}\n```';
    const r = parsePrelabelLabels(fenced);
    expect(r.labels.normKind).toBe('legislation');
    expect(r.labels.provisionKind).toBe('obligation');
  });

  it('parses a fenced block with prose around it', () => {
    const wrapped = 'Here is my answer:\n\n```json\n{"normKind":"legislation"}\n```\n\nHope that helps.';
    expect(parsePrelabelLabels(wrapped).labels.normKind).toBe('legislation');
  });
});
