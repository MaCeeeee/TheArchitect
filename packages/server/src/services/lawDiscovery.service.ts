/**
 * UC-LAW-002 (THE-459) — Discovery-Orchestrierung, Slice-1 (deterministisch).
 * Profil (.1) → governedCorpusSearch (.2) → §→Gesetz-Aggregation + Familien-Merge.
 * KEIN LLM (Judge = Slice-2/THE-462). Graceful degradation bei leerem Korpus (AC-5).
 *
 * `discoverAndJudge` (Slice-2, THE-462/463) baut DARAUF auf: Schwellen-gated
 * LLM-Judge je Kandidat + Persist + Hybrid-Merge mit dem Stage-A-Report.
 * `discoverCandidates` bleibt UNBERÜHRT (Slice-1-Vertrag).
 */
import type Anthropic from '@anthropic-ai/sdk';
import * as Sentry from '@sentry/node';
import type { ApplicabilityReport, ConsumedRef, CorpusHit, DiscoveryCandidate, DiscoveryResult, ScopeGuaranteeState } from '@thearchitect/shared';
import { safeErrorMessage } from '@thearchitect/shared';
import { buildUseCaseProfile } from './useCaseProfile.service';
import { governedCorpusSearch } from './governedRetrieval.service';
import { isCorpusConfigured, listScopeProvisionsBySource } from './corpusClient.service';
import {
  selectScopeProvisions,
  injectScopeHits,
  guaranteeStateFor,
  type FamilyScopeResult,
  type ScopeCorpusDoc,
} from './scopeGuarantee.service';
import { hydeRewrite } from './hyde.service';
import { buildApplicabilityReport, loadProjectFacts, loadNormWorldState } from './regulationApplicability.service';
import { judgeCandidate } from './lawJudge.service';
import { upsertFindings, findExisting, listFindings, type UpsertFindingInput } from './lawDiscoveryFinding.service';
import { mergeApplicability } from './lawApplicabilityMerge.service';
import { computeVersionHash } from '../utils/regulationVersion';
import { recordContextTrace } from './contextTrace.service';
import { log } from '../config/logger';

// K (Retrieval-Breite) ist laufzeit-konfigurierbar (AC-2): Default 60, per
// LAW_DISCOVERY_TOP_K override-bar — Tuning-Hook fürs Eval-Gate .6 (THE-465).
const TOP_K = Number(process.env.LAW_DISCOVERY_TOP_K) || 60;
const TOP_HITS_PER_CANDIDATE = 5;

/** `ai-act-de` / `ai-act-en` → `ai-act` (Sprach-Familie, AC-4). */
export function toFamily(source: string): string {
  return source.replace(/-(de|en)$/i, '');
}

/**
 * §→Gesetz-Aggregation (AC-3/AC-4): Sprach-Familien mergen (toFamily), kombinierter
 * Score (0.7·max + 0.3·mean, beidseitig auf [0,1] geklemmt — Qdrant-Cosine ist roh
 * ∈[-1,1]), Top-Hits gekürzt, deterministisch sortiert (Score desc, family asc).
 * PURE — kein I/O. Extrahiert (Slice-2b Task 4) für Eval-Reuse (THE-465): der
 * Runner nutzt exakt diese Prod-Aggregation statt sie nachzubauen (kein Metrik-Drift).
 * Verhaltens-unverändert gegenüber der vorherigen Inline-Fassung — dieselben
 * discoverCandidates-Tests decken das ab.
 */
