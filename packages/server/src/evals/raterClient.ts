/**
 * raterClient — eine Provider-Abstraktion für die LLM-Prüfer der Golden-Sets.
 *
 * WARUM ES DAS GIBT: Das Freeze-Gate verlangt Cohen's Kappa >= 0,6 zwischen zwei
 * UNABHÄNGIGEN Prüfern. Bisher kamen beide Prüfer aus demselben Modell-Haus
 * (Anthropic). Zwei Modelle mit geteilter Trainingsherkunft irren systematisch
 * in dieselbe Richtung — ihre Übereinstimmung ist dadurch aufgebläht und der
 * Kappa misst nicht das, was er zu messen behauptet. Der zweite Prüfer kommt
 * deshalb über OpenRouter aus einem anderen Haus (Default: openai/gpt-5).
 *
 * WAS DABEI NICHT VARIIEREN DARF: der Prompt. Gemessen wird Prüfer-
 * Unabhängigkeit, nicht Prompt-Unterschied. Diese Schicht nimmt deshalb nur
 * `{ system, user, maxTokens }` entgegen und gibt Text zurück — sie formuliert
 * nichts um, kürzt nichts und fügt nichts hinzu. Die Prompt-Bauer in den
 * Prelabel-Skripten bleiben die einzige Quelle.
 *
 * LEER-STRING-FALLE: Env-Variablen sind in diesem Projekt oft VORHANDEN ABER
 * LEER (`FOO=`). `??` fällt bei `''` nicht durch, `||` schon — deshalb steht in
 * diesem Modul durchgängig `||` und nie `??` für Env-Fallbacks.
 *
 * Linear: THE-421
 */
import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';

export const RATER_PROVIDERS = ['anthropic', 'openrouter'] as const;
export type RaterProvider = (typeof RATER_PROVIDERS)[number];

/** Default-Modell je Haus. anthropic bleibt exakt das bisherige Default. */
export const RATER_DEFAULT_MODEL: Record<RaterProvider, string> = {
  anthropic: 'claude-haiku-4-5-20251001',
  openrouter: 'openai/gpt-5',
};

const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1';

/**
 * Reasoning-Modelle (gpt-5) verbrauchen einen Teil des Ausgabe-Budgets für
 * interne Reasoning-Tokens, BEVOR das erste sichtbare Zeichen fällt. Die
 * Prelabel-Skripte rechnen mit 200–400 Tokens, was für Claude reicht, bei gpt-5
 * aber regelmäßig zu einer leeren Antwort führt (Budget vor der JSON-Zeile
 * aufgebraucht) — das sähe im Ergebnis wie ein Modell aus, das sich nicht
 * festlegt, wäre in Wahrheit aber ein Budget-Artefakt und würde den Kappa
 * verfälschen. Deshalb ein Mindestbudget nur auf der OpenRouter-Seite. Das ist
 * KEINE Prompt-Änderung: der Prompt bleibt Byte für Byte identisch, nur die
 * Länge der erlaubten Antwort wird angehoben.
 */
const OPENROUTER_MIN_MAX_TOKENS = 2000;

export interface RaterRequest {
  system: string;
  user: string;
  maxTokens: number;
}

export interface RaterResponse {
  text: string;
  inputTokens: number;
  outputTokens: number;
}

export interface RaterClient {
  readonly provider: RaterProvider;
  readonly model: string;
  complete(req: RaterRequest): Promise<RaterResponse>;
}

export interface RaterConfig {
  provider: RaterProvider;
  model: string;
}

type Env = Record<string, string | undefined>;

function isRaterProvider(v: string): v is RaterProvider {
  return (RATER_PROVIDERS as readonly string[]).includes(v);
}

/** Liest `--flag <wert>` aus argv. Leerer Wert zählt als nicht gesetzt. */
function flagValue(argv: string[], flag: string): string | undefined {
  const i = argv.indexOf(flag);
  if (i === -1) return undefined;
  const v = argv[i + 1];
  return v && !v.startsWith('--') ? v : undefined;
}

