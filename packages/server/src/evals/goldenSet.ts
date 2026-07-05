/**
 * Golden-Set Schema + Loader — Ground Truth für die Mapping-Eval.
 *
 * Ein Golden-Case = ein Regulierungs-Paragraph + Kandidaten-Elemente +
 * menschlich gelabelte `goldElementIds` (leer = Hard Negative).
 * Labeling-Regeln: siehe RUBRIC.md. Ein Set mit `frozen: false` darf für
 * Entwicklung genutzt werden, ist aber KEINE Baseline-Grundlage (THE-381).
 *
 * Linear: THE-379 (REQ-EVAL-001.1)
 */
import fs from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import type { CandidateElement } from '../services/complianceMapping.service';
import { normalizeElementType } from '../services/complianceElements.service';

// Wertebereiche gespiegelt aus Regulation.ts / compliance.types.ts —
// bewusst als Strings validiert, damit das Golden-Set auch Quellen labeln
// kann, bevor sie im Produkt-Enum landen (z. B. 'eu_ai_act').
const GoldenCandidateSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  type: z.string().min(1),
  layer: z.string().optional(),
  description: z.string().optional(),
});

export const GoldenCaseSchema = z
  .object({
    caseId: z.string().min(1),
    source: z.string().min(1), // 'dsgvo' | 'nis2' | 'lksg' | ...
    paragraphNumber: z.string().min(1),
    title: z.string().optional(),
    fullText: z.string().min(50),
    language: z.enum(['de', 'en']),
    jurisdiction: z.string().min(1),
    candidates: z.array(GoldenCandidateSchema).min(1),
    goldElementIds: z.array(z.string()),
    ambiguous: z.boolean().optional(),
    notes: z.string().optional(),
    annotator: z.string().optional(),
    labeledAt: z.string().optional(),
  })
  .superRefine((c, ctx) => {
    const candidateIds = new Set(c.candidates.map(el => el.id));
    for (const goldId of c.goldElementIds) {
      if (!candidateIds.has(goldId)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `goldElementId "${goldId}" is not in the candidate list of case "${c.caseId}"`,
        });
      }
    }
  });

export const GoldenSetSchema = z.object({
  version: z.string().min(1), // e.g. 'v1'
  frozen: z.boolean(), // true erst nach Kappa >= 0.6 + Adjudikation (RUBRIC.md §7)
  rubricRef: z.string().default('RUBRIC.md'),
  cases: z.array(GoldenCaseSchema).min(1),
});

export type GoldenCase = z.infer<typeof GoldenCaseSchema>;
export type GoldenSet = z.infer<typeof GoldenSetSchema>;

export const DEFAULT_GOLDEN_PATH = path.join(__dirname, 'golden', 'mapping.v2.json');

export class GoldenSetError extends Error {
  constructor(message: string, public readonly cause?: unknown) {
    super(message);
    this.name = 'GoldenSetError';
  }
}

/** Load + Zod-validate a golden set file. Throws GoldenSetError with context. */
export function loadGoldenSet(filePath: string = DEFAULT_GOLDEN_PATH): GoldenSet {
  let raw: string;
  try {
    raw = fs.readFileSync(filePath, 'utf8');
  } catch (err) {
    throw new GoldenSetError(`Cannot read golden set at ${filePath}`, err);
  }

  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch (err) {
    throw new GoldenSetError(`Golden set is not valid JSON: ${filePath}`, err);
  }

  const parsed = GoldenSetSchema.safeParse(json);
  if (!parsed.success) {
    throw new GoldenSetError(
      `Golden set failed schema validation: ${parsed.error.issues
        .map(i => `${i.path.join('.')}: ${i.message}`)
        .join('; ')}`
    );
  }

  const dupes = findDuplicateCaseIds(parsed.data.cases);
  if (dupes.length > 0) {
    throw new GoldenSetError(`Duplicate caseIds in golden set: ${dupes.join(', ')}`);
  }

  return parsed.data;
}

export function findDuplicateCaseIds(cases: GoldenCase[]): string[] {
  const seen = new Set<string>();
  const dupes = new Set<string>();
  for (const c of cases) {
    if (seen.has(c.caseId)) dupes.add(c.caseId);
    seen.add(c.caseId);
  }
  return [...dupes];
}

/** Stratification stats — für den Report + RUBRIC.md §6 Soll/Ist-Abgleich. */
export function goldenSetStats(set: GoldenSet): {
  total: number;
  bySource: Record<string, number>;
  hardNegatives: number;
  hardNegativeShare: number;
  ambiguous: number;
} {
  const bySource: Record<string, number> = {};
  let hardNegatives = 0;
  let ambiguous = 0;
  for (const c of set.cases) {
    bySource[c.source] = (bySource[c.source] ?? 0) + 1;
    if (c.goldElementIds.length === 0) hardNegatives++;
    if (c.ambiguous) ambiguous++;
  }
  return {
    total: set.cases.length,
    bySource,
    hardNegatives,
    hardNegativeShare: set.cases.length > 0 ? hardNegatives / set.cases.length : 0,
    ambiguous,
  };
}

/** Map golden candidates onto the service's CandidateElement shape. */
export function toCandidateElements(c: GoldenCase): CandidateElement[] {
  return c.candidates.map(el => ({
    id: el.id,
    name: el.name,
    // Golden-Set speichert freie ArchiMate-Typen (z. B. system_software); der
    // Mapping-Service kennt nur ein engeres Enum und validiert den vom LLM
    // zurückgegebenen elementType dagegen. Wir normalisieren daher GENAU wie der
    // Produktions-Loader (loadProjectCandidateElements) — sonst scheitert der
    // Eval-Lauf an Typen, die es im Produktpfad nie gäbe.
    type: normalizeElementType(el.type),
    layer: el.layer,
    description: el.description,
  }));
}
