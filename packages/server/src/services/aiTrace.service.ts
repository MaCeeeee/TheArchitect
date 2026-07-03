/**
 * AiTrace-Service — best-effort Observability für die Compliance-LLM-Calls.
 *
 * Design-Prinzip: Tracing darf den Request-Pfad NIEMALS blockieren oder
 * killen. `recordAiTrace` fängt jeden Fehler ab und gibt still auf, wenn:
 *   - Tracing per Env deaktiviert ist (AI_TRACING_ENABLED === 'false'), oder
 *   - keine Mongo-Verbindung offen ist (readyState !== 1).
 *
 * Linear: THE-384 (REQ-EVAL-001.6) · Epic THE-378 (UC-EVAL-001)
 */
import mongoose from 'mongoose';
import { randomUUID } from 'node:crypto';
import { AiTrace, type AiTraceOperation, type AiTracePrediction } from '../models/AiTrace';
import { log } from '../config/logger';

// ─── Pricing (USD pro 1M Tokens) ────────────────────────────────
// Stand: Claude-Pricing (Haiku 4.5 = $1 in / $5 out). Bewusst als Tabelle,
// damit Kosten pro Trace berechenbar sind, ohne Preise in jeden Aufruf zu backen.
const PRICING_USD_PER_MTOK: Record<string, { input: number; output: number }> = {
  'claude-haiku-4-5': { input: 1, output: 5 },
  'claude-haiku-4-5-20251001': { input: 1, output: 5 },
  'claude-sonnet-5': { input: 3, output: 15 },
  'claude-opus-4-8': { input: 5, output: 25 },
};

/** USD-Kosten eines Calls, oder undefined wenn Modell-Preis unbekannt. */
export function computeCostUsd(
  model: string,
  inputTokens?: number,
  outputTokens?: number,
): number | undefined {
  const price = PRICING_USD_PER_MTOK[model];
  if (!price || inputTokens == null || outputTokens == null) return undefined;
  return (inputTokens / 1_000_000) * price.input + (outputTokens / 1_000_000) * price.output;
}

/** Ist Tracing aktiv? (Env-Gate + offene Mongo-Verbindung.) */
export function isTracingEnabled(): boolean {
  if (process.env.AI_TRACING_ENABLED === 'false') return false;
  return mongoose.connection.readyState === 1;
}

export interface RecordAiTraceInput {
  operation: AiTraceOperation;
  model: string;
  promptVersionHash: string;
  projectId?: string;
  regulationId?: string;
  regulationKey?: string;
  regulationVersionHash?: string;
  candidateElementIds: string[];
  predictions: AiTracePrediction[];
  rawResponse?: string;
  latencyMs: number;
  inputTokens?: number;
  outputTokens?: number;
  /** Optional stable id; auto-generated if omitted. Returned to the caller. */
  requestId?: string;
}

/**
 * Persistiert einen Trace. Gibt die requestId zurück (auch wenn nichts
 * geschrieben wurde, damit der Aufrufer korrelieren kann), oder null bei
 * einem unerwarteten Fehler VOR dem Best-Effort-Write.
 */
export async function recordAiTrace(input: RecordAiTraceInput): Promise<string | null> {
  const requestId = input.requestId ?? randomUUID();
  if (!isTracingEnabled()) return requestId;

  try {
    await AiTrace.create({
      requestId,
      operation: input.operation,
      modelId: input.model,
      promptVersionHash: input.promptVersionHash,
      projectId: input.projectId
        ? new mongoose.Types.ObjectId(input.projectId)
        : undefined,
      regulationId: input.regulationId
        ? new mongoose.Types.ObjectId(input.regulationId)
        : undefined,
      regulationKey: input.regulationKey,
      regulationVersionHash: input.regulationVersionHash,
      candidateCount: input.candidateElementIds.length,
      candidateElementIds: input.candidateElementIds,
      predictions: input.predictions,
      predictionCount: input.predictions.length,
      rawResponse: input.rawResponse?.slice(0, 4000),
      latencyMs: input.latencyMs,
      inputTokens: input.inputTokens,
      outputTokens: input.outputTokens,
      costUsd: computeCostUsd(input.model, input.inputTokens, input.outputTokens),
    });
  } catch (err) {
    // Best-effort: Tracing-Fehler dürfen den Request nicht beeinflussen.
    log.warn(
      { err: err instanceof Error ? err.message : String(err), requestId },
      '[aiTrace] failed to persist trace (non-fatal)',
    );
  }
  return requestId;
}
