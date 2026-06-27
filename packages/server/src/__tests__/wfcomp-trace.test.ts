/**
 * trace + assess Tests (.4 / THE-355) — Gates G2 (no false-green) + G3 (HART exact).
 */
import fs from 'fs';
import path from 'path';
import { assessWorkflow } from '../services/wfcomp/assess';

const FIX = path.join(__dirname, 'fixtures', 'wfcomp');
const assess = (name: string) =>
  assessWorkflow(JSON.parse(fs.readFileSync(path.join(FIX, `${name}.json`), 'utf-8')));
const status = (report: ReturnType<typeof assess>, litera: string) =>
  report.fields.find(f => f.litera === litera)?.status;

describe('assessWorkflow / runTraceCheck (.4 / THE-355)', () => {
  it('G3: missing-recipient → lit. d MISSING (HART red)', () => {
    const r = assess('missing-recipient');
    expect(r.gdprScope).toBe(true);
    expect(status(r, 'd')).toBe('missing');
  });

  it('clean-compliant → lit. d PRESENT (EU recipient), lit. e PRESENT (no third country)', () => {
    const r = assess('clean-compliant');
    expect(status(r, 'd')).toBe('present');
    expect(status(r, 'e')).toBe('present');
  });

  it('G2: non-extractable legal fields are NEVER auto-green (a/b/c → needs_attestation)', () => {
    const r = assess('clean-compliant');
    expect(status(r, 'a')).toBe('needs_attestation'); // Controller
    expect(status(r, 'b')).toBe('needs_attestation'); // Purpose
    expect(status(r, 'c')).toBe('needs_attestation'); // Data-subject category
    // none of the legal fields is falsely 'present'
    for (const lit of ['a', 'b', 'c', 'f', 'g']) {
      expect(status(r, lit)).not.toBe('present');
    }
  });

  it('G5: no-personal-data → gdprScope false, no fields assessed', () => {
    const r = assess('no-personal-data');
    expect(r.gdprScope).toBe(false);
    expect(r.fields).toHaveLength(0);
  });

  it('reports all 7 fields with a criticality each (in-scope workflow)', () => {
    const r = assess('clean-compliant');
    expect(r.fields).toHaveLength(7);
    expect(r.fields.filter(f => f.criticality === 'HART')).toHaveLength(4);
  });
});
