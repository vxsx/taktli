import type { Beat, Half, Split, TrackId, Velocity } from './types';

/** One tick is a 32nd note: each 16th cell has a tick for itself and one for its right half. */
export const TICKS_PER_BEAT = 8;
export const BEATS_PER_BAR = 4;
export const TICKS_PER_BAR = TICKS_PER_BEAT * BEATS_PER_BAR;
export const CELLS_PER_BEAT = 4;
export const DEFAULT_VELOCITY = 100;
/** New notes in a right half start as ghost notes. */
export const GHOST_VELOCITY = 40;
export const ACCENT_MIN = 110;
export const GHOST_MAX = 45;
/** Swing 100% delays a 16th off-beat by this many ticks, an 8th of a beat (MPC "75%"). */
export const MAX_SWING_TICKS = 1;

export function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

export function tickOf(beat: number, cell: number, half: Half): number {
  return beat * TICKS_PER_BEAT + cell * 2 + half;
}

/** A cell's velocity, or its right half's; a whole cell has no right half. */
export function velocityAt(beat: Beat, track: TrackId, cell: number, half: Half): Velocity {
  return half === 0 ? beat.cells[track][cell] : (beat.splits[track][cell] ?? 0);
}

/**
 * Swing delay in ticks. Off-beat 16ths (cells 1 and 3) move later by the swing amount. A right half sits midway
 * between its cell's start and the next cell's, and exactly one of those two moves, so it moves by half as much.
 */
export function swingOffset(cell: number, half: Half, swing: number): number {
  const s = (MAX_SWING_TICKS * clamp(swing, 0, 100)) / 100;
  if (half === 1) return s / 2;
  return cell % 2 === 1 ? s : 0;
}

export function clampVelocity(v: number): Velocity {
  return clamp(Math.round(v), 0, 127);
}

export function velocityToGain(v: Velocity): number {
  return Math.pow(clampVelocity(v) / 127, 1.6);
}

/** One track's notes from an old triplet beat, moved to the nearest 32nds; the louder note wins a collision. */
export function convertTriplets(values: readonly Velocity[], div: 3 | 6): { cells: Velocity[]; splits: Split[] } {
  const cells = new Array<Velocity>(CELLS_PER_BEAT).fill(0);
  const splits = new Array<Split>(CELLS_PER_BEAT).fill(null);
  values.slice(0, div).forEach((v, i) => {
    if (!(v > 0)) return;
    const slot = Math.round((i * TICKS_PER_BEAT) / div);
    const cell = slot >> 1;
    if (slot & 1) splits[cell] = Math.max(splits[cell] ?? 0, v);
    else cells[cell] = Math.max(cells[cell], v);
  });
  return { cells, splits };
}
