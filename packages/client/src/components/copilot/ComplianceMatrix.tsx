import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import {
  ArrowLeft, Plus, Trash2, Loader2, AlertCircle, CheckCircle2,
  AlertTriangle, XCircle, Minus, Sparkles, Check, X, Edit3,
} from 'lucide-react';
import { standardsAPI } from '../../services/api';
import { architectureAPI } from '../../services/api';
import { useAuthStore } from '../../stores/authStore';

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
}

// ─── Helpers ───

function getCellColor(cell: MatrixCell) {
  if (cell.total === 0) return 'bg-[#1e293b] text-[#475569]';
  if (cell.gap > 0) return 'bg-red-500/10 text-red-400 border-red-500/20';
  if (cell.partial > 0) return 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20';
  return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20';
}

function getCellIcon(cell: MatrixCell) {
  if (cell.total === 0) return <Minus size={10} className="text-[#475569]" />;
  if (cell.gap > 0) return <XCircle size={10} className="text-red-400" />;
  if (cell.partial > 0) return <AlertTriangle size={10} className="text-yellow-400" />;
  return <CheckCircle2 size={10} className="text-emerald-400" />;
}

function getStatusIcon(status: string) {
  switch (status) {
    case 'compliant': return <CheckCircle2 size={10} className="text-emerald-400" />;
    case 'partial': return <AlertTriangle size={10} className="text-yellow-400" />;
    case 'gap': return <XCircle size={10} className="text-red-400" />;
    default: return <Minus size={10} className="text-[#475569]" />;
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

export default function ComplianceMatrix({ standardId, sectionIds, onBack }: ComplianceMatrixProps) {
  const { projectId } = useParams();
  const token = useAuthStore((s) => s.token);
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

      // Extract elements from architecture data
      const els = (elementsRes.data || []).map((e: Record<string, unknown>) => ({
        id: String(e.id || e._id || ''),
        name: String(e.name || ''),
        layer: String(e.layer || ''),
        type: String(e.type || ''),
      }));
      setElements(els);
    } catch {
      setError('Matrix konnte nicht geladen werden');
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
              // Suggestions saved, reload matrix
              await loadMatrix();
            }
          } catch {
            // Partial JSON, skip
          }
        }
      }
    } catch {
      setError('AI-Vorschläge konnten nicht generiert werden');
    } finally {
      setSuggesting(false);
    }
  };

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
    } catch {
      setError('Mapping konnte nicht erstellt werden');
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
    } catch {
      setError('Mapping konnte nicht aktualisiert werden');
    }
  };

  const handleDeleteMapping = async (mappingId: string) => {
    if (!projectId) return;
    try {
      await standardsAPI.deleteMapping(projectId, standardId, mappingId);
      await loadMatrix();
    } catch {
      setError('Mapping konnte nicht gelöscht werden');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 size={20} className="animate-spin text-[#38bdf8]" />
      </div>
    );
  }

  if (!matrix) {
    return (
      <div className="flex items-center justify-center h-full p-4">
        <p className="text-xs text-[#64748b]">Matrix konnte nicht geladen werden.</p>
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
        <div className="p-2 border-b border-[#334155]">
          <button
            onClick={() => setDrilldown(null)}
            className="flex items-center gap-1 text-[10px] text-[#38bdf8] hover:text-white mb-1 transition"
          >
            <ArrowLeft size={10} />
            Zurück zur Matrix
          </button>
          <p className="text-[11px] font-medium text-white">
            §{drilldown.sectionNumber} {drilldown.sectionTitle}
          </p>
          <p className="text-[9px] text-[#64748b]">
            × {drilldown.layer.charAt(0).toUpperCase() + drilldown.layer.slice(1)} Layer
          </p>
        </div>

        {/* Mappings List */}
        <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
          {drillMappings.length === 0 && !showAddForm && (
            <div className="text-center py-4">
              <XCircle size={20} className="text-[#475569] mx-auto mb-1" />
              <p className="text-[10px] text-[#64748b]">Keine Zuordnungen für diese Kombination.</p>
            </div>
          )}

          {drillMappings.map((mapping) => (
            <div
              key={mapping._id}
              className="rounded border border-[#334155] bg-[#0f172a] p-2"
            >
              {editingId === mapping._id ? (
                /* Edit Mode */
                <div className="space-y-1.5">
                  <div className="flex items-center gap-1.5">
                    {getStatusIcon(mapping.status)}
                    <span className="text-[11px] text-white font-medium">{mapping.elementName}</span>
                  </div>
                  <select
                    value={editStatus}
                    onChange={(e) => setEditStatus(e.target.value)}
                    className="w-full bg-[#1e293b] border border-[#334155] rounded px-2 py-1 text-[10px] text-white outline-none"
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
                    placeholder="Notiz..."
                    className="w-full bg-[#1e293b] border border-[#334155] rounded px-2 py-1 text-[10px] text-white placeholder:text-[#475569] outline-none"
                  />
                  <div className="flex gap-1">
                    <button
                      onClick={() => handleUpdateMapping(mapping._id)}
                      className="flex-1 flex items-center justify-center gap-1 text-[10px] py-1 rounded bg-[#38bdf8]/10 text-[#38bdf8] hover:bg-[#38bdf8]/20 transition"
                    >
                      <Check size={10} /> Speichern
                    </button>
                    <button
                      onClick={() => setEditingId(null)}
                      className="flex-1 flex items-center justify-center gap-1 text-[10px] py-1 rounded bg-[#334155] text-[#94a3b8] hover:bg-[#475569] transition"
                    >
                      <X size={10} /> Abbrechen
                    </button>
                  </div>
                </div>
              ) : (
                /* View Mode */
                <div>
                  <div className="flex items-center gap-1.5">
                    {getStatusIcon(mapping.status)}
                    <span className="text-[11px] text-white font-medium flex-1">{mapping.elementName}</span>
                    {mapping.source === 'ai' && (
                      <span className="text-[8px] bg-purple-500/20 text-purple-300 px-1 rounded">AI</span>
                    )}
                  </div>
                  <p className="text-[9px] text-[#64748b] mt-0.5 capitalize">Status: {mapping.status}</p>
                  {mapping.notes && (
                    <p className="text-[9px] text-[#94a3b8] mt-0.5">{mapping.notes}</p>
                  )}
                  {mapping.confidence > 0 && (
                    <p className="text-[9px] text-[#475569] mt-0.5">
                      Confidence: {Math.round(mapping.confidence * 100)}%
                    </p>
                  )}
                  <div className="flex gap-1 mt-1.5">
                    <button
                      onClick={() => {
                        setEditingId(mapping._id);
                        setEditStatus(mapping.status);
                        setEditNotes(mapping.notes);
                      }}
                      className="text-[9px] text-[#64748b] hover:text-white flex items-center gap-0.5 transition"
                    >
                      <Edit3 size={8} /> Bearbeiten
                    </button>
                    <button
                      onClick={() => handleDeleteMapping(mapping._id)}
                      className="text-[9px] text-[#64748b] hover:text-red-400 flex items-center gap-0.5 transition"
                    >
                      <Trash2 size={8} /> Entfernen
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}

          {/* Add Mapping Form */}
          {showAddForm ? (
            <div className="rounded border border-[#38bdf8]/30 bg-[#0f172a] p-2 space-y-1.5">
              <select
                value={addElementId}
                onChange={(e) => setAddElementId(e.target.value)}
                className="w-full bg-[#1e293b] border border-[#334155] rounded px-2 py-1 text-[10px] text-white outline-none"
              >
                <option value="">Element wählen...</option>
                {unmappedElements.map((e) => (
                  <option key={e.id} value={e.id}>{e.name} [{e.type}]</option>
                ))}
              </select>
              <select
                value={addStatus}
                onChange={(e) => setAddStatus(e.target.value)}
                className="w-full bg-[#1e293b] border border-[#334155] rounded px-2 py-1 text-[10px] text-white outline-none"
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
                placeholder="Notiz (optional)..."
                className="w-full bg-[#1e293b] border border-[#334155] rounded px-2 py-1 text-[10px] text-white placeholder:text-[#475569] outline-none"
              />
              <div className="flex gap-1">
                <button
                  onClick={handleAddMapping}
                  disabled={!addElementId}
                  className="flex-1 text-[10px] py-1 rounded bg-[#38bdf8] text-white hover:bg-[#0ea5e9] disabled:opacity-50 transition"
                >
                  Zuordnen
                </button>
                <button
                  onClick={() => setShowAddForm(false)}
                  className="flex-1 text-[10px] py-1 rounded bg-[#334155] text-[#94a3b8] hover:bg-[#475569] transition"
                >
                  Abbrechen
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setShowAddForm(true)}
              className="w-full flex items-center justify-center gap-1 text-[10px] py-1.5 rounded border border-dashed border-[#334155] text-[#64748b] hover:border-[#38bdf8] hover:text-[#38bdf8] transition"
            >
              <Plus size={10} />
              Element zuordnen
            </button>
          )}
        </div>

        {error && (
          <div className="px-2 py-1.5 bg-red-500/10 border-t border-red-500/20 flex items-center gap-2">
            <AlertCircle size={10} className="text-red-400" />
            <span className="text-[9px] text-red-300">{error}</span>
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
      <div className="p-2 border-b border-[#334155] flex items-center justify-between">
        <div className="flex items-center gap-2">
          <button
            onClick={onBack}
            className="text-[#64748b] hover:text-white transition"
          >
            <ArrowLeft size={12} />
          </button>
          <h3 className="text-[11px] font-semibold text-white">Compliance Matrix</h3>
        </div>
        <button
          onClick={handleAISuggest}
          disabled={suggesting}
          className="flex items-center gap-1 text-[9px] py-1 px-2 rounded bg-purple-500/10 border border-purple-500/30 text-purple-300 hover:bg-purple-500/20 disabled:opacity-50 transition"
        >
          {suggesting ? (
            <Loader2 size={10} className="animate-spin" />
          ) : (
            <Sparkles size={10} />
          )}
          AI Vorschläge
        </button>
      </div>

      {/* Matrix Grid */}
      <div className="flex-1 overflow-auto p-2">
        {sections.length === 0 || layers.length === 0 ? (
          <div className="text-center py-6">
            <p className="text-xs text-[#64748b]">
              {layers.length === 0
                ? 'Keine Architektur-Elemente vorhanden. Erstelle zuerst Elemente.'
                : 'Keine Sections ausgewählt. Wähle Abschnitte im Standards-Tab.'}
            </p>
          </div>
        ) : (
          <div className="min-w-full">
            <table className="w-full border-collapse">
              <thead>
                <tr>
                  <th className="text-left text-[9px] text-[#64748b] font-normal p-1 border-b border-[#334155] sticky top-0 bg-[#1e293b]">
                    Section
                  </th>
                  {layers.map((layer) => (
                    <th
                      key={layer}
                      className="text-center text-[9px] text-[#64748b] font-normal p-1 border-b border-[#334155] capitalize sticky top-0 bg-[#1e293b]"
                    >
                      {layer}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sections.map((section) => (
                  <tr key={section.id}>
                    <td className="text-[9px] text-[#94a3b8] p-1 border-b border-[#1e293b] max-w-[100px] truncate" title={`§${section.number} ${section.title}`}>
                      §{section.number}
                    </td>
                    {layers.map((layer) => {
                      const cell = cells.find(
                        (c) => c.sectionId === section.id && c.layer === layer,
                      );
                      if (!cell) {
                        return (
                          <td key={layer} className="p-1 border-b border-[#1e293b]">
                            <div className="w-full h-6 bg-[#1e293b] rounded" />
                          </td>
                        );
                      }
                      return (
                        <td key={layer} className="p-0.5 border-b border-[#1e293b]">
                          <button
                            onClick={() =>
                              setDrilldown({
                                sectionId: section.id,
                                sectionNumber: section.number,
                                sectionTitle: section.title,
                                layer,
                              })
                            }
                            className={`w-full flex items-center justify-center gap-0.5 rounded py-1 px-1 border transition hover:opacity-80 ${getCellColor(cell)}`}
                          >
                            {getCellIcon(cell)}
                            {cell.total > 0 && (
                              <span className="text-[8px]">
                                {cell.compliant}/{cell.total}
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
                  <td className="text-[9px] text-[#64748b] font-medium p-1 border-t border-[#334155]">
                    Score
                  </td>
                  {layers.map((layer) => {
                    const score = getLayerScore(cells, layer);
                    const color =
                      score < 0
                        ? 'text-[#475569]'
                        : score >= 70
                          ? 'text-emerald-400'
                          : score >= 40
                            ? 'text-yellow-400'
                            : 'text-red-400';
                    return (
                      <td key={layer} className="text-center p-1 border-t border-[#334155]">
                        <span className={`text-[9px] font-medium ${color}`}>
                          {score < 0 ? '—' : `${score}%`}
                        </span>
                      </td>
                    );
                  })}
                </tr>
              </tbody>
            </table>

            {/* Legend */}
            <div className="flex items-center gap-3 mt-3 px-1">
              <div className="flex items-center gap-1">
                <CheckCircle2 size={8} className="text-emerald-400" />
                <span className="text-[8px] text-[#64748b]">Compliant</span>
              </div>
              <div className="flex items-center gap-1">
                <AlertTriangle size={8} className="text-yellow-400" />
                <span className="text-[8px] text-[#64748b]">Partial</span>
              </div>
              <div className="flex items-center gap-1">
                <XCircle size={8} className="text-red-400" />
                <span className="text-[8px] text-[#64748b]">Gap</span>
              </div>
              <div className="flex items-center gap-1">
                <Minus size={8} className="text-[#475569]" />
                <span className="text-[8px] text-[#64748b]">Leer</span>
              </div>
            </div>
          </div>
        )}
      </div>

      {error && (
        <div className="px-2 py-1.5 bg-red-500/10 border-t border-red-500/20 flex items-center gap-2">
          <AlertCircle size={10} className="text-red-400" />
          <span className="text-[9px] text-red-300">{error}</span>
        </div>
      )}
    </div>
  );
}
