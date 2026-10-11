import { describe, expect, it } from 'vitest';
import { createProject } from '../model/factory';
import * as ops from '../model/ops';
import type { TimelineOptions } from '../model/timeline';
import type { Project, TrackId } from '../model/types';
import { Scheduler, type PlayheadEvent } from './scheduler';

const TICK_120 = 0.5 / 12;

function harness(project: Project, options: Partial<TimelineOptions> = {}) {
  const state = {
    project,
    options: { mode: 'pattern', patternId: project.patterns[0].id, barIndex: 0, loopBar: false, ...options } as TimelineOptions,
  };
  let now = 0;
  const played: [TrackId, number, number][] = [];
  const heads: PlayheadEvent[] = [];
  const s = new Scheduler({
    now: () => now,
    getProject: () => state.project,
    getOptions: () => state.options,
    play: (track, time, velocity) => played.push([track, Number(time.toFixed(4)), velocity]),
    onPlayhead: (e) => heads.push(e),
    lookahead: 0.1,
    setInterval: () => 1,
    clearInterval: () => {},
  });
  /** Simulates the 25 ms timer up to `t`. */
  const runTo = (t: number) => {
    while (now < t) {
      now = Math.min(t, now + 0.025);
      s.pump();
    }
  };
  return { state, played, heads, s, runTo, setNow: (t: number) => (now = t) };
}

function beatProject(): Project {
  let p = ops.setBpm(createProject(), 120);
  const pid = p.patterns[0].id;
  p = ops.setVelocity(p, pid, 0, 0, 'kick', 0, 100);
  p = ops.setVelocity(p, pid, 0, 1, 'snare', 0, 90);
  return p;
}

