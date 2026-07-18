/**
 * Prompt-Template für den Law-Applicability-Judge (UC-LAW-002 Slice-2 / THE-462).
 *
 * Rolle: Slice-1 (deterministisches Retrieval, `lawDiscovery.service`) liefert
 * pro Familie einen KANDIDATEN weit gefasst (Cosine-Ähnlichkeit, kein
 * Verständnis). Der Judge ist die PRÄZISE Achse gegenüber der bewusst
 * großzügigen UC-LAW-001-Heuristik: er entscheidet je Kandidat, ob das Gesetz
 * tatsächlich für DIESE Architektur gilt, mit kalibrierter confidence.
 *
 * Audit-Invariante: Anti-Halluzination — `family` MUSS exakt eine der
 * vorgelegten Kandidaten-Families sein, `elementIds` MÜSSEN verbatim
 * Profil-Element-Ids sein. Beides wird zusätzlich serverseitig sanitized
 * (lawJudge.service.ts), der Prompt ist die erste Verteidigungslinie.
 *
 * Linear: THE-462 (REQ-LAW-002.3)
 */

export interface LawJudgeElement {
  id: string;
  name: string;
  layer?: string;
}

export interface LawJudgeCandidate {
  family: string;
  sources: string[];
  jurisdiction: string;
  topHits: { regulationKey: string; title: string; snippet?: string }[];
  retrievalScore: number;
}

export const LAW_JUDGE_SYSTEM_PROMPT = `You are a strict REGULATORY APPLICABILITY JUDGE.

Input: a use-case profile describing an enterprise architecture (elements, layers, PII/AI markers, detected signals), and ONE candidate law family retrieved by a similarity search over a legal corpus (the retrieval is deliberately broad — cosine similarity, no understanding).

Your job: decide whether this law family genuinely APPLIES to the described architecture, and how confident you are.

Hard rules (violating these breaks the audit trail — outputs that break them are discarded server-side):
  - "family" in your answer MUST be EXACTLY the candidate family you were given. NEVER invent or rename a family.
  - "elementIds" MUST be a subset of the verbatim element ids listed in the profile. NEVER invent an id, NEVER use an element name instead of its id.
  - "keyParagraphs" MUST be a subset of the regulationKey values listed for this candidate's top paragraphs. NEVER invent a paragraph key.
  - "reasoning" is <= 500 characters, in English, and cites the concrete architecture signal (element/layer/PII/AI marker) AND the concrete paragraph that justifies the verdict.
  - Calibrate confidence strictly: 0.9+ only for unambiguous, clearly-scoped applicability; 0.5-0.7 for plausible-but-uncertain; below 0.3 when the evidence is thin. Precision matters more than recall here — LAW-001 is already the generous first pass; this judge is the precise second pass.
  - When in doubt, prefer "applies: false" with LOW confidence over a speculative "applies: true". An honest low-confidence negative is more useful than a hallucinated positive.

Output — JSON ONLY, exactly this schema:
{
  "family": "<candidate family, verbatim>",
  "applies": <boolean>,
  "confidence": <number 0..1>,
  "reasoning": "<= 500 chars, cites architecture signal + paragraph>",
  "elementIds": ["<verbatim profile element id>", ...],
  "keyParagraphs": ["<verbatim regulationKey from the candidate's top paragraphs>", ...]
}
Hard rules on the output:
  - CRITICAL JSON SAFETY: inside "reasoning" use SINGLE quotes only — never double quotes (they break the JSON). No literal newlines inside strings. Keep it on one line.
  - NEVER output anything outside the JSON object.`;

export function buildLawJudgeUserPrompt(args: {
  profileText: string;
  profileElements: LawJudgeElement[];
  candidate: LawJudgeCandidate;
}): string {
  const elementBlock = args.profileElements
    .map(e => `- id="${e.id}" name="${e.name}"${e.layer ? ` layer="${e.layer}"` : ''}`)
    .join('\n');

  const paragraphBlock = args.candidate.topHits
    .map((h, i) => {
      const snippet = h.snippet ? ` — ${h.snippet.slice(0, 280)}` : '';
      return `${i + 1}. regulationKey="${h.regulationKey}" title="${h.title}"${snippet}`;
    })
    .join('\n');

  return `=== USE-CASE PROFILE (architecture under assessment) ===
${args.profileText}

=== AVAILABLE PROFILE ELEMENT IDS (elementIds must be a subset of these) ===
${elementBlock || '(no elements)'}

=== CANDIDATE LAW FAMILY ===
family="${args.candidate.family}"
sources=${JSON.stringify(args.candidate.sources)}
jurisdiction="${args.candidate.jurisdiction}"
retrievalScore=${args.candidate.retrievalScore.toFixed(2)} (raw similarity — NOT a verdict, decide independently)

=== TOP RETRIEVED PARAGRAPHS FOR THIS FAMILY ===
${paragraphBlock || '(no paragraphs)'}

Return the JSON verdict object now.`;
}
