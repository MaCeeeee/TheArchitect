/**
 * LLM enrichment for the register (THE-448 AC-1/AC-2/AC-3/AC-5). The LLM is a SUGGESTION layer,
 * never a decider:
 *   - duplicate candidates go beyond the deterministic fingerprint, but a merge is only ever
 *     decided by the fingerprint or a human — this module never merges (AC-1);
 *   - problem clusters are proposed; a human calls register.service.createProblem to act (AC-2);
 *   - every LLM output is marked `suggestion: true` and logged with the model + a prompt hash (AC-3);
 *   - the client is injectable and absent-key-safe, so the deterministic engine is fully
 *     functional with no LLM at all (AC-5).
 */
import crypto from 'crypto';
import Anthropic from '@anthropic-ai/sdk';
import { RegisterEntry } from '../models/RegisterEntry';
import type { IRegisterEntry } from '../models/RegisterEntry';
import {
  loadHead,
  chainHeads,
  RegisterNotFoundError,
  type ActorContext,
} from './register.service';
import { createAuditEntry } from '../middleware/audit.middleware';
import { log } from '../config/logger';

export interface LlmCompletion {
  text: string;
  model: string;
}
export interface LlmClient {
  complete(system: string, user: string): Promise<LlmCompletion>;
}

/** Anthropic-backed client, or null when no API key is configured (→ graceful degradation). */
export function getDefaultLlmClient(): LlmClient | null {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;
  const model = process.env.ANTHROPIC_MODEL || 'claude-haiku-4-5-20251001';
  return {
    async complete(system, user) {
      const anthropic = new Anthropic({ apiKey });
      const msg = await anthropic.messages.create({
        model,
        max_tokens: 1024,
        system,
        messages: [{ role: 'user', content: user }],
      });
      const text = msg.content
        .filter((b): b is Anthropic.TextBlock => b.type === 'text')
        .map((b) => b.text)
        .join('\n');
      return { text, model };
    },
  };
}

export interface DuplicateSuggestion {
  chainId: string;
  confidence: number;
  reasoning: string;
  suggestion: true;
}
export interface ProblemClusterSuggestion {
  title: string;
  defectChainIds: string[];
  reasoning: string;
  suggestion: true;
}
export interface EnrichmentResult<T> {
  suggestions: T[];
  model: string | null;
  promptHash: string | null;
  degraded: boolean;
}

const MAX_CANDIDATES = 30;

function promptHashOf(system: string, user: string): string {
  return crypto.createHash('sha256').update(`${system}\n---\n${user}`).digest('hex').slice(0, 16);
}

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.min(1, Math.max(0, n));
}

function extractJsonArray(text: string): unknown[] | null {
  const m = text.match(/\[[\s\S]*\]/);
  if (!m) return null;
  try {
    const v = JSON.parse(m[0]);
    return Array.isArray(v) ? v : null;
  } catch {
    return null;
  }
}

function brief(h: IRegisterEntry): Record<string, unknown> {
  const topFrame = (h.stackTrace ?? '')
    .split('\n')
    .map((l) => l.trim())
    .find((l) => l.length > 0);
  return {
    chainId: h.chainId.toString(),
    title: h.title,
    errorType: h.errorType ?? null,
    component: h.systemComponent,
    topFrame: topFrame ?? null,
  };
}

async function auditEnrichment(
  actor: ActorContext,
  projectId: string,
  after: Record<string, unknown>,
): Promise<void> {
  if (!actor.userId) return;
  await createAuditEntry({
    userId: actor.userId,
    projectId,
    action: 'register.enrichment',
    entityType: 'RegisterEntry',
    ip: actor.ip,
    userAgent: actor.userAgent,
    riskLevel: 'low',
    after,
  });
}

const OPENISH = new Set(['open', 'assessed', 'triaging', 'mitigating']);

/**
 * Suggest likely duplicates of a defect beyond the deterministic fingerprint (AC-1). Returns
 * candidates from the open-defect pool only (hallucinated ids are dropped). NEVER merges.
 * Pass `llm` to inject a client (tests); pass `null` to force the degraded path.
 */
