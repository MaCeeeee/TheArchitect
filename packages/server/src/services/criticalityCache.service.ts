import { createHash } from 'crypto';
import { CriticalityCacheModel } from '../models/CriticalityCache';
import type { CriticalityScoreEntry, FactorWeights } from '@thearchitect/shared';

const STALE_AFTER_MS = 60 * 60 * 1000; // 1h

interface HashInput {
  elementIds: string[];
  connectionEdges: Array<[string, string]>;
  mappingKeys: string[];
  waveCount: number;
  weights: FactorWeights;
}

export function computeInputHash(input: HashInput): string {
  const sortedElements = [...input.elementIds].sort();
  const sortedEdges = input.connectionEdges
    .map(([s, t]) => `${s}->${t}`)
    .sort();
  const sortedMappings = [...input.mappingKeys].sort();
  const weightsStr = Object.entries(input.weights)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}:${v.toFixed(2)}`)
    .join(',');
  const payload = [
    `E:${sortedElements.join('|')}`,
    `C:${sortedEdges.join('|')}`,
    `M:${sortedMappings.join('|')}`,
    `W:${input.waveCount}`,
    `WT:${weightsStr}`,
  ].join('::');
  return createHash('sha256').update(payload).digest('hex').substring(0, 16);
}

export interface CachedScores {
  scores: CriticalityScoreEntry[];
  weights: FactorWeights;
  computedAt: Date;
}

export async function getCachedScores(
  projectId: string,
  currentHash: string,
): Promise<CachedScores | null> {
  const doc = await CriticalityCacheModel.findOne({ projectId }).lean();
  if (!doc) return null;
  if (doc.inputHash !== currentHash) return null;
  if (Date.now() - new Date(doc.computedAt).getTime() > STALE_AFTER_MS) {
    return null;
  }
  return {
    scores: doc.scores,
    weights: doc.weights,
    computedAt: new Date(doc.computedAt),
  };
}

export async function saveCachedScores(
  projectId: string,
  scores: CriticalityScoreEntry[],
  weights: FactorWeights,
  inputHash: string,
): Promise<void> {
  await CriticalityCacheModel.updateOne(
    { projectId },
    {
      $set: {
        projectId,
        scores,
        weights,
        inputHash,
        computedAt: new Date(),
      },
    },
    { upsert: true },
  );
}

export async function invalidateCache(projectId: string): Promise<void> {
  await CriticalityCacheModel.deleteOne({ projectId });
}
