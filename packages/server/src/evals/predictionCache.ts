/**
 * Prediction-Cache für Eval-Läufe — geteilt von runMappingEval + runConsistencyEval.
 *
 * Key = Text-Hash + Modell + Prompt-Hash + Kandidaten-Reihenfolge. Ändert sich
 * eines davon, wird neu gemessen; sonst sind Läufe offline reproduzierbar
 * (CI-Gate THE-386 braucht keinen API-Key).
 *
 * Linear: THE-380 (REQ-EVAL-001.2)
 */
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import type { ComplianceMappingCandidate } from '../services/complianceMapping.service';

export function sha256(input: string): string {
  return createHash('sha256').update(input, 'utf8').digest('hex');
}

export interface CachedPrediction {
  cacheKey: string;
  model: string;
  promptHash: string;
  textHash: string;
  predictions: ComplianceMappingCandidate[];
  cachedAt: string;
}

/**
 * candidatesHash schließt die verifizierte Key-Lücke: Ohne ihn waren Kandidaten-
 * INHALTE (description, künftig Compliance-Facts) kein Key-Bestandteil — eine
 * Profil-/Beschreibungs-Änderung hätte still alte Predictions zurückgeliefert
 * und jeden Vorher/Nachher-Vergleich entwertet. Aufrufer übergeben
 * sha256(JSON.stringify(candidates)). Bestehende Cache-Buckets sind dadurch
 * stale und werden beim nächsten Live-Lauf neu befüllt (bewusst: es existiert
 * noch keine eingefrorene Baseline).
 */
export function cacheKeyFor(
  fullText: string,
  candidateIds: string[],
  model: string,
  promptHash: string,
  candidatesHash: string
): string {
  return sha256(
    [sha256(fullText), model, promptHash, candidateIds.join(','), candidatesHash].join('|')
  );
}

function cachePathFor(cacheDir: string, bucket: string, caseId: string): string {
  return path.join(cacheDir, bucket, `${caseId}.json`);
}

export function readCache(
  cacheDir: string,
  bucket: string,
  caseId: string,
  expectedKey: string
): CachedPrediction | null {
  const p = cachePathFor(cacheDir, bucket, caseId);
  if (!fs.existsSync(p)) return null;
  try {
    const cached = JSON.parse(fs.readFileSync(p, 'utf8')) as CachedPrediction;
    return cached.cacheKey === expectedKey ? cached : null; // stale (Modell/Prompt/Text/Reihenfolge geändert)
  } catch {
    return null;
  }
}

export function writeCache(
  cacheDir: string,
  bucket: string,
  caseId: string,
  entry: CachedPrediction
): void {
  fs.mkdirSync(path.join(cacheDir, bucket), { recursive: true });
  fs.writeFileSync(cachePathFor(cacheDir, bucket, caseId), JSON.stringify(entry, null, 2));
}
