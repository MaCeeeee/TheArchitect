import { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft, Search, Filter, Download, Table2, Clock, LayoutDashboard,
  ChevronUp, ChevronDown, AlertTriangle, Shield, DollarSign,
  Users, Activity, Package, Layers, X, RefreshCw, Share2, Eye, Copy, Check,
} from 'lucide-react';
import api from '../../services/api';
import { usePortfolioStore, PortfolioElement } from '../../stores/portfolioStore';
import LifecycleTimeline from './LifecycleTimeline';
import PortfolioDashboard from './PortfolioDashboard';

const LIFECYCLE_PHASES = ['plan', 'design', 'build', 'test', 'deploy', 'operate', 'phase_out', 'retire'];
const STATUS_OPTIONS = ['current', 'target', 'transitional', 'retired'];
const RISK_OPTIONS = ['low', 'medium', 'high', 'critical'];
const LAYER_OPTIONS = ['application', 'technology', 'business', 'information', 'strategy', 'motivation', 'physical', 'implementation_migration'];

const RISK_COLORS: Record<string, string> = {
  low: 'text-green-400 bg-green-500/10',
  medium: 'text-amber-400 bg-amber-500/10',
  high: 'text-orange-400 bg-orange-500/10',
  critical: 'text-red-400 bg-red-500/10',
};

const STATUS_COLORS: Record<string, string> = {
  current: 'text-green-400 bg-green-500/10',
  target: 'text-blue-400 bg-blue-500/10',
  transitional: 'text-amber-400 bg-amber-500/10',
  retired: 'text-gray-400 bg-gray-500/10',
};

const CRITICALITY_COLORS: Record<string, string> = {
  low: 'text-gray-400',
  medium: 'text-amber-400',
  high: 'text-orange-400',
  mission_critical: 'text-red-400',
};

