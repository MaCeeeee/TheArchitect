import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import {
  Eye, Package, Shield, Activity, Layers, Clock, ExternalLink,
} from 'lucide-react';
import api from '../../services/api';

interface SnapshotData {
  title: string;
  description: string;
  viewType: string;
  createdAt: string;
  expiresAt: string;
  elements: Array<Record<string, unknown>>;
  connections: Array<Record<string, unknown>>;
  summary: {
    totalElements: number;
    totalConnections: number;
    byLayer: Record<string, number>;
    byStatus: Record<string, number>;
    byRisk: Record<string, number>;
    byType: Record<string, number>;
  };
}

export default function SharedSnapshotView() {
  const { token } = useParams<{ token: string }>();
  const [data, setData] = useState<SnapshotData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    api.get(`/snapshots/${token}`)
      .then(({ data: res }) => setData(res.data))
      .catch((err) => setError(err.response?.data?.error || 'Snapshot not found'))
      .finally(() => setLoading(false));
  }, [token]);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0f172a] flex items-center justify-center">
        <div className="h-8 w-8 rounded-full border-2 border-[#00ff41] border-t-transparent animate-spin" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-[#0f172a] flex items-center justify-center">
        <div className="text-center">
          <Eye size={32} className="mx-auto text-[#334155] mb-3" />
          <h2 className="text-lg font-semibold text-white mb-1">Snapshot Unavailable</h2>
          <p className="text-sm text-[#94a3b8]">{error || 'This snapshot has expired or been revoked.'}</p>
          <a href="/" className="inline-block mt-4 text-xs text-[#7c3aed] hover:underline">
            Visit TheArchitect
          </a>
        </div>
      </div>
    );
  }

  const { summary } = data;
  const topTypes = Object.entries(summary.byType).sort(([, a], [, b]) => b - a).slice(0, 8);
  const topLayers = Object.entries(summary.byLayer).sort(([, a], [, b]) => b - a);

  return (
    <div className="min-h-screen bg-[#0f172a] text-white">
      {/* Header */}
      <header className="border-b border-[#334155] bg-[#1e293b] px-8 py-5">
        <div className="flex items-center justify-between max-w-5xl mx-auto">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Eye size={18} className="text-[#00ff41]" />
              <h1 className="text-lg font-bold">{data.title}</h1>
            </div>
            {data.description && <p className="text-xs text-[#94a3b8]">{data.description}</p>}
          </div>
          <div className="text-right text-[10px] text-[#64748b]">
            <p>Created: {new Date(data.createdAt).toLocaleDateString()}</p>
            <p>Expires: {new Date(data.expiresAt).toLocaleDateString()}</p>
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="max-w-5xl mx-auto px-8 py-8">
        {/* KPIs */}
        <div className="grid grid-cols-4 gap-4 mb-8">
          <div className="rounded-xl border border-[#334155] bg-[#1e293b] p-5">
            <div className="flex items-center gap-2 mb-2">
              <Package size={16} className="text-[#00ff41]" />
              <span className="text-xs text-[#94a3b8]">Elements</span>
            </div>
            <div className="text-2xl font-bold">{summary.totalElements}</div>
          </div>
          <div className="rounded-xl border border-[#334155] bg-[#1e293b] p-5">
            <div className="flex items-center gap-2 mb-2">
              <Activity size={16} className="text-[#22c55e]" />
              <span className="text-xs text-[#94a3b8]">Connections</span>
            </div>
            <div className="text-2xl font-bold">{summary.totalConnections}</div>
          </div>
          <div className="rounded-xl border border-[#334155] bg-[#1e293b] p-5">
            <div className="flex items-center gap-2 mb-2">
              <Layers size={16} className="text-[#3b82f6]" />
              <span className="text-xs text-[#94a3b8]">Layers</span>
            </div>
            <div className="text-2xl font-bold">{Object.keys(summary.byLayer).length}</div>
          </div>
          <div className="rounded-xl border border-[#334155] bg-[#1e293b] p-5">
            <div className="flex items-center gap-2 mb-2">
              <Shield size={16} className="text-[#a855f7]" />
              <span className="text-xs text-[#94a3b8]">Types</span>
            </div>
            <div className="text-2xl font-bold">{Object.keys(summary.byType).length}</div>
          </div>
        </div>

        {/* Distributions */}
        <div className="grid grid-cols-2 gap-6 mb-8">
          <BarChart title="By Layer" data={topLayers} />
          <BarChart title="By Status" data={Object.entries(summary.byStatus)} />
          <BarChart title="By Risk" data={Object.entries(summary.byRisk)} />
          <BarChart title="Top Types" data={topTypes} />
        </div>

        {/* Element table */}
        <div className="rounded-xl border border-[#334155] bg-[#1e293b] overflow-hidden">
          <div className="px-5 py-3 border-b border-[#334155]">
            <h3 className="text-sm font-semibold">Elements ({data.elements.length})</h3>
          </div>
          <div className="max-h-96 overflow-y-auto">
            <table className="w-full text-xs">
              <thead className="bg-[#0f172a] sticky top-0">
                <tr>
                  <th className="px-4 py-2 text-left text-[#64748b]">Name</th>
                  <th className="px-4 py-2 text-left text-[#64748b]">Type</th>
                  <th className="px-4 py-2 text-left text-[#64748b]">Layer</th>
                  <th className="px-4 py-2 text-left text-[#64748b]">Status</th>
                  <th className="px-4 py-2 text-left text-[#64748b]">Risk</th>
                </tr>
              </thead>
              <tbody>
                {data.elements.slice(0, 100).map((el, i) => (
                  <tr key={i} className="border-t border-[#334155]/50 hover:bg-[#0f172a]/50">
                    <td className="px-4 py-2 text-white">{String(el.name)}</td>
                    <td className="px-4 py-2 text-[#94a3b8] capitalize">{String(el.type).replace(/_/g, ' ')}</td>
                    <td className="px-4 py-2 text-[#94a3b8] capitalize">{String(el.layer).replace(/_/g, ' ')}</td>
                    <td className="px-4 py-2 text-[#94a3b8]">{String(el.status)}</td>
                    <td className="px-4 py-2 text-[#94a3b8]">{String(el.riskLevel)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Footer */}
        <div className="mt-8 text-center">
          <p className="text-[10px] text-[#475569]">
            Shared via TheArchitect — Enterprise Architecture Management Platform
          </p>
        </div>
      </main>
    </div>
  );
}

function BarChart({ title, data }: { title: string; data: [string, number][] }) {
  const max = Math.max(...data.map(([, v]) => v), 1);
  return (
    <div className="rounded-xl border border-[#334155] bg-[#1e293b] p-5">
      <h3 className="text-xs font-semibold mb-3">{title}</h3>
      <div className="space-y-2">
        {data.map(([key, count]) => (
          <div key={key} className="flex items-center gap-2">
            <span className="text-[10px] text-[#94a3b8] w-24 truncate capitalize">{key.replace(/_/g, ' ')}</span>
            <div className="flex-1 h-2 rounded-full bg-[#0f172a] overflow-hidden">
              <div className="h-full rounded-full bg-[#00ff41]" style={{ width: `${(count / max) * 100}%` }} />
            </div>
            <span className="text-[10px] text-white w-6 text-right">{count}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