describe('Scheduler', () => {
  it('schedules the first bar on time', () => {
    const h = harness(beatProject());
    h.s.start();
    h.runTo(1.0);
    expect(h.played).toEqual([['kick', 0.06, 100], ['snare', 0.56, 90]]);
  });

  it('applies swing to 16th off-beats', () => {
    let p = ops.setBpm(createProject(), 120);
    const pid = p.patterns[0].id;
    p = ops.setVelocity(p, pid, 0, 0, 'hhClosed', 1, 80);
    p = ops.setSwing(p, pid, 100);
    const h = harness(p);
    h.s.start();
    h.runTo(0.5);
    expect(h.played).toEqual([['hhClosed', Number((0.06 + 4.5 * TICK_120).toFixed(4)), 80]]);
  });

  it('loops a one-bar pattern', () => {
    const h = harness(beatProject());
    h.s.start();
    h.runTo(2.2);
    expect(h.played.filter(([t]) => t === 'kick').map(([, time]) => time)).toEqual([0.06, 2.06]);
  });

  it('starts from the edited bar in pattern mode', () => {
    let p = ops.setBpm(createProject(), 120);
    const pid = p.patterns[0].id;
    p = ops.addBar(p, pid);
    p = ops.setVelocity(p, pid, 1, 0, 'crash', 0, 100);
    const h = harness(p, { barIndex: 1 });
    h.s.start();
    h.runTo(4.2);
    expect(h.played).toEqual([['crash', 0.06, 100], ['crash', 4.06, 100]]);
  });

  it('follows the song order', () => {
    let p = ops.setBpm(createProject(), 120);
    const a = p.patterns[0].id;
    p = ops.addPattern(p, 'b');
    p = ops.setVelocity(p, a, 0, 0, 'kick', 0, 100);
    p = ops.setVelocity(p, 'b', 0, 0, 'snare', 0, 100);
    p = ops.appendSongStep(p, 'b');
    p = ops.appendSongStep(p, a);
    const h = harness(p, { mode: 'song' });
    h.s.start();
    h.runTo(4.2);
    expect(h.played.map(([t, time]) => [t, time])).toEqual([['snare', 0.06], ['kick', 2.06], ['snare', 4.06]]);
  });

  it('skips muted tracks', () => {
    const h = harness(ops.setTrackMuted(beatProject(), 'snare', true));
    h.s.start();
    h.runTo(1.0);
    expect(h.played.map(([t]) => t)).toEqual(['kick']);
  });

  it('picks up live edits', () => {
    const h = harness(beatProject());
    h.s.start();
    h.runTo(0.1);
    h.state.project = ops.setVelocity(h.state.project, h.state.project.patterns[0].id, 0, 2, 'tom1', 0, 70);
    h.runTo(1.2);
    expect(h.played.map(([t, time]) => [t, time])).toEqual([['kick', 0.06], ['snare', 0.56], ['tom1', 1.06]]);
  });

  it('applies tempo changes from the next tick', () => {
    let p = ops.setBpm(createProject(), 120);
    const pid = p.patterns[0].id;
    for (const beat of [0, 1, 2, 3]) p = ops.setVelocity(p, pid, 0, beat, 'kick', 0, 100);
    const h = harness(p);
    h.s.start();
    h.runTo(0.4);
    h.state.project = ops.setBpm(h.state.project, 60);
    h.runTo(3.0);
    const times = h.played.map(([, time]) => time);
    const t11 = 0.06 + 11 * TICK_120;
    expect(times.slice(0, 4)).toEqual([0.06, Number((t11 + 1 / 12).toFixed(4)), Number((t11 + 13 / 12).toFixed(4)), Number((t11 + 25 / 12).toFixed(4))]);
  });

  it('emits a playhead event per tick', () => {
    const h = harness(beatProject());
    h.s.start();
    h.runTo(1.0);
    expect(h.heads[0]).toEqual({ time: 0.06, ref: { patternId: h.state.project.patterns[0].id, barIndex: 0, stepIndex: -1 }, tick: 0 });
    expect(h.heads.map((e) => e.tick).slice(0, 5)).toEqual([0, 1, 2, 3, 4]);
  });

  it('survives deleting the playing bar', () => {
    let p = ops.setBpm(createProject(), 120);
    const pid = p.patterns[0].id;
    p = ops.addBar(p, pid);
    p = ops.setVelocity(p, pid, 0, 0, 'kick', 0, 100);
    p = ops.setVelocity(p, pid, 1, 0, 'crash', 0, 100);
    const h = harness(p, { barIndex: 1 });
    h.s.start();
    h.runTo(0.5);
    h.state.project = ops.deleteBar(h.state.project, pid, 1);
    expect(() => h.runTo(4.5)).not.toThrow();
    expect(h.played.map(([t, time]) => [t, time])).toEqual([['crash', 0.06], ['kick', 2.06], ['kick', 4.06]]);
  });

  it('resyncs after a stall instead of bursting', () => {
    let p = ops.setBpm(createProject(), 120);
    const pid = p.patterns[0].id;
    for (const beat of [0, 1, 2, 3]) p = ops.setVelocity(p, pid, 0, beat, 'kick', 0, 100);
    const h = harness(p);
    h.s.start();
    h.runTo(0.3);
    const before = h.played.length;
    h.setNow(10);
    h.s.pump();
    const burst = h.played.slice(before);
    expect(burst.every(([, time]) => time >= 10)).toBe(true);
    expect(burst.length).toBeLessThanOrEqual(1);
    expect(h.heads.at(-1)!.time).toBeGreaterThanOrEqual(10);
    expect(h.heads.filter((e) => e.time >= 0.4 && e.time < 10)).toEqual([]);
  });

  it('stops cleanly', () => {
    const h = harness(beatProject());
    h.s.start();
    expect(h.s.running).toBe(true);
    h.s.stop();
    expect(h.s.running).toBe(false);
    const n = h.played.length;
    h.runTo(3);
    expect(h.played.length).toBe(n);
  });

  it('plays nothing but keeps time for an empty project', () => {
    const h = harness(createProject());
    h.s.start();
    h.runTo(1);
    expect(h.played).toEqual([]);
    expect(h.heads.length).toBeGreaterThan(20);
  });
});
