import { createBar, createBeat, DEFAULT_BPM, defaultTrackSettings, newId, nextPatternName } from './factory';
import { MAX_BPM, MIN_BPM } from './ops';
import { CELLS_PER_BEAT, clamp, clampVelocity, convertTriplets } from './timing';
import { TRACK_IDS } from './tracks';
import type { Bar, Beat, Pattern, Project, SongStep } from './types';

/** Filled in while parsing, for things the person should be told about. */
export interface ParseReport {
  /** An old triplet beat with notes in it was moved to the nearest 32nds. */
  tripletsConverted: boolean;
}

type Obj = Record<string, unknown>;
const isObj = (x: unknown): x is Obj => typeof x === 'object' && x !== null && !Array.isArray(x);
const str = (x: unknown): string => (typeof x === 'string' ? x.trim() : '');
const num = (x: unknown, fallback: number): number => (typeof x === 'number' && Number.isFinite(x) ? x : fallback);

function uniqueId(raw: unknown, used: Set<string>): string {
  let id = str(raw);
  while (!id || used.has(id)) id = newId();
  used.add(id);
  return id;
}

/** Reads a beat. Beats saved before triplets were removed (`div` 3 or 6) move to the nearest 32nds. */
function parseBeat(x: unknown, report?: ParseReport): Beat {
  const beat = createBeat();
  const rawCells = isObj(x) && isObj(x.cells) ? x.cells : {};
  const rawSplits = isObj(x) && isObj(x.splits) ? x.splits : {};
  const div = isObj(x) ? x.div : undefined;
  for (const t of TRACK_IDS) {
    const arr = rawCells[t];
    if (div === 3 || div === 6) {
      if (!Array.isArray(arr)) continue;
      const values = Array.from({ length: div }, (_, i) => clampVelocity(num(arr[i], 0)));
      if (report && values.some((v) => v > 0)) report.tripletsConverted = true;
      ({ cells: beat.cells[t], splits: beat.splits[t] } = convertTriplets(values, div));
      continue;
    }
    if (Array.isArray(arr)) for (let i = 0; i < CELLS_PER_BEAT; i++) beat.cells[t][i] = clampVelocity(num(arr[i], 0));
    const splits = rawSplits[t];
    if (Array.isArray(splits)) {
      for (let i = 0; i < CELLS_PER_BEAT; i++) {
        const v = splits[i];
        beat.splits[t][i] = typeof v === 'number' && Number.isFinite(v) ? clampVelocity(v) : null;
      }
    }
  }
  return beat;
}

export function parseBar(x: unknown, used: Set<string> = new Set(), report?: ParseReport): Bar {
  const beats: unknown[] = isObj(x) && Array.isArray(x.beats) ? x.beats : [];
  return {
    id: uniqueId(isObj(x) ? x.id : undefined, used),
    beats: [parseBeat(beats[0], report), parseBeat(beats[1], report), parseBeat(beats[2], report), parseBeat(beats[3], report)],
  };
}

/** Turns untrusted JSON into a valid Project, repairing what it can. Null if nothing usable. */
export function parseProject(data: unknown, now: number = Date.now(), report?: ParseReport): Project | null {
  if (!isObj(data) || !Array.isArray(data.patterns)) return null;
  const used = new Set<string>();
  const patternIdMap = new Map<string, string>();
  const patterns: Pattern[] = [];

  for (const raw of data.patterns) {
    if (!isObj(raw)) continue;
    const originalId = str(raw.id);
    const id = uniqueId(raw.id, used);
    if (originalId && !patternIdMap.has(originalId)) patternIdMap.set(originalId, id);
    const bars = Array.isArray(raw.bars) ? raw.bars.map((b) => parseBar(b, used, report)) : [];
    if (bars.length === 0) bars.push(createBar(uniqueId(undefined, used)));
    const name = str(raw.name).slice(0, 24) || nextPatternName(patterns.map((p) => p.name));
    patterns.push({ id, name, swing: clamp(Math.round(num(raw.swing, 0)), 0, 100), bars });
  }
  if (patterns.length === 0) return null;

  const song: SongStep[] = [];
  if (Array.isArray(data.song)) {
    for (const raw of data.song) {
      if (!isObj(raw)) continue;
      const patternId = patternIdMap.get(str(raw.patternId));
      if (patternId) song.push({ id: uniqueId(raw.id, used), patternId });
    }
  }

  const tracks = defaultTrackSettings();
  if (isObj(data.tracks)) {
    for (const t of TRACK_IDS) {
      const s = data.tracks[t];
      if (isObj(s)) tracks[t] = { muted: s.muted === true, hidden: s.hidden === true };
    }
  }

  return {
    version: 2,
    id: str(data.id) || newId(),
    name: str(data.name).slice(0, 60) || 'Untitled beat',
    bpm: clamp(Math.round(num(data.bpm, DEFAULT_BPM)), MIN_BPM, MAX_BPM),
    kit: data.kit === 'electronic' ? 'electronic' : 'acoustic',
    patterns,
    song,
    tracks,
    createdAt: num(data.createdAt, now),
    updatedAt: num(data.updatedAt, now),
  };
}
