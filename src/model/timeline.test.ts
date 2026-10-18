import { describe, expect, it } from 'vitest';
import { createDemoProject, createProject } from './factory';
import * as ops from './ops';
import {
  barNotes, buildTimeline, findPosition, nextRef, notesAtTick, startRef, type TimelineOptions,
} from './timeline';

const opts = (o: Partial<TimelineOptions> & { patternId: string }): TimelineOptions => ({
  mode: 'pattern', barIndex: 0, loopBar: false, ...o,
});

describe('buildTimeline', () => {
  const p = createDemoProject();
  const [a, b] = p.patterns;

  it('lists all bars of the current pattern in pattern mode', () => {
    expect(buildTimeline(p, opts({ patternId: b.id }))).toEqual([
      { patternId: b.id, barIndex: 0, stepIndex: -1 },
      { patternId: b.id, barIndex: 1, stepIndex: -1 },
    ]);
  });

  it('lists only the edited bar when looping a bar, clamping the index', () => {
    expect(buildTimeline(p, opts({ patternId: a.id, barIndex: 1, loopBar: true }))).toEqual([
      { patternId: a.id, barIndex: 1, stepIndex: -1 },
    ]);
    expect(buildTimeline(p, opts({ patternId: a.id, barIndex: 9, loopBar: true }))[0].barIndex).toBe(1);
  });

  it('concatenates song steps in song mode', () => {
    expect(buildTimeline(p, opts({ patternId: b.id, mode: 'song' }))).toEqual([
      { patternId: a.id, barIndex: 0, stepIndex: 0 },
      { patternId: a.id, barIndex: 1, stepIndex: 0 },
      { patternId: b.id, barIndex: 0, stepIndex: 1 },
      { patternId: b.id, barIndex: 1, stepIndex: 1 },
    ]);
  });

  it('falls back to the pattern when the song is empty', () => {
    const empty = createProject();
    const pid = empty.patterns[0].id;
    expect(buildTimeline(empty, opts({ patternId: pid, mode: 'song' }))).toEqual([{ patternId: pid, barIndex: 0, stepIndex: -1 }]);
  });

  it('falls back to the first pattern when the pattern id is unknown', () => {
    expect(buildTimeline(p, opts({ patternId: 'gone' }))[0].patternId).toBe(a.id);
  });
});

describe('cursor', () => {
  const p = createDemoProject();
  const [a, b] = p.patterns;

  it('starts at the edited bar in pattern mode and at the top in song mode', () => {
    expect(startRef(p, opts({ patternId: a.id, barIndex: 1 }))).toEqual({ patternId: a.id, barIndex: 1, stepIndex: -1 });
    expect(startRef(p, opts({ patternId: b.id, barIndex: 1, mode: 'song' }))).toEqual({ patternId: a.id, barIndex: 0, stepIndex: 0 });
  });

  it('advances and wraps around', () => {
    const tl = buildTimeline(p, opts({ patternId: a.id, mode: 'song' }));
    expect(nextRef(tl, tl[1])).toEqual(tl[2]);
    expect(nextRef(tl, tl[3])).toEqual(tl[0]);
  });

  it('jumps to the first bar when the current bar vanished', () => {
    const tl = buildTimeline(p, opts({ patternId: a.id }));
    expect(findPosition(tl, { patternId: a.id, barIndex: 7, stepIndex: -1 })).toBe(-1);
    expect(nextRef(tl, { patternId: a.id, barIndex: 7, stepIndex: -1 })).toEqual(tl[0]);
  });

  it('matches a bar ignoring stepIndex when the mode changed', () => {
    const tl = buildTimeline(p, opts({ patternId: a.id, mode: 'song' }));
    expect(findPosition(tl, { patternId: b.id, barIndex: 0, stepIndex: -1 })).toBe(2);
  });

  it('moves to the newly selected bar when looping a bar', () => {
    const tl = buildTimeline(p, opts({ patternId: a.id, barIndex: 1, loopBar: true }));
    expect(nextRef(tl, { patternId: a.id, barIndex: 0, stepIndex: -1 })).toEqual({ patternId: a.id, barIndex: 1, stepIndex: -1 });
  });
});

describe('notes', () => {
  it('returns notes at exact cell ticks in track order', () => {
    const p = createDemoProject();
    const ref = { patternId: p.patterns[0].id, barIndex: 0, stepIndex: -1 };
    expect(notesAtTick(p, ref, 0)).toEqual([
      { track: 'crash', tick: 0, offset: 0, velocity: 115 },
      { track: 'kick', tick: 0, offset: 0, velocity: 112 },
    ]);
    expect(notesAtTick(p, ref, 1)).toEqual([]);
  });

  it('applies swing offsets to 16th off-beats', () => {
    let p = createProject();
    const pid = p.patterns[0].id;
    p = ops.setVelocity(p, pid, 0, 0, 'hhClosed', 1, 80);
    p = ops.setSwing(p, pid, 100);
    expect(notesAtTick(p, { patternId: pid, barIndex: 0, stepIndex: -1 }, 3)).toEqual([
      { track: 'hhClosed', tick: 3, offset: 1.5, velocity: 80 },
    ]);
  });

  it('reads triplet beats on their own ticks', () => {
    const p = createDemoProject();
    const ref = { patternId: p.patterns[1].id, barIndex: 1, stepIndex: -1 };
    expect(notesAtTick(p, ref, 40)).toEqual([{ track: 'tom1', tick: 40, offset: 0, velocity: 100 }]);
    expect(notesAtTick(p, ref, 39)).toEqual([]);
  });

  it('skips muted tracks', () => {
    const p = ops.setTrackMuted(createDemoProject(), 'kick', true);
    const ref = { patternId: p.patterns[0].id, barIndex: 0, stepIndex: -1 };
    expect(notesAtTick(p, ref, 0).map((n) => n.track)).toEqual(['crash']);
  });

  it('plays only soloed tracks, and a muted track stays silent even when soloed', () => {
    const p = createDemoProject();
    const ref = { patternId: p.patterns[0].id, barIndex: 0, stepIndex: -1 };
    expect(notesAtTick(p, ref, 0, ['kick']).map((n) => n.track)).toEqual(['kick']);
    expect(notesAtTick(p, ref, 0, ['kick', 'crash']).map((n) => n.track)).toEqual(['crash', 'kick']);
    const muted = ops.setTrackMuted(p, 'kick', true);
    expect(notesAtTick(muted, ref, 0, ['kick', 'crash']).map((n) => n.track)).toEqual(['crash']);
  });

  it('returns nothing for missing bars or patterns', () => {
    const p = createDemoProject();
    expect(notesAtTick(p, { patternId: p.patterns[0].id, barIndex: 9, stepIndex: -1 }, 0)).toEqual([]);
    expect(notesAtTick(p, { patternId: 'gone', barIndex: 0, stepIndex: -1 }, 0)).toEqual([]);
  });

  it('collects a whole bar sorted by tick', () => {
    const p = createDemoProject();
    const notes = barNotes(p, { patternId: p.patterns[0].id, barIndex: 1, stepIndex: -1 });
    expect(notes).toHaveLength(15);
    expect(notes.map((n) => n.tick)).toEqual([...notes.map((n) => n.tick)].sort((x, y) => x - y));
  });
});
