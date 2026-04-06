import { useState, useEffect, useCallback } from 'react';
import {
  Eye, Send, ChevronDown, ChevronRight, AlertTriangle, CheckCircle,
  XCircle, MinusCircle, Clock, History, Shield, Users, Zap,
  FileText, Download, Database, Sparkles, ArrowRight, TrendingDown,
  Minus, Plus, ArrowDownRight,
} from 'lucide-react';
import { useParams } from 'react-router-dom';
import api, { oracleAPI } from '../../services/api';
import { useArchitectureStore } from '../../stores/architectureStore';
import type {
  OracleVerdict,
  AgentVerdict,
  ResistanceFactor,
  OracleChangeType,
} from '@thearchitect/shared/src/types/oracle.types';
import type {
  GeneratedAlternative,
  GeneratorResult,
} from '@thearchitect/shared/src/types/scenario-generator.types';

// ─── Constants ───

const CHANGE_TYPES: { value: OracleChangeType; label: string }[] = [
  { value: 'retire', label: 'Retire' },
  { value: 'migrate', label: 'Migrate' },
  { value: 'consolidate', label: 'Consolidate' },
  { value: 'introduce', label: 'Introduce' },
  { value: 'modify', label: 'Modify' },
];

const POSITION_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  likely_accepted: { bg: 'bg-emerald-500/20', text: 'text-emerald-400', label: 'Likely Accepted' },
  contested: { bg: 'bg-yellow-500/20', text: 'text-yellow-400', label: 'Contested' },
  likely_rejected: { bg: 'bg-red-500/20', text: 'text-red-400', label: 'Likely Rejected' },
};

const VERDICT_ICONS: Record<string, typeof CheckCircle> = {
  approve: CheckCircle,
  reject: XCircle,
  modify: AlertTriangle,
  abstain: MinusCircle,
};

const VERDICT_COLORS: Record<string, string> = {
  approve: 'text-emerald-400',
  reject: 'text-red-400',
  modify: 'text-yellow-400',
  abstain: 'text-slate-400',
};

const SEVERITY_COLORS: Record<string, string> = {
  high: 'bg-red-500/20 text-red-400 border-red-500/30',
  medium: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
  low: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
};

function scoreColor(score: number): string {
  if (score < 30) return '#22c55e';
  if (score < 60) return '#eab308';
  if (score < 80) return '#f97316';
  return '#ef4444';
}

interface HistoryEntry {
  id: string;
  proposal: { title: string; changeType: string; description: string; affectedElementIds?: string[]; estimatedCost?: number; estimatedDuration?: number };
  verdict: OracleVerdict;
  generatedAlternatives?: GeneratedAlternative[] | null;
  createdAt: string;
}

// ─── Main Component ───

