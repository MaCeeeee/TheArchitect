// UC-WFCOMP-001 — "Assess Workflow" page.
//
// WHAT "ASSESS" MEANS HERE (stated for the user, not just implied):
//   Take an automation workflow (n8n JSON) and check it against the GDPR Art. 30
//   "record of processing activities" — the 7 fields a controller must be able to
//   show (a–g). It does NOT judge whether the workflow is "legal". It maps which
//   required record fields are PRESENT, which are a deterministic GAP, and which
//   NEED A HUMAN to sign off. A person — never the machine — turns a field green.
//
// Flow: paste/import JSON → Assess → honest three-list verdict → attest open
// fields → the verdict is recomputed (the sign-off persists server-side).

import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { Workflow, Loader2, FileJson, PenLine, Info } from 'lucide-react';
import WfcompVerdict from './WfcompVerdict';
import { wfcompAPI } from '../../services/api';
import type { WfcompGapReport } from '@thearchitect/shared';

// A ready-to-run example (a survey store that names no recipient → a visible gap).
const SAMPLE_WORKFLOW = JSON.stringify(
  {
    name: 'Internal Survey Store',
    nodes: [
      { parameters: { path: 'survey', httpMethod: 'POST' }, name: 'Survey Webhook', type: 'n8n-nodes-base.webhook', typeVersion: 1, position: [200, 300] },
      { parameters: { values: { string: [{ name: 'email', value: '' }, { name: 'answer', value: '' }] } }, name: 'Map Answer', type: 'n8n-nodes-base.set', typeVersion: 2, position: [420, 300] },
      { parameters: { operation: 'insert', table: 'survey_answers' }, name: 'Store Answer', type: 'n8n-nodes-base.postgres', typeVersion: 2, position: [640, 300] },
    ],
    connections: {
      'Survey Webhook': { main: [[{ node: 'Map Answer', type: 'main', index: 0 }]] },
      'Map Answer': { main: [[{ node: 'Store Answer', type: 'main', index: 0 }]] },
    },
  },
  null,
  2,
);

const FIELD_LABEL: Record<string, string> = {
  a: 'Controller & contact details',
  b: 'Purpose of processing',
  c: 'Categories of data subjects & data',
  d: 'Categories of recipients',
  e: 'Third-country transfer safeguards',
  f: 'Erasure deadlines',
  g: 'Technical & organisational measures (Art. 32)',
};

const CRIT_ORDER: Record<string, number> = { HART: 0, BEDINGT: 1, WEICH: 2 };

interface ApiError {
  response?: { status?: number; data?: { error?: string } };
}
function errMsg(e: unknown, fallback: string): string {
  return (e as ApiError)?.response?.data?.error || fallback;
}

