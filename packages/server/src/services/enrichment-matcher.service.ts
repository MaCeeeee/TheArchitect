/**
 * Enrichment Matcher Service
 *
 * 3-tier matching strategy to map external cost data to existing architecture elements:
 * 1. Exact — element has a metadata key matching sourceKey (sonarqubeKey, githubUrl, etc.)
 * 2. Fuzzy — normalized Levenshtein + token overlap on names
 * 3. AI-Assisted — LLM-based matching for remaining unmatched items
 */

import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';
import { runCypher, serializeNeo4jProperties } from '../config/neo4j';
import type {
  CostEnrichmentResult, EnrichmentMatch, EnrichmentPreview, MatchMethod,
} from '@thearchitect/shared';

// ─── Element Summary (from Neo4j) ───

interface ProjectElement {
  id: string;
  name: string;
  type: string;
  layer: string;
  metadata?: Record<string, unknown>;
}

// ─── Public API ───

export async function matchEnrichments(
  projectId: string,
  enrichments: CostEnrichmentResult[],
  source: string,
): Promise<EnrichmentPreview> {
  const elements = await loadProjectElements(projectId);
  if (elements.length === 0) {
    return { matches: [], unmatched: enrichments, elementCount: 0, source };
  }

  const matches: EnrichmentMatch[] = [];
  const remaining: CostEnrichmentResult[] = [];
  const usedElementIds = new Set<string>();

  // Tier 1: Exact property match
  for (const enrichment of enrichments) {
    const match = findExactMatch(enrichment, elements, usedElementIds);
    if (match) {
      matches.push(match);
      usedElementIds.add(match.elementId);
    } else {
      remaining.push(enrichment);
    }
  }

  // Tier 2: Fuzzy name match
  const afterFuzzy: CostEnrichmentResult[] = [];
  for (const enrichment of remaining) {
    const match = findFuzzyMatch(enrichment, elements, usedElementIds);
    if (match) {
      matches.push(match);
      usedElementIds.add(match.elementId);
    } else {
      afterFuzzy.push(enrichment);
    }
  }

  // Tier 3: AI-assisted match (only if there are unmatched items and available elements)
  let unmatched = afterFuzzy;
  if (afterFuzzy.length > 0) {
    const availableElements = elements.filter(e => !usedElementIds.has(e.id));
    if (availableElements.length > 0) {
      const aiResult = await aiMatch(afterFuzzy, availableElements);
      for (const m of aiResult.matches) {
        matches.push(m);
        usedElementIds.add(m.elementId);
      }
      unmatched = aiResult.unmatched;
    }
  }

  return { matches, unmatched, elementCount: elements.length, source };
}

// ─── Neo4j Element Loader ───

async function loadProjectElements(projectId: string): Promise<ProjectElement[]> {
  const records = await runCypher(
    `MATCH (e:ArchitectureElement {projectId: $projectId})
     RETURN e.id AS id, e.name AS name, e.type AS type, e.layer AS layer,
            e.githubUrl AS githubUrl, e.jiraKey AS jiraKey,
            e.sonarqubeKey AS sonarqubeKey, e.gitlabUrl AS gitlabUrl
     ORDER BY e.name`,
    { projectId },
  );

  return records.map(r => {
    const props = serializeNeo4jProperties(r.toObject());
    const metadata: Record<string, unknown> = {};
    if (props.githubUrl) metadata.githubUrl = props.githubUrl;
    if (props.jiraKey) metadata.jiraKey = props.jiraKey;
    if (props.sonarqubeKey) metadata.sonarqubeKey = props.sonarqubeKey;
    if (props.gitlabUrl) metadata.gitlabUrl = props.gitlabUrl;

    return {
      id: String(props.id),
      name: String(props.name || ''),
      type: String(props.type || ''),
      layer: String(props.layer || ''),
      metadata,
    };
  });
}

// ─── Tier 1: Exact Match ───

function findExactMatch(
  enrichment: CostEnrichmentResult,
  elements: ProjectElement[],
  usedIds: Set<string>,
): EnrichmentMatch | null {
  const key = enrichment.sourceKey.toLowerCase();

  for (const el of elements) {
    if (usedIds.has(el.id)) continue;

    // Match by ID
    if (el.id.toLowerCase() === key) {
      return buildMatch(enrichment, el, 1.0, 'exact');
    }

    // Match by metadata properties
    const meta = el.metadata || {};
    for (const val of Object.values(meta)) {
      if (typeof val === 'string' && val.toLowerCase().includes(key)) {
        return buildMatch(enrichment, el, 1.0, 'exact');
      }
    }
  }

  return null;
}

// ─── Tier 2: Fuzzy Name Match ───

function findFuzzyMatch(
  enrichment: CostEnrichmentResult,
  elements: ProjectElement[],
  usedIds: Set<string>,
): EnrichmentMatch | null {
  const sourceName = normalize(enrichment.sourceName);
  let bestMatch: { element: ProjectElement; score: number } | null = null;

  for (const el of elements) {
    if (usedIds.has(el.id)) continue;
    const elName = normalize(el.name);

    const leven = levenshteinSimilarity(sourceName, elName);
    const token = tokenOverlap(sourceName, elName);
    const score = leven * 0.6 + token * 0.4;

    if (score > (bestMatch?.score ?? 0)) {
      bestMatch = { element: el, score };
    }
  }

  if (bestMatch && bestMatch.score >= 0.55) {
    const confidence = Math.min(0.95, bestMatch.score);
    return buildMatch(enrichment, bestMatch.element, confidence, 'fuzzy');
  }

  return null;
}

