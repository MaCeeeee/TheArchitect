import { describe, test, expect, vi, afterEach } from 'vitest';
import { acquireSceneSlot, __liveSceneCount } from './sceneSingleton';

describe('scene singleton guard (ADR-0005 AC-6)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  test('single mount acquires and releases cleanly', () => {
    const release = acquireSceneSlot();
    expect(__liveSceneCount()).toBe(1);
    release();
    expect(__liveSceneCount()).toBe(0);
  });

  test('second concurrent mount logs a loud error', () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    const r1 = acquireSceneSlot();
    expect(err).not.toHaveBeenCalled();
    const r2 = acquireSceneSlot();
    expect(err).toHaveBeenCalledTimes(1);
    expect(String(err.mock.calls[0][0])).toContain('AC-6');
    r1(); r2();
    expect(__liveSceneCount()).toBe(0);
  });
});