export default function AssessWorkflow() {
  const { projectId } = useParams<{ projectId: string }>();

  const [json, setJson] = useState('');
  const [infer, setInfer] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [report, setReport] = useState<WfcompGapReport | null>(null);
  const [workflowId, setWorkflowId] = useState<string | null>(null);

  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [signing, setSigning] = useState(false);
  const [signError, setSignError] = useState<string | null>(null);

  async function runAssess() {
    setError(null);
    setReport(null);
    setSignError(null);
    setDrafts({});

    let parsed: unknown;
    try {
      parsed = JSON.parse(json);
    } catch {
      setError('That is not valid JSON. Paste an n8n workflow export, or load the sample.');
      return;
    }

    // A stable id so a later attestation targets THIS assessment (re-assess replaces it).
    const id = `ui-${Date.now()}`;
    setLoading(true);
    try {
      const res = await wfcompAPI.assess(projectId!, parsed, { workflowId: id, infer });
      const rep = res.data.data as WfcompGapReport;
      setReport(rep);
      setWorkflowId(id);
      // Prefill attestation drafts with any LLM suggestion (the human still confirms).
      const pre: Record<string, string> = {};
      rep.fields.forEach((f) => {
        if (f.suggestion?.value) pre[f.litera] = f.suggestion.value;
      });
      setDrafts(pre);
    } catch (e) {
      setError(errMsg(e, 'Assessment failed.'));
    } finally {
      setLoading(false);
    }
  }

  async function signOff() {
    if (!report || !workflowId) return;
    const attestations = Object.entries(drafts)
      .map(([litera, value]) => ({ litera, value: value.trim() }))
      .filter((a) => a.value.length > 0);
    if (attestations.length === 0) {
      setSignError('Enter at least one value before signing.');
      return;
    }
    setSigning(true);
    setSignError(null);
    try {
      const res = await wfcompAPI.recompute(projectId!, workflowId, attestations);
      setReport(res.data.data as WfcompGapReport);
    } catch (e) {
      const status = (e as ApiError)?.response?.status;
      setSignError(
        status === 403
          ? 'You need approval rights (governance:approve) to sign off — a viewer cannot attest.'
          : errMsg(e, 'Sign-off failed.'),
      );
    } finally {
      setSigning(false);
    }
  }

  // Fields the human can still act on (everything not already covered), worst-first.
  const openFields = report?.gdprScope
    ? [...report.fields]
        .filter((f) => f.status !== 'present')
        .sort((a, b) => CRIT_ORDER[a.criticality] - CRIT_ORDER[b.criticality])
    : [];

  return (
    <div className="space-y-6">
      {/* Header — states plainly what "assess" means. */}
      <div>
        <h1 className="flex items-center gap-2 text-xl font-semibold text-white">
          <Workflow size={20} className="text-[#7c3aed]" />
          Assess Workflow
        </h1>
        <p className="mt-1 max-w-3xl text-sm text-[var(--text-tertiary)]">
          Bring an automation workflow (n8n JSON) and check it against the{' '}
          <span className="text-[var(--text-secondary)]">GDPR Art. 30 record of processing</span>. We map which of the
          seven required record fields are present, which are a gap, and which need your sign-off. We do{' '}
          <span className="text-[var(--text-secondary)]">not</span> judge legality — a person, never the machine, makes a field green.
        </p>
      </div>

      {/* Input card */}
      <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-raised)] p-4">
        <div className="mb-2 flex items-center justify-between">
          <label className="flex items-center gap-2 text-sm font-medium text-[var(--text-secondary)]">
            <FileJson size={15} />
            Workflow JSON
          </label>
          <button
            onClick={() => { setJson(SAMPLE_WORKFLOW); setError(null); }}
            className="text-xs text-[#7c3aed] hover:underline"
          >
            Load sample
          </button>
        </div>
        <textarea
          value={json}
          onChange={(e) => setJson(e.target.value)}
          spellCheck={false}
          placeholder='Paste an n8n workflow export here, or click "Load sample"…'
          className="h-56 w-full resize-y rounded-md border border-[var(--border-subtle)] bg-[var(--surface-base)] px-3 py-2 font-mono text-xs text-white outline-none focus:border-[#7c3aed]"
        />
        <div className="mt-3 flex items-center justify-between">
          <label className="flex items-center gap-2 text-xs text-[var(--text-secondary)]">
            <input type="checkbox" checked={infer} onChange={(e) => setInfer(e.target.checked)} className="accent-[#7c3aed]" />
            Suggest purpose & categories with AI (you still confirm)
          </label>
          <button
            onClick={runAssess}
            disabled={loading || json.trim().length === 0}
            className="inline-flex items-center gap-2 rounded-md bg-[#7c3aed] px-4 py-2 text-sm font-medium text-white transition hover:bg-[#6d28d9] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading ? <Loader2 size={15} className="animate-spin" /> : <Workflow size={15} />}
            {loading ? 'Assessing…' : 'Assess'}
          </button>
        </div>
        {error && <p className="mt-2 text-xs text-[#f43f5e]">{error}</p>}
      </div>

      {/* Privacy note — earns trust at the exact spot data is submitted. */}
      <p className="flex items-start gap-1.5 text-[11px] text-[var(--text-tertiary)]">
        <Info size={12} className="mt-0.5 shrink-0" />
        Your workflow is sanitized on arrival — only its structure is read; field values, credentials and
        pinned data are discarded and never stored.
      </p>

      {/* Verdict */}
      {report && (
        <div>
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-[var(--text-tertiary)]">Verdict</h2>
          <WfcompVerdict report={report} />
        </div>
      )}

      {/* Attestation — the Notar loop */}
      {openFields.length > 0 && (
        <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-raised)] p-4">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-white">
            <PenLine size={15} className="text-[#eab308]" />
            Your sign-off
          </h2>
          <p className="mt-1 text-xs text-[var(--text-tertiary)]">
            These fields can't be produced from the workflow's structure. Fill what applies and sign — each
            confirmed field flips to <span className="text-[#22c55e]">covered</span> and is recorded against you.
          </p>

          <div className="mt-3 space-y-2.5">
            {openFields.map((f) => (
              <div key={f.litera} className="flex items-center gap-3">
                <div className="w-52 shrink-0">
                  <span className="text-xs text-[var(--text-secondary)]">
                    <span className="font-mono text-[var(--text-tertiary)]">{f.litera})</span> {FIELD_LABEL[f.litera]}
                  </span>
                  <span className="ml-1 text-[10px] text-[var(--text-tertiary)]">{f.criticality}</span>
                </div>
                <input
                  type="text"
                  value={drafts[f.litera] ?? ''}
                  onChange={(e) => setDrafts((d) => ({ ...d, [f.litera]: e.target.value }))}
                  placeholder={f.mode === 'confirm' ? 'Confirm or edit the AI suggestion…' : 'Enter the value…'}
                  className="flex-1 rounded-md border border-[var(--border-subtle)] bg-[var(--surface-base)] px-3 py-1.5 text-xs text-white outline-none focus:border-[#7c3aed]"
                />
              </div>
            ))}
          </div>

          <div className="mt-4 flex items-center gap-3">
            <button
              onClick={signOff}
              disabled={signing}
              className="inline-flex items-center gap-2 rounded-md bg-[#eab308] px-4 py-2 text-sm font-medium text-black transition hover:bg-[#ca9a04] disabled:opacity-50"
            >
              {signing ? <Loader2 size={15} className="animate-spin" /> : <PenLine size={15} />}
              {signing ? 'Recording…' : 'Sign & update verdict'}
            </button>
            {signError && <p className="text-xs text-[#f43f5e]">{signError}</p>}
          </div>
        </div>
      )}
    </div>
  );
}
