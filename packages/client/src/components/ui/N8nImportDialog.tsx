import { useState, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { X, Upload, Workflow, AlertCircle, CheckCircle2, Globe, Key, RefreshCw } from 'lucide-react';
import { parseN8nWorkflow } from '../../utils/n8nParser';
import { useArchitectureStore } from '../../stores/architectureStore';
import { architectureAPI } from '../../services/api';

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

type Tab = 'upload' | 'api';

interface WorkflowListItem {
  id: string;
  name: string;
  active: boolean;
  updatedAt?: string;
}

export default function N8nImportDialog({ isOpen, onClose }: Props) {
  const { projectId } = useParams();
  const [tab, setTab] = useState<Tab>('upload');

  // Upload tab state
  const [file, setFile] = useState<File | null>(null);
  const [jsonText, setJsonText] = useState('');
  const [preview, setPreview] = useState<{ elements: number; connections: number; layers: Record<string, number> } | null>(null);
  const [error, setError] = useState<string | null>(null);

  // API tab state
  const [n8nUrl, setN8nUrl] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [workflows, setWorkflows] = useState<WorkflowListItem[]>([]);
  const [selectedWorkflowId, setSelectedWorkflowId] = useState('');
  const [isFetching, setIsFetching] = useState(false);
  const [fetchedWorkflow, setFetchedWorkflow] = useState<object | null>(null);

  const setElements = useArchitectureStore((s) => s.setElements);
  const setConnections = useArchitectureStore((s) => s.setConnections);

  const parseAndPreview = useCallback((input: string | object) => {
    setError(null);
    setPreview(null);
    try {
      const result = parseN8nWorkflow(input);
      const layers: Record<string, number> = {};
      for (const el of result.elements) {
        layers[el.layer] = (layers[el.layer] || 0) + 1;
      }
      setPreview({ elements: result.elements.length, connections: result.connections.length, layers });
      return result;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to parse n8n workflow');
      return null;
    }
  }, []);

  // ── Upload tab handlers ───────────────────────────────

  const handleFileChange = useCallback(async (selectedFile: File) => {
    setFile(selectedFile);
    try {
      const text = await selectedFile.text();
      setJsonText(text);
      parseAndPreview(text);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to read file');
    }
  }, [parseAndPreview]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const droppedFile = e.dataTransfer.files[0];
    if (droppedFile && droppedFile.name.endsWith('.json')) {
      handleFileChange(droppedFile);
    } else {
      setError('Please drop a .json file');
    }
  }, [handleFileChange]);

  const handleTextChange = useCallback((text: string) => {
    setJsonText(text);
    setFile(null);
    if (text.trim()) {
      parseAndPreview(text);
    } else {
      setPreview(null);
      setError(null);
    }
  }, [parseAndPreview]);

  // ── API tab handlers ──────────────────────────────────

  const handleFetchWorkflows = async () => {
    if (!n8nUrl || !apiKey || !projectId) return;
    setIsFetching(true);
    setError(null);
    setWorkflows([]);
    try {
      const { data } = await architectureAPI.fetchN8nWorkflows(projectId, { n8nUrl, apiKey });
      const list: WorkflowListItem[] = (data.data?.data || data.data || []).map((w: { id: string; name: string; active: boolean; updatedAt?: string }) => ({
        id: w.id,
        name: w.name,
        active: w.active,
        updatedAt: w.updatedAt,
      }));
      setWorkflows(list);
      if (list.length === 0) setError('No workflows found on this n8n instance');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to connect to n8n');
    } finally {
      setIsFetching(false);
    }
  };

  const handleSelectWorkflow = async (workflowId: string) => {
    if (!projectId) return;
    setSelectedWorkflowId(workflowId);
    setIsFetching(true);
    setError(null);
    setFetchedWorkflow(null);
    try {
      const { data } = await architectureAPI.fetchN8nWorkflow(projectId, { n8nUrl, apiKey, workflowId });
      const wf = data.data;
      setFetchedWorkflow(wf);
      parseAndPreview(wf);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch workflow');
    } finally {
      setIsFetching(false);
    }
  };

  // ── Import ────────────────────────────────────────────

  const handleImport = async () => {
    const source = tab === 'upload' ? jsonText : fetchedWorkflow;
    if (!source || !projectId) return;
    try {
      const result = parseN8nWorkflow(source);
      await architectureAPI.importN8n(projectId, {
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
            <Workflow size={18} className="text-[#f97316]" />
            <h2 className="text-sm font-semibold text-white">Import n8n Workflow</h2>
          </div>
          <button onClick={onClose} className="text-[#94a3b8] hover:text-white">
            <X size={18} />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-[#334155]">
          <button
            onClick={() => { setTab('upload'); setError(null); }}
            className={`flex-1 px-4 py-2.5 text-xs font-medium transition ${
              tab === 'upload' ? 'text-white border-b-2 border-[#f97316]' : 'text-[#64748b] hover:text-[#94a3b8]'
            }`}
          >
            JSON Upload
          </button>
          <button
            onClick={() => { setTab('api'); setError(null); }}
            className={`flex-1 px-4 py-2.5 text-xs font-medium transition ${
              tab === 'api' ? 'text-white border-b-2 border-[#f97316]' : 'text-[#64748b] hover:text-[#94a3b8]'
            }`}
          >
            n8n API
          </button>
        </div>

        {/* Body */}
        <div className="p-5 space-y-4 max-h-[60vh] overflow-y-auto">
          {tab === 'upload' ? (
            <>
              {/* Drop zone */}
              <div
                onDrop={handleDrop}
                onDragOver={(e) => e.preventDefault()}
                className="flex flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed border-[#334155] bg-[#0f172a] p-6 hover:border-[#f97316] transition cursor-pointer"
                onClick={() => document.getElementById('n8n-file-input')?.click()}
              >
                <Upload size={28} className="text-[#64748b]" />
                <p className="text-sm text-[#94a3b8]">
                  {file ? file.name : 'Drop n8n workflow .json or click to browse'}
                </p>
                <input
                  id="n8n-file-input"
                  type="file"
                  accept=".json"
                  className="hidden"
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFileChange(f); }}
                />
              </div>

              {/* Or paste JSON */}
              <div>
                <label className="block text-xs font-medium text-[#94a3b8] mb-1.5">Or paste workflow JSON</label>
                <textarea
                  value={jsonText}
                  onChange={(e) => handleTextChange(e.target.value)}
                  placeholder='{"name": "My Workflow", "nodes": [...], "connections": {...}}'
                  rows={4}
                  className="w-full rounded-md border border-[#334155] bg-[#0f172a] px-3 py-2 text-xs text-white font-mono placeholder:text-[#475569] outline-none focus:border-[#f97316] transition resize-none"
                />
              </div>
            </>
          ) : (
            <>
              {/* n8n URL + API Key */}
              <div>
                <label className="block text-xs font-medium text-[#94a3b8] mb-1.5">
                  <Globe size={12} className="inline mr-1" />n8n Instance URL
                </label>
                <input
                  type="url"
                  value={n8nUrl}
                  onChange={(e) => setN8nUrl(e.target.value)}
                  placeholder="https://your-n8n.example.com"
                  className="w-full rounded-md border border-[#334155] bg-[#0f172a] px-3 py-2 text-sm text-white placeholder:text-[#475569] outline-none focus:border-[#f97316] transition"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-[#94a3b8] mb-1.5">
                  <Key size={12} className="inline mr-1" />API Key
                </label>
                <input
                  type="password"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder="n8n API key"
                  className="w-full rounded-md border border-[#334155] bg-[#0f172a] px-3 py-2 text-sm text-white placeholder:text-[#475569] outline-none focus:border-[#f97316] transition"
                />
              </div>
              <button
                onClick={handleFetchWorkflows}
                disabled={!n8nUrl || !apiKey || isFetching}
                className="w-full flex items-center justify-center gap-2 rounded-md border border-[#334155] bg-[#0f172a] px-4 py-2 text-xs text-[#e2e8f0] hover:border-[#f97316] disabled:opacity-50 transition"
              >
                <RefreshCw size={14} className={isFetching ? 'animate-spin' : ''} />
                {isFetching ? 'Loading...' : 'Load Workflows'}
              </button>

              {/* Workflow list */}
              {workflows.length > 0 && (
                <div>
                  <label className="block text-xs font-medium text-[#94a3b8] mb-1.5">Select Workflow</label>
                  <select
                    value={selectedWorkflowId}
                    onChange={(e) => handleSelectWorkflow(e.target.value)}
                    className="w-full rounded-md border border-[#334155] bg-[#0f172a] px-3 py-2 text-sm text-white outline-none focus:border-[#f97316] transition"
                  >
                    <option value="">-- Choose a workflow --</option>
                    {workflows.map((w) => (
                      <option key={w.id} value={w.id}>
                        {w.name} {w.active ? '(active)' : '(inactive)'}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </>
          )}

          {/* Preview */}
          {preview && (
            <div className="rounded-lg bg-green-500/10 border border-green-500/20 p-3 space-y-1">
              <div className="flex items-center gap-2">
                <CheckCircle2 size={16} className="text-green-400" />
                <span className="text-xs text-green-300">
                  {preview.elements} elements, {preview.connections} connections
                </span>
              </div>
              <div className="flex flex-wrap gap-2 mt-1">
                {Object.entries(preview.layers).map(([layer, count]) => (
                  <span key={layer} className="rounded-full bg-[#0f172a] px-2 py-0.5 text-[10px] text-[#94a3b8]">
                    {layer}: {count}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="flex items-center gap-2 rounded-lg bg-red-500/10 border border-red-500/20 p-3">
              <AlertCircle size={16} className="text-red-400 shrink-0" />
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
            className="rounded-md bg-[#f97316] px-4 py-2 text-xs font-medium text-white hover:bg-[#ea580c] disabled:opacity-50 transition"
          >
            Import to Architecture
          </button>
        </div>
      </div>
    </div>
  );
}
