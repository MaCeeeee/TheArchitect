import type { AgentPersona } from '@thearchitect/shared/src/types/simulation.types';

/**
 * Structured representation of a scenario, extracted via regex+heuristic from
 * the free-text description. Used to seed agent prompts with explicit conflict
 * pairs before the simulation starts — without this, agents read narrative
 * conflicts as background context and miss the tension.
 *
 * Backward-compatible: when no patterns match, all fields are empty/undefined
 * and the engine falls back to the prior free-text-only prompt.
 */
export interface ParsedScenario {
  /** 1-line summary of the change being proposed (best-effort). */
  proposedChange: string;
  /** Stakeholders with explicit positions found in the text. */
  opposingPositions: Array<{
    stakeholder: string;
    position: string;
    rationale: string;
  }>;
  /** Decision criteria mentioned (e.g. "audit-trail evidence", "cost ≤ 4M"). */
  decisionCriteria: string[];
  /** First deadline-like phrase found ("90 days", "by Q1 2026"). */
  hardDeadline?: string;
}

// Stakeholder-position verbs to detect (English). Each verb conveys a
// different commitment level, useful for the agent to read the stance.
const POSITION_VERBS: Array<{ verb: string; position: string }> = [
  { verb: 'proposes', position: 'proposes' },
  { verb: 'proposed', position: 'proposes' },
  { verb: 'wants', position: 'proposes' },
  { verb: 'demands', position: 'demands' },
  { verb: 'demanded', position: 'demands' },
  { verb: 'insists', position: 'insists' },
  { verb: 'insisted', position: 'insists' },
  { verb: 'requires', position: 'requires' },
  { verb: 'required', position: 'requires' },
  { verb: 'estimates', position: 'estimates' },
  { verb: 'estimated', position: 'estimates' },
  { verb: 'flagged', position: 'flagged' },
  { verb: 'flags', position: 'flagged' },
  { verb: 'opposes', position: 'opposes' },
  { verb: 'opposed', position: 'opposes' },
  { verb: 'rejects', position: 'rejects' },
  { verb: 'rejected', position: 'rejects' },
  { verb: 'fears', position: 'concerned' },
  { verb: 'worries', position: 'concerned' },
  { verb: 'wants to', position: 'wants_to' },
];

