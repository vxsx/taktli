import { describe, expect, it } from 'vitest';
import { createBar, createBeat, createProject } from './factory';
import { projectProblems } from './invariants';
import { randomizeBars, type Rng } from './randomize';
import { GHOST_MAX } from './timing';
import { TRACK_IDS } from './tracks';
import type { Bar, TrackId } from './types';

/** Small seeded generator so every case is reproducible. */
function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const SEEDS = Array.from({ length: 200 }, (_, i) => i + 1);
const ALL: ReadonlySet<TrackId> = new Set(TRACK_IDS);
const DEFAULT_VISIBLE: ReadonlySet<TrackId> = new Set(TRACK_IDS.filter((t) => t !== 'hhPedal' && t !== 'crossStick'));
const TOMS: TrackId[] = ['tom1', 'tom2', 'floorTom'];

const bars = (n: number): Bar[] => Array.from({ length: n }, () => createBar());
const all = (n: number) => Array.from({ length: n }, (_, i) => i);
const notes = (bar: Bar, track: TrackId, beat: number) => bar.beats[beat].cells[track].filter((v) => v > 0).length;
const onOff = (bar: Bar, track: TrackId) => bar.beats.map((b) => b.cells[track].map((v) => v > 0));

describe('randomizeBars', () => {
  it('always puts a kick on the first beat and a backbeat on the snare', () => {
    for (const seed of SEEDS) {
      const [bar] = randomizeBars(bars(1), [0], { tracks: DEFAULT_VISIBLE, rng: mulberry32(seed) });
      expect(bar.beats[0].cells.kick[0], `seed ${seed}`).toBeGreaterThan(0);
      const backbeat = bar.beats[1].cells.snare[0] > 0 && bar.beats[3].cells.snare[0] > 0;
      const halfTime = bar.beats[2].cells.snare[0] > 0;
      expect(backbeat || halfTime, `seed ${seed}`).toBe(true);
    }
  });

  it('keeps a timekeeper going on the hi-hat or ride', () => {
    for (const seed of SEEDS) {
      const [bar] = randomizeBars(bars(1), [0], { tracks: DEFAULT_VISIBLE, rng: mulberry32(seed) });
      const keeper = [0, 1, 2, 3].filter((b) => notes(bar, 'hhClosed', b) + notes(bar, 'ride', b) + notes(bar, 'hhOpen', b) > 0);
      expect(keeper.length, `seed ${seed}`).toBeGreaterThanOrEqual(3);
    }
  });

  it('produces different grooves on different rolls', () => {
    const distinct = new Set(SEEDS.slice(0, 30).map((seed) => JSON.stringify(randomizeBars(bars(1), [0], { tracks: DEFAULT_VISIBLE, rng: mulberry32(seed) })[0].beats)));
    expect(distinct.size).toBeGreaterThan(20);
  });

  it('keeps every bar valid, including triplet beats', () => {
    for (const seed of SEEDS) {
      const p = createProject();
      const src = bars(4);
      src[1].beats[3] = createBeat(3);
      src[3].beats[2] = createBeat(6);
      src[3].beats[3] = createBeat(3);
      p.patterns[0].bars = randomizeBars(src, all(4), { tracks: ALL, rng: mulberry32(seed) });
      expect(projectProblems(p), `seed ${seed}`).toEqual([]);
      expect(p.patterns[0].bars[3].beats.map((b) => b.div)).toEqual([4, 4, 6, 3]);
    }
  });

  it('keeps bar ids and leaves bars it was not asked to change alone', () => {
    const src = bars(3);
    const out = randomizeBars(src, [1], { tracks: ALL, rng: mulberry32(1) });
    expect(out.map((b) => b.id)).toEqual(src.map((b) => b.id));
    expect(out[0]).toBe(src[0]);
    expect(out[2]).toBe(src[2]);
    expect(src[1].beats[0].cells.kick[0]).toBe(0);
  });

  it('only writes the given tracks and leaves the notes on the others', () => {
    const src = bars(1);
    src[0].beats[2].cells.hhPedal[1] = 77;
    src[0].beats[0].cells.kick = [127, 127, 127, 127];
    for (const seed of SEEDS.slice(0, 50)) {
      const [bar] = randomizeBars(src, [0], { tracks: DEFAULT_VISIBLE, rng: mulberry32(seed) });
      expect(bar.beats[2].cells.hhPedal).toEqual([0, 77, 0, 0]);
      expect(bar.beats[0].cells.crossStick).toEqual([0, 0, 0, 0]);
      expect(bar.beats[0].cells.kick).not.toEqual([127, 127, 127, 127]);
    }
  });

  it('keeps ghost notes soft and accents loud', () => {
    for (const seed of SEEDS) {
      const [bar] = randomizeBars(bars(1), [0], { tracks: DEFAULT_VISIBLE, rng: mulberry32(seed) });
      expect(bar.beats[1].cells.snare[0] || bar.beats[2].cells.snare[0]).toBeGreaterThan(100);
      for (const beat of bar.beats) {
        for (const [i, v] of beat.cells.snare.entries()) if (i > 0 && v > 0 && v < 100) expect(v).toBeLessThanOrEqual(GHOST_MAX);
      }
    }
  });

  it('plays toms only in fills, so a one-bar pattern has none', () => {
    for (const seed of SEEDS) {
      const [bar] = randomizeBars(bars(1), [0], { tracks: DEFAULT_VISIBLE, rng: mulberry32(seed) });
      for (const t of TOMS) expect([0, 1, 2, 3].map((b) => notes(bar, t, b)), `seed ${seed} ${t}`).toEqual([0, 0, 0, 0]);
    }
  });

  it('ends the last bar of a longer pattern with a fill instead of the timekeeper', () => {
    for (const seed of SEEDS) {
      const out = randomizeBars(bars(2), all(2), { tracks: DEFAULT_VISIBLE, rng: mulberry32(seed) });
      const last = out[1];
      const fillNotes = ['snare', ...TOMS].reduce((n, t) => n + notes(last, t as TrackId, 3), 0);
      expect(fillNotes, `seed ${seed}`).toBeGreaterThanOrEqual(2);
      expect(notes(last, 'hhClosed', 3) + notes(last, 'ride', 3), `seed ${seed}`).toBe(0);
    }
  });

  it('gives a single re-rolled bar a fill when it is the last bar of the pattern', () => {
    const out = randomizeBars(bars(3), [2], { tracks: DEFAULT_VISIBLE, rng: mulberry32(9) });
    const fillNotes = ['snare', ...TOMS].reduce((n, t) => n + notes(out[2], t as TrackId, 3), 0);
    expect(fillNotes).toBeGreaterThanOrEqual(2);
  });

  it('falls back to a snare fill when the toms are hidden', () => {
    const tracks = new Set<TrackId>(['kick', 'snare', 'hhClosed']);
    for (const seed of SEEDS.slice(0, 50)) {
      const out = randomizeBars(bars(2), all(2), { tracks, rng: mulberry32(seed) });
      expect(notes(out[1], 'snare', 3), `seed ${seed}`).toBeGreaterThanOrEqual(2);
    }
  });

  it('shares one groove across the bars of a pattern', () => {
    for (const seed of SEEDS) {
      const out = randomizeBars(bars(4), all(4), { tracks: DEFAULT_VISIBLE, rng: mulberry32(seed) });
      // Bars 2 and 3 are neither the opening (crash) nor the closing (fill) bar.
      expect(onOff(out[2], 'hhClosed'), `seed ${seed}`).toEqual(onOff(out[1], 'hhClosed'));
      expect(onOff(out[2], 'ride'), `seed ${seed}`).toEqual(onOff(out[1], 'ride'));
      expect(onOff(out[2], 'snare')[1][0]).toEqual(onOff(out[1], 'snare')[1][0]);
    }
  });

  it('works with only a few tracks and does nothing with none', () => {
    const tracks = new Set<TrackId>(['kick', 'snare']);
    const [bar] = randomizeBars(bars(1), [0], { tracks, rng: mulberry32(3) });
    expect(bar.beats[0].cells.kick[0]).toBeGreaterThan(0);
    expect(TRACK_IDS.filter((t) => !tracks.has(t)).every((t) => bar.beats.every((b) => b.cells[t].every((v) => v === 0)))).toBe(true);

    const src = bars(1);
    expect(randomizeBars(src, [0], { tracks: new Set(), rng: mulberry32(3) })[0]).toBe(src[0]);
  });
});
