import type { PlayheadEvent } from './scheduler';

/**
 * Playhead events scheduled ahead of the audio clock. Events that have already sounded are dropped on every
 * push, not just when the screen reads the playhead, so the queue stays small while a hidden tab skips frames.
 */
export class PlayheadQueue {
  private queue: PlayheadEvent[] = [];
  private current: PlayheadEvent | null = null;

  get size(): number {
    return this.queue.length;
  }

  push(e: PlayheadEvent, now: number): void {
    this.advance(now);
    this.queue.push(e);
  }

  /** The latest event that has sounded by `now`. */
  at(now: number): PlayheadEvent | null {
    this.advance(now);
    return this.current;
  }

  clear(): void {
    this.queue = [];
    this.current = null;
  }

  private advance(now: number): void {
    let n = 0;
    while (n < this.queue.length && this.queue[n].time <= now) n++;
    if (n === 0) return;
    this.current = this.queue[n - 1];
    this.queue.splice(0, n);
  }
}
