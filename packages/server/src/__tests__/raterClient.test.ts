/**
 * raterClient — Provider-Abstraktion für die Prelabel-Rater (THE-421).
 *
 * WARUM ES DIESE TESTS GIBT: Das Freeze-Gate verlangt Kappa >= 0,6 zwischen zwei
 * UNABHÄNGIGEN Prüfern. Kommen beide Prüfer aus demselben Modell-Haus, ist die
 * Übereinstimmung durch geteilte Trainingsherkunft aufgebläht — die Zahl misst
 * dann nicht Unabhängigkeit, sondern Verwandtschaft. Zweiter Prüfer daher über
 * OpenRouter (openai/gpt-5).
 *
 * Der wichtigste Test hier ist der Prompt-Identitäts-Test: gemessen wird
 * Prüfer-Unabhängigkeit, NICHT Prompt-Unterschiede. Weicht der Prompt zwischen
 * den Providern auch nur um ein Byte ab, misst der Kappa etwas anderes als
 * behauptet.
 *
 * Run: cd packages/server && npx jest src/__tests__/raterClient.test.ts
 */
import {
  resolveRaterConfig,
  createRaterClient,
  annotatorTag,
  isEmptyRaterText,
  withEmptyResponseRetry,
  EMPTY_RESPONSE_MAX_ATTEMPTS,
  RATER_DEFAULT_MODEL,
  type RaterClient,
  type RaterRequest,
} from '../evals/raterClient';

describe('resolveRaterConfig — Provider-Präzedenz (Flag > Env > Default)', () => {
  it('defaults to anthropic when nothing is set (heutiges Verhalten bleibt)', () => {
    const cfg = resolveRaterConfig([], {});
    expect(cfg.provider).toBe('anthropic');
    expect(cfg.model).toBe(RATER_DEFAULT_MODEL.anthropic);
  });

  it('takes the provider from the env when no flag is given', () => {
    expect(resolveRaterConfig([], { RATER_PROVIDER: 'openrouter' }).provider).toBe('openrouter');
  });

  it('lets the explicit flag beat the env', () => {
    const cfg = resolveRaterConfig(['--provider', 'openrouter'], { RATER_PROVIDER: 'anthropic' });
    expect(cfg.provider).toBe('openrouter');
  });

  // Der Bug, den wir schon einmal hatten: Env-Variablen sind in diesem Projekt
  // oft VORHANDEN ABER LEER (FOO=). `??` fällt bei '' NICHT durch, `||` schon.
  it('falls through an empty-but-present RATER_PROVIDER to the default', () => {
    expect(resolveRaterConfig([], { RATER_PROVIDER: '' }).provider).toBe('anthropic');
  });

  it('rejects an unknown provider loudly instead of silently defaulting', () => {
    expect(() => resolveRaterConfig(['--provider', 'mistral'], {})).toThrow(/provider/i);
  });
});

describe('resolveRaterConfig — Modell-Präzedenz', () => {
  it('uses the per-provider default when nothing is set', () => {
    expect(resolveRaterConfig([], {}).model).toBe('claude-haiku-4-5-20251001');
    expect(resolveRaterConfig(['--provider', 'openrouter'], {}).model).toBe('openai/gpt-5');
    expect(RATER_DEFAULT_MODEL.openrouter).toBe('openai/gpt-5');
  });

  it('keeps ANTHROPIC_MODEL working for the anthropic provider', () => {
    expect(resolveRaterConfig([], { ANTHROPIC_MODEL: 'claude-opus-4-1' }).model).toBe('claude-opus-4-1');
  });

  it('does not let ANTHROPIC_MODEL leak into the openrouter provider', () => {
    const cfg = resolveRaterConfig(['--provider', 'openrouter'], { ANTHROPIC_MODEL: 'claude-opus-4-1' });
    expect(cfg.model).toBe(RATER_DEFAULT_MODEL.openrouter);
  });

  it('reads OPENROUTER_MODEL for the openrouter provider', () => {
    const cfg = resolveRaterConfig(['--provider', 'openrouter'], { OPENROUTER_MODEL: 'openai/gpt-5-mini' });
    expect(cfg.model).toBe('openai/gpt-5-mini');
  });

  it('lets --model beat every env variable', () => {
    const cfg = resolveRaterConfig(['--model', 'openai/gpt-5-pro', '--provider', 'openrouter'], {
      OPENROUTER_MODEL: 'openai/gpt-5-mini',
    });
    expect(cfg.model).toBe('openai/gpt-5-pro');
  });

  // Gleicher Leer-String-Fallstrick wie oben, nur auf der Modell-Achse.
  it('falls through empty-but-present model env vars to the default', () => {
    expect(resolveRaterConfig([], { ANTHROPIC_MODEL: '' }).model).toBe(RATER_DEFAULT_MODEL.anthropic);
    expect(resolveRaterConfig(['--provider', 'openrouter'], { OPENROUTER_MODEL: '' }).model).toBe(
      RATER_DEFAULT_MODEL.openrouter
    );
  });

  it('ignores an empty --model value rather than sending an empty model id', () => {
    expect(resolveRaterConfig(['--model', ''], {}).model).toBe(RATER_DEFAULT_MODEL.anthropic);
  });
});

