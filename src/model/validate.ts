import { createBar, DEFAULT_BPM, defaultTrackSettings, emptyCells, newId, nextPatternName } from './factory';
import { MAX_BPM, MIN_BPM } from './ops';
import { clamp, clampVelocity, SUBDIVISIONS } from './timing';
import { TRACK_IDS } from './tracks';
import type { Bar, Beat, Pattern, Project, SongStep, Subdivision } from './types';

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

function parseBeat(x: unknown): Beat {
  const rawDiv = isObj(x) ? x.div : undefined;
  const div: Subdivision = SUBDIVISIONS.includes(rawDiv as Subdivision) ? (rawDiv as Subdivision) : 4;
  const cells = emptyCells(div);
  const rawCells = isObj(x) && isObj(x.cells) ? x.cells : {};
  for (const t of TRACK_IDS) {
    const arr = rawCells[t];
    if (!Array.isArray(arr)) continue;
    for (let i = 0; i < div; i++) cells[t][i] = clampVelocity(num(arr[i], 0));
  }
  return { div, cells };
}

export function parseBar(x: unknown, used: Set<string> = new Set()): Bar {
  const beats: unknown[] = isObj(x) && Array.isArray(x.beats) ? x.beats : [];
  return {
    id: uniqueId(isObj(x) ? x.id : undefined, used),
    beats: [parseBeat(beats[0]), parseBeat(beats[1]), parseBeat(beats[2]), parseBeat(beats[3])],
  };
}

/** Turns untrusted JSON into a valid Project, repairing what it can. Null if nothing usable. */
export function parseProject(data: unknown, now: number = Date.now()): Project | null {
  if (!isObj(data) || !Array.isArray(data.patterns)) return null;
  const used = new Set<string>();
  const patternIdMap = new Map<string, string>();
  const patterns: Pattern[] = [];

  for (const raw of data.patterns) {
    if (!isObj(raw)) continue;
    const originalId = str(raw.id);
    const id = uniqueId(raw.id, used);
    if (originalId && !patternIdMap.has(originalId)) patternIdMap.set(originalId, id);
    const bars = Array.isArray(raw.bars) ? raw.bars.map((b) => parseBar(b, used)) : [];
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
    version: 1,
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
