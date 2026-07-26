/**
 * interprets-parser-eval — Verdrahtungs-Beweis für den mechanischen
 * INTERPRETS-Detektor (THE-529, Task 5).
 *
 * Fährt je Golden-Fall den Detektor GENAU wie der Crawler-Batch
 * (`relationsBatch.ts detectMechanicalInterprets`): shared
 * `selectBorrowSentence` über den satz-segmentierten Volltext der zitierenden
 * Seite, `pairTargetArticle` = normalisierte Ziel-Artikelnummer,
 * `targetLawIdents` = `identsForSource(ziel.source)`, `targetProvisionKind`
 * aus dem Pool-Doc (die Prod-P2-Quelle, Task 3), `targetFullText` als
 * P2-Fallback. Beide Richtungen des Paars werden probiert wie im
 * Server-Generator (build-interprets-audit.ts: erst Seite a als zitierend,
 * dann b; bester Treffer nach INTERPRETS_VERDICT_RANK) — der Golden-Fall weiß
 * nicht, welche Seite zitiert.
 *
 * MIT der Überschrift-P2-Quelle (`isDefinitionTitle`): seit der THE-529-Härtung
 * ist sie die dritte P2-Quelle IM geteilten Detektor (`auditInterpretsCandidate`),
 * und der Prod-Batch (`relationsBatch.ts`) reicht `targetTitle` genauso durch.
 * Dieser Lauf misst also exakt denselben P2-Pfad wie Prod (typisiert >
 * Überschrift > fullText-Fallback) — die Überschrift wird aus dem Pool-Doc-Titel
 * gespeist.
 *
 * Zählung gegen die v5-Wahrheiten:
 *   tp — Golden INTERPRETS ∧ Detektor interprets ∧ Richtung gleich
 *   fp — Golden ≠ INTERPRETS ∧ Detektor interprets
 *   fn — Golden INTERPRETS ∧ Detektor nicht
 *   Richtungs-Mismatch (Golden INTERPRETS, Detektor interprets, Richtung
 *   verschieden) — zählt als 1 fn UND 1 fp und wird SEPARAT als
 *   `directionMismatchCases` ausgewiesen.
 *
 * EHRLICHKEITS-KLAUSEL (steht wörtlich im Report): Der Detektor ist die Quelle
 * der v5-Wahrheiten — dieser Lauf beweist die Verdrahtung Ende-zu-Ende, nicht
 * die Wahrheit. Die Wahrheits-Validierung ist die Architekten-Adjudikation
 * 2026-07-26 + der Kimi-K3-Fremd-Check (92,6 %).
 *
 *   npm run relations:parser-eval -- --pool /tmp/relations-pool.json
 *   npm run relations:parser-eval -- --golden src/evals/golden/relations.v5.json --pool …
 *
 * Linear: THE-529 (Task 5) · Golden: relations.v5 (188 Fälle, 16 INTERPRETS)
 */
import fs from 'node:fs';
import path from 'node:path';
import {
  INTERPRETS_VERDICT_RANK,
  identsForSource,
  normalizeArticleNumber,
  selectBorrowSentence,
  type BorrowSentenceHit,
  type Direction,
} from '@thearchitect/shared';
import { loadRelationsGolden, type RelationsGoldenCase } from '../evals/relationsGolden';

// ─── Pool ───────────────────────────────────────────────────────────

/** Ziel-Seiten-Wissen aus dem Korpus-Pool — die Prod-Quellen für P2 + Fallback. */
export interface ParserEvalPoolDoc {
  title?: string;
  fullText: string;
  provisionKind?: string;
}

/** Roh-Doc im --pool-Export (THE-517-Format + Task-0-`provisionKind`). */
interface RawPoolDoc {
  source: string;
  paragraphNumber: string;
  title?: string;
  fullText: string;
  language?: string;
  provisionKind?: string;
}

/**
 * Schlüssel eines Pool-Docs: Quelle + NORMALISIERTE Artikelnummer — dieselbe
 * Normalisierung, mit der der Kandidaten-Miner Ziele auflöst. „Art. 4",
 * „Artikel 4" und „art-4" sind derselbe Schlüssel.
 */
export function poolKey(source: string, paragraphNumber: string): string {
  const article = normalizeArticleNumber(paragraphNumber);
  return `${source}::${article ?? paragraphNumber.trim().toLowerCase()}`;
}

/**
 * Indiziert die Pool-Docs. Bei Schlüssel-Duplikaten gewinnt der erste Eintrag;
 * ein späteres Doc MIT `provisionKind` ergänzt einen typ-losen ersten Treffer
 * (die P2-Quelle darf nicht an der Doc-Reihenfolge hängen).
 */