export default function PortfolioPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const [showFilters, setShowFilters] = useState(false);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [shareLoading, setShareLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleCreateSnapshot = async () => {
    if (!projectId || shareLoading) return;
    setShareLoading(true);
    try {
      const { data } = await api.post(`/projects/${projectId}/snapshots`, {
        title: 'Portfolio Snapshot',
        description: `Portfolio snapshot — ${items.length} elements`,
        viewType: 'portfolio',
        expiresInHours: 72,
      });
      const url = `${window.location.origin}/shared/${data.data.token}`;
      setShareUrl(url);
    } catch (err) {
      if (import.meta.env.DEV) console.error('[Portfolio] Snapshot creation failed:', err);
    } finally {
      setShareLoading(false);
    }
  };

  const handleCopyUrl = () => {
    if (!shareUrl) return;
    navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const {
    items, summary, loading, view, setView,
    searchQuery, setSearchQuery,
    filterTypes, setFilterTypes,
    filterLayers, setFilterLayers,
    filterStatus, setFilterStatus,
    filterRisk, setFilterRisk,
    filterLifecycle, setFilterLifecycle,
    sortField, sortDirection, setSort,
    fetchInventory, fetchSummary, fetchTimeline,
  } = usePortfolioStore();

  // Serialize filter state to a stable string to avoid re-fetch loops from array reference changes
  const filterKey = JSON.stringify([filterTypes, filterLayers, filterStatus, filterRisk, filterLifecycle, searchQuery]);

  useEffect(() => {
    if (projectId) {
      fetchInventory(projectId);
      fetchSummary(projectId);
      fetchTimeline(projectId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, filterKey]);

  // Client-side sort
  const sortedItems = useMemo(() => {
    const sorted = [...items];
    sorted.sort((a, b) => {
      const aVal = a[sortField] ?? '';
      const bVal = b[sortField] ?? '';
      if (typeof aVal === 'number' && typeof bVal === 'number') {
        return sortDirection === 'asc' ? aVal - bVal : bVal - aVal;
      }
      const cmp = String(aVal).localeCompare(String(bVal));
      return sortDirection === 'asc' ? cmp : -cmp;
    });
    return sorted;
  }, [items, sortField, sortDirection]);

  const activeFilterCount = [filterTypes, filterLayers, filterStatus, filterRisk, filterLifecycle]
    .reduce((n, f) => n + (f.length > 0 ? 1 : 0), 0);

  const handleExportCSV = () => {
    const headers = ['Name', 'Type', 'Layer', 'Status', 'Risk', 'Maturity', 'Lifecycle', 'Owner', 'Annual Cost', 'Users'];
    const rows = sortedItems.map(el => [
      el.name, el.type, el.layer, el.status, el.riskLevel,
      el.maturityLevel, el.lifecyclePhase || '', el.businessOwner || '',
      el.annualCost ?? '', el.userCount ?? '',
    ]);
    const csv = [headers, ...rows].map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `portfolio-inventory-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (!projectId) return null;

  return (
    <div className="flex flex-col h-full bg-[var(--surface-base)]">
      {/* Header */}
      <div className="border-b border-[var(--border-subtle)] bg-[var(--surface-raised)] px-6 py-4">
        <button
          onClick={() => navigate(`/project/${projectId}`)}
          className="flex items-center gap-2 text-sm text-[var(--text-secondary)] hover:text-white transition mb-3"
        >
          <ArrowLeft size={16} />
          Back to Architecture
        </button>

        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-semibold text-white">Application Portfolio</h1>
            <p className="text-xs text-[var(--text-tertiary)] mt-0.5">
              {items.length} element{items.length !== 1 ? 's' : ''} in inventory
            </p>
          </div>
          <div className="flex items-center gap-2">
            {/* View toggle */}
            <div className="flex rounded-md bg-[var(--surface-base)] p-0.5">
              <button
                onClick={() => setView('dashboard' as any)}
                className={`flex items-center gap-1.5 rounded px-2.5 py-1 text-xs font-medium transition ${
                  view === 'dashboard' ? 'bg-[#00ff41] text-black' : 'text-[var(--text-secondary)] hover:text-white'
                }`}
              >
                <LayoutDashboard size={14} /> Dashboard
              </button>
              <button
                onClick={() => setView('table')}
                className={`flex items-center gap-1.5 rounded px-2.5 py-1 text-xs font-medium transition ${
                  view === 'table' ? 'bg-[#00ff41] text-black' : 'text-[var(--text-secondary)] hover:text-white'
                }`}
              >
                <Table2 size={14} /> Table
              </button>
              <button
                onClick={() => setView('timeline')}
                className={`flex items-center gap-1.5 rounded px-2.5 py-1 text-xs font-medium transition ${
                  view === 'timeline' ? 'bg-[#00ff41] text-black' : 'text-[var(--text-secondary)] hover:text-white'
                }`}
              >
                <Clock size={14} /> Timeline
              </button>
            </div>
            <button
              onClick={() => fetchInventory(projectId)}
              className="rounded p-1.5 text-[var(--text-secondary)] hover:bg-[#1a2a1a] hover:text-white transition"
              title="Refresh"
            >
              <RefreshCw size={16} />
            </button>
            <button
              onClick={handleExportCSV}
              className="flex items-center gap-1.5 rounded-md bg-[#1a2a1a] px-3 py-1.5 text-xs text-[var(--text-secondary)] hover:text-white transition"
            >
              <Download size={14} /> Export CSV
            </button>
            <button
              onClick={() => navigate(`/project/${projectId}/stakeholder`)}
              className="flex items-center gap-1.5 rounded-md bg-[#1a2a1a] px-3 py-1.5 text-xs text-[var(--text-secondary)] hover:text-white transition"
              title="Stakeholder Dashboard"
            >
              <Eye size={14} /> Stakeholder
            </button>
            <button
              onClick={handleCreateSnapshot}
              disabled={shareLoading}
              className="flex items-center gap-1.5 rounded-md bg-[#00ff41]/15 border border-[#00ff41]/30 px-3 py-1.5 text-xs text-[#00ff41] hover:bg-[#00ff41]/25 transition disabled:opacity-50"
            >
              <Share2 size={14} /> {shareLoading ? 'Creating...' : 'Share'}
            </button>
          </div>
        </div>

        {/* KPI Bar */}
        {summary && (
          <div className="grid grid-cols-6 gap-3 mt-4">
            <KpiCard icon={<Package size={14} />} label="Applications" value={summary.totalApplications} color="#00ff41" />
            <KpiCard icon={<Activity size={14} />} label="Services" value={summary.totalServices} color="#22c55e" />
            <KpiCard icon={<Layers size={14} />} label="Technology" value={summary.totalTechnology} color="#3b82f6" />
            <KpiCard icon={<Shield size={14} />} label="Avg Maturity" value={summary.avgMaturity} color="#a855f7" />
            <KpiCard icon={<AlertTriangle size={14} />} label="Nearing EOL" value={summary.appsNearingEOL} color="#f59e0b" warning />
            <KpiCard icon={<DollarSign size={14} />} label="Annual Cost" value={formatCost(summary.totalAnnualCost)} color="#06b6d4" />
          </div>
        )}

        {/* Share URL banner */}
        {shareUrl && (
          <div className="flex items-center gap-3 mt-3 rounded-lg border border-[#00ff41]/20 bg-[#00ff41]/5 px-4 py-2.5">
            <Share2 size={14} className="text-[#00ff41] shrink-0" />
            <span className="text-xs text-[var(--text-secondary)]">Share link:</span>
            <code className="flex-1 text-xs text-[#00ff41] truncate">{shareUrl}</code>
            <button onClick={handleCopyUrl} className="flex items-center gap-1 rounded px-2 py-1 text-xs text-[#00ff41] hover:bg-[#00ff41]/10 transition">
              {copied ? <><Check size={12} /> Copied</> : <><Copy size={12} /> Copy</>}
            </button>
            <button onClick={() => setShareUrl(null)} className="text-[var(--text-tertiary)] hover:text-white">
              <X size={14} />
            </button>
          </div>
        )}

        {/* Search + Filter bar */}
        <div className="flex items-center gap-3 mt-4">
          <div className="flex-1 flex items-center gap-2 rounded-md bg-[var(--surface-base)] border border-[var(--border-subtle)] px-3 py-1.5">
            <Search size={14} className="text-[var(--text-tertiary)]" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by name or description..."
              className="flex-1 bg-transparent text-xs text-white placeholder:text-[var(--text-tertiary)] outline-none"
            />
            {searchQuery && (
              <button onClick={() => setSearchQuery('')} className="text-[var(--text-tertiary)] hover:text-white">
                <X size={12} />
              </button>
            )}
          </div>
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition border ${
              activeFilterCount > 0
                ? 'border-[#00ff41]/30 bg-[#00ff41]/10 text-[#00ff41]'
                : 'border-[var(--border-subtle)] text-[var(--text-secondary)] hover:text-white'
            }`}
          >
            <Filter size={14} />
            Filters{activeFilterCount > 0 && ` (${activeFilterCount})`}
          </button>
        </div>

        {/* Filter chips */}
        {showFilters && (
          <div className="mt-3 space-y-2">
            <FilterRow label="Layer" options={LAYER_OPTIONS} selected={filterLayers} onChange={setFilterLayers} />
            <FilterRow label="Status" options={STATUS_OPTIONS} selected={filterStatus} onChange={setFilterStatus} />
            <FilterRow label="Risk" options={RISK_OPTIONS} selected={filterRisk} onChange={setFilterRisk} />
            <FilterRow label="Lifecycle" options={LIFECYCLE_PHASES} selected={filterLifecycle} onChange={setFilterLifecycle} />
          </div>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="h-8 w-8 rounded-full border-2 border-[#00ff41] border-t-transparent animate-spin" />
          </div>
        ) : view === 'dashboard' ? (
          <div className="p-6"><PortfolioDashboard projectId={projectId} /></div>
        ) : view === 'table' ? (
          <InventoryTable items={sortedItems} sortField={sortField} sortDirection={sortDirection} onSort={setSort} projectId={projectId} />
        ) : (
          <LifecycleTimeline projectId={projectId} />
        )}
      </div>
    </div>
  );
}

// ─── Inventory Table ───

function InventoryTable({
  items, sortField, sortDirection, onSort, projectId,
}: {
  items: PortfolioElement[];
  sortField: string;
  sortDirection: string;
  onSort: (field: any) => void;
  projectId: string;
}) {
  const navigate = useNavigate();

  return (
    <table className="w-full text-xs">
      <thead className="sticky top-0 bg-[var(--surface-raised)] border-b border-[var(--border-subtle)]">
        <tr>
          <SortHeader label="Name" field="name" current={sortField} dir={sortDirection} onSort={onSort} />
          <SortHeader label="Type" field="type" current={sortField} dir={sortDirection} onSort={onSort} />
          <SortHeader label="Layer" field="layer" current={sortField} dir={sortDirection} onSort={onSort} />
          <SortHeader label="Status" field="status" current={sortField} dir={sortDirection} onSort={onSort} />
          <SortHeader label="Risk" field="riskLevel" current={sortField} dir={sortDirection} onSort={onSort} />
          <SortHeader label="Maturity" field="maturityLevel" current={sortField} dir={sortDirection} onSort={onSort} />
          <SortHeader label="Lifecycle" field="lifecyclePhase" current={sortField} dir={sortDirection} onSort={onSort} />
          <th className="px-3 py-2 text-left text-[var(--text-tertiary)] font-medium">Owner</th>
          <SortHeader label="Cost/yr" field="annualCost" current={sortField} dir={sortDirection} onSort={onSort} />
          <th className="px-3 py-2 text-left text-[var(--text-tertiary)] font-medium">Deps</th>
        </tr>
      </thead>
      <tbody>
        {items.length === 0 ? (
          <tr>
            <td colSpan={10} className="py-12 text-center text-[var(--text-tertiary)]">
              No elements match the current filters.
            </td>
          </tr>
        ) : (
          items.map((el) => (
            <tr
              key={el.id}
              onClick={() => navigate(`/project/${projectId}`)}
              className="border-b border-[var(--border-subtle)]/50 hover:bg-[var(--surface-raised)] cursor-pointer transition"
            >
              <td className="px-3 py-2.5">
                <div className="font-medium text-white truncate max-w-[200px]">{el.name}</div>
                {el.description && (
                  <div className="text-[10px] text-[var(--text-tertiary)] truncate max-w-[200px] mt-0.5">{el.description}</div>
                )}
              </td>
              <td className="px-3 py-2.5 text-[var(--text-secondary)]">{formatType(el.type)}</td>
              <td className="px-3 py-2.5 text-[var(--text-secondary)] capitalize">{el.layer.replace('_', ' ')}</td>
              <td className="px-3 py-2.5">
                <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-medium ${STATUS_COLORS[el.status] || ''}`}>
                  {el.status}
                </span>
              </td>
              <td className="px-3 py-2.5">
                <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-medium ${RISK_COLORS[el.riskLevel] || ''}`}>
                  {el.riskLevel}
                </span>
              </td>
              <td className="px-3 py-2.5">
                <MaturityDots level={el.maturityLevel} />
              </td>
              <td className="px-3 py-2.5 text-[var(--text-secondary)] capitalize">
                {el.lifecyclePhase?.replace('_', ' ') || <span className="text-[var(--text-disabled)]">—</span>}
              </td>
              <td className="px-3 py-2.5 text-[var(--text-secondary)] truncate max-w-[120px]">
                {el.businessOwner || <span className="text-[var(--text-disabled)]">—</span>}
              </td>
              <td className="px-3 py-2.5 text-[var(--text-secondary)]">
                {el.annualCost != null ? formatCost(el.annualCost) : <span className="text-[var(--text-disabled)]">—</span>}
              </td>
              <td className="px-3 py-2.5">
                <span className="text-[var(--text-tertiary)]">{el.inDegree + el.outDegree}</span>
              </td>
            </tr>
          ))
        )}
      </tbody>
    </table>
  );
}

// ─── Sub-components ───

function KpiCard({ icon, label, value, color, warning }: { icon: React.ReactNode; label: string; value: string | number; color: string; warning?: boolean }) {
  return (
    <div className="rounded-lg bg-[var(--surface-base)] border border-[var(--border-subtle)] p-3">
      <div className="flex items-center gap-1.5 mb-1">
        <span style={{ color }}>{icon}</span>
        <span className="text-[10px] text-[var(--text-tertiary)]">{label}</span>
      </div>
      <div className={`text-lg font-bold ${warning && Number(value) > 0 ? 'text-amber-400' : 'text-white'}`}>
        {value}
      </div>
    </div>
  );
}

function SortHeader({ label, field, current, dir, onSort }: {
  label: string; field: string; current: string; dir: string; onSort: (f: any) => void;
}) {
  const active = current === field;
  return (
    <th
      className="px-3 py-2 text-left font-medium cursor-pointer hover:text-white transition select-none text-[var(--text-tertiary)]"
      onClick={() => onSort(field)}
    >
      <div className="flex items-center gap-1">
        {label}
        {active && (dir === 'asc' ? <ChevronUp size={12} /> : <ChevronDown size={12} />)}
      </div>
    </th>
  );
}

function FilterRow({ label, options, selected, onChange }: {
  label: string; options: string[]; selected: string[]; onChange: (v: string[]) => void;
}) {
  const toggle = (opt: string) => {
    onChange(selected.includes(opt) ? selected.filter(s => s !== opt) : [...selected, opt]);
  };
  return (
    <div className="flex items-center gap-2">
      <span className="text-[10px] font-medium text-[var(--text-tertiary)] w-16">{label}</span>
      <div className="flex flex-wrap gap-1">
        {options.map(opt => (
          <button
            key={opt}
            onClick={() => toggle(opt)}
            className={`rounded-full px-2 py-0.5 text-[10px] font-medium transition ${
              selected.includes(opt)
                ? 'bg-[#00ff41]/20 text-[#00ff41] border border-[#00ff41]/30'
                : 'bg-[var(--surface-base)] text-[var(--text-tertiary)] border border-[var(--border-subtle)] hover:text-white'
            }`}
          >
            {opt.replace('_', ' ')}
          </button>
        ))}
      </div>
    </div>
  );
}

function MaturityDots({ level }: { level: number }) {
  return (
    <div className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map(i => (
        <div
          key={i}
          className={`h-1.5 w-1.5 rounded-full ${i <= level ? 'bg-[#00ff41]' : 'bg-[#1a2a1a]'}`}
        />
      ))}
    </div>
  );
}

function formatType(type: string) {
  return type.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

function formatCost(cost: number) {
  if (cost >= 1_000_000) return `$${(cost / 1_000_000).toFixed(1)}M`;
  if (cost >= 1_000) return `$${(cost / 1_000).toFixed(0)}K`;
  if (cost > 0) return `$${cost}`;
  return '$0';
}
