/**
 * requirement-kappa — Inter-Annotator-Agreement auf der Requirement→Element-Ebene.
 *
 * Vergleicht zwei Label-Quellen über alle (requirement, candidate)-Paare:
 *   npm run req:kappa -- <a.json> <b.json>          # zwei menschliche Labelsets
 *   npm run req:kappa -- <a.json> --rules           # Mensch gegen Prädikat-Stimme
 *
 * Gibt Cohen's Kappa + Paar-Übereinstimmung + Abweichungsliste (je Requirement,
 * split nach Richtung) aus — dieselbe Freeze-Logik wie golden:kappa (≥ 0,6).
 *
 * Linear: THE-378 (UC-EVAL-001)
 */
import path from 'node:path';
import { cohenKappa, type PairLabel } from '../evals/metrics';
import {
  loadRequirementGolden,
  predictedElementIds,
  type RequirementGoldenSet,
} from '../evals/requirementsGolden';

export interface ReqKappaResult {
  kappa: number;
  agreement: number;
  pairs: number;
  disagreements: Array<{ reqId: string; aOnly: string[]; bOnly: string[] }>;
}

/**
 * Vergleicht zwei Golden-Sets Paar für Paar (gleiche reqIds + Kandidaten
 * vorausgesetzt). `bGoldByReq`: reqId → Set(elementIds) der zweiten Quelle.
 * Reine Funktion.
 */
export function compareRequirementSets(
  a: RequirementGoldenSet,
  bGoldByReq: Map<string, Set<string>>
): ReqKappaResult {
  const labelsA: PairLabel[] = [];
  const labelsB: PairLabel[] = [];
  const disagreements: ReqKappaResult['disagreements'] = [];
  let agree = 0;
  let total = 0;

  for (const req of a.requirements) {
    const aGold = new Set(req.goldElementIds);
    const bGold = bGoldByReq.get(req.reqId) ?? new Set<string>();
    const aOnly: string[] = [];
    const bOnly: string[] = [];
    for (const c of a.candidates) {
      const inA = aGold.has(c.id);
      const inB = bGold.has(c.id);
      labelsA.push(inA ? 'match' : 'no-match');
      labelsB.push(inB ? 'match' : 'no-match');
      total++;
      if (inA === inB) agree++;
      else if (inA) aOnly.push(c.id);
      else bOnly.push(c.id);
    }
    if (aOnly.length || bOnly.length) disagreements.push({ reqId: req.reqId, aOnly, bOnly });
  }

  return {
    kappa: cohenKappa(labelsA, labelsB),
    agreement: total === 0 ? 0 : agree / total,
    pairs: total,
    disagreements,
  };
}

/** Prädikat-Stimme als zweite Quelle (reqId → erwartete Element-Menge). */
export function rulesGoldByReq(set: RequirementGoldenSet): Map<string, Set<string>> {
  const m = new Map<string, Set<string>>();
  for (const req of set.requirements) {
    const pred = predictedElementIds(req, set.candidates);
    m.set(req.reqId, new Set(pred ?? []));
  }
  return m;
}

function main(): void {
  const [aPath, bArg] = process.argv.slice(2);
  if (!aPath) {
    console.error('Usage: requirement-kappa <a.json> <b.json|--rules>');
    process.exitCode = 2;
    return;
  }
  const a = loadRequirementGolden(path.resolve(aPath));
  const bGold =
    bArg === '--rules'
      ? rulesGoldByReq(a)
      : new Map(loadRequirementGolden(path.resolve(bArg)).requirements.map(r => [r.reqId, new Set(r.goldElementIds)]));

  const res = compareRequirementSets(a, bGold);
  const bLabel = bArg === '--rules' ? 'Prädikat-Regeln' : path.basename(bArg);
  console.log(`[req-kappa] ${path.basename(aPath)}  vs  ${bLabel}`);
  console.log(`[req-kappa] pairs: ${res.pairs} · agreement: ${(res.agreement * 100).toFixed(1)}%`);
  console.log(`[req-kappa] Cohen's Kappa: ${res.kappa.toFixed(3)}  (Freeze-Gate ≥ 0,6)`);
  if (res.disagreements.length) {
    console.log(`\n[req-kappa] Abweichungen:`);
    const s = (id: string) => id.replace(/^4193802f-/, '');
    for (const d of res.disagreements) {
      console.log(`  ${d.reqId}`);
      if (d.aOnly.length) console.log(`     nur A: ${d.aOnly.map(s).join(', ')}`);
      if (d.bOnly.length) console.log(`     nur B: ${d.bOnly.map(s).join(', ')}`);
    }
  }
  console.log(
    res.kappa >= 0.6
      ? '\n[req-kappa] ✅ ≥ 0,6 — adjudizieren, dann frozen:true.'
      : '\n[req-kappa] ⚠️ < 0,6 — Requirements/Rubrik schärfen, neu labeln.'
  );
}

if (require.main === module) main();
