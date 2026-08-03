/**
 * auditBundle — das Prüfer-Bündel (THE-559, Slice 3 von UC-ATTEST-001).
 *
 * „Kann ich das dem Prüfer zeigen?" — Export je Norm: alle Anforderungen mit
 * ihrem Drei-Tore-Tripel und der Evidenz-Kette.
 *
 * ── DIE EINE REGEL ──
 *
 * Das Bündel behauptet nur, was die Tore hergeben:
 *   - „covered, not attested" steht als Label da, nicht in einer Fußnote.
 *   - stale Evidenzen erscheinen ALS stale mit Grund — nie gefiltert. Ein
 *     Prüfer soll sehen, was veraltet ist, nicht es suchen müssen.
 *   - Zählungen je Tor-Zustand, aber KEIN Score und KEINE Prozentzahl —
 *     „73 % Compliance" ist die Zahl, die keiner Prüfung standhält.
 *   - Eine Norm ohne attestierte Anforderung ergibt ein GÜLTIGES Bündel,
 *     das genau das wörtlich sagt.
 *
 * REIN (Builder) + PDF-Renderer (pdfkit, Muster report.service.ts).
 */
import PDFDocument from 'pdfkit';
import type { RequirementGates } from '@thearchitect/shared';

export interface AuditBundleEvidenceInput {
  id: string;
  kind: string;
  ref: string;
  sha256: string;
  collectedAt: string;
  regulationVersionHash?: string;
  stale?: boolean;
  supersedes?: string;
}

export interface AuditBundleRequirementInput {
  id: string;
  title: string;
  priority: string;
  status: string;
  gates?: RequirementGates;
  evidence: AuditBundleEvidenceInput[];
}

export interface AuditBundleInput {
  projectName: string;
  generatedAt: string; // ISO — vom Aufrufer, damit der Builder rein bleibt
  norms: Array<{ label: string; requirements: AuditBundleRequirementInput[] }>;
}

export const AUDIT_BUNDLE_DISCLAIMER =
  'This bundle reports implementation and evidence status as recorded in TheArchitect. ' +
  'It is decision support based on recorded gates and referenced evidence — not legal advice, ' +
  'and no green gate releases the organisation from its legal basis.';

const UNKNOWN = { state: 'unknown' as const };

interface BundleEvidence extends AuditBundleEvidenceInput {
  /** Bei stale: der Grund, sichtbar im Bündel. */
  note?: string;
}

interface BundleRequirement {
  id: string;
  title: string;
  priority: string;
  status: string;
  gates: RequirementGates;
  /** Das Ehrlichkeits-Label — z. B. "covered, not attested". */
  honesty: string | null;
  evidence: BundleEvidence[];
}

export interface AuditBundle {
  projectName: string;
  generatedAt: string;
  disclaimer: string;
  norms: Array<{
    label: string;
    counts: { total: number; covered: number; enforced: number; attested: number };
    /** Die wörtliche Null-Aussage, wenn nichts attestiert ist. */
    statement: string | null;
    requirements: BundleRequirement[];
  }>;
}

function honestyLabel(gates: RequirementGates): string | null {
  if (gates.covered.state === 'yes' && gates.attested.state !== 'yes') return 'covered, not attested';
  if (gates.covered.state === 'unknown' && gates.enforced.state === 'unknown' && gates.attested.state === 'unknown') {
    return 'never assessed';
  }
  return null;
}

