import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { ShieldCheck, AlertTriangle, AlertCircle, Info, RefreshCw, Loader2 } from 'lucide-react';
import { governanceAPI } from '../../services/api';

interface Violation {
  elementName: string;
  elementType: string;
  policyName: string;
  severity: 'error' | 'warning' | 'info';
  category: string;
  message: string;
  field: string;
  currentValue: unknown;
  expectedValue: unknown;
}

interface ComplianceReport {
  totalElements: number;
  totalPolicies: number;
  violations: Violation[];
  summary: {
    errors: number;
    warnings: number;
    infos: number;
    complianceScore: number;
  };
  byCategory: Record<string, number>;
}

export default function ComplianceDashboard() {
  const { projectId } = useParams();
  const [report, setReport] = useState<ComplianceReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const runCheck = async () => {
    if (!projectId) return;
    setLoading(true);
    setError(null);
    try {
      const { data } = await governanceAPI.checkCompliance(projectId);
      setReport(data.data);
    } catch {
      setError('Compliance check failed');
    } finally {
      setLoading(false);
    }
  };

  const severityIcon = (s: string) => {
    if (s === 'error') return <AlertCircle size={16} className="text-[#ef4444]" />;
    if (s === 'warning') return <AlertTriangle size={16} className="text-[#eab308]" />;
    return <Info size={16} className="text-[#3b82f6]" />;
  };

  const categoryColors: Record<string, string> = {
    architecture: '#00ff41', security: '#ef4444', naming: '#3b82f6',
    compliance: '#22c55e', data: '#06b6d4', custom: '#7a8a7a',
  };

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      <div className="p-4 border-b border-[var(--border-subtle)]">
        <h3 className="text-sm font-semibold text-white flex items-center gap-2">
          <ShieldCheck size={18} className="text-[#22c55e]" />
          Compliance Dashboard
        </h3>
      </div>

      {/* Run Check Button */}
      <div className="p-4">
        <button
          onClick={runCheck}
          disabled={loading}
          className="w-full flex items-center justify-center gap-2 rounded-md bg-[#1a2a1a] px-4 py-2.5 text-sm font-medium text-white hover:bg-[#3a4a3a] disabled:opacity-50 transition"
        >
          {loading ? (
            <Loader2 size={16} className="animate-spin" />
          ) : (
            <RefreshCw size={16} />
          )}
          {loading ? 'Running...' : 'Run Compliance Check'}
        </button>
      </div>

      {/* Error */}
      {error && (
        <div className="px-4 py-3 bg-red-500/10 border-b border-red-500/20">
          <span className="text-xs text-red-300">{error}</span>
        </div>
      )}

      {report && (
        <>
          {/* Score */}
          <div className="px-4 pb-4">
            <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-base)] p-4 text-center">
              <div
                className="text-3xl font-bold"
                style={{ color: report.summary.complianceScore >= 80 ? '#22c55e' : report.summary.complianceScore >= 50 ? '#eab308' : '#ef4444' }}
              >
                {report.summary.complianceScore}%
              </div>
              <div className="text-xs text-[var(--text-tertiary)] mt-1">Compliance Score</div>
              <div className="h-2.5 rounded-full bg-[#1a2a1a] mt-3">
                <div
                  className="h-full rounded-full transition-all"
                  style={{
                    width: `${report.summary.complianceScore}%`,
                    backgroundColor: report.summary.complianceScore >= 80 ? '#22c55e' : report.summary.complianceScore >= 50 ? '#eab308' : '#ef4444',
                  }}
                />
              </div>
              <div className="text-xs text-[var(--text-disabled)] mt-2">
                {report.totalElements} elements, {report.totalPolicies} policies checked
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2 mt-3">
              <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-base)] p-3 text-center">
                <div className="text-sm font-bold text-[#ef4444]">{report.summary.errors}</div>
                <div className="text-xs text-[var(--text-tertiary)]">Errors</div>
              </div>
              <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-base)] p-3 text-center">
                <div className="text-sm font-bold text-[#eab308]">{report.summary.warnings}</div>
                <div className="text-xs text-[var(--text-tertiary)]">Warnings</div>
              </div>
              <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-base)] p-3 text-center">
                <div className="text-sm font-bold text-[#3b82f6]">{report.summary.infos}</div>
                <div className="text-xs text-[var(--text-tertiary)]">Info</div>
              </div>
            </div>
          </div>

          {/* By Category */}
          {Object.keys(report.byCategory).length > 0 && (
            <div className="px-4 pb-4 border-t border-[var(--border-subtle)] pt-4">
              <h4 className="text-xs font-semibold uppercase text-[var(--text-tertiary)] mb-2">By Category</h4>
              <div className="flex flex-wrap gap-2">
                {Object.entries(report.byCategory).map(([cat, count]) => (
                  <span
                    key={cat}
                    className="text-xs px-2 py-1 rounded capitalize"
                    style={{ color: categoryColors[cat] || '#7a8a7a', backgroundColor: `${categoryColors[cat] || '#7a8a7a'}20` }}
                  >
                    {cat}: {count}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Violations */}
          {report.violations.length > 0 && (
            <div className="px-4 pb-4 border-t border-[var(--border-subtle)] pt-4">
              <h4 className="text-xs font-semibold uppercase text-[var(--text-tertiary)] mb-2">Violations ({report.violations.length})</h4>
              <div className="space-y-1.5">
                {report.violations.slice(0, 20).map((v, i) => (
                  <div key={i} className="flex items-start gap-2.5 py-2 px-2 rounded hover:bg-[var(--surface-raised)]">
                    {severityIcon(v.severity)}
                    <div className="flex-1 min-w-0">
                      <span className="text-sm text-white block truncate">{v.elementName}</span>
                      <span className="text-xs text-[var(--text-tertiary)]">{v.message}</span>
                      <span className="text-xs text-[var(--text-disabled)] block">Policy: {v.policyName} · Field: {v.field}</span>
                    </div>
                  </div>
                ))}
                {report.violations.length > 20 && (
                  <p className="text-xs text-[var(--text-disabled)] text-center">+{report.violations.length - 20} more</p>
                )}
              </div>
            </div>
          )}

          {report.violations.length === 0 && (
            <div className="px-4 py-8 text-center">
              <ShieldCheck size={24} className="text-[#22c55e] mx-auto mb-2" />
              <p className="text-sm text-[#22c55e]">All checks passed!</p>
            </div>
          )}
        </>
      )}

      {!report && !loading && (
        <div className="flex-1 flex items-center justify-center p-6">
          <p className="text-sm text-[var(--text-tertiary)] text-center">Click "Run Compliance Check" to analyze your architecture against defined policies.</p>
        </div>
      )}
    </div>
  );
}
