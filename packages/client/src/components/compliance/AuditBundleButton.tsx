/**
 * AuditBundleButton (THE-559) — "Can I show this to an auditor?"
 *
 * Downloads the audit bundle: every requirement with its three-gate tripel
 * and the evidence chain. The bundle only claims what the gates carry —
 * covered-only shows as "covered, not attested", stale evidence stays
 * visible and marked. The export itself is audited server-side.
 */
import { useState } from 'react';
import { FileDown, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { useParams } from 'react-router-dom';
import { requirementsAPI } from '../../services/api';

export default function AuditBundleButton() {
  const { projectId } = useParams<{ projectId: string }>();
  const [busy, setBusy] = useState<'pdf' | 'json' | null>(null);

  const download = async (format: 'pdf' | 'json') => {
    if (!projectId) return;
    setBusy(format);
    try {
      if (format === 'pdf') {
        const { data } = await requirementsAPI.auditBundlePdf(projectId);
        const url = URL.createObjectURL(data as Blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `audit-bundle-${projectId}.pdf`;
        a.click();
        URL.revokeObjectURL(url);
      } else {
        const { data } = await requirementsAPI.auditBundleJson(projectId);
        const blob = new Blob([JSON.stringify(data.data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `audit-bundle-${projectId}.json`;
        a.click();
        URL.revokeObjectURL(url);
      }
      toast.success('Audit bundle downloaded');
    } catch {
      toast.error('Failed to build the audit bundle');
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="flex items-center justify-between bg-[#1e293b] border border-[#334155] rounded-lg px-5 py-3">
      <div>
        <div className="text-sm font-semibold text-slate-100">Audit bundle</div>
        <div className="text-xs text-slate-400">
          Gates + evidence chain per norm — states only what the gates carry, stale evidence stays visible.
        </div>
      </div>
      <div className="flex gap-2">
        {(['pdf', 'json'] as const).map((f) => (
          <button
            key={f}
            onClick={() => void download(f)}
            disabled={busy !== null}
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded border border-[#334155] text-slate-300 hover:bg-[#0f172a] disabled:opacity-50 uppercase"
          >
            {busy === f ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileDown className="w-3.5 h-3.5" />}
            {f}
          </button>
        ))}
      </div>
    </div>
  );
}
