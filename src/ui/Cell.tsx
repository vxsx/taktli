import { memo } from 'react';
import type { Beat, Half, TrackId } from '../model/types';
import styles from './Grid.module.css';

interface CellProps {
  track: TrackId;
  beat: number;
  cell: number;
  /** Set only on the halves of a split cell. */
  half?: Half;
  velocity: number;
  color: string;
  showValue: boolean;
}

const HALF_LABEL = [' left half', ' right half'];

export const Cell = memo(function Cell({ track, beat, cell, half, velocity, color, showValue }: CellProps) {
  return (
    <div
      className={styles.cell}
      data-track={track}
      data-beat={beat}
      data-cell={cell}
      data-half={half}
      data-on={velocity > 0 ? '' : undefined}
      aria-label={`${track} beat ${beat + 1} step ${cell + 1}${half === undefined ? '' : HALF_LABEL[half]}${velocity > 0 ? ` volume ${velocity}` : ''}`}
    >
      {velocity > 0 && <div className={styles.fill} style={{ height: `${(velocity / 127) * 100}%`, background: color }} />}
      {showValue && velocity > 0 && <span className={styles.value}>{velocity}</span>}
    </div>
  );
});

interface BeatGroupProps {
  track: TrackId;
  beatIndex: number;
  beat: Beat;
  color: string;
  showValues: boolean;
}

export const BeatGroup = memo(function BeatGroup({ track, beatIndex, beat, color, showValues }: BeatGroupProps) {
  const common = { track, beat: beatIndex, color, showValue: showValues };
  return (
    <div className={`${styles.beat} ${beatIndex % 2 === 1 ? styles.beatAlt : ''}`}>
      {beat.cells[track].map((v, i) => {
        const right = beat.splits[track][i];
        if (right === null) return <Cell key={i} cell={i} velocity={v} {...common} />;
        return (
          <div key={i} className={styles.pair} data-pair="">
            <Cell cell={i} half={0} velocity={v} {...common} />
            <Cell cell={i} half={1} velocity={right} {...common} />
          </div>
        );
      })}
    </div>
  );
});
