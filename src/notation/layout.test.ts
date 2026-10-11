import { describe, expect, it } from 'vitest';
import { BAR_WIDTH, LINE_HEIGHT, LINE_START, layoutNotation } from './layout';

const right = (b: { x: number; width: number }) => b.x + b.width;

describe('layoutNotation', () => {
  it('keeps the phone size and stretches the bars to the full width', () => {
    const l = layoutNotation(2, 718, 250);
    expect(l.scale).toBe(1);
    expect(l.bars.map((b) => b.line)).toEqual([0, 0]);
    expect(right(l.bars[1])).toBeCloseTo(l.width - 4);
    expect(l.width).toBeCloseTo(718);
    expect(l.height).toBe(LINE_HEIGHT);
  });

  it('grows the staff on a large screen, up to 2.5×', () => {
    const l = layoutNotation(1, 1904, 850);
    expect(l.scale).toBe(2.5);
    expect(l.width * l.scale).toBeCloseTo(1904);
    expect(right(l.bars[0])).toBeCloseTo(l.width - 4);
  });

  it('sizes the staff so about two lines fit the height', () => {
    expect(layoutNotation(2, 1424, 540).scale).toBeCloseTo(1.8);
  });

  it('wraps bars onto more lines instead of shrinking them', () => {
    const l = layoutNotation(8, 718, 250);
    expect(l.scale).toBe(1);
    expect(l.bars.map((b) => b.line)).toEqual([0, 0, 1, 1, 2, 2, 3, 3]);
    expect(l.height).toBe(4 * LINE_HEIGHT);
    expect(l.bars[2]).toMatchObject({ x: 4, lineStart: true });
    expect(l.bars[3].lineStart).toBe(false);
  });

  it('leaves the last line unstretched when it has fewer bars', () => {
    const l = layoutNotation(3, 718, 250);
    expect(l.bars[2].line).toBe(1);
    expect(l.bars[2].width).toBeCloseTo(l.bars[0].width);
  });

  it('never squeezes a bar below its minimum width', () => {
    for (const [w, h] of [[718, 250], [1424, 820], [1904, 850], [500, 900], [300, 200]]) {
      for (const n of [1, 2, 3, 5, 9]) {
        for (const b of layoutNotation(n, w, h).bars) {
          expect(b.width - (b.lineStart ? LINE_START : 0)).toBeGreaterThanOrEqual(BAR_WIDTH - 1e-9);
        }
      }
    }
  });

  it('limits the scale so one bar still fits a narrow screen', () => {
    const l = layoutNotation(4, 500, 900);
    expect(l.scale).toBeCloseTo(500 / (8 + LINE_START + BAR_WIDTH));
    expect(l.bars.map((b) => b.line)).toEqual([0, 1, 2, 3]);
  });
});