export function aggregateHitsToCandidates(hits: CorpusHit[]): DiscoveryCandidate[] {
  const byFamily = new Map<string, CorpusHit[]>();
  for (const hit of hits) {
    const fam = toFamily(hit.source);
    const bucket = byFamily.get(fam);
    if (bucket) bucket.push(hit);
    else byFamily.set(fam, [hit]);
  }

  const candidates: DiscoveryCandidate[] = [];
  for (const [family, famHits] of byFamily) {
    const scores = famHits.map(x => x.score);
    const max = Math.max(...scores);
    const mean = scores.reduce((a, b) => a + b, 0) / scores.length;
    // Kombinierter Score (AC-3): max dominiert, mean stabilisiert. Qdrant-Cosine ist
    // roh ∈[-1,1] → beidseitig auf [0,1] klemmen (AC-3 garantiert ∈[0,1]).
    const score = Math.max(0, Math.min(1, 0.7 * max + 0.3 * mean));
    const sorted = [...famHits].sort((a, b) => b.score - a.score || a.regulationKey.localeCompare(b.regulationKey));
    candidates.push({
      family,
      sources: [...new Set(famHits.map(x => x.source))].sort(),
      jurisdiction: famHits[0].jurisdiction,
      score,
      hitCount: famHits.length,
      topHits: sorted.slice(0, TOP_HITS_PER_CANDIDATE),
    });
  }
  // Determinismus: Score desc, dann family asc.
  candidates.sort((a, b) => b.score - a.score || a.family.localeCompare(b.family));
  return candidates;
}

export interface DiscoverCandidatesOptions {
  anthropicClient?: Anthropic;
}

export async function discoverCandidates(projectId: string, opts?: DiscoverCandidatesOptions): Promise<DiscoveryResult> {
  if (!isCorpusConfigured()) {
    return { projectId, corpusConfigured: false, candidates: [], degraded: 'corpus not configured' };
  }
  const profile = await buildUseCaseProfile(projectId);
  const hasProvider = Boolean(opts?.anthropicClient || process.env.ANTHROPIC_API_KEY);
  let queryText = profile.text;
  if (hydeEnabled() && hasProvider) {
    try {
      queryText = await hydeRewrite(profile.text, { client: opts?.anthropicClient });
    } catch (err) {
      log.warn({ err }, '[law-discovery] HyDE rewrite failed — falling back to baseline profile text');
      queryText = profile.text;
    }
  }
  const hits = await governedCorpusSearch({ text: queryText, topK: TOP_K });
  if (hits.length === 0) {
    return { projectId, corpusConfigured: true, candidates: [], degraded: 'no corpus hits' };
  }

  const candidates = aggregateHitsToCandidates(hits);
  if (!scopeGuaranteeEnabled()) {
    // AC-3: Flag aus ⇒ byte-identisch zu vorher — kein Feld, kein Korpus-
    // Typing-Read, keine Log-Zeile.
    return { projectId, corpusConfigured: true, candidates };
  }
  const guaranteed = await applyScopeGuarantee(projectId, candidates);
  return { projectId, corpusConfigured: true, candidates: guaranteed.candidates, scopeGuarantee: guaranteed.scopeGuarantee };
}

// ─── THE-516 (ADR-0006): Scope-Guarantee — Beweis-Garantie, kein Ranking-Boost ───

// ADR-0006 E3.3: dark-by-default Gate für die Scope-Guarantee. PER AUFRUF
// gelesen (nicht modul-weit gecacht) — Muster hydeEnabled() unten. WICHTIG:
// bei allen Env-Fallbacks `||` statt `??` (Present-but-empty-Lehre THE-514:
// ein gesetzter-aber-leerer Env-Wert muss auf den Default fallen, nicht als
// „gesetzt" durchrutschen).
function scopeGuaranteeEnabled(): boolean {
  return process.env.LAW_DISCOVERY_SCOPE_GUARANTEE === 'true';
}

/**
 * E5-Alerting-Seam: `unavailable` ist der EINZIGE alarmierende Zustand — er
 * fließt über die bestehende Kette (Sentry → n8n → Ops-Register, kein neuer
 * Draht). Injizierbar für Tests; Default = etabliertes Muster aus index.ts
 * (captureException nur bei gesetztem SENTRY_DSN) + lauter log.error, damit
 * der Ausfall auch ohne Sentry (Dev) sichtbar bleibt.
 */
export type ScopeGuaranteeAlert = (message: string, err: unknown) => void;
const defaultScopeGuaranteeAlert: ScopeGuaranteeAlert = (message, err) => {
  log.error({ err: safeErrorMessage(err) }, message);
  if (process.env.SENTRY_DSN) {
    Sentry.captureException(err instanceof Error ? err : new Error(message), {
      tags: { component: 'law-discovery-scope-guarantee' },
      extra: { message },
    });
  }
};
let scopeGuaranteeAlert: ScopeGuaranteeAlert = defaultScopeGuaranteeAlert;
export function __setScopeGuaranteeAlertForTests(fn: ScopeGuaranteeAlert | null): void {
  scopeGuaranteeAlert = fn ?? defaultScopeGuaranteeAlert;
}

