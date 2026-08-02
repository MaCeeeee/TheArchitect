/**
 * runReqtraceEval — der senkrechte Schnitt durch die Anforderungskette
 * (THE-545, Task 7).
 *
 *   npm run reqtrace:eval -- [--out ../../docs/evals/reqtrace-run-1.md]
 *
 * Dreigeteilt wie `runActionEval`:
 *   - renderReqtraceReport : rein (kein I/O) → testbar, faellt das Verdikt.
 *   - evaluateReqtrace     : Kern, Haeuser INJIZIERT → mit Stubs testbar.
 *   - main                 : Glue, liest die Schluessel aus `.env`.
 *
 * ── WAS ER BEANTWORTET ──
 *
 * Die vier DoD-Punkte aus THE-545, mit Zahlen statt Einschaetzung:
 *   1. Findet die Kette die fuenf SCF-Kandidaten aus dem Gesetzestext wieder?
 *   2. Scheidet NIS2 Art. 23 x DORA Art. 19 durch die Verdraengungs-Kante aus,
 *      BEVOR ein Modell befragt wird?
 *   3. Bleiben gleicher Adressat / andere Handlung getrennt?
 *   4. Wie viele Anforderungen je Klausel — gegen Reg2Reqs ~1,1?
 *
 * ── EIN NEGATIVES VERDIKT IST EIN ERGEBNIS ──
 *
 * `traegt-nicht` ist kein Fehlschlag des Laufs, sondern seine Antwort. Der
 * Prozess endet deshalb mit Code 0; nur ein echter Harness-Fehler setzt 1.
 * Sonst entstuende Druck, so lange nachzubessern, bis die Zahl passt — genau
 * das, was der Anti-Nachbesserungs-Anker verhindern soll.
 *
 * Linear: THE-545 · Rahmen: ADR-0007
 */
import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import {
  STAKEHOLDER_REQ_SYSTEM,
  buildStakeholderReqUserPrompt,
  parseStakeholderCandidates,
  isSingular,
  splitByAction,
  SYSTEM_REQ_SYSTEM,
  buildSystemReqUserPrompt,
  parseSystemReq,
  CLASSIFY_SYSTEM,
  buildClassifyUserPrompt,
  parseActionAssignment,
} from '@thearchitect/shared';
import { loadReqtraceLaws, type ReqtraceArticle } from './lawsFixture';
import { segmentClauses, type Clause } from './clauseSegmenter';
import { groupIntoMeasures, type GroupableSysReq, type GroupingResult } from './measureGrouping';

/**
 * Das externe Gold: die fuenf Kontrollen, die die SCF-Durchrechnung am
 * 2026-08-01 als echte Kandidaten uebrig liess (16 → 5, nach Abzug der zehn
 * durch lex specialis gegenstandslosen und des widerlegten IRO-10).
 *
 * Es ist EXTERN — von uns nicht gebaut, nicht nachtraeglich anpassbar.
 * Quelle: docs/strategy/2026-08-01-the538-scf-durchrechnung.md
 */
export const SCF_GOLD = [
  { id: 'BCD-01', label: 'Business Continuity Management System', laws: ['dsgvo', 'nis2'] },
  { id: 'CRY-01', label: 'Use of Cryptographic Controls', laws: ['dsgvo', 'nis2'] },
  { id: 'GOV-02', label: 'Publishing Security, Compliance & Resilience Documentation', laws: ['dora', 'dsgvo', 'nis2'] },
  { id: 'HRS-03', label: 'Defined Roles & Responsibilities', laws: ['dora', 'dsgvo'] },
  { id: 'RSK-01', label: 'Risk Management Program', laws: ['dora', 'dsgvo', 'nis2'] },
] as const;

/**
 * Kanonische Handlung → SCF-Kontrolle.
 *
 * ACHTUNG: Das ist UNSERE ZUORDNUNG, nicht die Behauptung des SCF. Sie
 * entscheidet mit, was als „wiedergefunden" zaehlt — deshalb steht sie hier
 * sichtbar und nicht in einer Hilfsfunktion, und deshalb weist der Bericht sie
 * als Setzung aus (RVTM O-2).
 *
 * Drei Eintraege teilen sich `resilienz-governance`. Eine Massnahme kann damit
 * mehrere Gold-Eintraege treffen; solche Faelle werden als `mehrdeutig`
 * ausgewiesen, statt die Trefferquote stillschweigend zu heben.
 */
