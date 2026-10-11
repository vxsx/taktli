import { afterEach, describe, expect, it, vi } from 'vitest';
import { workerClearInterval, workerSetInterval, type WorkerLike } from './workerTimer';

function fakeWorker() {
  const w: WorkerLike & { posted: unknown[]; terminated: boolean } = {
    posted: [],
    terminated: false,
    onmessage: null,
    postMessage(v) {
      this.posted.push(v);
    },
    terminate() {
      this.terminated = true;
    },
  };
  return w;
}

describe('workerSetInterval', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('runs the callback on every tick from the worker and stops it on clear', () => {
    const w = fakeWorker();
    const fn = vi.fn();
    const handle = workerSetInterval(fn, 25, () => w);
    expect(w.posted).toEqual([25]);
    w.onmessage?.(new MessageEvent('message', { data: 0 }));
    w.onmessage?.(new MessageEvent('message', { data: 0 }));
    expect(fn).toHaveBeenCalledTimes(2);
    workerClearInterval(handle);
    expect(w.terminated).toBe(true);
  });

  it('falls back to a plain interval when workers are unavailable', () => {
    vi.useFakeTimers();
    const fn = vi.fn();
    const handle = workerSetInterval(fn, 25, () => {
      throw new Error('no workers here');
    });
    vi.advanceTimersByTime(60);
    expect(fn).toHaveBeenCalledTimes(2);
    workerClearInterval(handle);
    vi.advanceTimersByTime(60);
    expect(fn).toHaveBeenCalledTimes(2);
  });
});
