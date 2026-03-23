import { useState, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { X, Upload, FileSpreadsheet, AlertCircle, CheckCircle2, Layers, GitMerge, AlertTriangle } from 'lucide-react';
import { parseCSV, parseCSVSeparate } from '../../utils/csvParser';
import type { CSVParseResult } from '../../utils/csvParser';
import { useArchitectureStore } from '../../stores/architectureStore';
import { useWorkspaceStore } from '../../stores/workspaceStore';
import { architectureAPI, workspaceAPI } from '../../services/api';
import { findSharedElements } from '../../utils/workspaceMatcher';

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

type ImportMode = 'new_workspace' | 'merge';
type FileMode = 'combined' | 'separate';

export default function CSVImportDialog({ isOpen, onClose }: Props) {
  const { projectId } = useParams();
  const [fileMode, setFileMode] = useState<FileMode>('combined');
  const [file, setFile] = useState<File | null>(null);
  const [connectionsFile, setConnectionsFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<CSVParseResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [importMode, setImportMode] = useState<ImportMode>('new_workspace');
  const [mergeTargetId, setMergeTargetId] = useState<string>('');
  const [workspaceName, setWorkspaceName] = useState<string>('');
  const importElements = useArchitectureStore((s) => s.importElements);
  const elements = useArchitectureStore((s) => s.elements);
  const connections = useArchitectureStore((s) => s.connections);
  const workspaces = useWorkspaceStore((s) => s.workspaces);
  const addWorkspace = useWorkspaceStore((s) => s.addWorkspace);
  const getNextOffsetX = useWorkspaceStore((s) => s.getNextOffsetX);
  const getNextColor = useWorkspaceStore((s) => s.getNextColor);

  const parseFiles = useCallback(async (elemFile: File, connFile?: File) => {
    setError(null);
    setPreview(null);
    try {
      const elemText = await elemFile.text();
      let result: CSVParseResult;
      if (connFile) {
        const connText = await connFile.text();
        result = parseCSVSeparate(elemText, connText);
      } else {
        result = parseCSV(elemText);
      }
      setPreview(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to parse CSV');
    }
  }, []);

  const handleFileChange = useCallback(async (selectedFile: File) => {
    setFile(selectedFile);
    if (fileMode === 'combined') {
      await parseFiles(selectedFile);
    } else if (connectionsFile) {
      await parseFiles(selectedFile, connectionsFile);
    } else {
      // Parse elements-only for preview
      await parseFiles(selectedFile);
    }
  }, [fileMode, connectionsFile, parseFiles]);

  const handleConnectionsFileChange = useCallback(async (selectedFile: File) => {
    setConnectionsFile(selectedFile);
    if (file) {
      await parseFiles(file, selectedFile);
    }
  }, [file, parseFiles]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const droppedFile = e.dataTransfer.files[0];
    if (droppedFile && droppedFile.name.endsWith('.csv')) {
      handleFileChange(droppedFile);
    } else {
      setError('Please drop a .csv file');
    }
  }, [handleFileChange]);

  const handleImport = async () => {
    if (!preview || !projectId) return;
    try {
      const isNew = importMode === 'new_workspace';
      const offsetX = isNew ? getNextOffsetX() : (workspaces.find((ws) => ws.id === mergeTargetId)?.offsetX ?? 0);
      const color = isNew ? getNextColor() : '';
      const wsId = isNew ? `ws-${Date.now()}-${Math.random().toString(36).slice(2, 7)}` : mergeTargetId;
      const name = workspaceName || file?.name?.replace(/\.csv$/i, '') || 'CSV Import';

      // Offset positions
      const offsetElements = preview.elements.map((el) => ({
        ...el,
        workspaceId: wsId,
        position3D: { ...el.position3D, x: el.position3D.x + offsetX },
      }));

      if (isNew) {
        addWorkspace({ id: wsId, name, projectId, source: 'csv', color, offsetX, createdAt: new Date().toISOString() });
        await workspaceAPI.create(projectId, { name, source: 'csv', color, offsetX }).catch(() => {});
      }

      importElements(offsetElements, preview.connections, wsId);

      // Detect cross-workspace connections
      if (isNew) {
        const crossConnections = findSharedElements(offsetElements, elements, connections);
        if (crossConnections.length > 0) {
          const store = useArchitectureStore.getState();
          for (const conn of crossConnections) {
            store.addConnection(conn);
          }
        }
      }

      // Sync with server
      await architectureAPI.importCSV(projectId, {
        elements: offsetElements,
        connections: preview.connections,
      });

      onClose();
      toast.success(`CSV import complete: ${preview.elements.length} elements, ${preview.connections.length} connections`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Import failed');
      toast.error('Import failed');
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 animate-[fadeIn_150ms_ease-out]" role="dialog" aria-modal="true">
      <div className="w-full max-w-lg rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-raised)] shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[var(--border-subtle)] px-5 py-4">
          <div className="flex items-center gap-2">
            <FileSpreadsheet size={18} className="text-[#00ff41]" />
            <h2 className="text-sm font-semibold text-white">Import CSV</h2>
          </div>
          <button onClick={onClose} className="text-[var(--text-secondary)] hover:text-white">
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 space-y-4">
          {/* File mode tabs */}
          <div className="flex gap-2">
            <button
              onClick={() => setFileMode('combined')}
              className={`flex-1 rounded-md border px-3 py-1.5 text-xs transition ${
                fileMode === 'combined'
                  ? 'border-[#00ff41] bg-[#00ff41]/10 text-[#00ff41]'
                  : 'border-[var(--border-subtle)] text-[var(--text-secondary)] hover:border-[#3a4a3a]'
              }`}
            >
              Combined File
            </button>
            <button
              onClick={() => setFileMode('separate')}
              className={`flex-1 rounded-md border px-3 py-1.5 text-xs transition ${
                fileMode === 'separate'
                  ? 'border-[#00ff41] bg-[#00ff41]/10 text-[#00ff41]'
                  : 'border-[var(--border-subtle)] text-[var(--text-secondary)] hover:border-[#3a4a3a]'
              }`}
            >
              Separate Files
            </button>
          </div>

          {/* Drop zone — Elements file */}
          <div
            onDrop={handleDrop}
            onDragOver={(e) => e.preventDefault()}
            className="flex flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed border-[var(--border-subtle)] bg-[var(--surface-base)] p-6 hover:border-[#00ff41] transition cursor-pointer"
            onClick={() => document.getElementById('csv-file-input')?.click()}
          >
            <Upload size={28} className="text-[var(--text-tertiary)]" />
            <p className="text-sm text-[var(--text-secondary)]">
              {file ? file.name : fileMode === 'combined' ? 'Drop CSV file (elements + connections)' : 'Drop elements CSV file'}
            </p>
            <p className="text-[10px] text-[var(--text-tertiary)]">
              Header: name, type, layer, togafDomain, description, status, riskLevel, maturityLevel
            </p>
            <input
              id="csv-file-input"
              type="file"
              accept=".csv"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleFileChange(f);
              }}
            />
          </div>

          {/* Connections file (separate mode) */}
          {fileMode === 'separate' && (
            <div
              className="flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-[var(--border-subtle)] bg-[var(--surface-base)] p-4 hover:border-[#00ff41] transition cursor-pointer"
              onClick={() => document.getElementById('csv-conn-input')?.click()}
            >
              <p className="text-xs text-[var(--text-secondary)]">
                {connectionsFile ? connectionsFile.name : 'Drop connections CSV (optional)'}
              </p>
              <p className="text-[10px] text-[var(--text-tertiary)]">
                Header: sourceName, targetName, type, label
              </p>
              <input
                id="csv-conn-input"
                type="file"
                accept=".csv"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleConnectionsFileChange(f);
                }}
              />
            </div>
          )}

          {/* Preview */}
          {preview && (
            <div className="rounded-lg bg-green-500/10 border border-green-500/20 p-3 space-y-1">
              <div className="flex items-center gap-2">
                <CheckCircle2 size={16} className="text-green-400" />
                <span className="text-xs text-green-300">
                  {preview.elements.length} elements, {preview.connections.length} connections
                </span>
              </div>
              {/* Layer breakdown */}
              <div className="flex flex-wrap gap-1 mt-1">
                {Object.entries(
                  preview.elements.reduce<Record<string, number>>((acc, el) => {
                    acc[el.layer] = (acc[el.layer] || 0) + 1;
                    return acc;
                  }, {})
                ).map(([layer, count]) => (
                  <span key={layer} className="text-[10px] text-green-400/70 bg-green-500/10 px-1.5 py-0.5 rounded">
                    {layer}: {count}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Warnings */}
          {preview && preview.warnings.length > 0 && (
            <div className="rounded-lg bg-yellow-500/10 border border-yellow-500/20 p-3 max-h-24 overflow-y-auto">
              <div className="flex items-center gap-2 mb-1">
                <AlertTriangle size={14} className="text-yellow-400 shrink-0" />
                <span className="text-xs text-yellow-300 font-medium">{preview.warnings.length} warning(s)</span>
              </div>
              {preview.warnings.map((w, i) => (
                <p key={i} className="text-[10px] text-yellow-300/70">{w}</p>
              ))}
            </div>
          )}

          {/* Workspace selection */}
          {preview && (
            <div className="space-y-3">
              <label className="block text-xs font-medium text-[var(--text-secondary)]">Import Target</label>
              <div className="flex gap-2">
                <button
                  onClick={() => setImportMode('new_workspace')}
                  className={`flex-1 flex items-center gap-2 rounded-md border px-3 py-2 text-xs transition ${
                    importMode === 'new_workspace'
                      ? 'border-[#00ff41] bg-[#00ff41]/10 text-black'
                      : 'border-[var(--border-subtle)] text-[var(--text-secondary)] hover:border-[#3a4a3a]'
                  }`}
                >
                  <Layers size={14} />
                  New Workspace
                </button>
                <button
                  onClick={() => setImportMode('merge')}
                  disabled={workspaces.length === 0}
                  className={`flex-1 flex items-center gap-2 rounded-md border px-3 py-2 text-xs transition ${
                    importMode === 'merge'
                      ? 'border-[#00ff41] bg-[#00ff41]/10 text-black'
                      : 'border-[var(--border-subtle)] text-[var(--text-secondary)] hover:border-[#3a4a3a]'
                  } disabled:opacity-30`}
                >
                  <GitMerge size={14} />
                  Merge into Existing
                </button>
              </div>

              {importMode === 'new_workspace' && (
                <input
                  type="text"
                  value={workspaceName}
                  onChange={(e) => setWorkspaceName(e.target.value)}
                  placeholder={file?.name?.replace(/\.csv$/i, '') || 'Workspace name'}
                  className="w-full rounded-md border border-[var(--border-subtle)] bg-[var(--surface-base)] px-3 py-2 text-xs text-white placeholder:text-[var(--text-disabled)] outline-none focus:border-[#00ff41] transition"
                />
              )}

              {importMode === 'merge' && workspaces.length > 0 && (
                <select
                  value={mergeTargetId}
                  onChange={(e) => setMergeTargetId(e.target.value)}
                  className="w-full rounded-md border border-[var(--border-subtle)] bg-[var(--surface-base)] px-3 py-2 text-xs text-white outline-none focus:border-[#00ff41] transition"
                >
                  <option value="">-- Select workspace --</option>
                  {workspaces.map((ws) => (
                    <option key={ws.id} value={ws.id}>{ws.name}</option>
                  ))}
                </select>
              )}
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="flex items-center gap-2 rounded-lg bg-red-500/10 border border-red-500/20 p-3">
              <AlertCircle size={16} className="text-red-400" />
              <span className="text-xs text-red-300">{error}</span>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 border-t border-[var(--border-subtle)] px-5 py-4">
          <button
            onClick={onClose}
            className="rounded-md px-4 py-2 text-xs text-[var(--text-secondary)] hover:text-white transition"
          >
            Cancel
          </button>
          <button
            onClick={handleImport}
            disabled={!preview || preview.elements.length === 0}
            className="rounded-md bg-[#00ff41] px-4 py-2 text-xs font-medium text-black hover:bg-[#00cc33] disabled:opacity-50 transition"
          >
            Import {preview ? `(${preview.elements.length})` : ''}
          </button>
        </div>
      </div>
    </div>
  );
}
