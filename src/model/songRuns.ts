import { produce } from 'immer';
import { newId } from './factory';
import { clamp } from './timing';
import type { Project, SongStep } from './types';

/**
 * The song is stored as a flat list of steps; the arrange view shows consecutive steps of the same pattern
 * as one block repeated `count` times. These helpers edit the song block by block.
 */
export interface SongRun {
  /** Index of the block's first step in `project.song`. */
  start: number;
  count: number;
  patternId: string;
}

export interface RunLayout extends SongRun {
  /** First bar of the block on the song's bar ruler (0-based). */
  startBar: number;
  /** Bars in the whole block: pattern length × count. */
  bars: number;
  patternBars: number;
}

export const MAX_REPEAT = 16;

export function songRuns(song: readonly SongStep[]): SongRun[] {
  const runs: SongRun[] = [];
  song.forEach((step, i) => {
    const last = runs.at(-1);
    if (last && last.patternId === step.patternId) last.count += 1;
    else runs.push({ start: i, count: 1, patternId: step.patternId });
  });
  return runs;
}

export function arrangeSong(p: Project): { runs: RunLayout[]; totalBars: number; stepStartBar: number[] } {
  const barsOf = (patternId: string) => p.patterns.find((x) => x.id === patternId)?.bars.length ?? 0;
  const stepStartBar: number[] = [];
  let bar = 0;
  for (const step of p.song) {
    stepStartBar.push(bar);
    bar += barsOf(step.patternId);
  }
  const runs = songRuns(p.song).map((r) => {
    const patternBars = barsOf(r.patternId);
    return { ...r, startBar: stepStartBar[r.start], bars: patternBars * r.count, patternBars };
  });
  return { runs, totalBars: bar, stepStartBar };
}

function withRuns(p: Project, edit: (runs: SongStep[][]) => void): Project {
  const runs = songRuns(p.song).map((r) => p.song.slice(r.start, r.start + r.count));
  edit(runs);
  const song = runs.flat();
  return produce(p, (d) => {
    d.song = song;
  });
}

export function setRunRepeat(p: Project, runIndex: number, count: number): Project {
  const run = songRuns(p.song)[runIndex];
  const n = clamp(Math.round(count), 1, MAX_REPEAT);
  if (!run || run.count === n) return p;
  return withRuns(p, (runs) => {
    const steps = runs[runIndex];
    while (steps.length < n) steps.push({ id: newId(), patternId: run.patternId });
    steps.length = n;
  });
}

export function moveRun(p: Project, from: number, to: number): Project {
  const n = songRuns(p.song).length;
  if (from === to || from < 0 || to < 0 || from >= n || to >= n) return p;
  return withRuns(p, (runs) => {
    const [moved] = runs.splice(from, 1);
    runs.splice(to, 0, moved);
  });
}

export function removeRun(p: Project, runIndex: number): Project {
  if (!songRuns(p.song)[runIndex]) return p;
  return withRuns(p, (runs) => {
    runs.splice(runIndex, 1);
  });
}

export function setRunPattern(p: Project, runIndex: number, patternId: string): Project {
  const run = songRuns(p.song)[runIndex];
  if (!run || run.patternId === patternId || !p.patterns.some((x) => x.id === patternId)) return p;
  return withRuns(p, (runs) => {
    runs[runIndex] = runs[runIndex].map((s) => ({ ...s, patternId }));
  });
}