export async function suggestDuplicates(
  projectId: string,
  chainId: string,
  actor: ActorContext,
  llm?: LlmClient | null,
): Promise<EnrichmentResult<DuplicateSuggestion>> {
  const target = await loadHead(projectId, chainId);
  if (!target) throw new RegisterNotFoundError(chainId);

  const client = llm !== undefined ? llm : getDefaultLlmClient();
  const pool = (await chainHeads(projectId, 'defect'))
    .filter(
      (h) =>
        h.chainId.toString() !== chainId &&
        h.fingerprint !== target.fingerprint &&
        OPENISH.has(h.status),
    )
    .slice(0, MAX_CANDIDATES);

  if (!client || pool.length === 0) {
    return { suggestions: [], model: null, promptHash: null, degraded: !client };
  }

  const system =
    'You compare software defects and identify likely duplicates of a target defect. ' +
    'Output ONLY a JSON array of objects {chainId, confidence (0..1), reasoning}. ' +
    'Only use chainIds from the provided candidate list. If none are plausible duplicates, output [].';
  const user = JSON.stringify({ target: brief(target), candidates: pool.map(brief) });
  const promptHash = promptHashOf(system, user);

  try {
    const { text, model } = await client.complete(system, user);
    const validIds = new Set(pool.map((p) => p.chainId.toString()));
    const raw = extractJsonArray(text) ?? [];
    const suggestions: DuplicateSuggestion[] = raw
      .filter(
        (r): r is { chainId: string; confidence?: number; reasoning?: string } =>
          !!r && typeof r === 'object' && validIds.has(String((r as { chainId?: unknown }).chainId)),
      )
      .map((r) => ({
        chainId: String(r.chainId),
        confidence: clamp01(Number(r.confidence)),
        reasoning: String(r.reasoning ?? ''),
        suggestion: true as const,
      }));
    await auditEnrichment(actor, projectId, {
      kind: 'duplicate',
      targetChainId: chainId,
      model,
      promptHash,
      candidateCount: pool.length,
      suggestionCount: suggestions.length,
    });
    return { suggestions, model, promptHash, degraded: false };
  } catch (err) {
    log.warn({ err, chainId }, '[enrichment] duplicate suggestion degraded');
    return { suggestions: [], model: null, promptHash, degraded: true };
  }
}

/**
 * Suggest systemic problems by clustering open defects (AC-2). Proposals only — a human confirms
 * via register.service.createProblem. Clusters reference real defect chainIds and need ≥2 members.
 */
export async function suggestProblemClusters(
  projectId: string,
  actor: ActorContext,
  llm?: LlmClient | null,
): Promise<EnrichmentResult<ProblemClusterSuggestion>> {
  const client = llm !== undefined ? llm : getDefaultLlmClient();
  const pool = (await chainHeads(projectId, 'defect'))
    .filter((h) => OPENISH.has(h.status) && !h.parentRef)
    .slice(0, MAX_CANDIDATES);

  if (!client || pool.length < 2) {
    return { suggestions: [], model: null, promptHash: null, degraded: !client };
  }

  const system =
    'You cluster related software defects into systemic problems (known errors). ' +
    'Output ONLY a JSON array of objects {title, defectChainIds (array), reasoning}. ' +
    'Use only chainIds from the provided list; each cluster needs at least 2 defects. ' +
    'If nothing clusters, output [].';
  const user = JSON.stringify({ defects: pool.map(brief) });
  const promptHash = promptHashOf(system, user);

  try {
    const { text, model } = await client.complete(system, user);
    const validIds = new Set(pool.map((p) => p.chainId.toString()));
    const raw = extractJsonArray(text) ?? [];
    const suggestions: ProblemClusterSuggestion[] = raw
      .filter((r): r is { title?: string; defectChainIds?: unknown; reasoning?: string } => !!r && typeof r === 'object')
      .map((r) => ({
        title: String(r.title ?? 'Systemic problem'),
        defectChainIds: (Array.isArray(r.defectChainIds) ? r.defectChainIds : [])
          .map((c) => String(c))
          .filter((c) => validIds.has(c)),
        reasoning: String(r.reasoning ?? ''),
        suggestion: true as const,
      }))
      .filter((s) => s.defectChainIds.length >= 2);
    await auditEnrichment(actor, projectId, {
      kind: 'problem_cluster',
      model,
      promptHash,
      poolSize: pool.length,
      clusterCount: suggestions.length,
    });
    return { suggestions, model, promptHash, degraded: false };
  } catch (err) {
    log.warn({ err }, '[enrichment] problem clustering degraded');
    return { suggestions: [], model: null, promptHash, degraded: true };
  }
}
