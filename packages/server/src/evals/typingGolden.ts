/**
 * Typing-Golden-Set — Ground Truth für die Term-Typing-Eval (THE-430 Slice 1).
 *
 * Ein Typing-Case = eine Norm-Provision (Paragraph) + menschlich gelabelte
 * Typ-Achsen gegen die geschlossenen E6-Räume (norm-ontology.v1). Anders als
 * das Mapping-Golden (goldenSet.ts: Regulierung→Element) klassifiziert dieses
 * Golden die Provision SELBST — die Achsen aus THE-432 (+ THE-421):
 *
 *   - normKind        (E6 NORM_KIND_IDS)        — Art der Norm
 *   - bindingness     (E6 BINDINGNESS_IDS)      — Verbindlichkeit
 *   - obligationKind  (E6 OBLIGATION_KIND_IDS)  — deontische Kraft (Gebot/Verbot/Erlaubnis)
 *   - partyRole       (E6 PARTY_ROLE_IDS)       — Adressat
 *   - provisionKind   (E6 PROVISION_KIND_IDS)   — Vorschriftstyp (Scope/Definition/Obligation/…)
 *
 * `null` auf einer Achse = bewusst NICHT anwendbar (z. B. ein Definitions-/
 * Scope-Paragraph trägt keine deontische Kraft). Das ist eine echte Label-
 * Entscheidung und wird als solche gewertet (nicht "vergessen").
 *
 * `frozen: true` erst nach Kappa ≥ 0.6 + Adjudikation (RUBRIC.md §7). Ein Set
 * mit `frozen: false` ist Entwicklungs-Material, KEINE Baseline-Grundlage.
 * `ontologyVersion` bindet das Label an die E6-Version, gegen die es erstellt
 * wurde (THE-384-Join / Drift bei Ontologie-Bump).
 *
 * Linear: THE-430 (REQ-ONTO-001.5) · Typraum aus THE-429 · Achsen aus THE-432
 */
import fs from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import {
  isNormKind,
  isObligationKind,
  isProvisionKind,
  NORM_KIND_IDS,
  BINDINGNESS_IDS,
  OBLIGATION_KIND_IDS,
  PARTY_ROLE_IDS,
} from '@thearchitect/shared';

/** Membership-Check gegen eine E6-Facette (Set für O(1)); null bleibt erlaubt. */
const memberOrNull = (ids: readonly string[], facet: string) => {
  const set = new Set(ids);
  return z
    .union([z.string(), z.null()])
    .refine((v) => v === null || set.has(v), { message: `value not in ontology facet '${facet}'` });
};

// bindingness/partyRole haben keinen exportierten is*-Guard → aus den ID-Listen.
const NormKindLabel = z
  .union([z.string(), z.null()])
  .refine((v) => v === null || isNormKind(v), { message: 'normKind not in ontology' });
const ObligationKindLabel = z
  .union([z.string(), z.null()])
  .refine((v) => v === null || isObligationKind(v), { message: 'obligationKind not in ontology' });
const ProvisionKindLabel = z
  .union([z.string(), z.null()])
  .refine((v) => v === null || isProvisionKind(v), { message: 'provisionKind not in ontology' });

export const TypingLabelsSchema = z.object({
  normKind: NormKindLabel.optional(),
  bindingness: memberOrNull(BINDINGNESS_IDS, 'bindingness').optional(),
  obligationKind: ObligationKindLabel.optional(),
  partyRole: memberOrNull(PARTY_ROLE_IDS, 'partyRoles').optional(),
  provisionKind: ProvisionKindLabel.optional(),
});

export type TypingLabels = z.infer<typeof TypingLabelsSchema>;
export type TypingAxis = keyof TypingLabels;
export const TYPING_AXES: readonly TypingAxis[] = [
  'normKind',
  'bindingness',
  'obligationKind',
  'partyRole',
  'provisionKind',
];

export const TypingGoldenCaseSchema = z.object({
  caseId: z.string().min(1),
  source: z.string().min(1), // 'dsgvo' | 'nis2' | ...
  paragraphNumber: z.string().min(1),
  title: z.string().optional(),
  fullText: z.string().min(50),
  language: z.enum(['de', 'en']),
  jurisdiction: z.string().min(1),
  labels: TypingLabelsSchema,
  ambiguous: z.boolean().optional(),
  notes: z.string().optional(),
  annotator: z.string().optional(),
  labeledAt: z.string().optional(),
});

