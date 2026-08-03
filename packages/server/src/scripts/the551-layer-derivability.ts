/**
 * the551-layer-derivability — die Messung zum Entscheidungs-Ticket THE-551.
 *
 *   npm run the551:layers -- --out ../../docs/evals/the551-layer-derivability.md
 *
 * ── DIE FRAGE ──
 *
 * Trägt jede kanonische Handlung eine ableitbare Ziel-Architekturebene?
 * Formgleiche Warnung: THE-547 — dort gelang die Extraktion tadellos und die
 * abgeleitete Achse machte das Ergebnis trotzdem schlechter. Deshalb wird hier
 * GEMESSEN, nicht gebaut.
 *
 * Drei Messungen, Schwellen standen VOR der Zahl (im Ticket):
 *   1. κ-Doppelkodierung der 26 Handlungen (Kodierer A = eingecheckte Tabelle,
 *      Kodierer B = LLM mit Rubrik, OHNE Sicht auf A).
 *   2. Positiv-Kontrolle ≥ 70 %: sagt die abgeleitete Ebenen-Menge den Layer
 *      der menschlich adjudizierten Gold-Mappings voraus? Kette wie in der
 *      Produktion: Klauseltext → classifyObligation → Handlung → Menge.
 *   3. Negativ-Kontrollen: benannte Paare, die trennen MÜSSEN; Konzentrations-
 *      und Mengengrößen-Guard gegen triviale Treffer.
 *
 * Datenquelle: die adjudizierten Golden-Mappings im Repo (mapping.v2 +
 * mapping.req-self-v1) — Begründung im Pre-Flight-Kommentar am Ticket.
 *
 * Linear: THE-551
 */
import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { NORM_ONTOLOGY } from '@thearchitect/shared';
import { classifyObligation } from '../services/obligationAction.service';
import { relationKappa, relationConfusion } from '../evals/actionMetrics';
import {
  CODER_A_TABLE,
  LAYER_CODER_SYSTEM,
  buildLayerCoderPrompt,
  parseLayerCoding,
  derivedLayerSet,
  layerHit,
  primaryConcentration,
  meanSetSize,
  type LayerCoding,
} from '../evals/layerDerivability';

const GOLDEN_FILES = [
  'src/evals/golden/mapping.v2.json',
  'src/evals/golden/mapping.req-self-v1.json',
];

/** Paare, die auf VERSCHIEDENEN Ebenen landen müssen (Negativ-Kontrolle).
 * Die Beispiel-Ids aus dem Ticket (`rolle-benennen`, `zugriff-protokollieren`)
 * existieren im Katalog nicht — ersetzt durch reale Paare gleicher Absicht. */
const MUST_SEPARATE: Array<[string, string]> = [
  ['betroffene-informieren', 'verschluesselung-pseudonymisierung'],
  ['verzeichnis-fuehren', 'zugriffskontrolle'],
  ['einwilligung-verwalten', 'revision-ueberwachung'],
];

interface GoldenCase {
  caseId: string;
  source: string;
  paragraphNumber: string;
  title: string;
  fullText: string;
  goldElementIds: string[];
  candidates: Array<{ id: string; name: string; type?: string; layer?: string }>;
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const outIdx = argv.indexOf('--out');
  const outPath = outIdx !== -1 ? path.resolve(argv[outIdx + 1]) : undefined;

  const { createRaterClient, resolveRaterConfig, withEmptyResponseRetry } = await import('../evals/raterClient');
  const client = withEmptyResponseRetry(createRaterClient(resolveRaterConfig(argv)));
  const ask = async (system: string, user: string): Promise<string> =>
    (await client.complete({ system, user, maxTokens: 200 })).text;

