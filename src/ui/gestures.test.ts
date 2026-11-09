import { describe, expect, it } from 'vitest';
import { classifyDrag, defaultVelocity, paintValue, slideVelocity, volumeFromY } from './gestures';

describe('gestures', () => {
  it('stays pending until the pointer moves 8px', () => {
    expect(classifyDrag(3, 4)).toBe('pending');
    expect(classifyDrag(0, -8)).toBe('slide');
    expect(classifyDrag(8, 2)).toBe('paint');
    expect(classifyDrag(6, -6)).toBe('paint');
  });

  it('slides from the note velocity, or from 100 on an empty cell', () => {
    expect(slideVelocity(60, 0)).toBe(60);
    expect(slideVelocity(0, 30)).toBe(125);
    expect(slideVelocity(60, -75)).toBe(1);
    expect(slideVelocity(100, 500)).toBe(127);
  });

  it('slides an empty right half up from ghost volume', () => {
    expect(slideVelocity(0, 0, 40)).toBe(40);
    expect(slideVelocity(0, 30, 40)).toBe(65);
  });

  it('starts new notes at 100, or at ghost volume in a right half', () => {
    expect(defaultVelocity(0)).toBe(100);
    expect(defaultVelocity(1)).toBe(40);
  });

  it('maps touch height to volume', () => {
    expect(volumeFromY(0)).toBe(127);
    expect(volumeFromY(1)).toBe(1);
    expect(volumeFromY(0.5)).toBe(64);
    expect(volumeFromY(-2)).toBe(127);
    expect(volumeFromY(3)).toBe(1);
  });

  it('paints notes from an empty cell and erases from a note', () => {
    expect(paintValue(0)).toBe(100);
    expect(paintValue(40)).toBe(0);
  });
});