export const TypingGoldenSetSchema = z.object({
  version: z.string().min(1),
  frozen: z.boolean(),
  /** E6-Version, gegen die gelabelt wurde — Drift-Anker bei Ontologie-Bump. */
  ontologyVersion: z.string().min(1),
  rubricRef: z.string().default('RUBRIC.md'),
  cases: z.array(TypingGoldenCaseSchema).min(1),
});

export type TypingGoldenCase = z.infer<typeof TypingGoldenCaseSchema>;
export type TypingGoldenSet = z.infer<typeof TypingGoldenSetSchema>;

export const DEFAULT_TYPING_GOLDEN_PATH = path.join(__dirname, 'golden', 'typing.v1.json');

export class TypingGoldenError extends Error {
  constructor(message: string, public readonly cause?: unknown) {
    super(message);
    this.name = 'TypingGoldenError';
  }
}

/** Load + Zod-validate a typing golden file. Throws TypingGoldenError with context. */
export function loadTypingGolden(filePath: string = DEFAULT_TYPING_GOLDEN_PATH): TypingGoldenSet {
  let raw: string;
  try {
    raw = fs.readFileSync(filePath, 'utf8');
  } catch (err) {
    throw new TypingGoldenError(`Cannot read typing golden at ${filePath}`, err);
  }
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch (err) {
    throw new TypingGoldenError(`Typing golden is not valid JSON: ${filePath}`, err);
  }
  const parsed = TypingGoldenSetSchema.safeParse(json);
  if (!parsed.success) {
    throw new TypingGoldenError(
      `Typing golden failed schema validation: ${parsed.error.issues
        .map((i) => `${i.path.join('.')}: ${i.message}`)
        .join('; ')}`
    );
  }
  const dupes = findDuplicateCaseIds(parsed.data.cases);
  if (dupes.length > 0) {
    throw new TypingGoldenError(`Duplicate caseIds in typing golden: ${dupes.join(', ')}`);
  }
  return parsed.data;
}

export function findDuplicateCaseIds(cases: TypingGoldenCase[]): string[] {
  const seen = new Set<string>();
  const dupes = new Set<string>();
  for (const c of cases) {
    if (seen.has(c.caseId)) dupes.add(c.caseId);
    seen.add(c.caseId);
  }
  return [...dupes];
}

export interface TypingGoldenStats {
  total: number;
  bySource: Record<string, number>;
  byLanguage: Record<string, number>;
  /** Anzahl gelabelter (nicht-null, nicht-undefined) Werte je Achse. */
  labeledPerAxis: Record<TypingAxis, number>;
  /** Anzahl bewusst nicht-anwendbarer (null) Werte je Achse. */
  notApplicablePerAxis: Record<TypingAxis, number>;
  ambiguous: number;
}

/** Stratifikations-Stats — für den Report + RUBRIC §6 Soll/Ist-Abgleich. */
export function typingGoldenStats(set: TypingGoldenSet): TypingGoldenStats {
  const bySource: Record<string, number> = {};
  const byLanguage: Record<string, number> = {};
  const labeledPerAxis = { normKind: 0, bindingness: 0, obligationKind: 0, partyRole: 0, provisionKind: 0 };
  const notApplicablePerAxis = { normKind: 0, bindingness: 0, obligationKind: 0, partyRole: 0, provisionKind: 0 };
  let ambiguous = 0;
  for (const c of set.cases) {
    bySource[c.source] = (bySource[c.source] ?? 0) + 1;
    byLanguage[c.language] = (byLanguage[c.language] ?? 0) + 1;
    if (c.ambiguous) ambiguous++;
    for (const axis of TYPING_AXES) {
      const v = c.labels[axis];
      if (v === null) notApplicablePerAxis[axis]++;
      else if (v !== undefined) labeledPerAxis[axis]++;
    }
  }
  return { total: set.cases.length, bySource, byLanguage, labeledPerAxis, notApplicablePerAxis, ambiguous };
}
