import { describe, expect, it } from 'vitest';
import { createBar, createBeat, createDemoProject, createProject } from './factory';
import { projectProblems } from './invariants';
import * as ops from './ops';
import type { Project } from './types';

function setup(): { p: Project; pid: string } {
  const p = createProject();
  return { p, pid: p.patterns[0].id };
}
const valid = (p: Project) => expect(projectProblems(p)).toEqual([]);

describe('note ops', () => {
  it('sets, clamps and clears velocities immutably', () => {
    const { p, pid } = setup();
    const a = ops.setVelocity(p, pid, 0, 1, 'snare', 0, 200);
    expect(a.patterns[0].bars[0].beats[1].cells.snare[0]).toBe(127);
    expect(p.patterns[0].bars[0].beats[1].cells.snare[0]).toBe(0);
    const b = ops.setVelocity(a, pid, 0, 1, 'snare', 0, 0);
    expect(b.patterns[0].bars[0].beats[1].cells.snare[0]).toBe(0);
    valid(b);
  });

  it('returns the same reference for no-op edits and bad coordinates', () => {
    const { p, pid } = setup();
    expect(ops.setVelocity(p, pid, 0, 0, 'kick', 0, 0)).toBe(p);
    expect(ops.setVelocity(p, pid, 5, 0, 'kick', 0, 100)).toBe(p);
    expect(ops.setVelocity(p, pid, 0, 0, 'kick', 9, 100)).toBe(p);
    expect(ops.setVelocity(p, 'nope', 0, 0, 'kick', 0, 100)).toBe(p);
  });

  it('changes a beat subdivision and remaps notes', () => {
    const { p, pid } = setup();
    const a = ops.setVelocity(p, pid, 0, 3, 'snare', 3, 90);
    const b = ops.setBeatDiv(a, pid, 0, 3, 3);
    expect(b.patterns[0].bars[0].beats[3].div).toBe(3);
    expect(b.patterns[0].bars[0].beats[3].cells.snare).toEqual([0, 0, 90]);
    expect(b.patterns[0].bars[0].beats[3].cells.kick).toEqual([0, 0, 0]);
    valid(b);
    expect(ops.setBeatDiv(b, pid, 0, 3, 3)).toBe(b);
  });

  it('clears a row across all beats', () => {
    const { p, pid } = setup();
    let a = ops.setVelocity(p, pid, 0, 0, 'kick', 0, 100);
    a = ops.setVelocity(a, pid, 0, 2, 'kick', 2, 100);
    a = ops.setVelocity(a, pid, 0, 2, 'snare', 2, 100);
    const b = ops.clearRow(a, pid, 0, 'kick');
    expect(b.patterns[0].bars[0].beats.every((bt) => bt.cells.kick.every((v) => v === 0))).toBe(true);
    expect(b.patterns[0].bars[0].beats[2].cells.snare[2]).toBe(100);
  });
});

describe('bar ops', () => {
  it('adds, inserts, duplicates, moves and deletes bars', () => {
    const { p, pid } = setup();
    const first = p.patterns[0].bars[0].id;
    let a = ops.setVelocity(p, pid, 0, 0, 'kick', 0, 100);
    a = ops.addBar(a, pid);
    expect(a.patterns[0].bars).toHaveLength(2);
    a = ops.duplicateBar(a, pid, 0, 'dup');
    expect(a.patterns[0].bars.map((b) => b.id)[1]).toBe('dup');
    expect(a.patterns[0].bars[1].beats[0].cells.kick[0]).toBe(100);
    a = ops.insertBarAfter(a, pid, 0, createBar('ins'));
    expect(a.patterns[0].bars.map((b) => b.id).slice(0, 3)).toEqual([first, 'ins', 'dup']);
    a = ops.moveBar(a, pid, 0, 3);
    expect(a.patterns[0].bars[3].id).toBe(first);
    a = ops.deleteBar(a, pid, 3);
    expect(a.patterns[0].bars.map((b) => b.id)).not.toContain(first);
    valid(a);
  });

  it('never deletes the last bar', () => {
    const { p, pid } = setup();
    expect(ops.deleteBar(p, pid, 0)).toBe(p);
  });

  it('ignores out-of-range moves', () => {
    const { p, pid } = setup();
    expect(ops.moveBar(p, pid, 0, 4)).toBe(p);
  });

  it('pastes bar contents but keeps the target bar id', () => {
    const { p, pid } = setup();
    const source = createBar('src');
    source.beats[1] = createBeat(3);
    source.beats[1].cells.tom1[1] = 77;
    const target = p.patterns[0].bars[0].id;
    const a = ops.replaceBarContents(p, pid, 0, source);
    expect(a.patterns[0].bars[0].id).toBe(target);
    expect(a.patterns[0].bars[0].beats[1].div).toBe(3);
    expect(a.patterns[0].bars[0].beats[1].cells.tom1[1]).toBe(77);
    source.beats[1].cells.tom1[1] = 1;
    expect(a.patterns[0].bars[0].beats[1].cells.tom1[1]).toBe(77);
    valid(a);
  });

  it('clears notes but keeps subdivisions', () => {
    const { p, pid } = setup();
    let a = ops.setBeatDiv(p, pid, 0, 2, 6);
    a = ops.setVelocity(a, pid, 0, 2, 'ride', 4, 60);
    a = ops.clearBar(a, pid, 0);
    expect(a.patterns[0].bars[0].beats[2].div).toBe(6);
    expect(a.patterns[0].bars[0].beats[2].cells.ride).toEqual([0, 0, 0, 0, 0, 0]);
  });
});

