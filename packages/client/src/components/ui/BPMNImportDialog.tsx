import { useState, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { X, Upload, FileCode, AlertCircle, CheckCircle2, Layers, GitMerge } from 'lucide-react';
import { parseBPMN } from '../../utils/bpmnParser';
import { useArchitectureStore } from '../../stores/architectureStore';
import { useWorkspaceStore } from '../../stores/workspaceStore';
import { architectureAPI, workspaceAPI } from '../../services/api';
import { findSharedElements } from '../../utils/workspaceMatcher';

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

type ImportMode = 'new_workspace' | 'merge';

export default function BPMNImportDialog({ isOpen, onClose }: Props) {
  const { projectId } = useParams();
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<{ elements: number; connections: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [xmlContent, setXmlContent] = useState<string>('');
  const [importMode, setImportMode] = useState<ImportMode>('new_workspace');
  const [mergeTargetId, setMergeTargetId] = useState<string>('');
  const [workspaceName, setWorkspaceName] = useState<string>('');
  const [duplicateCount, setDuplicateCount] = useState(0);
  const setElements = useArchitectureStore((s) => s.setElements);
  const setConnections = useArchitectureStore((s) => s.setConnections);
  const importElements = useArchitectureStore((s) => s.importElements);
  const elements = useArchitectureStore((s) => s.elements);
  const connections = useArchitectureStore((s) => s.connections);
  const workspaces = useWorkspaceStore((s) => s.workspaces);
  const addWorkspace = useWorkspaceStore((s) => s.addWorkspace);
  const getNextOffsetX = useWorkspaceStore((s) => s.getNextOffsetX);
  const getNextColor = useWorkspaceStore((s) => s.getNextColor);

  const handleFileChange = useCallback(async (selectedFile: File) => {
    setFile(selectedFile);
    setError(null);
    setPreview(null);

    try {
      const text = await selectedFile.text();
      setXmlContent(text);
      const result = parseBPMN(text);
      setPreview({ elements: result.elements.length, connections: result.connections.length });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to parse BPMN file');
    }
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const droppedFile = e.dataTransfer.files[0];
    if (droppedFile && (droppedFile.name.endsWith('.bpmn') || droppedFile.name.endsWith('.xml'))) {
      handleFileChange(droppedFile);
    } else {
      setError('Please drop a .bpmn or .xml file');
    }
  }, [handleFileChange]);

  const checkDuplicates = useCallback(() => {
    if (!xmlContent) return;
    try {
      const result = parseBPMN(xmlContent);
      const targetWsId = importMode === 'merge' ? mergeTargetId : null;
      const targetElements = targetWsId
        ? elements.filter((el) => el.workspaceId === targetWsId)
        : elements;
      const existingKeys = new Set(
        targetElements.map((el) => `${el.name.trim().toLowerCase()}::${el.type}`)
      );
      const dupes = result.elements.filter((el) =>
        existingKeys.has(`${el.name.trim().toLowerCase()}::${el.type}`)
      );
      setDuplicateCount(dupes.length);
    } catch { setDuplicateCount(0); }
  }, [xmlContent, importMode, mergeTargetId, elements]);

  const handleImport = async () => {
    if (!xmlContent || !projectId) return;
    try {
      const result = parseBPMN(xmlContent);
      const isNew = importMode === 'new_workspace';

      // Skip duplicate elements when merging
      const targetWsId = isNew ? null : mergeTargetId;
      let filteredElements = result.elements;
      let filteredConnections = result.connections;
      if (targetWsId) {
        const targetElements = elements.filter((el) => el.workspaceId === targetWsId);
        const existingKeys = new Set(
          targetElements.map((el) => `${el.name.trim().toLowerCase()}::${el.type}`)
        );
        const removedIds = new Set<string>();
        filteredElements = result.elements.filter((el) => {
          const key = `${el.name.trim().toLowerCase()}::${el.type}`;
          if (existingKeys.has(key)) { removedIds.add(el.id); return false; }
          return true;
        });
        filteredConnections = result.connections.filter(
          (c) => !removedIds.has(c.sourceId) && !removedIds.has(c.targetId)
        );
      }

      const offsetX = isNew ? getNextOffsetX() : (workspaces.find((ws) => ws.id === mergeTargetId)?.offsetX ?? 0);
      const color = isNew ? getNextColor() : '';
      const wsId = isNew ? `ws-${Date.now()}-${Math.random().toString(36).slice(2, 7)}` : mergeTargetId;
      const name = workspaceName || file?.name?.replace(/\.(bpmn|xml)$/i, '') || 'BPMN Import';

      // Offset element positions by workspace X
      const offsetElements = filteredElements.map((el) => ({
        ...el,
        workspaceId: wsId,
        position3D: { ...el.position3D, x: el.position3D.x + offsetX },
      }));

      if (isNew) {
        // Create workspace locally
        addWorkspace({ id: wsId, name, projectId, source: 'bpmn', color, offsetX, createdAt: new Date().toISOString() });

        // Persist workspace to server
        await workspaceAPI.create(projectId, { name, source: 'bpmn', color, offsetX }).catch(() => {});
      }

      // Import elements into local store
      importElements(offsetElements, filteredConnections, wsId);

      // Detect shared elements across workspaces
      if (isNew) {
        const crossConnections = findSharedElements(offsetElements, elements, connections);
        if (crossConnections.length > 0) {
          const store = useArchitectureStore.getState();
          for (const conn of crossConnections) {
            store.addConnection(conn);
          }
        }
      }

      // Sync elements with server (send offset positions + workspaceId)
      await architectureAPI.importBPMN(projectId, {
        elements: offsetElements,
        connections: filteredConnections,
      });

      onClose();
      toast.success('BPMN import complete');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Import failed');
      toast.error('Import failed');
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 animate-[fadeIn_150ms_ease-out]" role="dialog" aria-modal="true">
      <div className="w-full max-w-lg rounded-xl border border-[#1a2a1a] bg-[#111111] shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[#1a2a1a] px-5 py-4">
          <div className="flex items-center gap-2">
            <FileCode size={18} className="text-[#00ff41]" />
            <h2 className="text-sm font-semibold text-white">Import BPMN 2.0</h2>
          </div>
          <button onClick={onClose} className="text-[#7a8a7a] hover:text-white">
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 space-y-4">
          {/* Drop zone */}
          <div
            onDrop={handleDrop}
            onDragOver={(e) => e.preventDefault()}
            className="flex flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed border-[#1a2a1a] bg-[#0a0a0a] p-8 hover:border-[#00ff41] transition cursor-pointer"
            onClick={() => document.getElementById('bpmn-file-input')?.click()}
          >
            <Upload size={32} className="text-[#4a5a4a]" />
            <p className="text-sm text-[#7a8a7a]">
              {file ? file.name : 'Drop BPMN file here or click to browse'}
            </p>
            <p className="text-xs text-[#4a5a4a]">Supports .bpmn and .xml files</p>
            <input
              id="bpmn-file-input"
              type="file"
              accept=".bpmn,.xml"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleFileChange(f);
              }}
            />
          </div>

          {/* Preview */}
          {preview && (
            <div className="flex items-center gap-2 rounded-lg bg-green-500/10 border border-green-500/20 p-3">
              <CheckCircle2 size={16} className="text-green-400" />
              <span className="text-xs text-green-300">
                Found {preview.elements} elements and {preview.connections} connections
              </span>
            </div>
          )}

          {/* Workspace selection */}
          {preview && (
            <div className="space-y-3">
              <label className="block text-xs font-medium text-[#7a8a7a]">Import Target</label>
              <div className="flex gap-2">
                <button
                  onClick={() => setImportMode('new_workspace')}
                  className={`flex-1 flex items-center gap-2 rounded-md border px-3 py-2 text-xs transition ${
                    importMode === 'new_workspace'
                      ? 'border-[#00ff41] bg-[#00ff41]/10 text-black'
                      : 'border-[#1a2a1a] text-[#7a8a7a] hover:border-[#3a4a3a]'
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
                      : 'border-[#1a2a1a] text-[#7a8a7a] hover:border-[#3a4a3a]'
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
                  placeholder={file?.name?.replace(/\.(bpmn|xml)$/i, '') || 'Workspace name'}
                  className="w-full rounded-md border border-[#1a2a1a] bg-[#0a0a0a] px-3 py-2 text-xs text-white placeholder:text-[#3a4a3a] outline-none focus:border-[#00ff41] transition"
                />
              )}

              {importMode === 'merge' && workspaces.length > 0 && (
                <select
                  value={mergeTargetId}
                  onChange={(e) => setMergeTargetId(e.target.value)}
                  className="w-full rounded-md border border-[#1a2a1a] bg-[#0a0a0a] px-3 py-2 text-xs text-white outline-none focus:border-[#00ff41] transition"
                >
                  <option value="">-- Select workspace --</option>
                  {workspaces.map((ws) => (
                    <option key={ws.id} value={ws.id}>{ws.name}</option>
                  ))}
                </select>
              )}
            </div>
          )}

          {/* Duplicate warning */}
          {preview && duplicateCount > 0 && (
            <div className="flex items-center gap-2 rounded-lg bg-yellow-500/10 border border-yellow-500/20 p-3">
              <AlertCircle size={16} className="text-yellow-400 shrink-0" />
              <span className="text-xs text-yellow-300">
                {duplicateCount} duplicate element{duplicateCount > 1 ? 's' : ''} found (same name + type).
                {importMode === 'merge' ? ' Duplicates will be skipped.' : ' Consider merging instead.'}
              </span>
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
        <div className="flex items-center justify-end gap-3 border-t border-[#1a2a1a] px-5 py-4">
          <button
            onClick={onClose}
            className="rounded-md px-4 py-2 text-xs text-[#7a8a7a] hover:text-white transition"
          >
            Cancel
          </button>
          <button
            onClick={() => { checkDuplicates(); }}
            disabled={!preview}
            className="rounded-md border border-[#1a2a1a] px-4 py-2 text-xs text-[#7a8a7a] hover:text-white hover:border-[#3a4a3a] disabled:opacity-50 transition"
          >
            Check Duplicates
          </button>
          <button
            onClick={handleImport}
            disabled={!preview}
            className="rounded-md bg-[#00ff41] px-4 py-2 text-xs font-medium text-black hover:bg-[#00cc33] disabled:opacity-50 transition"
          >
            Import
          </button>
        </div>
      </div>
    </div>
  );
}
