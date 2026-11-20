/**
 * UC-METH-001 — the ladder report in the advisor store: only the answer to the latest request counts.
 * Run: cd packages/client && npx vitest run src/stores/advisorStore.test.ts
 */
import { describe, test, expect, beforeEach, vi } from 'vitest';
import type { LadderReport } from '@thearchitect/shared';

// Mock the api module BEFORE importing the store
vi.mock('../services/api', () => ({
  advisorAPI: { scan: vi.fn(), health: vi.fn(), ladder: vi.fn() },
}));

import { useAdvisorStore } from './advisorStore';
import { advisorAPI } from '../services/api';

const ladder = vi.mocked(advisorAPI.ladder);
type Answer = Awaited<ReturnType<typeof advisorAPI.ladder>>;

/** A request whose answer the test sends when it wants to. */
function pending() {
  let resolve!: (answer: Answer) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<Answer>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const report = (projectId: string, timestamp = '2026-11-20T12:00:00.000Z') => ({ projectId, timestamp }) as LadderReport;
const answer = (r: LadderReport) => ({ data: { success: true, data: r } }) as Answer;
const shown = () => useAdvisorStore.getState().ladder;

describe('advisorStore.loadLadder', () => {
  beforeEach(() => {
    ladder.mockReset();
    useAdvisorStore.getState().clear();
  });

  test('stores the report of the project asked for', async () => {
    ladder.mockResolvedValueOnce(answer(report('A')));
    await useAdvisorStore.getState().loadLadder('A');
    expect(ladder).toHaveBeenCalledWith('A');
    expect(shown()).toEqual(report('A'));
  });

  test('a failed request leaves no report', async () => {
    ladder.mockResolvedValueOnce(answer(report('A')));
    await useAdvisorStore.getState().loadLadder('A');
    ladder.mockRejectedValueOnce(new Error('500'));
    await useAdvisorStore.getState().loadLadder('A');
    expect(shown()).toBeNull();
  });

  test('a late answer for another project does not replace the report of the current one', async () => {
    const a = pending();
    const b = pending();
    ladder.mockReturnValueOnce(a.promise).mockReturnValueOnce(b.promise);
    const first = useAdvisorStore.getState().loadLadder('A');
    const second = useAdvisorStore.getState().loadLadder('B');
    b.resolve(answer(report('B')));
    await second;
    expect(shown()).toEqual(report('B'));
    a.resolve(answer(report('A')));
    await first;
    expect(shown()).toEqual(report('B'));
  });

  test('a late error of an earlier request does not remove the current report', async () => {
    const a = pending();
    const b = pending();
    ladder.mockReturnValueOnce(a.promise).mockReturnValueOnce(b.promise);
    const first = useAdvisorStore.getState().loadLadder('A');
    const second = useAdvisorStore.getState().loadLadder('B');
    b.resolve(answer(report('B')));
    await second;
    a.reject(new Error('timeout'));
    await first;
    expect(shown()).toEqual(report('B'));
  });

  test('two refreshes of one project: the answer to the later one stays, whichever arrives last', async () => {
    const older = pending();
    const newer = pending();
    ladder.mockReturnValueOnce(older.promise).mockReturnValueOnce(newer.promise);
    const first = useAdvisorStore.getState().loadLadder('A');
    const second = useAdvisorStore.getState().loadLadder('A');
    newer.resolve(answer(report('A', '2026-11-20T12:00:05.000Z')));
    await second;
    older.resolve(answer(report('A', '2026-11-20T12:00:01.000Z')));
    await first;
    expect(shown()?.timestamp).toBe('2026-11-20T12:00:05.000Z');
  });
});