  // ── 1. κ-Doppelkodierung ────────────────────────────────────────────────
  const actions = NORM_ONTOLOGY.canonicalActions;
  const aByAction = new Map(CODER_A_TABLE.map((r) => [r.actionId, r]));
  const bByAction = new Map<string, LayerCoding | null>();
  for (const a of actions) {
    const raw = await ask(LAYER_CODER_SYSTEM, buildLayerCoderPrompt(a));
    bByAction.set(a.id, parseLayerCoding(raw));
    process.stdout.write(`\r[the551] Kodierer B ${bByAction.size}/${actions.length}   `);
  }
  const unparseableB = [...bByAction.values()].filter((v) => v === null).length;
  const pairIds = actions.map((a) => a.id).filter((id) => bByAction.get(id) != null);
  const aPrim = pairIds.map((id) => aByAction.get(id)!.primary as string);
  const bPrim = pairIds.map((id) => bByAction.get(id)!.primary as string);
  const kappa = relationKappa(aPrim, bPrim);
  const rawAgree = pairIds.filter((id, i) => aPrim[i] === bPrim[i]).length;
  const disagreements = pairIds
    .filter((_, i) => aPrim[i] !== bPrim[i])
    .map((id) => {
      const i = pairIds.indexOf(id);
      return `${id}: A=${aPrim[i]} · B=${bPrim[i]}`;
    });

  // ── 2. Positiv-Kontrolle gegen die adjudizierten Gold-Mappings ─────────
  interface PairResult {
    caseId: string;
    actionId: string | null;
    unparseable: boolean;
    goldId: string;
    goldLayer: string | null;
    hit: boolean | null; // null = Kette lieferte keine Handlung/Ebene
  }
  const pairResults: PairResult[] = [];
  for (const rel of GOLDEN_FILES) {
    const cases: GoldenCase[] = JSON.parse(fs.readFileSync(path.resolve(rel), 'utf8')).cases;
    for (const c of cases) {
      const assignment = await classifyObligation(
        { law: c.source, para: c.paragraphNumber, title: c.title, text: c.fullText },
        ask,
      );
      const row = assignment.actionId ? aByAction.get(assignment.actionId) : undefined;
      const set = row ? derivedLayerSet(row) : null;
      const candById = new Map(c.candidates.map((x) => [x.id, x]));
      for (const goldId of c.goldElementIds) {
        const goldLayer = candById.get(goldId)?.layer ?? null;
        pairResults.push({
          caseId: c.caseId,
          actionId: assignment.actionId,
          unparseable: assignment.unparseable,
          goldId,
          goldLayer,
          hit: set && goldLayer ? layerHit(goldLayer, set) : null,
        });
      }
      process.stdout.write(`\r[the551] Gold-Fälle ${pairResults.length} Paare   `);
    }
  }
  const evaluable = pairResults.filter((p) => p.hit !== null);
  const hits = evaluable.filter((p) => p.hit).length;
  const chainGaps = pairResults.length - evaluable.length;
  const hitRateChain = pairResults.length ? hits / pairResults.length : 0;
  const hitRateAssigned = evaluable.length ? hits / evaluable.length : 0;

  // ── 3. Negativ-Kontrollen / Guards ──────────────────────────────────────
  const separations = MUST_SEPARATE.map(([x, y]) => {
    const sx = derivedLayerSet(aByAction.get(x)!);
    const sy = derivedLayerSet(aByAction.get(y)!);
    const separates = aByAction.get(x)!.primary !== aByAction.get(y)!.primary;
    return { pair: `${x} ↔ ${y}`, primaries: `${aByAction.get(x)!.primary} vs ${aByAction.get(y)!.primary}`, separates, overlap: [...sx].filter((l) => sy.has(l)) };
  });
  const concentration = primaryConcentration(CODER_A_TABLE);
  const setSize = meanSetSize(CODER_A_TABLE);
  const layerDist = new Map<string, number>();
  for (const r of CODER_A_TABLE) layerDist.set(r.primary, (layerDist.get(r.primary) ?? 0) + 1);

  // ── Verdikt gegen die VORAB-Schwellen ───────────────────────────────────
  const passPositive = hitRateChain >= 0.7;
  const passSeparation = separations.every((s) => s.separates);
  const passKappa = kappa !== null && kappa >= 0.6;
  const verdictLines = [
    `Positiv-Kontrolle (Kette, ≥70 %): ${(hitRateChain * 100).toFixed(1)} % → ${passPositive ? '✅' : '❌'}`,
    `Trenn-Paare: ${separations.filter((s) => s.separates).length}/${separations.length} → ${passSeparation ? '✅' : '❌'}`,
    `κ (primär): ${kappa === null ? 'nicht berechenbar (Konstanz-Guard)' : kappa.toFixed(3)} → ${passKappa ? '✅' : '❌'}`,
  ];
  const verdict = passPositive && passSeparation && passKappa ? 'trägt' : 'trägt nicht';

