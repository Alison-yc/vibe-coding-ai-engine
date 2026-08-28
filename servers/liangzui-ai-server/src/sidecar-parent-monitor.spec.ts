import { describe, expect, it, vi } from 'vitest';
import { isProcessAlive, watchParentProcess } from './sidecar-parent-monitor';

describe('sidecar parent monitor', () => {
  it('recognizes the current process as alive', () => {
    expect(isProcessAlive(process.pid)).toBe(true);
  });

  it('stops the sidecar callback after the parent disappears', () => {
    vi.useFakeTimers();
    const onParentExit = vi.fn();
    const isAlive = vi.fn().mockReturnValueOnce(true).mockReturnValue(false);
    const stop = watchParentProcess({
      parentPid: 123,
      onParentExit,
      intervalMs: 10,
      isAlive,
    });

    vi.advanceTimersByTime(10);
    expect(onParentExit).not.toHaveBeenCalled();
    vi.advanceTimersByTime(10);
    expect(onParentExit).toHaveBeenCalledOnce();
    vi.advanceTimersByTime(20);
    expect(onParentExit).toHaveBeenCalledOnce();

    stop();
    vi.useRealTimers();
  });
});
