import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, RefreshCw, Timer, CheckCircle2, XCircle, ShieldAlert } from 'lucide-react';
import toast from 'react-hot-toast';
import type { RegisterKind, RegisterStatus, RoutingPath } from '@thearchitect/shared';
import { opsRegisterAPI } from '../../services/api';

/**
 * Ops Register (THE-476 / REQ-PROBMGMT-001.6) — platform-wide operational defect/problem view.
 * System-admin only (server gates /api/ops/register). Shows the current head of each WORM chain,
 * with human-gated actions: approve/reject proposed actions and verify-close a defect.
 */

interface ProposedAction {
  type: string;
  description: string;
  requiresApproval: boolean;
  status: 'proposed' | 'approved' | 'rejected';
}

interface OpsRegisterEntry {
  _id: string;
  chainId: string;
  kind: RegisterKind;
  source: string;
  systemComponent: string;
  environment: string;
  title: string;
  errorType?: string;
  severity: number;
  urgency: number;
  criticality: number;
  pScore: number;
  routingPath: RoutingPath;
  occurrenceCounter: number;
  status: RegisterStatus;
  slaDeadline?: string | null;
  createdAt: string;
  proposedActions: ProposedAction[];
}

const OPEN_STATUSES: ReadonlySet<RegisterStatus> = new Set([
  'open',
  'assessed',
  'triaging',
  'mitigating',
]);

const ROUTE_BADGE: Record<RoutingPath, { bg: string; fg: string; label: string }> = {
  critical: { bg: '#dc2626', fg: '#fff', label: 'CRITICAL' },
  normal: { bg: '#3b82f6', fg: '#fff', label: 'NORMAL' },
  noise: { bg: '#6b7280', fg: '#fff', label: 'NOISE' },
};

const KIND_COLOR: Record<RegisterKind, string> = {
  incident: '#eab308',
  defect: '#f97316',
  problem: '#a78bfa',
  risk: '#22d3ee',
};

const STATUS_COLOR: Record<string, string> = {
  open: '#f59e0b',
  assessed: '#f59e0b',
  triaging: '#f59e0b',
  mitigating: '#3b82f6',
  mitigated: '#22c55e',
  accepted: '#22c55e',
  resolved: '#22c55e',
  superseded: '#6b7280',
  noise: '#6b7280',
};

