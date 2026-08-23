/**
 * THE-672 (REQ-671.1): Todesursachen-Diagnose — jede verlorene Gold-Familie
 * trägt einen benannten Grund. READ-ONLY, komplett offline (Fixture + Cache).
 *
 * Der Befund des Offline-Laufs: Any-Hit-Recall 100 %, Gated-Recall 44 %.
 * Die Verluste passieren also NICHT im Retrieval — jede Familie taucht in den
 * Roh-Treffern auf (bei topK ≥ Korpus zwangsläufig). Sie sterben zwischen
 * Aggregation und Gate. Diese Diagnose benennt für JEDEN Verlust die Stufe:
 *
 *   schwelle-max      — schon der beste Einzeltreffer liegt unter der Schwelle
 *                       (das Retrieval-Signal selbst ist zu schwach)
 *   mean-verwaesserung — max ≥ Schwelle, aber 0,7·max+0,3·mean fällt darunter
 *                       (die Mean-Pathologie aus THE-671: breite Familien
 *                        bezahlen für ihre irrelevanten Absätze)
 *   deckel            — Score ≥ Schwelle, aber Rang > maxJudge (vom Cap verdrängt)
 *
 * Lauf: packages/server$ npx ts-node src/scripts/the672-todesursachen.ts
 */
import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { loadDiscoveryGoldenSet, loadFixtureCorpus, DEFAULT_DISCOVERY_GOLDEN_PATH } from '../evals/discoveryGolden';
import { readQueriesFile, DEFAULT_QUERIES_PATH } from './build-discovery-eval-vectors';
import { topKByCosine } from '../evals/runDiscoveryEval';
import { aggregateHitsToCandidates, gateCandidatesForJudge } from '../services/lawDiscovery.service';

const TOP_K = Number(process.env.LAW_DISCOVERY_TOP_K) || 60;
const THRESHOLD = 0.3;
const MAX_JUDGE = 5;

type Ursache = 'schwelle-max' | 'mean-verwaesserung' | 'deckel';

async function main(): Promise<void> {
  const golden = loadDiscoveryGoldenSet(DEFAULT_DISCOVERY_GOLDEN_PATH);
  const corpus = loadFixtureCorpus();
  const queries = readQueriesFile(DEFAULT_QUERIES_PATH);
  if (!queries) throw new Error('Keine Query-Vektoren — erst eval:discovery:build.');
  const byCase = new Map(queries.queries.map(q => [q.caseId, q]));

  const zeilen: string[] = [];
  const sag = (s = '') => { console.log(s); zeilen.push(s); };
  const ursachen = new Map<Ursache, number>();
  const jeFamilie = new Map<string, Map<Ursache, number>>();
  let verluste = 0;

  sag('# THE-672 — Todesursachen-Diagnose: wo die verlorenen Gold-Familien sterben');
  sag('');
  sag('> Erzeugt von `the672-todesursachen.ts` (read-only, offline gegen die eingefrorene Fixture). Nicht von Hand pflegen.');
  sag('');
  sag(`Parameter wie prod: topK ${TOP_K} · Schwelle ${THRESHOLD} · Deckel ${MAX_JUDGE}. Fixture: ${corpus.paragraphs.length} Absätze.`);
  sag('');
  sag('| Fall | verlorene Familie | max | mean | Score | Rang | **Ursache** |');
  sag('|---|---|---|---|---|---|---|');

  for (const c of golden.cases) {
    const q = byCase.get(c.caseId);
    if (!q?.baselineVector) continue;
    const hits = topKByCosine(q.baselineVector, corpus.paragraphs, TOP_K);
    const alle = aggregateHitsToCandidates(hits);
    const gated = gateCandidatesForJudge(alle, THRESHOLD, MAX_JUDGE);
    const gatedFam = new Set(gated.map(x => x.family));

    for (const gold of c.goldFamilies) {
      if (gatedFam.has(gold)) continue; // überlebt
      verluste++;
      const cand = alle.find(x => x.family === gold);
      if (!cand) { sag(`| ${c.caseId} | ${gold} | — | — | — | — | nicht in Roh-Treffern (echter Retrieval-Miss) |`); continue; }
      const rang = alle.indexOf(cand) + 1;
      const scores = cand.topHits.map(h => h.score);
      const max = Math.max(...scores);
      // mean über topHits ist gekappt — für die Diagnose reicht der Kandidaten-Score,
      // max kommt aus topHits (unverfälscht, da sortiert).
      const mean = (cand.score - 0.7 * Math.min(1, Math.max(0, max))) / 0.3;
      let ursache: Ursache;
      if (max < THRESHOLD) ursache = 'schwelle-max';
      else if (cand.score < THRESHOLD) ursache = 'mean-verwaesserung';
      else ursache = 'deckel';
      ursachen.set(ursache, (ursachen.get(ursache) ?? 0) + 1);
      const fm = jeFamilie.get(gold) ?? new Map<Ursache, number>();
      fm.set(ursache, (fm.get(ursache) ?? 0) + 1);
      jeFamilie.set(gold, fm);
      sag(`| ${c.caseId} | **${gold}** | ${max.toFixed(3)} | ${mean.toFixed(3)} | ${cand.score.toFixed(3)} | ${rang}/${alle.length} | **${ursache}** |`);
    }
  }

  sag('');
  sag('## Bilanz');
  sag('');
  sag(`Verluste gesamt: **${verluste}**`);
  for (const [u, n] of [...ursachen.entries()].sort((a, b) => b[1] - a[1])) sag(`- **${u}**: ${n}`);
  sag('');
  sag('## Je Familie');
  sag('');
  for (const [fam, m] of [...jeFamilie.entries()].sort((a, b) => [...b[1].values()].reduce((x, y) => x + y, 0) - [...a[1].values()].reduce((x, y) => x + y, 0))) {
    sag(`- **${fam}**: ${[...m.entries()].map(([u, n]) => `${u} ×${n}`).join(' · ')}`);
  }
  sag('');
  sag('## Ehrlichkeits-Vermerk');
  sag('');
  sag(`Die Fixture ist ein 35-Absatz-Miniatur-Korpus — die Diagnose gilt für die MECHANIK (Aggregation/Gate), nicht für Realwelt-Retrieval-Qualität. Bei topK ≥ Korpusgröße ist der Any-Hit-Recall konstruktionsbedingt 100 %; ein echter Retrieval-Miss kann hier gar nicht auftreten. Bevor ein Exit-Tor auf dieser Fixture gemessen wird, gelten die Härtungs-Regeln der Endspiel-Strategie (Held-out je Familie: beide Sprachfassungen + Erwägungsgründe raus, Leakage-Audit, korpusfremder Messpunkt).`);

  const out = path.join(__dirname, '../../../../docs/evals/the672-todesursachen.md');
  fs.writeFileSync(out, zeilen.join('\n') + '\n');
  console.log(`\n→ ${out}`);
}
main().catch(e => { console.error(e); process.exit(1); });
