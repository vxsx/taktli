import { MAX_BPM, MIN_BPM } from '../model/ops';
import { clamp } from '../model/timing';

export const TAP_RESET_MS = 2000;

/** Keeps the last 4 taps; a pause longer than TAP_RESET_MS starts a new series. */
export function registerTap(taps: readonly number[], now: number): number[] {
  const last = taps[taps.length - 1];
  const kept = last !== undefined && now - last > TAP_RESET_MS ? [] : taps.slice(-3);
  return [...kept, now];
}

export function tempoFromTaps(taps: readonly number[]): number | null {
  if (taps.length < 2) return null;
  const avg = (taps[taps.length - 1] - taps[0]) / (taps.length - 1);
  return clamp(Math.round(60_000 / avg), MIN_BPM, MAX_BPM);
}
