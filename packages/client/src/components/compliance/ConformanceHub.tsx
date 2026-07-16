// ─── Conformance Hub (ADR-0003, THE-388) ────────────────────────────────────
// Entry router for the Conformance section. Every gate answers the same
// question — "does a SUBJECT satisfy a NORM, and where are the gaps?" — so the
// hub asks it in plain language and routes to the right sub-area. The gate
// verbs (Cover/Enforce/Attest) are an internal model, shown only as badges.
import { useNavigate, useParams } from 'react-router-dom';
import { FileText, Shield, Workflow, ArrowRight } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

interface GateCard {
  verb: 'Cover' | 'Enforce' | 'Attest';
  icon: LucideIcon;
  question: string;
  subject: string;
  norm: string;
  description: string;
  target: string; // compliance section id
}

export const GATE_CARDS: GateCard[] = [
  {
    verb: 'Cover',
    icon: FileText,
    question: 'Check your architecture against standards',
    subject: 'Your model',
    norm: 'External standards & regulations (ISO, TOGAF, …)',
    description:
      'See what your architecture already satisfies, where coverage is missing, and generate remediation for the gaps.',
    target: 'standards',
  },
  {
    verb: 'Enforce',
    icon: Shield,
    question: 'Check your architecture against your own policies',
    subject: 'Your model',
    norm: 'Internal policies (rules-as-data)',
    description:
      'Evaluate the architecture graph against your governance rules and see every violation on the policy board.',
    target: 'compliance-dashboard',
  },
  {
    verb: 'Attest',
    icon: Workflow,
    question: 'Check a workflow against a regulation',
    subject: 'Imported workflow (n8n)',
    norm: 'Statutory record requirements (GDPR Art. 30)',
    description:
      'Import an automation, get an honest completeness verdict, and sign off what only a human can attest.',
    target: 'assess',
  },
];

export type GateVerb = GateCard['verb'];

export default function ConformanceHub({ scopeVerb }: { scopeVerb?: GateVerb } = {}) {
  const navigate = useNavigate();
  const { projectId } = useParams<{ projectId: string }>();

  const orderedCards = scopeVerb
    ? [GATE_CARDS.find((c) => c.verb === scopeVerb)!, ...GATE_CARDS.filter((c) => c.verb !== scopeVerb)]
    : GATE_CARDS;

  return (
    <div className="space-y-6" data-testid="conformance-hub">
      <div>
        <h2 className="text-lg font-semibold text-white">Conformance</h2>
        <p className="text-sm text-[var(--text-secondary)] mt-1">
          Every check here answers the same question: does a <span className="text-white">subject</span> satisfy a{' '}
          <span className="text-white">norm</span> — and where are the gaps? Pick what you want to check.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {orderedCards.map((card) => {
          const isScoped = scopeVerb === card.verb;
          return (
          <button
            key={card.verb}
            onClick={() => navigate(`/project/${projectId}/compliance/${card.target}`)}
            data-testid={`gate-card-${card.verb.toLowerCase()}`}
            {...(scopeVerb ? { 'data-scoped': isScoped } : {})}
            aria-current={isScoped ? 'true' : undefined}
            className={`group flex flex-col items-start gap-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-raised)] p-5 text-left transition hover:border-[#7c3aed] hover:bg-[#7c3aed]/5${isScoped ? ' border-[#7c3aed] ring-1 ring-[#7c3aed]/40' : ''}`}
          >
            <div className="flex w-full items-center justify-between">
              <card.icon size={20} className="text-[#a78bfa]" />
              <span className="rounded bg-[rgba(255,255,255,0.05)] px-1.5 py-0.5 text-[9px] font-medium text-[var(--text-tertiary)]">
                {card.verb}
              </span>
              {isScoped && (
                <span className="rounded bg-[#7c3aed]/15 px-1.5 py-0.5 text-[9px] font-medium text-[#a78bfa]">
                  For this station
                </span>
              )}
            </div>

            <p className="text-sm font-semibold text-white leading-snug">{card.question}</p>

            <div className="space-y-1 text-[10px]">
              <p className="text-[var(--text-tertiary)]">
                <span className="uppercase tracking-wider">Subject:</span>{' '}
                <span className="text-[var(--text-secondary)]">{card.subject}</span>
              </p>
              <p className="text-[var(--text-tertiary)]">
                <span className="uppercase tracking-wider">Norm:</span>{' '}
                <span className="text-[var(--text-secondary)]">{card.norm}</span>
              </p>
            </div>

            <p className="text-[11px] text-[var(--text-secondary)] leading-snug flex-1">{card.description}</p>

            <span className="flex items-center gap-1 text-[11px] text-[#a78bfa] opacity-0 transition group-hover:opacity-100">
              Open <ArrowRight size={12} />
            </span>
          </button>
          );
        })}
      </div>

      <p className="text-[10px] text-[var(--text-tertiary)] max-w-2xl">
        The first two check the model you built. The third certifies something imported from outside — that is why it
        carries a sign-off step: the machine states only what it can know, a human attests the rest.
      </p>

      {scopeVerb && (
        <p className="text-[10px] text-[var(--text-tertiary)]">Each card opens in the classic UI.</p>
      )}
    </div>
  );
}
