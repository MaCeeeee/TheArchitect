/**
 * attestation Tests (.5 / THE-356) — Gates G7 (never green), G8 (ask/confirm), G9 (recompute).
 */
import fs from 'fs';
import path from 'path';
import { sanitizeN8nWorkflow } from '../services/wfcomp/sanitize';
import { liftCompliance } from '../services/wfcomp/lift';
import { runTraceCheck } from '../services/wfcomp/trace';
import { applyAttestation } from '../services/wfcomp/attestation';
import { assessWorkflowWithInference } from '../services/wfcomp/assess';
import { ART30_FIELDS } from '../data/art30.seed-data';

const FIX = path.join(__dirname, 'fixtures', 'wfcomp');
const raw = (name: string) => JSON.parse(fs.readFileSync(path.join(FIX, `${name}.json`), 'utf-8'));
const sani = (name: string) => sanitizeN8nWorkflow(raw(name));

function mockAnthropic(suggestions: unknown[]) {
  return {
    messages: {
      create: jest.fn().mockResolvedValue({
        content: [{ type: 'text', text: JSON.stringify({ suggestions }) }],
      }),
    },
  } as any;
}
const status = (r: { fields: { litera: string; status: string }[] }, l: string) =>
  r.fields.find(f => f.litera === l)?.status;
const mode = (r: { fields: { litera: string; mode?: string }[] }, l: string) =>
  r.fields.find(f => f.litera === l)?.mode;

describe('G8: ask vs. confirm split', () => {
  it('field WITH a suggestion → mode confirm; field WITHOUT → ask', async () => {
    const client = mockAnthropic([
      { litera: 'b', value: 'Manage newsletter subscriptions for subscribers', confidence: 0.85, rationale: 'r' },
    ]);
    const r = await assessWorkflowWithInference(raw('clean-compliant'), { anthropicClient: client });
    expect(mode(r, 'b')).toBe('confirm');
    expect(r.fields.find(f => f.litera === 'b')?.suggestion?.value).toMatch(/newsletter/);
    expect(mode(r, 'a')).toBe('ask'); // Controller — no LLM suggestion
    expect(mode(r, 'f')).toBe('ask');
  });

  it('abstained field → ask (no forced suggestion)', async () => {
    const client = mockAnthropic([
      { litera: 'b', value: 'Manage newsletter subscriptions', confidence: 0.3, rationale: 'unsure' }, // dropped
    ]);
    const r = await assessWorkflowWithInference(raw('clean-compliant'), { anthropicClient: client });
    expect(mode(r, 'b')).toBe('ask');
    expect(r.fields.find(f => f.litera === 'b')?.suggestion).toBeUndefined();
  });
});

describe('G7: a suggestion never makes a field green', () => {
  it('confident b+c suggestions → still needs_attestation, not present', async () => {
    const client = mockAnthropic([
      { litera: 'b', value: 'Manage newsletter subscriptions for subscribers', confidence: 0.95, rationale: 'r' },
      { litera: 'c', value: 'Newsletter subscribers', confidence: 0.9, rationale: 'r' },
    ]);
    const r = await assessWorkflowWithInference(raw('clean-compliant'), { anthropicClient: client });
    expect(status(r, 'b')).toBe('needs_attestation');
    expect(status(r, 'c')).toBe('needs_attestation');
  });
});

describe('G9: applyAttestation materializes the path → recompute flips to present', () => {
  it('confirming purpose (b) makes lit. b present', () => {
    const lifted = liftCompliance(sani('clean-compliant'));
    expect(runTraceCheck(lifted, ART30_FIELDS).fields.find(f => f.litera === 'b')?.status).toBe('needs_attestation');

    const attested = applyAttestation(lifted, [{ litera: 'b', value: 'Manage newsletter subscriptions' }]);
    const recomputed = runTraceCheck(attested, ART30_FIELDS);
    expect(recomputed.fields.find(f => f.litera === 'b')?.status).toBe('present');
  });

  it('confirming controller (a) + category (c) flips both to present', () => {
    const lifted = liftCompliance(sani('clean-compliant'));
    const attested = applyAttestation(lifted, [
      { litera: 'a', value: 'Acme GmbH, DPO Jane Doe' },
      { litera: 'c', value: 'Newsletter subscribers' },
    ]);
    const r = runTraceCheck(attested, ART30_FIELDS);
    expect(r.fields.find(f => f.litera === 'a')?.status).toBe('present');
    expect(r.fields.find(f => f.litera === 'c')?.status).toBe('present');
  });
});
