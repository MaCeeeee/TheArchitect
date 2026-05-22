import { useNavigate, useParams } from 'react-router-dom';
import type { LucideIcon } from 'lucide-react';

export interface KpiCardProps {
  label: string;
  value: string | number;
  sub?: string;
  icon?: LucideIcon;
  iconColor?: string;
  target?: string | null;
  badge?: string;
  testId?: string;
}

export default function KpiCard({
  label,
  value,
  sub,
  icon: Icon,
  iconColor,
  target,
  badge,
  testId,
}: KpiCardProps) {
  const navigate = useNavigate();
  const { projectId } = useParams<{ projectId: string }>();

  const handleClick = () => {
    if (target && projectId) {
      navigate(`/project/${projectId}/analyze/${target}`);
    }
  };

  const interactive = Boolean(target);

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={!interactive}
      className={`bg-[var(--surface-raised)] border border-[var(--border-subtle)] rounded-lg p-4 text-left transition group ${
        interactive
          ? 'hover:border-[#7c3aed]/50 cursor-pointer'
          : 'cursor-default opacity-90'
      }`}
      data-testid={testId ?? `kpi-${label.toLowerCase().replace(/\s+/g, '-')}`}
    >
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          {Icon ? <Icon size={16} style={iconColor ? { color: iconColor } : undefined} /> : null}
          <span className="text-xs font-medium text-[var(--text-tertiary)] uppercase tracking-wider">
            {label}
          </span>
        </div>
        {badge ? (
          <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-[#3b82f6]/20 text-[#3b82f6] border border-[#3b82f6]/40">
            {badge}
          </span>
        ) : null}
      </div>
      <div className="text-xl font-bold text-white mb-1">{value}</div>
      {sub ? <p className="text-[11px] text-[var(--text-tertiary)] truncate">{sub}</p> : null}
    </button>
  );
}
