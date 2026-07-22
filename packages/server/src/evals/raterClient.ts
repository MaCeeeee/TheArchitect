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
  /**
   * Wie viele Anläufe dieser Fall gebraucht hat (1 = beim ersten Mal geantwortet).
   * Optional, damit Fakes in Prüfsätzen weiterhin nur `{ text, …Tokens }` liefern
   * dürfen — gesetzt wird es von `withEmptyResponseRetry`.
   */
  attempts?: number;
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

// ─── Leere Antwort = fehlgeschlagene Messung ────────────────────────
//
// BEFUND AUS DEM LIVE-LAUF (openai/gpt-5, 100 Fälle): 18 Fälle kamen mit einem
// LEEREN Antwort-String zurück. Der Parser macht daraus korrekt „offen", das
// Kappa-Werkzeug schließt „offen" korrekt als `skipped` aus — und genau in
// dieser Kette verschwanden 18 Messungen lautlos aus der Zahl. Sie waren keine
// Enthaltungen: bei 13 von ihnen hatte der ANDERE Prüfer sehr wohl gelabelt,
// die Ausfälle häuften sich also exakt auf den strittigen, schweren Fällen.
// Genau die Uneinigkeiten, die den Kappa gedrückt hätten, fielen heraus — die
// berichteten 0,572 waren dadurch zu optimistisch. Ein Nach-Test lieferte bei
// drei von vier Fällen sofort gültiges JSON: ein Budget-Artefakt, kein Urteil.
//
// LEITSATZ: Eine fehlgeschlagene Messung darf nie so aussehen wie die bewusste
// Nicht-Aussage eines Prüfers. Das eine sind fehlende Daten, das andere ist ein
// Datenpunkt.
//
// WARUM DER RETRY HIER SITZT UND NICHT IM PARSER: Nur diese Schicht kann das
// Ausgabe-Budget anheben (die vermutete Ursache), ohne den Prompt anzufassen.
// Der Prompt bleibt über alle Anläufe und beide Provider Byte für Byte
// identisch — er ist die Grundlage der Aussage, dass der Kappa
// Prüfer-Unabhängigkeit misst; ein Prüfsatz nagelt das fest.

/** Gesamtzahl der Anläufe je Fall (1 Erstversuch + 2 Wiederholungen). */
export const EMPTY_RESPONSE_MAX_ATTEMPTS = 3;

/** Kurzer, linear wachsender Backoff — transiente Ausfälle, keine Rate-Limit-Sturm-Abwehr. */
const EMPTY_RESPONSE_BACKOFF_MS = 500;

/**
 * Budget-Faktor je Wiederholung. Verdopplung ist absichtlich moderat: bliebe das
 * Budget gleich, würde ein Retry bei Budget-Erschöpfung nur denselben Ausfall
 * reproduzieren; ein zu großer Sprung würde die Kosten eines Ausfalls unnötig
 * vervielfachen.
 */
const EMPTY_RESPONSE_BUDGET_FACTOR = 2;

/**
 * Leer ODER nur Whitespace zählt als „gar keine Antwort". Alles andere ist eine
 * Antwort — auch eine, in der sich das Modell bewusst nicht festlegt („na",
 * „none"). Diese Grenze ist der ganze Punkt: sie trennt Messfehler von Meinung.
 */
export function isEmptyRaterText(text: string): boolean {
  return text.trim().length === 0;
}

export interface EmptyResponseRetryOptions {
  maxAttempts?: number;
  backoffMs?: number;
  budgetFactor?: number;
  /** Injizierbar, damit Prüfsätze nicht real warten. */
  sleep?: (ms: number) => Promise<void>;
}

const realSleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/**
 * Dekoriert einen Client so, dass eine leere Antwort wiederholt wird — mit
 * höherem Budget, aber UNVERÄNDERTEM Prompt.
 *
 * Sind alle Anläufe leer, wird NICHT geworfen und NICHTS ersetzt: der Aufrufer
 * bekommt einen leeren Text zurück und erkennt daran (über `isEmptyRaterText`)
 * eine fehlgeschlagene Messung, die er als solche zählen und markieren muss.
 * Ein Ersatz-Label wäre schlimmer als der ursprüngliche Fehler — es würde einen
 * Ausfall in einen erfundenen Datenpunkt verwandeln.
 *
 * Token-Verbrauch wird über ALLE Anläufe summiert: Fehlversuche kosten echtes
 * Geld und dürfen aus der Kostenrechnung nicht herausfallen.
 */
export function withEmptyResponseRetry(
  inner: RaterClient,
  opts: EmptyResponseRetryOptions = {}
): RaterClient {
  const maxAttempts = opts.maxAttempts ?? EMPTY_RESPONSE_MAX_ATTEMPTS;
  const backoffMs = opts.backoffMs ?? EMPTY_RESPONSE_BACKOFF_MS;
  const budgetFactor = opts.budgetFactor ?? EMPTY_RESPONSE_BUDGET_FACTOR;
  const sleep = opts.sleep ?? realSleep;

  return {
    provider: inner.provider,
    model: inner.model,
    async complete({ system, user, maxTokens }) {
      let inputTokens = 0;
      let outputTokens = 0;
      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        const res = await inner.complete({
          // system/user werden UNVERÄNDERT durchgereicht — nur maxTokens steigt.
          system,
          user,
          maxTokens: maxTokens * budgetFactor ** (attempt - 1),
        });
        inputTokens += res.inputTokens;
        outputTokens += res.outputTokens;
        if (!isEmptyRaterText(res.text)) {
          return { ...res, inputTokens, outputTokens, attempts: attempt };
        }
        if (attempt < maxAttempts) await sleep(backoffMs * attempt);
      }
      return { text: '', inputTokens, outputTokens, attempts: maxAttempts };
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
  const base =
    cfg.provider === 'openrouter'
      ? createOpenRouterClient(cfg.model, env)
      : createAnthropicClient(cfg.model, env);
  // Retry gilt für BEIDE Häuser. Beobachtet wurde der Ausfall bisher nur bei
  // gpt-5, aber „leere Antwort" ist auf keiner Seite ein Urteil — und ein
  // Prüfer, der nur auf einer Seite wiederholt wird, wäre selbst wieder eine
  // Asymmetrie zwischen den beiden Durchgängen.
  return withEmptyResponseRetry(base);
}
