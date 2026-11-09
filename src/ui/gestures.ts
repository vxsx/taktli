import { clamp, DEFAULT_VELOCITY, GHOST_VELOCITY } from '../model/timing';
import type { Half, Velocity } from '../model/types';

export const DRAG_THRESHOLD = 8;
/** Vertical drag distance that sweeps the full velocity range. */
export const SLIDE_RANGE_PX = 150;
export const LONG_PRESS_MS = 450;

export type DragKind = 'pending' | 'slide' | 'paint';

export function classifyDrag(dx: number, dy: number): DragKind {
  if (Math.hypot(dx, dy) < DRAG_THRESHOLD) return 'pending';
  return Math.abs(dy) > Math.abs(dx) ? 'slide' : 'paint';
}

/** A new note's velocity: a right half is usually a ghost pickup, so it starts quiet. */
export function defaultVelocity(half: Half): Velocity {
  return half === 1 ? GHOST_VELOCITY : DEFAULT_VELOCITY;
}

/** `dyUp` is positive when the finger moved up; an empty cell slides from `base`. */
export function slideVelocity(start: number, dyUp: number, base: number = DEFAULT_VELOCITY): number {
  const from = start > 0 ? start : base;
  return clamp(Math.round(from + (dyUp * 127) / SLIDE_RANGE_PX), 1, 127);
}

/** `yFraction` 0 = top of the cell (loudest), 1 = bottom (softest). */
export function volumeFromY(yFraction: number): number {
  return 1 + Math.round((1 - clamp(yFraction, 0, 1)) * 126);
}

export function paintValue(startVelocity: number): number {
  return startVelocity > 0 ? 0 : DEFAULT_VELOCITY;
}
