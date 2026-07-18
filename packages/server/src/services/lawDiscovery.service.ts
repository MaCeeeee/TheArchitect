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
import type { ApplicabilityReport, CorpusHit, DiscoveryCandidate, DiscoveryResult } from '@thearchitect/shared';
import { buildUseCaseProfile } from './useCaseProfile.service';
import { governedCorpusSearch } from './governedRetrieval.service';
import { isCorpusConfigured } from './corpusClient.service';
import { buildApplicabilityReport, loadProjectFacts, loadNormWorldState } from './regulationApplicability.service';
import { judgeCandidate } from './lawJudge.service';
import { upsertFindings, findExisting, listFindings, type UpsertFindingInput } from './lawDiscoveryFinding.service';
import { mergeApplicability } from './lawApplicabilityMerge.service';
import { computeVersionHash } from '../utils/regulationVersion';

// K (Retrieval-Breite) ist laufzeit-konfigurierbar (AC-2): Default 60, per
// LAW_DISCOVERY_TOP_K override-bar — Tuning-Hook fürs Eval-Gate .6 (THE-465).
const TOP_K = Number(process.env.LAW_DISCOVERY_TOP_K) || 60;
const TOP_HITS_PER_CANDIDATE = 5;

/** `ai-act-de` / `ai-act-en` → `ai-act` (Sprach-Familie, AC-4). */
export function toFamily(source: string): string {
  return source.replace(/-(de|en)$/i, '');
}

export async function discoverCandidates(projectId: string): Promise<DiscoveryResult> {
  if (!isCorpusConfigured()) {
    return { projectId, corpusConfigured: false, candidates: [], degraded: 'corpus not configured' };
  }
  const profile = await buildUseCaseProfile(projectId);
  const hits = await governedCorpusSearch({ text: profile.text, topK: TOP_K });
  if (hits.length === 0) {
    return { projectId, corpusConfigured: true, candidates: [], degraded: 'no corpus hits' };
  }

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
  return { projectId, corpusConfigured: true, candidates };
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

  const discovery = await discoverCandidates(projectId);
  const hasProvider = Boolean(opts.anthropicClient || process.env.ANTHROPIC_API_KEY);
  if (discovery.candidates.length === 0 || !hasProvider) {
    return mergeApplicability(stageA, [], undefined, undefined, world);
  }

  const gated = discovery.candidates
    .filter(c => c.score >= judgeThreshold())
    .slice(0, maxJudge());
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

    const verdict = await judgeCandidate({
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
      retrievalScore: candidate.score,
      corpusVersionHash,
      judgeModel: model,
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
