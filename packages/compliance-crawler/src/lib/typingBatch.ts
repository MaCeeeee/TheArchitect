/**
 * Typing-Batch — reiner Kern für den 5-Achsen-Klassifizierungs-Batch (Slice T).
 *
 * Jeder Korpus-Paragraph bekommt einen Typing-VORSCHLAG (status 'suggested')
 * auf die fünf E6-Achsen geschrieben. Der Prompt kommt Byte-identisch aus
 * @thearchitect/shared (Messvalidität: die Eval in packages/server misst
 * DENSELBEN Prompt, den dieser Batch produktiv fährt — sonst wären die
 * Kappa-/Accuracy-Zahlen keine Aussage über den Batch).
 *
 * Dieses Modul ist bewusst rein (keine Mongo-, keine Netz-Abhängigkeit):
 * Skip-Logik, Vorschlags-Assemblierung, Retry-Disziplin, Arg-Parsing und die
 * Pro-Dokument-Pipeline sind ohne Infrastruktur testbar; der CLI
 * (src/cli/typing-batch.ts) ist nur Glue (SDK-Call, Mongo-Write, Summary).
 *
 * Linear: THE-432 (Slice T)
 */
import {
  NORM_ONTOLOGY,
  TYPING_AXES,
  TYPING_PROMPT_VERSION,
  buildPrelabelUserPrompt,
  parsePrelabelLabels,
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
  /**
   * Review-Fix 1: Anker an die TEXT-Version, die dieses Label beschreibt.
   * Die Crawl-Route (src/routes/crawl.ts) aktualisiert Dokumente bei einer
   * Gesetzes-Novelle IN PLACE mit neuem versionHash — typing überlebt das.
   * Ohne Anker sähe ein Label zum ALTEN Text danach wie "up-to-date" aus.
   */
  versionHash: string;
  typedAt: Date;
  status: 'suggested';
  /** Telemetrie (AC-2): Achsen, deren Modell-Wert nicht in E6 stand — nur wenn nicht leer. */
  droppedAxes?: string[];
}

export interface SkipVerdict {
  skip: boolean;
  reason?: 'human-decided' | 'human-decided-stale' | 'up-to-date';
}

export interface SkipOpts {
  force: boolean;
  promptVersion: string;
  ontologyVersion: string;
  modelId: string;
}

/**
 * Entscheidet, ob ein Dokument im Batch übersprungen wird (AC-4 + Idempotenz).
 *
 * Regeln:
 *  1. status 'confirmed' oder 'rejected' → IMMER skip, auch mit --force.
 *     Eine menschliche Entscheidung schlägt den Batch, bedingungslos —
 *     Asilomar #16 (KI schlägt vor, der Mensch entscheidet konsequente
 *     Zustände). Es gibt bewusst KEIN Flag, das das aufhebt.
 *     Novellen-Szenario (Review-Fix 1): beschreibt die Entscheidung einen
 *     ALTEN Text-Stand (typing.versionHash ≠ doc.versionHash — auch bei
 *     fehlendem Anker, denn ohne Stempel ist keine Aktualitäts-Aussage
 *     möglich), wird trotzdem NICHT neu getypt, aber als
 *     'human-decided-stale' gemeldet: das Summary zählt sie separat, denn
 *     hier muss ein MENSCH re-reviewen, keine Maschine überschreiben.
 *  2. status 'suggested' mit identischem (promptVersion, ontologyVersion,
 *     modelId)-Tripel UND identischem versionHash → skip, außer --force
 *     (Idempotenz: derselbe Lauf zweimal schreibt nichts doppelt).
 *  3. Weicht eine Komponente des Tripels ODER der Text-Anker ab → kein Skip:
 *     nach Prompt-, Ontologie-, Modell- oder TEXT-Wechsel ist Re-Typing genau
 *     das Gewollte (ein Vor-Anker-Bestand ohne versionHash zählt als
 *     abweichend → Backfill).
 *  4. Kein typing → kein Skip.
 */
export function shouldSkipDoc(
  doc: {
    versionHash: string;
    typing?: {
      status?: string;
      promptVersion?: string;
      ontologyVersion?: string;
      modelId?: string;
      versionHash?: string;
    };
  },
  opts: SkipOpts
): SkipVerdict {
  const typing = doc.typing;
  if (!typing) return { skip: false };

  const sameText = typing.versionHash === doc.versionHash;

  if (typing.status === 'confirmed' || typing.status === 'rejected') {
    return { skip: true, reason: sameText ? 'human-decided' : 'human-decided-stale' };
  }

  const sameTriple =
    typing.promptVersion === opts.promptVersion &&
    typing.ontologyVersion === opts.ontologyVersion &&
    typing.modelId === opts.modelId;

  if (typing.status === 'suggested' && sameTriple && sameText && !opts.force) {
    return { skip: true, reason: 'up-to-date' };
  }
  return { skip: false };
}

