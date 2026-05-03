import Anthropic from '@anthropic-ai/sdk';
import {
  hasStrongRelationship,
  getValidRelationships,
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
  sourceName: string;
  sourceType: string;
  targetId: string;
  targetName: string;
  targetType: string;
  relationshipType: StandardConnectionType;
  confidence: number;
  reasoning: string;
  /**
   * 'outgoing' = isolated element is the SOURCE of the proposed edge
   * 'incoming' = isolated element is the TARGET (Capability → Requirement etc.)
   * Needed because heal scans only isolated elements but ArchiMate edges have
   * a direction — e.g. a Requirement is realized BY a Capability, the edge
   * runs Capability → Requirement, not the reverse.
   */
  direction: 'outgoing' | 'incoming';
}
export interface HealReport {
  elementsAnalyzed: number;
  isolatedCount: number;
  suggestionsTotal: number;
  perElement: Map<string, Suggestion[]>;
  ragContextUsed: boolean;
  llmCallsMade: number;
  /** Suggestions dropped because the LLM picked an ArchiMate-invalid relationshipType. */
  invalidRelationshipDrops: number;
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
 * Edge types that count as "fulfilling" a Requirement (mirrors the
 * client-side Coverage utility — keep in sync).
 */
const FULFILLMENT_EDGE_TYPES = new Set([
  'realization',
  'realisation',
  'influence',
  'assignment',
  'serving',
]);

/**
 * Source-element types that DO NOT fulfill a Requirement even when
 * connected via a fulfillment-typed edge. ArchiMate Driver/Goal/etc.
 * MOTIVATE a requirement (often via 'influence'); they don't realize
 * it. Without this exception, every projected ESRS Requirement would
 * be considered "non-isolated" the moment its upstream regulatory
 * Driver-edge is created (see policy-to-requirement.service.ts), and
 * Heal would never propose realizing Capabilities for it.
 */
const NON_FULFILLER_SOURCE_TYPES = new Set([
  'driver',
  'goal',
  'principle',
  'requirement',
  'constraint',
  'assessment',
  'value',
  'meaning',
  'outcome',
]);

/**
 * Spec-chain isolation: an element of a known spec-chain type is
 * considered "isolated for heal purposes" if it lacks the specific
 * required edge in the ArchiMate spec chain
 *   Motivation → Strategy → Capability → Process → Activity,
 * REGARDLESS of how many other connections it has. Without this,
 * a Process with 5 Actor/Application connections but no realizing
 * link to a Capability would be skipped — exactly the BSH-demo
 * blocker where Compliance Audits / GHG Reporting / Supplier Due
 * Diligence Processes had Salesforce/SAP edges but none to a
 * Capability.
 *
 * Each entry says: this element type needs a connection in the given
 * direction, with one of the given relationship types, to one of the
 * given partner types. If at least one such edge exists, not isolated.
 */
interface SpecChainNeed {
  direction: 'incoming' | 'outgoing';
  edgeTypes: ReadonlyArray<string>;
  partnerTypes: ReadonlyArray<string>;
}

const SPEC_CHAIN_NEEDS: Record<string, SpecChainNeed> = {
  process: {
    direction: 'outgoing',
    edgeTypes: ['realization', 'realisation'],
    partnerTypes: ['business_capability', 'capability'],
  },
  business_process: {
    direction: 'outgoing',
    edgeTypes: ['realization', 'realisation'],
    partnerTypes: ['business_capability', 'capability'],
  },
  business_capability: {
    direction: 'incoming',
    edgeTypes: ['realization', 'realisation'],
    partnerTypes: ['process', 'business_process'],
  },
  capability: {
    direction: 'incoming',
    edgeTypes: ['realization', 'realisation'],
    partnerTypes: ['process', 'business_process'],
  },
};

function isSpecChainIsolated(
  el: SuggestionInput,
  connections: ExistingConnection[],
  elementById: Map<string, SuggestionInput>,
): boolean {
  const need = SPEC_CHAIN_NEEDS[el.type];
  if (!need) return false;
  for (const c of connections) {
    if (!need.edgeTypes.includes(c.type)) continue;
    if (need.direction === 'outgoing') {
      if (c.sourceId !== el.id) continue;
      const tgt = elementById.get(c.targetId);
      if (tgt && need.partnerTypes.includes(tgt.type)) return false;
    } else {
      if (c.targetId !== el.id) continue;
      const src = elementById.get(c.sourceId);
      if (src && need.partnerTypes.includes(src.type)) return false;
    }
  }
  return true;
}

/**
 * Whitelist of spec-chain pair → relationship types that are valid in
 * the ArchiMate spec but missing from the shared archimate-rules
 * `getValidRelationships` (which has a gap for the `strategy` aspect:
 * Process↔Capability returns only 'association' even though ArchiMate
 * 3.2 §7.3 explicitly says Process realizes Capability).
 *
 * Used to override hasStrongRelationship in pre-filter AND the
 * post-validation in the worker loop. Fixing the shared constants
 * properly is post-demo work.
 */
const SPEC_CHAIN_VALID_RELATIONS: Record<string, Set<string>> = {
  'process->business_capability': new Set(['realization', 'realisation']),
  'business_process->business_capability': new Set(['realization', 'realisation']),
  'business_capability->process': new Set(['realization', 'realisation']),
  'business_capability->business_process': new Set(['realization', 'realisation']),
  'process->capability': new Set(['realization', 'realisation']),
  'business_process->capability': new Set(['realization', 'realisation']),
  'capability->process': new Set(['realization', 'realisation']),
  'capability->business_process': new Set(['realization', 'realisation']),
};

function specChainHasStrong(srcType: string, tgtType: string): boolean {
  return `${srcType}->${tgtType}` in SPEC_CHAIN_VALID_RELATIONS;
}

function specChainAllows(srcType: string, tgtType: string, relType: string): boolean {
  return SPEC_CHAIN_VALID_RELATIONS[`${srcType}->${tgtType}`]?.has(relType) ?? false;
}

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
  /**
   * 'outgoing' = source → target  (default for backward compat)
   * 'incoming' = target → source  (e.g. Capability realizes Requirement)
   * The LLM is told both directions are possible per candidate; it picks one.
   */
  direction?: 'outgoing' | 'incoming';
}>>;

