/**
 * UC-EVAL-001 / THE-401 S2 — Kaskaden-Judge: validiert Generator-Mappings.
 *
 * Muster wie complianceMapping.service: pure Funktion, injizierbarer Anthropic-
 * Client (testbar ohne Netz), Zod-validierte LLM-Antwort, Sanitizing gegen
 * halluzinierte Element-IDs, best-effort AiTrace.
 *
 * Audit-Invariante: Der Judge FLAGGT (verdicts/missed), er löscht nie.
 * applyJudgeVerdicts() ist die EINE Stelle, an der aus Flags eine gefilterte
 * Sicht wird — Aufrufer entscheidet, ob er sie nutzt (Eval) oder nur anzeigt
 * (Human-Queue, S4).
 *
 * Empirischer Auftrag (EVAL_BASELINE.md Cap-Sweep): Generator @Cap 15 liefert
 * Recall 84 % / Precision 37 % — der Judge soll die ~60 % FP schneiden, ohne
 * die TPs zu reißen, und auf Gap-Requirements den Mut zur leeren Menge haben.
 *
 * Linear: THE-401 (REQ-EVAL-001.10) · THE-382 (REQ-EVAL-001.4)
 */
import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import { computeVersionHash } from '../utils/regulationVersion';
import { recordAiTrace } from './aiTrace.service';
import {
  JUDGE_SYSTEM_PROMPT,
  buildJudgeUserPrompt,
  type JudgePromptCandidate,
  type JudgePromptProposal,
} from '../prompts/complianceJudge.prompt';

export const JUDGE_PROMPT_VERSION_HASH = computeVersionHash(JUDGE_SYSTEM_PROMPT);

const DEFAULT_JUDGE_MODEL = process.env.COMPLIANCE_JUDGE_MODEL || 'claude-sonnet-5';
const MAX_TOKENS = 8192; // 4096 trunkierte lange Verdikt-Listen (→ "no JSON object")

// ─── Schema ─────────────────────────────────────────────────────

export const JUDGE_VERDICTS = ['required', 'incorrect', 'superfluous', 'uncertain'] as const;
export type JudgeVerdict = (typeof JUDGE_VERDICTS)[number];

const JudgeResponseSchema = z.object({
  verdicts: z.array(
    z.object({
      elementId: z.string().min(1),
      verdict: z.enum(JUDGE_VERDICTS),
      reason: z.string().max(400),
    })
  ),
  missed: z
    .array(z.object({ elementId: z.string().min(1), reason: z.string().max(400) }))
    .default([]),
  emptyJustified: z.boolean().default(false),
});

export type JudgeResponse = z.infer<typeof JudgeResponseSchema>;

/**
 * Tool-Schema erzwingt valides JSON: statt Freitext-JSON zu parsen (33 % Fehlrate
 * bei langen Begründungen mit Quotes/Newlines) gibt das Modell ein tool_use-Objekt
 * zurück, das die API garantiert schema-konform serialisiert.
 */
const JUDGE_TOOL: Anthropic.Tool = {
  name: 'submit_verdicts',
  description: 'Submit the compliance-mapping verdicts, missed-sweep results and the empty-justified flag.',
  input_schema: {
    type: 'object',
    properties: {
      verdicts: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            elementId: { type: 'string' },
            verdict: { type: 'string', enum: [...JUDGE_VERDICTS] },
            reason: { type: 'string' },
          },
          required: ['elementId', 'verdict', 'reason'],
        },
      },
      missed: {
        type: 'array',
        items: {
          type: 'object',
          properties: { elementId: { type: 'string' }, reason: { type: 'string' } },
          required: ['elementId', 'reason'],
        },
      },
      emptyJustified: { type: 'boolean' },
    },
    required: ['verdicts', 'missed', 'emptyJustified'],
  },
};

export interface JudgeResult extends JudgeResponse {
  meta: {
    model: string;
    latencyMs: number;
    inputTokens?: number;
    outputTokens?: number;
  };
}

export class ComplianceJudgeError extends Error {
  constructor(message: string, public readonly cause?: unknown) {
    super(message);
    this.name = 'ComplianceJudgeError';
  }
}