/** REIN — baut das maschinenlesbare Bündel. */
export function buildAuditBundle(input: AuditBundleInput): AuditBundle {
  return {
    projectName: input.projectName,
    generatedAt: input.generatedAt,
    disclaimer: AUDIT_BUNDLE_DISCLAIMER,
    norms: input.norms.map((norm) => {
      const requirements: BundleRequirement[] = norm.requirements.map((r) => {
        const gates: RequirementGates = r.gates ?? { covered: UNKNOWN, enforced: UNKNOWN, attested: UNKNOWN };
        return {
          id: r.id,
          title: r.title,
          priority: r.priority,
          status: r.status,
          gates,
          honesty: honestyLabel(gates),
          evidence: r.evidence.map((e) => ({
            ...e,
            ...(e.stale
              ? { note: 'stale — collected for an earlier law text version; does not attest the current text' }
              : {}),
          })),
        };
      });
      const counts = {
        total: requirements.length,
        covered: requirements.filter((r) => r.gates.covered.state === 'yes').length,
        enforced: requirements.filter((r) => r.gates.enforced.state === 'yes').length,
        attested: requirements.filter((r) => r.gates.attested.state === 'yes').length,
      };
      return {
        label: norm.label,
        counts,
        statement:
          counts.attested === 0
            ? `No requirement of "${norm.label}" is attested yet — this bundle states that plainly instead of hiding it.`
            : null,
        requirements,
      };
    }),
  };
}

// ─── PDF ─────────────────────────────────────────────────────────────────
const MARGIN = 50;

function gateLine(g: RequirementGates): string {
  const one = (label: string, d: { state: string; setBy?: string; setAt?: string }): string =>
    `${label}:${d.state}${d.state !== 'unknown' && d.setBy ? ` (${d.setBy === 'system' ? 'system' : d.setBy}${d.setAt ? `, ${d.setAt.slice(0, 10)}` : ''})` : ''}`;
  return [one('covered', g.covered), one('enforced', g.enforced), one('attested', g.attested)].join('   ');
}

/** Rendert das Bündel als PDF. Buffer, kein Stream — der Aufrufer entscheidet. */
export function renderAuditBundlePdf(bundle: AuditBundle): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: MARGIN });
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    doc.font('Helvetica-Bold').fontSize(16).text('Audit bundle — implementation & evidence status');
    doc.moveDown(0.3);
    doc.font('Helvetica').fontSize(9).fillColor('#555')
      .text(`Project: ${bundle.projectName}   ·   Generated: ${bundle.generatedAt}`);
    doc.moveDown(0.5);
    doc.fontSize(8).fillColor('#777').text(bundle.disclaimer);
    doc.fillColor('#000');

    for (const norm of bundle.norms) {
      doc.moveDown(1);
      doc.font('Helvetica-Bold').fontSize(13).text(norm.label);
      doc.font('Helvetica').fontSize(9).fillColor('#555').text(
        `${norm.counts.total} requirement(s) — covered: ${norm.counts.covered} · enforced: ${norm.counts.enforced} · attested: ${norm.counts.attested}`,
      );
      doc.fillColor('#000');

      if (norm.statement) {
        doc.moveDown(0.3);
        doc.font('Helvetica-Oblique').fontSize(10).text(norm.statement);
        doc.font('Helvetica');
      }

      for (const r of norm.requirements) {
        doc.moveDown(0.6);
        doc.font('Helvetica-Bold').fontSize(10).text(`${r.title}  [${r.priority}]`);
        doc.font('Helvetica').fontSize(9).text(gateLine(r.gates));
        if (r.honesty) doc.font('Helvetica-Oblique').fontSize(9).fillColor('#8a6d00').text(r.honesty).fillColor('#000').font('Helvetica');
        for (const e of r.evidence) {
          doc.fontSize(8).fillColor(e.stale ? '#8a6d00' : '#333').text(
            `• [${e.kind}] ${e.ref}  sha256:${e.sha256.slice(0, 12)}…  collected:${e.collectedAt.slice(0, 10)}` +
              `${e.regulationVersionHash ? `  textVersion:${e.regulationVersionHash.slice(0, 10)}` : ''}` +
              `${e.supersedes ? `  supersedes:${e.supersedes}` : ''}` +
              `${e.stale ? `  — ${e.note}` : ''}`,
          );
        }
        doc.fillColor('#000');
      }
    }

    doc.end();
  });
}