/**
 * E2-Sprachwahl-Input: dominante Sprache der vorhandenen Familien-topHits,
 * damit das injizierte Beweismaterial sprachlich zur Evidenz passt.
 * Tie-Break deterministisch: bei Gleichstand gewinnt die lexikographisch
 * kleinste Sprache (Iteration über sortierte Einträge, nur ECHT größere
 * Zählung verdrängt).
 */
function dominantLanguage(hits: CorpusHit[]): string | undefined {
  const counts = new Map<string, number>();
  for (const h of hits) counts.set(h.language, (counts.get(h.language) ?? 0) + 1);
  let best: string | undefined;
  let bestCount = 0;
  for (const [lang, count] of [...counts.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    if (count > bestCount) {
      best = lang;
      bestCount = count;
    }
  }
  return best;
}

/**
 * ADR-0006 E1/E2/E5: je Kandidaten-Familie bis zu 2 Geltungsbereichs-§§ ins
 * Judge-Beweismaterial injizieren. Läuft NACH aggregateHitsToCandidates —
 * Familien-Score/hitCount sind fix, die Injektion ist Beweis-Garantie, kein
 * Ranking-Eingriff (Score-Neutralität = harte Leitplanke).
 *
 * EIN Korpus-Read über die Quellen ALLER Familien (nicht N Reads). Weiches
 * Ausfall-Verhalten (E5): wirft der Lookup, läuft die Discovery unverändert
 * weiter — Zustand 'unavailable' + Alert. 'partial' (mind. eine Familie ohne
 * konsumierbare scope-§§) ist ein LEGITIMER Zustand (frisch gecrawltes Gesetz
 * vor dem Re-Typing-Batch) ⇒ nur Log, KEIN Alert (Alert-Müdigkeit, ADR-0006 E5).
 */
/**
 * E6-Injektions-Seam (ADR-0006, THE-516 Task 3): der Offline-Eval-Harness
 * übergibt hier eine Fixture-Lookup-Funktion statt des Mongo-Reads — damit
 * beweist der Regressionstest (CRA-Blindfleck, THE-423) EXAKT den Prod-
 * Injektionspfad, ohne Korpus-Verbindung. Default = corpusClient-Read ⇒
 * Prod-Verhalten byte-identisch unverändert; das Flag-aus-Gate liegt VOR
 * diesem Aufruf (discoverCandidates), die AC-3-Identität bleibt unberührt.
 */
export type ScopeProvisionLookup = (sources: string[]) => Promise<ScopeCorpusDoc[]>;

export async function applyScopeGuarantee(
  projectId: string,
  candidates: DiscoveryCandidate[],
  lookup: ScopeProvisionLookup = listScopeProvisionsBySource,
): Promise<{ candidates: DiscoveryCandidate[]; scopeGuarantee: ScopeGuaranteeState }> {
  let scopeDocs;
  try {
    const sources = [...new Set(candidates.flatMap(c => c.sources))];
    scopeDocs = await lookup(sources);
  } catch (err) {
    // E5 weich: Discovery MUSS ohne Garantie weiterlaufen — sichtbar via Feld,
    // alarmiert via Sentry (einziger alarmierender Zustand).
    log.warn(
      { projectId, err: safeErrorMessage(err) },
      '[law-discovery] scope-guarantee corpus lookup failed — continuing without guarantee',
    );
    scopeGuaranteeAlert(
      `[law-discovery] scope-guarantee corpus lookup failed (project ${projectId}): ${safeErrorMessage(err)}`,
      err,
    );
    return { candidates, scopeGuarantee: 'unavailable' };
  }

  const results: FamilyScopeResult[] = [];
  const injected = candidates.map(candidate => {
    const familyDocs = scopeDocs.filter(d => candidate.sources.includes(d.source));
    const selected = selectScopeProvisions(familyDocs, { preferredLanguage: dominantLanguage(candidate.topHits) });
    // covered = ≥1 konsumierbarer scope-§ existiert: er landet entweder als
    // Injektion in den topHits oder ist bereits regulär drin (E2-Dedupe).
    results.push({ family: candidate.family, covered: selected.length > 0 });
    return injectScopeHits(candidate, selected).candidate;
  });

  const scopeGuarantee = guaranteeStateFor(results);
  if (scopeGuarantee === 'partial') {
    log.warn(
      { projectId, uncoveredFamilies: results.filter(r => !r.covered).map(r => r.family) },
      '[law-discovery] scope guarantee partial — families without consumable scope provisions',
    );
  }
  return { candidates: injected, scopeGuarantee };
}

// ─── Slice-2 (THE-462/463): Judge-Orchestrierung ─────────────────

// Gating (AC-2 Kosten-Disziplin): nur Kandidaten über der Retrieval-Schwelle,
// gedeckelt auf eine Top-N-Anzahl — beide runtime-konfigurierbar. Bewusst PER
// AUFRUF gelesen (nicht modul-weit gecacht wie TOP_K oben), damit Env-Änderungen
// (Tests, Config-Reload) sofort greifen statt am Modul-Import-Zeitpunkt einzufrieren.
// Code-Review-Fix: `Number(env)||default` schluckt ein bewusstes `0` (z.B.
// MAX_JUDGE=0 als Judge-Kill-Switch). Explizit: unset/leer/ungültig → Default,
// jede endliche Zahl ≥0 (inkl. 0) wird respektiert.
function envNonNegative(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === '') return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}
function judgeThreshold(): number {
  return envNonNegative('LAW_DISCOVERY_JUDGE_THRESHOLD', 0.3);
}
function maxJudge(): number {
  return envNonNegative('LAW_DISCOVERY_MAX_JUDGE', 5);
}
function defaultJudgeModel(): string {
  return process.env.LAW_DISCOVERY_JUDGE_MODEL || 'claude-haiku-4-5-20251001';
}

