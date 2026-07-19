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
import { ComplianceMapping, type IComplianceMapping } from '../models/ComplianceMapping';
import { ComplianceRequirement, type IComplianceRequirement } from '../models/ComplianceRequirement';
import { LawDiscoveryFinding, type ILawDiscoveryFinding } from '../models/LawDiscoveryFinding';
import { runCypher, serializeNeo4jProperties } from '../config/neo4j';
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

export interface RegulationImpact {
  affected: {
    mappings: IComplianceMapping[];
    requirements: IComplianceRequirement[];
    findings: ILawDiscoveryFinding[];
    elements: Record<string, unknown>[];
    connections: Record<string, unknown>[];
  };
  traceIds: string[];
}

/**
 * Reverse-lookup (THE-423 Task 12, AC-5 — REGDIFF/drift foundation, THE-308).
 *
 * Given a regulationKey + versionHash, finds every ContextTrace whose
 * `consumed` cites it, then joins those traces' `requestId`s against every
 * output that stamps `contextTraceId` — across Mongo (ComplianceMapping,
 * ComplianceRequirement, LawDiscoveryFinding) and Neo4j (ArchitectureElement
 * nodes + CONNECTS_TO relationships).
 *
 * Precision guarantee: outputs stamped with a DIFFERENT trace (one that did
 * NOT consume this exact regulationKey/versionHash) are excluded — that's
 * the entire reason per-regulation traces exist.
 *
 * Read-only. Never writes.
 */
export async function findOutputsByRegulation(
  projectId: string,
  regulationKey: string,
  versionHash: string,
): Promise<RegulationImpact> {
  const traces = await ContextTrace.find({
    projectId,
    'consumed.regulationKey': regulationKey,
    'consumed.versionHash': versionHash,
  })
    .select('requestId')
    .lean();
  const ids = traces.map(t => t.requestId);

  if (ids.length === 0) {
    return {
      affected: { mappings: [], requirements: [], findings: [], elements: [], connections: [] },
      traceIds: [],
    };
  }

  const [mappings, requirements, findings, elementRecords, connectionRecords] = await Promise.all([
    ComplianceMapping.find({ projectId, contextTraceId: { $in: ids } }).lean(),
    ComplianceRequirement.find({ projectId, contextTraceId: { $in: ids } }).lean(),
    LawDiscoveryFinding.find({ projectId, contextTraceId: { $in: ids } }).lean(),
    runCypher(
      `MATCH (e:ArchitectureElement {projectId: $projectId})
       WHERE e.contextTraceId IN $ids
       RETURN e`,
      { projectId, ids },
    ),
    runCypher(
      `MATCH (a:ArchitectureElement {projectId: $projectId})-[r:CONNECTS_TO]->(b:ArchitectureElement {projectId: $projectId})
       WHERE r.contextTraceId IN $ids
       RETURN r`,
      { projectId, ids },
    ),
  ]);

  const elements = elementRecords.map(r =>
    serializeNeo4jProperties((r.get('e') as { properties: Record<string, unknown> }).properties),
  );
  const connections = connectionRecords.map(r =>
    serializeNeo4jProperties((r.get('r') as { properties: Record<string, unknown> }).properties),
  );

  return {
    affected: {
      mappings: mappings as unknown as IComplianceMapping[],
      requirements: requirements as unknown as IComplianceRequirement[],
      findings: findings as unknown as ILawDiscoveryFinding[],
      elements,
      connections,
    },
    traceIds: ids,
  };
}
