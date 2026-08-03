/**
 * Tests für das Evidence-Objekt (THE-558, Slice 2 von UC-ATTEST-001).
 *
 * DIE DREI GARANTIEN:
 *   1. Append-only (WORM) — Korrektur ist ein neuer Eintrag, nie ein Update.
 *   2. Alterung — eine Evidenz trägt ihren Textstand; Novelle macht sie stale,
 *      und ein attestiertes Tor fällt MIT SICHTBAREM GRUND zurück.
 *      „Ein Protokoll von 2023 belegt 2026 nichts mehr."
 *   3. Kein Zugangsmaterial im Verweis — ein Nachweis-Register, das Tokens
 *      trägt, hat das Problem verschoben statt gelöst.
 */
import {
  assertAppendOnly,
  refCarriesCredentialMaterial,
  isFreshEvidence,
  resetAttestedForStale,
} from '../services/evidence.service';
import { emptyGates, applyHumanGate } from '../services/requirementGates.service';

describe('assertAppendOnly — WORM wie das Register (THE-445)', () => {
  it('lets a new document pass', () => {
    expect(() => assertAppendOnly({ isNew: true })).not.toThrow();
  });

  it('rejects re-saving an existing document — correction is a NEW row', () => {
    expect(() => assertAppendOnly({ isNew: false })).toThrow(/append-only/i);
  });
});

describe('refCarriesCredentialMaterial — kein Token im Nachweis', () => {
  it.each([
    ['https://wiki.example.com/runbooks/incident-2026-07', false],
    ['minio://evidence/reports/q3-review.pdf', false],
    ['register:6f1a2b3c4d5e6f7a8b9c0d1e', false],
    ['https://api.example.com/report?token=abc123', true],
    ['https://user:hunter2@intranet.example.com/doc', true],
    ['https://example.com/x?api_key=sk-live-123', true],
    ['Bearer eyJhbGciOi...', true],
    ['https://example.com/?key=ta_live_secret', true],
  ])('%s → %s', (ref, expected) => {
    expect(refCarriesCredentialMaterial(ref)).toBe(expected);
  });
});

describe('isFreshEvidence', () => {
  it('fresh when not stale', () => {
    expect(isFreshEvidence({ stale: false })).toBe(true);
    expect(isFreshEvidence({})).toBe(true);
  });
  it('not fresh when stale — auch wenn sie die einzige ist', () => {
    expect(isFreshEvidence({ stale: true })).toBe(false);
  });
});

describe('resetAttestedForStale — der Rückfall mit sichtbarem Grund (P-1)', () => {
  const user = '507f1f77bcf86cd799439011';

  it('resets attested=yes to unknown and names the law change as reason', () => {
    const gates = applyHumanGate(emptyGates(), 'attested', 'yes', user, 'Evidenz X liegt vor');
    const after = resetAttestedForStale(gates);
    expect(after.attested.state).toBe('unknown');
    expect(after.attested.setBy).toBe('system');
    expect(after.attested.reason).toMatch(/stale|law text changed/i);
    // die anderen Tore bleiben unangetastet
    expect(after.enforced.state).toBe(gates.enforced.state);
    expect(after.covered.state).toBe(gates.covered.state);
  });

  it('leaves attested=no and unknown alone — nur ein Ja kann fallen', () => {
    const no = applyHumanGate(emptyGates(), 'attested', 'no', user, 'kein Nachweis auffindbar');
    expect(resetAttestedForStale(no).attested.state).toBe('no');
    expect(resetAttestedForStale(emptyGates()).attested.state).toBe('unknown');
  });

  it('is pure — the input is not mutated', () => {
    const gates = applyHumanGate(emptyGates(), 'attested', 'yes', user, 'x liegt vor');
    resetAttestedForStale(gates);
    expect(gates.attested.state).toBe('yes');
  });
});

describe('Evidence model (THE-558)', () => {
  const { Evidence } = require('../models/Evidence');
  const base = {
    projectId: '507f1f77bcf86cd799439011',
    requirementId: '507f1f77bcf86cd799439012',
    kind: 'report',
    ref: 'https://wiki.example.com/runbooks/incident-2026-07',
    sha256: 'a3f1'.repeat(16),
    collectedAt: new Date(),
    collectedBy: '507f1f77bcf86cd799439013',
  };

  it('accepts a well-formed evidence record', () => {
    expect(new Evidence(base).validateSync()).toBeUndefined();
  });

  it('rejects a malformed sha256 — Buffer.from would silently truncate it', () => {
    expect(new Evidence({ ...base, sha256: 'zz'.repeat(32) }).validateSync()).toBeDefined();
    expect(new Evidence({ ...base, sha256: 'a3f1' }).validateSync()).toBeDefined();
  });

  it('rejects a ref that carries credential material — at the SCHEMA level', () => {
    expect(new Evidence({ ...base, ref: 'https://x.example.com/?token=abc' }).validateSync()).toBeDefined();
  });

  it('defaults stale to false — fresh until the law text moves', () => {
    expect(new Evidence(base).stale).toBe(false);
  });
});
