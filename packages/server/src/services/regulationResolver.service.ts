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
  const docs = await Regulation.find({ projectId });
  return docs.map(appToView);
}
