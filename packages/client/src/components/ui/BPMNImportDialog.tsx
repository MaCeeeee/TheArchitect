import { useState, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { X, Upload, FileCode, AlertCircle, CheckCircle2 } from 'lucide-react';
import { parseBPMN } from '../../utils/bpmnParser';
import { useArchitectureStore } from '../../stores/architectureStore';
import { architectureAPI } from '../../services/api';

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

export default function BPMNImportDialog({ isOpen, onClose }: Props) {
  const { projectId } = useParams();
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<{ elements: number; connections: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [xmlContent, setXmlContent] = useState<string>('');
  const setElements = useArchitectureStore((s) => s.setElements);
  const setConnections = useArchitectureStore((s) => s.setConnections);

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

  const handleImport = async () => {
    if (!xmlContent || !projectId) return;
    try {
      const result = parseBPMN(xmlContent);
      await architectureAPI.importBPMN(projectId, {
        elements: result.elements,
        connections: result.connections,
      });
      // Reload from server to get canonical IDs
      const [elemRes, connRes] = await Promise.all([
        architectureAPI.getElements(projectId),
        architectureAPI.getConnections(projectId),
      ]);
      setElements(elemRes.data.data || []);
      setConnections(connRes.data.data || []);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Import failed');
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="w-full max-w-lg rounded-xl border border-[#334155] bg-[#1e293b] shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[#334155] px-5 py-4">
          <div className="flex items-center gap-2">
            <FileCode size={18} className="text-[#7c3aed]" />
            <h2 className="text-sm font-semibold text-white">Import BPMN 2.0</h2>
          </div>
          <button onClick={onClose} className="text-[#94a3b8] hover:text-white">
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 space-y-4">
          {/* Drop zone */}
          <div
            onDrop={handleDrop}
            onDragOver={(e) => e.preventDefault()}
            className="flex flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed border-[#334155] bg-[#0f172a] p-8 hover:border-[#7c3aed] transition cursor-pointer"
            onClick={() => document.getElementById('bpmn-file-input')?.click()}
          >
            <Upload size={32} className="text-[#64748b]" />
            <p className="text-sm text-[#94a3b8]">
              {file ? file.name : 'Drop BPMN file here or click to browse'}
            </p>
            <p className="text-xs text-[#64748b]">Supports .bpmn and .xml files</p>
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

          {/* Error */}
          {error && (
            <div className="flex items-center gap-2 rounded-lg bg-red-500/10 border border-red-500/20 p-3">
              <AlertCircle size={16} className="text-red-400" />
              <span className="text-xs text-red-300">{error}</span>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 border-t border-[#334155] px-5 py-4">
          <button
            onClick={onClose}
            className="rounded-md px-4 py-2 text-xs text-[#94a3b8] hover:text-white transition"
          >
            Cancel
          </button>
          <button
            onClick={handleImport}
            disabled={!preview}
            className="rounded-md bg-[#7c3aed] px-4 py-2 text-xs font-medium text-white hover:bg-[#6d28d9] disabled:opacity-50 transition"
          >
            Import
          </button>
        </div>
      </div>
    </div>
  );
}