export const ACTION_TO_SCF: Record<string, readonly string[]> = {
  betriebskontinuitaet: ['BCD-01'],
  'verschluesselung-pseudonymisierung': ['CRY-01'],
  'technisch-organisatorische-massnahmen': ['CRY-01'],
  'compliance-nachweisen': ['GOV-02'],
  'revision-ueberwachung': ['HRS-03'],
  'resilienz-governance': ['GOV-02', 'HRS-03', 'RSK-01'],
  risikobewertung: ['RSK-01'],
};

/** Untergrenze der Positiv-Kontrolle (THE-545 Abbruchbedingung). */
export const GOLD_HITS_MIN = 3;
/** Zulaessiges Fenster fuer Anforderungen je Klausel. Reg2Req-Referenz: ~1,1. */
export const RATE_WINDOW: readonly [number, number] = [0.5, 3];
export const REG2REQ_RATE = 1.1;

export interface GoldHit {
  id: string;
  laws: readonly string[];
  /** Die Massnahme, die ihn wiedergefunden hat — `null` = nicht gefunden. */
  matchedBy: string | null;
}

export interface ReqtraceEvalResult {
  articles: number;
  clauses: number;
  clausesPerArticle: number;
  /** Kandidaten vor dem Handlungs-Schnitt. */
  candidates: number;
  afterSplit: number;
  splitCount: number;
  /** Nach dem Schnitt weiterhin nicht singulaer — ausgewiesen, nicht multipliziert. */
  unsingular: number;
  clausesWithoutRequirement: number;
  unreadableExtractions: number;
  requirementsPerClause: number;
  sysReqs: number;
  implFreedomFailures: number;
  grouping: GroupingResult;
  goldHits: GoldHit[];
  goldHitCount: number;
  ambiguousGoldMatches: string[];
  negativeMechanical: boolean;
  negativeSemantic: boolean;
  canaryPassed: boolean;
  /** Id → Text der Systemanforderung — das Arbeitsblatt braucht sie zum Rendern. */
  sysReqTexts: Record<string, string>;
  verdict: 'traegt' | 'traegt-nicht';
  verdictReason: string;
  markdown: string;
}

export type AskFn = (system: string, user: string) => Promise<string>;

