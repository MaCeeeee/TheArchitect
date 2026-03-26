import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import {
  Upload, FileText, Trash2, ChevronDown, ChevronRight,
  CheckSquare, Square, Loader2, AlertCircle, Search, Info,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { standardsAPI } from '../../services/api';

// ─── Types ───

interface StandardSection {
  id: string;
  number: string;
  title: string;
  content?: string;
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
  selectedStandardId: externalSelectedStd,
  selectedSectionIds: externalSelectedSecs = [],
  onSelectionChange,
}: StandardsManagerProps) {
  const { projectId } = useParams();
  const [standards, setStandards] = useState<Standard[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [showUpload, setShowUpload] = useState(false);
  const [expandedStandard, setExpandedStandard] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expandedSection, setExpandedSection] = useState<string | null>(null);

  // Internal selection state (used when parent doesn't manage it)
  const [internalSelectedStd, setInternalSelectedStd] = useState<string | undefined>();
  const [internalSelectedSecs, setInternalSelectedSecs] = useState<string[]>([]);

  const isControlled = !!onSelectionChange;
  const selectedStandardId = isControlled ? externalSelectedStd : internalSelectedStd;
  const selectedSectionIds = isControlled ? externalSelectedSecs : internalSelectedSecs;

  const handleSelectionChange = (stdId: string | undefined, secIds: string[]) => {
    if (isControlled) {
      onSelectionChange!(stdId, secIds);
    } else {
      setInternalSelectedStd(stdId);
      setInternalSelectedSecs(secIds);
    }
  };

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
      setError('Failed to load standards');
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
    setExpandedSection(null);

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

      const res = await standardsAPI.upload(projectId, formData);
      const uploaded = res.data;

      // Reset form
      setUploadName('');
      setUploadVersion('');
      setUploadType('iso');
      setUploadFile(null);
      setShowUpload(false);

      await loadStandards();

      // Warn if PDF was poorly parsed
      const sectionCount = uploaded?.sectionsCount ?? uploaded?.sections?.length ?? 0;
      if (sectionCount < 5) {
        toast(
          `Only ${sectionCount} section${sectionCount !== 1 ? 's' : ''} detected. The PDF may not have been parsed correctly — consider re-uploading a cleaner version.`,
          { icon: '⚠️', duration: 8000 },
        );
      }
    } catch {
      setError('Upload failed. Please try again.');
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
        handleSelectionChange(undefined, []);
      }
    } catch {
      setError('Delete failed');
    }
  };

  const toggleSection = (standardId: string, sectionId: string) => {
    if (selectedStandardId !== standardId) {
      handleSelectionChange(standardId, [sectionId]);
      return;
    }
    const newIds = selectedSectionIds.includes(sectionId)
      ? selectedSectionIds.filter((id) => id !== sectionId)
      : [...selectedSectionIds, sectionId];
    handleSelectionChange(standardId, newIds);
  };

  const selectAllSections = (standardId: string) => {
    const std = standards.find((s) => s._id === standardId);
    if (!std?.sections) return;
    const allIds = std.sections.map((s) => s.id);
    const allSelected = selectedStandardId === standardId && selectedSectionIds.length === allIds.length;
    handleSelectionChange(standardId, allSelected ? [] : allIds);
  };

  if (!projectId) {
    return (
      <div className="flex items-center justify-center h-full p-6">
        <p className="text-sm text-[var(--text-tertiary)]">Open a project first.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="pb-4 border-b border-[var(--border-subtle)] flex items-center justify-between">
        <h3 className="text-sm font-semibold text-white flex items-center gap-2">
          <FileText size={16} className="text-[#38bdf8]" />
          Standards
        </h3>
        <button
          onClick={() => setShowUpload(!showUpload)}
          className="text-xs text-[#38bdf8] hover:text-white flex items-center gap-1.5 transition"
        >
          <Upload size={14} />
          Upload
        </button>
      </div>

      <div className="flex-1 overflow-y-auto mt-4">
        {/* Upload Form */}
        {showUpload && (
          <form onSubmit={handleUpload} className="p-4 border border-[var(--border-subtle)] rounded-lg bg-[var(--surface-base)] space-y-3 mb-4">
            <div>
              <label className="text-xs text-[var(--text-secondary)] block mb-1">Name *</label>
              <input
                type="text"
                value={uploadName}
                onChange={(e) => setUploadName(e.target.value)}
                placeholder="e.g. ISO 26262"
                className="w-full bg-[var(--surface-raised)] border border-[var(--border-subtle)] rounded-md px-3 py-2 text-sm text-white placeholder:text-[var(--text-disabled)] outline-none focus:border-[#38bdf8]"
                required
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-[var(--text-secondary)] block mb-1">Version</label>
                <input
                  type="text"
                  value={uploadVersion}
                  onChange={(e) => setUploadVersion(e.target.value)}
                  placeholder="e.g. 2018"
                  className="w-full bg-[var(--surface-raised)] border border-[var(--border-subtle)] rounded-md px-3 py-2 text-sm text-white placeholder:text-[var(--text-disabled)] outline-none focus:border-[#38bdf8]"
                />
              </div>
              <div>
                <label className="text-xs text-[var(--text-secondary)] block mb-1">Type</label>
                <select
                  value={uploadType}
                  onChange={(e) => setUploadType(e.target.value)}
                  className="w-full bg-[var(--surface-raised)] border border-[var(--border-subtle)] rounded-md px-3 py-2 text-sm text-white outline-none focus:border-[#38bdf8]"
                >
                  <option value="iso">ISO</option>
                  <option value="aspice">ASPICE</option>
                  <option value="togaf">TOGAF</option>
                  <option value="custom">Custom</option>
                </select>
              </div>
            </div>
            <div>
              <label className="text-xs text-[var(--text-secondary)] block mb-1">PDF File *</label>
              <input
                type="file"
                accept=".pdf"
                onChange={(e) => setUploadFile(e.target.files?.[0] || null)}
                className="w-full text-xs text-[var(--text-secondary)] file:mr-3 file:py-1.5 file:px-3 file:rounded-md file:border-0 file:text-xs file:bg-[var(--surface-raised)] file:text-white hover:file:bg-[var(--surface-overlay)]"
                required
              />
            </div>
            <button
              type="submit"
              disabled={uploading || !uploadName.trim() || !uploadFile}
              className="w-full flex items-center justify-center gap-2 bg-[#38bdf8] hover:bg-[#0ea5e9] text-white text-sm py-2 rounded-md disabled:opacity-50 transition"
            >
              {uploading ? (
                <>
                  <Loader2 size={14} className="animate-spin" />
                  Processing PDF...
                </>
              ) : (
                <>
                  <Upload size={14} />
                  Upload
                </>
              )}
            </button>
          </form>
        )}

        {/* Error */}
        {error && (
          <div className="p-3 mb-4 bg-red-500/10 border border-red-500/20 rounded-lg flex items-center gap-2">
            <AlertCircle size={14} className="text-red-400 shrink-0" />
            <span className="text-xs text-red-300 flex-1">{error}</span>
            <button onClick={() => setError(null)} className="text-red-300 hover:text-white">
              <Trash2 size={12} />
            </button>
          </div>
        )}

        {/* Loading */}
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 size={20} className="animate-spin text-[#38bdf8]" />
          </div>
        ) : standards.length === 0 ? (
          <div className="text-center py-12 px-4">
            <FileText size={32} className="text-[var(--text-disabled)] mx-auto mb-3" />
            <p className="text-sm text-[var(--text-tertiary)]">No standards uploaded yet.</p>
            <p className="text-xs text-[var(--text-disabled)] mt-1">
              Upload ISO standards or ASPICE PAM as PDF to map them against your architecture.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {standards.map((std) => {
              const isExpanded = expandedStandard === std._id;
              const isSelected = selectedStandardId === std._id;
              const sections = std.sections || [];
              const selectedCount = isSelected ? selectedSectionIds.length : 0;

              return (
                <div
                  key={std._id}
                  className={`rounded-lg border ${
                    isSelected ? 'border-[#38bdf8]/50 bg-[#0c4a6e]/20' : 'border-[var(--border-subtle)] bg-[var(--surface-base)]'
                  }`}
                >
                  {/* Standard Header */}
                  <div
                    className="flex items-center gap-3 p-3 cursor-pointer hover:bg-[var(--surface-raised)] rounded-t-lg transition"
                    onClick={() => toggleExpand(std._id)}
                  >
                    {isExpanded ? (
                      <ChevronDown size={16} className="text-[var(--text-tertiary)] shrink-0" />
                    ) : (
                      <ChevronRight size={16} className="text-[var(--text-tertiary)] shrink-0" />
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-white truncate">{std.name}</span>
                        {std.version && (
                          <span className="text-xs text-[var(--text-tertiary)] bg-[var(--surface-raised)] px-1.5 py-0.5 rounded">v{std.version}</span>
                        )}
                      </div>
                      <div className="flex items-center gap-3 mt-0.5">
                        <span className="text-xs text-[var(--text-disabled)]">{std.sectionsCount ?? sections.length} S.</span>
                        <span className="text-xs text-[var(--text-disabled)]">{std.type.toUpperCase()}</span>
                        {selectedCount > 0 && (
                          <span className="text-xs text-[#38bdf8] font-medium">{selectedCount} selected</span>
                        )}
                      </div>
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDelete(std._id);
                      }}
                      className="text-[var(--text-disabled)] hover:text-red-400 transition p-1"
                      title="Delete standard"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>

                  {/* Expanded: Sections + Actions */}
                  {isExpanded && (
                    <div className="border-t border-[var(--border-subtle)]">
                      {/* Section Selection */}
                      {sections.length > 0 ? (
                        <div className="p-3 space-y-0.5 max-h-[400px] overflow-y-auto">
                          <button
                            onClick={() => selectAllSections(std._id)}
                            className="text-xs text-[#38bdf8] hover:text-white mb-2 transition"
                          >
                            {isSelected && selectedSectionIds.length === sections.length
                              ? 'Deselect all'
                              : 'Select all'}
                          </button>
                          {sections.map((section) => {
                            const checked = isSelected && selectedSectionIds.includes(section.id);
                            const isContentExpanded = expandedSection === section.id;
                            const hasContent = section.content && section.content.trim().length > 0;
                            const preview = section.content?.slice(0, 200) ?? '';

                            return (
                              <div key={section.id}>
                                <div
                                  className="flex items-center gap-2 w-full text-left py-1.5 hover:bg-[var(--surface-raised)] rounded px-2 transition"
                                  style={{ paddingLeft: `${8 + section.level * 12}px` }}
                                >
                                  <button
                                    onClick={() => toggleSection(std._id, section.id)}
                                    className="shrink-0"
                                  >
                                    {checked ? (
                                      <CheckSquare size={14} className="text-[#38bdf8]" />
                                    ) : (
                                      <Square size={14} className="text-[var(--text-tertiary)]" />
                                    )}
                                  </button>
                                  <span
                                    className={`text-xs flex-1 ${checked ? 'text-white font-medium' : 'text-[var(--text-secondary)]'}`}
                                  >
                                    §{section.number} {section.title}
                                  </span>
                                  {hasContent && (
                                    <button
                                      onClick={() => setExpandedSection(isContentExpanded ? null : section.id)}
                                      className="shrink-0 text-[var(--text-tertiary)] hover:text-[#38bdf8] transition p-0.5"
                                      title="Show section content"
                                    >
                                      <Info size={12} />
                                    </button>
                                  )}
                                </div>
                                {/* Content Preview */}
                                {isContentExpanded && hasContent && (
                                  <div
                                    className="mx-2 mb-1 p-2.5 rounded bg-[var(--surface-overlay)] border border-[var(--border-subtle)] text-xs text-[var(--text-secondary)] leading-relaxed max-h-[150px] overflow-y-auto"
                                    style={{ marginLeft: `${16 + section.level * 12}px` }}
                                  >
                                    {preview}
                                    {(section.content?.length ?? 0) > 200 && (
                                      <span className="text-[var(--text-disabled)]">...</span>
                                    )}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <div className="p-4 flex items-center justify-center">
                          <Loader2 size={16} className="animate-spin text-[#38bdf8]" />
                        </div>
                      )}

                      {/* Actions */}
                      <div className="p-3 border-t border-[var(--border-subtle)] flex gap-2">
                        <button
                          onClick={() => onMatrixView(std._id, isSelected ? selectedSectionIds : [])}
                          className="flex-1 flex items-center justify-center gap-1.5 text-xs py-2 rounded-md bg-[var(--surface-raised)] border border-[var(--border-subtle)] text-[var(--text-secondary)] hover:border-[#38bdf8] hover:text-white transition"
                        >
                          <Search size={14} />
                          Matrix
                        </button>
                        <button
                          onClick={() => onAnalyze(std._id, isSelected ? selectedSectionIds : [], std.name)}
                          className="flex-1 flex items-center justify-center gap-1.5 text-xs py-2 rounded-md bg-[#38bdf8]/10 border border-[#38bdf8]/30 text-[#38bdf8] hover:bg-[#38bdf8]/20 transition"
                        >
                          <Search size={14} />
                          AI Match
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
