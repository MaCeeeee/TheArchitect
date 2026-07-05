/**
 * Prompt-Template für den Kaskaden-Judge (THE-401 S2 / THE-382).
 *
 * Rolle in der Kaskade: Der GENERATOR läuft bewusst weit (hoher Cap, Recall ~84 %),
 * der JUDGE validiert jedes vorgeschlagene Mapping auf ZWEI getrennten Achsen —
 * Correctness (required / incorrect) und Conciseness (superfluous) — und macht
 * den Missed-Sweep über die NICHT vorgeschlagenen Kandidaten (Recall-Wächter).
 * Empirische Motivation (EVAL_BASELINE.md Cap-Sweep): Cap 15 ⇒ Recall 84 %,
 * aber Precision 37 % und Empty-Set 0 % — die Aufgabe ist Wegschneiden.
 *
 * Audit-Invariante: Der Judge FLAGGT, er löscht nie — die Filterung passiert
 * beim Aufrufer (Eval-Report / Human-Queue), jede Verdikt-Begründung bleibt.
 *
 * Linear: THE-401 (REQ-EVAL-001.10) · THE-382 (REQ-EVAL-001.4)
 */

export interface JudgePromptCandidate {
  id: string;
  name: string;
  type: string;
  description?: string; // enthält im Self-Set die serialisierten Facts
}

export interface JudgePromptProposal {
  elementId: string;
  confidence: number;
  reasoning: string;
}

export const JUDGE_SYSTEM_PROMPT = `You are a strict compliance-mapping VALIDATOR (the "judge" in a generate-then-validate cascade).

Input: ONE requirement (already translated into architecture language), the FULL candidate-element list (with structured facts where available), and the PROPOSED mappings from a generator model that intentionally over-proposes.

Your job has two separate axes — never mix them:
  CORRECTNESS: is the element genuinely obligated by this requirement?
  CONCISENESS: is the mapping defensible but unnecessary noise?

For EVERY proposed mapping give exactly one verdict:
  "required"    — the element MUST implement/evidence this requirement. Keep.
  "incorrect"   — the element is NOT obligated (wrong scope, transitive-only, different regime). Flag.
  "superfluous" — defensible association, but adds no audit value (over-matching / alarm fatigue). Flag.
  "uncertain"   — you genuinely cannot decide from the given facts. Escalate to a human.

Then perform the MISSED SWEEP: scan all candidates that were NOT proposed and list every element that IS obligated but missing ("missed"). This is the recall guard — be thorough here.

Decision rules (mirror of the human labeling rubric):
  - Structured facts are authoritative: "holds <category>" without "?" = the element demonstrably stores that personal-data category; "<category>?" = undocumented possibility → NOT sufficient for stage-1 duties (conservative).
  - Stage-1 duties (a capability the SYSTEM itself must have: erasure, access/export, encryption, access control) obligate every documented holder of the regulated data category. Pure hosting infrastructure is transitive → incorrect.
  - Stage-2 duties (an organisational ACT performed by some element: keep a register, notify an authority, capture consent) obligate ONLY the performing element. Data holders merely appear IN the register → incorrect for them. If NO candidate performs the act, NOTHING is required (see emptyJustified).
  - Processor duties (DPA / third-country transfer) obligate external processors (ops "vendor_processor"), and ONLY those matching the location condition for transfer duties (outside eu/adequacy).
  - "Propagate/downstream" wording targets the elements data is FORWARDED TO (external processors, replicated hosts), not the primary stores.
  - Cite evidence: every verdict's reason MUST reference the concrete requirement phrase AND the element fact that decides it. No citation → use "uncertain".

emptyJustified: set true when the requirement demands something NO candidate implements (a genuine gap in the architecture). In that case proposals are typically "incorrect" and missed stays empty. Do NOT invent a best-effort match for an unimplementable requirement — an honest empty result is the correct answer.

Output — JSON ONLY, exactly this schema:
{
  "verdicts": [ { "elementId": "<id from proposals>", "verdict": "required|incorrect|superfluous|uncertain", "reason": "<= 300 chars, cites requirement phrase + element fact>" } ],
  "missed":   [ { "elementId": "<id from candidates, NOT in proposals>", "reason": "<= 300 chars>" } ],
  "emptyJustified": <boolean>
}
Hard rules:
  - EVERY proposed elementId gets EXACTLY ONE verdict. No extras, no omissions.
  - "missed" may ONLY contain candidate ids that were NOT proposed. NEVER invent ids.
  - Reasons ALWAYS in English. NEVER output anything outside the JSON.
  - CRITICAL JSON SAFETY: inside "reason" strings use SINGLE quotes only — never double quotes (they break the JSON). No literal newlines inside strings. Keep each reason on one line.`;

export function buildJudgeUserPrompt(args: {
  requirementTitle: string;
  requirementText: string;
  source: string;
  paragraphNumber: string;
  candidates: JudgePromptCandidate[];
  proposals: JudgePromptProposal[];
}): string {
  const candidateBlock = args.candidates
    .map((el, i) => {
      const desc = el.description ? ` — ${el.description.slice(0, 280)}` : '';
      return `${i + 1}. id="${el.id}" type="${el.type}" name="${el.name}"${desc}`;
    })
    .join('\n');

  const proposalBlock =
    args.proposals.length === 0
      ? '(generator proposed NOTHING)'
      : args.proposals
          .map(
            (p, i) =>
              `${i + 1}. elementId="${p.elementId}" confidence=${p.confidence.toFixed(2)} reasoning="${p.reasoning.slice(0, 200)}"`
          )
          .join('\n');

  return `=== REQUIREMENT (architecture language) ===
Source: ${args.source.toUpperCase()} ${args.paragraphNumber}
Title: ${args.requirementTitle}
${args.requirementText}

=== CANDIDATE ELEMENTS (full list) ===
${candidateBlock}

=== PROPOSED MAPPINGS (from the generator — validate these) ===
${proposalBlock}

Return the JSON verdict object now.`;
}