  const md = `# THE-551 — Ist die Ziel-Architekturebene aus der Handlung ableitbar?

**Verdikt: ${verdict === 'trägt' ? '✅ trägt' : '❌ trägt nicht'}**

${verdictLines.map((l) => `- ${l}`).join('\n')}

## 1. κ-Doppelkodierung (26 Handlungen, primäre Ebene)

| Größe | Wert |
| --- | --- |
| Rohübereinstimmung | ${rawAgree}/${pairIds.length} |
| Cohen's κ (n-kategorial) | ${kappa === null ? 'null (Konstanz-Guard)' : kappa.toFixed(3)} |
| unlesbare B-Kodierungen | ${unparseableB} |

${disagreements.length ? `Dissense:\n${disagreements.map((d) => `- ${d}`).join('\n')}` : 'Keine Dissense.'}

Konfusion (A|B): ${JSON.stringify(relationConfusion(aPrim, bPrim))}

## 2. Positiv-Kontrolle — adjudizierte Gold-Mappings

| Größe | Wert |
| --- | --- |
| (Fall × Gold-Element)-Paare | ${pairResults.length} |
| davon Kette ohne Handlung/Ebene | ${chainGaps} |
| Treffer | ${hits} |
| **Trefferquote über die ganze Kette** | **${(hitRateChain * 100).toFixed(1)} % (Schwelle 70 %)** |
| Trefferquote nur zugeordnete Paare | ${(hitRateAssigned * 100).toFixed(1)} % |

Die Ketten-Quote ist die ehrliche Zahl: eine Handlung, die der Klassifikator
nicht vergibt, kann keine Ebene voraussagen — das ist ein Miss der KETTE,
kein Rundungsdetail.

## 3. Negativ-Kontrollen

${separations.map((s) => `- ${s.pair}: ${s.primaries} → ${s.separates ? '✅ getrennt' : '❌ NICHT getrennt'}${s.overlap.length ? ` (Mengen-Überlapp: ${s.overlap.join(', ')})` : ''}`).join('\n')}

Guards: häufigste primäre Ebene ${(concentration * 100).toFixed(0)} % · mittlere Mengengröße ${setSize.toFixed(2)}
Verteilung primär: ${[...layerDist.entries()].map(([l, n]) => `${l} ${n}`).join(' · ')}

## Grenzen

- Prüfstoff sind die 27 adjudizierten Golden-Fälle im Repo, nicht der volle
  Prod-Mapping-Bestand (Begründung: Pre-Flight-Kommentar am Ticket). Gleiches
  Skript läuft unverändert gegen einen DB-Export.
- Kodierer B ist ein LLM mit derselben Rubrik — das misst die Stabilität der
  Rubrik, nicht menschliche Übereinstimmung. Ein menschlicher Zweitkodierer
  bleibt der stärkere Test.
- Die Ticket-Beispiel-Ids der Trenn-Paare existieren im Katalog nicht; ersetzt
  durch reale Paare gleicher Absicht (im Skript benannt).
- Ein negatives Verdikt ist ein gültiges Ergebnis.
`;

  console.log(`\n${md}`);
  if (outPath) {
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, md);
    fs.writeFileSync(outPath.replace(/\.md$/, '.json'), JSON.stringify({
      kappa, rawAgree, pairCount: pairIds.length, unparseableB, disagreements,
      pairResults, hitRateChain, hitRateAssigned, chainGaps, separations,
      concentration, setSize, verdict,
      coderB: Object.fromEntries(bByAction),
    }, null, 2) + '\n');
    console.log(`\n[the551] → ${outPath}`);
  }
}

if (require.main === module) {
  void main();
}
