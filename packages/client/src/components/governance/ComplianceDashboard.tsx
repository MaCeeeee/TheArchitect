import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { ShieldCheck, AlertTriangle, AlertCircle, Info, RefreshCw, Loader2, Wrench } from 'lucide-react';
import type { ViolationSeverity } from '@thearchitect/shared';
import { deriveViolationFix, isAutoFixableField, ROLE_PERMISSIONS, PERMISSIONS } from '@thearchitect/shared';
import { governanceAPI, architectureAPI } from '../../services/api';
import { useAuthStore } from '../../stores/authStore';
import toast from 'react-hot-toast';

interface Violation {
  elementId: string;
  elementName: string;
  elementType: string;
  policyName: string;
  severity: ViolationSeverity;
  category: string;
  message: string;
  field: string;
  currentValue: unknown;
  expectedValue: unknown;
  operator?: string;
}

interface ComplianceReport {
  totalElements: number;
  totalPolicies: number;
  violations: Violation[];
  summary: {
    critical: number;
    high: number;
    medium: number;
    low: number;
    complianceScore: number;
  };
  byCategory: Record<string, number>;
}

export default function ComplianceDashboard() {
  const { projectId } = useParams();
  const [report, setReport] = useState<ComplianceReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [applyingKey, setApplyingKey] = useState<string | null>(null);

  const role = useAuthStore((s) => s.user?.role);
  const canUpdate = !!role && (ROLE_PERMISSIONS[role as keyof typeof ROLE_PERMISSIONS] ?? []).includes(PERMISSIONS.ELEMENT_UPDATE);

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

  // THE-502/AC-4: await the real PUT (not the optimistic store), then re-run the
  // existing runCheck() — checkCompliance is stateless, so the server-resolved
  // violation drops out of the recomputed list.
  const applyFix = async (v: Violation, value: unknown) => {
    if (!projectId || !v.elementId) return;
    const key = `${v.elementId}:${v.field}`;
    setApplyingKey(key);
    try {
      await architectureAPI.updateElement(projectId, v.elementId, { [v.field]: value });
      toast.success(`Applied fix: ${v.field}`);
      await runCheck();
    } catch {
      toast.error('Could not apply fix');
    } finally {
      setApplyingKey(null);
    }
  };

  const severityIcon = (s: string) => {
    if (s === 'critical') return <AlertCircle size={16} className="text-[#ef4444]" />;
    if (s === 'high') return <AlertCircle size={16} className="text-[#f97316]" />;
    if (s === 'medium') return <AlertTriangle size={16} className="text-[#eab308]" />;
    return <Info size={16} className="text-[#3b82f6]" />;
  };

  const fmtValue = (v: unknown): string => {
    if (v === null || v === undefined) return '(none)';
    if (v === '') return '(empty)';
    if (typeof v === 'object') return JSON.stringify(v);
    return String(v);
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

            <div className="grid grid-cols-4 gap-2 mt-3">
              <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-base)] p-3 text-center">
                <div className="text-sm font-bold text-[#ef4444]">{report.summary.critical}</div>
                <div className="text-xs text-[var(--text-tertiary)]">Critical</div>
              </div>
              <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-base)] p-3 text-center">
                <div className="text-sm font-bold text-[#f97316]">{report.summary.high}</div>
                <div className="text-xs text-[var(--text-tertiary)]">High</div>
              </div>
              <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-base)] p-3 text-center">
                <div className="text-sm font-bold text-[#eab308]">{report.summary.medium}</div>
                <div className="text-xs text-[var(--text-tertiary)]">Medium</div>
              </div>
              <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-base)] p-3 text-center">
                <div className="text-sm font-bold text-[#3b82f6]">{report.summary.low}</div>
                <div className="text-xs text-[var(--text-tertiary)]">Low</div>
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
                {report.violations.slice(0, 20).map((v, i) => {
                  const fix = deriveViolationFix({ operator: v.operator, field: v.field, currentValue: v.currentValue, expectedValue: v.expectedValue });
                  const key = `${v.elementId}:${v.field}`;
                  const applying = applyingKey === key;
                  const canOneClick = fix.applicable && !!v.elementId && isAutoFixableField(v.field) && fix.action?.payload?.value != null;
                  return (
                    <div key={i} className="flex items-start gap-2.5 py-2 px-2 rounded hover:bg-[var(--surface-raised)]">
                      {severityIcon(v.severity)}
                      <div className="flex-1 min-w-0">
                        <span className="text-sm text-white block truncate">{v.elementName}</span>
                        <span className="text-xs text-[var(--text-tertiary)]">{v.message}</span>
                        <span className="text-xs text-[var(--text-disabled)] block">Policy: {v.policyName} · Field: {v.field}</span>
                        {/* REQ-FIX-001.1: deterministischer Fix-Hinweis */}
                        <span className="text-xs text-[#22c55e] block mt-0.5">Fix: {fix.instruction}</span>
                        {/* AC-4: Transition-Zeile */}
                        <span className="text-xs text-[var(--text-disabled)] block">
                          Field {v.field}: {fmtValue(v.currentValue)} → {fmtValue(v.expectedValue)}
                        </span>
                        {/* THE-502: disabled uses !!applyingKey (not the per-row `applying`) so ALL [Fix]
                            buttons lock while any apply is in flight — prevents a second applyFix→runCheck
                            from racing the list rebuild. Do not simplify back to disabled={applying}. */}
                        {canOneClick && fix.action && (
                          <button
                            onClick={() => applyFix(v, fix.action!.payload?.value)}
                            disabled={!!applyingKey || !canUpdate}
                            title={!canUpdate ? 'Requires element:update permission' : undefined}
                            className="mt-1.5 inline-flex items-center gap-1 rounded bg-[#1a2a1a] px-2 py-1 text-xs font-medium text-white hover:bg-[#3a4a3a] disabled:opacity-50 disabled:cursor-not-allowed transition"
                          >
                            {applying ? <Loader2 size={12} className="animate-spin" /> : <Wrench size={12} />}
                            {applying ? 'Applying…' : 'Fix'}
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
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
