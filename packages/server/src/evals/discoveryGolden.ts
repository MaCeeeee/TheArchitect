/**
 * Discovery-Golden-Set Schema + Loader — Ground Truth für die UC-LAW-002
 * Discovery-Eval (THE-465). Muster: goldenSet.ts (Mapping-Eval).
 *
 * Ein Golden-Case = ein Architektur-/Use-Case-Profil + die erwarteten
 * Gesetzes-Familien (`goldFamilies`, leer = Hard Negative, AC-1). `ruleLessGold`
 * markiert die Teilmenge, die NICHT in APPLICABILITY_RULES steckt (Stage-A-
 * blind) — misst genau den Korpus-Mehrwert (AC-7). `frozen:false` bis
 * Owner-Abnahme (Owner-Entscheid 2026-07-18) — Entwicklungswerte, keine Baseline.
 *
 * Der Fixture-Korpus ist bewusst getrennt vom Golden-Set (eigene JSON-Datei):
 * er simuliert den governten Korpus offline, inkl. Familien, die es in
 * APPLICABILITY_RULES nie geben wird (CRA, MDR, PSD2, ePrivacy, UNECE-R155).
 *
 * Linear: THE-465 (REQ-LAW-002.6)
 */
import fs from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import { toFamily } from '../services/lawDiscovery.service';
import type { ScopeCorpusDoc } from '../services/scopeGuarantee.service';

export const DiscoveryGoldenCaseSchema = z
  .object({
    caseId: z.string().min(1),
    title: z.string().min(1), // z.B. "Regional-Klinik mit Patientenportal"
    profileText: z.string().min(100), // Fixture-Profil (Systemsprache, wie buildUseCaseProfile-Output)
    signalHints: z.array(z.string()).default([]),
    goldFamilies: z.array(z.string()), // erwartete Familien; leer = Hard Negative (AC-1)
    ruleLessGold: z.array(z.string()).default([]), // Teilmenge von goldFamilies OHNE Regel-Zeile (AC-7-Fokus)
    ambiguous: z.boolean().default(false),
    notes: z.string().optional(),
  })
  .superRefine((c, ctx) => {
    const gold = new Set(c.goldFamilies);
    for (const f of c.ruleLessGold) {
      if (!gold.has(f)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `ruleLessGold "${f}" of case "${c.caseId}" is not in goldFamilies (ruleLessGold must be a subset)`,
        });
      }
    }
  });

export const DiscoveryGoldenSetSchema = z.object({
  version: z.string().min(1),
  frozen: z.boolean(), // true erst nach Owner-Abnahme
  rubricRef: z.string().min(1),
  cases: z.array(DiscoveryGoldenCaseSchema).min(10),
});

export type DiscoveryGoldenCase = z.infer<typeof DiscoveryGoldenCaseSchema>;
export type DiscoveryGoldenSet = z.infer<typeof DiscoveryGoldenSetSchema>;

/**
 * ADR-0006 E6 / THE-516: Typing-Vorschlag am Fixture-§ — ADDITIV (optional),
 * die eingefrorenen v1-Fixtures bleiben unverändert schema-gültig. Feld-Shape
 * identisch zu `ScopeCorpusDoc.typing` (scopeGuarantee.service), damit der
 * Eval-Harness dieselben E3-Konsumregeln durchläuft wie Prod.
 */
export const FixtureTypingSchema = z.object({
  provisionKind: z.string().nullable().optional(),
  versionHash: z.string().optional(),
  status: z.enum(['suggested', 'confirmed', 'rejected']).optional(),
});

export const FixtureParagraphSchema = z.object({
  regulationKey: z.string().min(1),
  versionHash: z.string().min(1),
  source: z.string().min(1),
  paragraphNumber: z.string().min(1),
  title: z.string().min(1),
  jurisdiction: z.string().min(1),
  language: z.string().min(1),
  text: z.string().min(80), // kuratierter §-Text (für HyDE-Kontext + Re-Embed)
  vector: z.array(z.number()).length(768).optional(), // vom Precompute-Script befüllt
  typing: FixtureTypingSchema.optional(), // THE-516: nur von Scope-Guarantee-Fixtures genutzt
});

export const FixtureCorpusSchema = z.object({
  version: z.string().min(1),
  paragraphs: z.array(FixtureParagraphSchema).min(1),
});

export type FixtureParagraph = z.infer<typeof FixtureParagraphSchema>;
export type FixtureCorpus = z.infer<typeof FixtureCorpusSchema>;