/**
 * Präzedenz Provider: `--provider` > `RATER_PROVIDER` > 'anthropic'.
 * Präzedenz Modell:   `--model` > `ANTHROPIC_MODEL`/`OPENROUTER_MODEL` >
 *                     Default des gewählten Hauses.
 *
 * `ANTHROPIC_MODEL` gilt bewusst NUR für den anthropic-Provider — sonst würde
 * ein in der Shell hängengebliebenes ANTHROPIC_MODEL einen OpenRouter-Lauf
 * gegen eine bei OpenRouter unbekannte Modell-ID schicken.
 *
 * Ohne Flag und ohne Env ist das Ergebnis exakt das bisherige Verhalten.
 */
export function resolveRaterConfig(argv: string[] = [], env: Env = process.env): RaterConfig {
  const raw = flagValue(argv, '--provider') || env.RATER_PROVIDER || 'anthropic';
  if (!isRaterProvider(raw)) {
    throw new Error(
      `Unknown rater provider "${raw}". Valid values: ${RATER_PROVIDERS.join(' | ')}.`
    );
  }
  const provider: RaterProvider = raw;
  const envModel = provider === 'anthropic' ? env.ANTHROPIC_MODEL : env.OPENROUTER_MODEL;
  const model = flagValue(argv, '--model') || envModel || RATER_DEFAULT_MODEL[provider];
  return { provider, model };
}

/**
 * Stempel für das `annotator`-Feld. Enthält das HAUS, nicht nur die Modell-ID:
 * ein späterer Leser muss einem Golden-File allein ansehen können, aus welchem
 * Haus dieser Durchgang stammt — genau das ist die Aussage, die das
 * Evidenz-Dokument über die Prüfer-Unabhängigkeit zitiert.
 */
export function annotatorTag(cfg: RaterConfig): string {
  return `llm-prelabel:${cfg.provider}:${cfg.model}`;
}

/** Env-Wert, der nur zählt, wenn er nach dem Trimmen noch Inhalt hat. */
function requireKey(env: Env, name: string): string {
  const raw = env[name] || '';
  const key = raw.trim();
  if (!key) {
    throw new Error(
      `${name} is not set (or empty). Set it in the environment before running this rater pass.`
    );
  }
  return key;
}

function createAnthropicClient(model: string, env: Env): RaterClient {
  const apiKey = requireKey(env, 'ANTHROPIC_API_KEY');
  const sdk = new Anthropic({ apiKey });
  return {
    provider: 'anthropic',
    model,
    async complete({ system, user, maxTokens }) {
      const res = await sdk.messages.create({
        model,
        system,
        messages: [{ role: 'user', content: user }],
        max_tokens: maxTokens,
      });
      const block = res.content.find((b) => b.type === 'text');
      const usage = (res as { usage?: { input_tokens?: number; output_tokens?: number } }).usage;
      return {
        text: block && block.type === 'text' ? block.text : '',
        inputTokens: usage?.input_tokens || 0,
        outputTokens: usage?.output_tokens || 0,
      };
    },
  };
}

function createOpenRouterClient(model: string, env: Env): RaterClient {
  const apiKey = requireKey(env, 'OPENROUTER_API_KEY');
  // OpenRouter spricht die OpenAI-kompatible Chat-Completions-API; das bereits
  // vorhandene openai-SDK reicht, es braucht nur die Basis-URL.
  const sdk = new OpenAI({ apiKey, baseURL: OPENROUTER_BASE_URL });
  return {
    provider: 'openrouter',
    model,
    async complete({ system, user, maxTokens }) {
      const res = await sdk.chat.completions.create({
        model,
        // system + user getrennt wie bei Anthropic — derselbe Text, nur im
        // Nachrichten-Format des anderen Hauses. Keine Umformulierung.
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
        max_tokens: Math.max(maxTokens, OPENROUTER_MIN_MAX_TOKENS),
      });
      const usage = res.usage;
      return {
        text: res.choices?.[0]?.message?.content || '',
        inputTokens: usage?.prompt_tokens || 0,
        outputTokens: usage?.completion_tokens || 0,
      };
    },
  };
}

/**
 * Baut den Client für die aufgelöste Konfiguration. Scheitert LAUT und sofort,
 * wenn der Schlüssel des gewählten Hauses fehlt oder leer ist — ein halber
 * Durchgang, der erst beim ersten Fall abbricht, wäre teurer als ein sofortiger
 * Abbruch.
 */
export function createRaterClient(cfg: RaterConfig, env: Env = process.env): RaterClient {
  return cfg.provider === 'openrouter'
    ? createOpenRouterClient(cfg.model, env)
    : createAnthropicClient(cfg.model, env);
}