describe('pattern ops', () => {
  it('adds patterns with the next free name', () => {
    const { p } = setup();
    const a = ops.addPattern(p, 'b');
    expect(a.patterns.map((x) => [x.id, x.name])[1]).toEqual(['b', 'B']);
  });

  it('duplicates a pattern after the source with fresh bar ids', () => {
    const p = createDemoProject();
    const src = p.patterns[0];
    const a = ops.duplicatePattern(p, src.id, 'copy');
    expect(a.patterns[1].id).toBe('copy');
    expect(a.patterns[1].name).toBe('C');
    expect(a.patterns[1].bars.map((b) => b.beats)).toEqual(src.bars.map((b) => b.beats));
    expect(a.patterns[1].bars[0].id).not.toBe(src.bars[0].id);
    valid(a);
  });

  it('renames with trimming and ignores empty names', () => {
    const { p, pid } = setup();
    expect(ops.renamePattern(p, pid, '  Verse  ').patterns[0].name).toBe('Verse');
    expect(ops.renamePattern(p, pid, '   ')).toBe(p);
    expect(ops.renamePattern(p, pid, 'x'.repeat(40)).patterns[0].name).toHaveLength(24);
  });

  it('deletes a pattern and its song steps, but never the last pattern', () => {
    const p = createDemoProject();
    const b = p.patterns[1];
    const a = ops.deletePattern(p, b.id);
    expect(a.patterns.map((x) => x.name)).toEqual(['A']);
    expect(a.song.every((s) => s.patternId !== b.id)).toBe(true);
    expect(ops.deletePattern(a, a.patterns[0].id)).toBe(a);
    valid(a);
  });

  it('clamps swing', () => {
    const { p, pid } = setup();
    expect(ops.setSwing(p, pid, 140).patterns[0].swing).toBe(100);
    expect(ops.setSwing(p, pid, 33.4).patterns[0].swing).toBe(33);
  });
});

describe('song ops', () => {
  it('appends, inserts, duplicates, moves, retargets and removes steps', () => {
    const p = createDemoProject();
    const [a, b] = p.patterns;
    let s = ops.appendSongStep(p, a.id, 's3');
    expect(s.song.map((x) => x.id).at(-1)).toBe('s3');
    s = ops.insertSongStep(s, 0, b.id, 's0');
    expect(s.song[0].id).toBe('s0');
    s = ops.duplicateSongStep(s, 's0', 's0b');
    expect(s.song.map((x) => x.id).slice(0, 2)).toEqual(['s0', 's0b']);
    s = ops.moveSongStep(s, 0, s.song.length - 1);
    expect(s.song.at(-1)!.id).toBe('s0');
    s = ops.setSongStepPattern(s, 's0', a.id);
    expect(s.song.at(-1)!.patternId).toBe(a.id);
    s = ops.removeSongStep(s, 's0');
    expect(s.song.map((x) => x.id)).not.toContain('s0');
    valid(s);
  });

  it('refuses steps for unknown patterns', () => {
    const p = createDemoProject();
    expect(ops.appendSongStep(p, 'nope')).toBe(p);
    expect(ops.setSongStepPattern(p, p.song[0].id, 'nope')).toBe(p);
  });
});

describe('project settings', () => {
  it('clamps and rounds bpm', () => {
    const { p } = setup();
    expect(ops.setBpm(p, 10).bpm).toBe(40);
    expect(ops.setBpm(p, 999).bpm).toBe(240);
    expect(ops.setBpm(p, 120.6).bpm).toBe(121);
  });

  it('sets name, kit, mute and hide', () => {
    const { p } = setup();
    expect(ops.setProjectName(p, ' Song ').name).toBe('Song');
    expect(ops.setProjectName(p, '')).toBe(p);
    expect(ops.setKit(p, 'electronic').kit).toBe('electronic');
    expect(ops.setTrackMuted(p, 'kick', true).tracks.kick.muted).toBe(true);
    expect(ops.setTrackHidden(p, 'tom2', true).tracks.tom2.hidden).toBe(true);
  });
});

describe('randomize ops', () => {
  const rng = () => 0.42;

  it('fills the chosen bars with a groove on the visible tracks only', () => {
    const { p, pid } = setup();
    const two = ops.addBar(p, pid);
    const hidden = ops.setVelocity(ops.setTrackHidden(two, 'ride', true), pid, 0, 0, 'ride', 1, 90);
    const a = ops.randomizeBars(hidden, pid, [0], rng);
    const [bar0, bar1] = a.patterns[0].bars;
    expect(bar0.beats[0].cells.kick[0]).toBeGreaterThan(0);
    expect(bar0.beats.map((b) => b.cells.ride)).toEqual(hidden.patterns[0].bars[0].beats.map((b) => b.cells.ride));
    expect(bar0.beats.flatMap((b) => b.cells.hhPedal).every((v) => v === 0)).toBe(true);
    expect(bar1).toBe(hidden.patterns[0].bars[1]);
    valid(a);
  });

  it('returns the same project when nothing can be written', () => {
    const { p, pid } = setup();
    expect(ops.randomizeBars(p, 'nope', [0], rng)).toBe(p);
    expect(ops.randomizeBars(p, pid, [3], rng)).toBe(p);
  });
});