const SYSTEM_PROMPT = `You are an enterprise-architecture reviewer working with the ArchiMate 3.2 standard.

You receive ONE source architecture element (with name + description) and a list of CANDIDATE elements. Each candidate is annotated with relationship types that are VALID per ArchiMate 3.2 in two possible directions:
  outgoing = source → candidate
  incoming = candidate → source

You MUST:
  1) pick the correct DIRECTION for each suggestion. ArchiMate edges are directed.
     For example: a Capability REALIZES a Requirement, so the edge runs
     Capability → Requirement (incoming, if Requirement is the source). A
     Stakeholder is ASSOCIATED WITH a Driver, so the edge runs
     Stakeholder → Driver. Pick the direction an architect would actually draw.
  2) pick a relationshipType that is in the listed valid set FOR THE CHOSEN
     DIRECTION. Picking outside the set is a spec violation and will be rejected.

You may also receive REGULATORY CONTEXT (chunks from CSRD/LkSG/etc.) to inform judgment.

Your job: pick candidates that are semantically and methodically appropriate. Be strict — only suggest connections an experienced ArchiMate architect would draw manually.

Rules:
- "direction" MUST be "outgoing" or "incoming" and consistent with what an architect would draw.
- "relationshipType" MUST be in the valid set for the chosen direction. If only "association" is valid, that almost always means the pair is too weak — drop it unless descriptions show a very strong semantic match.
- Do NOT suggest a connection just because structural rules allow it. Descriptions must show a real semantic link.
- Output a maximum of 5 suggestions, ordered by confidence (most plausible first). Prefer fewer high-quality suggestions over many weak ones.
- "confidence" is your subjective belief that an architect would draw this connection (0.0-1.0). 0.9+ = obvious, 0.7-0.9 = plausible, below 0.7 = drop it.
- "reasoning" is one short sentence (max ~25 words) explaining WHY, citing specific words from the descriptions.

Return ONLY valid JSON in this exact shape, no prose, no markdown fences:
{"suggestions": [{"targetId": "...", "direction": "outgoing|incoming", "relationshipType": "...", "confidence": 0.0, "reasoning": "..."}]}
If no candidate fits well, return {"suggestions": []}`;

