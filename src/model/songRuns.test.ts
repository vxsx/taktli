import { describe, expect, it } from 'vitest';
import { createDemoProject } from './factory';
import * as ops from './ops';
import { arrangeSong, MAX_REPEAT, moveRun, removeRun, setRunPattern, setRunRepeat, songRuns } from './songRuns';
import type { Project } from './types';

/** Demo patterns A and B (2 bars each) plus a 1-bar pattern C, with the song spelled out by pattern name. */
function project(...song: string[]): Project {
  const p = ops.addPattern(createDemoProject(), 'pat-c');
  const id = (name: string) => p.patterns.find((x) => x.name === name)!.id;
  return { ...p, song: song.map((name, i) => ({ id: `s${i}`, patternId: id(name) })) };
}
const names = (p: Project) => p.song.map((s) => p.patterns.find((x) => x.id === s.patternId)!.name).join(' ');

describe('songRuns', () => {
  it('groups consecutive steps of the same pattern into one block', () => {
    const p = project('A', 'B', 'B', 'A');
    expect(songRuns(p.song).map(({ start, count }) => [start, count])).toEqual([[0, 1], [1, 2], [3, 1]]);
  });
});

describe('arrangeSong', () => {
  it('places each block on the bar ruler', () => {
    const a = arrangeSong(project('A', 'B', 'B', 'C'));
    expect(a.runs.map(({ startBar, bars, count }) => [startBar, bars, count])).toEqual([[0, 2, 1], [2, 4, 2], [6, 1, 1]]);
    expect(a.totalBars).toBe(7);
    expect(a.stepStartBar).toEqual([0, 2, 4, 6]);
  });

  it('is empty for an empty song', () => {
    expect(arrangeSong(project())).toMatchObject({ runs: [], totalBars: 0, stepStartBar: [] });
  });
});

describe('setRunRepeat', () => {
  it('adds and removes repeats of a block', () => {
    let p = setRunRepeat(project('A', 'B', 'C'), 1, 3);
    expect(names(p)).toBe('A B B B C');
    expect(new Set(p.song.map((s) => s.id)).size).toBe(5);
    p = setRunRepeat(p, 1, 1);
    expect(names(p)).toBe('A B C');
  });

  it(`keeps the count between 1 and ${MAX_REPEAT}`, () => {
    expect(names(setRunRepeat(project('A', 'B'), 0, 0))).toBe('A B');
    expect(songRuns(setRunRepeat(project('A'), 0, 99).song)[0].count).toBe(MAX_REPEAT);
  });
});

describe('moveRun', () => {
  it('moves a whole block, repeats included', () => {
    expect(names(moveRun(project('A', 'B', 'B', 'C'), 1, 2))).toBe('A C B B');
    expect(names(moveRun(project('A', 'B', 'B', 'C'), 2, 0))).toBe('C A B B');
  });

  it('lets neighbouring blocks of the same pattern merge', () => {
    const p = moveRun(project('A', 'B', 'A'), 1, 2);
    expect(names(p)).toBe('A A B');
    expect(songRuns(p.song).map((r) => r.count)).toEqual([2, 1]);
  });
});

describe('removeRun and setRunPattern', () => {
  it('removes every repeat of a block', () => {
    expect(names(removeRun(project('A', 'B', 'B', 'C'), 1))).toBe('A C');
  });

  it('switches every repeat of a block to another pattern', () => {
    expect(names(setRunPattern(project('A', 'B', 'B'), 1, 'pat-c'))).toBe('A C C');
  });
});
