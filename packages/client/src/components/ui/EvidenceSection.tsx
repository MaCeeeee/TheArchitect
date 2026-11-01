import { getEvidence, type EvidenceState } from '../../utils/evidence';

/**
 * UC-PROV-003 (THE-737) — "trust, evidenced" readout for one element:
 * is it a hypothesis or validated, where does it get validated, and where
 * did it come from. Rows without data are omitted.
 */

const BADGE: Record<EvidenceState, { label: string; color: string; dashed: boolean; hint: string }> = {
  assumption: { label: 'Assumption', color: '#f59e0b', dashed: true, hint: 'Hypothesis — not yet validated' },
  validated: { label: 'Validated', color: '#22c55e', dashed: false, hint: 'Explicitly marked as validated' },
  planned: { label: 'Planned', color: '#06b6d4', dashed: false, hint: 'Target state — not flagged as assumption or validated' },
  unassessed: { label: 'Not assessed', color: '#64748b', dashed: false, hint: 'No assumption/validation flag recorded' },
};

interface EvidenceSectionProps {
  element: {
    status?: string;
    metadata?: Record<string, unknown>;
    source?: string;
    provenance?: string;
    certifiedAt?: string;
  };
}

export function EvidenceSection({ element }: EvidenceSectionProps) {
  const ev = getEvidence(element);
  const badge = BADGE[ev.state];
  const origin = [ev.source, ev.provenance].filter(Boolean).join(' · ');

  return (
    <div>
      <h4 className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-tertiary)] mb-2">Evidence</h4>
      <div className="flex items-center justify-between text-xs py-0.5">
        <span className="text-[var(--text-secondary)]">State</span>
        <span
          data-testid="evidence-badge"
          title={badge.hint}
          className="px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider"
          style={{
            color: badge.color,
            border: `1px ${badge.dashed ? 'dashed' : 'solid'} ${badge.color}88`,
            background: `${badge.color}15`,
          }}
        >
          {badge.label}
        </span>
      </div>
      {ev.note && <Row label="Note"><span className="text-white">{ev.note}</span></Row>}
      {ev.since && <Row label="Since"><span className="text-white">{ev.since}</span></Row>}
      {ev.validationRef && (
        <Row label="Validation">
          {ev.validationHref ? (
            <a
              href={ev.validationHref}
              target="_blank"
              rel="noopener noreferrer"
              className="font-mono text-[10px] text-[#a78bfa] hover:underline break-all"
            >
              {ev.validationRef}
            </a>
          ) : (
            <span className="font-mono text-[10px] text-[#a78bfa] break-all select-all" title={ev.validationRef}>
              {ev.validationRef}
            </span>
          )}
        </Row>
      )}
      {ev.previousName && (
        <Row label="Previously">
          <span className="text-[var(--text-secondary)]">
            {ev.previousName}{ev.changedOn ? ` (until ${ev.changedOn})` : ''}
          </span>
        </Row>
      )}
      {origin && (
        <Row label="Source">
          <span data-testid="evidence-source" className="text-white">{origin}</span>
        </Row>
      )}
      {ev.certifiedAt && (
        <Row label="Certified"><span className="text-white">{ev.certifiedAt.slice(0, 10)}</span></Row>
      )}
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 text-xs py-0.5">
      <span className="text-[var(--text-secondary)] shrink-0">{label}</span>
      <span className="text-right min-w-0">{children}</span>
    </div>
  );
}
