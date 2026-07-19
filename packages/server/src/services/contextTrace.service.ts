/**
 * ContextTrace-Service — best-effort recorder für governed-retrieval Aufrufe.
 *
 * Design-Prinzip (mirrors packages/server/src/services/aiTrace.service.ts
 * EXACTLY): Recording darf den Request-Pfad NIEMALS blockieren oder killen.
 * `recordContextTrace` fängt jeden Fehler ab und gibt still auf, wenn:
 *   - Context-Tracing per Env deaktiviert ist, oder
 *   - keine Mongo-Verbindung offen ist (readyState !== 1).
 *
 * Env-Gate: default OFF (deliberately different from aiTrace's default-ON).
 * Enabled when CONTEXT_TRACING_ENABLED === 'true', OR — to piggyback on the
 * existing AI tracing switch when this feature's own flag is unset — when
 * CONTEXT_TRACING_ENABLED is unset AND AI_TRACING_ENABLED === 'true'.
 *
 * Linear: THE-423
 */
import mongoose from 'mongoose';
import { randomUUID } from 'node:crypto';
import { ContextTrace } from '../models/ContextTrace';
import { log } from '../config/logger';
import type { ConsumedRef, ContextAuditPayload, ContextTraceFeature } from '@thearchitect/shared';

/** Ist Context-Tracing aktiv? (Env-Gate + offene Mongo-Verbindung.) */
export function isContextTracingEnabled(): boolean {
  const flag = process.env.CONTEXT_TRACING_ENABLED;
  const enabledByFlag =
    flag === 'true' || (flag === undefined && process.env.AI_TRACING_ENABLED === 'true');
  if (!enabledByFlag) return false;
  return mongoose.connection.readyState === 1;
}

export interface RecordContextTraceInput {
  /** Optional stable id; auto-generated if omitted. Returned to the caller. */
  requestId?: string;
  feature: ContextTraceFeature;
  projectId: string;
  userId?: string;
  consumed: ConsumedRef[];
  model?: string;
  promptVersion?: string;
  llmTraceRef?: string;
  audit?: ContextAuditPayload;
  evidenceSetHash?: string;
}

/**
 * Persistiert einen ContextTrace. Gibt die requestId immer zurück (auch wenn
 * nichts geschrieben wurde, damit der Aufrufer korrelieren kann). Wirft nie.
 */
export async function recordContextTrace(input: RecordContextTraceInput): Promise<string> {
  const requestId = input.requestId ?? randomUUID();
  if (!isContextTracingEnabled()) return requestId;

  try {
    await ContextTrace.create({
      requestId,
      feature: input.feature,
      projectId: new mongoose.Types.ObjectId(input.projectId),
      userId: input.userId,
      consumed: input.consumed,
      model: input.model,
      promptVersion: input.promptVersion,
      llmTraceRef: input.llmTraceRef,
      audit: input.audit,
      evidenceSetHash: input.evidenceSetHash,
    });
  } catch (err) {
    // Best-effort: Tracing-Fehler dürfen den Request nicht beeinflussen.
    log.warn(
      { err: err instanceof Error ? err.message : String(err), requestId },
      '[contextTrace] failed to persist trace (non-fatal)',
    );
  }
  return requestId;
}
