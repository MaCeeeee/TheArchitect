/**
 * golden-kappa — Werkzeug für den Doppel-Labeling-Workflow (RUBRIC.md §7).
 *
 *   npm run golden:blind -- <in.json> <out.json>
 *     Erzeugt eine BLINDE Kopie eines Golden-Sets für Annotator B:
 *     goldElementIds geleert, notes/ambiguous/annotator entfernt (damit die
 *     Begründungen von Annotator A nicht biasen). B füllt goldElementIds und
 *     speichert; dann:
 *
 *   npm run golden:kappa -- <a.json> <b.json>
 *     Berechnet Cohen's Kappa über alle (Case, Kandidat)-Paare der gemeinsamen
 *     Cases und listet jede Abweichung für die Adjudikation. Kappa >= 0.6 ist
 *     das Freeze-Gate für v1 (RUBRIC.md §7).
 *
 * Linear: THE-379 (REQ-EVAL-001.1) · Epic THE-378 (UC-EVAL-001)
 */
import fs from 'node:fs';
import path from 'node:path';
import { loadGoldenSet, type GoldenSet } from '../evals/goldenSet';
import { cohenKappa, type PairLabel } from '../evals/metrics';

// ─── Reine Logik (testbar) ──────────────────────────────────────

export interface PairDisagreement {
  caseId: string;
  elementId: string;
  a: PairLabel;
  b: PairLabel;
}

export interface KappaComparison {
  sharedCases: number;
  pairs: number;
  agreementRate: number;
  kappa: number;
  disagreements: PairDisagreement[];
  /** Cases, die nur in einem der beiden Sets vorkommen (nicht verglichen). */
  unmatchedCaseIds: string[];
}

/**
 * Vergleicht zwei Golden-Sets: pro gemeinsamem Case wird jeder Kandidat als
 * match/no-match gelabelt (Mitgliedschaft in goldElementIds) und über alle
 * Paare Kappa berechnet. Kandidaten werden über die SCHNITTMENGE der
 * Kandidaten-IDs beider Fassungen verglichen (falls eine Seite editiert wurde).
 */
export function compareGoldenSets(a: GoldenSet, b: GoldenSet): KappaComparison {
  const bByCase = new Map(b.cases.map(c => [c.caseId, c]));
  const labelsA: PairLabel[] = [];
  const labelsB: PairLabel[] = [];
  const disagreements: PairDisagreement[] = [];
  const unmatched: string[] = [];
  let sharedCases = 0;

  for (const caseA of a.cases) {
    const caseB = bByCase.get(caseA.caseId);
    if (!caseB) {
      unmatched.push(caseA.caseId);
      continue;
    }
    sharedCases++;
    const goldA = new Set(caseA.goldElementIds);
    const goldB = new Set(caseB.goldElementIds);
    const idsB = new Set(caseB.candidates.map(el => el.id));

    for (const el of caseA.candidates) {
      if (!idsB.has(el.id)) continue; // nur gemeinsame Kandidaten vergleichen
      const la: PairLabel = goldA.has(el.id) ? 'match' : 'no-match';
      const lb: PairLabel = goldB.has(el.id) ? 'match' : 'no-match';
      labelsA.push(la);
      labelsB.push(lb);
      if (la !== lb) disagreements.push({ caseId: caseA.caseId, elementId: el.id, a: la, b: lb });
    }
  }
  for (const caseB of b.cases) {
    if (!a.cases.some(c => c.caseId === caseB.caseId)) unmatched.push(caseB.caseId);
  }

  const pairs = labelsA.length;
  const agree = pairs - disagreements.length;
  return {
    sharedCases,
    pairs,
    agreementRate: pairs === 0 ? 0 : agree / pairs,
    kappa: pairs === 0 ? 0 : cohenKappa(labelsA, labelsB),
    disagreements,
    unmatchedCaseIds: unmatched,
  };
}

/**
 * Blinde Kopie für Annotator B: Gold geleert, A's Begründungen/Flags entfernt.
 * Version bekommt ein "-blind"-Suffix, damit die Dateien unterscheidbar bleiben.
 */
export function makeBlindCopy(set: GoldenSet): GoldenSet {
  return {
    ...set,
    version: `${set.version}-blind`,
    frozen: false,
    cases: set.cases.map(c => ({
      ...c,
      goldElementIds: [],
      ambiguous: undefined,
      notes: undefined,
      annotator: undefined,
      labeledAt: undefined,
    })),
  };
}

// ─── CLI ────────────────────────────────────────────────────────

function main(): void {
  const [mode, arg1, arg2] = process.argv.slice(2);

  if (mode === 'blind' && arg1 && arg2) {
    const set = loadGoldenSet(path.resolve(arg1));
    const blind = makeBlindCopy(set);
    fs.writeFileSync(path.resolve(arg2), JSON.stringify(blind, null, 2));
    console.log(
      `[kappa] blind copy: ${blind.cases.length} cases → ${arg2}\n` +
        `[kappa] Annotator B füllt goldElementIds nach RUBRIC.md (ohne A's Notizen zu sehen).`,
    );
    return;
  }

  if (mode === 'compare' && arg1 && arg2) {
    // Blind-Kopien haben goldElementIds: [] — das ist hier legitim, daher
    // loadGoldenSet für beide Seiten (validiert Schema + Integrität).
    const a = loadGoldenSet(path.resolve(arg1));
    const b = loadGoldenSet(path.resolve(arg2));
    const r = compareGoldenSets(a, b);

    console.log(`[kappa] shared cases: ${r.sharedCases} · pairs: ${r.pairs}`);
    console.log(`[kappa] agreement: ${(r.agreementRate * 100).toFixed(1)}%`);
    console.log(`[kappa] Cohen's Kappa: ${r.kappa.toFixed(3)}  (Freeze-Gate: >= 0.6, RUBRIC.md §7)`);
    if (r.unmatchedCaseIds.length > 0) {
      console.log(`[kappa] not compared (only in one file): ${r.unmatchedCaseIds.join(', ')}`);
    }
    if (r.disagreements.length === 0) {
      console.log('[kappa] keine Abweichungen — direkt adjudizieren/freezen.');
    } else {
      console.log(`\n[kappa] ${r.disagreements.length} Abweichungen zur Adjudikation:`);
      for (const d of r.disagreements) {
        console.log(`  - ${d.caseId} · ${d.elementId}: A=${d.a} vs B=${d.b}`);
      }
    }
    if (r.kappa < 0.6) {
      console.log('\n[kappa] ⚠️ Kappa < 0.6 — erst RUBRIC.md schärfen, dann neu labeln (nicht das Modell tunen).');
      process.exitCode = 1;
    }
    return;
  }

  console.error(
    'Usage:\n' +
      '  golden-kappa blind   <in.json> <out.json>   # blinde Kopie für Annotator B\n' +
      '  golden-kappa compare <a.json> <b.json>      # Kappa + Abweichungsliste',
  );
  process.exitCode = 2;
}

if (require.main === module) {
  main();
}
