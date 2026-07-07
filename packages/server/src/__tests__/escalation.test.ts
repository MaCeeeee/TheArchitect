/**
 * Eskalations-Router Tests (THE-401 S3) — Self-Consistency-Signale + Routing.
 *
 * Run: cd packages/server && npx jest src/__tests__/escalation.test.ts
 */
import {
  computeSignals,
  routeProposal,
  routeAll,
  DEFAULT_THRESHOLDS,
} from '../services/escalation.service';

const run = (...pairs: Array<[string, number]>) =>
  pairs.map(([elementId, confidence]) => ({ elementId, confidence }));

describe('computeSignals()', () => {
  it('computes self-consistency and mean confidence across runs', () => {
    const runs = [
      run(['a', 0.9], ['b', 0.7]),
      run(['a', 0.8], ['c', 0.6]),
      run(['a', 1.0]),
    ];
    const s = computeSignals(runs);
    const a = s.find(x => x.elementId === 'a')!;
    expect(a.selfConsistency).toBeCloseTo(1, 5); // in allen 3 Läufen
    expect(a.confidence).toBeCloseTo((0.9 + 0.8 + 1.0) / 3, 5);
    const b = s.find(x => x.elementId === 'b')!;
    expect(b.selfConsistency).toBeCloseTo(1 / 3, 5); // nur in Lauf 1
  });

  it('dedupes duplicate proposals within one run', () => {
    const s = computeSignals([run(['a', 0.9], ['a', 0.5])]);
    expect(s.find(x => x.elementId === 'a')!.occurrences).toBe(1);
  });

  it('returns [] for zero runs', () => {
    expect(computeSignals([])).toEqual([]);
  });
});

describe('routeProposal()', () => {
  const sig = (selfConsistency: number, confidence: number, occurrences: number, runs = 3) => ({
    elementId: 'x', selfConsistency, confidence, occurrences, runs,
  });

  it('keeps order-stable, high-confidence proposals (protect TPs)', () => {
    expect(routeProposal(sig(1.0, 0.95, 3))).toBe('keep');
  });

  it('escalates wobbly or mid-confidence proposals to the judge', () => {
    expect(routeProposal(sig(0.67, 0.95, 2))).toBe('escalate'); // nicht in allen Läufen
    expect(routeProposal(sig(1.0, 0.7, 3))).toBe('escalate'); // stabil, aber Confidence zu niedrig
  });

  it('drops single-run, low-confidence noise', () => {
    expect(routeProposal(sig(1 / 3, 0.55, 1))).toBe('drop');
  });

  it('does NOT drop a single-run proposal if its confidence is high (→ escalate)', () => {
    expect(routeProposal(sig(1 / 3, 0.9, 1))).toBe('escalate');
  });
});

describe('routeAll()', () => {
  it('partitions proposals into keep/escalate/drop', () => {
    const runs = [
      run(['stable', 0.95], ['mid', 0.7], ['noise', 0.55]),
      run(['stable', 0.9], ['mid', 0.7]),
      run(['stable', 0.92], ['mid', 0.7]),
    ];
    const r = routeAll(runs, DEFAULT_THRESHOLDS);
    expect(r.keep).toContain('stable'); // in allen 3, conf hoch
    expect(r.escalate).toContain('mid'); // in allen 3, conf 0.7 < keepConfidence
    expect(r.drop).toContain('noise'); // 1 Lauf, conf 0.55
  });
});
