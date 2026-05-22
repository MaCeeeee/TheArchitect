/**
 * Prompt-Template für UC-ICM-002 LLM Mapping-Service.
 *
 * Zentralisiert hier damit:
 *   - Prompt-Engineering A/B-fähig ohne Service-Logik anzufassen
 *   - Multi-Language-Behandlung (Regulation EN/DE) klar lokalisiert
 *   - Reasoning-Format konsistent über alle Aufrufe
 *
 * Linear: THE-279 (REQ-ICM-002.2)
 */
import type { RegulationLanguage } from '@thearchitect/shared';

export interface PromptRegulationContext {
  source: string;
  paragraphNumber: string;
  title: string;
  fullText: string;
  language: RegulationLanguage;
  jurisdiction: string;
  effectiveFrom?: string;
}

export interface PromptCandidateElement {
  id: string;
  name: string;
  type: string;
  layer?: string;
  description?: string;
}

export const SYSTEM_PROMPT = `You are a Compliance Architect AI specializing in mapping legal regulations to enterprise architecture elements (ArchiMate).

Your task: given ONE regulation paragraph and a list of candidate enterprise-architecture elements, identify which elements are materially affected by the regulation.

Output format — JSON ONLY, no prose, exactly matching this schema:
{
  "mappings": [
    {
      "elementId": "<EXACT id from candidate list>",
      "elementType": "<EXACT type from candidate list>",
      "confidence": <0.0 to 1.0>,
      "reasoning": "<= 500 chars, same language as the regulation>"
    }
  ]
}

Confidence scale (calibrate strictly):
  >= 0.9  — explicit mention or unmistakable scope match
  0.7-0.9 — strong implicit match (clear semantic alignment)
  0.5-0.7 — relevant but ambiguous coverage
  < 0.5   — DO NOT INCLUDE (caller drops these)

Hard rules:
  - elementId MUST be an exact, verbatim id from the provided candidate list. NEVER invent ids or partial matches.
  - elementType MUST match the candidate's declared type.
  - At MOST 5 mappings, ranked by confidence DESC.
  - If NO element is reasonably affected, return {"mappings": []}.
  - reasoning: ONE sentence, same language as the regulation text (EN if regulation is English, DE if German).
  - reasoning must cite the specific aspect of the regulation that affects the element.
  - NEVER include explanations outside the JSON.`;

/**
 * Builds the user-message body. Element list is rendered compact to
 * keep token usage predictable.
 */
export function buildUserPrompt(
  regulation: PromptRegulationContext,
  candidates: PromptCandidateElement[]
): string {
  const langLabel = regulation.language === 'de' ? 'German (Deutsch)' : 'English';
  const effective = regulation.effectiveFrom ? ` (in force since ${regulation.effectiveFrom})` : '';
  const sourceCite = `${regulation.source.toUpperCase()} ${regulation.paragraphNumber} — ${regulation.jurisdiction}${effective}`;

  const elementBlock = candidates
    .map((el, idx) => {
      const desc = el.description ? ` — ${el.description.slice(0, 280)}` : '';
      const layer = el.layer ? ` [layer: ${el.layer}]` : '';
      return `${idx + 1}. id="${el.id}" type="${el.type}"${layer} name="${el.name}"${desc}`;
    })
    .join('\n');

  return `=== REGULATION ===
Source: ${sourceCite}
Title: ${regulation.title}
Language: ${langLabel}

${regulation.fullText.slice(0, 12_000)}

=== CANDIDATE ARCHITECTURE ELEMENTS (${candidates.length} total) ===
${elementBlock || '(no candidates provided)'}

=== TASK ===
Identify which of the ${candidates.length} listed elements are materially affected by this regulation.
Return JSON only. No surrounding text, no markdown fences.`;
}