// THE-514 Task 3: dark-by-default gate for the HyDE retrieval stage. PER
// AUFRUF gelesen (nicht modul-weit gecacht) — gleiches Muster wie
// judgeThreshold()/maxJudge()/defaultJudgeModel() oben.
function hydeEnabled(): boolean {
  return process.env.LAW_DISCOVERY_HYDE === 'true';
}

/**
 * Prod-Gating als PURE Funktion (Eval-Degeneration-Fix): nur Kandidaten über
 * der Retrieval-Schwelle, gedeckelt auf Top-N — exakt das, was in Prod den
 * Judge erreicht. Exportiert, damit der Eval-Runner (runDiscoveryEval) dieselbe
 * Kandidatenmenge misst statt der ungegateten (die bei kleinem Fixture-Korpus
 * mit topK ≥ #§§ trivial ALLE Familien enthält ⇒ Recall degeneriert zu 100 %).
 * Defaults = die env-Funktionen (LAW_DISCOVERY_JUDGE_THRESHOLD/_MAX_JUDGE) —
 * Muster aggregateHitsToCandidates: Extraktion ohne Verhaltens-Change.
 */
export function gateCandidatesForJudge(
  candidates: DiscoveryCandidate[],
  threshold: number = judgeThreshold(),
  max: number = maxJudge(),
): DiscoveryCandidate[] {
  return candidates.filter(c => c.score >= threshold).slice(0, max);
}

/**
 * Abgeleiteter Evidence-Set-Hash (Review-Fix 1 / Task 1): es gibt KEINEN
 * globalen Korpus-Versions-Skalar — `getCurrentVersionHashes` liefert einen
 * Hash PRO regulationKey. Ein Kandidat aggregiert mehrere Paragraphen, daher
 * hasht dies die tatsächlich gesehene Evidenz (topHits) des Kandidaten.
 */
export function evidenceSetHash(candidate: Pick<DiscoveryCandidate, 'topHits'>): string {
  return computeVersionHash(
    candidate.topHits.map(h => `${h.regulationKey}:${h.versionHash}`).sort().join('|'),
  );
}

