import { describe, expect, it } from 'vitest';
import { registerTap, tempoFromTaps } from './tapTempo';

describe('tap tempo', () => {
  it('needs two taps', () => {
    expect(tempoFromTaps(registerTap([], 0))).toBeNull();
  });

  it('averages the last four taps', () => {
    let taps: number[] = [];
    for (const t of [0, 500, 1000, 1500, 2000]) taps = registerTap(taps, t);
    expect(taps).toEqual([500, 1000, 1500, 2000]);
    expect(tempoFromTaps(taps)).toBe(120);
  });

  it('starts over after a 2 s pause', () => {
    let taps = registerTap(registerTap([], 0), 600);
    taps = registerTap(taps, 3000);
    expect(taps).toEqual([3000]);
  });

  it('clamps to the BPM range', () => {
    expect(tempoFromTaps([0, 100])).toBe(240);
    expect(tempoFromTaps([0, 1900])).toBe(40);
  });
});
