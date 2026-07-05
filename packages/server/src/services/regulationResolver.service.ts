/**
 * Regulation Resolver (THE-368 D2) — zentrale Lese-Abstraktion für Consumer.
 *
 * Strangler-Pattern: liest bevorzugt aus dem kanonischen Korpus (corpusClient),
 * fällt aber auf die App-DB (`Regulation`, per-Projekt-Altbestand) zurück, wenn der
 * Korpus nicht konfiguriert ist oder (noch) keine passenden Einträge hat. So kann
 * jeder Consumer einzeln + risikoarm auf den Korpus umgestellt werden, ohne dass
 * etwas bricht, solange noch nicht alles migriert ist.
 *
 * Projekt-Bezug im Korpus-Modell: ein Projekt „hat" die Regulations, die seine
 * ComplianceMappings über `regulationKey` referenzieren (ADR-0001).
 */
import { Regulation, IRegulation } from '../models/Regulation';
import { ComplianceMapping } from '../models/ComplianceMapping';
import {
  isCorpusConfigured,
  getRegulationsByKeys,
  corpusHealth,
  type ICorpusRegulation,
} from './corpusClient.service';
import { log } from '../config/logger';

/**
 * THE-419 (b) — Fallback-Telemetrie + Kill-Switch (THE-368 AC-4).
 *
 * Jeder App-DB-Fallback wird gezählt und geloggt, damit messbar ist, ob der
 * Legacy-Pfad noch gebraucht wird. Sobald der Zähler über einen Beobachtungs-
 * zeitraum bei 0 bleibt, kann der Fallback per CORPUS_STRICT_READS=true
 * abgeschaltet werden — ohne Code-Änderung, ohne Redeploy-Risiko.
 */
interface FallbackStats {
  /** App-DB reads because the corpus is not configured at all. */
  corpusUnconfigured: number;
  /** App-DB reads because the corpus yielded nothing for the request. */
  corpusMiss: number;
}

const fallbackStats: FallbackStats = { corpusUnconfigured: 0, corpusMiss: 0 };

export function getFallbackStats(): Readonly<FallbackStats> {
  return { ...fallbackStats };
}

/** Test-Seam — Zähler zurücksetzen (nur Tests). */
export function resetFallbackStats(): void {
  fallbackStats.corpusUnconfigured = 0;
  fallbackStats.corpusMiss = 0;
}

/** Kill-Switch: true = kein App-DB-Fallback mehr (Strangler-Cutover abgeschlossen). */
export function isStrictCorpusReads(): boolean {
  return process.env.CORPUS_STRICT_READS === 'true';
}

function recordFallback(reason: keyof FallbackStats, context: Record<string, unknown>): void {
  fallbackStats[reason] += 1;
  log.warn(
    { ...context, reason, fallbackStats: { ...fallbackStats } },
    '[regulationResolver] app-DB fallback used (THE-419 telemetry)'
  );
}

export interface RegulationView {
  regulationKey?: string;
  source: string;
  jurisdiction: string;
  paragraphNumber: string;
  title: string;
  fullText: string;
  summary?: string;
  sourceUrl: string;
  effectiveFrom: Date;
  language: string;
}

function corpusToView(r: ICorpusRegulation): RegulationView {
  return {
    regulationKey: r.regulationKey,
    source: r.source,
    jurisdiction: r.jurisdiction,
    paragraphNumber: r.paragraphNumber,
    title: r.title,
    fullText: r.fullText,
    summary: r.summary,
    sourceUrl: r.sourceUrl,
    effectiveFrom: r.effectiveFrom,
    language: r.language,
  };
}

function appToView(r: IRegulation): RegulationView {
  return {
    source: r.source,
    jurisdiction: r.jurisdiction,
    paragraphNumber: r.paragraphNumber,
    title: r.title,
    fullText: r.fullText,
    summary: r.summary,
    sourceUrl: r.sourceUrl,
    effectiveFrom: r.effectiveFrom,
    language: r.language,
  };
}

export function isCorpusReadEnabled(): boolean {
  return isCorpusConfigured();
}

/** System-wide regulation count — corpus when reachable, else app-DB. */
export async function countRegulations(): Promise<number> {
  if (isCorpusConfigured()) {
    const h = await corpusHealth();
    if (h.ok && typeof h.count === 'number') return h.count;
  }
  if (isStrictCorpusReads()) return 0;
  recordFallback(isCorpusConfigured() ? 'corpusMiss' : 'corpusUnconfigured', {
    fn: 'countRegulations',
  });
  return Regulation.countDocuments({});
}

/**
 * The regulations a project references (via its ComplianceMappings' regulationKeys),
 * resolved from the corpus. Falls back to the per-project app-DB copies when the
 * corpus is unconfigured or yields nothing for this project.
 */
export async function getRegulationsForProject(projectId: string): Promise<RegulationView[]> {
  if (isCorpusConfigured()) {
    const keys = (await ComplianceMapping.distinct('regulationKey', {
      projectId,
      regulationKey: { $exists: true },
    })) as string[];
    if (keys.length > 0) {
      const regs = await getRegulationsByKeys(keys);
      if (regs.length > 0) return regs.map(corpusToView);
    }
  }
  // THE-419: Strangler-Cutover — im Strict-Modus gibt es keinen Legacy-Pfad mehr.
  if (isStrictCorpusReads()) return [];
  recordFallback(isCorpusConfigured() ? 'corpusMiss' : 'corpusUnconfigured', {
    fn: 'getRegulationsForProject',
    projectId,
  });
  const docs = await Regulation.find({ projectId });
  return docs.map(appToView);
}
