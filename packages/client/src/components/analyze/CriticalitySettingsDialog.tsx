import { useEffect, useState } from 'react';
import { X, RotateCcw, Settings, Loader2, AlertCircle } from 'lucide-react';
import toast from 'react-hot-toast';
import { DEFAULT_FACTOR_WEIGHTS, FACTOR_LABELS } from '@thearchitect/shared';
import type { CriticalityFactor, FactorWeights } from '@thearchitect/shared';
import {
  fetchCriticalitySettings,
  updateCriticalitySettings,
  type CriticalitySettings,
} from '../../services/criticality.api';

interface Props {
  isOpen: boolean;
  projectId: string | null;
  onClose: () => void;
  onSaved?: (settings: CriticalitySettings) => void;
}

const TOP_N_OPTIONS = [5, 10, 20];
const FACTOR_ORDER: CriticalityFactor[] = [
  'spof',
  'riskConnectivity',
  'maturityFloor',
  'complianceGap',
  'costBurden',
  'stakeholderBottleneck',
  'cycleTangle',
];

const DEFAULT_TOP_N = 10;

export default function CriticalitySettingsDialog({ isOpen, projectId, onClose, onSaved }: Props) {
  const [topN, setTopN] = useState<number>(DEFAULT_TOP_N);
  const [customTopN, setCustomTopN] = useState<string>('');
  const [weights, setWeights] = useState<FactorWeights>(DEFAULT_FACTOR_WEIGHTS);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen || !projectId) return;
    setLoading(true);
    setError(null);
    fetchCriticalitySettings(projectId)
      .then((s) => {
        setTopN(s.topN);
        setWeights(s.weights);
        setCustomTopN('');
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load'))
      .finally(() => setLoading(false));
  }, [isOpen, projectId]);

  useEffect(() => {
    if (!isOpen) return;
    const esc = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !saving) onClose();
    };
    document.addEventListener('keydown', esc);
    return () => document.removeEventListener('keydown', esc);
  }, [isOpen, saving, onClose]);

  if (!isOpen || !projectId) return null;

  const hasAtLeastOnePositive = FACTOR_ORDER.some((f) => weights[f] > 0);

  const handleWeight = (f: CriticalityFactor, value: number) => {
    setWeights((w) => ({ ...w, [f]: Math.max(0, Math.min(2.0, value)) }));
  };

  const handleReset = () => {
    setTopN(DEFAULT_TOP_N);
    setWeights({ ...DEFAULT_FACTOR_WEIGHTS });
    setCustomTopN('');
  };

  const handleSave = async () => {
    if (!hasAtLeastOnePositive) {
      setError('At least one factor must have weight > 0');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const finalTopN = customTopN
        ? Math.max(1, Math.min(50, Number(customTopN) || DEFAULT_TOP_N))
        : topN;
      const saved = await updateCriticalitySettings(projectId, { topN: finalTopN, weights });
      toast.success('Criticality settings saved');
      onSaved?.(saved);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={() => !saving && onClose()}
    >
      <div
        className="bg-[#1e293b] border border-[#334155] rounded-lg shadow-xl w-full max-w-md p-4 m-4 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
        data-testid="criticality-settings-dialog"
      >
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="flex items-center gap-2">
            <Settings className="w-5 h-5 text-purple-300" />
            <h2 className="text-sm font-semibold text-white">Criticality Settings</h2>
          </div>
          <button
            onClick={() => !saving && onClose()}
            className="text-slate-400 hover:text-white"
            aria-label="Close"
            disabled={saving}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-8 text-slate-400 gap-2">
            <Loader2 className="w-4 h-4 animate-spin" />
            Loading…
          </div>
        ) : (
          <>
            <div className="mb-4">
              <p className="text-[10px] uppercase tracking-wide text-slate-400 mb-2">
                Top-N visible
              </p>
              <div className="flex flex-wrap gap-1.5 items-center">
                {TOP_N_OPTIONS.map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => {
                      setTopN(n);
                      setCustomTopN('');
                    }}
                    className={`px-3 py-1 rounded text-xs font-medium ${
                      topN === n && !customTopN
                        ? 'bg-[#7c3aed] text-white'
                        : 'bg-slate-700/40 text-slate-300 hover:bg-slate-700'
                    }`}
                    data-testid={`topn-${n}`}
                  >
                    Top {n}
                  </button>
                ))}
                <div className="flex items-center gap-1">
                  <span className="text-[10px] text-slate-500">Custom:</span>
                  <input
                    type="number"
                    min={1}
                    max={50}
                    value={customTopN}
                    onChange={(e) => setCustomTopN(e.target.value)}
                    className="w-16 bg-[#0f172a] border border-[#334155] rounded px-2 py-1 text-xs text-white focus:outline-none focus:border-[#7c3aed]"
                    data-testid="topn-custom"
                    placeholder="—"
                  />
                </div>
              </div>
            </div>

            <div className="mb-4">
              <p className="text-[10px] uppercase tracking-wide text-slate-400 mb-2">
                Factor Weights (0.0 – 2.0)
              </p>
              <div className="space-y-2">
                {FACTOR_ORDER.map((f) => (
                  <div key={f} className="flex items-center gap-2 text-xs">
                    <span className="w-40 text-slate-300 truncate" title={FACTOR_LABELS[f]}>
                      {FACTOR_LABELS[f]}
                    </span>
                    <input
                      type="range"
                      min={0}
                      max={2}
                      step={0.1}
                      value={weights[f]}
                      onChange={(e) => handleWeight(f, Number(e.target.value))}
                      className="flex-1 accent-[#7c3aed]"
                      data-testid={`weight-${f}`}
                    />
                    <span className="w-10 text-right font-mono text-slate-300">
                      {weights[f].toFixed(1)}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {!hasAtLeastOnePositive && (
              <div className="flex items-start gap-1.5 text-xs text-red-300 bg-red-500/10 border border-red-500/30 rounded p-2 mb-3">
                <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                At least one factor must have weight &gt; 0
              </div>
            )}

            {error && (
              <div className="flex items-start gap-1.5 text-xs text-red-300 bg-red-500/10 border border-red-500/30 rounded p-2 mb-3">
                <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                {error}
              </div>
            )}

            <div className="flex gap-2 pt-2 border-t border-[#334155]/50">
              <button
                type="button"
                onClick={handleReset}
                disabled={saving}
                className="px-3 py-1.5 rounded bg-slate-700/40 hover:bg-slate-700 text-white text-xs font-medium flex items-center gap-1.5 disabled:opacity-50"
                data-testid="reset-defaults"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                Reset Defaults
              </button>
              <div className="flex-1" />
              <button
                type="button"
                onClick={() => !saving && onClose()}
                disabled={saving}
                className="px-3 py-1.5 rounded bg-slate-700 hover:bg-slate-600 text-white text-xs font-medium disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={saving || !hasAtLeastOnePositive}
                className="px-3 py-1.5 rounded bg-purple-600 hover:bg-purple-500 disabled:bg-slate-600 disabled:cursor-not-allowed text-white text-xs font-medium"
                data-testid="save-settings"
              >
                {saving ? 'Saving…' : 'Save'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
