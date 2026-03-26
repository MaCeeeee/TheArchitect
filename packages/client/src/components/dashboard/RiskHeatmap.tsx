import { Shield } from 'lucide-react';
import type { Project, RiskData } from '../../hooks/usePortfolioData';

interface Props {
  projects: Project[];
  risk: Record<string, RiskData | null>;
  onProjectClick: (id: string) => void;
}

const COLS = [
  { key: 'critical' as const, label: 'Critical', color: 'bg-red-500' },
  { key: 'high' as const, label: 'High', color: 'bg-orange-500' },
  { key: 'medium' as const, label: 'Medium', color: 'bg-yellow-500' },
  { key: 'low' as const, label: 'Low', color: 'bg-green-500' },
] as const;

export default function RiskHeatmap({ projects, risk, onProjectClick }: Props) {
  const rows = projects
    .filter((p) => risk[p._id]?.summary)
    .map((p) => ({ project: p, summary: risk[p._id]!.summary }));

  if (rows.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-center">
        <Shield size={32} className="text-[var(--text-tertiary)] mb-2" />
        <p className="text-sm text-[var(--text-tertiary)]">No risk data available</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-[var(--border-subtle)]">
      <table className="w-full text-xs">
        <thead>
          <tr className="bg-[var(--surface-raised)]">
            <th className="text-left px-3 py-2.5 text-[var(--text-secondary)] font-medium">Project</th>
            {COLS.map((c) => (
              <th key={c.key} className="text-center px-3 py-2.5 text-[var(--text-secondary)] font-medium w-20">{c.label}</th>
            ))}
            <th className="text-center px-3 py-2.5 text-[var(--text-secondary)] font-medium w-16">Total</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ project, summary }) => {
            const total = summary.critical + summary.high + summary.medium + summary.low;
            return (
              <tr
                key={project._id}
                onClick={() => onProjectClick(project._id)}
                className="cursor-pointer border-t border-[var(--border-subtle)] hover:bg-white/[0.02] transition"
              >
                <td className="px-3 py-2.5 text-white font-medium">{project.name}</td>
                {COLS.map((c) => {
                  const count = summary[c.key];
                  const opacity = count === 0 ? 0 : Math.min(10 + count * 8, 40);
                  return (
                    <td key={c.key} className="text-center px-3 py-2.5">
                      {count > 0 ? (
                        <span
                          className={`inline-flex items-center justify-center w-7 h-7 rounded text-[11px] font-bold text-white ${c.color}`}
                          style={{ opacity: opacity / 100 + 0.6 }}
                        >
                          {count}
                        </span>
                      ) : (
                        <span className="text-[var(--text-disabled)]">-</span>
                      )}
                    </td>
                  );
                })}
                <td className="text-center px-3 py-2.5 text-[var(--text-secondary)] font-medium">{total}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
