import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import {
  Upload, FileText, Trash2, ChevronDown, ChevronRight,
  CheckSquare, Square, Loader2, AlertCircle, Search,
} from 'lucide-react';
import { standardsAPI } from '../../services/api';

// ─── Types ───

interface StandardSection {
  id: string;
  number: string;
  title: string;
  level: number;
}

interface Standard {
  _id: string;
  name: string;
  version: string;
  type: string;
  pageCount: number;
  sections?: StandardSection[];
  sectionsCount?: number;
  createdAt: string;
}

interface StandardsManagerProps {
  onAnalyze: (standardId: string, sectionIds: string[], standardName: string) => void;
  onMatrixView: (standardId: string, sectionIds: string[]) => void;
  selectedStandardId?: string;
  selectedSectionIds?: string[];
  onSelectionChange?: (standardId: string | undefined, sectionIds: string[]) => void;
}

// ─── Component ───

export default function StandardsManager({
  onAnalyze,
  onMatrixView,
  selectedStandardId,
  selectedSectionIds = [],
  onSelectionChange,
}: StandardsManagerProps) {
  const { projectId } = useParams();
  const [standards, setStandards] = useState<Standard[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [showUpload, setShowUpload] = useState(false);
  const [expandedStandard, setExpandedStandard] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Upload form state
  const [uploadName, setUploadName] = useState('');
  const [uploadVersion, setUploadVersion] = useState('');
  const [uploadType, setUploadType] = useState<string>('iso');
  const [uploadFile, setUploadFile] = useState<File | null>(null);

  const loadStandards = useCallback(async () => {
    if (!projectId) return;
    try {
      setLoading(true);
      const { data } = await standardsAPI.list(projectId);
      setStandards(data);
    } catch {
      setError('Standards konnten nicht geladen werden');
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    loadStandards();
  }, [loadStandards]);

  // Load full standard with sections when expanded
  const toggleExpand = useCallback(async (standardId: string) => {
    if (expandedStandard === standardId) {
      setExpandedStandard(null);
      return;
    }
    setExpandedStandard(standardId);

    // Load sections if not already loaded
    const std = standards.find((s) => s._id === standardId);
    if (std && !std.sections) {
      try {
        const { data } = await standardsAPI.get(projectId!, standardId);
        setStandards((prev) =>
          prev.map((s) => (s._id === standardId ? { ...s, sections: data.sections } : s)),
        );
      } catch {
        // Sections load failed, keep going
      }
    }
  }, [expandedStandard, standards, projectId]);

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!projectId || !uploadFile || !uploadName.trim()) return;

    try {
      setUploading(true);
      setError(null);

      const formData = new FormData();
      formData.append('standard', uploadFile);
      formData.append('name', uploadName.trim());
      formData.append('version', uploadVersion.trim());
      formData.append('type', uploadType);

      await standardsAPI.upload(projectId, formData);

      // Reset form
      setUploadName('');
      setUploadVersion('');
      setUploadType('iso');
      setUploadFile(null);
      setShowUpload(false);

      await loadStandards();
    } catch {
      setError('Upload fehlgeschlagen. Bitte versuche es erneut.');
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (standardId: string) => {
    if (!projectId) return;
    try {
      await standardsAPI.delete(projectId, standardId);
      setStandards((prev) => prev.filter((s) => s._id !== standardId));
      if (selectedStandardId === standardId) {
        onSelectionChange?.(undefined, []);
      }
    } catch {
      setError('Löschen fehlgeschlagen');
    }
  };

  const toggleSection = (standardId: string, sectionId: string) => {
    if (selectedStandardId !== standardId) {
      onSelectionChange?.(standardId, [sectionId]);
      return;
    }
    const newIds = selectedSectionIds.includes(sectionId)
      ? selectedSectionIds.filter((id) => id !== sectionId)
      : [...selectedSectionIds, sectionId];
    onSelectionChange?.(standardId, newIds);
  };

  const selectAllSections = (standardId: string) => {
    const std = standards.find((s) => s._id === standardId);
    if (!std?.sections) return;
    const allIds = std.sections.map((s) => s.id);
    const allSelected = selectedStandardId === standardId && selectedSectionIds.length === allIds.length;
    onSelectionChange?.(standardId, allSelected ? [] : allIds);
  };

  if (!projectId) {
    return (
      <div className="flex items-center justify-center h-full p-6">
        <p className="text-xs text-[#4a5a4a]">Öffne zuerst ein Projekt.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="p-3 border-b border-[#1a2a1a] flex items-center justify-between">
        <h3 className="text-xs font-semibold text-white flex items-center gap-1.5">
          <FileText size={14} className="text-[#38bdf8]" />
          Standards
        </h3>
        <button
          onClick={() => setShowUpload(!showUpload)}
          className="text-[10px] text-[#38bdf8] hover:text-white flex items-center gap-1 transition"
        >
          <Upload size={10} />
          Hochladen
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {/* Upload Form */}
        {showUpload && (
          <form onSubmit={handleUpload} className="p-3 border-b border-[#1a2a1a] bg-[#0a0a0a] space-y-2">
            <div>
              <label className="text-[10px] text-[#4a5a4a] block mb-0.5">Name *</label>
              <input
                type="text"
                value={uploadName}
                onChange={(e) => setUploadName(e.target.value)}
                placeholder="z.B. ISO 26262"
                className="w-full bg-[#111111] border border-[#1a2a1a] rounded px-2 py-1 text-[11px] text-white placeholder:text-[#3a4a3a] outline-none focus:border-[#38bdf8]"
                required
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[10px] text-[#4a5a4a] block mb-0.5">Version</label>
                <input
                  type="text"
                  value={uploadVersion}
                  onChange={(e) => setUploadVersion(e.target.value)}
                  placeholder="z.B. 2018"
                  className="w-full bg-[#111111] border border-[#1a2a1a] rounded px-2 py-1 text-[11px] text-white placeholder:text-[#3a4a3a] outline-none focus:border-[#38bdf8]"
                />
              </div>
              <div>
                <label className="text-[10px] text-[#4a5a4a] block mb-0.5">Typ</label>
                <select
                  value={uploadType}
                  onChange={(e) => setUploadType(e.target.value)}
                  className="w-full bg-[#111111] border border-[#1a2a1a] rounded px-2 py-1 text-[11px] text-white outline-none focus:border-[#38bdf8]"
                >
                  <option value="iso">ISO</option>
                  <option value="aspice">ASPICE</option>
                  <option value="togaf">TOGAF</option>
                  <option value="custom">Custom</option>
                </select>
              </div>
            </div>
            <div>
              <label className="text-[10px] text-[#4a5a4a] block mb-0.5">PDF-Datei *</label>
              <input
                type="file"
                accept=".pdf"
                onChange={(e) => setUploadFile(e.target.files?.[0] || null)}
                className="w-full text-[10px] text-[#7a8a7a] file:mr-2 file:py-0.5 file:px-2 file:rounded file:border-0 file:text-[10px] file:bg-[#1a2a1a] file:text-white hover:file:bg-[#3a4a3a]"
                required
              />
            </div>
            <button
              type="submit"
              disabled={uploading || !uploadName.trim() || !uploadFile}
              className="w-full flex items-center justify-center gap-1.5 bg-[#38bdf8] hover:bg-[#0ea5e9] text-white text-[11px] py-1.5 rounded disabled:opacity-50 transition"
            >
              {uploading ? (
                <>
                  <Loader2 size={12} className="animate-spin" />
                  Verarbeite PDF...
                </>
              ) : (
                <>
                  <Upload size={12} />
                  Hochladen
                </>
              )}
            </button>
          </form>
        )}

        {/* Error */}
        {error && (
          <div className="mx-3 mt-2 p-2 bg-red-500/10 border border-red-500/20 rounded flex items-center gap-2">
            <AlertCircle size={10} className="text-red-400 shrink-0" />
            <span className="text-[10px] text-red-300 flex-1">{error}</span>
            <button onClick={() => setError(null)} className="text-red-300 hover:text-white">
              <Trash2 size={10} />
            </button>
          </div>
        )}

        {/* Loading */}
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 size={16} className="animate-spin text-[#38bdf8]" />
          </div>
        ) : standards.length === 0 ? (
          <div className="text-center py-8 px-4">
            <FileText size={24} className="text-[#3a4a3a] mx-auto mb-2" />
            <p className="text-xs text-[#4a5a4a]">Noch keine Standards hochgeladen.</p>
            <p className="text-[10px] text-[#3a4a3a] mt-1">
              Lade ISO-Standards oder ASPICE PAM als PDF hoch, um sie mit deiner Architektur abzugleichen.
            </p>
          </div>
        ) : (
          <div className="p-2 space-y-1.5">
            {standards.map((std) => {
              const isExpanded = expandedStandard === std._id;
              const isSelected = selectedStandardId === std._id;
              const sections = std.sections || [];
              const selectedCount = isSelected ? selectedSectionIds.length : 0;

              return (
                <div
                  key={std._id}
                  className={`rounded-lg border ${
                    isSelected ? 'border-[#38bdf8]/50 bg-[#0c4a6e]/20' : 'border-[#1a2a1a] bg-[#0a0a0a]'
                  }`}
                >
                  {/* Standard Header */}
                  <div
                    className="flex items-center gap-2 p-2 cursor-pointer hover:bg-[#111111] rounded-t-lg transition"
                    onClick={() => toggleExpand(std._id)}
                  >
                    {isExpanded ? (
                      <ChevronDown size={12} className="text-[#4a5a4a] shrink-0" />
                    ) : (
                      <ChevronRight size={12} className="text-[#4a5a4a] shrink-0" />
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="text-[11px] font-medium text-white truncate">{std.name}</span>
                        {std.version && (
                          <span className="text-[9px] text-[#4a5a4a] bg-[#111111] px-1 rounded">v{std.version}</span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-[9px] text-[#3a4a3a]">{std.pageCount} S.</span>
                        <span className="text-[9px] text-[#3a4a3a]">{std.type.toUpperCase()}</span>
                        {selectedCount > 0 && (
                          <span className="text-[9px] text-[#38bdf8]">{selectedCount} ausgewählt</span>
                        )}
                      </div>
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDelete(std._id);
                      }}
                      className="text-[#3a4a3a] hover:text-red-400 transition p-0.5"
                      title="Standard löschen"
                    >
                      <Trash2 size={10} />
                    </button>
                  </div>

                  {/* Expanded: Sections + Actions */}
                  {isExpanded && (
                    <div className="border-t border-[#1a2a1a]">
                      {/* Section Selection */}
                      {sections.length > 0 ? (
                        <div className="p-2 space-y-0.5 max-h-[200px] overflow-y-auto">
                          <button
                            onClick={() => selectAllSections(std._id)}
                            className="text-[9px] text-[#38bdf8] hover:text-white mb-1 transition"
                          >
                            {isSelected && selectedSectionIds.length === sections.length
                              ? 'Alle abwählen'
                              : 'Alle auswählen'}
                          </button>
                          {sections.map((section) => {
                            const checked = isSelected && selectedSectionIds.includes(section.id);
                            return (
                              <button
                                key={section.id}
                                onClick={() => toggleSection(std._id, section.id)}
                                className="flex items-center gap-1.5 w-full text-left py-0.5 hover:bg-[#111111] rounded px-1 transition"
                                style={{ paddingLeft: `${4 + section.level * 8}px` }}
                              >
                                {checked ? (
                                  <CheckSquare size={10} className="text-[#38bdf8] shrink-0" />
                                ) : (
                                  <Square size={10} className="text-[#3a4a3a] shrink-0" />
                                )}
                                <span className={`text-[10px] truncate ${checked ? 'text-white' : 'text-[#7a8a7a]'}`}>
                                  §{section.number} {section.title}
                                </span>
                              </button>
                            );
                          })}
                        </div>
                      ) : (
                        <div className="p-2 flex items-center justify-center">
                          <Loader2 size={12} className="animate-spin text-[#38bdf8]" />
                        </div>
                      )}

                      {/* Actions */}
                      <div className="p-2 border-t border-[#1a2a1a] flex gap-1.5">
                        <button
                          onClick={() => onMatrixView(std._id, isSelected ? selectedSectionIds : [])}
                          className="flex-1 flex items-center justify-center gap-1 text-[10px] py-1.5 rounded bg-[#111111] border border-[#1a2a1a] text-[#7a8a7a] hover:border-[#38bdf8] hover:text-white transition"
                        >
                          <Search size={10} />
                          Matrix
                        </button>
                        <button
                          onClick={() => onAnalyze(std._id, isSelected ? selectedSectionIds : [], std.name)}
                          className="flex-1 flex items-center justify-center gap-1 text-[10px] py-1.5 rounded bg-[#38bdf8]/10 border border-[#38bdf8]/30 text-[#38bdf8] hover:bg-[#38bdf8]/20 transition"
                        >
                          <Search size={10} />
                          AI Abgleich
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