// ─── Reine Helfer (testbar) ─────────────────────────────────────

/**
 * JSON aus der LLM-Antwort ziehen (tolerant gegen ```json-Fences). Glättet
 * zusätzlich literale Steuerzeichen (Zeilenumbrüche/Tabs), die in string-Werten
 * strenges JSON.parse brechen — häufigster Judge-Fehlerfall neben unescapten
 * Quotes (die fängt der Prompt + Retry ab).
 */
export function extractJudgeJson(rawText: string): unknown {
  const fenced = rawText.match(/```(?:json)?\s*([\s\S]*?)```/);
  const body = fenced ? fenced[1] : rawText;
  const start = body.indexOf('{');
  const end = body.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) {
    throw new ComplianceJudgeError('judge returned no JSON object');
  }
  const slice = body.slice(start, end + 1);
  try {
    return JSON.parse(slice);
  } catch {
    // literale CR/LF/Tab in String-Werten → Leerzeichen (best effort)
    return JSON.parse(slice.replace(/[\n\r\t]+/g, ' '));
  }
}

/**
 * Sanitizing gegen Halluzination/Auslassung:
 * - verdicts nur für tatsächlich vorgeschlagene IDs; fehlende Proposals werden
 *   als "uncertain" ergänzt (Auslassung darf nie still zu "gelöscht" werden!)
 * - missed nur für Kandidaten, die NICHT vorgeschlagen waren
 * - Duplikate: erstes Verdikt gewinnt
 */
export function sanitizeJudgeResponse(
  parsed: JudgeResponse,
  proposalIds: string[],
  candidateIds: string[]
): JudgeResponse {
  const proposalSet = new Set(proposalIds);
  const candidateSet = new Set(candidateIds);

  const seen = new Set<string>();
  const verdicts = parsed.verdicts.filter(v => {
    if (!proposalSet.has(v.elementId) || seen.has(v.elementId)) return false;
    seen.add(v.elementId);
    return true;
  });
  for (const id of proposalIds) {
    if (!seen.has(id)) {
      verdicts.push({
        elementId: id,
        verdict: 'uncertain',
        reason: 'judge omitted a verdict for this proposal — defaulted to uncertain (audit invariant)',
      });
    }
  }

  const missedSeen = new Set<string>();
  const missed = parsed.missed.filter(m => {
    if (!candidateSet.has(m.elementId) || proposalSet.has(m.elementId) || missedSeen.has(m.elementId)) {
      return false;
    }
    missedSeen.add(m.elementId);
    return true;
  });

  return { verdicts, missed, emptyJustified: parsed.emptyJustified };
}

export interface JudgePolicy {
  /**
   * `superfluous` = Conciseness-Achse ("vertretbar, aber unnötig"). Default
   * `false`: raus (maximale Präzision/Sparsamkeit). `true`: behalten — denn ein
   * fälschlich als superfluous geflaggtes Gold-Element ist ein TP-Verlust; die
   * Anti-Goodhart-Regel verlangt Recall-Nicht-Unterlegenheit, bevor ein
   * Conciseness-Schnitt zählt.
   */
  keepSuperfluous?: boolean;
}

/**
 * Die EINE Filter-Stelle: gefilterte Element-Menge nach Judge-Sicht.
 * Policy: required + uncertain bleiben immer (uncertain → Human-Queue, nicht
 * auto-killen); incorrect fällt raus; superfluous je nach Policy; missed kommt
 * dazu. Reine Funktion.
 */
export function applyJudgeVerdicts(
  proposalIds: string[],
  judge: JudgeResponse,
  policy: JudgePolicy = {}
): { kept: string[]; added: string[]; removed: string[] } {
  const byId = new Map(judge.verdicts.map(v => [v.elementId, v.verdict]));
  const kept: string[] = [];
  const removed: string[] = [];
  for (const id of proposalIds) {
    const verdict = byId.get(id) ?? 'uncertain';
    const keep =
      verdict === 'required' ||
      verdict === 'uncertain' ||
      (verdict === 'superfluous' && policy.keepSuperfluous === true);
    if (keep) kept.push(id);
    else removed.push(id);
  }
  const added = judge.missed.map(m => m.elementId);
  return { kept, added, removed };
}

