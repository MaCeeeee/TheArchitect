/**
 * prelabel-typing pure functions — THE-430 Slice 1 (LLM-Prelabel, ohne API).
 *
 * Run: cd packages/server && npx jest src/__tests__/prelabelTyping.test.ts
 */
import { buildPrelabelUserPrompt, parsePrelabelLabels, PRELABEL_SYSTEM } from '../scripts/prelabel-typing';
import { TYPING_PROMPT_VERSION } from '@thearchitect/shared';
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

// ─── B3a-Präzedenzen im Prompt (THE-432, tp-2) ──────────────────
//
// Die Adjudikation vom 2026-07-22 hat 42 Streitfälle in verbindliche Präzedenzen
// überführt (RUBRIC.md B3a). Die Baseline-Messung zeigte das Modell GENAU auf
// diesem Terrain scheiternd (provisionKind 73,8 %, other-Recall 0,17) — der
// Prompt hinkte der Rubrik hinterher. Diese Assertions verankern die
// Verdichtungs-Pflicht: Wer B3a ändert, ohne den Prompt nachzuziehen, bricht hier.
describe('buildPrelabelUserPrompt — B3a-Präzedenzen im Prompt (tp-2)', () => {
  const provision = {
    source: 'nis2-de',
    paragraphNumber: 'Art. 27',
    title: 'Registry of entities',
    fullText: 'x'.repeat(60),
    language: 'de',
  } as never;
  const p = buildPrelabelUserPrompt(provision);

  it('carries the institution-founding precedent → "other"', () => {
    expect(p).toContain('Founding or establishing an institution');
    expect(p).toContain('"other"');
  });

  it('carries the presumption/evidence-rule precedent → obligationKind na + procedural', () => {
    expect(p).toContain('shall be deemed to satisfy');
  });

  it('carries the mirror-duty precedent for data-subject rights → controller', () => {
    expect(p).toContain('MIRROR DUTY');
    expect(p).toContain('not the right-holder');
  });

  it('carries the market-access precedent: "only where" → prohibition, not obligation', () => {
    expect(p).toContain('only where');
    expect(p).toContain('closed door');
  });

  it('carries the authority-empowerment precedent → permission (Gesetzesvorbehalt)', () => {
    expect(p).toContain('Gesetzesvorbehalt');
    expect(p).toContain('forbidden unless empowered');
  });

  it('splits master-data registration (procedural) from event-driven notification (obligation)', () => {
    expect(p).toContain('Master-data registration');
    expect(p).toContain('EVENT-driven notification');
  });

  it('forbids borrowing a neighboring role for actors outside the closed list', () => {
    expect(p).toContain('NEVER borrow a neighboring role');
  });

  it('names B3a as source so the sync mechanism is auditable from the prompt alone', () => {
    expect(p).toContain('B3a');
  });
});

// ─── Rollenraum 1.7.0 im Prompt (THE-515, tp-3) ─────────────────
//
// Vier Adressaten-Rollen sind in E6 1.7.0 dazugekommen, weil eine MESSUNG sie
// verlangt hat (partyRole out-of-sample 0,668, Golden v2). Drei davon kehren
// eine frühere Präzedenz um: Konformitätsbewertungsstellen, Dateninhaber und
// ECS-Anbieter standen bisher auf `n/a`. Diese Assertions sichern zweierlei:
// (1) die Werteliste kommt tatsächlich aus der Ontologie im Prompt an (Verdrahtung),
// (2) die Terminologie-Falle steht im Regeltext — derselbe Akteur trägt drei
// deutsche Namen, und ohne alle drei ordnet das Modell nach Wortlaut statt nach
// Akteur zu.
describe('buildPrelabelUserPrompt — Rollenraum 1.7.0 (tp-3)', () => {
  const provision = {
    source: 'eidas-de',
    paragraphNumber: 'Art. 20',
    title: 'Überprüfung qualifizierter Vertrauensdiensteanbieter',
    fullText: 'x'.repeat(60),
    language: 'de',
  } as never;
  const p = buildPrelabelUserPrompt(provision);

  it('bietet die vier neuen Rollen-Ids als Auswahlwerte an (Facetten-Verdrahtung)', () => {
    for (const id of ['conformity_assessment_body', 'trust_service_provider', 'data_holder', 'ecs_provider']) {
      expect(p).toContain(id);
    }
  });

  it('nennt alle drei deutschen Bezeichnungen desselben Akteurs (Terminologie-Falle)', () => {
    expect(p).toContain('Konformitätsbewertungsstelle');
    expect(p).toContain('notifizierte Stelle');
    expect(p).toContain('Benannte Stelle');
    expect(p).toContain('notified body');
  });

  it('hält die Gegenregel fest: PSD2-Zahlungsinstitute → financial_entity, keine neue Rolle', () => {
    expect(p).toContain('PSD2');
    expect(p).toMatch(/PSD2[\s\S]{0,120}financial_entity/);
  });

  it('behält die Borg-Verbot-Regel für Akteure, die WEITERHIN keinen Wert haben', () => {
    expect(p).toContain('NEVER borrow a neighboring role');
  });
});

