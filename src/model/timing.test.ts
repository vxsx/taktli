import { describe, expect, it } from 'vitest';
import { createBeat } from './factory';
import { clampVelocity, convertTriplets, swingOffset, tickOf, velocityAt, velocityToGain } from './timing';

describe('tick math', () => {
  it('places 16ths and their halves on the 8-tick beat grid', () => {
    expect(tickOf(0, 0, 0)).toBe(0);
    expect(tickOf(1, 3, 0)).toBe(14);
    expect(tickOf(2, 3, 1)).toBe(23);
  });

  it('reads a right half only when the cell is split', () => {
    const beat = createBeat();
    beat.cells.snare[1] = 90;
    expect(velocityAt(beat, 'snare', 1, 0)).toBe(90);
    expect(velocityAt(beat, 'snare', 1, 1)).toBe(0);
    beat.splits.snare[1] = 40;
    expect(velocityAt(beat, 'snare', 1, 1)).toBe(40);
  });
});

describe('swing', () => {
  it('delays off-beat 16ths by up to one tick and right halves by half that', () => {
    expect(swingOffset(0, 0, 100)).toBe(0);
    expect(swingOffset(1, 0, 100)).toBe(1);
    expect(swingOffset(3, 0, 50)).toBe(0.5);
    expect(swingOffset(2, 0, 100)).toBe(0);
    expect(swingOffset(0, 1, 100)).toBe(0.5);
    expect(swingOffset(3, 1, 100)).toBe(0.5);
    expect(swingOffset(1, 1, 50)).toBe(0.25);
  });

  it('clamps swing to 0..100', () => {
    expect(swingOffset(1, 0, 250)).toBe(1);
    expect(swingOffset(1, 0, -5)).toBe(0);
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

describe('convertTriplets', () => {
  it('moves 8th triplets to 32nds 0, 3 and 5', () => {
    expect(convertTriplets([90, 80, 70], 3)).toEqual({ cells: [90, 0, 0, 0], splits: [null, 80, 70, null] });
  });

  it('moves 16th triplets to 32nds 0, 1, 3, 4, 5 and 7', () => {
    expect(convertTriplets([1, 2, 3, 4, 5, 6], 6)).toEqual({ cells: [1, 0, 4, 0], splits: [2, 3, 5, 6] });
  });

  it('splits a cell only where a note lands on its right half', () => {
    expect(convertTriplets([90, 0, 0], 3).splits).toEqual([null, null, null, null]);
  });
});