export default function OraclePanel() {
  const { projectId } = useParams<{ projectId: string }>();
  const elements = useArchitectureStore((s) => s.elements);

  const [tab, setTab] = useState<'assess' | 'history'>('assess');

  // Form state
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [changeType, setChangeType] = useState<OracleChangeType>('modify');
  const [selectedElements, setSelectedElements] = useState<string[]>([]);
  const [estimatedCost, setEstimatedCost] = useState('');
  const [estimatedDuration, setEstimatedDuration] = useState('');
  const [elementSearch, setElementSearch] = useState('');

  // Result state
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [verdict, setVerdict] = useState<OracleVerdict | null>(null);
  const [lastAssessmentId, setLastAssessmentId] = useState<string | null>(null);
  const [expandedAgents, setExpandedAgents] = useState<Set<string>>(new Set());

  // History state
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  // Filtered elements for picker — selected elements always on top
  const filteredElements = elements.filter((el) =>
    !elementSearch || el.name.toLowerCase().includes(elementSearch.toLowerCase())
    || selectedElements.includes(el.id),
  ).sort((a, b) => {
    const aSelected = selectedElements.includes(a.id) ? 0 : 1;
    const bSelected = selectedElements.includes(b.id) ? 0 : 1;
    return aSelected - bSelected || a.name.localeCompare(b.name);
  }).slice(0, 50);

  const toggleElement = useCallback((id: string) => {
    setSelectedElements((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }, []);

  const toggleAgent = useCallback((id: string) => {
    setExpandedAgents((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }, []);

  // Submit assessment
  const handleSubmit = async () => {
    if (!projectId || !title.trim() || !description.trim() || selectedElements.length === 0) return;

    setLoading(true);
    setError('');
    setVerdict(null);

    try {
      const proposal: Record<string, unknown> = {
        title: title.trim(),
        description: description.trim(),
        affectedElementIds: selectedElements,
        changeType,
      };
      if (estimatedCost) proposal.estimatedCost = Number(estimatedCost);
      if (estimatedDuration) proposal.estimatedDuration = Number(estimatedDuration);

      const res = await oracleAPI.assess(projectId, proposal);
      setVerdict(res.data.data);
      setLastAssessmentId(res.data.assessmentId || null);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string; details?: Array<{ path: string; message: string }> } } })
        ?.response?.data;
      if (msg?.details) {
        setError(msg.details.map((d) => `${d.path}: ${d.message}`).join(', '));
      } else {
        setError(msg?.error || 'Assessment failed');
      }
    } finally {
      setLoading(false);
    }
  };

  // Load history
  const loadHistory = useCallback(async () => {
    if (!projectId) return;
    setHistoryLoading(true);
    try {
      const res = await oracleAPI.history(projectId);
      setHistory(res.data.data || []);
    } catch {
      // silent
    } finally {
      setHistoryLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    if (tab === 'history') loadHistory();
  }, [tab, loadHistory]);

  // Pre-fill assess form from a generated alternative
  const prefillFromAlternative = useCallback((alt: GeneratedAlternative, originalElementIds?: string[]) => {
    const diff = alt.requirementDiff;
    setTitle(alt.name);
    setDescription(`${alt.strategy}\n\n${alt.rationale}`);
    setChangeType(diff.changeTypeDelta.alternative as OracleChangeType);
    setEstimatedCost(alt.adjustedCost > 0 ? String(alt.adjustedCost) : '');
    setEstimatedDuration(alt.adjustedDuration > 0 ? String(alt.adjustedDuration) : '');

    // Start with ALL original elements, then remove only those explicitly
    // marked as "removed" or "phased" in scope changes.
    // Elements not mentioned by the LLM are implicitly retained.
    const nameToId = new Map(elements.map((el) => [el.name.toLowerCase(), el.id]));
    const idToName = new Map(elements.map((el) => [el.id, el.name.toLowerCase()]));

    // Collect names/IDs to exclude (removed/phased)
    const excludedIds = new Set<string>();
    // Collect names/IDs to add (new elements not in original)
    const addedIds: string[] = [];

    for (const sc of diff.scopeChanges) {
      const name = (sc.elementName || '').toLowerCase();
      const storeId = name ? nameToId.get(name) : undefined;
      if ((sc.type === 'removed' || sc.type === 'phased') && storeId) {
        excludedIds.add(storeId);
      } else if (sc.type === 'added' && storeId) {
        addedIds.push(storeId);
      }
    }

    // Original minus excluded, plus any newly added
    const base = originalElementIds || [];
    const result = [...base.filter((id) => !excludedIds.has(id)), ...addedIds];
    setSelectedElements([...new Set(result)]);

    setVerdict(null);
    setLastAssessmentId(null);
    setError('');
    setTab('assess');
  }, [elements]);

  return (
    <div className="h-full flex flex-col bg-[#0f172a] text-white">
      {/* Header */}
      <div className="px-6 py-4 border-b border-[#334155] flex items-center gap-3">
        <Eye className="w-5 h-5 text-purple-400" />
        <h2 className="text-lg font-semibold">Oracle — Acceptance Risk Score</h2>
      </div>

      {/* Tabs */}
      <div className="px-6 pt-3 flex gap-2">
        <button
          onClick={() => setTab('assess')}
          className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${
            tab === 'assess'
              ? 'bg-purple-600/30 text-purple-300 border border-purple-500/40'
              : 'text-slate-400 hover:text-white hover:bg-[#1e293b]'
          }`}
        >
          <Zap className="w-3.5 h-3.5 inline mr-1.5" />
          Assess
        </button>
        <button
          onClick={() => setTab('history')}
          className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${
            tab === 'history'
              ? 'bg-purple-600/30 text-purple-300 border border-purple-500/40'
              : 'text-slate-400 hover:text-white hover:bg-[#1e293b]'
          }`}
        >
          <History className="w-3.5 h-3.5 inline mr-1.5" />
          History
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {tab === 'assess' ? (
          <>
            {/* Form */}
            <div className="space-y-4">
              {/* Title */}
              <div>
                <label className="block text-sm text-slate-400 mb-1">Title</label>
                <input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. CRM Consolidation to Salesforce"
                  className="w-full px-3 py-2 bg-[#1e293b] border border-[#334155] rounded-lg text-sm text-white placeholder-slate-500 focus:outline-none focus:border-purple-500"
                  maxLength={200}
                />
              </div>

              {/* Description */}
              <div>
                <label className="block text-sm text-slate-400 mb-1">Description</label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Describe the proposed change in detail..."
                  rows={3}
                  className="w-full px-3 py-2 bg-[#1e293b] border border-[#334155] rounded-lg text-sm text-white placeholder-slate-500 focus:outline-none focus:border-purple-500 resize-none"
                  maxLength={3000}
                />
              </div>

              {/* Change Type + Optional Fields */}
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-sm text-slate-400 mb-1">Change Type</label>
                  <select
                    value={changeType}
                    onChange={(e) => setChangeType(e.target.value as OracleChangeType)}
                    className="w-full px-3 py-2 bg-[#1e293b] border border-[#334155] rounded-lg text-sm text-white focus:outline-none focus:border-purple-500"
                  >
                    {CHANGE_TYPES.map((ct) => (
                      <option key={ct.value} value={ct.value}>{ct.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm text-slate-400 mb-1">Est. Cost ($)</label>
                  <input
                    type="number"
                    value={estimatedCost}
                    onChange={(e) => setEstimatedCost(e.target.value)}
                    placeholder="Optional"
                    className="w-full px-3 py-2 bg-[#1e293b] border border-[#334155] rounded-lg text-sm text-white placeholder-slate-500 focus:outline-none focus:border-purple-500"
                    min={0}
                  />
                </div>
                <div>
                  <label className="block text-sm text-slate-400 mb-1">Duration (months)</label>
                  <input
                    type="number"
                    value={estimatedDuration}
                    onChange={(e) => setEstimatedDuration(e.target.value)}
                    placeholder="Optional"
                    className="w-full px-3 py-2 bg-[#1e293b] border border-[#334155] rounded-lg text-sm text-white placeholder-slate-500 focus:outline-none focus:border-purple-500"
                    min={1}
                    max={120}
                  />
                </div>
              </div>

              {/* Element Picker */}
              <div>
                <label className="block text-sm text-slate-400 mb-1">
                  Affected Elements ({selectedElements.length} selected)
                </label>
                <input
                  value={elementSearch}
                  onChange={(e) => setElementSearch(e.target.value)}
                  placeholder="Search elements..."
                  className="w-full px-3 py-2 bg-[#1e293b] border border-[#334155] rounded-lg text-sm text-white placeholder-slate-500 focus:outline-none focus:border-purple-500 mb-2"
                />
                <div className="max-h-40 overflow-y-auto bg-[#1e293b] border border-[#334155] rounded-lg">
                  {filteredElements.length === 0 ? (
                    <div className="px-3 py-2 text-sm text-slate-500">No elements found</div>
                  ) : (
                    filteredElements.map((el) => (
                      <label
                        key={el.id}
                        className="flex items-center gap-2 px-3 py-1.5 hover:bg-[#334155]/50 cursor-pointer"
                      >
                        <input
                          type="checkbox"
                          checked={selectedElements.includes(el.id)}
                          onChange={() => toggleElement(el.id)}
                          className="accent-purple-500"
                        />
                        <span className="text-sm text-white truncate">{el.name}</span>
                        <span className="text-xs text-slate-500 ml-auto">{el.layer}</span>
                      </label>
                    ))
                  )}
                </div>
              </div>

              {/* Submit */}
              <button
                onClick={handleSubmit}
                disabled={loading || !title.trim() || !description.trim() || selectedElements.length === 0}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg text-sm font-medium transition-colors"
              >
                {loading ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Consulting the Oracle...
                  </>
                ) : (
                  <>
                    <Send className="w-4 h-4" />
                    Consult Oracle
                  </>
                )}
              </button>

              {error && (
                <div className="px-3 py-2 bg-red-500/10 border border-red-500/30 rounded-lg text-sm text-red-400">
                  {error}
                </div>
              )}
            </div>

            {/* Results */}
            {verdict && (
              <>
                <VerdictDisplay verdict={verdict} expandedAgents={expandedAgents} toggleAgent={toggleAgent} />
                {lastAssessmentId && projectId && (
                  <ReportExportBar projectId={projectId} assessmentId={lastAssessmentId} />
                )}
                {lastAssessmentId && projectId && (
                  <AlternativesSection
                    projectId={projectId}
                    assessmentId={lastAssessmentId}
                    originalScore={verdict.acceptanceRiskScore}
                    overallPosition={verdict.overallPosition}
                    onReAssess={prefillFromAlternative}
                  />
                )}
              </>
            )}
          </>
        ) : (
          /* History Tab */
          <HistoryTab history={history} loading={historyLoading} projectId={projectId} onReAssess={prefillFromAlternative} />
        )}
      </div>
    </div>
  );
}

// ─── Score Ring ───

function ScoreRing({ score, size = 120 }: { score: number; size?: number }) {
  const color = scoreColor(score);
  const radius = (size - 12) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (score / 100) * circumference;

  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="#334155"
          strokeWidth="8"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          className="transition-all duration-1000 ease-out"
        />
      </svg>
      <div className="absolute flex flex-col items-center">
        <span className="text-2xl font-bold" style={{ color }}>{score}</span>
        <span className="text-xs text-slate-400">Risk</span>
      </div>
    </div>
  );
}

// ─── Verdict Display ───

function VerdictDisplay({
  verdict,
  expandedAgents,
  toggleAgent,
}: {
  verdict: OracleVerdict;
  expandedAgents: Set<string>;
  toggleAgent: (id: string) => void;
}) {
  const posStyle = POSITION_STYLES[verdict.overallPosition] || POSITION_STYLES.contested;

  return (
    <div className="space-y-4">
      {/* Score + Position */}
      <div className="flex items-center gap-6 p-4 bg-[#1e293b] border border-[#334155] rounded-xl">
        <ScoreRing score={verdict.acceptanceRiskScore} />
        <div className="flex-1 space-y-2">
          <span className={`inline-block px-3 py-1 rounded-full text-xs font-medium border ${posStyle.bg} ${posStyle.text}`}>
            {posStyle.label}
          </span>
          <div className="text-sm text-slate-400">
            Risk Level: <span className="text-white font-medium capitalize">{verdict.riskLevel}</span>
          </div>
          <div className="text-xs text-slate-500">
            Assessed in {(verdict.durationMs / 1000).toFixed(1)}s
          </div>
        </div>
      </div>

      {/* Agent Verdicts */}
      <div>
        <h3 className="text-sm font-medium text-slate-300 mb-2 flex items-center gap-2">
          <Users className="w-4 h-4" />
          Stakeholder Verdicts
        </h3>
        <div className="space-y-1">
          {verdict.agentVerdicts.map((av) => (
            <AgentVerdictCard key={av.personaId} av={av} expanded={expandedAgents.has(av.personaId)} toggle={() => toggleAgent(av.personaId)} />
          ))}
        </div>
      </div>

      {/* Resistance Factors */}
      {verdict.resistanceFactors.length > 0 && (
        <div>
          <h3 className="text-sm font-medium text-slate-300 mb-2 flex items-center gap-2">
            <Shield className="w-4 h-4" />
            Resistance Factors
          </h3>
          <div className="space-y-2">
            {verdict.resistanceFactors.map((rf, i) => (
              <ResistanceCard key={i} factor={rf} />
            ))}
          </div>
        </div>
      )}

      {/* Mitigation Suggestions */}
      {verdict.mitigationSuggestions.length > 0 && (
        <div>
          <h3 className="text-sm font-medium text-slate-300 mb-2">Mitigation Suggestions</h3>
          <div className="space-y-1">
            {verdict.mitigationSuggestions.map((s, i) => (
              <label key={i} className="flex items-start gap-2 p-2 bg-[#1e293b] border border-[#334155] rounded-lg cursor-pointer hover:border-purple-500/40">
                <input type="checkbox" className="mt-0.5 accent-purple-500" />
                <span className="text-sm text-slate-300">{s}</span>
              </label>
            ))}
          </div>
        </div>
      )}

      {/* Fatigue Forecast */}
      {verdict.fatigueForecast.projectedDelayMonths > 3 && (
        <div className="p-3 bg-orange-500/10 border border-orange-500/30 rounded-lg flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 text-orange-400 mt-0.5 flex-shrink-0" />
          <div className="text-sm">
            <span className="text-orange-400 font-medium">Fatigue Warning:</span>
            <span className="text-slate-300 ml-1">
              Projected delay of {verdict.fatigueForecast.projectedDelayMonths} months.
              {verdict.fatigueForecast.budgetAtRisk > 0 &&
                ` $${(verdict.fatigueForecast.budgetAtRisk / 1000).toFixed(0)}K budget at risk.`}
              {verdict.fatigueForecast.overloadedStakeholders.length > 0 &&
                ` Overloaded: ${verdict.fatigueForecast.overloadedStakeholders.join(', ')}.`}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Agent Verdict Card ───

function AgentVerdictCard({ av, expanded, toggle }: { av: AgentVerdict; expanded: boolean; toggle: () => void }) {
  const Icon = VERDICT_ICONS[av.position] || MinusCircle;
  const color = VERDICT_COLORS[av.position] || 'text-slate-400';

  return (
    <div className="bg-[#1e293b] border border-[#334155] rounded-lg overflow-hidden">
      <button onClick={toggle} className="w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-[#334155]/30">
        {expanded ? <ChevronDown className="w-3.5 h-3.5 text-slate-500" /> : <ChevronRight className="w-3.5 h-3.5 text-slate-500" />}
        <Icon className={`w-4 h-4 ${color}`} />
        <span className="text-sm text-white font-medium flex-1">{av.personaName}</span>
        <span className={`text-xs capitalize ${color}`}>{av.position}</span>
        <span className="text-xs text-slate-500 ml-2 w-8 text-right">{av.acceptanceScore}</span>
      </button>
      {expanded && (
        <div className="px-3 pb-3 space-y-2 border-t border-[#334155]/50">
          <p className="text-sm text-slate-300 mt-2">{av.reasoning}</p>
          {av.concerns.length > 0 && (
            <div className="space-y-1">
              {av.concerns.map((c, i) => (
                <div key={i} className="flex items-start gap-1.5 text-xs text-slate-400">
                  <span className="text-yellow-500 mt-0.5">!</span>
                  <span>{c}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Resistance Card ───

function ResistanceCard({ factor }: { factor: ResistanceFactor }) {
  const style = SEVERITY_COLORS[factor.severity] || SEVERITY_COLORS.low;
  return (
    <div className="flex items-start gap-2 p-2 bg-[#1e293b] border border-[#334155] rounded-lg">
      <span className={`text-xs px-1.5 py-0.5 rounded border ${style} flex-shrink-0`}>
        {factor.severity}
      </span>
      <div className="flex-1 min-w-0">
        <div className="text-sm text-white">{factor.factor}</div>
        <div className="text-xs text-slate-500">Source: {factor.source}</div>
      </div>
    </div>
  );
}

// ─── History Tab ───

function HistoryTab({ history, loading, projectId, onReAssess }: { history: HistoryEntry[]; loading: boolean; projectId?: string; onReAssess?: (alt: GeneratedAlternative, originalElementIds?: string[]) => void }) {
  const [expandedEntry, setExpandedEntry] = useState<string | null>(null);
  const [expandedAgents, setExpandedAgents] = useState<Set<string>>(new Set());

  const toggleEntry = (id: string) => {
    setExpandedEntry((prev) => (prev === id ? null : id));
    setExpandedAgents(new Set());
  };

  const toggleAgent = (personaId: string) => {
    setExpandedAgents((prev) => {
      const next = new Set(prev);
      next.has(personaId) ? next.delete(personaId) : next.add(personaId);
      return next;
    });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12 text-slate-500">
        <div className="w-5 h-5 border-2 border-slate-500/30 border-t-slate-500 rounded-full animate-spin mr-2" />
        Loading history...
      </div>
    );
  }

  if (history.length === 0) {
    return (
      <div className="text-center py-12 text-slate-500">
        <Eye className="w-8 h-8 mx-auto mb-2 opacity-50" />
        <p>No assessments yet</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {history.map((entry) => {
        const color = scoreColor(entry.verdict.acceptanceRiskScore);
        const posStyle = POSITION_STYLES[entry.verdict.overallPosition] || POSITION_STYLES.contested;
        const isOpen = expandedEntry === entry.id;
        return (
          <div key={entry.id} className={`bg-[#1e293b] border rounded-lg transition-colors ${isOpen ? 'border-purple-500/50' : 'border-[#334155]'}`}>
            <div onClick={() => toggleEntry(entry.id)} className="w-full p-3 text-left hover:bg-[#334155]/20 transition rounded-lg cursor-pointer" role="button" tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && toggleEntry(entry.id)}>
              <div className="flex items-center gap-3">
                {isOpen ? <ChevronDown className="w-4 h-4 text-slate-500 flex-shrink-0" /> : <ChevronRight className="w-4 h-4 text-slate-500 flex-shrink-0" />}
                <div
                  className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold border-2 flex-shrink-0"
                  style={{ borderColor: color, color }}
                >
                  {entry.verdict.acceptanceRiskScore}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm text-white font-medium truncate">{entry.proposal.title}</div>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className={`text-xs px-1.5 py-0.5 rounded ${posStyle.bg} ${posStyle.text}`}>
                      {posStyle.label}
                    </span>
                    <span className="text-xs text-slate-500 capitalize">{entry.proposal.changeType}</span>
                  </div>
                </div>
                <div className="text-xs text-slate-500 flex items-center gap-1 flex-shrink-0">
                  <Clock className="w-3 h-3" />
                  {new Date(entry.createdAt).toLocaleDateString()}
                </div>
                {!isOpen && projectId && (
                  <div onClick={(e) => e.stopPropagation()}>
                    <ReportExportBar projectId={projectId} assessmentId={entry.id} compact />
                  </div>
                )}
              </div>
            </div>

            {isOpen && (
              <div className="px-3 pb-3 space-y-3 border-t border-[#334155]/50">
                {/* Proposal summary */}
                <div className="mt-3 p-2 bg-[#0f172a] rounded-lg text-xs text-slate-400">
                  <span className="text-slate-500">Proposal:</span> {entry.proposal.description}
                </div>

                {/* Full verdict */}
                <VerdictDisplay verdict={entry.verdict} expandedAgents={expandedAgents} toggleAgent={toggleAgent} />

                {/* Export buttons */}
                {projectId && <ReportExportBar projectId={projectId} assessmentId={entry.id} />}

                {/* AI Scenario Generator */}
                {projectId && (
                  <AlternativesSection
                    projectId={projectId}
                    assessmentId={entry.id}
                    originalScore={entry.verdict.acceptanceRiskScore}
                    overallPosition={entry.verdict.overallPosition}
                    savedAlternatives={entry.generatedAlternatives}
                    originalElementIds={entry.proposal.affectedElementIds}
                    onReAssess={onReAssess}
                  />
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Report Export Bar ───

function ReportExportBar({ projectId, assessmentId, compact }: { projectId: string; assessmentId: string; compact?: boolean }) {
  const projectName = useArchitectureStore((s) => s.projectName);

  const buildFilename = (format: string) => {
    const safeName = (projectName || 'Project').replace(/[^a-zA-Z0-9_-]/g, '_');
    const d = new Date();
    const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const shortId = assessmentId.slice(-8);
    return `TA-ORA_${safeName}_${date}_${shortId}.${format}`;
  };

  const downloadReport = async (format: 'pdf' | 'json') => {
    try {
      const url = `/projects/${projectId}/oracle/${assessmentId}/report/${format}`;
      const res = await api.get(url, { responseType: 'blob' });
      const blob = new Blob([res.data], {
        type: format === 'pdf' ? 'application/pdf' : 'application/json',
      });

      // Prefer server-provided filename from Content-Disposition (has DB project name)
      let filename = buildFilename(format);
      const disposition = res.headers?.['content-disposition'];
      if (disposition) {
        const match = disposition.match(/filename="?([^"]+)"?/);
        if (match?.[1]) filename = match[1];
      }

      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = filename;
      link.click();
      URL.revokeObjectURL(link.href);
    } catch (err) {
      console.error(`[Oracle] ${format.toUpperCase()} download failed:`, err);
    }
  };

  if (compact) {
    return (
      <div className="flex gap-1 mt-1">
        <span
          role="link"
          tabIndex={0}
          onClick={(e) => { e.stopPropagation(); downloadReport('pdf'); }}
          onKeyDown={(e) => e.key === 'Enter' && downloadReport('pdf')}
          className="flex items-center gap-1 px-1.5 py-0.5 text-[10px] rounded bg-[#334155]/50 text-slate-400 hover:text-white hover:bg-[#334155] transition cursor-pointer"
          title="Download PDF Report"
        >
          <FileText className="w-3 h-3" />
          PDF
        </span>
        <span
          role="link"
          tabIndex={0}
          onClick={(e) => { e.stopPropagation(); downloadReport('json'); }}
          onKeyDown={(e) => e.key === 'Enter' && downloadReport('json')}
          className="flex items-center gap-1 px-1.5 py-0.5 text-[10px] rounded bg-[#334155]/50 text-slate-400 hover:text-white hover:bg-[#334155] transition cursor-pointer"
          title="Download JSON Report"
        >
          <Database className="w-3 h-3" />
          JSON
        </span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3 mt-4 pt-4 border-t border-[#334155]">
      <span className="text-xs text-slate-500 flex items-center gap-1">
        <Download className="w-3.5 h-3.5" />
        Export Audit Report:
      </span>
      <button
        onClick={() => downloadReport('pdf')}
        className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md bg-red-500/10 border border-red-500/20 text-red-400 hover:bg-red-500/20 transition"
      >
        <FileText className="w-3.5 h-3.5" />
        PDF Report
      </button>
      <button
        onClick={() => downloadReport('json')}
        className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md bg-blue-500/10 border border-blue-500/20 text-blue-400 hover:bg-blue-500/20 transition"
      >
        <Database className="w-3.5 h-3.5" />
        JSON (Database)
      </button>
    </div>
  );
}

// ─── Alternatives Section (AI Scenario Generator) ───

const SCOPE_ICONS: Record<string, typeof Minus> = {
  removed: XCircle,
  phased: Clock,
  retained: CheckCircle,
  modified: AlertTriangle,
  added: Plus,
};

const SCOPE_COLORS: Record<string, string> = {
  removed: 'text-red-400',
  phased: 'text-yellow-400',
  retained: 'text-emerald-400',
  modified: 'text-blue-400',
  added: 'text-purple-400',
};

function AlternativesSection({
  projectId,
  assessmentId,
  originalScore,
  overallPosition,
  savedAlternatives,
  originalElementIds,
  onReAssess,
}: {
  projectId: string;
  assessmentId: string;
  originalScore: number;
  overallPosition: string;
  savedAlternatives?: GeneratedAlternative[] | null;
  originalElementIds?: string[];
  onReAssess?: (alt: GeneratedAlternative, originalElementIds?: string[]) => void;
}) {
  const [alternatives, setAlternatives] = useState<GeneratedAlternative[]>(savedAlternatives || []);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [autoAssess, setAutoAssess] = useState(false);
  const [expandedAlt, setExpandedAlt] = useState<Set<number>>(new Set());
  const [generated, setGenerated] = useState(!!(savedAlternatives && savedAlternatives.length > 0));

  const generate = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await oracleAPI.generateAlternatives(projectId, assessmentId, {
        maxAlternatives: 3,
        autoAssess,
      });
      const result = res.data.data as GeneratorResult;
      setAlternatives(result.alternatives);
      setGenerated(true);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to generate alternatives');
    } finally {
      setLoading(false);
    }
  };

  const toggleExpand = (idx: number) => {
    setExpandedAlt((prev) => {
      const next = new Set(prev);
      next.has(idx) ? next.delete(idx) : next.add(idx);
      return next;
    });
  };

  const ctaLabel = overallPosition === 'likely_accepted'
    ? 'Optimize Further'
    : 'Generate Alternatives';

  const ctaDescription = overallPosition === 'likely_accepted'
    ? 'Generate alternative proposals that reduce cost or shorten timeline.'
    : 'Generate alternative proposals that address stakeholder resistance.';

  return (
    <div className="mt-6 pt-5 border-t border-[#334155]">
      <div className="flex items-center gap-2 mb-3">
        <Sparkles className="w-4 h-4 text-purple-400" />
        <h3 className="text-sm font-semibold text-white">AI Scenario Generator</h3>
      </div>

      {!generated ? (
        <div className="bg-[#1e293b] border border-[#334155] rounded-lg p-4">
          <p className="text-xs text-slate-400 mb-3">{ctaDescription}</p>

          <div className="flex items-center gap-4">
            <label className="flex items-center gap-2 text-xs text-slate-400 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={autoAssess}
                onChange={(e) => setAutoAssess(e.target.checked)}
                className="rounded border-slate-600 bg-[#0f172a] text-purple-500 focus:ring-purple-500"
              />
              Auto-assess alternatives
            </label>

            <button
              onClick={generate}
              disabled={loading}
              className="flex items-center gap-2 px-4 py-2 text-xs font-medium rounded-lg bg-purple-500/20 border border-purple-500/30 text-purple-300 hover:bg-purple-500/30 transition disabled:opacity-50"
            >
              {loading ? (
                <>
                  <div className="w-3.5 h-3.5 border-2 border-purple-400/30 border-t-purple-400 rounded-full animate-spin" />
                  Generating...
                </>
              ) : (
                <>
                  <Sparkles className="w-3.5 h-3.5" />
                  {ctaLabel}
                </>
              )}
            </button>
          </div>

          {error && (
            <p className="mt-2 text-xs text-red-400">{error}</p>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {alternatives.map((alt, idx) => {
            const isExpanded = expandedAlt.has(idx);
            const diff = alt.requirementDiff;
            const hasOracleScore = !!alt.oracleAssessment;
            const scoreDelta = hasOracleScore ? alt.oracleAssessment!.deltaFromOriginal : 0;

            return (
              <div key={idx} className="bg-[#1e293b] border border-[#334155] rounded-lg overflow-hidden">
                {/* Header */}
                <div
                  className="flex items-center justify-between p-3 cursor-pointer hover:bg-[#334155]/30 transition"
                  onClick={() => toggleExpand(idx)}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="text-[10px] font-bold text-purple-400 bg-purple-500/10 px-1.5 py-0.5 rounded">
                      S{idx + 1}
                    </span>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-white truncate">{alt.name}</p>
                      <p className="text-[11px] text-slate-400 truncate">{alt.strategy}</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 shrink-0">
                    {/* Cost & Duration */}
                    <div className="text-right">
                      <p className="text-xs text-white">
                        ${(alt.adjustedCost / 1000).toFixed(0)}K
                        <span className={`ml-1 text-[10px] ${diff.costDelta.delta < 0 ? 'text-emerald-400' : diff.costDelta.delta > 0 ? 'text-red-400' : 'text-slate-500'}`}>
                          {diff.costDelta.deltaPercent > 0 ? '+' : ''}{diff.costDelta.deltaPercent}%
                        </span>
                      </p>
                      <p className="text-[10px] text-slate-500">{alt.adjustedDuration} months</p>
                    </div>

                    {/* Oracle Score (if auto-assessed) */}
                    {hasOracleScore && (
                      <div className="text-center px-2 py-1 rounded bg-[#0f172a]">
                        <p className="text-sm font-bold" style={{ color: scoreColor(alt.oracleAssessment!.acceptanceRiskScore) }}>
                          {alt.oracleAssessment!.acceptanceRiskScore}
                        </p>
                        <p className={`text-[9px] font-medium ${scoreDelta > 0 ? 'text-emerald-400' : 'text-slate-500'}`}>
                          {scoreDelta > 0 ? `↓${scoreDelta}` : scoreDelta < 0 ? `↑${Math.abs(scoreDelta)}` : '—'}
                        </p>
                      </div>
                    )}

                    {isExpanded ? <ChevronDown className="w-4 h-4 text-slate-500" /> : <ChevronRight className="w-4 h-4 text-slate-500" />}
                  </div>
                </div>

                {/* Expanded Requirement Diff */}
                {isExpanded && (
                  <div className="px-3 pb-3 border-t border-[#334155]/50">
                    {/* Deltas bar */}
                    <div className="flex gap-4 mt-3 mb-3 text-[11px]">
                      <span className="text-slate-500">
                        Scope: {diff.scopeChanges.filter((s) => s.type !== 'retained').length} changes
                      </span>
                      <span className={diff.costDelta.delta < 0 ? 'text-emerald-400' : diff.costDelta.delta > 0 ? 'text-red-400' : 'text-slate-500'}>
                        Cost: ${diff.costDelta.original.toLocaleString()} → ${diff.costDelta.alternative.toLocaleString()} ({diff.costDelta.deltaPercent > 0 ? '+' : ''}{diff.costDelta.deltaPercent}%)
                      </span>
                      <span className={diff.durationDelta.delta < 0 ? 'text-emerald-400' : diff.durationDelta.delta > 0 ? 'text-red-400' : 'text-slate-500'}>
                        Duration: {diff.durationDelta.original} → {diff.durationDelta.alternative} mo
                      </span>
                      {diff.changeTypeDelta.changed && (
                        <span className="text-purple-400">
                          Type: {diff.changeTypeDelta.original} → {diff.changeTypeDelta.alternative}
                        </span>
                      )}
                    </div>

                    {/* Scope Changes */}
                    {diff.scopeChanges.length > 0 && (
                      <div className="mb-3">
                        <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1">Scope Changes</p>
                        <div className="space-y-0.5">
                          {diff.scopeChanges.map((sc, si) => {
                            const Icon = SCOPE_ICONS[sc.type] || Minus;
                            return (
                              <div key={si} className="flex items-center gap-2 text-[11px]">
                                <Icon className={`w-3 h-3 ${SCOPE_COLORS[sc.type] || 'text-slate-500'}`} />
                                <span className={SCOPE_COLORS[sc.type] || 'text-slate-400'}>
                                  {sc.elementName || sc.description}
                                </span>
                                <span className="text-slate-600">— {sc.reason}</span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* Addressed Blockers */}
                    {diff.addressedBlockers.length > 0 && (
                      <div className="mb-3">
                        <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1">Addressed Blockers</p>
                        {diff.addressedBlockers.map((b, bi) => (
                          <div key={bi} className="flex items-center gap-2 text-[11px] text-slate-400">
                            <ArrowDownRight className="w-3 h-3 text-emerald-400" />
                            <span className="text-white">{b.stakeholder}</span>
                            <span className="text-slate-600">({b.originalPosition}, score {b.originalScore})</span>
                            <span className="text-slate-500">— {b.resistanceFactor}</span>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Trade-offs */}
                    {diff.tradeOffs.length > 0 && (
                      <div className="mb-3">
                        <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1">Trade-offs</p>
                        {diff.tradeOffs.map((t, ti) => (
                          <div key={ti} className="flex items-center gap-2 text-[11px] text-yellow-400/80">
                            <AlertTriangle className="w-3 h-3 shrink-0" />
                            {t}
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Rationale */}
                    <p className="text-[11px] text-slate-400 italic mt-2">{alt.rationale}</p>

                    {/* Actions */}
                    <div className="flex gap-2 mt-3">
                      {onReAssess && (
                        <button
                          onClick={() => onReAssess(alt, originalElementIds)}
                          className="flex items-center gap-1.5 px-2.5 py-1 text-[11px] rounded bg-purple-500/10 border border-purple-500/20 text-purple-300 hover:bg-purple-500/20 transition"
                          title="Pre-fill Oracle Assess form with this alternative"
                        >
                          <Zap className="w-3 h-3" />
                          Re-assess in Oracle
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}

          {/* Generate Again */}
          <button
            onClick={() => { setGenerated(false); setAlternatives([]); }}
            className="text-[11px] text-slate-500 hover:text-slate-300 transition"
          >
            Generate new alternatives
          </button>
        </div>
      )}
    </div>
  );
}