export const DEFAULT_DISCOVERY_GOLDEN_PATH = path.join(__dirname, 'golden', 'discovery.v1.json');
export const DEFAULT_DISCOVERY_CORPUS_PATH = path.join(__dirname, 'golden', 'discovery.corpus.v1.json');

export class DiscoveryGoldenSetError extends Error {
  constructor(message: string, public readonly cause?: unknown) {
    super(message);
    this.name = 'DiscoveryGoldenSetError';
  }
}

function readJson(filePath: string): unknown {
  let raw: string;
  try {
    raw = fs.readFileSync(filePath, 'utf8');
  } catch (err) {
    throw new DiscoveryGoldenSetError(`Cannot read file at ${filePath}`, err);
  }
  try {
    return JSON.parse(raw);
  } catch (err) {
    throw new DiscoveryGoldenSetError(`Not valid JSON: ${filePath}`, err);
  }
}

export function findDuplicateDiscoveryCaseIds(cases: DiscoveryGoldenCase[]): string[] {
  const seen = new Set<string>();
  const dupes = new Set<string>();
  for (const c of cases) {
    if (seen.has(c.caseId)) dupes.add(c.caseId);
    seen.add(c.caseId);
  }
  return [...dupes];
}

/** Load + Zod-validate the discovery golden set (schema + duplicate-caseId check only). */
export function loadDiscoveryGoldenSet(filePath: string = DEFAULT_DISCOVERY_GOLDEN_PATH): DiscoveryGoldenSet {
  const json = readJson(filePath);
  const parsed = DiscoveryGoldenSetSchema.safeParse(json);
  if (!parsed.success) {
    throw new DiscoveryGoldenSetError(
      `Discovery golden set failed schema validation: ${parsed.error.issues
        .map(i => `${i.path.join('.')}: ${i.message}`)
        .join('; ')}`,
    );
  }
  const dupes = findDuplicateDiscoveryCaseIds(parsed.data.cases);
  if (dupes.length > 0) {
    throw new DiscoveryGoldenSetError(`Duplicate caseIds in discovery golden set: ${dupes.join(', ')}`);
  }
  return parsed.data;
}

/** Load + Zod-validate the fixture corpus. */
export function loadFixtureCorpus(filePath: string = DEFAULT_DISCOVERY_CORPUS_PATH): FixtureCorpus {
  const json = readJson(filePath);
  const parsed = FixtureCorpusSchema.safeParse(json);
  if (!parsed.success) {
    throw new DiscoveryGoldenSetError(
      `Fixture corpus failed schema validation: ${parsed.error.issues
        .map(i => `${i.path.join('.')}: ${i.message}`)
        .join('; ')}`,
    );
  }
  return parsed.data;
}

/** All families actually present in the fixture corpus (language-merged via toFamily). */
export function fixtureCorpusFamilies(corpus: FixtureCorpus): Set<string> {
  return new Set(corpus.paragraphs.map(p => toFamily(p.source)));
}

/**
 * Anti-Leak (Muster goldenSet.ts): jede `goldFamily` MUSS als Familie im
 * Fixture-Korpus existieren — sonst könnte KEIN Retrieval-Lauf sie je finden
 * (das Golden-Set würde einen strukturell unerreichbaren Recall verlangen).
 * Returns die fehlenden (caseId, family)-Paare; leer = alles gedeckt.
 */
export function findUncoveredGoldFamilies(
  golden: DiscoveryGoldenSet,
  corpus: FixtureCorpus,
): Array<{ caseId: string; family: string }> {
  const families = fixtureCorpusFamilies(corpus);
  const missing: Array<{ caseId: string; family: string }> = [];
  for (const c of golden.cases) {
    for (const f of c.goldFamilies) {
      if (!families.has(f)) missing.push({ caseId: c.caseId, family: f });
    }
  }
  return missing;
}

/**
 * Kombinierter Loader für den Runner (Task 7): lädt Golden-Set + Fixture-Korpus
 * und wirft, wenn irgendeine goldFamily im Korpus nicht existiert (Anti-Leak).
 */
export function loadDiscoveryEvalData(
  goldenPath: string = DEFAULT_DISCOVERY_GOLDEN_PATH,
  corpusPath: string = DEFAULT_DISCOVERY_CORPUS_PATH,
): { golden: DiscoveryGoldenSet; corpus: FixtureCorpus } {
  const golden = loadDiscoveryGoldenSet(goldenPath);
  const corpus = loadFixtureCorpus(corpusPath);
  const missing = findUncoveredGoldFamilies(golden, corpus);
  if (missing.length > 0) {
    throw new DiscoveryGoldenSetError(
      `Golden set references families missing from the fixture corpus: ${missing
        .map(m => `${m.caseId}→${m.family}`)
        .join(', ')}`,
    );
  }
  return { golden, corpus };
}

