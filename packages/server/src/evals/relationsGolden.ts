/**
 * Relations-Golden-Set — Ground Truth für die Cross-Norm-Relations-Eval (THE-421,
 * REQ-ONTO-001.6). Anders als das Typing-Golden (typingGolden.ts: eine Norm-
 * Provision + Typ-Achsen) klassifiziert dieses Golden ein PAAR von Paragraphen
 * aus ZWEI verschiedenen Gesetzen + die Cross-Norm-Relation dazwischen — das
 * Rückgrat der späteren Requirement-Harmonisierung: zwei Pflichten lassen sich
 * nicht verschmelzen, ohne zu wissen, wie die Normen zueinander stehen (z. B.
 * "DORA verdrängt NIS2 für Finanzunternehmen" = lex specialis, "ePrivacy
 * konkretisiert die DSGVO").
 *
 * Zwei Design-Entscheidungen (siehe Task-Spec THE-421 #11 für die Begründung):
 *
 * (1) Paar-Reihenfolge ist deterministisch (sortiert: a.regulationKey <
 *     b.regulationKey) — damit hat ein Paar EINE stabile Identität und
 *     (X,Y)/(Y,X) können nicht beide existieren. Die Relations-RICHTUNG ist
 *     aber ein SEPARATES Feld (`direction`) und wird NICHT aus der Sortierung
 *     abgeleitet: `regulationKey` beginnt mit dem Gesetzesnamen, Sortierung
 *     würde bei einem Gesetzespaar immer dasselbe Gesetz als "a" fixieren —
 *     nur 2 von 8 inferred Relationstypen haben eine deklarierte Inverse in
 *     der Ontologie, eine echte Relation vom später-sortierten zum früher-
 *     sortierten Gesetz wäre sonst unausdrückbar.
 *
 * (2) Drei Label-Zustände (wie im Typing-Golden): Feld fehlt = offen/
 *     unlabeled (Draft-Zustand), `null` = "keine Relation zwischen diesen
 *     beiden" (die bewusste Negativ-Klasse — ohne sie ist Precision nicht
 *     messbar), eine Relations-ID = gelabelt. `relation` MUSS `.optional()`
 *     sein (nicht nur nullable) — sonst scheitern Draft-Builder, OOV-Drop und
 *     Blind-Copy (spätere Tasks) an der Schema-Validierung.
 *
 * `derivation === 'metadata'` Relationen (AMENDS, CONSOLIDATES, REPEALS,
 * CITES) kommen aus offiziellen Dokument-Metadaten (ELI/CELLAR) und dürfen
 * NIEMALS von einem Sprachmodell vorgeschlagen werden (THE-433 AC-5) — dieses
 * Schema erzwingt das über `isInferredRelation` (aus @thearchitect/shared).
 *
 * `frozen: true` erst nach Kappa ≥ 0.6 + Adjudikation (RUBRIC.md §7). Ein Set
 * mit `frozen: false` ist Entwicklungs-Material, KEINE Baseline-Grundlage.
 * `ontologyVersion` bindet das Label an die E6/E7-Version, gegen die es
 * erstellt wurde (Drift-Anker bei Ontologie-Bump).
 *
 * Linear: THE-421 · Relationstypen aus norm-ontology.v1 (E7, `relationTypes`)
 */
import fs from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import { isInferredRelation } from '@thearchitect/shared';

// ─── Pair side ───────────────────────────────────────────────────────

const PairSide = z.object({
  regulationKey: z.string().min(1),
  source: z.string().min(1), // 'dora' | 'nis2' | 'dsgvo' | ... (the LAW this side belongs to)
  paragraphNumber: z.string().min(1),
  title: z.string().optional(),
  fullText: z.string().min(50),
  language: z.enum(['de', 'en']),
});

export type RelationsGoldenPairSide = z.infer<typeof PairSide>;

// ─── Relation + direction ────────────────────────────────────────────

/**
 * `relation` is `.optional()` (open/draft), or `null` (deliberate negative —
 * "no relation"), or a relation-type id. The id MUST be an `inferred` type —
 * `metadata` edges (AMENDS/CONSOLIDATES/REPEALS/CITES) come from the parser,
 * never from a model/annotator proposing a golden label here.
 */
const RelationTypeLabel = z.union([z.string(), z.null()]).refine((v) => v === null || isInferredRelation(v), {
  message: "relation must be an ontology 'inferred' relation type or null (metadata relations must never be labeled here)",
});

const DirectionSchema = z.enum(['a-to-b', 'b-to-a']);