// Deadline patterns to extract — order matters (longest first to avoid
// partial matches like matching "days" inside "90 days").
const DEADLINE_PATTERNS: RegExp[] = [
  /\b(?:within|in)\s+(\d+)\s+(days|weeks|months|years)\b/i,
  /\b(\d+)\s+(?:days|weeks|months|years)\s+(?:to\s+remediate|to\s+respond|deadline|window)\b/i,
  /\bby\s+(?:Q[1-4]\s+)?\d{4}\b/i,
  /\bby\s+(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{4}\b/i,
  /\b(?:end\s+of)\s+(?:Q[1-4]\s+)?\d{4}\b/i,
  /\b(\d+)-(?:day|week|month)\s+(?:deadline|window|timeframe)\b/i,
];

// Decision-criteria triggers — these flag substantive requirements that
// agents should treat as hard constraints, not soft preferences.
const CRITERIA_PATTERNS: Array<{ regex: RegExp; label: string }> = [
  { regex: /audit[\s-]trail\s+evidence/i, label: 'complete audit-trail evidence' },
  { regex: /due[\s-]diligence\s+assessment/i, label: 'due-diligence assessment' },
  { regex: /human\s+rights\s+expertise/i, label: 'human rights expertise' },
  { regex: /audit[a-z]*\s+(?:reporting|compliance)/i, label: 'auditable reporting' },
  { regex: /regulatory\s+(?:requirements|compliance)/i, label: 'regulatory compliance' },
  { regex: /financial\s+penalties/i, label: 'financial penalty risk' },
  { regex: /no(?:t|n)[\s-]?disrup[a-z]+\s+(?:to\s+)?(?:manufacturing|operations|production)/i, label: 'zero operational disruption' },
  { regex: /single\s+source\s+of\s+truth/i, label: 'single source of truth' },
  { regex: /multi[\s-]tenant/i, label: 'multi-tenant capability' },
  { regex: /cloud[\s-]native/i, label: 'cloud-native architecture' },
];

/**
 * Splits scenario text into sentence-like segments.
 * Handles em-dashes and semi-colons in addition to periods, since BSH-style
 * scenarios use those heavily ("CFO proposes outsourcing; HR insists in-house").
 */
function splitSentences(text: string): string[] {
  return text
    .replace(/\s+/g, ' ')
    .split(/(?<=[.!?])\s+|\s*[;—]\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

/**
 * Tries to identify a stakeholder name at the start of a sentence-like segment.
 * Heuristic: capitalized phrase before the position verb. Returns the matched
 * stakeholder string + position verb, or null if no match.
 */
function extractStakeholderPosition(
  sentence: string,
): { stakeholder: string; position: string; rationale: string } | null {
  const lower = sentence.toLowerCase();
  for (const { verb, position } of POSITION_VERBS) {
    const idx = lower.indexOf(` ${verb} `);
    if (idx === -1) continue;

    const before = sentence.slice(0, idx).trim();
    const after = sentence.slice(idx + verb.length + 2).trim();

    // Stakeholder must look like a name/title: 2-80 chars, starts with capital,
    // contains at least one capital letter (filter out generic "the company").
    if (before.length < 2 || before.length > 80) continue;
    if (!/^[A-Z]/.test(before)) continue;
    if (!/[A-Z]/.test(before.slice(1))) {
      // single-capital-word check — allow "CFO", "CSO", short titles.
      if (before.length > 6 && !/[A-Z]{2,}/.test(before)) continue;
    }

    return {
      stakeholder: before,
      position,
      rationale: after.replace(/^(that|to)\s+/i, '').slice(0, 200),
    };
  }
  return null;
}

/**
 * Extracts the first deadline-like phrase. Returns the matched substring
 * (trimmed and lower-cased for consistent prompt rendering).
 */
function extractDeadline(text: string): string | undefined {
  for (const pattern of DEADLINE_PATTERNS) {
    const m = text.match(pattern);
    if (m) return m[0].trim();
  }
  return undefined;
}

/**
 * Extracts decision-criteria phrases via curated patterns. Returns deduped
 * label strings.
 */
function extractCriteria(text: string): string[] {
  const found = new Set<string>();
  for (const { regex, label } of CRITERIA_PATTERNS) {
    if (regex.test(text)) found.add(label);
  }
  return Array.from(found);
}

/**
 * Builds a 1-line "proposed change" summary. Heuristic: first sentence of
 * the scenario, capped at 200 chars. If the first sentence is too short
 * (< 30 chars), concatenate the second.
 */
function summarizeProposedChange(sentences: string[]): string {
  if (sentences.length === 0) return '';
  let summary = sentences[0];
  if (summary.length < 30 && sentences.length > 1) {
    summary = `${summary} ${sentences[1]}`;
  }
  return summary.slice(0, 200);
}

/**
 * Parses a free-text scenario into structured conflict-pair format.
 *
 * @param scenarioDescription Free text from the user.
 * @param _agents Optional agent list — currently unused, but reserved for
 *   future stakeholder-name resolution (e.g., match "CFO" to a specific
 *   persona by ID).
 */
export function parseScenarioConflicts(
  scenarioDescription: string,
  _agents: AgentPersona[],
): ParsedScenario {
  const text = (scenarioDescription || '').trim();
  if (!text) {
    return { proposedChange: '', opposingPositions: [], decisionCriteria: [] };
  }

  const sentences = splitSentences(text);
  const opposingPositions: ParsedScenario['opposingPositions'] = [];

  for (const sentence of sentences) {
    const found = extractStakeholderPosition(sentence);
    if (found) opposingPositions.push(found);
    if (opposingPositions.length >= 8) break; // safety cap
  }

  return {
    proposedChange: summarizeProposedChange(sentences),
    opposingPositions,
    decisionCriteria: extractCriteria(text),
    hardDeadline: extractDeadline(text),
  };
}

/**
 * Heuristic match of a persona to an opposingPositions entry.
 *
 * Scenario text uses short labels ("CFO", "HR", "Deloitte") while personas
 * carry full titles ("Chief Financial Officer (Program Sponsor & ESG…)").
 * We compare on individual whole words >= 3 chars (lowercase) so that
 * "CFO" matches "...Chief Financial Officer..." via the explicit "CFO"
 * acronym OR via the descriptive words.
 *
 * Returns true when at least one significant token from the scenario
 * stakeholder name appears as a whole word in the persona name (or vice
 * versa for short acronyms). False positives are possible but acceptable
 * because the worst case is "Your scenario role" stays empty.
 */
function personaMatchesStakeholder(personaName: string, stakeholderName: string): boolean {
  const personaLower = personaName.toLowerCase();
  const stakeholderLower = stakeholderName.toLowerCase();

  // Direct substring (cheap path): "CFO" inside the persona's full title.
  if (personaLower.includes(stakeholderLower) || stakeholderLower.includes(personaLower)) {
    return true;
  }

  // Token-level: look for shared significant words. Stop-words filter the
  // generic noise ("the", "of", "and", role suffixes that appear everywhere).
  const STOP = new Set([
    'the', 'of', 'and', 'for', 'a', 'an', 'to', 'in', 'on', 'with',
    'group', 'chief', 'officer', 'director', 'lead', 'manager',
    'authority', 'representative', 'partner', 'partners',
  ]);
  const tokenize = (s: string) =>
    s.split(/[\s()/,&\-—]+/).map((t) => t.trim()).filter((t) => t.length >= 3 && !STOP.has(t));
  const personaTokens = new Set(tokenize(personaLower));
  const stakeholderTokens = tokenize(stakeholderLower);
  for (const t of stakeholderTokens) {
    if (personaTokens.has(t)) return true;
  }
  return false;
}

/**
 * Renders a ParsedScenario as a markdown section ready to inject into the
 * agent system prompt. Returns empty string when nothing structured was
 * extracted, so the caller can omit the section entirely.
 *
 * When a personaName is provided, the renderer splits opposingPositions into
 * "Your scenario role" (the position matching this persona) and "Other
 * stakeholders" (the rest). Without this split, agents read their own
 * scenario position as "an opposing position" and flip away from their
 * stated role — e.g. CFO (who proposes outsourcing in the scenario) starts
 * REJECTING outsourcing because it sees "CFO proposes outsourcing" in the
 * "you MUST reconcile these" list.
 */
export function renderParsedScenario(parsed: ParsedScenario, personaName?: string): string {
  const hasContent =
    parsed.opposingPositions.length > 0 ||
    parsed.decisionCriteria.length > 0 ||
    Boolean(parsed.hardDeadline);
  if (!hasContent) return '';

  const lines: string[] = ['## Scenario (parsed)'];
  if (parsed.proposedChange) {
    lines.push(`Proposed change: ${parsed.proposedChange}`);
  }
  if (parsed.hardDeadline) {
    lines.push(`Hard deadline: ${parsed.hardDeadline}`);
  }
  if (parsed.decisionCriteria.length > 0) {
    lines.push(`Decision criteria (treat as hard constraints): ${parsed.decisionCriteria.join('; ')}`);
  }

  if (parsed.opposingPositions.length > 0) {
    // Split into self vs. others when the persona is known.
    const yours = personaName
      ? parsed.opposingPositions.filter((p) => personaMatchesStakeholder(personaName, p.stakeholder))
      : [];
    const others = personaName
      ? parsed.opposingPositions.filter((p) => !personaMatchesStakeholder(personaName, p.stakeholder))
      : parsed.opposingPositions;

    if (yours.length > 0) {
      lines.push('Your scenario role (DEFEND this position in negotiation, but verify it does not violate hard principles):');
      for (const p of yours) {
        const rationale = p.rationale ? ` — ${p.rationale}` : '';
        lines.push(`  - You (${p.position})${rationale}`);
      }
    }
    if (others.length > 0) {
      const header = yours.length > 0
        ? 'Other stakeholders\' positions (reconcile or oppose):'
        : 'Stakeholder positions in this scenario (reconcile or oppose):';
      lines.push(header);
      for (const p of others) {
        const rationale = p.rationale ? ` — ${p.rationale}` : '';
        lines.push(`  - ${p.stakeholder} (${p.position})${rationale}`);
      }
    }
  }
  return lines.join('\n');
}
