import { useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { RefreshCw, Loader2, AlertCircle, CheckCircle2, ShieldAlert } from 'lucide-react';
import { useAdvisorStore } from '../../stores/advisorStore';
import HealthScoreRing from './HealthScoreRing';
import InsightCard from './InsightCard';
import type { InsightSeverity } from '@thearchitect/shared';

export default function AdvisorPanel() {
  const { projectId } = useParams();
  const {
    healthScore, insights, isScanning, lastScanAt, error, totalElements,
    scanDurationMs, scan, clear,
  } = useAdvisorStore();

  // Auto-scan on mount if no data
  useEffect(() => {
    if (projectId && !healthScore && !isScanning) {
      scan(projectId);
    }
    return () => { clear(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  const handleRefresh = () => {
    if (projectId && !isScanning) {
      scan(projectId);
    }
  };

  const handleNavigate = (elementId: string) => {
    // Dispatch custom event that CameraControls can listen to
    window.dispatchEvent(new CustomEvent('advisor:navigate', { detail: { elementId } }));
  };

  // Count by severity
  const counts: Record<InsightSeverity, number> = { critical: 0, high: 0, warning: 0, info: 0 };
  for (const insight of insights) {
    counts[insight.severity]++;
  }

  if (!projectId) {
    return (
      <div className="flex flex-col h-full items-center justify-center p-6">
        <ShieldAlert size={24} className="text-[#3a4a3a] mb-2" />
        <p className="text-xs text-[#4a5a4a] text-center">Open a project to use the Architecture Advisor.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-3 py-2 flex items-center justify-between border-b border-[#1a2a1a]">
        <h3 className="text-[11px] font-semibold text-white flex items-center gap-1.5">
          <ShieldAlert size={12} className="text-[#00ff41]" />
          Architecture Advisor
        </h3>
        <button
          onClick={handleRefresh}
          disabled={isScanning}
          className="text-[#4a5a4a] hover:text-[#00ff41] disabled:opacity-30 transition p-0.5"
          title="Refresh scan"
        >
          {isScanning ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {/* Loading State */}
        {isScanning && !healthScore && (
          <div className="flex flex-col items-center justify-center py-12 gap-2">
            <Loader2 size={24} className="animate-spin text-[#00ff41]" />
            <p className="text-[10px] text-[#4a5a4a]">Scanning architecture...</p>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="mx-3 mt-3 p-2 rounded border border-red-500/20 bg-red-500/5">
            <div className="flex items-center gap-1.5">
              <AlertCircle size={10} className="text-red-400 shrink-0" />
              <span className="text-[10px] text-red-300">{error}</span>
            </div>
          </div>
        )}

        {/* Health Score */}
        {healthScore && (
          <div className="px-3 py-3 border-b border-[#1a2a1a]">
            <div className="flex items-center gap-3">
              <HealthScoreRing score={healthScore} size={64} />
              <div className="flex-1 min-w-0">
                <p className="text-[10px] text-[#7a8a7a] mb-1">Health Score</p>
                {/* Factor Bars */}
                {healthScore.factors.map((f) => (
                  <div key={f.factor} className="flex items-center gap-1 mb-0.5">
                    <span className="text-[8px] text-[#4a5a4a] w-14 truncate" title={f.factor}>{f.factor}</span>
                    <div className="flex-1 h-1 bg-[#1a2a1a] rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-500"
                        style={{
                          width: `${f.score}%`,
                          backgroundColor: f.score >= 70 ? '#00ff41' : f.score >= 40 ? '#eab308' : '#ef4444',
                        }}
                      />
                    </div>
                    <span className="text-[8px] text-[#4a5a4a] w-5 text-right">{f.score}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Severity Summary */}
        {insights.length > 0 && (
          <div className="px-3 py-2 flex gap-2 border-b border-[#1a2a1a]">
            {counts.critical > 0 && (
              <span className="flex items-center gap-1 text-[9px] text-red-400">
                <span className="w-1.5 h-1.5 rounded-full bg-red-500" /> {counts.critical} critical
              </span>
            )}
            {counts.high > 0 && (
              <span className="flex items-center gap-1 text-[9px] text-orange-400">
                <span className="w-1.5 h-1.5 rounded-full bg-orange-500" /> {counts.high} high
              </span>
            )}
            {counts.warning > 0 && (
              <span className="flex items-center gap-1 text-[9px] text-yellow-400">
                <span className="w-1.5 h-1.5 rounded-full bg-yellow-500" /> {counts.warning}
              </span>
            )}
            {counts.info > 0 && (
              <span className="flex items-center gap-1 text-[9px] text-cyan-400">
                <span className="w-1.5 h-1.5 rounded-full bg-cyan-500" /> {counts.info}
              </span>
            )}
          </div>
        )}

        {/* Insights List */}
        {insights.length > 0 && (
          <div className="p-2 space-y-1.5">
            {insights.map((insight) => (
              <InsightCard
                key={insight.id}
                insight={insight}
                onNavigate={handleNavigate}
              />
            ))}
          </div>
        )}

        {/* Empty State */}
        {healthScore && insights.length === 0 && (
          <div className="flex flex-col items-center justify-center py-8 gap-2">
            <CheckCircle2 size={24} className="text-[#00ff41]" />
            <p className="text-[10px] text-[#7a8a7a]">No issues found</p>
            <p className="text-[9px] text-[#3a4a3a]">Your architecture looks healthy</p>
          </div>
        )}

        {/* Meta Info */}
        {lastScanAt && (
          <div className="px-3 py-2 text-[8px] text-[#3a4a3a] border-t border-[#1a2a1a]">
            {totalElements} elements scanned in {scanDurationMs}ms
          </div>
        )}
      </div>
    </div>
  );
}