const defaultLLM: LLMReasoner = async ({ source, candidates, ragContext }) => {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error('ANTHROPIC_API_KEY is not configured');
  }
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const candidateBlock = candidates
    .map((c, i) => {
      const validOut = getValidRelationships(source.type as ElementType, c.type as ElementType);
      const validIn = getValidRelationships(c.type as ElementType, source.type as ElementType);
      const outBlock = validOut.length > 0 ? `validOutgoing(source→candidate)=[${validOut.join(', ')}]` : 'validOutgoing=[]';
      const inBlock = validIn.length > 0 ? `validIncoming(candidate→source)=[${validIn.join(', ')}]` : 'validIncoming=[]';
      return `[${i + 1}] id=${c.id} type=${c.type} ${outBlock} ${inBlock} name="${c.name}" description="${(c.description || '').replace(/"/g, "'").slice(0, 400)}"`;
    })
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
      const dir = rec.direction === 'incoming' ? 'incoming' : rec.direction === 'outgoing' ? 'outgoing' : undefined;
      return {
        targetId: String(rec.targetId),
        relationshipType: String(rec.relationshipType || 'association') as StandardConnectionType,
        confidence: Math.max(0, Math.min(1, Number(rec.confidence) || 0)),
        reasoning: String(rec.reasoning || '').slice(0, 300),
        direction: dir,
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
 *
 * Bidirectional: a candidate is kept if a strong relationship exists in
 * EITHER direction (source→candidate OR candidate→source). This is critical
 * for elements like Requirement that are mostly the TARGET of edges (a
 * Capability realizes a Requirement, not the other way round). Without this,
 * an isolated Requirement would never receive its 'realizing capability' edge
 * because heal only iterates isolated elements and would only consider
 * Requirement-as-source pairs.
 */
function preFilterCandidates(
  source: SuggestionInput,
  all: SuggestionInput[],
  alreadyConnected: Set<string>,
  pairKeyFn: (a: string, b: string) => string,
  maxN: number,
): Array<{ candidate: SuggestionInput; allowOutgoing: boolean; allowIncoming: boolean }> {
  const filtered: Array<{ candidate: SuggestionInput; allowOutgoing: boolean; allowIncoming: boolean }> = [];
  const sourceType = source.type as ElementType;
  for (const c of all) {
    if (c.id === source.id) continue;
    if (alreadyConnected.has(pairKeyFn(source.id, c.id))) continue;
    if (c.type === source.type) continue;
    const cType = c.type as ElementType;
    // Accept candidate if it's either in the canonical category map OR
    // a known spec-chain type (the shared map is missing some aliases
    // like 'business_process' / 'capability').
    if (!CATEGORY_BY_TYPE.get(cType) && !(c.type in SPEC_CHAIN_NEEDS)) continue;
    // hasStrongRelationship has a gap for the 'strategy' aspect (e.g.
    // Process→Capability falls back to 'association' only). Spec-chain
    // pairs whitelist these missing realization edges so heal can
    // propose them.
    const allowOutgoing = hasStrongRelationship(sourceType, cType) || specChainHasStrong(sourceType, cType);
    const allowIncoming = hasStrongRelationship(cType, sourceType) || specChainHasStrong(cType, sourceType);
    if (!allowOutgoing && !allowIncoming) continue;
    filtered.push({ candidate: c, allowOutgoing, allowIncoming });
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

  // For Requirements specifically, count only INCOMING fulfillment-typed
  // edges from non-motivation sources. A requirement that has only its
  // upstream Driver-influence edge is still uncovered from a compliance
  // standpoint and must be heal-iterated.
  const elementByIdLocal = new Map(opts.elements.map((e) => [e.id, e]));
  const fulfillmentInCount = new Map<string, number>();
  for (const c of opts.connections) {
    if (!FULFILLMENT_EDGE_TYPES.has(c.type)) continue;
    const src = elementByIdLocal.get(c.sourceId);
    if (!src) continue;
    if (NON_FULFILLER_SOURCE_TYPES.has(src.type)) continue;
    fulfillmentInCount.set(c.targetId, (fulfillmentInCount.get(c.targetId) ?? 0) + 1);
  }

  const isolatedElements = opts.elements.filter((el) => {
    if (el.type === 'requirement') {
      // Compliance-isolated: zero fulfilling realizers, regardless of
      // upstream Driver/Goal connections.
      return (fulfillmentInCount.get(el.id) ?? 0) === 0;
    }
    if (el.type in SPEC_CHAIN_NEEDS) {
      // Spec-chain isolation: scan if the required Capability↔Process
      // realization is missing, even if other edges exist.
      return isSpecChainIsolated(el, opts.connections, elementByIdLocal);
    }
    const cnt = connectionCount.get(el.id) ?? 0;
    return cnt === 0 || (includeWeak && cnt === 1);
  });

  let ragContextUsed = false;
  let llmCallsMade = 0;
  let invalidRelationshipDrops = 0;
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

      const candidatePairs = preFilterCandidates(
        el,
        opts.elements,
        connectedPairs,
        pairKey,
        DEFAULT_MAX_CANDIDATES,
      );
      if (candidatePairs.length === 0) continue;

      // Pass plain SuggestionInput[] to the LLM (existing contract); the
      // direction information is reconstructed during post-validation.
      const candidates = candidatePairs.map((p) => p.candidate);
      const directionByCandidate = new Map(
        candidatePairs.map((p) => [p.candidate.id, { allowOutgoing: p.allowOutgoing, allowIncoming: p.allowIncoming }]),
      );

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

          // Decide the actual edge direction. If the LLM specified, honour it
          // (when permitted by the pre-filter). Otherwise auto-pick: prefer
          // the direction that has a strong relationship; if both, prefer
          // outgoing (back-compat).
          const allowed = directionByCandidate.get(s.targetId) ?? { allowOutgoing: true, allowIncoming: false };
          let direction: 'outgoing' | 'incoming';
          if (s.direction === 'incoming' && allowed.allowIncoming) direction = 'incoming';
          else if (s.direction === 'outgoing' && allowed.allowOutgoing) direction = 'outgoing';
          else if (allowed.allowOutgoing) direction = 'outgoing';
          else if (allowed.allowIncoming) direction = 'incoming';
          else { invalidRelationshipDrops++; return null; }

          // Post-validation: relationship must be valid for the chosen direction
          const realSource = direction === 'outgoing' ? el : target;
          const realTarget = direction === 'outgoing' ? target : el;
          const validForPair = getValidRelationships(
            realSource.type as ElementType,
            realTarget.type as ElementType,
          );
          const isValid = validForPair.includes(s.relationshipType)
            || specChainAllows(realSource.type, realTarget.type, s.relationshipType);
          if (!isValid) {
            invalidRelationshipDrops++;
            return null;
          }

          return {
            sourceId: realSource.id,
            sourceName: realSource.name,
            sourceType: realSource.type,
            targetId: realTarget.id,
            targetName: realTarget.name,
            targetType: realTarget.type,
            relationshipType: s.relationshipType,
            confidence: Number(s.confidence.toFixed(3)),
            reasoning: s.reasoning,
            direction,
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
    invalidRelationshipDrops,
  };
}
