import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import {
  ArrowLeft, Plus, Trash2, Loader2, AlertCircle, CheckCircle2,
  AlertTriangle, XCircle, Minus, Sparkles, Check, X, Edit3, Wrench,
} from 'lucide-react';
import { standardsAPI } from '../../services/api';
import { architectureAPI } from '../../services/api';
import { useAuthStore } from '../../stores/authStore';
import { useComplianceStore } from '../../stores/complianceStore';
import { useRemediationStore } from '../../stores/remediationStore';

// ─── Types ───

interface MatrixCell {
  sectionId: string;
  sectionNumber: string;
  sectionTitle: string;
  layer: string;
  total: number;
  compliant: number;
  partial: number;
  gap: number;
  notApplicable: number;
}

interface MatrixData {
  cells: MatrixCell[];
  layers: string[];
  sections: { id: string; number: string; title: string }[];
}

interface Mapping {
  _id: string;
  sectionId: string;
  sectionNumber: string;
  elementId: string;
  elementName: string;
  elementLayer: string;
  status: 'compliant' | 'partial' | 'gap' | 'not_applicable';
  notes: string;
  source: 'ai' | 'manual';
  confidence: number;
  suggestedNewElement?: {
    name: string;
    type: string;
    layer: string;
    description: string;
  };
}

interface ArchElement {
  id: string;
  name: string;
  layer: string;
  type: string;
}

interface DrilldownState {
  sectionId: string;
  sectionNumber: string;
  sectionTitle: string;
  layer: string;
}

interface ComplianceMatrixProps {
  standardId: string;
  sectionIds?: string[];
  onBack: () => void;
  autoSuggest?: boolean;
}

// ─── Helpers ───

function getCellColor(cell: MatrixCell) {
  if (cell.total === 0) return 'bg-[var(--surface-raised)] text-[var(--text-disabled)]';
  if (cell.gap > 0) return 'bg-red-500/10 text-red-400 border-red-500/20';
  if (cell.partial > 0) return 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20';
  return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20';
}

function getCellIcon(cell: MatrixCell) {
  if (cell.total === 0) return <Minus size={14} className="text-[var(--text-disabled)]" />;
  if (cell.gap > 0) return <XCircle size={14} className="text-red-400" />;
  if (cell.partial > 0) return <AlertTriangle size={14} className="text-yellow-400" />;
  return <CheckCircle2 size={14} className="text-emerald-400" />;
}

function getStatusIcon(status: string) {
  switch (status) {
    case 'compliant': return <CheckCircle2 size={14} className="text-emerald-400" />;
    case 'partial': return <AlertTriangle size={14} className="text-yellow-400" />;
    case 'gap': return <XCircle size={14} className="text-red-400" />;
    default: return <Minus size={14} className="text-[var(--text-disabled)]" />;
  }
}

function getLayerScore(cells: MatrixCell[], layer: string): number {
  const layerCells = cells.filter((c) => c.layer === layer && c.total > 0);
  if (layerCells.length === 0) return -1;
  const totalMappings = layerCells.reduce((sum, c) => sum + c.total, 0);
  const compliantMappings = layerCells.reduce((sum, c) => sum + c.compliant, 0);
  const partialMappings = layerCells.reduce((sum, c) => sum + c.partial, 0);
  return Math.round(((compliantMappings + partialMappings * 0.5) / totalMappings) * 100);
}

// ─── Component ───

