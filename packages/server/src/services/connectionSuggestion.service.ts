import Anthropic from '@anthropic-ai/sdk';
import {
  hasStrongRelationship,
  CATEGORY_BY_TYPE,
  type StandardConnectionType,
  type ElementType,
} from '@thearchitect/shared';
import { queryDocuments, isConfigured as isRagConfigured } from './dataServer.service';

export interface SuggestionInput {
  id: string;
  type: string;
  name: string;
  description?: string;
}
export interface ExistingConnection {
  id: string;
  sourceId: string;
  targetId: string;
  type: string;
}
export interface Suggestion {
  sourceId: string;
  targetId: string;
  targetName: string;
  targetType: string;
  relationshipType: StandardConnectionType;
  confidence: number;
  reasoning: string;
}
export interface HealReport {
  elementsAnalyzed: number;
  isolatedCount: number;
  suggestionsTotal: number;
  perElement: Map<string, Suggestion[]>;
  ragContextUsed: boolean;
  llmCallsMade: number;
}
export interface HealOptions {
  projectId: string;
  elements: SuggestionInput[];
  connections: ExistingConnection[];
  minConfidence?: number;
  topNPerElement?: number;
  includeWeak?: boolean;
  /** Inject a custom LLM caller for tests. */
  llm?: LLMReasoner;
}

const DEFAULT_TOP_N = 4;
const DEFAULT_MAX_CANDIDATES = 20;

/**
 * Functional shape of the LLM step. The default impl uses Haiku 4.5; tests can
 * inject a stub.
 */
export type LLMReasoner = (input: {
  source: SuggestionInput;
  candidates: SuggestionInput[];
  ragContext: string;
}) => Promise<Array<{
  targetId: string;
  relationshipType: StandardConnectionType;
  confidence: number;
  reasoning: string;
}>>;

const SYSTEM_PROMPT = `You are an enterprise-architecture reviewer working with the ArchiMate 3.2 standard.

You receive ONE source architecture element (with name + description) and a list of CANDIDATE elements (also with name + description). You also receive optional REGULATORY CONTEXT (chunks from CSRD/LkSG/etc. documents the customer uploaded).

Your job: pick the candidates that are semantically and methodically appropriate to connect to the source. Be strict — only suggest connections that an experienced ArchiMate architect would draw manually based on what the elements actually represent.

Rules:
- Do NOT suggest a connection just because the structural ArchiMate rules allow it. Two stakeholders may be structurally connectible via composition, but unless the descriptions show one really contains the other, do not suggest it.
- Do NOT suggest connections to candidates whose description has no semantic relation to the source.
- Output a maximum of 5 suggestions, ordered by confidence (most plausible first). Prefer fewer high-quality suggestions over many weak ones.
- "confidence" is your subjective belief that an architect would draw this connection (0.0-1.0). 0.9+ = obvious, 0.7-0.9 = plausible, below 0.7 = drop it.
- "relationshipType" must be one of: composition, aggregation, assignment, realization, serving, access, influence, triggering, flow, specialization, association.
- "reasoning" is a single short sentence (max ~25 words) explaining WHY this connection makes sense, citing specific words from the descriptions.

Return ONLY valid JSON in this exact shape, no prose, no markdown fences:
{"suggestions": [{"targetId": "...", "relationshipType": "...", "confidence": 0.0, "reasoning": "..."}]}
If no candidate fits well, return {"suggestions": []}`;

const defaultLLM: LLMReasoner = async ({ source, candidates, ragContext }) => {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error('ANTHROPIC_API_KEY is not configured');
  }
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const candidateBlock = candidates
    .map((c, i) => `[${i + 1}] id=${c.id} type=${c.type} name="${c.name}" description="${(c.description || '').replace(/"/g, "'").slice(0, 400)}"`)
    .join('\n');

  const userMessage = [
    `SOURCE element:`,
    `  id=${source.id}`,
    `  type=${source.type}`,
    `  name="${source.name}"`,
    `  description="${(source.description || '').replace(/"/g, "'").slice(0, 600)}"`,
    ``,
    `CANDIDATES (${candidates.length}):`,
    candidateBlock,
    ``,
    ragContext ? `REGULATORY CONTEXT:\n${ragContext}\n` : '',
    `Return JSON only.`,
  ].join('\n');

  const response = await client.messages.create({
    model: process.env.ANTHROPIC_MODEL || 'claude-haiku-4-5-20251001',
    max_tokens: 2048,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: userMessage }],
  });

  const text = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('');

  const parsed = extractJsonObject(text);
  if (!parsed || !Array.isArray(parsed.suggestions)) return [];

  return parsed.suggestions
    .filter((s: unknown) => {
      if (typeof s !== 'object' || s === null) return false;
      const rec = s as Record<string, unknown>;
      return typeof rec.targetId === 'string' && typeof rec.confidence === 'number';
    })
    .map((s: unknown) => {
      const rec = s as Record<string, unknown>;
      return {
        targetId: String(rec.targetId),
        relationshipType: String(rec.relationshipType || 'association') as StandardConnectionType,
        confidence: Math.max(0, Math.min(1, Number(rec.confidence) || 0)),
        reasoning: String(rec.reasoning || '').slice(0, 300),
      };
    });
};

function extractJsonObject(text: string): { suggestions?: unknown[] } | null {
  // Strip markdown fences if any
  const cleaned = text.replace(/```json\s*|```\s*/g, '').trim();
  const firstBrace = cleaned.indexOf('{');
  const lastBrace = cleaned.lastIndexOf('}');
  if (firstBrace < 0 || lastBrace <= firstBrace) return null;
  const jsonStr = cleaned.slice(firstBrace, lastBrace + 1);
  try {
    return JSON.parse(jsonStr);
  } catch {
    return null;
  }
}

