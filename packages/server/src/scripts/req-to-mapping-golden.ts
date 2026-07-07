/**
 * req-to-mapping-golden — konvertiert das eingefrorene Requirement-Golden
 * (requirements.self.v1.json) in das Mapping-Golden-Format (goldenSet.ts), damit
 * die bestehende Eval-Maschinerie (`eval:mapping --models …`, P/R/F2, Conciseness,
 * Multi-Modell, Cache) direkt auf der Requirement-Ebene läuft. Jede Requirement
 * wird ein "Case": fullText = Titel + Beschreibung (Architektursprache), gold =
 * die adjudizierten Elemente.
 *
 * Das ist E1 auf Requirement-Ebene: "wie gut mappt das LLM ein architektur-
 * sprachliches Requirement auf die Elemente?" — gegen menschliches Gold.
 *
 *   npm run req:to-mapping                         # → golden/mapping.req-self-v1.json (mit Facts)
 *   npm run req:to-mapping -- --strip-facts        # → …-nofacts.json (Facts aus Beschreibung entfernt)
 *   npm run eval:mapping -- --golden src/evals/golden/mapping.req-self-v1.json --models haiku,sonnet,opus
 *
 * Der --strip-facts-Lauf ist der Kontrast fürs Experiment "heben strukturierte
 * Facts die Mapping-Qualität?": beide Golden nur in der Kandidaten-Beschreibung
 * verschieden (mit/ohne "· facts: …"), sonst identisch.
 *
 * Linear: THE-378 (UC-EVAL-001) · REQ-EVAL-001.12
 */
import fs from 'node:fs';
import path from 'node:path';
import { loadRequirementGolden, type RequirementGoldenSet } from '../evals/requirementsGolden';
import { GoldenSetSchema, type GoldenSet } from '../evals/goldenSet';

const FACTS_SUFFIX = /\s*·\s*facts:.*$/;

/** Reine Transformation: Requirement-Golden → Mapping-Golden (testbar). */
export function toMappingGolden(reqSet: RequirementGoldenSet, stripFacts: boolean): GoldenSet {
  const candidates = reqSet.candidates.map(c => ({
    id: c.id,
    name: c.name,
    type: c.type,
    layer: c.layer,
    description: stripFacts ? (c.description ?? '').replace(FACTS_SUFFIX, '') : c.description,
  }));

  const cases = reqSet.requirements.map(r => {
    // fullText muss ≥ 50 Zeichen sein (goldenSet-Schema); Titel + Beschreibung reicht.
    const fullText = `${r.title}. ${r.description}`;
    return {
      caseId: r.reqId,
      source: r.source,
      paragraphNumber: r.paragraphNumber,
      title: r.title,
      fullText,
      language: 'en' as const,
      jurisdiction: 'EU',
      candidates,
      goldElementIds: r.goldElementIds,
    };
  });

  return {
    version: `${stripFacts ? 'mapping-req-self-v1-nofacts' : 'mapping-req-self-v1'}`,
    frozen: reqSet.frozen,
    rubricRef: '../RUBRIC.md',
    cases,
  };
}

function main(): void {
  const stripFacts = process.argv.includes('--strip-facts');
  const reqSet = loadRequirementGolden();
  const mapping = toMappingGolden(reqSet, stripFacts);
  GoldenSetSchema.parse(mapping); // validate before write

  const name = stripFacts ? 'mapping.req-self-v1-nofacts.json' : 'mapping.req-self-v1.json';
  const out = path.join(__dirname, '..', 'evals', 'golden', name);
  fs.writeFileSync(out, JSON.stringify(mapping, null, 2) + '\n');
  console.log(
    `[req→mapping] ${mapping.cases.length} Cases · frozen=${mapping.frozen} · facts=${!stripFacts}\n` +
      `[req→mapping] → ${out}\n` +
      `[req→mapping] NEXT: npm run eval:mapping -- --golden src/evals/golden/${name} --models haiku,sonnet,opus`
  );
}

if (require.main === module) main();