export function indexPool(docs: RawPoolDoc[]): Map<string, ParserEvalPoolDoc> {
  const byKey = new Map<string, ParserEvalPoolDoc>();
  for (const d of docs) {
    if (!d?.source || !d?.paragraphNumber || typeof d.fullText !== 'string') continue;
    const key = poolKey(d.source, d.paragraphNumber);
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, { title: d.title, fullText: d.fullText, provisionKind: d.provisionKind });
    } else if (!existing.provisionKind && d.provisionKind) {
      existing.provisionKind = d.provisionKind;
    }
  }
  return byKey;
}

// ─── Eval-Kern (rein — kein Netz, keine Datei) ──────────────────────

export interface ParserEvalResult {
  tp: number;
  fp: number;
  fn: number;
  precision: number;
  recall: number;
  tpCases: string[];
  fpCases: string[];
  fnCases: string[];
  /** Golden INTERPRETS ∧ Detektor interprets ∧ Richtung verschieden — steht
   *  ZUSÄTZLICH in fpCases UND fnCases (Zähler == Listenlängen). */
  directionMismatchCases: string[];
}

type GoldenSide = RelationsGoldenCase['a'];

/**
 * Eine Richtung des Paars durch den Detektor — exakt der Prod-Pfad
 * (`detectMechanicalInterprets`), nur dass Ziel-provisionKind/-Volltext aus
 * dem Pool kommen statt vom Kandidaten-Dokument.
 */
function tryDirection(
  citing: GoldenSide,
  target: GoldenSide,
  citingSide: 'a' | 'b',
  poolBySourceKey: Map<string, ParserEvalPoolDoc>
): BorrowSentenceHit | undefined {
  const pairTargetArticle = normalizeArticleNumber(target.paragraphNumber);
  if (pairTargetArticle === undefined) return undefined;
  const idents = identsForSource(target.source);
  if (idents.length === 0) return undefined;
  const poolDoc = poolBySourceKey.get(poolKey(target.source, target.paragraphNumber));
  return selectBorrowSentence({
    citingSide,
    fullText: citing.fullText,
    pairTargetArticle,
    targetLawIdents: idents,
    targetProvisionKind: poolDoc?.provisionKind, // P2-Quelle 1 (typisiert)
    targetTitle: poolDoc?.title, // P2-Quelle 2 (Überschrift) — wie im Prod-Batch
    targetFullText: poolDoc?.fullText ?? target.fullText, // P2-Quelle 3 (Fallback)
  });
}

/** Detektor-Vorhersage für einen Golden-Fall — `undefined` = kein INTERPRETS. */
export function predictInterprets(
  c: RelationsGoldenCase,
  poolBySourceKey: Map<string, ParserEvalPoolDoc>
): { direction: Direction; sentence: string } | undefined {
  // Beide Richtungen wie im Server-Generator: erst a als zitierend, dann b;
  // bester Treffer nach Verdikt-Rang (bei Gleichstand gewinnt Seite a —
  // dieselbe reduce-Semantik wie deriveCaseAudit).
  const hits = [
    tryDirection(c.a, c.b, 'a', poolBySourceKey),
    tryDirection(c.b, c.a, 'b', poolBySourceKey),
  ].filter((h): h is BorrowSentenceHit => h !== undefined);
  if (hits.length === 0) return undefined;
  const best = hits.reduce((x, y) => (INTERPRETS_VERDICT_RANK[y.verdict] > INTERPRETS_VERDICT_RANK[x.verdict] ? y : x));
  if (best.verdict !== 'interprets' || !best.direction) return undefined;
  return { direction: best.direction, sentence: best.sentence };
}

function ratio(num: number, den: number): number {
  return den > 0 ? num / den : 0;
}

/** Die reine Kernfunktion — Golden-Fälle + Pool-Index rein, Zählung raus. */
export function evalInterpretsParser(
  cases: RelationsGoldenCase[],
  poolBySourceKey: Map<string, ParserEvalPoolDoc>
): ParserEvalResult {
  const tpCases: string[] = [];
  const fpCases: string[] = [];
  const fnCases: string[] = [];
  const directionMismatchCases: string[] = [];

  for (const c of cases) {
    const goldenInterprets = c.relation === 'INTERPRETS';
    const predicted = predictInterprets(c, poolBySourceKey);

    if (predicted === undefined) {
      if (goldenInterprets) fnCases.push(c.caseId);
      continue; // kein Verdikt auf Nicht-INTERPRETS-Wahrheit = korrekt still
    }
    if (!goldenInterprets) {
      fpCases.push(c.caseId);
      continue;
    }
    if (predicted.direction === c.direction) {
      tpCases.push(c.caseId);
    } else {
      // Richtungs-Mismatch: 1 fn + 1 fp, separat ausgewiesen — NICHT tp.
      fnCases.push(c.caseId);
      fpCases.push(c.caseId);
      directionMismatchCases.push(c.caseId);
    }
  }

  const tp = tpCases.length;
  const fp = fpCases.length;
  const fn = fnCases.length;
  return {
    tp,
    fp,
    fn,
    precision: ratio(tp, tp + fp),
    recall: ratio(tp, tp + fn),
    tpCases,
    fpCases,
    fnCases,
    directionMismatchCases,
  };
}

