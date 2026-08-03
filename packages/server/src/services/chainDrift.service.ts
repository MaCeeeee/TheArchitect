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
 * Folgearbeit.
 *
 * ── DIE ZUSAGE DIESES DIENSTES (THE-575) ──
 *
 * `checked + skipped + unanchored` ergibt IMMER die Zahl der
 * Ketten-Requirements des Projekts. Nichts fällt lautlos heraus.
 *
 * Die Zusage stand schon vorher im Kopf dieser Datei — sie griff nur eine
 * Ebene zu spät: `skipped` erfasste, was den Anker-Filter PASSIERT und dessen
 * Text fehlt, nicht das, was am Filter scheitert. Am echten Bestand meldete
 * der Lauf `{checked: 2, skipped: 0}` bei 15 Requirements und las sich wie
 * „alles geprüft". 13 waren nie im Blick.
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
  /**
   * Ketten-Requirements OHNE Korpus-Anker (`normId`/`sectionEId`) — für diesen
   * Lauf grundsätzlich unprüfbar.
   *
   * DER GRUND FÜR DIESES FELD (THE-575): Sie fallen aus der Abfrage heraus und
   * wurden deshalb WEDER als `checked` NOCH als `skipped` gezählt. Der Bericht
   * meldete `{checked: 2, skipped: 0}` bei 15 Ketten-Requirements und las sich
   * wie „alles geprüft, nichts veraltet" — während 13 nie im Blick waren.
   *
   * INVARIANTE: `checked + skipped + unanchored` = Ketten-Requirements des
   * Projekts. Solange sie hält, kann nichts mehr lautlos herausfallen.
   */
  unanchored: number;
  /** Evidenz-Dokumente, die dabei stale wurden. */
  evidenceStaled: number;
  /** Attestierte Tore, die mit sichtbarem Grund zurückfielen. */
  attestedReset: number;
}

/**
 * Trennzeichen des Gruppenschlüssels: ASCII 31 (Unit Separator).
 *
 * Gewählt, weil es in keiner `normId` und keiner `eId` vorkommen kann — ein
 * `:` oder `#` täte das sehr wohl. Als Literal geschrieben wäre es UNSICHTBAR
 * (`key.split('')` liest sich dann wie ein Bug); deshalb steht es als
 * benannte Konstante hier.
 */
const GROUP_SEP = '\x1f';

export async function chainDriftCheck(
  projectId: mongoose.Types.ObjectId | string,
): Promise<ChainDriftReport> {
  const report: ChainDriftReport = {
    checked: 0, staled: 0, skipped: 0, unanchored: 0, evidenceStaled: 0, attestedReset: 0,
  };

  const anchorQuery = {
    projectId,
    chain: { $exists: true },
    normId: { $exists: true, $ne: null },
    sectionEId: { $exists: true, $ne: null },
  };

  // Was der Lauf NICHT ansehen kann, wird ZUERST gezählt (THE-575). Vorher
  // fielen diese Requirements schlicht aus der Abfrage — und damit aus dem
  // Bericht. Ein Lauf, der 87 % des Bestands verschweigt, erzeugt Vertrauen
  // ohne Deckung; das ist schlimmer als gar keine Antwort.
  const [total, anchoredCount] = await Promise.all([
    ComplianceRequirement.countDocuments({ projectId, chain: { $exists: true } }),
    ComplianceRequirement.countDocuments(anchorQuery),
  ]);
  report.unanchored = total - anchoredCount;

  const reqs = await ComplianceRequirement.find(anchorQuery);
  if (reqs.length === 0) return report;

  // Gruppieren nach (normId, sectionEId) — ein Text-Abruf und eine
  // Segmentierung je Section, nicht je Requirement.
  const groups = new Map<string, typeof reqs>();
  for (const r of reqs) {
    const key = `${r.normId}${GROUP_SEP}${r.sectionEId}`;
    if (!groups.has(key)) groups.set(key, [] as unknown as typeof reqs);
    groups.get(key)!.push(r);
  }

  for (const [key, members] of groups) {
    const [normId, sectionEId] = key.split(GROUP_SEP);
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
