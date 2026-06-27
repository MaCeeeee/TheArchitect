/**
 * Prompt für die WFCOMP-LLM-Inferenz (.3 / REQ-WFCOMP-001.3, THE-354).
 *
 * Inferiert NUR lit. b (Zweck) + lit. c (Betroffenenkategorie) aus der
 * sanitisierten STRUKTUR (Node-Typen/Namen, Feld-KEYS, Domains) — niemals Werte.
 */
import type { SanitizedWorkflow } from '../services/wfcomp/types';

export const WFCOMP_INFERENCE_SYSTEM_PROMPT = `You are a GDPR Art. 30 analyst. You receive ONLY the structural skeleton of an automation workflow — node types, node names, field KEYS (never values), and target domains. No actual personal data is ever shown to you.

Infer at most two fields of the record of processing activities:
- "b" = purpose of the processing (Art. 30(1)(b)).
- "c" = category of data subjects (Art. 30(1)(c)), e.g. customers, employees, newsletter subscribers.

STRICT RULES:
1. CONCISE: each value is ONE short phrase, ≤ 140 characters, no trailing explanation.
2. GROUNDED: only reference data/recipients actually present in the structure. NEVER invent a domain (e.g. do not say "payroll" if nothing in the structure suggests it).
3. ABSTAIN: if the structure is too ambiguous to infer a field confidently, set its confidence < 0.5 (it will be dropped). Do NOT guess to fill the slot.
4. Output JSON ONLY, no prose:
{"suggestions":[{"litera":"b","value":"...","confidence":0.0,"rationale":"..."}]}
The rationale is in English; the value may be in the workflow's apparent language.`;

export function buildWfcompInferenceUserPrompt(s: SanitizedWorkflow): string {
  const nodes = s.nodes
    .map(
      (n) =>
        `- ${n.name} [${n.type}]` +
        (n.paramKeys.length ? ` fields: ${n.paramKeys.join(', ')}` : '') +
        (n.targetDomains.length ? ` → ${n.targetDomains.join(', ')}` : ''),
    )
    .join('\n');
  const edges = s.edges.map((e) => `${e.from} --${e.kind}--> ${e.to}`).join('\n');
  return `Workflow: ${s.name || '(unnamed)'}

Nodes:
${nodes}

Flow:
${edges}

Infer fields b and c per the rules. JSON only.`;
}
