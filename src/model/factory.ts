import { TRACK_IDS } from './tracks';
import { CELLS_PER_BEAT } from './timing';
import type { Bar, Beat, Pattern, Project, Split, TrackId, TrackSettings, Velocity } from './types';

export const DEFAULT_BPM = 100;

/** Short unique id. Works without a secure context (unlike crypto.randomUUID). */
export function newId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
}

export function emptyCells(): Record<TrackId, Velocity[]> {
  const cells = {} as Record<TrackId, Velocity[]>;
  for (const id of TRACK_IDS) cells[id] = new Array<Velocity>(CELLS_PER_BEAT).fill(0);
  return cells;
}

export function emptySplits(): Record<TrackId, Split[]> {
  const splits = {} as Record<TrackId, Split[]>;
  for (const id of TRACK_IDS) splits[id] = new Array<Split>(CELLS_PER_BEAT).fill(null);
  return splits;
}

export function createBeat(): Beat {
  return { cells: emptyCells(), splits: emptySplits() };
}

export function createBar(id: string = newId()): Bar {
  return { id, beats: [createBeat(), createBeat(), createBeat(), createBeat()] };
}

export function cloneBar(bar: Bar, id: string = newId()): Bar {
  const beats = bar.beats.map((b) => {
    const cells = {} as Record<TrackId, Velocity[]>;
    const splits = {} as Record<TrackId, Split[]>;
    for (const t of TRACK_IDS) {
      cells[t] = [...b.cells[t]];
      splits[t] = [...b.splits[t]];
    }
    return { cells, splits };
  }) as Bar['beats'];
  return { id, beats };
}

export function createPattern(name: string, id: string = newId()): Pattern {
  return { id, name, swing: 0, bars: [createBar()] };
}

/** Less common voices start hidden so the remaining rows fit a phone held in landscape. */
const HIDDEN_BY_DEFAULT: ReadonlySet<TrackId> = new Set(['hhPedal', 'crossStick']);

export function defaultTrackSettings(): Record<TrackId, TrackSettings> {
  const s = {} as Record<TrackId, TrackSettings>;
  for (const id of TRACK_IDS) s[id] = { muted: false, hidden: HIDDEN_BY_DEFAULT.has(id) };
  return s;
}

export function createProject(name = 'Untitled beat', now = Date.now()): Project {
  return {
    version: 2,
    id: newId(),
    name,
    bpm: DEFAULT_BPM,
    kit: 'acoustic',
    patterns: [createPattern('A')],
    song: [],
    tracks: defaultTrackSettings(),
    createdAt: now,
    updatedAt: now,
  };
}

function indexToLetters(n: number): string {
  let s = '';
  let k = n + 1;
  while (k > 0) {
    const r = (k - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    k = Math.floor((k - 1) / 26);
  }
  return s;
}

/** First unused name in A..Z, AA, AB, … */
export function nextPatternName(existing: readonly string[]): string {
  const taken = new Set(existing);
  for (let n = 0; ; n++) {
    const name = indexToLetters(n);
    if (!taken.has(name)) return name;
  }
}

function hit(bar: Bar, beat: number, track: TrackId, cell: number, v: Velocity): void {
  bar.beats[beat].cells[track][cell] = v;
}

function rockBar(withCrash: boolean): Bar {
  const bar = createBar();
  for (let b = 0; b < 4; b++) {
    if (!(withCrash && b === 0)) hit(bar, b, 'hhClosed', 0, 105);
    hit(bar, b, 'hhClosed', 2, 75);
  }
  if (withCrash) hit(bar, 0, 'crash', 0, 115);
  hit(bar, 1, 'snare', 0, 118);
  hit(bar, 3, 'snare', 0, 118);
  hit(bar, 2, 'snare', 3, 35);
  hit(bar, 0, 'kick', 0, 112);
  hit(bar, 1, 'kick', 2, 92);
  hit(bar, 2, 'kick', 0, 110);
  hit(bar, 2, 'kick', 2, 88);
  return bar;
}

export function createDemoProject(now = Date.now()): Project {
  const p = createProject('Demo groove', now);
  p.bpm = 96;
  const a = p.patterns[0];
  a.bars = [rockBar(true), rockBar(false)];

  // A ghost pickup a 32nd before the backbeat on 2.
  const groove = rockBar(false);
  groove.beats[0].splits.snare[3] = 38;

  // Beat 4 fill: a 32nd double on the snare, then down the toms.
  const fill = rockBar(false);
  const last = createBeat();
  last.cells.snare[0] = 105;
  last.splits.snare[0] = 70;
  last.cells.tom1[1] = 100;
  last.cells.tom2[2] = 104;
  last.cells.floorTom[3] = 112;
  last.cells.kick[0] = 110;
  fill.beats[3] = last;
  const b = createPattern('B');
  b.bars = [groove, fill];
  p.patterns.push(b);

  p.song = [
    { id: newId(), patternId: a.id },
    { id: newId(), patternId: b.id },
  ];
  return p;
}
