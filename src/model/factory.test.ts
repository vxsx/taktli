import { describe, expect, it } from 'vitest';
import {
  cloneBar, createBar, createDemoProject, createPattern, createProject, nextPatternName,
} from './factory';
import { projectProblems } from './invariants';
import { TRACK_IDS } from './tracks';

describe('factory', () => {
  it('creates an empty 4-beat bar of 16ths', () => {
    const bar = createBar();
    expect(bar.beats).toHaveLength(4);
    for (const beat of bar.beats) {
      expect(beat.div).toBe(4);
      for (const t of TRACK_IDS) expect(beat.cells[t]).toEqual([0, 0, 0, 0]);
    }
  });

  it('clones bars deeply with a new id', () => {
    const bar = createBar();
    bar.beats[0].cells.kick[0] = 100;
    const copy = cloneBar(bar);
    expect(copy.id).not.toBe(bar.id);
    expect(copy.beats).toEqual(bar.beats);
    copy.beats[0].cells.kick[0] = 1;
    expect(bar.beats[0].cells.kick[0]).toBe(100);
  });

  it('creates a valid empty project', () => {
    const p = createProject('Test', 1000);
    expect(p.name).toBe('Test');
    expect(p.bpm).toBe(100);
    expect(p.kit).toBe('acoustic');
    expect(p.patterns.map((x) => x.name)).toEqual(['A']);
    expect(p.song).toEqual([]);
    expect(p.createdAt).toBe(1000);
    expect(projectProblems(p)).toEqual([]);
  });

  it('names patterns A..Z then AA, AB', () => {
    expect(nextPatternName([])).toBe('A');
    expect(nextPatternName(['A', 'B'])).toBe('C');
    expect(nextPatternName(['B'])).toBe('A');
    const az = Array.from({ length: 26 }, (_, i) => String.fromCharCode(65 + i));
    expect(nextPatternName(az)).toBe('AA');
    expect(nextPatternName([...az, 'AA'])).toBe('AB');
  });

  it('builds a valid demo project with a triplet fill and a song', () => {
    const p = createDemoProject(5);
    expect(projectProblems(p)).toEqual([]);
    expect(p.bpm).toBe(96);
    expect(p.patterns.map((x) => [x.name, x.bars.length])).toEqual([['A', 2], ['B', 2]]);
    expect(p.song.map((s) => p.patterns.find((x) => x.id === s.patternId)!.name)).toEqual(['A', 'B']);
    expect(p.patterns[1].bars[1].beats[3].div).toBe(3);
  });

  it('gives every id in a project a unique value', () => {
    const p = createDemoProject();
    const ids = [p.id, ...p.patterns.map((x) => x.id), ...p.patterns.flatMap((x) => x.bars.map((b) => b.id)), ...p.song.map((s) => s.id)];
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('hides pedal hi-hat and cross-stick by default so the grid fits short phone screens', () => {
    const p = createProject();
    expect(Object.entries(p.tracks).filter(([, s]) => s.hidden).map(([t]) => t)).toEqual(['hhPedal', 'crossStick']);
    expect(Object.values(p.tracks).every((s) => !s.muted)).toBe(true);
    expect(createDemoProject().tracks.hhPedal.hidden).toBe(true);
  });

  it('creates patterns with one bar and no swing', () => {
    const pat = createPattern('Q');
    expect(pat.bars).toHaveLength(1);
    expect(pat.swing).toBe(0);
  });
});

describe('projectProblems', () => {
  it('reports wrong cell lengths, bad velocities, dangling song steps and bad bpm', () => {
    const p = createProject();
    p.patterns[0].bars[0].beats[0].cells.kick = [0, 0, 0];
    p.patterns[0].bars[0].beats[1].cells.snare[0] = 300;
    p.song.push({ id: 'x', patternId: 'missing' });
    p.bpm = 10;
    const problems = projectProblems(p);
    expect(problems).toHaveLength(4);
  });
});
