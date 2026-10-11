import { clamp, DEFAULT_VELOCITY } from '../model/timing';

export const DRAG_THRESHOLD = 8;
/** Vertical drag distance that sweeps the full velocity range. */
export const SLIDE_RANGE_PX = 150;
export const LONG_PRESS_MS = 450;

export type DragKind = 'pending' | 'slide' | 'paint';

export function classifyDrag(dx: number, dy: number): DragKind {
  if (Math.hypot(dx, dy) < DRAG_THRESHOLD) return 'pending';
  return Math.abs(dy) > Math.abs(dx) ? 'slide' : 'paint';
}

/** `dyUp` is positive when the finger moved up. */
export function slideVelocity(start: number, dyUp: number): number {
  const base = start > 0 ? start : DEFAULT_VELOCITY;
  return clamp(Math.round(base + (dyUp * 127) / SLIDE_RANGE_PX), 1, 127);
}

/** `yFraction` 0 = top of the cell (loudest), 1 = bottom (softest). */
export function volumeFromY(yFraction: number): number {
  return 1 + Math.round((1 - clamp(yFraction, 0, 1)) * 126);
}

export function paintValue(startVelocity: number): number {
  return startVelocity > 0 ? 0 : DEFAULT_VELOCITY;
}