// Bump-Disziplin: TYPING_PROMPT_VERSION ist Teil der Provenance (AC-1) und der
// Batch-Idempotenz — JEDE inhaltliche Prompt-Änderung MUSS die Version erhöhen,
// sonst überspringt der Batch bereits klassifizierte Dokumente mit dem alten
// Prompt und die Eval misst ein anderes System als das produktive. Der Wechsel
// tp-2 → tp-3 trägt genau diese Last: Ontologie 1.7.0 + die drei umgekehrten
// B3a-Präzedenzen ändern die Klassifizierung, also MUSS der Korpus-Re-Batch
// (`--force`) sie neu sehen statt sie als „schon getypt" zu überspringen.
// tp-3 → tp-4 (THE-668): der Beobachtungskanal steht im Prompt — die Antworten
// können ein Zusatzfeld tragen, also ist es ein anderer Prompt-Stand.
describe('TYPING_PROMPT_VERSION', () => {
  it('is tp-4 after the observation channel (THE-668)', () => {
    expect(TYPING_PROMPT_VERSION).toBe('tp-4');
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

/**
 * THE-668 — der Beobachtungskanal.
 *
 * `partyRoleObserved` ist KEINE Achse: nicht validiert, nicht in TYPING_AXES,
 * ohne Wirkung auf die Labels. Es transportiert nur, WEN das Modell im Text
 * verpflichtet sah, als keine Klasse passte — die Information, die bisher bei
 * jeder Typisierung entstand und weggeworfen wurde (THE-515 musste sie
 * nachträglich von Hand am Korpus rekonstruieren).
 */
describe('parsePrelabelLabels — Beobachtungskanal (THE-668)', () => {
  it('die Achsenliste bleibt bei fünf — der Kanal ist keine Achse', () => {
    expect(TYPING_AXES).toHaveLength(5);
    expect(TYPING_AXES).not.toContain('partyRoleObserved');
  });

  it('partyRole "na" + Beobachtung → Beobachtung kommt durch, Labels unberührt', () => {
    const r = parsePrelabelLabels(
      '{"normKind":"legislation","partyRole":"na","partyRoleObserved":"Normungsorganisation"}'
    );
    expect(r.partyRoleObserved).toBe('Normungsorganisation');
    expect(r.labels.partyRole).toBeNull();
    expect(r.labels).not.toHaveProperty('partyRoleObserved');
  });

  it('gültige partyRole → Beobachtung wird VERWORFEN (der Kanal schweigt, wo eine Rolle passt)', () => {
    // AC-5 mechanisch: eine Beobachtung neben einer passenden Rolle ist per
    // Definition keine Typraum-Lücke — sie wäre nur Rauschen in der Auswertung.
    const r = parsePrelabelLabels(
      '{"partyRole":"controller","partyRoleObserved":"Verantwortlicher"}'
    );
    expect(r.labels.partyRole).toBe('controller');
    expect(r.partyRoleObserved).toBeUndefined();
  });

  it('OOV-partyRole wird weiter gedroppt — und ihr Rohwert wird zur Beobachtung gerettet', () => {
    // Genau die Ausweichwerte, die THE-515 als Evidenz brauchte: das Modell
    // wollte eine Klasse sagen, die es nicht gibt. Bisher fiel der Wert weg.
    const r = parsePrelabelLabels('{"partyRole":"standardisation_body"}');
    expect(r.dropped).toContain('partyRole');
    expect(r.labels).not.toHaveProperty('partyRole');
    expect(r.partyRoleObserved).toBe('standardisation_body');
  });

  it('ein explizites observed schlägt den geretteten OOV-Wert', () => {
    const r = parsePrelabelLabels(
      '{"partyRole":"standardisation_body","partyRoleObserved":"europäische Normungsorganisation"}'
    );
    expect(r.dropped).toContain('partyRole');
    expect(r.partyRoleObserved).toBe('europäische Normungsorganisation');
  });

  it('leer, "na" oder nur Whitespace → keine Beobachtung', () => {
    for (const v of ['""', '"na"', '"  "']) {
      const r = parsePrelabelLabels(`{"partyRole":"na","partyRoleObserved":${v}}`);
      expect(r.partyRoleObserved).toBeUndefined();
    }
  });

  it('Whitespace wird getrimmt', () => {
    const r = parsePrelabelLabels('{"partyRole":"na","partyRoleObserved":"  AI Office  "}');
    expect(r.partyRoleObserved).toBe('AI Office');
  });

  it('das System-Prompt behält "Never invent ids" — der geschlossene Raum bleibt zu', () => {
    expect(PRELABEL_SYSTEM).toContain('Never invent ids');
  });

  it('der User-Prompt erklärt den Kanal als optional und an "na" gebunden', () => {
    const p = buildPrelabelUserPrompt({
      source: 'standardisation', paragraphNumber: 'art-10',
      fullText: 'Die Kommission kann europäische Normungsorganisationen beauftragen.', language: 'de',
    });
    expect(p).toContain('partyRoleObserved');
  });
});
