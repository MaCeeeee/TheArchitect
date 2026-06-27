// UC-WFCOMP-001 / REQ-WFCOMP-001.6 (THE-357) — Art. 30 verdict view.
//
// Honest three-list output (never an aggregate "% compliant"):
//   green  = covered (machine-extracted or human-attested)
//   yellow = AI-suggested, awaiting confirmation
//   red    = open: a structural gap, or a field that needs your input
//
// Obviousness (Ousterhout symptom 3 — reduce unknown-unknowns): a single lead
// line states exactly what's left to do, items are phrased as ACTIONS, ordered
// by criticality so the fastest path to "complete" is obvious. UI strings: English.

import { ShieldCheck, ShieldAlert, CircleCheck } from 'lucide-react';
import type { WfcompGapReport, WfcompFieldResult } from '@thearchitect/shared';

const FIELD_LABEL: Record<string, string> = {
  a: 'Controller & contact details',
  b: 'Purpose of processing',
  c: 'Categories of data subjects & data',
  d: 'Categories of recipients',
  e: 'Third-country transfer safeguards',
  f: 'Erasure deadlines',
  g: 'Technical & organisational measures',
};

// Imperative action for open (red) items — "what to do", not a status label.
const RED_ACTION: Record<string, string> = {
  a: 'Provide the controller & DPO contact details',
  b: 'Provide the processing purpose',
  c: 'Provide the data-subject categories',
  d: 'Add the recipient(s) the data is disclosed to',
  e: 'Document safeguards for the third-country transfer',
  f: 'Provide erasure deadlines per data category',
  g: 'Describe the technical & organisational measures (Art. 32)',
};

const CRIT_ORDER: Record<string, number> = { HART: 0, BEDINGT: 1, WEICH: 2 };
const MACHINE_LITERAE = new Set(['d', 'e']);

const GREEN = '#22c55e';
const AMBER = '#eab308'; // confirm — never alarm-red
const RED = '#f43f5e'; // genuine open gap / required input

type Bucket = 'green' | 'yellow' | 'red';
function bucketOf(f: WfcompFieldResult): Bucket {
  if (f.status === 'present') return 'green';
  if (f.status === 'needs_attestation' && f.mode === 'confirm') return 'yellow';
  return 'red'; // missing OR needs_attestation + ask
}

export default function WfcompVerdict({ report }: { report: WfcompGapReport }) {
  if (!report.gdprScope) {
    return (
      <div
        data-testid="not-applicable"
        className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-base)] px-4 py-3 text-sm text-[var(--text-secondary)]"
      >
        Art. 30 not applicable — no personal data processed.
      </div>
    );
  }

  const sorted = [...report.fields].sort(
    (a, b) => CRIT_ORDER[a.criticality] - CRIT_ORDER[b.criticality],
  );
  const green = sorted.filter((f) => bucketOf(f) === 'green');
  const yellow = sorted.filter((f) => bucketOf(f) === 'yellow');
  const red = sorted.filter((f) => bucketOf(f) === 'red');

  const confirmN = yellow.length;
  const provideN = red.filter((f) => f.status === 'needs_attestation').length;
  const gapN = red.filter((f) => f.status === 'missing').length;

  // G11: complete ⟺ every HART + BEDINGT field is present (WEICH may stay open).
  const complete = report.fields
    .filter((f) => f.criticality !== 'WEICH')
    .every((f) => f.status === 'present');

  // Obviousness lead — exactly what's left, imperative, non-zero parts only.
  const parts: string[] = [];
  if (confirmN) parts.push(`confirm ${confirmN} suggestion${confirmN === 1 ? '' : 's'}`);
  if (provideN) parts.push(`provide ${provideN} detail${provideN === 1 ? '' : 's'}`);
  if (gapN) parts.push(`fix ${gapN} gap${gapN === 1 ? '' : 's'}`);

  return (
    <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-base)] p-4">
      {/* Lead — the obviousness anchor. Never "% compliant", never "compliant" without attestation. */}
      <div data-testid="verdict-lead" className="flex items-start gap-2">
        {complete ? (
          <ShieldCheck size={18} style={{ color: GREEN }} className="mt-0.5 shrink-0" />
        ) : (
          <ShieldAlert size={18} style={{ color: AMBER }} className="mt-0.5 shrink-0" />
        )}
        <div>
          {complete ? (
            <p className="text-sm font-semibold text-[var(--text-primary)]">
              Complete — structure and mandatory fields covered.
            </p>
          ) : (
            <>
              <p className="text-sm font-semibold text-[var(--text-primary)]">
                Structure checked — {parts.join(' · ')} to finish.
              </p>
              <p className="mt-0.5 text-xs text-[var(--text-tertiary)]">
                The mandatory fields need your sign-off — we never sign this off for you.
              </p>
            </>
          )}
        </div>
      </div>

      {red.length > 0 && (
        <Section testId="list-red" title="Open — needs action" color={RED}>
          {red.map((f) => (
            <Item key={f.litera} crit={f.criticality} color={RED}>
              {RED_ACTION[f.litera] ?? FIELD_LABEL[f.litera]}
            </Item>
          ))}
        </Section>
      )}

      {yellow.length > 0 && (
        <Section testId="list-yellow" title="To confirm" color={AMBER}>
          {yellow.map((f) => (
            <Item key={f.litera} crit={f.criticality} color={AMBER}>
              Confirm: “{f.suggestion?.value}” — {FIELD_LABEL[f.litera]}
            </Item>
          ))}
        </Section>
      )}

      {green.length > 0 && (
        <Section testId="list-green" title="Covered" color={GREEN}>
          {green.map((f) => (
            <Item key={f.litera} crit={f.criticality} color={GREEN}>
              <span className="inline-flex items-center gap-1.5">
                <CircleCheck size={13} style={{ color: GREEN }} />
                {FIELD_LABEL[f.litera]}
                <span className="rounded-full bg-[var(--border-subtle)] px-1.5 py-0.5 text-[10px] text-[var(--text-tertiary)]">
                  {MACHINE_LITERAE.has(f.litera) ? 'machine' : 'attested'}
                </span>
              </span>
            </Item>
          ))}
        </Section>
      )}
    </div>
  );
}

function Section({
  testId,
  title,
  color,
  children,
}: {
  testId: string;
  title: string;
  color: string;
  children: React.ReactNode;
}) {
  return (
    <div data-testid={testId} className="mt-3 border-t border-[var(--border-subtle)] pt-2">
      <p className="text-[11px] font-semibold uppercase tracking-wide" style={{ color }}>
        {title}
      </p>
      <ul className="mt-1 space-y-1">{children}</ul>
    </div>
  );
}

function Item({
  crit,
  color,
  children,
}: {
  crit: string;
  color: string;
  children: React.ReactNode;
}) {
  return (
    <li className="flex items-start gap-2 text-xs text-[var(--text-secondary)]">
      <span
        title={crit}
        className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full"
        style={{ backgroundColor: color }}
      />
      <span>{children}</span>
      <span className="ml-auto text-[10px] text-[var(--text-tertiary)]">{crit}</span>
    </li>
  );
}
