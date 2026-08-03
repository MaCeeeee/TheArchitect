/**
 * Tests für das Prüfer-Bündel (THE-559, Slice 3 von UC-ATTEST-001).
 *
 * DIE EINE REGEL: das Bündel behauptet nur, was die Tore hergeben. Es schönt
 * nicht („covered, not attested" steht da), es filtert nicht (stale Evidenzen
 * erscheinen ALS stale, mit Grund), und eine Norm ohne einzige attestierte
 * Anforderung ergibt ein GÜLTIGES Bündel, das genau das wörtlich sagt.
 */
import {
  buildAuditBundle,
  renderAuditBundlePdf,
  type AuditBundleInput,
} from '../services/auditBundle.service';

const GATES_COVERED_ONLY = {
  covered: { state: 'yes' as const, setBy: 'system', setAt: '2026-08-03T00:00:00Z', reason: 'derived: 2 linked element(s)' },
  enforced: { state: 'unknown' as const },
  attested: { state: 'unknown' as const },
};

const GATES_ATTESTED = {
  covered: { state: 'yes' as const, setBy: 'system', reason: 'derived: 1 linked element(s)' },
  enforced: { state: 'yes' as const, setBy: 'u1', setAt: '2026-08-01T00:00:00Z', reason: 'Q3 review' },
  attested: { state: 'yes' as const, setBy: 'u1', setAt: '2026-08-02T00:00:00Z', reason: 'evidence attached' },
};

const input = (over: Partial<AuditBundleInput> = {}): AuditBundleInput => ({
  projectName: 'Demo Bank',
  generatedAt: '2026-08-03T05:00:00.000Z',
  norms: [
    {
      label: 'DSGVO Art. 33',
      requirements: [
        {
          id: 'r1',
          title: 'Meldeprozess etablieren',
          priority: 'must',
          status: 'done',
          gates: GATES_ATTESTED,
          evidence: [
            {
              id: 'e2',
              kind: 'report',
              ref: 'minio://evidence/q3.pdf',
              sha256: 'a3f1'.repeat(16),
              collectedAt: '2026-08-02T00:00:00Z',
              regulationVersionHash: 'hash-v2',
              stale: false,
              supersedes: 'e1',
            },
            {
              id: 'e1',
              kind: 'report',
              ref: 'minio://evidence/q2.pdf',
              sha256: 'b4c2'.repeat(16),
              collectedAt: '2026-05-01T00:00:00Z',
              regulationVersionHash: 'hash-v1',
              stale: true,
            },
          ],
        },
        { id: 'r2', title: 'Fristenuhr dokumentieren', priority: 'should', status: 'open', gates: GATES_COVERED_ONLY, evidence: [] },
      ],
    },
  ],
  ...over,
});

describe('buildAuditBundle — Ehrlichkeit ist die Struktur', () => {
  it('labels covered-only requirements as "covered, not attested"', () => {
    const b = buildAuditBundle(input());
    const r2 = b.norms[0].requirements.find((r) => r.id === 'r2')!;
    expect(r2.honesty).toBe('covered, not attested');
  });

  it('keeps stale evidence VISIBLE and marked with a reason — never filtered', () => {
    const b = buildAuditBundle(input());
    const r1 = b.norms[0].requirements.find((r) => r.id === 'r1')!;
    const stale = r1.evidence.find((e) => e.id === 'e1')!;
    expect(stale.stale).toBe(true);
    expect(stale.note).toMatch(/stale|law text/i);
    expect(r1.evidence).toHaveLength(2); // nichts weggefiltert
  });

  it('carries the supersedes chain — a correction is visible history', () => {
    const b = buildAuditBundle(input());
    const fresh = b.norms[0].requirements[0].evidence.find((e) => e.id === 'e2')!;
    expect(fresh.supersedes).toBe('e1');
  });

  it('counts gate states per norm — and has NO percent and NO score anywhere', () => {
    const b = buildAuditBundle(input());
    expect(b.norms[0].counts).toEqual({
      total: 2,
      covered: 2,
      enforced: 1,
      attested: 1,
    });
    const flat = JSON.stringify(b).toLowerCase();
    expect(flat).not.toMatch(/percent|score|%/);
  });

  it('a norm with ZERO attested requirements yields a VALID bundle that says so plainly', () => {
    const b = buildAuditBundle(
      input({
        norms: [{ label: 'NIS2 Art. 23', requirements: [{ id: 'r3', title: 'Frühwarnung senden', priority: 'must', status: 'open', gates: GATES_COVERED_ONLY, evidence: [] }] }],
      }),
    );
    expect(b.norms[0].statement).toMatch(/no requirement .*attested/i);
  });

  it('carries generation time and the disclaimer in the bundle itself', () => {
    const b = buildAuditBundle(input());
    expect(b.generatedAt).toBe('2026-08-03T05:00:00.000Z');
    expect(b.disclaimer).toMatch(/not legal advice/i);
  });
});

describe('renderAuditBundlePdf', () => {
  it('produces a real PDF', async () => {
    const buf = await renderAuditBundlePdf(buildAuditBundle(input()));
    expect(buf.subarray(0, 5).toString()).toBe('%PDF-');
    expect(buf.length).toBeGreaterThan(500);
  });

  it('renders the empty-norm statement instead of an empty page', async () => {
    const b = buildAuditBundle(
      input({ norms: [{ label: 'NIS2 Art. 23', requirements: [] }] }),
    );
    const buf = await renderAuditBundlePdf(b);
    expect(buf.subarray(0, 5).toString()).toBe('%PDF-');
  });
});
