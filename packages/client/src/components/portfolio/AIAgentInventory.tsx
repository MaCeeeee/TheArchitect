import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import {
  Bot, Brain, Zap, DollarSign, Activity, Shield,
  ChevronDown, Search, Filter, RefreshCw, X,
} from 'lucide-react';
import api from '../../services/api';

interface AIAgent {
  id: string;
  name: string;
  description: string;
  status: string;
  riskLevel: string;
  maturityLevel: number;
  agentProvider: string | null;
  agentModel: string | null;
  agentPurpose: string | null;
  autonomyLevel: string | null;
  costPerMonth: number | null;
  lastActiveDate: string | null;
  businessOwner: string | null;
  inDegree: number;
  outDegree: number;
}

const PROVIDER_COLORS: Record<string, string> = {
  openai: '#10a37f',
  anthropic: '#d4a574',
  google: '#4285f4',
  azure: '#0078d4',
  custom: '#6b7280',
};

const AUTONOMY_LABELS: Record<string, { label: string; color: string }> = {
  copilot: { label: 'Copilot', color: '#22c55e' },
  semi_autonomous: { label: 'Semi-Autonomous', color: '#f59e0b' },
  autonomous: { label: 'Autonomous', color: '#ef4444' },
};

export default function AIAgentInventory() {
  const { projectId } = useParams<{ projectId: string }>();
  const [agents, setAgents] = useState<AIAgent[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterProvider, setFilterProvider] = useState('');
  const [filterAutonomy, setFilterAutonomy] = useState('');

  useEffect(() => {
    if (!projectId) return;
    setLoading(true);
    api.get(`/projects/${projectId}/portfolio/inventory`, { params: { types: 'ai_agent' } })
      .then(({ data }) => setAgents(data.data || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [projectId]);

  const filtered = useMemo(() => {
    let result = agents;
    if (search) {
      const q = search.toLowerCase();
      result = result.filter(a => a.name.toLowerCase().includes(q) || a.description?.toLowerCase().includes(q));
    }
    if (filterProvider) result = result.filter(a => a.agentProvider === filterProvider);
    if (filterAutonomy) result = result.filter(a => a.autonomyLevel === filterAutonomy);
    return result;
  }, [agents, search, filterProvider, filterAutonomy]);

  const totalCost = agents.reduce((s, a) => s + (a.costPerMonth || 0), 0);
  const providers = [...new Set(agents.map(a => a.agentProvider).filter(Boolean))] as string[];

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="h-8 w-8 rounded-full border-2 border-[#00ff41] border-t-transparent animate-spin" />
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-[var(--surface-base)]">
      {/* Header */}
      <div className="border-b border-[var(--border-subtle)] bg-[var(--surface-raised)] px-6 py-4">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-lg font-semibold text-white flex items-center gap-2">
              <Bot size={20} className="text-[#d4a574]" />
              AI Agent Inventory
            </h1>
            <p className="text-xs text-[var(--text-tertiary)] mt-0.5">{agents.length} agents discovered</p>
          </div>
          <button
            onClick={() => { setLoading(true); api.get(`/projects/${projectId}/portfolio/inventory`, { params: { types: 'ai_agent' } }).then(({ data }) => setAgents(data.data || [])).finally(() => setLoading(false)); }}
            className="rounded p-1.5 text-[var(--text-secondary)] hover:text-white transition"
          >
            <RefreshCw size={16} />
          </button>
        </div>

        {/* KPIs */}
        <div className="grid grid-cols-4 gap-3 mb-4">
          <MiniKpi icon={<Bot size={14} />} label="Total Agents" value={agents.length} color="#d4a574" />
          <MiniKpi icon={<Brain size={14} />} label="Autonomous" value={agents.filter(a => a.autonomyLevel === 'autonomous').length} color="#ef4444" />
          <MiniKpi icon={<Zap size={14} />} label="Providers" value={providers.length} color="#3b82f6" />
          <MiniKpi icon={<DollarSign size={14} />} label="Monthly Cost" value={`$${totalCost.toLocaleString()}`} color="#06b6d4" />
        </div>

        {/* Filters */}
        <div className="flex items-center gap-3">
          <div className="flex-1 flex items-center gap-2 rounded-md bg-[var(--surface-base)] border border-[var(--border-subtle)] px-3 py-1.5">
            <Search size={14} className="text-[var(--text-tertiary)]" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search agents..."
              className="flex-1 bg-transparent text-xs text-white placeholder:text-[var(--text-tertiary)] outline-none" />
            {search && <button onClick={() => setSearch('')}><X size={12} className="text-[var(--text-tertiary)]" /></button>}
          </div>
          <select value={filterProvider} onChange={e => setFilterProvider(e.target.value)}
            className="rounded-md bg-[var(--surface-base)] border border-[var(--border-subtle)] px-2 py-1.5 text-xs text-white outline-none">
            <option value="">All Providers</option>
            {providers.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
          <select value={filterAutonomy} onChange={e => setFilterAutonomy(e.target.value)}
            className="rounded-md bg-[var(--surface-base)] border border-[var(--border-subtle)] px-2 py-1.5 text-xs text-white outline-none">
            <option value="">All Levels</option>
            <option value="copilot">Copilot</option>
            <option value="semi_autonomous">Semi-Autonomous</option>
            <option value="autonomous">Autonomous</option>
          </select>
        </div>
      </div>

      {/* Agent cards */}
      <div className="flex-1 overflow-y-auto p-6">
        {filtered.length === 0 ? (
          <div className="text-center py-16">
            <Bot size={32} className="mx-auto text-[#1a2a1a] mb-3" />
            <p className="text-sm text-[var(--text-tertiary)]">No AI agents found</p>
            <p className="text-[10px] text-[var(--text-disabled)] mt-1">
              Add elements with type "AI Agent" to your architecture to see them here.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-4">
            {filtered.map(agent => (
              <AgentCard key={agent.id} agent={agent} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function AgentCard({ agent }: { agent: AIAgent }) {
  const provColor = PROVIDER_COLORS[agent.agentProvider || ''] || '#6b7280';
  const autonomy = AUTONOMY_LABELS[agent.autonomyLevel || ''];

  return (
    <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-raised)] p-4 hover:border-[#d4a574]/30 transition">
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: `${provColor}20` }}>
            <Bot size={16} style={{ color: provColor }} />
          </div>
          <div>
            <p className="text-sm font-medium text-white">{agent.name}</p>
            {agent.agentModel && <p className="text-[10px] text-[var(--text-tertiary)]">{agent.agentModel}</p>}
          </div>
        </div>
        {autonomy && (
          <span className="rounded-full px-2 py-0.5 text-[9px] font-medium" style={{ backgroundColor: `${autonomy.color}15`, color: autonomy.color }}>
            {autonomy.label}
          </span>
        )}
      </div>

      {agent.description && (
        <p className="text-[10px] text-[var(--text-secondary)] mb-3 line-clamp-2">{agent.description}</p>
      )}

      <div className="flex flex-wrap gap-2 text-[10px]">
        {agent.agentProvider && (
          <span className="rounded-full px-2 py-0.5 border" style={{ borderColor: `${provColor}30`, color: provColor }}>
            {agent.agentProvider}
          </span>
        )}
        {agent.costPerMonth != null && agent.costPerMonth > 0 && (
          <span className="rounded-full px-2 py-0.5 bg-[#06b6d4]/10 text-[#06b6d4]">
            ${agent.costPerMonth}/mo
          </span>
        )}
        {agent.businessOwner && (
          <span className="rounded-full px-2 py-0.5 bg-[var(--surface-base)] text-[var(--text-tertiary)]">
            {agent.businessOwner}
          </span>
        )}
        <span className="rounded-full px-2 py-0.5 bg-[var(--surface-base)] text-[var(--text-tertiary)]">
          {agent.inDegree + agent.outDegree} connections
        </span>
      </div>
    </div>
  );
}

function MiniKpi({ icon, label, value, color }: { icon: React.ReactNode; label: string; value: string | number; color: string }) {
  return (
    <div className="rounded-lg bg-[var(--surface-base)] border border-[var(--border-subtle)] p-3">
      <div className="flex items-center gap-1.5 mb-1">
        <span style={{ color }}>{icon}</span>
        <span className="text-[10px] text-[var(--text-tertiary)]">{label}</span>
      </div>
      <div className="text-lg font-bold text-white">{value}</div>
    </div>
  );
}