describe('createRaterClient — fehlender Key scheitert laut', () => {
  it('fails when OPENROUTER_API_KEY is entirely unset', () => {
    expect(() => createRaterClient({ provider: 'openrouter', model: 'openai/gpt-5' }, {})).toThrow(
      /OPENROUTER_API_KEY/
    );
  });

  // Der eigentliche Fallstrick: gesetzt, aber leer.
  it('fails when OPENROUTER_API_KEY is present but empty', () => {
    expect(() =>
      createRaterClient({ provider: 'openrouter', model: 'openai/gpt-5' }, { OPENROUTER_API_KEY: '' })
    ).toThrow(/OPENROUTER_API_KEY/);
  });

  it('fails when OPENROUTER_API_KEY is only whitespace', () => {
    expect(() =>
      createRaterClient({ provider: 'openrouter', model: 'openai/gpt-5' }, { OPENROUTER_API_KEY: '   ' })
    ).toThrow(/OPENROUTER_API_KEY/);
  });

  it('fails the same way for a missing ANTHROPIC_API_KEY', () => {
    expect(() =>
      createRaterClient({ provider: 'anthropic', model: 'claude-haiku-4-5-20251001' }, { ANTHROPIC_API_KEY: '' })
    ).toThrow(/ANTHROPIC_API_KEY/);
  });

  it('builds a client (provider/model exposed) when the key is present', () => {
    const c = createRaterClient({ provider: 'openrouter', model: 'openai/gpt-5' }, { OPENROUTER_API_KEY: 'sk-or-test' });
    expect(c.provider).toBe('openrouter');
    expect(c.model).toBe('openai/gpt-5');
  });
});

describe('annotatorTag — der Provider muss aus der Datei allein erkennbar sein', () => {
  it('names provider and model', () => {
    expect(annotatorTag({ provider: 'openrouter', model: 'openai/gpt-5' })).toBe(
      'llm-prelabel:openrouter:openai/gpt-5'
    );
    expect(annotatorTag({ provider: 'anthropic', model: 'claude-haiku-4-5-20251001' })).toBe(
      'llm-prelabel:anthropic:claude-haiku-4-5-20251001'
    );
  });

  it('yields distinguishable tags for the two houses', () => {
    const a = annotatorTag({ provider: 'anthropic', model: 'claude-haiku-4-5-20251001' });
    const b = annotatorTag({ provider: 'openrouter', model: 'openai/gpt-5' });
    expect(a).not.toBe(b);
    expect(a).toContain('anthropic');
    expect(b).toContain('openrouter');
  });
});

// ─── Leere Antwort = fehlgeschlagene Messung, keine Enthaltung ──────
//
// WARUM DIESE TESTS EXISTIEREN: Im Live-Lauf gegen openai/gpt-5 kamen 18 von
// 100 Fällen mit einem LEEREN Antwort-String zurück. Der Parser macht daraus
// korrekt "offen", das Kappa-Werkzeug schließt "offen" korrekt als `skipped`
// aus — und genau dadurch verschwanden 18 Messungen lautlos aus der Zahl. Sie
// waren keine Enthaltungen: bei 13 von ihnen hatte der andere Prüfer sehr wohl
// gelabelt, die Ausfälle häuften sich also exakt auf den strittigen Fällen.
// Ein Nach-Test ergab bei drei von vier Fällen sofort gültiges JSON — es war
// ein Budget-Artefakt (Reasoning-Tokens fressen das Ausgabe-Budget), kein
// Urteil. Ein Messfehler darf nie wie eine Prüfer-Meinung aussehen.
//
// Der Retry sitzt bewusst in der CLIENT-Schicht: nur hier lässt sich das
// Budget anheben, ohne den Prompt anzufassen — und der Prompt ist das, was
// über beide Prüfer hinweg Byte für Byte gleich bleiben MUSS.
describe('isEmptyRaterText — was als Ausfall zählt', () => {
  it('treats an empty and a whitespace-only response as no response at all', () => {
    expect(isEmptyRaterText('')).toBe(true);
    expect(isEmptyRaterText('   \n\t ')).toBe(true);
  });

  it('treats any real content as an answer — including a deliberate no-opinion', () => {
    expect(isEmptyRaterText('{"relation":"none"}')).toBe(false);
    expect(isEmptyRaterText('{"normKind":"na"}')).toBe(false);
    expect(isEmptyRaterText('I decline to answer.')).toBe(false);
  });
});

