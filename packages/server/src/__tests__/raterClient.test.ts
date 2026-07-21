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

// Die eigentliche Prompt-Identitäts-Prüfung läuft durch den echten
// Prelabel-Lauf (runTypingPrelabel / runRelationsPrelabel) in
// prelabelTyping.test.ts bzw. prelabelRelations.test.ts — dort wird der Client
// als Fake hereingereicht und aufgezeichnet, was tatsächlich rausgeht.
