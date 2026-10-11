import { describe, expect, it } from 'vitest';
import {
  cellAtTick, cellContainingTick, cellTick, clampVelocity, convertCells,
  swingOffset, velocityToGain,
} from './timing';

describe('tick math', () => {
  it('places cells on the 12-tick beat grid', () => {
    expect(cellTick(0, 4, 0)).toBe(0);
    expect(cellTick(1, 4, 3)).toBe(21);
    expect(cellTick(3, 3, 2)).toBe(44);
    expect(cellTick(2, 6, 5)).toBe(34);
  });

  it('finds the cell exactly at a tick, or -1', () => {
    expect(cellAtTick(4, 6)).toBe(2);
    expect(cellAtTick(4, 4)).toBe(-1);
    expect(cellAtTick(3, 4)).toBe(1);
    expect(cellAtTick(6, 10)).toBe(5);
  });

  it('finds the cell containing a tick', () => {
    expect(cellContainingTick(4, 5)).toBe(1);
    expect(cellContainingTick(3, 11)).toBe(2);
  });
});

describe('swing', () => {
  it('delays only 16th off-beats', () => {
    expect(swingOffset(4, 0, 100)).toBe(0);
    expect(swingOffset(4, 1, 100)).toBe(1.5);
    expect(swingOffset(4, 3, 50)).toBe(0.75);
    expect(swingOffset(3, 1, 100)).toBe(0);
    expect(swingOffset(6, 1, 100)).toBe(0);
  });

  it('clamps swing to 0..100', () => {
    expect(swingOffset(4, 1, 250)).toBe(1.5);
    expect(swingOffset(4, 1, -5)).toBe(0);
  });
});

describe('velocity', () => {
  it('clamps and rounds', () => {
    expect(clampVelocity(-3)).toBe(0);
    expect(clampVelocity(130)).toBe(127);
    expect(clampVelocity(99.6)).toBe(100);
  });

  it('maps to gain with a 1.6 curve', () => {
    expect(velocityToGain(0)).toBe(0);
    expect(velocityToGain(127)).toBe(1);
    expect(velocityToGain(64)).toBeCloseTo(Math.pow(64 / 127, 1.6), 6);
  });
});

describe('convertCells', () => {
  it('returns a copy when the subdivision is unchanged', () => {
    const src = [1, 0, 3, 0];
    const out = convertCells(src, 4, 4);
    expect(out).toEqual(src);
    expect(out).not.toBe(src);
  });

  it('maps 16ths to 8th triplets by nearest tick', () => {
    // ticks 0,3,6,9 → triplet ticks 0,4,8: 0→0, 3→1 (4), 6→2 (8 is nearer than 4? 6/4=1.5 → rounds to 2), 9→2
    expect(convertCells([100, 0, 0, 0], 4, 3)).toEqual([100, 0, 0]);
    expect(convertCells([0, 90, 0, 0], 4, 3)).toEqual([0, 90, 0]);
    expect(convertCells([0, 0, 0, 80], 4, 3)).toEqual([0, 0, 80]);
  });

  it('keeps the louder note when two collide', () => {
    expect(convertCells([0, 0, 50, 120], 4, 3)).toEqual([0, 0, 120]);
  });

  it('never maps past the last cell', () => {
    expect(convertCells([0, 0, 0, 0, 0, 70], 6, 3)).toEqual([0, 0, 70]);
  });

  it('round-trips 8th triplets through 16th triplets exactly', () => {
    expect(convertCells(convertCells([10, 20, 30], 3, 6), 6, 3)).toEqual([10, 20, 30]);
  });
});
