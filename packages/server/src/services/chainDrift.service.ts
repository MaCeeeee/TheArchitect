/**
 * chainDrift — eine Novelle staled NUR die tatsächlich veränderten Klauseln
 * (THE-565 Task 4, REQ-001.6 AC 3).
 *
 * ── DER GEMESSENE GRUND ──
 *
 * Positionale Klausel-Referenzen zeigen nach einer umnummerierenden Novelle
 * zu 24/30 auf die FALSCHE Klausel; die inhalts-basierte contentId findet
 * 30/30 (THE-550, docs/evals/the550-granularitaet-entscheid.md). Dieser Pass
 * macht den Vorteil zum Produktverhalten: der aktuelle Normtext wird neu
 * segmentiert (derselbe deterministische Segmenter wie in der Kette), und
 * NUR Requirements, deren Klausel-contentId im neuen Text nicht mehr
 * vorkommt, werden `regulationVersionMismatch` — die Nachbar-Klausel bleibt
 * byte-gleich, egal wie sich die Nummern verschoben haben.
 *
 * Die Alterungs-Kaskade ist die EINE Quelle aus THE-558: Evidenz des
 * gestalten Requirements wird `stale` (dokumentierte WORM-Ausnahme, Muster
 * regulationDrift.service), und ein attestiertes Tor fällt via
 * `resetAttestedForStale` mit sichtbarem Grund.
 *
 * EXPLIZITER Aufruf (POST) — der Anschluss an den Drift-Cron ist benannte
 * Folgearbeit. Welten ohne abrufbaren Text werden gezählt (`skipped`),
 * nie still übersprungen.
 */
import mongoose from 'mongoose';
import { clauseContentId } from '@thearchitect/shared';
import { segmentClauses } from '../evals/reqtrace/clauseSegmenter';
import type { ReqtraceArticle } from '../evals/reqtrace/lawsFixture';
import { getPipelineNorm } from './norm.service';
import { ComplianceRequirement } from '../models/ComplianceRequirement';
import { Evidence } from '../models/Evidence';
import { resetAttestedForStale } from './evidence.service';

export interface ChainDriftReport {
  /** Requirements, deren Klausel gegen den aktuellen Text geprüft wurde. */
  checked: number;
  /** Davon: Klausel im aktuellen Text nicht mehr vorhanden → mismatch. */
  staled: number;
  /** Requirements ohne abrufbaren Normtext — gezählt, nie still. */
  skipped: number;
  /** Evidenz-Dokumente, die dabei stale wurden. */
  evidenceStaled: number;
  /** Attestierte Tore, die mit sichtbarem Grund zurückfielen. */
  attestedReset: number;
}

export async function chainDriftCheck(
  projectId: mongoose.Types.ObjectId | string,
): Promise<ChainDriftReport> {
  const report: ChainDriftReport = { checked: 0, staled: 0, skipped: 0, evidenceStaled: 0, attestedReset: 0 };

  const reqs = await ComplianceRequirement.find({
    projectId,
    chain: { $exists: true },
    normId: { $exists: true, $ne: null },
    sectionEId: { $exists: true, $ne: null },
  });
  if (reqs.length === 0) return report;

  // Gruppieren nach (normId, sectionEId) — ein Text-Abruf und eine
  // Segmentierung je Section, nicht je Requirement.
  const groups = new Map<string, typeof reqs>();
  for (const r of reqs) {
    const key = `${r.normId}${r.sectionEId}`;
    if (!groups.has(key)) groups.set(key, [] as unknown as typeof reqs);
    groups.get(key)!.push(r);
  }

  for (const [key, members] of groups) {
    const [normId, sectionEId] = key.split('');
    const norm = await getPipelineNorm(String(projectId), normId);
    const section = norm?.sections.find((s) => s.id === sectionEId);
    if (!norm || !section || !section.content?.trim()) {
      report.skipped += members.length;
      continue;
    }

    // Derselbe deterministische Segmenter wie in der Kette (THE-560) — die
    // positionale Id ist hier egal, gezählt wird ausschließlich der Inhalt.
    const article = {
      source: normId,
      article: sectionEId,
      fullText: section.content,
    } as unknown as ReqtraceArticle;
    const currentIds = new Set(segmentClauses(article).map((c) => c.contentId));
    // Robustheit: auch der Volltext als eine Klausel zählt als vorhanden
    // (Sections, die kuerzer sind als jede Absatz-Gliederung).
    currentIds.add(clauseContentId(section.content));

    for (const r of members) {
      report.checked += 1;
      if (currentIds.has(r.chain!.clauseContentId)) continue;

      report.staled += 1;
      r.regulationVersionMismatch = true;
      // Evidenz altert: erhoben für einen Klauseltext, den es nicht mehr
      // gibt. updateMany ist die dokumentierte WORM-Ausnahme (THE-558).
      const staled = await Evidence.updateMany(
        { requirementId: r._id, stale: { $ne: true } },
        { $set: { stale: true } },
      );
      report.evidenceStaled += staled.modifiedCount;
      if (r.gates?.attested.state === 'yes') {
        r.gates = resetAttestedForStale(r.gates);
        report.attestedReset += 1;
      }
      await r.save();
    }
  }

  return report;
}