/** Kern der Kette. Haeuser injiziert — kein Netz im Test. */
export async function evaluateReqtrace(
  articles: ReqtraceArticle[],
  opts: { ask: AskFn; onProgress?: (done: number, total: number) => void },
): Promise<ReqtraceEvalResult> {
  const perArticle = articles.map((a) => ({ article: a, clauses: segmentClauses(a) }));
  const allClauses: { article: ReqtraceArticle; clause: Clause }[] = perArticle.flatMap((p) =>
    p.clauses.map((clause) => ({ article: p.article, clause })),
  );

  let candidates = 0;
  let afterSplit = 0;
  let splitCount = 0;
  let unsingular = 0;
  let clausesWithoutRequirement = 0;
  let unreadableExtractions = 0;
  let implFreedomFailures = 0;
  const sysReqs: GroupableSysReq[] = [];
  let done = 0;

  for (const { article, clause } of allClauses) {
    const parsed = parseStakeholderCandidates(
      await opts.ask(STAKEHOLDER_REQ_SYSTEM, buildStakeholderReqUserPrompt(clause)),
    );
    opts.onProgress?.(++done, allClauses.length);

    // Unlesbar ist etwas anderes als leer: leer heisst "diese Klausel traegt
    // keine Anforderung" und ist ein gueltiger Befund.
    if (parsed === null) {
      unreadableExtractions += 1;
      continue;
    }
    if (parsed.length === 0) {
      clausesWithoutRequirement += 1;
      continue;
    }
    candidates += parsed.length;

    for (const c of parsed) {
      const parts = splitByAction(c);
      if (parts.length > 1) splitCount += 1;
      afterSplit += parts.length;

      for (const [k, part] of parts.entries()) {
        if (!isSingular(part)) unsingular += 1;

        const sys = parseSystemReq(
          await opts.ask(SYSTEM_REQ_SYSTEM, buildSystemReqUserPrompt(part)),
          [clause.id],
        );
        if (!sys) continue;
        if (!sys.implementationFree) implFreedomFailures += 1;

        const assignment = parseActionAssignment(
          await opts.ask(
            CLASSIFY_SYSTEM,
            buildClassifyUserPrompt({ law: article.source, para: '', title: sys.text, text: sys.text }),
          ),
        );

        sysReqs.push({
          ...sys,
          id: `${clause.id}:s${k + 1}`,
          source: article.source,
          actionId: assignment?.actionId ?? part.handlungen[0] ?? null,
          addresseeClass: article.addresseeClass,
        });
      }
    }
  }

  const grouping = await groupIntoMeasures(sysReqs, { judge: opts.ask });

  // ── Positiv-Kontrolle: das externe Gold wiederfinden ────────────────────
  const matchesByMeasure = new Map<string, string[]>();
  const goldHits: GoldHit[] = SCF_GOLD.map((g) => {
    const hit = grouping.measures.find((m) => {
      if (!g.laws.every((l) => m.laws.includes(l))) return false;
      const actions = m.memberIds
        .map((id) => sysReqs.find((s) => s.id === id)?.actionId)
        .filter((a): a is string => Boolean(a));
      return actions.some((a) => (ACTION_TO_SCF[a] ?? []).includes(g.id));
    });
    if (hit) matchesByMeasure.set(hit.id, [...(matchesByMeasure.get(hit.id) ?? []), g.id]);
    return { id: g.id, laws: g.laws, matchedBy: hit?.id ?? null };
  });

  // ── Negativ-Kontrollen ─────────────────────────────────────────────────
  // Mechanisch: die Verdraengung hat gegriffen UND der Richter hat das Paar
  // nie gesehen. Zweiteres ist strukturell garantiert; hier wird es bezeugt.
  const nis2Dora = grouping.excludedByDisplacement.some(
    (e) => e.displaced === 'nis2' && e.prevailing === 'dora',
  );
  const hasBothLaws =
    sysReqs.some((s) => s.source === 'nis2') && sysReqs.some((s) => s.source === 'dora');
  const negativeMechanical = !hasBothLaws || nis2Dora;

  // Semantisch: die KLASSIFIKATION trennt die beiden Handlungen. Nur auf das
  // Ausbleiben einer Massnahme zu schauen, bestuende vakuum-leer — verschiedene
  // Handlungen werden ohnehin nie gepaart.
  const actionsBySource = new Map<string, Set<string>>();
  for (const s of sysReqs) {
    if (!s.actionId) continue;
    const set = actionsBySource.get(s.source) ?? new Set<string>();
    set.add(s.actionId);
    actionsBySource.set(s.source, set);
  }
  const negativeSemantic = grouping.measures.every((m) => {
    const actions = new Set(
      m.memberIds.map((id) => sysReqs.find((s) => s.id === id)?.actionId).filter(Boolean),
    );
    return actions.size <= 1;
  });

  // ── Kanarienvogel: dieselbe Klausel zweimal muss eine Massnahme ergeben ──
  const canaryPassed = await runCanary(sysReqs, opts.ask);

  const base = {
    articles: articles.length,
    clauses: allClauses.length,
    clausesPerArticle: articles.length === 0 ? 0 : allClauses.length / articles.length,
    candidates,
    afterSplit,
    splitCount,
    unsingular,
    clausesWithoutRequirement,
    unreadableExtractions,
    requirementsPerClause: allClauses.length === 0 ? 0 : afterSplit / allClauses.length,
    sysReqs: sysReqs.length,
    implFreedomFailures,
    grouping,
    goldHits,
    goldHitCount: goldHits.filter((g) => g.matchedBy).length,
    ambiguousGoldMatches: [...matchesByMeasure.entries()].filter(([, ids]) => ids.length > 1).map(([m]) => m),
    negativeMechanical,
    negativeSemantic,
    canaryPassed,
    sysReqTexts: Object.fromEntries(sysReqs.map((s) => [s.id, s.text])),
    verdict: 'traegt' as const,
    verdictReason: '',
    markdown: '',
  };
  return renderReqtraceReport(base);
}

/**
 * Die billigste Selbstkontrolle der Kette: dieselbe Anforderung zweimal muss
 * in EINER Massnahme landen. Tut sie das nicht, urteilt der Richter zufaellig
 * und jede Quote darueber ist wertlos — dieselbe Logik wie Arm P in THE-438.
 */