export const RelationsGoldenCaseSchema = z
  .object({
    caseId: z.string().min(1),
    a: PairSide,
    b: PairSide,
    relation: RelationTypeLabel.optional(),
    direction: DirectionSchema.optional(),
    ambiguous: z.boolean().optional(),
    notes: z.string().optional(),
    annotator: z.string().optional(),
    labeledAt: z.string().optional(),
  })
  .refine((c) => !(typeof c.relation === 'string' && c.direction === undefined), {
    message: 'direction is required when relation is set to a relation type id',
    path: ['direction'],
  })
  .refine((c) => !(c.relation === null && c.direction !== undefined), {
    message: 'direction must be absent when relation is null (no relation between the pair)',
    path: ['direction'],
  })
  .refine((c) => c.a.regulationKey < c.b.regulationKey, {
    message: 'pair must be stored sorted: a.regulationKey must be < b.regulationKey',
    path: ['a', 'regulationKey'],
  })
  .refine((c) => c.a.source !== c.b.source, {
    message: 'a cross-norm pair must not have both sides from the same law (a.source === b.source)',
    path: ['b', 'source'],
  });

export type RelationsGoldenCase = z.infer<typeof RelationsGoldenCaseSchema>;

export const RelationsGoldenSetSchema = z.object({
  version: z.string().min(1),
  frozen: z.boolean(),
  /** E6/E7-Version, gegen die gelabelt wurde — Drift-Anker bei Ontologie-Bump. */
  ontologyVersion: z.string().min(1),
  rubricRef: z.string().default('RUBRIC.md'),
  cases: z.array(RelationsGoldenCaseSchema).min(1),
});

export type RelationsGoldenSet = z.infer<typeof RelationsGoldenSetSchema>;

export const DEFAULT_RELATIONS_GOLDEN_PATH = path.join(__dirname, 'golden', 'relations.v1.json');

export class RelationsGoldenError extends Error {
  constructor(message: string, public readonly cause?: unknown) {
    super(message);
    this.name = 'RelationsGoldenError';
  }
}

/** Load + Zod-validate a relations golden file. Throws RelationsGoldenError with context. */
export function loadRelationsGolden(filePath: string = DEFAULT_RELATIONS_GOLDEN_PATH): RelationsGoldenSet {
  let raw: string;
  try {
    raw = fs.readFileSync(filePath, 'utf8');
  } catch (err) {
    throw new RelationsGoldenError(`Cannot read relations golden at ${filePath}`, err);
  }
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch (err) {
    throw new RelationsGoldenError(`Relations golden is not valid JSON: ${filePath}`, err);
  }
  const parsed = RelationsGoldenSetSchema.safeParse(json);
  if (!parsed.success) {
    throw new RelationsGoldenError(
      `Relations golden failed schema validation: ${parsed.error.issues
        .map((i) => `${i.path.join('.')}: ${i.message}`)
        .join('; ')}`
    );
  }
  const dupes = findDuplicateCaseIds(parsed.data.cases);
  if (dupes.length > 0) {
    throw new RelationsGoldenError(`Duplicate caseIds in relations golden: ${dupes.join(', ')}`);
  }
  return parsed.data;
}

export function findDuplicateCaseIds(cases: RelationsGoldenCase[]): string[] {
  const seen = new Set<string>();
  const dupes = new Set<string>();
  for (const c of cases) {
    if (seen.has(c.caseId)) dupes.add(c.caseId);
    seen.add(c.caseId);
  }
  return [...dupes];
}

export interface RelationsGoldenStats {
  total: number;
  /** Count per relation-type id (labeled cases only). */
  byRelationType: Record<string, number>;
  /** relation === null — the deliberate "no relation" negative class. */
  negatives: number;
  negativeShare: number;
  /** relation absent — still open/unlabeled (draft state). */
  open: number;
  openShare: number;
  ambiguous: number;
}

/** Stratifikations-Stats — für den Report + RUBRIC §7 Soll/Ist-Abgleich. */
export function relationsGoldenStats(set: RelationsGoldenSet): RelationsGoldenStats {
  const byRelationType: Record<string, number> = {};
  let negatives = 0;
  let open = 0;
  let ambiguous = 0;
  for (const c of set.cases) {
    if (c.ambiguous) ambiguous++;
    if (c.relation === null) {
      negatives++;
    } else if (c.relation === undefined) {
      open++;
    } else {
      byRelationType[c.relation] = (byRelationType[c.relation] ?? 0) + 1;
    }
  }
  const total = set.cases.length;
  return {
    total,
    byRelationType,
    negatives,
    negativeShare: total > 0 ? negatives / total : 0,
    open,
    openShare: total > 0 ? open / total : 0,
    ambiguous,
  };
}

/**
 * Kappa class for a case: 'no relation' and 'open' are real, distinguishable
 * states; a labeled relation is type+direction combined, because two raters
 * who agree on the type but disagree on the direction genuinely disagree (who
 * displaces whom IS the claim).
 */
export function relationLabelForKappa(c: RelationsGoldenCase): string {
  if (c.relation === null) return '__none__';
  if (c.relation === undefined) return '__open__';
  return `${c.relation}:${c.direction}`;
}