/** Reduce all WORM rows to the current head of each chain (list is createdAt-desc). */
function chainHeads(items: OpsRegisterEntry[]): OpsRegisterEntry[] {
  const seen = new Set<string>();
  return items.filter((i) => {
    const k = String(i.chainId);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

export default function OpsRegisterSection() {
  const [entries, setEntries] = useState<OpsRegisterEntry[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [routeFilter, setRouteFilter] = useState<'' | RoutingPath>('');
  const [openOnly, setOpenOnly] = useState(true);

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await opsRegisterAPI.list();
      setEntries(chainHeads(res.data?.data?.items ?? []));
    } catch {
      toast.error('Failed to load the ops register');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const kpis = useMemo(() => {
    const open = entries.filter((e) => OPEN_STATUSES.has(e.status));
    return {
      critical: open.filter((e) => e.routingPath === 'critical').length,
      normal: open.filter((e) => e.routingPath === 'normal').length,
      noise: open.filter((e) => e.routingPath === 'noise').length,
      resolved: entries.filter((e) => e.status === 'resolved').length,
      total: entries.length,
    };
  }, [entries]);

  const visible = useMemo(
    () =>
      entries.filter(
        (e) =>
          (!routeFilter || e.routingPath === routeFilter) &&
          (!openOnly || OPEN_STATUSES.has(e.status)),
      ),
    [entries, routeFilter, openOnly],
  );

  const doGate = async (
    e: OpsRegisterEntry,
    actionType: string,
    decision: 'approve' | 'reject',
  ) => {
    setBusyId(e.chainId);
    try {
      await opsRegisterAPI.gate(e.chainId, { actionType, decision });
      toast.success(`${decision === 'approve' ? 'Approved' : 'Rejected'}: ${actionType}`);
      await load();
    } catch {
      toast.error('Gate decision failed');
    } finally {
      setBusyId(null);
    }
  };

  const doClose = async (e: OpsRegisterEntry) => {
    setBusyId(e.chainId);
    try {
      const res = await opsRegisterAPI.close(e.chainId, { testsGreen: true });
      if (res.data?.data?.verified) toast.success('Verified and resolved');
      else toast('Reopened — fix not verified', { icon: '↩️' });
      await load();
    } catch {
      toast.error('Close failed');
    } finally {
      setBusyId(null);
    }
  };

  const runSweep = async () => {
    try {
      const res = await opsRegisterAPI.slaSweep();
      const n = res.data?.data?.count ?? 0;
      toast.success(n > 0 ? `${n} SLA breach(es) escalated` : 'No SLA breaches');
      await load();
    } catch {
      toast.error('SLA sweep failed');
    }
  };

  return (
    <div>
      <div className="flex items-start justify-between mb-1">
        <div>
          <h2 className="text-lg font-semibold text-white">Ops Register</h2>
          <p className="text-sm text-[var(--text-secondary)]">
            Platform-wide defects &amp; problems across the production environment.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={runSweep}
            className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded border border-[#7c3aed]/30 text-[#a78bfa] hover:bg-[#7c3aed]/10 transition"
          >
            <Timer size={13} /> Run SLA sweep
          </button>
          <button
            onClick={() => void load()}
            className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded border border-[var(--border-subtle)] text-[var(--text-secondary)] hover:text-white transition"
          >
            <RefreshCw size={13} className={isLoading ? 'animate-spin' : ''} /> Refresh
          </button>
        </div>
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-5 gap-3 my-5">
        {[
          { label: 'Open critical', value: kpis.critical, color: '#dc2626' },
          { label: 'Open normal', value: kpis.normal, color: '#3b82f6' },
          { label: 'Open noise', value: kpis.noise, color: '#6b7280' },
          { label: 'Resolved', value: kpis.resolved, color: '#22c55e' },
          { label: 'Total chains', value: kpis.total, color: '#a78bfa' },
        ].map((k) => (
          <div
            key={k.label}
            className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-raised)] p-3 text-center"
          >
            <div className="text-xl font-bold" style={{ color: k.color }}>
              {k.value}
            </div>
            <div className="text-[10px] text-[var(--text-tertiary)]">{k.label}</div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 mb-4">
        <select
          value={routeFilter}
          onChange={(e) => setRouteFilter(e.target.value as '' | RoutingPath)}
          className="text-xs rounded border border-[var(--border-subtle)] bg-[var(--surface-base)] px-2 py-1 text-[var(--text-secondary)] outline-none cursor-pointer"
        >
          <option value="">All routes</option>
          <option value="critical">Critical</option>
          <option value="normal">Normal</option>
          <option value="noise">Noise</option>
        </select>
        <label className="flex items-center gap-1.5 text-xs text-[var(--text-secondary)] cursor-pointer">
          <input type="checkbox" checked={openOnly} onChange={(e) => setOpenOnly(e.target.checked)} />
          Open only
        </label>
      </div>

      {isLoading && entries.length === 0 && (
        <p className="text-sm text-[var(--text-tertiary)] py-8 text-center">Loading ops register…</p>
      )}
      {!isLoading && entries.length === 0 && (
        <div className="text-center py-12 text-[var(--text-secondary)]">
          <ShieldAlert size={28} className="mx-auto mb-2 opacity-50" />
          No operational entries yet. Sentry defects and SLA sweeps land here.
        </div>
      )}

      <div className="space-y-2">
        {visible.map((e) => {
          const route = ROUTE_BADGE[e.routingPath];
          const overdue =
            e.slaDeadline && OPEN_STATUSES.has(e.status) && new Date(e.slaDeadline) < new Date();
          return (
            <div
              key={e.chainId}
              className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-raised)] p-3 space-y-1.5"
            >
              <div className="flex items-start gap-2">
                <span
                  className="text-[8px] font-bold uppercase px-1 py-0.5 rounded shrink-0"
                  style={{ backgroundColor: route.bg, color: route.fg }}
                >
                  {route.label}
                </span>
                <span className="text-sm font-medium text-white leading-snug flex-1">{e.title}</span>
                <span
                  className="text-[10px] font-semibold uppercase shrink-0"
                  style={{ color: STATUS_COLOR[e.status] ?? '#9ca3af' }}
                >
                  {e.status}
                </span>
              </div>

              <div className="flex items-center gap-3 text-[10px] text-[var(--text-tertiary)] flex-wrap">
                <span style={{ color: KIND_COLOR[e.kind] }}>{e.kind}</span>
                <span>{e.systemComponent}</span>
                {e.errorType && <span>{e.errorType}</span>}
                <span>score {e.pScore}</span>
                <span>×{e.occurrenceCounter}</span>
                <span className="uppercase">{e.source}</span>
                {overdue && (
                  <span className="flex items-center gap-0.5 text-[#dc2626]">
                    <AlertTriangle size={10} /> SLA breached
                  </span>
                )}
              </div>

              {/* Proposed actions (human gate) */}
              {e.proposedActions.some((a) => a.status === 'proposed') && (
                <div className="flex flex-wrap gap-2 pt-1">
                  {e.proposedActions
                    .filter((a) => a.status === 'proposed')
                    .map((a) => (
                      <div
                        key={a.type}
                        className="flex items-center gap-1.5 rounded border border-[var(--border-subtle)] bg-[var(--surface-base)] px-2 py-1"
                      >
                        <span className="text-[10px] text-[var(--text-secondary)]">{a.description}</span>
                        <button
                          disabled={busyId === e.chainId}
                          onClick={() => void doGate(e, a.type, 'approve')}
                          className="text-[#22c55e] hover:opacity-80 disabled:opacity-40"
                          title="Approve"
                        >
                          <CheckCircle2 size={13} />
                        </button>
                        <button
                          disabled={busyId === e.chainId}
                          onClick={() => void doGate(e, a.type, 'reject')}
                          className="text-[#dc2626] hover:opacity-80 disabled:opacity-40"
                          title="Reject"
                        >
                          <XCircle size={13} />
                        </button>
                      </div>
                    ))}
                </div>
              )}

              {/* Verify-close (open defects only) */}
              {OPEN_STATUSES.has(e.status) && e.kind !== 'problem' && (
                <div className="pt-0.5">
                  <button
                    disabled={busyId === e.chainId}
                    onClick={() => void doClose(e)}
                    className="text-[10px] px-2 py-0.5 rounded border border-[#22c55e]/30 text-[#22c55e] hover:bg-[#22c55e]/10 transition disabled:opacity-40"
                  >
                    Verify &amp; close
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