/** Fake-Client mit vorgegebener Antwortfolge; zeichnet jeden Request auf. */
function scripted(replies: string[]) {
  const requests: RaterRequest[] = [];
  const client: RaterClient = {
    provider: 'openrouter',
    model: 'openai/gpt-5',
    async complete(req) {
      requests.push(req);
      const text = replies[Math.min(requests.length - 1, replies.length - 1)];
      return { text, inputTokens: 10, outputTokens: 4 };
    },
  };
  return { client, requests };
}

/** Kein echtes Warten im Test — der Backoff ist Produktions-Verhalten, nicht Testgegenstand. */
const noSleep = async () => {};

describe('withEmptyResponseRetry', () => {
  it('retries an empty response and returns the valid answer from the retry', async () => {
    const { client, requests } = scripted(['', '{"relation":"none"}']);
    const res = await withEmptyResponseRetry(client, { sleep: noSleep }).complete({
      system: 'S',
      user: 'U',
      maxTokens: 200,
    });
    expect(res.text).toBe('{"relation":"none"}');
    expect(requests).toHaveLength(2);
    expect(res.attempts).toBe(2);
  });

  it('does not retry a response that has content (a decline is an answer)', async () => {
    const { client, requests } = scripted(['{"relation":"none"}']);
    const res = await withEmptyResponseRetry(client, { sleep: noSleep }).complete({
      system: 'S',
      user: 'U',
      maxTokens: 200,
    });
    expect(requests).toHaveLength(1);
    expect(res.attempts).toBe(1);
    expect(res.text).toBe('{"relation":"none"}');
  });

  it('gives up after the configured number of attempts and reports an empty text', async () => {
    const { client, requests } = scripted(['']);
    const res = await withEmptyResponseRetry(client, { sleep: noSleep }).complete({
      system: 'S',
      user: 'U',
      maxTokens: 200,
    });
    expect(requests).toHaveLength(EMPTY_RESPONSE_MAX_ATTEMPTS);
    expect(res.attempts).toBe(EMPTY_RESPONSE_MAX_ATTEMPTS);
    expect(isEmptyRaterText(res.text)).toBe(true);
  });

  // Das ist der load-bearing Test: der Wiederholungsversuch darf das BUDGET
  // anheben (die vermutete Ursache), aber niemals den PROMPT verändern —
  // sonst misst der Kappa Prompt-Unterschiede statt Prüfer-Unabhängigkeit.
  it('keeps system and user prompts byte-identical across every attempt', async () => {
    const { client, requests } = scripted(['']);
    const system = 'You are a legal-informatics classifier.';
    const user = 'Classify this provision.\n\nWith a newline and "quotes".';
    await withEmptyResponseRetry(client, { sleep: noSleep }).complete({ system, user, maxTokens: 200 });
    expect(requests).toHaveLength(EMPTY_RESPONSE_MAX_ATTEMPTS);
    for (const req of requests) {
      expect(req.system).toBe(system);
      expect(req.user).toBe(user);
    }
  });

  it('raises the output budget on retry (the suspected cause is budget exhaustion)', async () => {
    const { client, requests } = scripted(['']);
    await withEmptyResponseRetry(client, { sleep: noSleep }).complete({
      system: 'S',
      user: 'U',
      maxTokens: 200,
    });
    expect(requests[0].maxTokens).toBe(200);
    expect(requests[1].maxTokens).toBeGreaterThan(requests[0].maxTokens);
    expect(requests[2].maxTokens).toBeGreaterThan(requests[1].maxTokens);
  });

  // Fehlversuche kosten echtes Geld — sie fallen aus der Kostenrechnung, wenn
  // nur der letzte Versuch gezählt wird.
  it('accumulates token usage over all attempts, not just the last one', async () => {
    const { client } = scripted(['', '{"relation":"none"}']);
    const res = await withEmptyResponseRetry(client, { sleep: noSleep }).complete({
      system: 'S',
      user: 'U',
      maxTokens: 200,
    });
    expect(res.inputTokens).toBe(20);
    expect(res.outputTokens).toBe(8);
  });

  it('passes provider and model through unchanged', () => {
    const { client } = scripted(['x']);
    const wrapped = withEmptyResponseRetry(client, { sleep: noSleep });
    expect(wrapped.provider).toBe(client.provider);
    expect(wrapped.model).toBe(client.model);
  });
});

// Die eigentliche Prompt-Identitäts-Prüfung läuft durch den echten
// Prelabel-Lauf (runTypingPrelabel / runRelationsPrelabel) in
// prelabelTyping.test.ts bzw. prelabelRelations.test.ts — dort wird der Client
// als Fake hereingereicht und aufgezeichnet, was tatsächlich rausgeht.