function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/[-_./\\]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function levenshteinSimilarity(a: string, b: string): number {
  if (a === b) return 1;
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 1;

  const matrix: number[][] = [];
  for (let i = 0; i <= a.length; i++) {
    matrix[i] = [i];
    for (let j = 1; j <= b.length; j++) {
      if (i === 0) {
        matrix[i][j] = j;
      } else {
        const cost = a[i - 1] === b[j - 1] ? 0 : 1;
        matrix[i][j] = Math.min(
          matrix[i - 1][j] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j - 1] + cost,
        );
      }
    }
  }

  return 1 - matrix[a.length][b.length] / maxLen;
}

function tokenOverlap(a: string, b: string): number {
  const tokensA = new Set(a.split(' ').filter(Boolean));
  const tokensB = new Set(b.split(' ').filter(Boolean));
  if (tokensA.size === 0 && tokensB.size === 0) return 1;
  if (tokensA.size === 0 || tokensB.size === 0) return 0;

  let overlap = 0;
  for (const t of tokensA) {
    if (tokensB.has(t)) overlap++;
  }

  return (2 * overlap) / (tokensA.size + tokensB.size);
}

// ─── Tier 3: AI Match ───

async function aiMatch(
  unmatched: CostEnrichmentResult[],
  availableElements: ProjectElement[],
): Promise<{ matches: EnrichmentMatch[]; unmatched: CostEnrichmentResult[] }> {
  try {
    const response = await callLLM(
      `You are a matching assistant for enterprise architecture. Match external tool items to architecture elements by name similarity and context.

Rules:
- Only match when you are reasonably confident (>60%) the items refer to the same system/component
- Return a JSON array of matches
- Each match: { "sourceKey": "...", "elementId": "...", "confidence": 0.0-1.0 }
- If an item has no good match, omit it from the array
- Output ONLY valid JSON, no markdown or explanation`,

      `External tool items (to match):
${unmatched.map(e => `- key: "${e.sourceKey}", name: "${e.sourceName}"`).join('\n')}

Architecture elements (targets):
${availableElements.map(e => `- id: "${e.id}", name: "${e.name}", type: "${e.type}"`).join('\n')}

Return JSON array of matches.`,
      2048,
    );

    const parsed = extractJsonArray(response);
    const matches: EnrichmentMatch[] = [];
    const matchedKeys = new Set<string>();

    for (const item of parsed) {
      const m = item as { sourceKey: string; elementId: string; confidence: number };
      if (!m.sourceKey || !m.elementId || typeof m.confidence !== 'number') continue;

      const enrichment = unmatched.find(e => e.sourceKey === m.sourceKey);
      const element = availableElements.find(e => e.id === m.elementId);
      if (!enrichment || !element) continue;

      matches.push(buildMatch(enrichment, element, Math.min(m.confidence, 0.9), 'ai'));
      matchedKeys.add(m.sourceKey);
    }

    const stillUnmatched = unmatched.filter(e => !matchedKeys.has(e.sourceKey));
    return { matches, unmatched: stillUnmatched };
  } catch (err) {
    console.warn('[EnrichmentMatcher] AI matching failed, returning all as unmatched:', (err as Error).message);
    return { matches: [], unmatched };
  }
}

// ─── LLM Helper (non-streaming) ───

async function callLLM(systemPrompt: string, userMessage: string, maxTokens: number): Promise<string> {
  if (process.env.OPENAI_API_KEY) {
    const openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
      baseURL: process.env.OPENAI_BASE_URL || undefined,
    });
    const completion = await openai.chat.completions.create({
      model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage },
      ],
      max_tokens: maxTokens,
      temperature: 0.3,
    });
    return completion.choices[0]?.message?.content || '';
  }

  if (process.env.ANTHROPIC_API_KEY) {
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const message = await anthropic.messages.create({
      model: process.env.ANTHROPIC_MODEL || 'claude-haiku-4-5-20251001',
      system: systemPrompt,
      messages: [{ role: 'user', content: userMessage }],
      max_tokens: maxTokens,
    });
    return message.content[0]?.type === 'text' ? message.content[0].text : '';
  }

  throw new Error('No AI API key configured (OPENAI_API_KEY or ANTHROPIC_API_KEY)');
}

function extractJsonArray(text: string): unknown[] {
  const match = text.match(/\[[\s\S]*\]/);
  if (!match) return [];
  try {
    return JSON.parse(match[0]);
  } catch {
    return [];
  }
}

// ─── Helpers ───

function buildMatch(
  enrichment: CostEnrichmentResult,
  element: ProjectElement,
  confidence: number,
  method: MatchMethod,
): EnrichmentMatch {
  return {
    enrichment,
    elementId: element.id,
    elementName: element.name,
    elementType: element.type,
    confidence,
    matchMethod: method,
  };
}

/** @internal Exported for testing only */
export const __testExports = { normalize, levenshteinSimilarity, tokenOverlap, findExactMatch, findFuzzyMatch, buildMatch };
