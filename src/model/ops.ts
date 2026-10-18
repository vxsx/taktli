import { produce, type Draft } from 'immer';
import { cloneBar, createBar, createPattern, newId, nextPatternName } from './factory';
import { randomizeBars as generate, type Rng } from './randomize';
import { clamp, clampVelocity, convertCells } from './timing';
import { TRACK_IDS } from './tracks';
import type { Bar, KitName, Pattern, Project, Subdivision, TrackId, Velocity } from './types';

export const MIN_BPM = 40;
export const MAX_BPM = 240;
const MAX_PATTERN_NAME = 24;
const MAX_PROJECT_NAME = 60;

function editPattern(p: Project, patternId: string, fn: (pat: Draft<Pattern>) => void): Project {
  return produce(p, (d) => {
    const pat = d.patterns.find((x) => x.id === patternId);
    if (pat) fn(pat);
  });
}

function editBar(p: Project, patternId: string, barIndex: number, fn: (bar: Draft<Bar>) => void): Project {
  return editPattern(p, patternId, (pat) => {
    const bar = pat.bars[barIndex];
    if (bar) fn(bar);
  });
}

function moveItem<T>(arr: T[], from: number, to: number): void {
  const [item] = arr.splice(from, 1);
  arr.splice(to, 0, item);
}

// ---- notes ----

export function setVelocity(
  p: Project, patternId: string, barIndex: number, beat: number, track: TrackId, cell: number, velocity: Velocity,
): Project {
  const v = clampVelocity(velocity);
  return editBar(p, patternId, barIndex, (bar) => {
    const cells = bar.beats[beat]?.cells[track];
    if (cells && cell >= 0 && cell < cells.length && cells[cell] !== v) cells[cell] = v;
  });
}

export function setBeatDiv(p: Project, patternId: string, barIndex: number, beat: number, div: Subdivision): Project {
  return editBar(p, patternId, barIndex, (bar) => {
    const b = bar.beats[beat];
    if (!b || b.div === div) return;
    for (const t of TRACK_IDS) b.cells[t] = convertCells(b.cells[t], b.div, div);
    b.div = div;
  });
}

export function clearRow(p: Project, patternId: string, barIndex: number, track: TrackId): Project {
  return editBar(p, patternId, barIndex, (bar) => {
    for (const b of bar.beats) {
      if (b.cells[track].some((v) => v !== 0)) b.cells[track] = new Array<Velocity>(b.div).fill(0);
    }
  });
}

// ---- bars ----

export function clearBar(p: Project, patternId: string, barIndex: number): Project {
  return editBar(p, patternId, barIndex, (bar) => {
    for (const b of bar.beats) {
      for (const t of TRACK_IDS) {
        if (b.cells[t].some((v) => v !== 0)) b.cells[t] = new Array<Velocity>(b.div).fill(0);
      }
    }
  });
}

export function addBar(p: Project, patternId: string, bar: Bar = createBar()): Project {
  return editPattern(p, patternId, (pat) => {
    pat.bars.push(bar);
  });
}

export function insertBarAfter(p: Project, patternId: string, barIndex: number, bar: Bar = createBar()): Project {
  return editPattern(p, patternId, (pat) => {
    if (barIndex < 0 || barIndex >= pat.bars.length) return;
    pat.bars.splice(barIndex + 1, 0, bar);
  });
}

export function duplicateBar(p: Project, patternId: string, barIndex: number, id: string = newId()): Project {
  const pat = p.patterns.find((x) => x.id === patternId);
  const src = pat?.bars[barIndex];
  if (!src) return p;
  return insertBarAfter(p, patternId, barIndex, cloneBar(src, id));
}

export function deleteBar(p: Project, patternId: string, barIndex: number): Project {
  return editPattern(p, patternId, (pat) => {
    if (pat.bars.length <= 1 || barIndex < 0 || barIndex >= pat.bars.length) return;
    pat.bars.splice(barIndex, 1);
  });
}

export function moveBar(p: Project, patternId: string, from: number, to: number): Project {
  return editPattern(p, patternId, (pat) => {
    const n = pat.bars.length;
    if (from === to || from < 0 || to < 0 || from >= n || to >= n) return;
    moveItem(pat.bars, from, to);
  });
}

/** Paste: copies `source`'s beats into the target bar, keeping the target's id. */
export function replaceBarContents(p: Project, patternId: string, barIndex: number, source: Bar): Project {
  const copy = cloneBar(source);
  return editBar(p, patternId, barIndex, (bar) => {
    bar.beats = copy.beats;
  });
}