export default function ComplianceMatrix({ standardId, sectionIds, onBack, autoSuggest }: ComplianceMatrixProps) {
  const { projectId } = useParams();
  const token = useAuthStore((s) => s.token);
  const refreshStats = useComplianceStore((s) => s.refreshStats);
  const [matrix, setMatrix] = useState<MatrixData | null>(null);
  const [mappings, setMappings] = useState<Mapping[]>([]);
  const [elements, setElements] = useState<ArchElement[]>([]);
  const [drilldown, setDrilldown] = useState<DrilldownState | null>(null);
  const [loading, setLoading] = useState(true);
  const [suggesting, setSuggesting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Add mapping form
  const [showAddForm, setShowAddForm] = useState(false);
  const [addElementId, setAddElementId] = useState('');
  const [addStatus, setAddStatus] = useState<string>('gap');
  const [addNotes, setAddNotes] = useState('');

  // Edit mapping
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editStatus, setEditStatus] = useState<string>('');
  const [editNotes, setEditNotes] = useState('');

  const loadMatrix = useCallback(async () => {
    if (!projectId) return;
    try {
      setLoading(true);
      const [matrixRes, mappingsRes, elementsRes] = await Promise.all([
        standardsAPI.getMatrix(projectId, standardId, sectionIds),
        standardsAPI.getMappings(projectId, standardId),
        architectureAPI.getElements(projectId),
      ]);
      setMatrix(matrixRes.data);
      setMappings(mappingsRes.data);

      // Extract elements from architecture data (handle both {data} and {data: {data}} formats)
      const rawEls = elementsRes.data?.data || elementsRes.data || [];
      const els = (Array.isArray(rawEls) ? rawEls : []).map((e: Record<string, unknown>) => ({
        id: String(e.id || e._id || ''),
        name: String(e.name || ''),
        layer: String(e.layer || ''),
        type: String(e.type || ''),
      }));
      setElements(els);
    } catch (err) {
      console.error('[ComplianceMatrix] Load failed:', err);
      setError('Failed to load matrix');
    } finally {
      setLoading(false);
    }
  }, [projectId, standardId, sectionIds]);

  useEffect(() => {
    loadMatrix();
  }, [loadMatrix]);

  const handleAISuggest = async () => {
    if (!projectId) return;
    setSuggesting(true);
    setError(null);

    try {
      const apiBase = import.meta.env.VITE_API_URL || '/api';
      const response = await fetch(
        `${apiBase}/projects/${projectId}/standards/${standardId}/ai-suggest`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ sectionIds }),
        },
      );

      if (!response.ok) throw new Error('AI suggestion failed');

      const reader = response.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          try {
            const parsed = JSON.parse(line.slice(6));
            if (parsed.done) {
              // Suggestions saved, reload matrix + refresh pipeline stats
              await loadMatrix();
              if (projectId) await refreshStats(projectId, standardId);
            }
          } catch {
            // Partial JSON, skip
          }
        }
      }
    } catch {
      setError('Failed to generate AI suggestions');
    } finally {
      setSuggesting(false);
    }
  };

  // Auto-trigger AI suggestions when navigated from "AI Match" button
  useEffect(() => {
    if (autoSuggest && !loading && !suggesting && matrix) {
      handleAISuggest();
    }
    // Only trigger once when matrix first loads
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoSuggest, loading, matrix]);

  const handleAddMapping = async () => {
    if (!projectId || !drilldown || !addElementId) return;
    const element = elements.find((e) => e.id === addElementId);
    if (!element) return;

    const section = matrix?.sections.find((s) => s.id === drilldown.sectionId);

    try {
      await standardsAPI.upsertMapping(projectId, standardId, {
        sectionId: drilldown.sectionId,
        sectionNumber: section?.number || '',
        elementId: element.id,
        elementName: element.name,
        elementLayer: element.layer,
        status: addStatus,
        notes: addNotes,
      });
      setShowAddForm(false);
      setAddElementId('');
      setAddStatus('gap');
      setAddNotes('');
      await loadMatrix();
      if (projectId) await refreshStats(projectId, standardId);
    } catch {
      setError('Failed to create mapping');
    }
  };

  const handleUpdateMapping = async (mappingId: string) => {
    if (!projectId) return;
    const mapping = mappings.find((m) => m._id === mappingId);
    if (!mapping) return;

    try {
      await standardsAPI.upsertMapping(projectId, standardId, {
        sectionId: mapping.sectionId,
        sectionNumber: mapping.sectionNumber,
        elementId: mapping.elementId,
        elementName: mapping.elementName,
        elementLayer: mapping.elementLayer,
        status: editStatus,
        notes: editNotes,
      });
      setEditingId(null);
      await loadMatrix();
      if (projectId) await refreshStats(projectId, standardId);
    } catch {
      setError('Failed to update mapping');
    }
  };

  const handleDeleteMapping = async (mappingId: string) => {
    if (!projectId) return;
    try {
      await standardsAPI.deleteMapping(projectId, standardId, mappingId);
      await loadMatrix();
      if (projectId) await refreshStats(projectId, standardId);
    } catch {
      setError('Failed to delete mapping');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 size={24} className="animate-spin text-[#38bdf8]" />
      </div>
    );
  }

  if (!matrix) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-6 gap-3">
        <AlertCircle size={24} className="text-red-400" />
        <p className="text-sm text-[var(--text-tertiary)]">
          {error || 'Failed to load matrix. The standard may not have parseable sections.'}
        </p>
        <button
          onClick={loadMatrix}
          className="text-sm px-4 py-2 rounded border border-[var(--border-subtle)] text-[var(--text-secondary)] hover:bg-[var(--surface-overlay)] transition"
        >
          Retry
        </button>
      </div>
    );
  }

  // ─── Drilldown View ───
  if (drilldown) {
    const drillMappings = mappings.filter(
      (m) => m.sectionId === drilldown.sectionId && m.elementLayer === drilldown.layer,
    );
    const layerElements = elements.filter((e) => e.layer === drilldown.layer);
    const mappedElementIds = new Set(drillMappings.map((m) => m.elementId));
    const unmappedElements = layerElements.filter((e) => !mappedElementIds.has(e.id));

    return (
      <div className="flex flex-col h-full">
        {/* Drilldown Header */}
        <div className="px-4 py-3 border-b border-[var(--border-subtle)]">
          <button
            onClick={() => setDrilldown(null)}
            className="flex items-center gap-1.5 text-sm text-[#38bdf8] hover:text-white mb-2 transition"
          >
            <ArrowLeft size={14} />
            Back to Matrix
          </button>
          <p className="text-sm font-medium text-white">
            §{drilldown.sectionNumber} {drilldown.sectionTitle}
          </p>
          <p className="text-xs text-[var(--text-tertiary)] mt-0.5">
            × {drilldown.layer.charAt(0).toUpperCase() + drilldown.layer.slice(1)} Layer
          </p>
          {drillMappings.some((m) => m.status === 'gap') && (
            <button
              onClick={() => {
                const gapSectionIds = drillMappings
                  .filter((m) => m.status === 'gap')
                  .map((m) => m.sectionId);
                if (standardId && gapSectionIds.length > 0 && projectId) {
                  useRemediationStore.getState().generate(projectId, {
                    source: 'compliance',
                    standardId,
                    gapSectionIds: [...new Set(gapSectionIds)],
                  });
                  // Switch to Remediation tab
                  window.dispatchEvent(new CustomEvent('copilot:setTab', { detail: { tab: 'remediation' } }));
                }
              }}
              className="mt-2 flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium bg-[#7c3aed]/10 text-[#7c3aed] border border-[#7c3aed]/20 hover:bg-[#7c3aed]/20 transition"
            >
              <Wrench size={12} />
              Remediate Gaps with AI
            </button>
          )}
        </div>

        {/* Mappings List */}
        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {drillMappings.length === 0 && !showAddForm && (
            <div className="text-center py-6">
              <XCircle size={24} className="text-[var(--text-disabled)] mx-auto mb-2" />
              <p className="text-sm text-[var(--text-tertiary)]">No mappings for this combination.</p>
            </div>
          )}

          {drillMappings.map((mapping) => (
            <div
              key={mapping._id}
              className="rounded border border-[var(--border-subtle)] bg-[var(--surface-base)] p-3"
            >
              {editingId === mapping._id ? (
                /* Edit Mode */
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    {getStatusIcon(mapping.status)}
                    <span className="text-sm text-white font-medium">{mapping.elementName}</span>
                  </div>
                  <select
                    value={editStatus}
                    onChange={(e) => setEditStatus(e.target.value)}
                    className="w-full bg-[var(--surface-raised)] border border-[var(--border-subtle)] rounded px-3 py-1.5 text-sm text-white outline-none"
                  >
                    <option value="compliant">Compliant</option>
                    <option value="partial">Partial</option>
                    <option value="gap">Gap</option>
                    <option value="not_applicable">N/A</option>
                  </select>
                  <input
                    type="text"
                    value={editNotes}
                    onChange={(e) => setEditNotes(e.target.value)}
                    placeholder="Notes..."
                    className="w-full bg-[var(--surface-raised)] border border-[var(--border-subtle)] rounded px-3 py-1.5 text-sm text-white placeholder:text-[var(--text-disabled)] outline-none"
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleUpdateMapping(mapping._id)}
                      className="flex-1 flex items-center justify-center gap-1.5 text-sm py-1.5 rounded bg-[#38bdf8]/10 text-[#38bdf8] hover:bg-[#38bdf8]/20 transition"
                    >
                      <Check size={14} /> Save
                    </button>
                    <button
                      onClick={() => setEditingId(null)}
                      className="flex-1 flex items-center justify-center gap-1.5 text-sm py-1.5 rounded bg-[#1a2a1a] text-[var(--text-secondary)] hover:bg-[#3a4a3a] transition"
                    >
                      <X size={14} /> Cancel
                    </button>
                  </div>
                </div>
              ) : (
                /* View Mode */
                <div>
                  <div className="flex items-center gap-2">
                    {getStatusIcon(mapping.status)}
                    <span className="text-sm text-white font-medium flex-1">{mapping.elementName}</span>
                    {mapping.source === 'ai' && (
                      <span className="text-xs bg-purple-500/20 text-purple-300 px-1.5 py-0.5 rounded">AI</span>
                    )}
                  </div>
                  <p className="text-xs text-[var(--text-tertiary)] mt-1 capitalize">Status: {mapping.status}</p>
                  {mapping.notes && (
                    <p className="text-xs text-[var(--text-secondary)] mt-0.5">{mapping.notes}</p>
                  )}
                  {mapping.confidence > 0 && (
                    <p className="text-xs text-[var(--text-disabled)] mt-0.5">
                      Confidence: {Math.round(mapping.confidence * 100)}%
                    </p>
                  )}
                  {mapping.suggestedNewElement && (
                    <span className="text-xs px-2 py-0.5 rounded bg-purple-500/20 text-purple-400 ml-1">
                      Suggested: {mapping.suggestedNewElement.name}
                    </span>
                  )}
                  <div className="flex gap-3 mt-2">
                    <button
                      onClick={() => {
                        setEditingId(mapping._id);
                        setEditStatus(mapping.status);
                        setEditNotes(mapping.notes);
                      }}
                      className="text-xs text-[var(--text-tertiary)] hover:text-white flex items-center gap-1 transition"
                    >
                      <Edit3 size={12} /> Edit
                    </button>
                    <button
                      onClick={() => handleDeleteMapping(mapping._id)}
                      className="text-xs text-[var(--text-tertiary)] hover:text-red-400 flex items-center gap-1 transition"
                    >
                      <Trash2 size={12} /> Remove
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}

          {/* Add Mapping Form */}
          {showAddForm ? (
            <div className="rounded border border-[#38bdf8]/30 bg-[var(--surface-base)] p-3 space-y-2">
              <select
                value={addElementId}
                onChange={(e) => setAddElementId(e.target.value)}
                className="w-full bg-[var(--surface-raised)] border border-[var(--border-subtle)] rounded px-3 py-1.5 text-sm text-white outline-none"
              >
                <option value="">Select element...</option>
                {unmappedElements.map((e) => (
                  <option key={e.id} value={e.id}>{e.name} [{e.type}]</option>
                ))}
              </select>
              <select
                value={addStatus}
                onChange={(e) => setAddStatus(e.target.value)}
                className="w-full bg-[var(--surface-raised)] border border-[var(--border-subtle)] rounded px-3 py-1.5 text-sm text-white outline-none"
              >
                <option value="compliant">Compliant</option>
                <option value="partial">Partial</option>
                <option value="gap">Gap</option>
                <option value="not_applicable">N/A</option>
              </select>
              <input
                type="text"
                value={addNotes}
                onChange={(e) => setAddNotes(e.target.value)}
                placeholder="Notes (optional)..."
                className="w-full bg-[var(--surface-raised)] border border-[var(--border-subtle)] rounded px-3 py-1.5 text-sm text-white placeholder:text-[var(--text-disabled)] outline-none"
              />
              <div className="flex gap-2">
                <button
                  onClick={handleAddMapping}
                  disabled={!addElementId}
                  className="flex-1 text-sm py-1.5 rounded bg-[#38bdf8] text-white hover:bg-[#0ea5e9] disabled:opacity-50 transition"
                >
                  Map Element
                </button>
                <button
                  onClick={() => setShowAddForm(false)}
                  className="flex-1 text-sm py-1.5 rounded bg-[#1a2a1a] text-[var(--text-secondary)] hover:bg-[#3a4a3a] transition"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setShowAddForm(true)}
              className="w-full flex items-center justify-center gap-1.5 text-sm py-2 rounded border border-dashed border-[var(--border-subtle)] text-[var(--text-tertiary)] hover:border-[#38bdf8] hover:text-[#38bdf8] transition"
            >
              <Plus size={14} />
              Map Element
            </button>
          )}
        </div>

        {error && (
          <div className="px-4 py-2 bg-red-500/10 border-t border-red-500/20 flex items-center gap-2">
            <AlertCircle size={14} className="text-red-400" />
            <span className="text-xs text-red-300">{error}</span>
          </div>
        )}
      </div>
    );
  }

  // ─── Matrix Overview ───
  const { cells, layers, sections } = matrix;

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-4 py-3 border-b border-[var(--border-subtle)] flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="text-[var(--text-tertiary)] hover:text-white transition"
          >
            <ArrowLeft size={18} />
          </button>
          <h3 className="text-base font-semibold text-white">Compliance Matrix</h3>
        </div>
        <button
          onClick={handleAISuggest}
          disabled={suggesting}
          className="flex items-center gap-1.5 text-sm py-1.5 px-3 rounded bg-purple-500/10 border border-purple-500/30 text-purple-300 hover:bg-purple-500/20 disabled:opacity-50 transition"
        >
          {suggesting ? (
            <Loader2 size={14} className="animate-spin" />
          ) : (
            <Sparkles size={14} />
          )}
          AI Suggestions
        </button>
      </div>

      {/* Matrix Grid */}
      <div className="flex-1 overflow-auto p-3">
        {sections.length === 0 || layers.length === 0 ? (
          <div className="text-center py-8">
            <p className="text-sm text-[var(--text-tertiary)]">
              {layers.length === 0
                ? 'No architecture elements found. Create elements first.'
                : 'No sections selected. Choose sections in the Standards tab.'}
            </p>
          </div>
        ) : (
          <div className="overflow-auto max-h-[calc(100vh-220px)]">
            <table className="border-collapse">
              <thead>
                <tr>
                  <th className="text-left text-xs text-[var(--text-tertiary)] font-medium p-2 border-b border-[var(--border-subtle)] sticky top-0 left-0 z-20 bg-[var(--surface-raised)] min-w-[100px]">
                    Section
                  </th>
                  {layers.map((layer) => (
                    <th
                      key={layer}
                      className="text-center text-xs text-[var(--text-tertiary)] font-medium p-2 border-b border-[var(--border-subtle)] capitalize sticky top-0 z-10 bg-[var(--surface-raised)] min-w-[100px] whitespace-nowrap"
                    >
                      {layer}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sections.map((section) => (
                  <tr key={section.id}>
                    <td className="text-xs text-[var(--text-secondary)] p-2 border-b border-[#111111] sticky left-0 z-10 bg-[var(--surface-base)] min-w-[100px] max-w-[160px] truncate" title={`§${section.number} ${section.title}`}>
                      §{section.number}
                    </td>
                    {layers.map((layer) => {
                      const cell = cells.find(
                        (c) => c.sectionId === section.id && c.layer === layer,
                      );
                      if (!cell) {
                        return (
                          <td key={layer} className="p-1.5 border-b border-[#111111]">
                            <div className="w-full h-8 bg-[var(--surface-raised)] rounded" />
                          </td>
                        );
                      }
                      return (
                        <td key={layer} className="p-1 border-b border-[#111111]">
                          <button
                            onClick={() =>
                              setDrilldown({
                                sectionId: section.id,
                                sectionNumber: section.number,
                                sectionTitle: section.title,
                                layer,
                              })
                            }
                            className={`relative w-full flex items-center justify-center gap-1 rounded py-1.5 px-2 border transition hover:opacity-80 ${getCellColor(cell)}`}
                          >
                            {getCellIcon(cell)}
                            {cell.total > 0 && (
                              <span className="text-xs">
                                {cell.compliant}/{cell.total}
                              </span>
                            )}
                            {(!cell || cell.total === 0) && (
                              <span className="absolute inset-0 flex items-center justify-center text-xs text-red-400/60 font-mono">
                                GAP
                              </span>
                            )}
                          </button>
                        </td>
                      );
                    })}
                  </tr>
                ))}
                {/* Score Row */}
                <tr>
                  <td className="text-xs text-[var(--text-tertiary)] font-medium p-2 border-t border-[var(--border-subtle)] sticky left-0 z-10 bg-[var(--surface-base)]">
                    Score
                  </td>
                  {layers.map((layer) => {
                    const score = getLayerScore(cells, layer);
                    const color =
                      score < 0
                        ? 'text-[var(--text-disabled)]'
                        : score >= 70
                          ? 'text-emerald-400'
                          : score >= 40
                            ? 'text-yellow-400'
                            : 'text-red-400';
                    return (
                      <td key={layer} className="text-center p-2 border-t border-[var(--border-subtle)]">
                        <span className={`text-xs font-medium ${color}`}>
                          {score < 0 ? '—' : `${score}%`}
                        </span>
                      </td>
                    );
                  })}
                </tr>
              </tbody>
            </table>

            {/* Legend */}
            <div className="flex items-center gap-4 mt-4 px-1">
              <div className="flex items-center gap-1.5">
                <CheckCircle2 size={12} className="text-emerald-400" />
                <span className="text-xs text-[var(--text-tertiary)]">Compliant</span>
              </div>
              <div className="flex items-center gap-1.5">
                <AlertTriangle size={12} className="text-yellow-400" />
                <span className="text-xs text-[var(--text-tertiary)]">Partial</span>
              </div>
              <div className="flex items-center gap-1.5">
                <XCircle size={12} className="text-red-400" />
                <span className="text-xs text-[var(--text-tertiary)]">Gap</span>
              </div>
              <div className="flex items-center gap-1.5">
                <Minus size={12} className="text-[var(--text-disabled)]" />
                <span className="text-xs text-[var(--text-tertiary)]">Empty</span>
              </div>
            </div>
          </div>
        )}
      </div>

      {error && (
        <div className="px-4 py-2 bg-red-500/10 border-t border-red-500/20 flex items-center gap-2">
          <AlertCircle size={14} className="text-red-400" />
          <span className="text-xs text-red-300">{error}</span>
        </div>
      )}
    </div>
  );
}
