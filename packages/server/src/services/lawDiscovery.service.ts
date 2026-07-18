/**
 * UC-LAW-002 (THE-459) — Discovery-Orchestrierung, Slice-1 (deterministisch).
 * Profil (.1) → governedCorpusSearch (.2) → §→Gesetz-Aggregation + Familien-Merge.
 * KEIN LLM (Judge = Slice-2/THE-462). Graceful degradation bei leerem Korpus (AC-5).
 */
import type { CorpusHit, DiscoveryCandidate, DiscoveryResult } from '@thearchitect/shared';
import { buildUseCaseProfile } from './useCaseProfile.service';
import { governedCorpusSearch } from './governedRetrieval.service';
import { isCorpusConfigured } from './corpusClient.service';

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