// ─── LLM-Call ───────────────────────────────────────────────────

export async function judgeMappings(args: {
  requirementTitle: string;
  requirementText: string;
  source: string;
  paragraphNumber: string;
  candidates: JudgePromptCandidate[];
  proposals: JudgePromptProposal[];
  model?: string;
  anthropicClient?: Anthropic;
}): Promise<JudgeResult> {
  const model = args.model || DEFAULT_JUDGE_MODEL;
  const client =
    args.anthropicClient ??
    (() => {
      const apiKey = process.env.ANTHROPIC_API_KEY;
      if (!apiKey) throw new ComplianceJudgeError('ANTHROPIC_API_KEY is not configured');
      return new Anthropic({ apiKey });
    })();

  const userMessage = buildJudgeUserPrompt(args);
  const startedAt = Date.now();

  // Retry: auch mit erzwungenem Tool-Use kann das input-Objekt selten schema-
  // fremde Werte tragen (z. B. verdict außerhalb des Enums) — zweiter Anlauf
  // meist sauber. Netzwerkfehler werden NICHT wiederholt (throw).
  const MAX_ATTEMPTS = 2;
  let rawText = '';
  let response: Awaited<ReturnType<typeof client.messages.create>> | undefined;
  let parsed: ReturnType<typeof JudgeResponseSchema.safeParse> | undefined;
  let lastErr = '';
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      response = await client.messages.create({
        model,
        system: JUDGE_SYSTEM_PROMPT,
        messages: [{ role: 'user', content: userMessage }],
        max_tokens: MAX_TOKENS,
        tools: [JUDGE_TOOL],
        tool_choice: { type: 'tool', name: JUDGE_TOOL.name },
      });
    } catch (err) {
      throw new ComplianceJudgeError(`Anthropic judge request failed: ${(err as Error).message}`, err);
    }
    const toolBlock = response.content.find(b => b.type === 'tool_use');
    if (toolBlock && toolBlock.type === 'tool_use') {
      rawText = JSON.stringify(toolBlock.input);
      const candidate = JudgeResponseSchema.safeParse(toolBlock.input);
      if (candidate.success) {
        parsed = candidate;
        break;
      }
      lastErr = candidate.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join('; ');
    } else {
      // Fallback: manche Modelle antworten trotz tool_choice mit Text-JSON.
      const textBlock = response.content.find(b => b.type === 'text');
      rawText = textBlock && textBlock.type === 'text' ? textBlock.text : '';
      try {
        const candidate = JudgeResponseSchema.safeParse(extractJudgeJson(rawText));
        if (candidate.success) {
          parsed = candidate;
          break;
        }
        lastErr = candidate.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join('; ');
      } catch (err) {
        lastErr = err instanceof Error ? err.message : String(err);
      }
    }
  }
  const latencyMs = Date.now() - startedAt;

  if (!parsed || !parsed.success) {
    throw new ComplianceJudgeError(`judge output invalid after ${MAX_ATTEMPTS} attempts: ${lastErr}`);
  }

  const sanitized = sanitizeJudgeResponse(
    parsed.data,
    args.proposals.map(p => p.elementId),
    args.candidates.map(c => c.id)
  );

  const usage = (response as { usage?: { input_tokens?: number; output_tokens?: number } }).usage;

  // Observability (THE-384) — best-effort, blockiert nie.
  await recordAiTrace({
    operation: 'judge',
    model,
    promptVersionHash: JUDGE_PROMPT_VERSION_HASH,
    regulationKey: `${args.source}:${args.paragraphNumber}`,
    candidateElementIds: args.candidates.map(c => c.id),
    predictions: sanitized.verdicts.map(v => ({
      elementId: v.elementId,
      elementType: 'custom',
      confidence: v.verdict === 'required' ? 1 : v.verdict === 'uncertain' ? 0.5 : 0,
    })),
    rawResponse: rawText,
    latencyMs,
    inputTokens: usage?.input_tokens,
    outputTokens: usage?.output_tokens,
  });

  return {
    ...sanitized,
    meta: { model, latencyMs, inputTokens: usage?.input_tokens, outputTokens: usage?.output_tokens },
  };
}