export interface DiscoverAndJudgeOptions {
  anthropicClient?: Anthropic;
}

/**
 * Slice-1-Kandidaten → Schwellen-gated LLM-Judge → Persist (schützt
 * confirmed/rejected) → Hybrid-Merge mit dem deterministischen Stage-A-Report.
 * Graceful: fehlender Provider-Key / unkonfigurierter oder leerer Korpus ⇒
 * reiner Stage-A-Report, KEIN Fehler (AC-4-Geist).
 */
export async function discoverAndJudge(
  projectId: string,
  opts: DiscoverAndJudgeOptions = {},
): Promise<ApplicabilityReport> {
  // Review-Fix 1 (Slice-2b Task 3a): eigener, billiger World-State-Read —
  // damit bekommen corpus-only-Assessments (kein Stage-A-Regel-Match) auch
  // workId/inPipeline (sonst ist "Add to pipeline" für sie unimplementierbar).
  const [stageA, world] = await Promise.all([
    buildApplicabilityReport(projectId),
    loadNormWorldState(projectId),
  ]);

  const discovery = await discoverCandidates(projectId, { anthropicClient: opts.anthropicClient });
  const hasProvider = Boolean(opts.anthropicClient || process.env.ANTHROPIC_API_KEY);
  if (discovery.candidates.length === 0 || !hasProvider) {
    return mergeApplicability(stageA, [], undefined, undefined, world);
  }

  const gated = gateCandidatesForJudge(discovery.candidates);
  if (gated.length === 0) {
    return mergeApplicability(stageA, [], undefined, undefined, world);
  }

  const model = defaultJudgeModel();
  const [profile, facts] = await Promise.all([
    buildUseCaseProfile(projectId),
    loadProjectFacts(projectId),
  ]);
  const profileElements = facts.elements.map(e => ({ id: e.id, name: e.name, layer: e.layer }));

  const toUpsert: UpsertFindingInput[] = [];
  const evidenceHashes: string[] = [];
  // Spec-Fix 4: aktueller Evidence-Stand JE Familie (über ALLE Kandidaten, nicht
  // nur gated — auch eine unter-Schwelle-Familie hat einen aktuellen Stand).
  // Persistierte Findings mit abweichendem Hash werden im Merge `stale` markiert.
  const currentEvidenceHashes = new Map(
    discovery.candidates.map(c => [c.family, evidenceSetHash(c)]),
  );

  for (const candidate of gated) {
    // ADR-0006 E4 (THE-516): injizierte scope-§§ stecken bereits in den topHits
    // (discoverCandidates), also ändert sich der evidenceSetHash hier AUTOMATISCH
    // — bewusst KEIN Sonderfall: neues Beweismaterial ⇒ neu beurteilen ist
    // gewollt (Kosten ≈ ein Judge-Lauf je Familie, einmalig pro Projekt beim
    // ersten Lauf mit Flag). AC-6: der Judge-Prompt wächst dadurch um ≤2 §§ je
    // Familie (~+2–4k Tokens/Discovery-Lauf — vernachlässigbar).
    const corpusVersionHash = evidenceSetHash(candidate);
    evidenceHashes.push(corpusVersionHash);

    // Review-Fix 3/4 (AC-2 Kosten-Disziplin über Redeploys): ein bereits
    // menschlich entschiedenes Finding wird respektiert (nie neu geurteilt);
    // ein 'auto'-Finding desselben Modells wird wiederverwendet statt neu
    // bezahlt — nur ein Modellwechsel (oder ein neues Evidence-Set) löst
    // einen neuen Judge-Call aus.
    const existing = await findExisting(projectId, candidate.family, corpusVersionHash);
    if (existing && (existing.status !== 'auto' || existing.judgeModel === model)) {
      continue;
    }

    // Graceful degradation je Kandidat (Eval-Fund 2026-07-18): ein einzelner
    // fehlgeschlagener Judge-Call (z.B. Schema-Bruch nach beiden Attempts) darf
    // NICHT den ganzen /discover-Lauf auf 500 werfen — Kandidat überspringen,
    // die übrigen liefern weiter.
    let verdict;
    try {
      verdict = await judgeCandidate({
        profileText: profile.text,
        profileElements,
        candidate: {
          family: candidate.family,
          sources: candidate.sources,
          jurisdiction: candidate.jurisdiction,
          topHits: candidate.topHits.map(h => ({ regulationKey: h.regulationKey, title: h.title })),
          retrievalScore: candidate.score,
        },
        projectId,
        corpusVersionHash,
        model,
        anthropicClient: opts.anthropicClient,
      });
    } catch (err) {
      log.warn({ family: candidate.family, err }, '[law-discovery] judge failed for candidate — skipped');
      continue;
    }

    // THE-423 (Task 5): PER-CANDIDATE trace, AFTER the judge — the search-time
    // `tracedGovernedCorpusSearch` wrapper cannot know `citedByJudge` (it runs
    // before the verdict exists). Direct `recordContextTrace` call is therefore
    // the justified call-site here, not the wrapper. `consumed` covers ALL of
    // the candidate's topHits (fed to the judge), `citedByJudge` marks exactly
    // the ones the judge actually cited back (the "Art.16 vs Art.2" diagnostic).
    const consumed: ConsumedRef[] = candidate.topHits.map(hit => ({
      regulationKey: hit.regulationKey,
      versionHash: hit.versionHash,
      sectionRef: hit.paragraphNumber,
      score: hit.score,
      retrievalMethod: 'dense',
      citedByJudge: verdict.keyParagraphs.includes(hit.regulationKey),
      // ADR-0006 E4 (THE-516): Herkunfts-Markierung injizierter scope-§§ —
      // additiv, Bestands-Hits bleiben unmarkiert (implizit 'retrieval').
      ...(hit.origin ? { origin: hit.origin } : {}),
    }));
    const contextTraceId = await recordContextTrace({
      feature: 'discovery',
      projectId,
      consumed,
      model,
      llmTraceRef: verdict.aiTraceRequestId,
      evidenceSetHash: corpusVersionHash,
      // ADR-0006 E5 (THE-516): Garantie-Zustand als Run-Metadatum im Trace —
      // fehlt bei Flag aus (additiv).
      ...(discovery.scopeGuarantee ? { scopeGuarantee: discovery.scopeGuarantee } : {}),
    });

    // Spec-Fix 1 (AC-2): BEIDE Urteile persistieren — auch applies:false. Sonst
    // findet der Reuse-Guard oben beim nächsten Lauf (insb. nach Redeploy, wenn
    // der In-Process-Cache leer ist) nichts und bezahlt den Judge erneut. Ins
    // MERGE fließen negative Urteile weiterhin NICHT (Filter unten).
    toUpsert.push({
      family: verdict.family,
      sources: candidate.sources,
      jurisdiction: candidate.jurisdiction,
      applies: verdict.applies,
      confidence: verdict.confidence,
      reasoning: verdict.reasoning,
      elementIds: verdict.elementIds,
      keyParagraphs: verdict.keyParagraphs,
      // AC-4 (Fix 1): Titel-Details mit persistieren (additiv).
      ...(verdict.keyParagraphDetails ? { keyParagraphDetails: verdict.keyParagraphDetails } : {}),
      retrievalScore: candidate.score,
      corpusVersionHash,
      judgeModel: model,
      // THE-423 (Task 5): Provenienz-Link zum Retrieval-ContextTrace.
      contextTraceId,
    });
  }

  await upsertFindings(projectId, toUpsert);
  const allFindings = await listFindings(projectId);
  const findingsForMerge = allFindings.filter(f => f.applies && f.status !== 'rejected');

  // Report-weiter corpusVersion-Anzeigewert (THE-455/F1-Muster): da es KEINEN
  // globalen Skalar gibt (Review-Fix 1), ist dies ein Aggregat-Hash über die
  // in diesem Lauf tatsächlich betrachteten Evidence-Sets — reproduzierbar,
  // ändert sich, sobald sich irgendein geurteiltes Evidence-Set ändert.
  const corpusVersion = computeVersionHash([...evidenceHashes].sort().join('|'));

  return mergeApplicability(stageA, findingsForMerge, corpusVersion, currentEvidenceHashes, world);
}