// ─── THE-516 (ADR-0006 E6): Scope-Blindfleck-Fixture — Offline-Beweis ────────

/**
 * Eigenständiges, ADDITIVES Fixture für den E6-Regressionstest, der THE-423
 * dauerhaft festnagelt: eine Familie, deren Retrieval-topHits NUR Durchführungs-
 * §§ enthalten, plus ein scope-§ mit Typing, den das Retrieval NICHT hochspült.
 * Bewusst eine EIGENE Datei (discovery.scope-blindspot.v1.json) statt einer
 * Änderung an den eingefrorenen v1-Fixtures (Golden-Freeze-Disziplin) — und
 * mit eigenem, handkonstruierten Vektor-Set (keine Live-Embedding-Calls: die
 * Vektoren sind deterministische Dummy-Geometrie im Precompute-Format, 768-dim).
 */
export const ScopeBlindspotFixtureSchema = z.object({
  version: z.string().min(1),
  case: DiscoveryGoldenCaseSchema,
  /** Query-Vektor des Falls — Pendant zu baselineVector in discovery.queries.v1.json. */
  queryVector: z.array(z.number()).length(768),
  paragraphs: z.array(FixtureParagraphSchema).min(2),
});

export type ScopeBlindspotFixture = z.infer<typeof ScopeBlindspotFixtureSchema>;

export const DEFAULT_SCOPE_BLINDSPOT_PATH = path.join(__dirname, 'golden', 'discovery.scope-blindspot.v1.json');

/** Load + Zod-validate the scope-blindspot fixture (THE-516 / ADR-0006 E6). */
export function loadScopeBlindspotFixture(filePath: string = DEFAULT_SCOPE_BLINDSPOT_PATH): ScopeBlindspotFixture {
  const json = readJson(filePath);
  const parsed = ScopeBlindspotFixtureSchema.safeParse(json);
  if (!parsed.success) {
    throw new DiscoveryGoldenSetError(
      `Scope-blindspot fixture failed schema validation: ${parsed.error.issues
        .map(i => `${i.path.join('.')}: ${i.message}`)
        .join('; ')}`,
    );
  }
  return parsed.data;
}

/**
 * E6-Injektions-Seam-Gegenstück: Fixture-Lookup im EXAKTEN Vertrag von
 * `listScopeProvisionsBySource` (corpusClient.service) — Quellen-Filter +
 * provisionKind-Vorfilter wie die Mongo-Query. Die E3-Vertrauensregeln
 * (versionHash-Anker, rejected-nie) laufen bewusst NICHT hier, sondern im
 * geteilten Kern (`selectScopeProvisions`) — der Eval prüft damit denselben
 * Code-Pfad wie Prod, nicht eine Nachbildung.
 */
export function fixtureScopeLookup(paragraphs: FixtureParagraph[]): (sources: string[]) => Promise<ScopeCorpusDoc[]> {
  return async (sources: string[]) => {
    const wanted = new Set(sources);
    return paragraphs
      .filter(p => wanted.has(p.source) && p.typing?.provisionKind === 'scope-applicability')
      .map(p => ({
        source: p.source,
        paragraphNumber: p.paragraphNumber,
        title: p.title,
        language: p.language,
        jurisdiction: p.jurisdiction,
        versionHash: p.versionHash,
        typing: p.typing,
      }));
  };
}

/** Stratification stats — für den Report. */
export function discoveryGoldenSetStats(set: DiscoveryGoldenSet): {
  total: number;
  hardNegatives: number;
  hardNegativeShare: number;
  ambiguous: number;
  ruleLessCases: number;
} {
  let hardNegatives = 0;
  let ambiguous = 0;
  let ruleLessCases = 0;
  for (const c of set.cases) {
    if (c.goldFamilies.length === 0) hardNegatives++;
    if (c.ambiguous) ambiguous++;
    if (c.ruleLessGold.length > 0) ruleLessCases++;
  }
  return {
    total: set.cases.length,
    hardNegatives,
    hardNegativeShare: set.cases.length > 0 ? hardNegatives / set.cases.length : 0,
    ambiguous,
    ruleLessCases,
  };
}
