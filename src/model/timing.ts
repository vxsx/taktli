import type { Subdivision, Velocity } from './types';

export const TICKS_PER_BEAT = 12;
export const BEATS_PER_BAR = 4;
export const TICKS_PER_BAR = TICKS_PER_BEAT * BEATS_PER_BAR;
export const SUBDIVISIONS: readonly Subdivision[] = [4, 3, 6];
export const DEFAULT_VELOCITY = 100;
export const ACCENT_MIN = 110;
export const GHOST_MAX = 45;
/** Swing 100% delays a 16th off-beat by this many ticks (MPC "75%"). */
export const MAX_SWING_TICKS = 1.5;

export function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

export function ticksPerCell(div: Subdivision): number {
  return TICKS_PER_BEAT / div;
}

export function cellTick(beatIndex: number, div: Subdivision, cell: number): number {
  return beatIndex * TICKS_PER_BEAT + cell * ticksPerCell(div);
}

/** Index of the cell starting exactly at `tickInBeat`, or -1. */
export function cellAtTick(div: Subdivision, tickInBeat: number): number {
  const t = ticksPerCell(div);
  return tickInBeat % t === 0 ? tickInBeat / t : -1;
}

/** Index of the cell whose span contains `tickInBeat` (used for the playhead). */
export function cellContainingTick(div: Subdivision, tickInBeat: number): number {
  return Math.floor(tickInBeat / ticksPerCell(div));
}

/** Swing delay in ticks for a cell. Only 16th off-beats (cells 1 and 3) swing. */
export function swingOffset(div: Subdivision, cell: number, swing: number): number {
  if (div !== 4 || cell % 2 === 0) return 0;
  return (MAX_SWING_TICKS * clamp(swing, 0, 100)) / 100;
}

export function clampVelocity(v: number): Velocity {
  return clamp(Math.round(v), 0, 127);
}

export function velocityToGain(v: Velocity): number {
  return Math.pow(clampVelocity(v) / 127, 1.6);
}

/** Re-grid one track's cells of a beat; each note moves to the nearest new cell, louder wins collisions. */
export function convertCells(values: readonly Velocity[], from: Subdivision, to: Subdivision): Velocity[] {
  if (from === to) return values.slice();
  const out = new Array<Velocity>(to).fill(0);
  const fromStep = ticksPerCell(from);
  const toStep = ticksPerCell(to);
  values.forEach((v, i) => {
    if (v <= 0) return;
    const target = Math.min(to - 1, Math.round((i * fromStep) / toStep));
    out[target] = Math.max(out[target], v);
  });
  return out;
}
