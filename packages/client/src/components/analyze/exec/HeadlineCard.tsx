import { CheckCircle, AlertTriangle, AlertOctagon, Info, type LucideIcon } from 'lucide-react';
import type { ExecutiveHeadline, HeadlineTone } from '@thearchitect/shared';

const TONE_STYLES: Record<HeadlineTone, { wrap: string; iconColor: string; icon: LucideIcon }> = {
  positive: {
    wrap: 'bg-emerald-500/10 border-emerald-500/40',
    iconColor: 'text-emerald-300',
    icon: CheckCircle,
  },
  warning: {
    wrap: 'bg-amber-500/10 border-amber-500/40',
    iconColor: 'text-amber-300',
    icon: AlertTriangle,
  },
  critical: {
    wrap: 'bg-red-500/10 border-red-500/40',
    iconColor: 'text-red-300',
    icon: AlertOctagon,
  },
  neutral: {
    wrap: 'bg-slate-500/10 border-slate-500/40',
    iconColor: 'text-slate-300',
    icon: Info,
  },
};

interface Props {
  headline: ExecutiveHeadline;
}

export default function HeadlineCard({ headline }: Props) {
  const style = TONE_STYLES[headline.tone];
  const Icon = style.icon;
  return (
    <div
      className={`border rounded-lg p-4 flex items-start gap-3 ${style.wrap}`}
      data-testid={`headline-${headline.tone}`}
    >
      <Icon size={28} className={style.iconColor} aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <h3 className="text-xl font-semibold text-white truncate">{headline.title}</h3>
        <p className="text-sm text-[var(--text-secondary)] mt-1">{headline.subtitle}</p>
      </div>
    </div>
  );
}
