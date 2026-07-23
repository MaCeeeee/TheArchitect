/**
 * Typing-Batch — reiner Kern für den 5-Achsen-Klassifizierungs-Batch (Slice T).
 *
 * Jeder Korpus-Paragraph bekommt einen Typing-VORSCHLAG (status 'suggested')
 * auf die fünf E6-Achsen geschrieben. Der Prompt kommt Byte-identisch aus
 * @thearchitect/shared (Messvalidität: die Eval in packages/server misst
 * DENSELBEN Prompt, den dieser Batch produktiv fährt — sonst wären die
 * Kappa-/Accuracy-Zahlen keine Aussage über den Batch).
 *
 * Dieser Modul ist bewusst rein (keine Mongo-, keine Netz-Abhängigkeit):
 * Skip-Logik, Vorschlags-Assemblierung und Retry-Disziplin sind ohne
 * Infrastruktur testbar; der CLI (src/cli/typing-batch.ts) ist nur Glue.
 *
 * Linear: THE-432 (Slice T)
 */
import {
  NORM_ONTOLOGY,
  TYPING_AXES,
  TYPING_PROMPT_VERSION,
  type ParsedPrelabel,
} from '@thearchitect/shared';

// AC-5 GUARDRAIL: Instruct-Klasse, NICHT Thinking — OntoLearner
// (arXiv:2607.01977) §5: Output-Disziplin schlägt Reasoning bei Term Typing
// durchgängig (Extremfall 0,0 F1). Nicht auf ein Thinking-Modell "upgraden".
export const TYPING_BATCH_MODEL = 'claude-haiku-4-5-20251001';

/**
 * Der Typing-Vorschlag, wie er per $set auf Regulation.typing geschrieben wird.
 * null = das Modell hat bewusst "na" (nicht anwendbar) gesagt — ein echtes
 * Label. Abwesend = Achse offen (nie beantwortet oder OOV-verworfen). Diese
 * Unterscheidung ist Teil des Kontrakts (siehe parsePrelabelLabels in shared).
 */
export interface TypingSuggestion {
  normKind?: string | null;
  bindingness?: string | null;
  obligationKind?: string | null;
  partyRole?: string | null;
  provisionKind?: string | null;
  /** Provenance (AC-1): wer hat wann mit welchem Prompt-/Ontologie-Stand vorgeschlagen. */
  modelId: string;
  promptVersion: string;
  ontologyVersion: string;
  typedAt: Date;
  status: 'suggested';
  /** Telemetrie (AC-2): Achsen, deren Modell-Wert nicht in E6 stand — nur wenn nicht leer. */
  droppedAxes?: string[];
}

export interface SkipVerdict {
  skip: boolean;
  reason?: 'human-decided' | 'up-to-date';
}

/**
 * Entscheidet, ob ein Dokument im Batch übersprungen wird (AC-4 + Idempotenz).
 *
 * Regeln:
 *  1. status 'confirmed' oder 'rejected' → IMMER skip, auch mit --force.
 *     Eine menschliche Entscheidung schlägt den Batch, bedingungslos —
 *     Asilomar #16 (KI schlägt vor, der Mensch entscheidet konsequente
 *     Zustände). Es gibt bewusst KEIN Flag, das das aufhebt.
 *  2. status 'suggested' mit identischem (promptVersion, ontologyVersion,
 *     modelId)-Tripel → skip, außer --force (Idempotenz: derselbe Lauf zweimal
 *     schreibt nichts doppelt).
 *  3. Weicht eine Komponente des Tripels ab → kein Skip: nach Prompt-,
 *     Ontologie- oder Modell-Wechsel ist Re-Typing genau das Gewollte.
 *  4. Kein typing → kein Skip.
 */
export function shouldSkipDoc(
  doc: {
    typing?: {
      status?: string;
      promptVersion?: string;
      ontologyVersion?: string;
      modelId?: string;
    };
  },
  opts: { force: boolean; promptVersion: string; ontologyVersion: string; modelId: string }
): SkipVerdict {
  const typing = doc.typing;
  if (!typing) return { skip: false };

  if (typing.status === 'confirmed' || typing.status === 'rejected') {
    return { skip: true, reason: 'human-decided' };
  }

  const sameTriple =
    typing.promptVersion === opts.promptVersion &&
    typing.ontologyVersion === opts.ontologyVersion &&
    typing.modelId === opts.modelId;

  if (typing.status === 'suggested' && sameTriple && !opts.force) {
    return { skip: true, reason: 'up-to-date' };
  }
  return { skip: false };
}

/**
 * Baut aus dem geparsten Modell-Output den Vorschlag mit voller Provenance
 * (AC-1). promptVersion/ontologyVersion kommen aus den Imports — NICHT als
 * Parameter, damit der geschriebene Stempel beweisbar der Stand ist, gegen den
 * dieser Prozess gebaut wurde (kein Aufrufer kann einen fremden Stand stempeln).
 */
