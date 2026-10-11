/** Minimum width of one bar, in unscaled staff units; bars stretch beyond it to fill a line. */
export const BAR_WIDTH = 280;
/** Room for the clef (and, on the first line, the time signature) at the start of each line. */
export const LINE_START = 70;
export const LINE_HEIGHT = 150;
const MARGIN = 4;
const MAX_SCALE = 2.5;

export interface BarBox {
  line: number;
  x: number;
  width: number;
  /** First bar of its line: it carries the clef. */
  lineStart: boolean;
}

export interface NotationLayout {
  /** CSS pixels per staff unit. */
  scale: number;
  /** Size in staff units. */
  width: number;
  height: number;
  bars: BarBox[];
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/**
 * Lays `barCount` bars out like sheet music in a `availWidth`×`availHeight` CSS-pixel area: the staff grows
 * until about two lines fill the height (never below 1×, never past 2.5×), lines fill the width, and bars
 * wrap onto new lines rather than getting narrower than BAR_WIDTH.
 */
export function layoutNotation(barCount: number, availWidth: number, availHeight: number): NotationLayout {
  const minLine = 2 * MARGIN + LINE_START + BAR_WIDTH;
  const scale = clamp(Math.min(availHeight / (2 * LINE_HEIGHT), availWidth / minLine), 1, MAX_SCALE);
  const width = Math.max(availWidth / scale, minLine);
  const room = width - 2 * MARGIN - LINE_START;
  const perLine = clamp(Math.floor(room / BAR_WIDTH), 1, Math.max(1, barCount));
  const barWidth = room / perLine;
  const bars: BarBox[] = [];
  for (let i = 0; i < barCount; i++) {
    const col = i % perLine;
    bars.push({
      line: Math.floor(i / perLine),
      x: col === 0 ? MARGIN : MARGIN + LINE_START + col * barWidth,
      width: barWidth + (col === 0 ? LINE_START : 0),
      lineStart: col === 0,
    });
  }
  return { scale, width, height: Math.max(1, Math.ceil(barCount / perLine)) * LINE_HEIGHT, bars };
}
