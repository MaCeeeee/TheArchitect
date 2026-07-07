/**
 * Requirement-Layer Golden-Set — die Zwischenschicht (ISO/IEC/IEEE 29148:
 * Stakeholder- → System-Requirements). Statt (Regulation → Element) direkt zu
 * labeln (Juristensprache → Architektur, Doppelsprung, Kappa 0,34), wird der
 * Legal→Architektur-Sprung EINMAL im Requirement gemacht; gelabelt wird nur
 * noch (Requirement → Element), also Architektur → Architektur.
 *
 * Zwei Eval-Stufen:
 *   A — Extraktion:  Regulation → Requirements (fasst es die Pflicht korrekt?)
 *   B — Mapping:     Requirement → Elemente (labelbar mit hohem Kappa)
 *
 * Die Facts-Prädikate (PREDICATES_V1) sind die deterministische Version von
 * Stufe B — jedes Requirement referenziert optional ein Prädikat als dritte,
 * reproduzierbare Labeling-Stimme.
 *
 * Linear: THE-378 (UC-EVAL-001) · REQ-EVAL-001.12
 */
import fs from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import { PREDICATES_V1, parseFactsFromMetadata, type ComplianceFactsV1 } from '../compliance/factsV1';

const PRIORITY = ['must', 'should', 'may'] as const;

const RequirementCandidateSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  type: z.string().min(1),
  layer: z.string().optional(),
  description: z.string().optional(),
  /** Optionales serialisiertes Compliance-Facts-Profil (für Prädikat-Auswertung). */
  facts: z.record(z.unknown()).optional(),
});

export const RequirementGoldenCaseSchema = z
  .object({
    reqId: z.string().min(1),
    source: z.string().min(1),
    paragraphNumber: z.string().min(1),
    /** Requirement-Titel in Architektursprache (imperativ), wie reqgen ihn liefert. */
    title: z.string().min(5),
    description: z.string().min(5),
    priority: z.enum(PRIORITY),
    /** Optionaler Prädikat-Schlüssel (PREDICATES_V1) — deterministische dritte Stimme. */
    predicate: z.string().optional(),
    goldElementIds: z.array(z.string()),
    ambiguous: z.boolean().optional(),
    notes: z.string().optional(),
    annotator: z.string().optional(),
    labeledAt: z.string().optional(),
  })
  .superRefine((c, ctx) => {
    if (c.predicate && !PREDICATES_V1[c.predicate]) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: `unknown predicate "${c.predicate}" in ${c.reqId}` });
    }
  });

export const RequirementGoldenSetSchema = z.object({
  version: z.string().min(1),
  frozen: z.boolean(),
  rubricRef: z.string().default('../RUBRIC.md'),
  candidates: z.array(RequirementCandidateSchema).min(1),
  requirements: z.array(RequirementGoldenCaseSchema).min(1),
});

export type RequirementCandidate = z.infer<typeof RequirementCandidateSchema>;
export type RequirementGoldenCase = z.infer<typeof RequirementGoldenCaseSchema>;
export type RequirementGoldenSet = z.infer<typeof RequirementGoldenSetSchema>;

export const DEFAULT_REQUIREMENTS_PATH = path.join(__dirname, 'golden', 'requirements.self.v1.json');

export class RequirementGoldenError extends Error {
  constructor(message: string, public readonly cause?: unknown) {
    super(message);
    this.name = 'RequirementGoldenError';
  }
}

export function loadRequirementGolden(filePath: string = DEFAULT_REQUIREMENTS_PATH): RequirementGoldenSet {
  let raw: string;
  try {
    raw = fs.readFileSync(filePath, 'utf8');
  } catch (err) {
    throw new RequirementGoldenError(`Cannot read requirement golden at ${filePath}`, err);
  }
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch (err) {
    throw new RequirementGoldenError(`Requirement golden is not valid JSON: ${filePath}`, err);
  }
  const parsed = RequirementGoldenSetSchema.safeParse(json);
  if (!parsed.success) {
    throw new RequirementGoldenError(
      `Requirement golden failed validation: ${parsed.error.issues
        .map(i => `${i.path.join('.')}: ${i.message}`)
        .join('; ')}`
    );
  }
  // reqId-Duplikate + gold-Integrität
  const candidateIds = new Set(parsed.data.candidates.map(c => c.id));
  const seen = new Set<string>();
  for (const r of parsed.data.requirements) {
    if (seen.has(r.reqId)) throw new RequirementGoldenError(`Duplicate reqId: ${r.reqId}`);
    seen.add(r.reqId);
    for (const g of r.goldElementIds) {
      if (!candidateIds.has(g)) {
        throw new RequirementGoldenError(`goldElementId "${g}" not in candidates (req ${r.reqId})`);
      }
    }
  }
  return parsed.data;
}

/**
 * Deterministische Prädikat-Stimme: welche Kandidaten SOLLTE ein Requirement
 * laut seinem Facts-Prädikat treffen. Nur für Requirements mit `predicate` und
 * nur über Kandidaten mit gültigem Facts-Profil. Reine Funktion.
 */
export function predictedElementIds(
  req: RequirementGoldenCase,
  candidates: RequirementCandidate[]
): string[] | null {
  if (!req.predicate) return null;
  const fn = PREDICATES_V1[req.predicate];
  if (!fn) return null;
  const out: string[] = [];
  for (const c of candidates) {
    const facts = (c.facts as ComplianceFactsV1 | undefined) ?? parseFactsFromMetadata({ compliance: c.facts });
    if (facts && fn(facts).match) out.push(c.id);
  }
  return out;
}