export function assembleTypingSuggestion(
  parsed: ParsedPrelabel,
  meta: { modelId: string; now: Date }
): TypingSuggestion {
  const suggestion: TypingSuggestion = {
    modelId: meta.modelId,
    promptVersion: TYPING_PROMPT_VERSION,
    ontologyVersion: NORM_ONTOLOGY.ontologyVersion,
    typedAt: meta.now,
    status: 'suggested',
  };
  for (const axis of TYPING_AXES) {
    // `in`-Check statt Truthiness: null ist ein echtes Label ("na") und muss
    // geschrieben werden; eine ABWESENDE Achse bleibt abwesend (offen).
    if (axis in parsed.labels) suggestion[axis] = parsed.labels[axis];
  }
  // AC-2: nur wenn real etwas verworfen wurde — kein Auto-[] als Rauschen.
  if (parsed.dropped.length > 0) suggestion.droppedAxes = [...parsed.dropped];
  return suggestion;
}

export interface RetryCallResult {
  text: string;
  inputTokens: number;
  outputTokens: number;
}

/** 1 Erstversuch + 2 Wiederholungen — gleiche Disziplin wie raterClient (server). */
export const RETRY_MAX_ATTEMPTS = 3;
/** Ausgabe-Budget des Erstversuchs; verdoppelt sich je Anlauf (Budget-Artefakt-Hypothese). */
export const RETRY_BASE_MAX_TOKENS = 400;
/** Kurzer, linear wachsender Backoff — transiente Ausfälle, keine Rate-Limit-Sturm-Abwehr. */
export const RETRY_BACKOFF_MS = 500;

/**
 * Wiederholt einen Modell-Call, bis eine NICHT-leere Antwort kommt; nach
 * Erschöpfung null. Eine leere Antwort ist eine FEHLGESCHLAGENE MESSUNG, keine
 * Enthaltung — der Befund aus dem Golden-Set-Lauf (18/100 leere Antworten
 * fielen lautlos als "offen" aus dem Kappa und schönten die Zahl). Der Aufrufer
 * schreibt bei null NICHTS: ein Ausfall darf im Korpus nie wie ein Label
 * aussehen.
 *
 * WARUM ein lokaler ~30-Zeilen-Helfer statt raterClient aus packages/server:
 * Der Crawler darf nicht von packages/server abhängen (eigener Prozess auf
 * Server B, eigener Dependency-Baum — der Import würde u.a. die openai-
 * Abhängigkeit mitschleppen). Die Invariante zwischen Batch und Eval ist die
 * PROMPT-Identität (shared), nicht die Client-Identität — der Client ist
 * austauschbares Transport-Glue, der Prompt ist die Messgrundlage.
 *
 * Tokens werden über ALLE Anläufe akkumuliert: auch ein leerer Anlauf hat
 * Input-Tokens gekostet, und das Summary soll die echten Kosten zeigen.
 */
export async function completeWithRetry(
  call: (maxTokens: number) => Promise<RetryCallResult>,
  opts?: {
    attempts?: number;
    baseMaxTokens?: number;
    backoffMs?: number;
    /** Test-Injektionspunkt (fake clock) — Default: echtes setTimeout. */
    sleep?: (ms: number) => Promise<void>;
  }
): Promise<RetryCallResult | null> {
  const attempts = opts?.attempts ?? RETRY_MAX_ATTEMPTS;
  const baseMaxTokens = opts?.baseMaxTokens ?? RETRY_BASE_MAX_TOKENS;
  const backoffMs = opts?.backoffMs ?? RETRY_BACKOFF_MS;
  const sleep =
    opts?.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));

  let inputTokens = 0;
  let outputTokens = 0;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    // Nur das Budget steigt (400 → 800 → 1600) — der Prompt bleibt über alle
    // Anläufe Byte-identisch (er ist die Messgrundlage, siehe oben).
    const res = await call(baseMaxTokens * 2 ** (attempt - 1));
    inputTokens += res.inputTokens;
    outputTokens += res.outputTokens;
    if (res.text.trim().length > 0) {
      return { text: res.text, inputTokens, outputTokens };
    }
    if (attempt < attempts) await sleep(backoffMs * attempt);
  }
  return null;
}

// Preise claude-haiku-4-5 (Stand 2026-07): $1 / MTok Input, $5 / MTok Output.
// Grobe Schätzung fürs Batch-Summary — bei Modellwechsel mit anpassen.
export const HAIKU_USD_PER_MTOK_INPUT = 1;
export const HAIKU_USD_PER_MTOK_OUTPUT = 5;

export function estimateCostUsd(inputTokens: number, outputTokens: number): number {
  return (
    (inputTokens * HAIKU_USD_PER_MTOK_INPUT + outputTokens * HAIKU_USD_PER_MTOK_OUTPUT) / 1_000_000
  );
}