/**
 * Baut aus dem geparsten Modell-Output den Vorschlag mit voller Provenance
 * (AC-1). promptVersion/ontologyVersion kommen aus den Imports — NICHT als
 * Parameter, damit der geschriebene Stempel beweisbar der Stand ist, gegen den
 * dieser Prozess gebaut wurde (kein Aufrufer kann einen fremden Stand stempeln).
 * versionHash dagegen kommt aus meta: er ist je Dokument verschieden (der
 * Text-Stand, den das Modell gerade gesehen hat — Review-Fix 1).
 */
export function assembleTypingSuggestion(
  parsed: ParsedPrelabel,
  meta: { modelId: string; now: Date; versionHash: string }
): TypingSuggestion {
  const suggestion: TypingSuggestion = {
    modelId: meta.modelId,
    promptVersion: TYPING_PROMPT_VERSION,
    ontologyVersion: NORM_ONTOLOGY.ontologyVersion,
    versionHash: meta.versionHash,
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

/**
 * Ergebnis eines Retry-Laufs. text === null bedeutet: alle Anläufe leer —
 * FEHLGESCHLAGENE MESSUNG. Die Tokens sind auch dann gefüllt (Review-Fix 3):
 * auch ein Fehlschlag hat Geld gekostet, das Summary soll die echten Kosten
 * zeigen — der alte Rückgabewert `null` warf sie stillschweigend weg.
 */
export interface RetryOutcome {
  text: string | null;
  inputTokens: number;
  outputTokens: number;
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
 * Erschöpfung text=null. Eine leere Antwort ist eine FEHLGESCHLAGENE MESSUNG,
 * keine Enthaltung — der Befund aus dem Golden-Set-Lauf (18/100 leere
 * Antworten fielen lautlos als "offen" aus dem Kappa und schönten die Zahl).
 * Der Aufrufer schreibt bei text=null NICHTS: ein Ausfall darf im Korpus nie
 * wie ein Label aussehen.
 *
 * WARUM ein lokaler ~30-Zeilen-Helfer statt raterClient aus packages/server:
 * Der Crawler darf nicht von packages/server abhängen (eigener Prozess auf
 * Server B, eigener Dependency-Baum — der Import würde u.a. die openai-
 * Abhängigkeit mitschleppen). Die Invariante zwischen Batch und Eval ist die
 * PROMPT-Identität (shared), nicht die Client-Identität — der Client ist
 * austauschbares Transport-Glue, der Prompt ist die Messgrundlage.
 *
 * Tokens werden über ALLE Anläufe akkumuliert und in JEDEM Ausgang
 * zurückgegeben — auch bei Erschöpfung (Review-Fix 3).
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
): Promise<RetryOutcome> {
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
  return { text: null, inputTokens, outputTokens };
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

// ─── CLI-Kern (pur, ohne Mongo/SDK) ─────────────────────────────

export interface TypingBatchCliArgs {
  limit?: number;
  source?: string;
  dryRun: boolean;
  force: boolean;
  concurrency: number;
}

export type ParsedCliArgs = { ok: true; args: TypingBatchCliArgs } | { ok: false; error: string };

/**
 * Arg-Parsing mit NaN-Guards (Review-Fix 6). Die stillen Fehler wären teuer:
 * `--limit abc` ließ das Limit vorher kommentarlos fallen — aus der 20er-
 * Stichprobe würde ein voller BEZAHLTER Lauf über ~1532 Paragraphen.
 * `--concurrency abc` ergab 0 Worker — ein stilles No-op, das wie ein
 * erfolgreicher Lauf mit 0 Dokumenten aussieht. Beides bricht jetzt laut ab.
 */
export function parseCliArgs(argv: string[]): ParsedCliArgs {
  const arg = (flag: string): string | undefined => {
    const i = argv.indexOf(flag);
    return i !== -1 ? argv[i + 1] : undefined;
  };
  const positiveInt = (flag: string): { value?: number; error?: string } => {
    if (!argv.includes(flag)) return {};
    const raw = arg(flag);
    const n = Number(raw);
    if (raw === undefined || !Number.isInteger(n) || n < 1) {
      return { error: `${flag} expects a positive integer, got '${raw ?? ''}'` };
    }
    return { value: n };
  };

  const limit = positiveInt('--limit');
  if (limit.error) return { ok: false, error: limit.error };
  const concurrency = positiveInt('--concurrency');
  if (concurrency.error) return { ok: false, error: concurrency.error };

  return {
    ok: true,
    args: {
      limit: limit.value,
      source: arg('--source'),
      dryRun: argv.includes('--dry-run'),
      force: argv.includes('--force'),
      concurrency: concurrency.value ?? 4,
    },
  };
}

/** Schlanke Sicht auf das Korpus-Dokument — nur was Prompt + Skip-Logik brauchen. */
export interface TypingBatchDoc {
  _id: unknown;
  regulationKey: string;
  versionHash: string;
  source: string;
  paragraphNumber: string;
  title: string;
  fullText: string;
  language: string;
  typing?: {
    status?: string;
    promptVersion?: string;
    ontologyVersion?: string;
    modelId?: string;
    versionHash?: string;
  };
}

/** Lauf-Zähler — vom reinen Kern gepflegt, vom CLI nur noch ins Summary gedruckt. */
export interface BatchCounters {
  typed: number;
  skippedHuman: number;
  /** Review-Fix 1: menschliche Entscheidungen auf VERALTETEM Text — braucht menschliche Re-Review. */
  skippedHumanStale: number;
  skippedUpToDate: number;
  inputTokens: number;
  outputTokens: number;
  droppedPerAxis: Record<string, number>;
  /** regulationKeys der fehlgeschlagenen Messungen/Writes — es wurde NICHTS geschrieben. */
  failed: string[];
}

export function newBatchCounters(): BatchCounters {
  return {
    typed: 0,
    skippedHuman: 0,
    skippedHumanStale: 0,
    skippedUpToDate: 0,
    inputTokens: 0,
    outputTokens: 0,
    droppedPerAxis: {},
    failed: [],
  };
}

export interface ProcessDeps {
  /** Prompt rein, RetryOutcome raus — der CLI verdrahtet hier completeWithRetry + Anthropic-SDK. */
  complete: (userPrompt: string) => Promise<RetryOutcome>;
  /**
   * Persistiert den Vorschlag. Rückgabe false = der Guard im Write-Filter hat
   * NICHT gematcht (zwischen Snapshot-Read und Write hat ein Mensch
   * entschieden — Review-Fix 4): zählt als human-decided, nicht als typed.
   */
  write: (docId: unknown, suggestion: TypingSuggestion) => Promise<boolean>;
  now?: () => Date;
  onError?: (regulationKey: string, err: unknown) => void;
}

/**
 * Die Pro-Dokument-Pipeline, pur und einzeln testbar:
 * Skip-Entscheid → Prompt → Modell-Call (mit Retry, via deps) → Parse →
 * Assemble → Write (via deps). Fehler-Invarianten:
 *  - Eine fehlgeschlagene Messung (text=null, API-Fehler) schreibt NIE ein
 *    Label; das Dokument bleibt untypisiert und der nächste Lauf greift es
 *    wieder auf (Resume).
 *  - Ein Write-Fehler killt NICHT den Lauf (Review-Fix 2): er landet in der
 *    failed-Liste und die Pipeline kehrt normal zurück — vorher riss ein
 *    einzelner transienter Mongo-Fehler den Worker, damit Promise.all und
 *    damit den gesamten Batch ohne Summary ab.
 *  - Tokens werden VOR dem null-Check gezählt (Review-Fix 3): auch der
 *    Fehlschlag hat Geld gekostet.
 */
export async function processTypingDoc(
  doc: TypingBatchDoc,
  opts: SkipOpts & { dryRun: boolean },
  deps: ProcessDeps,
  counters: BatchCounters
): Promise<void> {
  const verdict = shouldSkipDoc(doc, opts);
  if (verdict.skip) {
    if (verdict.reason === 'human-decided') counters.skippedHuman++;
    else if (verdict.reason === 'human-decided-stale') counters.skippedHumanStale++;
    else counters.skippedUpToDate++;
    return;
  }

  const user = buildPrelabelUserPrompt({
    source: doc.source,
    paragraphNumber: doc.paragraphNumber,
    title: doc.title,
    fullText: doc.fullText,
    language: doc.language,
  });

  let outcome: RetryOutcome;
  try {
    outcome = await deps.complete(user);
  } catch (err) {
    // API-Fehler = fehlgeschlagene Messung, gleiche Behandlung wie die leere
    // Antwort: NICHTS schreiben. Ein Ausfall darf nie wie ein Label aussehen.
    deps.onError?.(doc.regulationKey, err);
    counters.failed.push(doc.regulationKey);
    return;
  }
  // Review-Fix 3: Tokens ZUERST zählen — auch die erschöpfte Messung hat gekostet.
  counters.inputTokens += outcome.inputTokens;
  counters.outputTokens += outcome.outputTokens;
  if (outcome.text === null) {
    counters.failed.push(doc.regulationKey);
    return;
  }

  const parsed = parsePrelabelLabels(outcome.text);
  for (const axis of parsed.dropped) {
    counters.droppedPerAxis[axis] = (counters.droppedPerAxis[axis] ?? 0) + 1;
  }
  const suggestion = assembleTypingSuggestion(parsed, {
    modelId: opts.modelId,
    now: deps.now?.() ?? new Date(),
    versionHash: doc.versionHash,
  });

  if (opts.dryRun) {
    counters.typed++;
    return;
  }
  try {
    const written = await deps.write(doc._id, suggestion);
    if (written) {
      counters.typed++;
    } else {
      // Review-Fix 4 (TOCTOU): Der Write-Filter hat nicht gematcht — zwischen
      // Snapshot-Read und Write hat ein Mensch confirmed/rejected gesetzt.
      // Menschliche Entscheidung schlägt Batch, auch im Rennen.
      counters.skippedHuman++;
    }
  } catch (err) {
    // Review-Fix 2: ein transienter Write-Fehler ist EIN verlorenes Dokument,
    // nicht ein verlorener Lauf — failed-Liste, weiter.
    deps.onError?.(doc.regulationKey, err);
    counters.failed.push(doc.regulationKey);
  }
}