/**
 * Decide which candidates are even worth sending to the LLM. We use the
 * existing ArchiMate rule engine to drop pairs that are structurally
 * meaningless, then drop same-type pairs (e.g. stakeholder→stakeholder) which
 * almost always need explicit user intent rather than auto-suggestion.
 */
function preFilterCandidates(
  source: SuggestionInput,
  all: SuggestionInput[],
  alreadyConnected: Set<string>,
  pairKeyFn: (a: string, b: string) => string,
  maxN: number,
): SuggestionInput[] {
  const filtered: SuggestionInput[] = [];
  for (const c of all) {
    if (c.id === source.id) continue;
    if (alreadyConnected.has(pairKeyFn(source.id, c.id))) continue;
    if (c.type === source.type) continue; // same-type → only via explicit user action
    if (!hasStrongRelationship(source.type as ElementType, c.type as ElementType)) continue;
    if (!CATEGORY_BY_TYPE.get(c.type as ElementType)) continue;
    filtered.push(c);
    if (filtered.length >= maxN) break;
  }
  return filtered;
}

function pairKey(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

async function fetchRagContextSafe(projectId: string, query: string): Promise<{ context: string; used: boolean }> {
  if (!isRagConfigured()) return { context: '', used: false };
  try {
    const result = await queryDocuments({ projectId, text: query, topK: 3 });
    if (!result?.chunks?.length) return { context: '', used: false };
    const context = result.chunks
      .slice(0, 3)
      .map((c, i) => `[${i + 1}] (score=${c.score.toFixed(2)}) ${c.text.slice(0, 400)}`)
      .join('\n');
    return { context, used: true };
  } catch {
    // RAG must never block heal; downgrade silently.
    return { context: '', used: false };
  }
}

/**
 * LLM-driven, RAG-augmented batch suggestion engine. For each isolated element:
 *  1) structurally pre-filter candidates (drops hairball-prone pairs)
 *  2) pull regulatory context from the RAG layer (best-effort)
 *  3) ask Haiku 4.5 which candidates make semantic sense, with reasoning
 *  4) clamp to topN and minConfidence
 */
export async function suggestConnectionsForIsolatedElements(
  opts: HealOptions,
): Promise<HealReport> {
  const minConfidence = opts.minConfidence ?? 0.7;
  const topN = opts.topNPerElement ?? DEFAULT_TOP_N;
  const includeWeak = opts.includeWeak ?? false;
  const llm = opts.llm ?? defaultLLM;

  // Connection counts + pair set
  const connectionCount = new Map<string, number>();
  const connectedPairs = new Set<string>();
  for (const c of opts.connections) {
    connectionCount.set(c.sourceId, (connectionCount.get(c.sourceId) ?? 0) + 1);
    connectionCount.set(c.targetId, (connectionCount.get(c.targetId) ?? 0) + 1);
    connectedPairs.add(pairKey(c.sourceId, c.targetId));
  }

  const isolatedElements = opts.elements.filter((el) => {
    const cnt = connectionCount.get(el.id) ?? 0;
    return cnt === 0 || (includeWeak && cnt === 1);
  });

  let ragContextUsed = false;
  let llmCallsMade = 0;
  const elementById = new Map(opts.elements.map((e) => [e.id, e]));
  const perElement = new Map<string, Suggestion[]>();
  let total = 0;

  // Process in parallel but cap concurrency to avoid LLM rate-limits.
  const CONCURRENCY = 5;
  const queue = [...isolatedElements];
  const workers = Array.from({ length: Math.min(CONCURRENCY, queue.length) }, async () => {
    while (queue.length > 0) {
      const el = queue.shift();
      if (!el) break;

      const candidates = preFilterCandidates(
        el,
        opts.elements,
        connectedPairs,
        pairKey,
        DEFAULT_MAX_CANDIDATES,
      );
      if (candidates.length === 0) continue;

      const ragQuery = `${el.name} ${el.description ?? ''}`.trim().slice(0, 500);
      const { context, used } = await fetchRagContextSafe(opts.projectId, ragQuery);
      if (used) ragContextUsed = true;

      let raw: Awaited<ReturnType<LLMReasoner>>;
      try {
        raw = await llm({ source: el, candidates, ragContext: context });
        llmCallsMade++;
      } catch {
        continue; // skip element on LLM failure — do not poison the whole heal
      }

      const cleaned: Suggestion[] = raw
        .map((s) => {
          const target = elementById.get(s.targetId);
          if (!target) return null;
          if (s.confidence < minConfidence) return null;
          return {
            sourceId: el.id,
            targetId: s.targetId,
            targetName: target.name,
            targetType: target.type,
            relationshipType: s.relationshipType,
            confidence: Number(s.confidence.toFixed(3)),
            reasoning: s.reasoning,
          };
        })
        .filter((x): x is Suggestion => x !== null)
        .sort((a, b) => b.confidence - a.confidence)
        .slice(0, topN);

      if (cleaned.length > 0) {
        perElement.set(el.id, cleaned);
        total += cleaned.length;
      }
    }
  });
  await Promise.all(workers);

  return {
    elementsAnalyzed: opts.elements.length,
    isolatedCount: isolatedElements.length,
    suggestionsTotal: total,
    perElement,
    ragContextUsed,
    llmCallsMade,
  };
}