// ─── Report ─────────────────────────────────────────────────────────

/** Wörtlich im Report — der Lauf beweist Verdrahtung, nicht Wahrheit. */
export const PARSER_EVAL_HONESTY_NOTE =
  'Der Detektor ist die Quelle der v5-Wahrheiten — dieser Lauf beweist die Verdrahtung ' +
  'Ende-zu-Ende, nicht die Wahrheit. Wahrheits-Validierung: Architekten-Adjudikation ' +
  '2026-07-26 + Kimi-K3-Fremd-Check (92,6 %).';

export function formatParserEvalReport(
  r: ParserEvalResult,
  meta: { goldenVersion: string; totalCases: number; interpretsCases: number }
): string {
  const pct = (v: number): string => `${(v * 100).toFixed(1)}%`;
  const list = (ids: string[]): string => (ids.length > 0 ? ids.join(', ') : '—');
  const L: string[] = [];
  L.push('═══ THE-529 INTERPRETS-Parser-Eval ═══');
  L.push(`Golden: ${meta.goldenVersion} · ${meta.totalCases} Fälle · davon INTERPRETS-Wahrheiten: ${meta.interpretsCases}`);
  L.push('');
  L.push(`tp=${r.tp}  fp=${r.fp}  fn=${r.fn}`);
  L.push(`Precision=${pct(r.precision)}  Recall=${pct(r.recall)}`);
  L.push('');
  L.push(`tp-Fälle (${r.tpCases.length}): ${list(r.tpCases)}`);
  L.push(`fp-Fälle (${r.fpCases.length}): ${list(r.fpCases)}`);
  L.push(`fn-Fälle (${r.fnCases.length}): ${list(r.fnCases)}`);
  L.push(
    `Richtungs-Mismatches (${r.directionMismatchCases.length}, zählen je 1 fn + 1 fp): ` +
      list(r.directionMismatchCases)
  );
  L.push('');
  L.push(PARSER_EVAL_HONESTY_NOTE);
  return L.join('\n');
}

// ─── CLI ────────────────────────────────────────────────────────────

const DEFAULT_GOLDEN = path.join(__dirname, '..', 'evals', 'golden', 'relations.v5.json');

function main(): void {
  const argv = process.argv.slice(2);
  const arg = (flag: string): string | undefined => {
    const i = argv.indexOf(flag);
    const v = i !== -1 ? argv[i + 1] : undefined;
    return v && !v.startsWith('--') ? v : undefined;
  };

  const goldenPath = path.resolve(arg('--golden') ?? DEFAULT_GOLDEN);
  const poolArg = arg('--pool');
  if (!poolArg) {
    // Ohne Pool fehlt die Prod-P2-Quelle (provisionKind) — der Lauf würde
    // etwas anderes messen als den Batch-Pfad. Pflicht-Flag, kein Default.
    throw new Error('--pool <relations-pool.json> ist Pflicht (Prod-P2-Quelle: provisionKind je Ziel-Provision)');
  }
  const poolPath = path.resolve(poolArg);

  const golden = loadRelationsGolden(goldenPath);
  const rawPool = JSON.parse(fs.readFileSync(poolPath, 'utf8'));
  if (!Array.isArray(rawPool)) throw new Error(`--pool: ${poolPath} enthält kein Array`);
  const poolBySourceKey = indexPool(rawPool as RawPoolDoc[]);
  console.log(`[parser-eval] Golden ${golden.version} (${golden.cases.length} Fälle) · Pool ${rawPool.length} Docs → ${poolBySourceKey.size} Schlüssel`);

  const result = evalInterpretsParser(golden.cases, poolBySourceKey);
  const interpretsCases = golden.cases.filter((c) => c.relation === 'INTERPRETS').length;
  console.log('');
  console.log(
    formatParserEvalReport(result, {
      goldenVersion: golden.version,
      totalCases: golden.cases.length,
      interpretsCases,
    })
  );
}

if (require.main === module) {
  try {
    main();
  } catch (err) {
    console.error('[parser-eval] FAILED:', err instanceof Error ? err.message : err);
    process.exit(1);
  }
}
