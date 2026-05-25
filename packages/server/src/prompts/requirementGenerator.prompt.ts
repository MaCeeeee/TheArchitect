/**
 * Prompt-Template für UC-REQGEN-001 — "Anforderungen generieren aus Regulation-Text".
 *
 * Goal: aus einem Regulation-Paragraph werden strukturierte, actionable
 * ComplianceRequirements extrahiert. Pattern-Vorbild: complianceMapping.prompt.ts
 *
 * Linear: THE-303 (REQ-REQGEN-001.2)
 */
import type { RegulationLanguage } from '@thearchitect/shared';

export interface PromptRegulationContext {
  source: string;
  paragraphNumber: string;
  title?: string;
  fullText: string;
  language: RegulationLanguage;
  jurisdiction: string;
}

export interface PromptCandidateElement {
  id: string;
  name: string;
  type: string;
  layer?: string;
  description?: string;
}

export const SYSTEM_PROMPT = `You are a Compliance Architect AI specializing in extracting **actionable, structured Anforderungen** (requirements) from legal regulations.

Your task: given ONE regulation paragraph and (optionally) a list of candidate enterprise-architecture elements, extract every concrete, actionable requirement that the regulation imposes.

Output format — JSON ONLY, no prose, exactly matching this schema:
{
  "requirements": [
    {
      "title": "<5-200 chars, imperative ('Risikoanalyse durchführen')>",
      "description": "<5-2000 chars, what concretely MUST be done>",
      "priority": "<must | should | may>",
      "linkedElementIds": ["<exact id from candidate list>", "..."],
      "confidence": <0.0 to 1.0>
    }
  ]
}

Priority-Mapping (strict):
  "must"   — Imperativ ("MUSS", "ist verpflichtet", "shall", "is required")
  "should" — Empfehlung ("SOLLTE", "should", "is recommended")
  "may"    — Kann-Bestimmung ("KANN", "may", "is permitted")

Hard rules:
  - Extract MAXIMUM 10 requirements per paragraph (most important first).
  - Each requirement MUST be ONE concrete action — NO "shall ensure compliance with..." Floskeln.
  - title: imperative, 5-200 chars, kein Punkt am Ende.
  - description: 5-2000 chars, explains WHAT must be done HOW.
  - linkedElementIds: ONLY use exact ids from the candidate list. If no candidates provided OR no clear match, return [].
  - NEVER invent element-ids or hallucinate elements.
  - confidence reflects YOUR certainty that this requirement is genuine (not made-up).
  - reasoning is NOT a separate field — it's embedded in description.
  - Same language as the regulation text (DE if German, EN if English).
  - If NO actionable requirement, return {"requirements": []}.
  - NEVER include explanations outside the JSON.`;

/**
 * Builds the user-message body for the LLM.
 */
export function buildUserPrompt(
  regulation: PromptRegulationContext,
  candidates: PromptCandidateElement[],
): string {
  const langLabel = regulation.language === 'de' ? 'German (Deutsch)' : 'English';
  const sourceCite = `${regulation.source.toUpperCase()} ${regulation.paragraphNumber} — ${regulation.jurisdiction}`;

  const elementBlock = candidates.length === 0
    ? '(no candidates provided — set linkedElementIds: [] for all requirements)'
    : candidates
        .map((el, idx) => {
          const desc = el.description ? ` — ${el.description.slice(0, 280)}` : '';
          const layer = el.layer ? ` [layer: ${el.layer}]` : '';
          return `${idx + 1}. id="${el.id}" type="${el.type}"${layer} name="${el.name}"${desc}`;
        })
        .join('\n');

  return `=== REGULATION PARAGRAPH ===
Source: ${sourceCite}
${regulation.title ? `Title: ${regulation.title}\n` : ''}Language: ${langLabel}

${regulation.fullText.slice(0, 12_000)}

=== CANDIDATE ARCHITECTURE ELEMENTS (${candidates.length} total) ===
${elementBlock}

=== TASK ===
Extract every concrete, actionable requirement imposed by this regulation paragraph.
For each requirement, identify which of the listed candidate elements MUST implement it (use empty array [] if no clear match).
Return JSON only. No surrounding text, no markdown fences.`;
}
