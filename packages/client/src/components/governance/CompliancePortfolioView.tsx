import React, { useEffect } from 'react';
import { Shield, CheckCircle, AlertTriangle, XCircle, Star } from 'lucide-react';
import { useComplianceStore } from '../../stores/complianceStore';
import { useArchitectureStore } from '../../stores/architectureStore';

const STAGE_LABELS: Record<string, string> = {
  uploaded: 'Uploaded',
  mapped: 'Mapped',
  policies_generated: 'Policies',
  roadmap_ready: 'Roadmap',
  tracking: 'Tracking',
};

const STAGE_COLORS: Record<string, string> = {
  uploaded: 'text-gray-400',
  mapped: 'text-blue-400',
  policies_generated: 'text-amber-400',
  roadmap_ready: 'text-green-400',
  tracking: 'text-emerald-400',
};

function MaturityStars({ level }: { level: number }) {
  return (
    <div className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map((i) => (
        <Star
          key={i}
          size={12}
          className={i <= level ? 'text-amber-400 fill-amber-400' : 'text-gray-600'}
        />
      ))}
    </div>
  );
}

function CoverageRing({ coverage }: { coverage: number }) {
  const radius = 18;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference - (coverage / 100) * circumference;
  const color = coverage >= 80 ? '#22c55e' : coverage >= 50 ? '#f59e0b' : '#ef4444';

  return (
    <div className="relative w-12 h-12">
      <svg width="48" height="48" className="transform -rotate-90">
        <circle cx="24" cy="24" r={radius} fill="none" stroke="#1e293b" strokeWidth="4" />
        <circle
          cx="24" cy="24" r={radius} fill="none" stroke={color} strokeWidth="4"
          strokeDasharray={circumference} strokeDashoffset={dashOffset}
          strokeLinecap="round"
        />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center text-[11px] font-bold text-white">
        {coverage}%
      </span>
    </div>
  );
}

export function CompliancePortfolioView() {
  const { portfolioOverview, isLoading, loadPortfolio } = useComplianceStore();
  const projectId = useArchitectureStore((s) => s.projectId);

  useEffect(() => {
    if (projectId) loadPortfolio(projectId);
  }, [projectId, loadPortfolio]);

  if (isLoading) {
    return (
      <div className="p-4 text-gray-400 text-sm">Loading compliance portfolio...</div>
    );
  }

  if (!portfolioOverview || portfolioOverview.portfolio.length === 0) {
    return (
      <div className="p-4">
        <div className="text-center text-gray-500 py-8">
          <Shield size={32} className="mx-auto mb-2 text-gray-600" />
          <p className="text-sm">No standards uploaded yet.</p>
          <p className="text-xs text-gray-600 mt-1">
            Upload a compliance standard in the AI Copilot → Standards tab.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-3 space-y-3">
      {/* Portfolio Summary */}
      <div className="flex gap-3 text-xs">
        <div className="bg-[#111827] border border-[var(--border-subtle)] rounded px-3 py-2 flex-1">
          <span className="text-gray-500">Standards</span>
          <span className="text-white font-mono ml-2">
            {portfolioOverview.trackedStandards}/{portfolioOverview.totalStandards}
          </span>
        </div>
      </div>

      {/* Standard Cards */}
      {portfolioOverview.portfolio.map((item) => (
        <div
          key={item.standardId}
          className="bg-[#111827] border border-[var(--border-subtle)] rounded-lg p-3 hover:border-[var(--border-subtle)] transition-colors cursor-pointer"
        >
          <div className="flex items-start justify-between mb-2">
            <div>
              <div className="text-sm font-medium text-white">{item.standardName}</div>
              <div className="text-xs text-gray-500">
                {item.standardType.toUpperCase()} {item.standardVersion}
              </div>
            </div>
            <CoverageRing coverage={item.coverage} />
          </div>

          <div className="flex items-center justify-between">
            <MaturityStars level={item.maturityLevel} />
            <span className={`text-xs font-mono ${STAGE_COLORS[item.stage] || 'text-gray-400'}`}>
              {STAGE_LABELS[item.stage] || item.stage}
            </span>
          </div>

          {/* Mapping stats bar */}
          <div className="mt-2 flex gap-1 h-1.5 rounded-full overflow-hidden bg-[var(--surface-overlay)]">
            {item.mappingStats.total > 0 && (
              <>
                <div
                  className="bg-green-500"
                  style={{ width: `${(item.mappingStats.compliant / item.mappingStats.total) * 100}%` }}
                />
                <div
                  className="bg-amber-500"
                  style={{ width: `${(item.mappingStats.partial / item.mappingStats.total) * 100}%` }}
                />
                <div
                  className="bg-red-500"
                  style={{ width: `${(item.mappingStats.gap / item.mappingStats.total) * 100}%` }}
                />
              </>
            )}
          </div>
          <div className="flex justify-between text-[10px] text-gray-500 mt-1">
            <span>
              <CheckCircle size={10} className="inline text-green-500 mr-0.5" />
              {item.mappingStats.compliant}
            </span>
            <span>
              <AlertTriangle size={10} className="inline text-amber-500 mr-0.5" />
              {item.mappingStats.partial}
            </span>
            <span>
              <XCircle size={10} className="inline text-red-500 mr-0.5" />
              {item.mappingStats.gap}
            </span>
            <span className="text-gray-600">{item.mappingStats.unmapped} unmapped</span>
          </div>
        </div>
      ))}
    </div>
  );
}
