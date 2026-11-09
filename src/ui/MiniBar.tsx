import { memo } from 'react';
import { TICKS_PER_BEAT } from '../model/timing';
import type { TrackDef } from '../model/tracks';
import type { Bar, TrackId } from '../model/types';
import styles from './BarStrip.module.css';

const ROW = 4;
const GAP = 0.6;
/** Horizontal gap: a fifth of a 16th step (2 ticks wide), the same proportion as before 32nds. */
const GAP_X = 0.4;
/** Fewer rows than this are centred instead of stretched into tall blocks. */
const MIN_ROWS = 5;

interface Props {
  bar: Bar;
  /** Rows to draw, top to bottom, in grid order. */
  tracks: readonly TrackDef[];
  /** Tracks that won't play (muted, or not soloed); drawn faded. */
  silent: ReadonlySet<TrackId>;
}

/** A thumbnail of one bar's grid: a coloured mark per note, brighter for louder notes. */
export const MiniBar = memo(function MiniBar({ bar, tracks, silent }: Props) {
  const height = Math.max(MIN_ROWS, tracks.length) * ROW;
  const top = (height - tracks.length * ROW) / 2;
  return (
    <svg className={styles.mini} viewBox={`0 0 ${4 * TICKS_PER_BEAT} ${height}`} preserveAspectRatio="none" aria-hidden>
      {bar.beats.map((_, b) => (
        <rect key={b} className={b % 2 ? styles.miniBeatAlt : styles.miniBeat} data-mini-beat={b} x={b * TICKS_PER_BEAT} width={TICKS_PER_BEAT} height={height} />
      ))}
      {tracks.map((t, row) =>
        bar.beats.flatMap((beat, b) =>
          beat.cells[t.id].flatMap((left, c) => {
            // A whole cell spans two ticks (32nds); each half of a split cell spans one.
            const right = beat.splits[t.id][c];
            const marks: [x: number, w: number, v: number][] =
              right === null ? [[c * 2, 2, left]] : [[c * 2, 1, left], [c * 2 + 1, 1, right]];
            return marks.map(([x, w, v]) =>
              v > 0 ? (
                <rect
                  key={`${t.id}-${b}-${x}`}
                  data-note={t.id}
                  x={b * TICKS_PER_BEAT + x + GAP_X / 2}
                  y={top + row * ROW + GAP / 2}
                  width={w - GAP_X}
                  height={ROW - GAP}
                  fill={t.color}
                  opacity={(0.35 + (0.65 * v) / 127) * (silent.has(t.id) ? 0.4 : 1)}
                />
              ) : null,
            );
          }),
        ),
      )}
    </svg>
  );
});