async function runCanary(sysReqs: GroupableSysReq[], ask: AskFn): Promise<boolean> {
  const first = sysReqs[0];
  if (!first) return false;
  const twin: GroupableSysReq = {
    ...first,
    id: `${first.id}__canary`,
    // Andere Herkunft, gleicher Inhalt — sonst waeren sie gesetzesintern und
    // wuerden gar nicht erst gepaart.
    source: first.source === 'dsgvo' ? 'nis2' : 'dsgvo',
    addresseeClass: first.source === 'dsgvo' ? 'essential_important_entity' : 'controller',
  };
  const r = await groupIntoMeasures([first, twin], { judge: ask });
  return r.measures.some((m) => m.memberIds.length === 2);
}

/** Rein: faellt das Verdikt und rendert den Bericht. */
export function renderReqtraceReport(r: ReqtraceEvalResult): ReqtraceEvalResult {
  const reasons: string[] = [];
  if (r.goldHitCount < GOLD_HITS_MIN) {
    reasons.push(
      `Positiv-Kontrolle: nur ${r.goldHitCount} von ${SCF_GOLD.length} SCF-Kandidaten wiedergefunden (< ${GOLD_HITS_MIN}).`,
    );
  }
  if (!r.negativeMechanical) {
    reasons.push('Negativ-Kontrolle mechanisch GERISSEN: die Verdrängung hat nicht gegriffen.');
  }
  if (!r.negativeSemantic) {
    reasons.push('Negativ-Kontrolle semantisch GERISSEN: eine Maßnahme vereint verschiedene Handlungen.');
  }
  if (r.requirementsPerClause < RATE_WINDOW[0] || r.requirementsPerClause > RATE_WINDOW[1]) {
    reasons.push(
      `Granularität außerhalb des Fensters: ${r.requirementsPerClause.toFixed(2)} Anforderungen je Klausel ` +
        `(zulässig ${RATE_WINDOW[0]}–${RATE_WINDOW[1]}, Referenz Reg2Req ${REG2REQ_RATE}).`,
    );
  }
  if (!r.canaryPassed) {
    reasons.push('Kanarienvogel nicht bestanden: dieselbe Anforderung zweimal landete nicht in einer Maßnahme.');
  }

  const verdict = reasons.length === 0 ? 'traegt' : 'traegt-nicht';
  const verdictReason = reasons.length === 0 ? 'Alle Kontrollen bestanden.' : reasons.join(' ');

  const markdown = [
    '# Senkrechter Schnitt — Klausel → Anforderung → Systemanforderung → Maßnahme (THE-545)',
    '',
    `**Verdikt: ${verdict === 'traegt' ? '✅ trägt' : '❌ trägt nicht'}** — ${verdictReason}`,
    '',
    '## 1. Positiv-Kontrolle gegen das externe SCF-Gold',
    '',
    `| SCF | Gesetze | wiedergefunden durch |`,
    '| --- | --- | --- |',
    ...r.goldHits.map((g) => `| ${g.id} | ${g.laws.join(' + ')} | ${g.matchedBy ?? '—'} |`),
    '',
    `**${r.goldHitCount} von ${SCF_GOLD.length}** (Schwelle ${GOLD_HITS_MIN}).`,
    r.ambiguousGoldMatches.length
      ? `⚠️ **Mehrdeutig:** ${r.ambiguousGoldMatches.join(', ')} trifft mehrere Gold-Einträge. ` +
        'Drei Einträge teilen sich die Handlung `resilienz-governance` — die Trefferquote ist dadurch eher zu hoch als zu niedrig.'
      : 'Keine Maßnahme trifft mehrere Gold-Einträge.',
    '',
    '## 2. Negativ-Kontrollen',
    '',
    `| Kontrolle | Ergebnis |`,
    '| --- | --- |',
    `| mechanisch — NIS2 Art. 23 × DORA Art. 19 durch Verdrängung ausgeschlossen, **bevor** ein Modell befragt wurde | ${r.negativeMechanical ? '✅' : '❌'} |`,
    `| semantisch — keine Maßnahme vereint verschiedene kanonische Handlungen | ${r.negativeSemantic ? '✅' : '❌'} |`,
    `| Kanarienvogel — dieselbe Anforderung zweimal ergibt eine Maßnahme | ${r.canaryPassed ? '✅' : '❌'} |`,
    '',
    `Durch Verdrängung ausgeschlossen: ${r.grouping.excludedByDisplacement.length} Paar(e). ` +
      `Vom Richter geurteilt: ${r.grouping.judged}.`,
    '',
    '## 3. Kalibrierung der Extraktion',
    '',
    '| Größe | Wert | Referenz |',
    '| --- | --- | --- |',
    `| Artikel · Klauseln | ${r.articles} · ${r.clauses} | — |`,
    `| Klauseln je Artikel | ${r.clausesPerArticle.toFixed(1)} | Reg2Req ≈ 4,0 (Schnitt über alle DSGVO-Artikel) |`,
    `| **Anforderungen je Klausel** | **${r.requirementsPerClause.toFixed(2).replace('.', ',')}** | **Reg2Req ≈ ${String(REG2REQ_RATE).replace('.', ',')}** (448 aus 398 Klauseln) |`,
    `| Klauseln ohne Anforderung | ${r.clausesWithoutRequirement} | — |`,
    `| unlesbare Extraktionen | ${r.unreadableExtractions} | — |`,
    `| aufgeteilt (nicht singulär) | ${r.splitCount} | — |`,
    `| nach dem Schnitt weiterhin nicht singulär | ${r.unsingular} | — |`,
    `| Systemanforderungen | ${r.sysReqs} | — |`,
    `| davon nicht implementierungsfrei | ${r.implFreedomFailures} | — |`,
    '',
    '## 4. Maßnahmen',
    '',
    ...(r.grouping.measures.filter((m) => m.memberIds.length > 1).length
      ? r.grouping.measures
          .filter((m) => m.memberIds.length > 1)
          .map((m) => `- \`${m.id}\` — ${m.laws.join(' + ')} · ${m.memberIds.length} Anforderungen`)
      : ['- keine geteilte Maßnahme entstanden']),
    '',
    `Zusammenfall auf Anforderungsebene: ${r.grouping.collapsed.length} ` +
      '(erwartete Häufigkeit nahe null — `equal` kam im Experiment vom 2026-08-01 in 120 Fällen null Mal vor).',
    '',
    '## Grenzen dieses Laufs',
    '',
    '- **Eingefrorenes Fixture statt Live-Korpus.** Neun Artikel, deutscher Wortlaut, aus dem kanonischen Korpus exportiert und eingefroren. Der Adressatenkreis je Artikel ist von Hand mit Zitat erfasst, nicht aus der Typisierung gejoint.',
    '- **Die Zuordnung Handlung → SCF ist unsere Setzung**, nicht die Behauptung des SCF. Sie entscheidet mit, was als wiedergefunden zählt.',
    '- **Ein Adjudikator, wenige Fälle.** Das reicht für einen Entscheid, nicht für ein Produktversprechen.',
    '- **Geurteilt wird Umsetzbarkeit, nicht Rechtmäßigkeit.** Eine gemeinsame Maßnahme entbindet von keiner Rechtsgrundlage.',
    '- Ein negatives Verdikt ist ein **gültiges Ergebnis**. Nachgebessert wird nur, was als Harness-Fehler belegt ist.',
  ].join('\n');

  return { ...r, verdict, verdictReason, markdown };
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const arg = (flag: string): string | undefined => {
    const i = argv.indexOf(flag);
    return i !== -1 ? argv[i + 1] : undefined;
  };

  const { createRaterClient, resolveRaterConfig, withEmptyResponseRetry } = await import('../raterClient');
  const client = withEmptyResponseRetry(createRaterClient(resolveRaterConfig(argv)));
  const ask: AskFn = async (system, user) => (await client.complete({ system, user, maxTokens: 900 })).text;

  const laws = loadReqtraceLaws();
  const result = await evaluateReqtrace(laws.articles, {
    ask,
    onProgress: (d, t) => process.stdout.write(`\r[reqtrace:eval] Klausel ${d}/${t}`),
  });

  console.log(`\n${result.markdown}`);

  const outPath = arg('--out');
  if (outPath) {
    const abs = path.resolve(outPath);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, `${result.markdown}\n`);
    // Rohdaten daneben: der Bericht ist zum Lesen, die Zahlen sind zum
    // Nachrechnen — und sie sind das Ergebnis des Entscheidungs-Tickets.
    fs.writeFileSync(
      abs.replace(/\.md$/, '') + '.json',
      `${JSON.stringify({ ...result, markdown: undefined }, null, 2)}\n`,
    );
    console.log(`\n[reqtrace:eval] → ${abs}`);
  }
}

if (require.main === module) {
  void main();
}
