import { describe, expect, it } from 'vitest';
import { PlayheadQueue } from './playheadQueue';
import type { PlayheadEvent } from './scheduler';

const ev = (time: number, tick: number): PlayheadEvent => ({ time, tick, ref: { patternId: 'p', barIndex: 0, stepIndex: -1 } });

describe('PlayheadQueue', () => {
  it('reports the latest event that has sounded', () => {
    const q = new PlayheadQueue();
    q.push(ev(1, 0), 0.9);
    q.push(ev(1.1, 1), 0.9);
    expect(q.at(0.95)).toBeNull();
    expect(q.at(1.05)?.tick).toBe(0);
    expect(q.at(1.2)?.tick).toBe(1);
  });

  it('stays small while nobody reads it (hidden tabs skip animation frames)', () => {
    const q = new PlayheadQueue();
    for (let i = 0; i < 20_000; i++) q.push(ev(i * 0.01 + 0.1, i % 48), i * 0.01);
    expect(q.size).toBeLessThanOrEqual(11);
    expect(q.at(1e6)?.tick).toBe(19_999 % 48);
  });

  it('forgets everything on clear', () => {
    const q = new PlayheadQueue();
    q.push(ev(1, 0), 0);
    q.at(2);
    q.clear();
    expect(q.at(3)).toBeNull();
    expect(q.size).toBe(0);
  });
});
