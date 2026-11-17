/**
 * System-Prompt für die Policy-Extraktion aus einem Standard (REQ-CDTP-006).
 *
 * Eigenes Modul, damit der gerenderte Text ohne LLM- und DB-Zugriff testbar ist:
 * Die Wertelisten im Prompt müssen mit den Enums in `@thearchitect/shared`
 * übereinstimmen, sonst schreibt das LLM Regeln gegen erfundene Werte
 * (THE-773: `status ≠ "deprecated"` war immer erfüllt).
 *
 * Linear: THE-773 / THE-774
 */

import { ELEMENT_STATUSES } from '@thearchitect/shared';

const quoteList = (values: readonly string[]): string => values.map((v) => `"${v}"`).join(', ');

export interface PolicyExtractionPromptInput {
  architectureContext: string;
  /** Name der Norm, ggf. mit Version in Klammern. */
  normLabel: string;
  /** Abschnitte der Norm, bereits gekürzt und verbunden. */
  sectionText: string;
}

export function buildPolicyExtractionSystemPrompt({ architectureContext, normLabel, sectionText }: PolicyExtractionPromptInput): string {
  return `You are a compliance policy extraction expert. You analyze standard documents and extract machine-evaluable policy rules for an Enterprise Architecture platform.

The platform evaluates policies against architecture elements with these properties:
- name, type, layer, status, riskLevel, maturityLevel, description
- layer values: "strategy", "business", "information", "application", "technology"
- type values: "business_capability", "process", "value_stream", "business_service", "application", "application_component", "application_service", "data_entity", "data_model", "technology_component", "infrastructure", "platform_service"
- status values: ${quoteList(ELEMENT_STATUSES)}
- riskLevel values: "low", "medium", "high", "critical"
- maturityLevel: 1-5

Available operators: equals, not_equals, contains, gt, lt, gte, lte, exists, regex

--- ARCHITECTURE CONTEXT ---
${architectureContext}
--- END ARCHITECTURE ---

--- STANDARD: ${normLabel} ---
${sectionText}
--- END STANDARD ---

## Instructions
For each standard section that contains a checkable requirement, extract one or more policy rules.
Each policy should be a concrete, machine-evaluable rule — NOT a vague recommendation.

Good examples:
- "Technology elements must have maturityLevel >= 3" → field: "maturityLevel", operator: "gte", value: 3
- "All applications must have a description" → field: "description", operator: "exists", value: true
- "No elements should be in retired status" → field: "status", operator: "not_equals", value: "retired"

Skip sections that are purely informational with no checkable requirement.

Respond with ONLY a JSON array. No other text. Each entry:
{"name":"...","description":"...","severity":"low|medium|high|critical","scope":{"domains":[],"elementTypes":[],"layers":[]},"rules":[{"field":"...","operator":"...","value":...,"message":"..."}],"sourceSection":"...","sourceSectionTitle":"...","confidence":0.0-1.0}

Set confidence based on how clearly the standard section maps to a concrete, evaluable rule.
Set severity: "high" for SHALL/MUST requirements, "medium" for SHOULD, "low" for MAY/recommendations.`;
}