/** Rolls a new groove into the bars at `indices`. Only visible tracks change, so nothing appears off-screen. */
export function randomizeBars(p: Project, patternId: string, indices: readonly number[], rng?: Rng): Project {
  const pat = p.patterns.find((x) => x.id === patternId);
  if (!pat) return p;
  const tracks = new Set(TRACK_IDS.filter((t) => !p.tracks[t].hidden));
  const bars = generate(pat.bars, indices, { tracks, rng });
  if (bars === pat.bars) return p;
  return editPattern(p, patternId, (d) => {
    d.bars = bars;
  });
}

// ---- patterns ----

export function addPattern(p: Project, id: string): Project {
  return produce(p, (d) => {
    d.patterns.push(createPattern(nextPatternName(d.patterns.map((x) => x.name)), id));
  });
}

export function duplicatePattern(p: Project, patternId: string, id: string): Project {
  const index = p.patterns.findIndex((x) => x.id === patternId);
  if (index < 0) return p;
  const src = p.patterns[index];
  const copy: Pattern = {
    id,
    name: nextPatternName(p.patterns.map((x) => x.name)),
    swing: src.swing,
    bars: src.bars.map((b) => cloneBar(b)),
  };
  return produce(p, (d) => {
    d.patterns.splice(index + 1, 0, copy);
  });
}

export function renamePattern(p: Project, patternId: string, name: string): Project {
  const clean = name.trim().slice(0, MAX_PATTERN_NAME);
  if (!clean) return p;
  return editPattern(p, patternId, (pat) => {
    if (pat.name !== clean) pat.name = clean;
  });
}

export function deletePattern(p: Project, patternId: string): Project {
  if (p.patterns.length <= 1 || !p.patterns.some((x) => x.id === patternId)) return p;
  return produce(p, (d) => {
    d.patterns = d.patterns.filter((x) => x.id !== patternId);
    d.song = d.song.filter((s) => s.patternId !== patternId);
  });
}

export function setSwing(p: Project, patternId: string, swing: number): Project {
  const s = clamp(Math.round(swing), 0, 100);
  return editPattern(p, patternId, (pat) => {
    if (pat.swing !== s) pat.swing = s;
  });
}

// ---- song ----

const hasPattern = (p: Project, patternId: string) => p.patterns.some((x) => x.id === patternId);

export function appendSongStep(p: Project, patternId: string, id: string = newId()): Project {
  if (!hasPattern(p, patternId)) return p;
  return produce(p, (d) => {
    d.song.push({ id, patternId });
  });
}

export function insertSongStep(p: Project, index: number, patternId: string, id: string = newId()): Project {
  if (!hasPattern(p, patternId)) return p;
  return produce(p, (d) => {
    d.song.splice(clamp(index, 0, d.song.length), 0, { id, patternId });
  });
}

export function duplicateSongStep(p: Project, stepId: string, id: string = newId()): Project {
  const index = p.song.findIndex((s) => s.id === stepId);
  if (index < 0) return p;
  return insertSongStep(p, index + 1, p.song[index].patternId, id);
}

export function removeSongStep(p: Project, stepId: string): Project {
  if (!p.song.some((s) => s.id === stepId)) return p;
  return produce(p, (d) => {
    d.song = d.song.filter((s) => s.id !== stepId);
  });
}

export function moveSongStep(p: Project, from: number, to: number): Project {
  const n = p.song.length;
  if (from === to || from < 0 || to < 0 || from >= n || to >= n) return p;
  return produce(p, (d) => {
    moveItem(d.song, from, to);
  });
}

export function setSongStepPattern(p: Project, stepId: string, patternId: string): Project {
  if (!hasPattern(p, patternId)) return p;
  return produce(p, (d) => {
    const step = d.song.find((s) => s.id === stepId);
    if (step && step.patternId !== patternId) step.patternId = patternId;
  });
}

// ---- project settings ----

export function setBpm(p: Project, bpm: number): Project {
  const v = clamp(Math.round(bpm), MIN_BPM, MAX_BPM);
  return v === p.bpm ? p : produce(p, (d) => { d.bpm = v; });
}

export function setProjectName(p: Project, name: string): Project {
  const clean = name.trim().slice(0, MAX_PROJECT_NAME);
  if (!clean || clean === p.name) return p;
  return produce(p, (d) => { d.name = clean; });
}

export function setKit(p: Project, kit: KitName): Project {
  return kit === p.kit ? p : produce(p, (d) => { d.kit = kit; });
}

export function setTrackMuted(p: Project, track: TrackId, muted: boolean): Project {
  return produce(p, (d) => { d.tracks[track].muted = muted; });
}

export function setTrackHidden(p: Project, track: TrackId, hidden: boolean): Project {
  return produce(p, (d) => { d.tracks[track].hidden = hidden; });
}
