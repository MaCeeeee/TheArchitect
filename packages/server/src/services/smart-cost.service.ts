/**
 * Smart Cost Estimation Service
 *
 * Replaces static ArchiMate-type-based cost defaults with intelligent estimation:
 *   1. Zero-Cost: Structural/non-operational elements → $0
 *   2. Benchmark: Name-based matching against technology catalog → real pricing
 *   3. AI: LLM-based estimation for unmatched elements → industry benchmarks
 *   4. Type-Fallback: Legacy BASE_COSTS_BY_TYPE for remaining unknowns
 */

import {
  TECHNOLOGY_BENCHMARKS,
  ZERO_COST_ELEMENT_TYPES,
  ZERO_COST_NAME_PATTERN,
  type TechCategory,
} from '@thearchitect/shared';
import type { CostConfidence } from '@thearchitect/shared';
import { BASE_COSTS_BY_TYPE, STATUS_COST_MULTIPLIERS } from '@thearchitect/shared';

// ─── Public Types ───

export interface SmartCostEstimate {
  annualCost: number;
  confidence: CostConfidence;
  source: string;
  matchedBenchmark?: string;
  category?: TechCategory;
}

export interface SmartCostBatchInput {
  name: string;
  type: string;
  layer: string;
  metadata?: Record<string, unknown>;
}

// ─── Sync: Zero-Check + Benchmark Match ───

/**
 * Estimate the annual cost of an element using zero-check, benchmark matching,
 * and type-based fallback. This is synchronous and fast.
 * For AI-based estimation on unmatched elements, use `estimateSmartCostBatchAI`.
 */
export function estimateSmartCost(
  name: string,
  type: string,
  layer: string,
  metadata?: Record<string, unknown>,
): SmartCostEstimate {
  // 1. Zero-Cost: structural ArchiMate types
  if (ZERO_COST_ELEMENT_TYPES.has(type)) {
    return { annualCost: 0, confidence: 'zero', source: `Structural type: ${type}` };
  }

  // 2. Zero-Cost: name-based (Sticky Notes, flow control, etc.)
  const normalizedName = name.trim();
  if (ZERO_COST_NAME_PATTERN.test(normalizedName)) {
    return { annualCost: 0, confidence: 'zero', source: 'Non-operational workflow element' };
  }

  // 3. Benchmark match: iterate catalog, first match wins
  const lowerName = normalizedName.toLowerCase();
  // Also check n8n node type in metadata for more precise matching
  const n8nType = (metadata?.n8nType as string) || '';
  const matchTarget = `${lowerName} ${n8nType}`.trim();

  for (const bm of TECHNOLOGY_BENCHMARKS) {
    if (bm.keywords.test(matchTarget)) {
      return {
        annualCost: bm.annualCostRange.mid,
        confidence: 'benchmark',
        source: bm.source,
        matchedBenchmark: bm.id,
        category: bm.category,
      };
    }
  }

  // 4. Type-based fallback (legacy)
  const baseCost = BASE_COSTS_BY_TYPE[type];
  if (baseCost !== undefined && baseCost > 0) {
    return {
      annualCost: baseCost,
      confidence: 'type_default',
      source: `ArchiMate type default: ${type}`,
    };
  }

  // 5. Layer-based fallback
  const layerDefaults: Record<string, number> = {
    technology: 15000,
    application: 10000,
    business: 5000,
    strategy: 5000,
    motivation: 0,
    implementation_migration: 5000,
  };
  const fallback = layerDefaults[layer] ?? 5000;
  return {
    annualCost: fallback,
    confidence: 'type_default',
    source: `Layer default: ${layer}`,
  };
}

/**
 * Apply status multiplier to a smart cost estimate.
 */
export function applyStatusMultiplier(cost: number, status: string): number {
  return Math.round(cost * (STATUS_COST_MULTIPLIERS[status] || 1.0));
}

// ─── Async: AI Batch Estimation ───

/**
 * Estimate costs for a batch of unmatched elements using LLM.
 * Returns a map of element name → SmartCostEstimate.
 * Falls back to type defaults if AI is unavailable.
 */
export async function estimateSmartCostBatchAI(
  elements: SmartCostBatchInput[],
): Promise<Map<string, SmartCostEstimate>> {
  const results = new Map<string, SmartCostEstimate>();
  if (elements.length === 0) return results;

  // Check for AI availability
  const hasOpenAI = !!process.env.OPENAI_API_KEY;
  const hasAnthropic = !!process.env.ANTHROPIC_API_KEY;

  if (!hasOpenAI && !hasAnthropic) {
    // No AI available — return type defaults
    for (const el of elements) {
      results.set(el.name, estimateSmartCost(el.name, el.type, el.layer, el.metadata));
    }
    return results;
  }

  // Build batch prompt
  const elementList = elements.map((el, i) =>
    `${i + 1}. "${el.name}" (type: ${el.type}, layer: ${el.layer})`,
  ).join('\n');

  const prompt = `You are an IT cost estimation expert. Estimate the annual operating cost (EUR) for each architecture element below.

Use real-world industry benchmarks:
- Cloud infrastructure: AWS/Azure/GCP public pricing
- SaaS tools: vendor pricing pages (per-user or flat)
- Enterprise software: Gartner IT Spending Benchmarks
- Custom applications: industry average maintenance cost (15-20% of development cost)
- Non-operational elements (data entities, notes, groupings): EUR 0

Elements:
${elementList}

Return ONLY a valid JSON array (no markdown, no explanation):
[{"index": 1, "annualCost": 3600, "reasoning": "PostgreSQL RDS db.t3.medium"}]`;

  try {
    let response: string;

    if (hasAnthropic) {
      const Anthropic = (await import('@anthropic-ai/sdk')).default;
      const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
      const msg = await client.messages.create({
        model: process.env.ANTHROPIC_MODEL || 'claude-haiku-4-5-20251001',
        max_tokens: 2048,
        messages: [{ role: 'user', content: prompt }],
      });
      response = msg.content[0].type === 'text' ? msg.content[0].text : '';
    } else {
      const OpenAI = (await import('openai')).default;
      const client = new OpenAI({
        apiKey: process.env.OPENAI_API_KEY,
        baseURL: process.env.OPENAI_BASE_URL || undefined,
      });
      const completion = await client.chat.completions.create({
        model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 2048,
        temperature: 0.1,
      });
      response = completion.choices[0]?.message?.content || '';
    }

    // Parse JSON response
    const jsonMatch = response.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      const estimates: Array<{ index: number; annualCost: number; reasoning?: string }> =
        JSON.parse(jsonMatch[0]);

      for (const est of estimates) {
        const el = elements[est.index - 1];
        if (el) {
          results.set(el.name, {
            annualCost: Math.max(0, Math.round(est.annualCost)),
            confidence: 'ai',
            source: `AI estimate: ${est.reasoning || 'industry benchmark'}`,
          });
        }
      }
    }
  } catch (err) {
    // AI failed — fall through to type defaults
    console.warn('[SmartCost] AI estimation failed:', (err as Error).message);
  }

  // Fill in any elements that didn't get AI estimates
  for (const el of elements) {
    if (!results.has(el.name)) {
      results.set(el.name, estimateSmartCost(el.name, el.type, el.layer, el.metadata));
    }
  }

  return results;
}

// ─── Exports for Testing ───

export const __testExports = {
  estimateSmartCost,
  applyStatusMultiplier,
  estimateSmartCostBatchAI,
};
