import { useState } from 'react';
import {
  ChevronDown, ChevronRight, DollarSign, Clock, AlertTriangle,
  Shield, Users, ArrowRight, Lightbulb, X, Cpu, GitBranch, TrendingUp,
} from 'lucide-react';
import type { RoadmapWave, WaveElement } from '@thearchitect/shared';

const STATUS_COLORS: Record<string, string> = {
  current: '#3b82f6',
  target: '#22c55e',
  transitional: '#f59e0b',
  retired: '#ef4444',
};

const RISK_COLOR = (r: number) =>
  r > 80 ? '#ef4444' : r > 60 ? '#f97316' : r > 30 ? '#f59e0b' : '#22c55e';

function formatCost(n: number) {
  if (n >= 1_000_000) return `€${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `€${(n / 1_000).toFixed(0)}K`;
  return `€${n}`;
}

function CostBreakdown({ el, onClose }: { el: WaveElement; onClose: () => void }) {
  const isN8n = el.costModel === 'n8n';
  const topo = el.topologyComplexity ?? 1.0;
  const fatigue = el.stakeholderFatigue ?? 0;
  const frictionMult = fatigue < 0.3 ? 1.0 : fatigue < 0.6 ? 1.0 + (fatigue - 0.3) / 0.3 * 0.5 : fatigue < 0.8 ? 1.5 + (fatigue - 0.6) / 0.2 * 1.0 : 2.5 + (fatigue - 0.8) / 0.2 * 1.5;
  const baseCost = topo > 0 && frictionMult > 0 ? el.estimatedCost / (topo * frictionMult) : el.estimatedCost;

  return (
    <div className="mt-1 mb-2 mx-1 rounded-lg bg-[#0a0f0a] border border-[#1a2a1a] p-3 space-y-2.5 animate-in fade-in duration-200">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-white">{el.name} — Cost Breakdown</span>
        <button onClick={onClose} className="text-[var(--text-tertiary)] hover:text-white transition"><X size={14} /></button>
      </div>

      {/* Model */}
      <div className="flex items-center gap-2 text-xs text-[var(--text-tertiary)]">
        <Cpu size={12} />
        <span>Model: <span className="text-[var(--text-secondary)]">{isN8n ? 'N8n (hours × €100/h)' : 'Enterprise (type-based)'}</span></span>
      </div>

      {/* Base cost */}
      <div className="grid grid-cols-2 gap-2">
        <div className="rounded bg-[var(--surface-base)] p-2">
          <div className="text-[10px] text-[var(--text-tertiary)] uppercase">Base Cost</div>
          <div className="text-sm font-medium text-white">{formatCost(Math.round(baseCost))}</div>
          {isN8n && el.estimatedHours && (
            <div className="text-[10px] text-[var(--text-tertiary)]">{el.estimatedHours.toFixed(0)}h × €100</div>
          )}
        </div>
        <div className="rounded bg-[var(--surface-base)] p-2">
          <div className="text-[10px] text-[var(--text-tertiary)] uppercase">Final Cost</div>
          <div className="text-sm font-bold text-[#f59e0b]">{formatCost(el.estimatedCost)}</div>
        </div>
      </div>

      {/* Multipliers */}
      <div className="space-y-1.5">
        <div className="text-[10px] text-[var(--text-tertiary)] uppercase font-medium">Multipliers</div>

        {/* Topology Complexity */}
        <div className="flex items-center justify-between text-xs px-2 py-1.5 rounded bg-[var(--surface-base)]">
          <div className="flex items-center gap-1.5">
            <GitBranch size={12} className="text-[#a855f7]" />
            <span className="text-[var(--text-secondary)]">Topology Complexity</span>
          </div>
          <span className={`font-medium ${topo > 2 ? 'text-[#f59e0b]' : 'text-[#22c55e]'}`}>×{topo.toFixed(2)}</span>
        </div>

        {/* Stakeholder Friction */}
        <div className="flex items-center justify-between text-xs px-2 py-1.5 rounded bg-[var(--surface-base)]">
          <div className="flex items-center gap-1.5">
            <Users size={12} className="text-[#f97316]" />
            <span className="text-[var(--text-secondary)]">Stakeholder Friction</span>
          </div>
          <span className={`font-medium ${frictionMult > 1.5 ? 'text-[#ef4444]' : frictionMult > 1 ? 'text-[#f59e0b]' : 'text-[#22c55e]'}`}>×{frictionMult.toFixed(2)}</span>
        </div>

        {/* Status Transition */}
        <div className="flex items-center justify-between text-xs px-2 py-1.5 rounded bg-[var(--surface-base)]">
          <div className="flex items-center gap-1.5">
            <TrendingUp size={12} className="text-[#3b82f6]" />
            <span className="text-[var(--text-secondary)]">Transition</span>
          </div>
          <span className="text-white">
            <span style={{ color: STATUS_COLORS[el.currentStatus] }}>{el.currentStatus}</span>
            {' → '}
            <span style={{ color: STATUS_COLORS[el.targetStatus] }}>{el.targetStatus}</span>
          </span>
        </div>

        {/* Risk */}
        <div className="flex items-center justify-between text-xs px-2 py-1.5 rounded bg-[var(--surface-base)]">
          <div className="flex items-center gap-1.5">
            <AlertTriangle size={12} className="text-[#ef4444]" />
            <span className="text-[var(--text-secondary)]">Risk Score</span>
          </div>
          <span style={{ color: RISK_COLOR(el.riskScore) }} className="font-medium">{el.riskScore.toFixed(0)}%</span>
        </div>
      </div>

      {/* Dependencies */}
      {el.dependsOnElementIds.length > 0 && (
        <div className="text-xs text-[var(--text-tertiary)]">
          <span className="font-medium">{el.dependsOnElementIds.length}</span> dependencies → higher topology cost
        </div>
      )}
    </div>
  );
}

interface WaveCardProps {
  wave: RoadmapWave;
  isSelected: boolean;
  onSelect: () => void;
  onElementClick?: (elementId: string) => void;
}

export default function WaveCard({ wave, isSelected, onSelect, onElementClick }: WaveCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [selectedElement, setSelectedElement] = useState<string | null>(null);

  return (
    <div
      className={`border rounded-lg transition-all ${
        isSelected
          ? 'border-[#00ff41] bg-[#0a1a0a]'
          : 'border-[var(--border-subtle)] bg-[var(--surface-raised)] hover:border-[#2a3a2a]'
      }`}
    >
      {/* Header */}
      <button
        onClick={() => { onSelect(); setExpanded(!expanded); }}
        className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-left"
      >
        {expanded ? (
          <ChevronDown size={16} className="text-[#00ff41] shrink-0" />
        ) : (
          <ChevronRight size={16} className="text-[var(--text-tertiary)] shrink-0" />
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-[#00ff41] bg-[#0a1a0a] px-2 py-0.5 rounded">
              W{wave.waveNumber}
            </span>
            <span className="text-sm font-medium text-white truncate">{wave.name}</span>
          </div>
          <p className="text-xs text-[#6a7a6a] mt-0.5 truncate">{wave.description}</p>
        </div>
        <div className="flex items-center gap-3 shrink-0 text-xs">
          <span className="text-[var(--text-secondary)]">{wave.elements.length} items</span>
          <span className="text-[#f59e0b]">{formatCost(wave.metrics.totalCost)}</span>
          <span className="text-[#3b82f6]">{wave.estimatedDurationMonths}mo</span>
        </div>
      </button>

      {/* Expanded Content */}
      {expanded && (
        <div className="px-3.5 pb-3.5 space-y-3 border-t border-[var(--border-subtle)]">
          {/* Metrics Row */}
          <div className="grid grid-cols-4 gap-3 pt-3">
            <div className="text-center">
              <DollarSign size={16} className="mx-auto text-[#f59e0b] mb-1" />
              <div className="text-xs font-medium text-white">{formatCost(wave.metrics.totalCost)}</div>
              <div className="text-xs text-[var(--text-tertiary)]">Cost</div>
            </div>
            <div className="text-center">
              <Clock size={16} className="mx-auto text-[#3b82f6] mb-1" />
              <div className="text-xs font-medium text-white">{wave.estimatedDurationMonths} mo</div>
              <div className="text-xs text-[var(--text-tertiary)]">Duration</div>
            </div>
            <div className="text-center">
              <AlertTriangle size={16} className="mx-auto text-[#22c55e] mb-1" />
              <div className="text-xs font-medium text-white">
                {wave.metrics.riskDelta > 0 ? '+' : ''}{wave.metrics.riskDelta.toFixed(0)}%
              </div>
              <div className="text-xs text-[var(--text-tertiary)]">Risk Delta</div>
            </div>
            <div className="text-center">
              <Shield size={16} className="mx-auto text-[#a855f7] mb-1" />
              <div className="text-xs font-medium text-white">{wave.metrics.complianceImpact}</div>
              <div className="text-xs text-[var(--text-tertiary)]">Violations</div>
            </div>
          </div>

          {/* Fatigue indicator */}
          {wave.metrics.avgFatigue > 0 && (
            <div className="flex items-center gap-2 text-xs">
              <Users size={14} className="text-[#f97316]" />
              <span className="text-[var(--text-secondary)]">Stakeholder Fatigue:</span>
              <div className="flex-1 h-1.5 bg-[#1a2a1a] rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${wave.metrics.avgFatigue * 100}%`,
                    backgroundColor: wave.metrics.avgFatigue > 0.6 ? '#ef4444' : wave.metrics.avgFatigue > 0.3 ? '#f59e0b' : '#22c55e',
                  }}
                />
              </div>
              <span className="text-[var(--text-secondary)]">{(wave.metrics.avgFatigue * 100).toFixed(0)}%</span>
            </div>
          )}

          {/* Elements */}
          <div className="space-y-1.5">
            <div className="text-xs font-medium text-[var(--text-secondary)] uppercase tracking-wider">Elements</div>
            {wave.elements.map((el) => (
              <div key={el.elementId}>
                <button
                  onClick={() => setSelectedElement(selectedElement === el.elementId ? null : el.elementId)}
                  className={`w-full flex items-center gap-2.5 px-3 py-2 rounded transition text-left ${
                    selectedElement === el.elementId
                      ? 'bg-[#1a2a1a] ring-1 ring-[#00ff41]/30'
                      : 'bg-[var(--surface-base)] hover:bg-[#1a1a1a]'
                  }`}
                >
                  <div
                    className="w-2 h-2 rounded-full shrink-0"
                    style={{ backgroundColor: RISK_COLOR(el.riskScore) }}
                  />
                  <span className="text-sm text-white flex-1 truncate">{el.name}</span>
                  <div className="flex items-center gap-1.5 text-xs shrink-0">
                    <span style={{ color: STATUS_COLORS[el.currentStatus] || '#7a8a7a' }}>
                      {el.currentStatus}
                    </span>
                    <ArrowRight size={10} className="text-[var(--text-tertiary)]" />
                    <span style={{ color: STATUS_COLORS[el.targetStatus] || '#7a8a7a' }}>
                      {el.targetStatus}
                    </span>
                  </div>
                  <span className="text-xs text-[var(--text-tertiary)]">{formatCost(el.estimatedCost)}</span>
                </button>
                {selectedElement === el.elementId && (
                  <CostBreakdown el={el} onClose={() => setSelectedElement(null)} />
                )}
              </div>
            ))}
          </div>

          {/* Recommendation */}
          {wave.recommendation && (
            <div className="flex gap-2.5 p-3 rounded bg-[#0a1a0a] border border-[var(--border-subtle)]">
              <Lightbulb size={16} className="text-[#00ff41] shrink-0 mt-0.5" />
              <p className="text-xs text-[#b0c0b0] leading-relaxed">{wave.recommendation}</p>
            </div>
          )}

          {/* Risk Mitigations */}
          {wave.riskMitigations && wave.riskMitigations.length > 0 && (
            <div className="space-y-1.5">
              <div className="text-xs font-medium text-[#f59e0b] flex items-center gap-1.5">
                <AlertTriangle size={14} /> Risk Mitigations
              </div>
              {wave.riskMitigations.map((m, i) => (
                <p key={i} className="text-xs text-[var(--text-secondary)] pl-5">• {m}</p>
              ))}
            </div>
          )}

          {/* Stakeholder Notes */}
          {wave.stakeholderNotes && (
            <div className="flex gap-2.5 p-3 rounded bg-[#1a1a0a] border border-[#2a2a1a]">
              <Users size={16} className="text-[#f59e0b] shrink-0 mt-0.5" />
              <p className="text-xs text-[#b0b080] leading-relaxed">{wave.stakeholderNotes}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
