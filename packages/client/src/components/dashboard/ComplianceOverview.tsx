import { useMemo } from 'react';
import { Shield, Star } from 'lucide-react';
import type { ComplianceData } from '../../hooks/usePortfolioData';

interface Props {
  compliance: Record<string, ComplianceData | null>;
}

const STAGE_LABELS: Record<string, string> = {
  uploaded: 'Uploaded',
  mapped: 'Mapped',
  policies_generated: 'Policies',
  roadmap_ready: 'Roadmap',
  tracking: 'Tracking',
  audit_ready: 'Audit Ready',
};

const STAGE_COLORS: Record<string, string> = {
  uploaded: 'text-gray-400 bg-gray-400/10',
  mapped: 'text-blue-400 bg-blue-400/10',
  policies_generated: 'text-amber-400 bg-amber-400/10',
  roadmap_ready: 'text-green-400 bg-green-400/10',
  tracking: 'text-emerald-400 bg-emerald-400/10',
  audit_ready: 'text-emerald-300 bg-emerald-300/10',
};

interface AggregatedStandard {
  name: string;
  avgCoverage: number;
  maxMaturity: number;
  bestStage: string;
  projectCount: number;
}

export default function ComplianceOverview({ compliance }: Props) {
  const standards = useMemo(() => {
    const map = new Map<string, { coverages: number[]; maturities: number[]; stages: string[]; count: number }>();

    for (const data of Object.values(compliance)) {
      if (!data?.portfolio) continue;
      for (const item of data.portfolio) {
        const name = item.standardName || 'Unknown';
        const existing = map.get(name) || { coverages: [], maturities: [], stages: [], count: 0 };
        existing.coverages.push(item.coverage ?? 0);
        existing.maturities.push(item.maturityLevel ?? 1);
        existing.stages.push(item.stage ?? 'uploaded');
        existing.count++;
        map.set(name, existing);
      }
    }

    const STAGE_ORDER = ['uploaded', 'mapped', 'policies_generated', 'roadmap_ready', 'tracking', 'audit_ready'];

    const result: AggregatedStandard[] = [];
    for (const [name, data] of map.entries()) {
      const avgCoverage = Math.round(data.coverages.reduce((a, b) => a + b, 0) / data.coverages.length);
      const maxMaturity = Math.max(...data.maturities);
      const bestStage = data.stages.sort((a, b) => STAGE_ORDER.indexOf(b) - STAGE_ORDER.indexOf(a))[0];
      result.push({ name, avgCoverage, maxMaturity, bestStage, projectCount: data.count });
    }

    return result.sort((a, b) => b.avgCoverage - a.avgCoverage);
  }, [compliance]);

  if (standards.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-center">
        <Shield size={32} className="text-[var(--text-tertiary)] mb-2" />
        <p className="text-sm text-[var(--text-tertiary)]">No compliance standards tracked</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-[var(--border-subtle)]">
      <table className="w-full text-xs">
        <thead>
          <tr className="bg-[var(--surface-raised)]">
            <th className="text-left px-3 py-2.5 text-[var(--text-secondary)] font-medium">Standard</th>
            <th className="text-left px-3 py-2.5 text-[var(--text-secondary)] font-medium w-40">Coverage</th>
            <th className="text-center px-3 py-2.5 text-[var(--text-secondary)] font-medium w-28">Maturity</th>
            <th className="text-center px-3 py-2.5 text-[var(--text-secondary)] font-medium w-24">Stage</th>
            <th className="text-center px-3 py-2.5 text-[var(--text-secondary)] font-medium w-20">Projects</th>
          </tr>
        </thead>
        <tbody>
          {standards.map((std) => {
            const barColor = std.avgCoverage >= 80 ? '#22c55e' : std.avgCoverage >= 50 ? '#eab308' : '#ef4444';
            const stageStyle = STAGE_COLORS[std.bestStage] || STAGE_COLORS.uploaded;

            return (
              <tr key={std.name} className="border-t border-[var(--border-subtle)]">
                <td className="px-3 py-2.5 text-white font-medium">{std.name}</td>
                <td className="px-3 py-2.5">
                  <div className="flex items-center gap-2">
                    <div className="flex-1 h-1.5 rounded-full bg-white/5 overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-500"
                        style={{ width: `${std.avgCoverage}%`, backgroundColor: barColor }}
                      />
                    </div>
                    <span className="text-[11px] text-[var(--text-secondary)] w-8 text-right">{std.avgCoverage}%</span>
                  </div>
                </td>
                <td className="px-3 py-2.5">
                  <div className="flex justify-center gap-0.5">
                    {[1, 2, 3, 4, 5].map((i) => (
                      <Star
                        key={i}
                        size={11}
                        className={i <= std.maxMaturity ? 'text-amber-400 fill-amber-400' : 'text-gray-700'}
                      />
                    ))}
                  </div>
                </td>
                <td className="px-3 py-2.5 text-center">
                  <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-medium ${stageStyle}`}>
                    {STAGE_LABELS[std.bestStage] || std.bestStage}
                  </span>
                </td>
                <td className="px-3 py-2.5 text-center text-[var(--text-secondary)]">{std.projectCount}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
